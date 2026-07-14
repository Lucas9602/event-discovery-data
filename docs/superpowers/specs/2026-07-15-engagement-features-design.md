# Engagement-Features (6 Ideen aus der Brainstorm-Liste) — Design

> Alle Entscheidungen in diesem Dokument wurden autonom getroffen (Nutzer explizit: "mach einfach was du am besten hältst", keine Rückfragen möglich). Sinnvolle Defaults, dokumentiert statt nachgefragt — Muster aus dem Projekt-Memory für autonome Sessions.

## Ziel

Sechs Feature-Ideen aus `docs/superpowers/specs/2026-07-14-feature-ideas.md` (Quick-Wins + eine mittelfristige) real umsetzen:

1. Leerer-Radius-Hinweis im Feed verbessern
2. Kalender-Export pro Event
3. Event teilen (Share-Sheet)
4. Wetter-Badge auf der Event-Karte
5. Favoriten/Merkliste
6. Push-Erinnerung für Favoriten

Reihenfolge ist nach Abhängigkeit sortiert: 1-4 sind unabhängig voneinander, 5 (Favoriten) ist die Grundlage für 6 (Erinnerung braucht eine Favoritenliste zum Dranhängen).

## Gemeinsame Prinzipien

- Gleiche Architektur-Muster wie bisher: pure/testbare Logik in `app/src/lib/`, React-Context+Hook-Module in `app/src/demo/` nach dem Vorbild von `theme.tsx`/`location.tsx`, AsyncStorage-Persistenz mit dem etablierten Jest-Mock.
- Neue Expo-Pakete werden per `npx expo install <paket>` hinzugefügt (löst automatisch SDK-57-kompatible Versionen auf, statt eine Version zu raten).
- Wo eine native Fähigkeit auf Web nicht existiert (Datei-Sharing, Push-Notifications), gibt es einen stillen, nicht-blockierenden Fallback — kein Fehler, Feature einfach nicht verfügbar auf Web. Gleiches Muster wie das bestehende GPS-Reverse-Geocoding-Fallback.
- `EventPostCard.tsx` bekommt in Summe 3 neue kleine Icon-Buttons in der bestehenden `actions`-Zeile (Favorit/Kalender/Teilen) links vom Spacer, plus ein optionales Wetter-Badge im Medienbereich. Der bestehende Herz-Button (`liked`, rein dekoratives Mock-Like fürs Freunde-Feature) bleibt unverändert und unabhängig davon — echtes "Favorisieren" ist ein separates, neues Icon.

## 1. Leerer-Radius-Hinweis

**Problem:** `FeedScreen` rendert bei 0 gefilterten Events aktuell nichts (`FlatList` ohne `ListEmptyComponent`).

**Lösung:** Zwei Fälle unterscheiden:
- Gar keine Events geladen (`events.length === 0`, z. B. offline ohne Cache): Hinweistext „Keine Events verfügbar — später nochmal versuchen." Kein Button (nichts zum Vergrößern).
- Events vorhanden, aber Radius-Filter liefert 0 (`events.length > 0 && visibleEvents.length === 0`): Hinweistext „Keine Feste im Umkreis von {radius} km gefunden." + Button „Umkreis vergrößern (+15 km)", der `setRadiusMeters(min(radiusMeters + 15000, 100000))` aufruft (100 km ist die bestehende Slider-Obergrenze aus `LocationOnboarding`).

Reiner UI-Zustand in `FeedScreen.tsx`, keine neue Datei.

## 2. Kalender-Export

**Ansatz:** Statt direktem Kalender-Schreibzugriff (bräuchte `expo-calendar` + Kalenderberechtigung) wird eine `.ics`-Datei erzeugt und über den nativen Share/Open-Dialog angeboten — der Nutzer wählt dort seine Kalender-App. Kein Berechtigungsdialog nötig, funktioniert generisch für jede Kalender-App.

- `app/src/lib/ics.ts` (neu, pur, testbar): `buildIcsContent(event: EventRecord): string`. Erzeugt einen minimalen gültigen iCalendar-String:
  ```
  BEGIN:VCALENDAR
  VERSION:2.0
  PRODID:-//event-discovery-app//DE
  BEGIN:VEVENT
  UID:<event.id>@event-discovery-app
  DTSTAMP:<jetzt, UTC basic format>
  DTSTART:<event.start, UTC basic format>
  DTEND:<event.end falls vorhanden, sonst start+2h>
  SUMMARY:<event.title, escaped>
  LOCATION:<event.location.name ?? event.location.address ?? "", escaped>
  DESCRIPTION:<event.description ?? "", escaped>
  URL:<event.sourceUrl>
  END:VEVENT
  END:VCALENDAR
  ```
  UTC-Basic-Format: `YYYYMMDDTHHMMSSZ`. Escaping nach iCal-Spec: `,` → `\,`, `;` → `\;`, Zeilenumbruch → `\n`, `\` → `\\`.
- `app/src/demo/calendarExport.ts` (neu, Plattform-Glue, kein automatisierter Test — wie bei anderen native-Modul-Aufrufen in diesem Projekt): `exportToCalendar(event: EventRecord): Promise<void>`.
  - Native (`Platform.OS !== "web"`): Inhalt via `expo-file-system` nach `FileSystem.cacheDirectory + event-<id>.ics` schreiben, dann `expo-sharing`s `Sharing.shareAsync(uri, { mimeType: "text/calendar", dialogTitle: "Zum Kalender hinzufügen" })`.
  - Web: `Blob` mit `type: "text/calendar"`, Object-URL, unsichtbarer `<a download>`-Klick (Standard-Browser-Download, kein Sharing-API nötig, funktioniert mit react-native-web).
  - Neue Abhängigkeiten: `expo-file-system`, `expo-sharing`.
- `EventPostCard.tsx`: neuer Icon-Button „📅" in der Actions-Zeile, ruft `exportToCalendar(event)` auf.

## 3. Event teilen

- `app/src/lib/share.ts` (neu, pur, testbar): `buildShareMessage(event: EventRecord): string`. Format: `"<title> — <formatiertes Datum> in <location.name ?? "?">\n<sourceUrl>"`. Datumsformat: `new Date(event.start).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })` + `", " + toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })`.
- `app/src/demo/shareEvent.ts` (neu, Plattform-Glue, kein automatisierter Test): `shareEvent(event: EventRecord): Promise<void>`.
  - Native: RN-Core-`Share.share({ message: buildShareMessage(event) })` (keine neue Abhängigkeit, Teil von `react-native`).
  - Web: `navigator.share` falls verfügbar (moderne Browser, inkl. mobile Chrome/Safari — deckt WhatsApp-Teilen auf dem Handy-Browser ab), sonst stiller Fallback auf `navigator.clipboard.writeText(...)` (kein Fehler, keine Sichtbare Bestätigung nötig fürs Prototyp-Stadium).
- `EventPostCard.tsx`: neuer Icon-Button „📤" in der Actions-Zeile, ruft `shareEvent(event)` auf.

## 4. Wetter-Badge

- `app/src/lib/weather.ts` (neu, pur, testbar): Open-Meteo (kostenlos, kein Key).
  ```ts
  export interface WeatherInfo { code: number; maxTempC: number; icon: string }
  export async function getWeather(lat: number, lon: number, dateIso: string, fetchText): Promise<WeatherInfo | null>
  ```
  - URL: `https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&daily=weathercode,temperature_2m_max&timezone=auto&start_date=<YYYY-MM-DD>&end_date=<YYYY-MM-DD>` (Datum aus `dateIso` extrahiert).
  - Horizont-Check: Events, deren Datum mehr als 14 Tage in der Zukunft liegt, werden gar nicht angefragt (Open-Meteo liefert für so weit entfernte Termine ohnehin keine sinnvollen Daten) → Funktion gibt `null` zurück, ohne zu fetchen.
  - Response leer/kein Tages-Eintrag → `null`.
  - `code` → `icon` Mapping (WMO-Wettercodes, reduziert auf die gängigsten): 0 → "☀️", 1-3 → "⛅", 45/48 → "🌫️", 51-67 → "🌧️", 71-77 → "🌨️", 80-82 → "🌦️", 95-99 → "⛈️", alles andere → "🌡️" (Fallback, kein Sonderfall nötig).
- `EventPostCard.tsx`: `useEffect`, das bei vorhandenem `event.location.lat`/`lon` und Termin innerhalb 14 Tagen `getWeather(...)` aufruft und bei Erfolg ein kleines Badge „{icon} {maxTempC}°" oben rechts im Medienbereich zeigt (Pendant zum bestehenden Kategorie-Tag oben links). Kein Ladezustand nötig — Badge erscheint einfach, sobald die Antwort da ist, bleibt sonst unsichtbar.

## 5. Favoriten/Merkliste

- `app/src/demo/favorites.tsx` (neu, Context+Hook, exakt nach dem Muster von `location.tsx`): `FavoritesProvider`, `useFavorites(): { isFavorite(id: string): boolean; toggleFavorite(event: EventRecord): void }`.
  - `toggleFavorite` nimmt bewusst das volle `EventRecord` statt nur die ID: Punkt 6 (Push-Erinnerung) hängt direkt an Favoriten und braucht beim Favorisieren den vollen Event für Titel/Startzeit, um `scheduleReminder(event)` aufzurufen. Da beide Punkte im selben Durchlauf gebaut werden, wird die Signatur gleich final gewählt statt später umgebaut zu werden müssen.
  - AsyncStorage-Key: `demo.favorites`, gespeichert als `Record<string, string | null>` (Event-ID → Notification-ID oder `null` falls keine Erinnerung geplant wurde/werden konnte, z. B. auf Web). `isFavorite(id)` prüft nur, ob der Key existiert — der Notification-Ekstra-Zustand ist reines Implementierungsdetail für Punkt 6.
  - Gleiches Hydration-Muster wie `location.tsx` (Laden on mount, Persistieren erst nach Hydration, um Clobbering zu vermeiden).
- `DemoApp.tsx`: `FavoritesProvider` zusätzlich um `DemoAppContent` gewrappt (gleiche Ebene wie `LocationProvider`).
- `EventPostCard.tsx`: neuer Icon-Button „🔖" (Farbe `colors.accent` wenn favorisiert, `colors.textMuted` sonst — analog zum Herz-Aktiv-Zustand), ruft `toggleFavorite(event.id)` auf.
- `ProfileScreen.tsx`: neue Sektion „Meine Favoriten" unterhalb der bestehenden Settings-Liste. Lädt Events genauso wie `FeedScreen` (`getEvents` mit derselben `EVENTS_URL`-Konstante — bewusste kleine Duplikation, drei Zeilen, keine gemeinsame Abstraktion nötig fürs Prototyp-Stadium), filtert auf `isFavorite(event.id)`, rendert die Treffer mit `EventPostCard`. Leer-Zustand: „Noch keine Favoriten — tippe 🔖 auf einem Fest."

## 6. Push-Erinnerung

**Ansatz:** Lokale, geräteseitig geplante Benachrichtigungen (`expo-notifications`) — kein Push-Server nötig, da es keine Backend-Infrastruktur für echtes Push gibt. `scheduleNotificationAsync` mit einem Datums-Trigger reicht vollständig aus.

- `app/src/demo/reminders.ts` (neu, Plattform-Glue, kein automatisierter Test — wie bei anderen native-Modul-Aufrufen): 
  ```ts
  export async function scheduleReminder(event: EventRecord): Promise<string | null> // gibt Notification-ID zurück, null wenn nicht geplant (Web, Startzeit < 2h in der Zukunft, oder Berechtigung verweigert)
  export async function cancelReminder(notificationId: string): Promise<void>
  ```
  - `Platform.OS === "web"` → sofort `null` (keine Web-Notification-Unterstützung in Expo, stiller No-Op).
  - Berechtigung wird lazy beim ersten Favorisieren angefragt (`Notifications.requestPermissionsAsync()`), nicht beim App-Start.
  - Trigger-Zeitpunkt: `event.start` minus 2 Stunden. Liegt dieser Zeitpunkt bereits in der Vergangenheit (Event startet in < 2h oder hat schon begonnen), wird nichts geplant (`null`) — kein Sinn, eine Erinnerung in der Vergangenheit zu triggern.
  - Notification-Inhalt: Titel „Bald geht's los!", Body `"<event.title> startet in 2 Stunden."`.
  - Neue Abhängigkeit: `expo-notifications`.
- `favorites.tsx` (siehe Punkt 5, dort bereits mit der finalen Signatur/Storage-Form gebaut) ruft beim Favorisieren `scheduleReminder(event)` auf und hinterlegt die zurückgegebene Notification-ID im Storage-Record; beim Entfernen aus Favoriten wird `cancelReminder(notificationId)` aufgerufen, falls eine ID hinterlegt war.

## Testing-Übersicht

| Datei | Test |
|---|---|
| `app/src/lib/ics.ts` | ja, pur — `app/__tests__/ics.test.ts` |
| `app/src/lib/share.ts` | ja, pur — `app/__tests__/share.test.ts` |
| `app/src/lib/weather.ts` | ja, pur — `app/__tests__/weather.test.ts` |
| `app/src/demo/favorites.tsx` | ja, State/Persistenz wie `location.test.tsx` — `app/__tests__/favorites.test.tsx` |
| `app/src/demo/calendarExport.ts`, `shareEvent.ts`, `reminders.ts` | nein — reine Plattform-Glue um native/Browser-APIs, manuelle Verifikation (etabliertes Muster in diesem Projekt) |
| `EventPostCard.tsx`, `FeedScreen.tsx`, `ProfileScreen.tsx`, `DemoApp.tsx` Änderungen | nein — visuelle Komponenten, manuelle Verifikation (etabliertes Muster) |

## Scope

Betroffene/neue Dateien: `app/src/lib/ics.ts`, `app/src/lib/share.ts`, `app/src/lib/weather.ts`, `app/src/demo/calendarExport.ts`, `app/src/demo/shareEvent.ts`, `app/src/demo/favorites.tsx`, `app/src/demo/reminders.ts`, zugehörige Tests, sowie Änderungen an `app/src/demo/EventPostCard.tsx`, `app/src/demo/FeedScreen.tsx`, `app/src/demo/ProfileScreen.tsx`, `app/src/demo/DemoApp.tsx`, `app/package.json` (drei neue Expo-Pakete). Nicht angefasst: Karte, restliches Profil, `EventListScreen.tsx` (weiterhin totes Legacy-Screen).
