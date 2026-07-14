# Bug-Report — Lokalfeste App (QA-Pass 2026-07-15)

Alle Funde unten wurden entweder durch reale Testausführung (Jest, gezielte Probe-Skripte) verifiziert oder durch Code-Nachvollzug bestätigt — jeweils markiert. Nichts wurde gefixt, nur dokumentiert.

---

## CRITICAL

### C1 — App-weiter Crash bei nicht-Array-Antwort von `events.json`

**Schweregrad:** Critical — totaler App-Absturz, kein ErrorBoundary vorhanden, betrifft Feed **und** Profil.

**Repro (real ausgeführt, siehe unten):**
1. `events.json` antwortet mit gültigem JSON, das aber kein Array ist (z. B. `{}`, `null`, ein einzelnes Objekt statt einer Liste) — z. B. weil die Pipeline versehentlich ein leeres Objekt statt `[]` deployt, oder ein Server-Fehlerformat als JSON-Body kommt.
2. `getEvents()` gibt dieses Nicht-Array unverändert zurück (kein `Array.isArray`-Check).
3. `FeedScreen`/`ProfileScreen` setzen es 1:1 in den `events`-State.
4. `filterEvents(events, …)` ruft `events.filter(...)` auf → `TypeError: events.filter is not a function`.
5. Da nirgendwo im Baum eine `ErrorBoundary` existiert (`grep` bestätigt: keine einzige Stelle im Repo), reißt der Fehler die komplette React-Baum-Rendering ab — weißer/roter Screen, App unbedienbar, bis Neustart mit (hoffentlich) besserer Antwort.

**Verifiziert durch:** Probe-Test gegen `getEvents()` mit `fetchText` → `"{}"`. Ergebnis: `Array.isArray(result) === false`, `typeof result === "object"`. Ein nachgeschalteter `.filter()`-Aufruf crasht nachweislich mit diesem Rückgabewert.

**Erwartet:** App bleibt bedienbar, zeigt bestenfalls "Events konnten nicht geladen werden" statt abzustürzen.

**Tatsächlich:** Voller Absturz.

**Datei/Zeile:** `app/src/lib/getEvents.ts:10-24` (keine Validierung), `app/src/lib/filterEvents.ts:16` (`events.filter` ungeschützt), `app/src/demo/FeedScreen.tsx:36`, `app/src/demo/ProfileScreen.tsx:48` (beide ohne Absicherung).

**Fix-Vorschlag:** In `getEvents.ts` nach jedem `JSON.parse` mit `Array.isArray(parsed) ? parsed : []` validieren (sowohl im Erfolgs- als auch im Cache-Fallback-Pfad). Zusätzlich eine `ErrorBoundary`-Komponente um `DemoApp` legen als zweite Verteidigungslinie gegen zukünftige, ähnliche Fehler.

---

## HIGH

### H1 — Fehlerhafte/nicht-JSON-Antwort von `events.json` vergiftet den Offline-Cache dauerhaft + unhandled Promise Rejection

**Schweregrad:** High — kein Absturz, aber der Offline-Fallback wird unbrauchbar bis zur nächsten erfolgreichen Antwort, und es entstehen unbehandelte Promise-Rejections.

**Repro (real ausgeführt, siehe unten):**
1. `events.json` antwortet mit **irgendeinem** erfolgreichen HTTP-Response (auch 404/500 zählt für `fetch()` als "erfolgreich" — es wird nirgendwo `res.ok` geprüft!), dessen Body kein valides JSON ist — typischerweise eine HTML-404-Seite von GitHub Pages, wenn die Datei (noch) nicht existiert oder ein Deploy gerade läuft.
2. `getEvents()` schreibt den Response-Text **unconditionally** in den AsyncStorage-Cache, **bevor** er versucht, ihn zu parsen (`await storage.setItem(CACHE_KEY, text)` steht vor `JSON.parse(text)`).
3. `JSON.parse(text)` wirft (`SyntaxError: Unexpected token '<'`), landet im `catch`-Block.
4. Der Fallback liest denselben, gerade eben mit Müll überschriebenen Cache: `JSON.parse(cached)` wirft **erneut** — diesmal ungefangen, da kein weiteres try/catch existiert.
5. `getEvents()` gibt ein **rejected Promise** zurück. Sowohl `FeedScreen.tsx:36` als auch `ProfileScreen.tsx:48` rufen `.then(setEvents)` **ohne `.catch`** auf → unhandled promise rejection.
6. Der Cache bleibt bis zur nächsten *erfolgreichen* Antwort dauerhaft mit der HTML-Müll-Seite belegt — jeder Offline-Start in der Zwischenzeit liefert eine leere Liste, obwohl vorher ein valider Cache mit echten Events existierte.

**Verifiziert durch:** Probe-Test mit `fetchText` → `"<html>404 not found</html>"`. Ergebnis: Aufruf wirft `Unexpected token '<', "<html>404 "... is not valid JSON`; der simulierte Cache-Speicher enthält danach exakt diesen HTML-String.

**Erwartet:** Ungültige Antworten werden verworfen, ohne den bestehenden guten Cache zu überschreiben; Aufrufer bekommen kein rejected Promise für einen erwartbaren Netzwerk-Fehlerfall.

**Tatsächlich:** Cache wird vor Validierung geschrieben; zweiter Parse-Fehler ist ungefangen.

**Datei/Zeile:** `app/src/lib/getEvents.ts:15-23`.

**Fix-Vorschlag:** Erst parsen (und validieren, siehe C1), **dann** cachen — nur bei erfolgreichem `JSON.parse` + Array-Check den Cache überschreiben. Fallback-`JSON.parse(cached)` ebenfalls in eigenes try/catch, das bei Fehler `[]` zurückgibt statt zu werfen.

### H2 — Keine Berechtigungstexte für Standortzugriff in `app.json` konfiguriert

**Schweregrad:** High (für native Builds) — noch nicht mit echtem Build verifizierbar in dieser Umgebung, daher als Verdachtsfall mit hoher Priorität zur Prüfung markiert, nicht als 100% bestätigt.

**Repro/Befund:** `app/app.json` enthält unter `plugins` nur `"expo-sharing"`. Es gibt **keinen** `expo-location`-Plugin-Eintrag, keine `ios.infoPlist.NSLocationWhenInUseUsageDescription`, kein `android.permissions`-Override. `expo-notifications` und `expo-file-system` fehlen ebenfalls in `plugins`.

**Erwartet:** Für einen produktiven iOS-Build braucht `expo-location` einen expliziten Berechtigungstext (sonst generischer/englischer Default-Text oder Build-Ablehnung, je nach SDK-Verhalten) — inkonsistent mit der sonst komplett deutschen App.

**Tatsächlich:** Nicht konfiguriert. Nicht in dieser Umgebung mit echtem `expo prebuild`/EAS-Build verifizierbar (kein Zugriff auf Build-Tooling hier).

**Datei/Zeile:** `app/app.json:26-28`.

**Fix-Vorschlag:** Vor dem ersten nativen Build/TestFlight-Upload: `expo-location`, `expo-notifications`, `expo-file-system` explizit mit deutschen Berechtigungstexten in `plugins` eintragen (z. B. `["expo-location", { "locationWhenInUsePermission": "Lokalfeste braucht deinen Standort, um Feste in deiner Nähe zu finden." }]`), dann `npx expo prebuild --clean` zur Verifikation laufen lassen.

---

## MEDIUM

### M1 — Kein Ladezustand beim GPS-Standortabruf

**Schweregrad:** Medium.

**Repro:** In `LocationOnboarding.tsx` hat der manuelle Pfad (`confirmManual`) einen `loading`-State mit `ActivityIndicator` und deaktiviertem Button. Der GPS-Pfad (`useDeviceLocation`) hat **keinen** solchen Zustand — der "Standort verwenden"-Button bleibt während des gesamten `requestForegroundPermissionsAsync` → `getCurrentPositionAsync` → `geocodeReverse`-Ablaufs (kann mehrere Sekunden dauern, besonders bei schwachem GPS-Signal) uneingeschränkt tippbar.

**Erwartet:** Visuelles Feedback ("Suche Standort…"), Button gesperrt, analog zum manuellen Pfad.

**Tatsächlich:** Kein Feedback. Nutzer tippt bei gefühlter Reaktionslosigkeit erneut → mehrere parallele Berechtigungs-/GPS-/Reverse-Geocoding-Ketten gleichzeitig (siehe auch M-Reihe unten, "letzter gewinnt").

**Datei/Zeile:** `app/src/demo/LocationOnboarding.tsx:51-68` (kein `loading`-Flag, kein `disabled` auf dem GPS-Button).

**Fix-Vorschlag:** Gleiches `loading`-Pattern wie bei `confirmManual` auf `useDeviceLocation` anwenden, GPS-Button während des Laufs deaktivieren.

### M2 — Irreführender "Keine Events verfügbar"-Text blitzt bei jedem normalen App-Start auf

**Schweregrad:** Medium.

**Repro:** `FeedScreen` startet mit `events = []`. Der `ListEmptyComponent` unterscheidet nur zwischen "keine Events geladen" und "Events geladen, aber außerhalb Radius" — es gibt **keinen dritten Zustand** für "lädt gerade noch". Auf jedem normalen App-Start (auch mit gutem Netz) ist für die Dauer des ersten Fetches (typischerweise <1s, bei langsamem Netz deutlich länger) der Zustand identisch zu "wirklich keine Events verfügbar" — der Nutzer sieht kurz (oder bei Throttling: länger) den Fehlertext, bevor die echten Events erscheinen.

**Erwartet:** Klar unterscheidbarer Ladezustand (Spinner o.ä.) statt einer Fehlermeldung, die suggeriert, dass etwas schiefgelaufen ist.

**Tatsächlich:** Fehlertext erscheint routinemäßig bei jedem Start.

**Datei/Zeile:** `app/src/demo/FeedScreen.tsx:29-31` (kein `loading`-State), `:44-58` (`ListEmptyComponent`-Logik unterscheidet nicht "lädt" von "leer").

**Fix-Vorschlag:** Dritten State `loading: boolean` einführen (`true` bis der erste `getEvents`-Aufruf zurückkommt), währenddessen neutralen Ladezustand statt Fehlertext zeigen.

### M3 — Unhandled Promise Rejection beim Wetter-Fetch

**Schweregrad:** Medium (bereits im Code-Review bekannt, hier gegenstestet und bestätigt).

**Repro:** `getWeather(...).then(setWeather)` in `EventPostCard.tsx` hat kein `.catch`. Jeder Netzwerkfehler bei Open-Meteo (Timeout, DNS-Fehler, Rate-Limit) erzeugt eine unhandled rejection pro betroffener Karte im sichtbaren Viewport.

**Erwartet:** Fehler wird geschluckt/geloggt, Badge bleibt einfach unsichtbar.

**Tatsächlich:** Unhandled rejection (in RN/Browser meist nur eine Konsolenwarnung, kein Crash — aber bei vielen gleichzeitig sichtbaren Karten mit Netzwerkproblemen entsprechend viele Warnungen).

**Datei/Zeile:** `app/src/demo/EventPostCard.tsx:83`.

**Fix-Vorschlag:** `.catch(() => {})` anhängen.

---

## LOW

### L1 — Verwaister Favoriten-Eintrag, wenn das Event aus `events.json` verschwindet

**Schweregrad:** Low.

**Repro:** Ein Event wird favorisiert (`demo.favorites` bekommt einen Eintrag), dann entfernt die Datenquelle das Event aus `events.json` (z. B. weil das Fest vorbei ist und aus dem Scraper-Output fällt). `favoriteEvents = events.filter(isFavorite)` in `ProfileScreen.tsx` blendet es korrekt aus der Anzeige aus — der zugrunde liegende `demo.favorites`-Eintrag (und eine ggf. bereits geplante `expo-notifications`-Erinnerung) bleibt aber für immer bestehen, es gibt keinen Aufräum-Mechanismus.

**Erwartet:** Irrelevant für die Sichtbarkeit im UI (bereits so), aber langfristig sammeln sich tote Einträge/Erinnerungen an.

**Datei/Zeile:** `app/src/demo/favorites.tsx` (kein Abgleich gegen die aktuelle Event-Liste), `app/src/demo/ProfileScreen.tsx:55`.

**Fix-Vorschlag:** Beim Laden der Events in `ProfileScreen` (oder zentraler) verwaiste Favoriten-IDs erkennen und samt evtl. verknüpfter Reminder-ID bereinigen.

### L2 — Stale Fehlertext bleibt bei leerem Resubmit stehen

**Schweregrad:** Low (bereits im Code-Review bekannt, hier bestätigt).

**Repro:** Manuelle Standortsuche schlägt fehl → Fehlertext sichtbar. Nutzer leert das Feld, tippt erneut auf "Bestätigen". `confirmManual` gibt wegen `if (!query.trim()) return;` sofort zurück, **bevor** `setError(null)` erreicht wird — der alte Fehlertext bleibt stehen, obwohl gerade nichts versucht wurde.

**Datei/Zeile:** `app/src/demo/LocationOnboarding.tsx:70-71`.

**Fix-Vorschlag:** `setError(null)` vor die `trim()`-Prüfung ziehen.

### L3 — Test-Hygiene: `act()`-Warnungen in `favorites.test.tsx`

**Schweregrad:** Low — betrifft nur Testausgabe, keine Nutzer.

**Repro (real ausgeführt):** `npx jest favorites.test` produziert bei den Tests `"toggling on marks it favorited…"` und `"toggling off removes it…"` je eine `console.error`-Warnung `"The current testing environment is not configured to support act(...)"`, weil der asynchrone `setFavorites`-Aufruf im `scheduleReminder`-Backfill (`favorites.tsx:52`) außerhalb eines `act()`/`waitFor()`-Fensters feuert. Alle Tests bestehen trotzdem (grün), die Ausgabe ist aber nicht "pristine" — dieser Standard wurde im ursprünglichen Task-Review (und im nachfolgenden Fix-Review) nicht geprüft, da dort nur auf Pass/Fail-Zahlen geachtet wurde, nicht auf Konsolen-Output.

**Datei/Zeile:** `app/__tests__/favorites.test.tsx` (betroffene Tests), Ursache in `app/src/demo/favorites.tsx:50-58`.

**Fix-Vorschlag:** In den betroffenen Tests den Backfill-Zeitpunkt explizit mit `await waitFor(...)` abwarten, bevor der Test endet (analog zum bereits vorhandenen Orphan-Test), statt sich auf implizites Timing zu verlassen.

### L4 — Kein Pull-to-Refresh im Feed

**Schweregrad:** Low — Erwartungslücke, kein Defekt.

**Repro:** `FeedScreen`s `FlatList` hat kein `refreshControl`. Events werden nur einmal beim Mount geladen; um neue Daten zu sehen, muss die App neu gestartet werden (Web: Reload).

**Datei/Zeile:** `app/src/demo/FeedScreen.tsx:43-58`.

**Fix-Vorschlag:** `RefreshControl` mit `onRefresh` → erneuter `getEvents`-Aufruf.

### L5 — Radius-Slider persistiert bei jedem Drag-Tick (bereits aus Review bekannt)

**Schweregrad:** Low.

**Repro:** `onValueChange={setRadiusMeters}` im Radius-Slider (`LocationOnboarding.tsx`) löst bei jedem Zwischenwert während des Ziehens einen `AsyncStorage.setItem`-Aufruf aus (kein Debounce, keine `onSlidingComplete`-Nutzung).

**Datei/Zeile:** `app/src/demo/LocationOnboarding.tsx:109`.

**Fix-Vorschlag:** `onSlidingComplete` statt/zusätzlich zu `onValueChange` für die Persistenz verwenden.

---

## INFO / Beobachtungen ohne Handlungsdruck

- **Doppelter Netzwerk-Request:** `FeedScreen` und `ProfileScreen` rufen `getEvents` unabhängig voneinander auf (je eigener `useEffect`) — wenn beide Tabs besucht werden, wird `events.json` zweimal geholt. Kein In-Memory-Cache zwischen den Screens, nur der AsyncStorage-Level-Cache wird geteilt. Für die aktuelle App-Größe unkritisch.
- **Kein Consent-Hinweis:** Standortdaten (Ort/PLZ-Text bzw. GPS-Koordinaten) gehen an Nominatim (OpenStreetMap), Event-Koordinaten gehen an Open-Meteo — beides Drittanbieter, ohne Datenschutzhinweis/Consent-Screen im Code. Kein `console.log` mit Standortdaten gefunden (kein Logging-Leck).
- **Kein sichtbares Feedback beim Web-Teilen-Fallback:** Wenn `navigator.share` nicht verfügbar ist, landet der Text in der Zwischenablage — ohne Toast/Bestätigung ("kopiert!"). Nutzer weiß nicht, ob der Tap etwas bewirkt hat.
- **Spam-Tap auf Favoriten-Icon:** Funktional korrekt (funktionale `setFavorites`-Updater-Form verarbeitet schnelle Taps sequenziell korrekt) — kein Bug gefunden, hier explizit gegengeprüft.
- **`editingLocation`-State in `ProfileScreen` verliert sich beim Tab-Wechsel:** Erwartetes React-Verhalten (Screen unmounted beim Tab-Wechsel), kein Datenverlust (Radius wird pro Slider-Tick sofort persistiert), nur ggf. überraschend für den Nutzer, dass der Editor sich beim Zurückkommen geschlossen hat.
- **Extremkoordinaten (0/0, Pole, Datumsgrenze):** Haversine-Formel in `geo.ts` mathematisch stabil für alle Fälle, keine Sonderbehandlung nötig, keine Bugs gefunden.

---

## Testabdeckung — was NICHT geprüft werden konnte

Alle Punkte aus dem Testplan-Abschnitt 2.1 rund um echte OS-Permission-Dialoge (nie gefragt/erlaubt/abgelehnt/"nur einmal"/live entzogen), echtes Mock-Location-Verhalten, App-Backgrounding/Kill&Restart, Gerätespeicher/Battery und reale Push-Zustellung — mangels Emulator/Simulator/Gerät in dieser Umgebung nicht ausführbar, nur über Code-Pfad-Analyse abgedeckt (siehe TESTPLAN.md, Spalte "Ausführbar hier?").
