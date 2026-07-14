# Testplan — Lokalfeste App (QA-Pass 2026-07-15)

## Testumgebung / Einschränkungen

Kein Emulator/Simulator/Gerät verfügbar. Playwright-Chrome kann in dieser Umgebung nicht installiert werden (Admin-Rechte fehlen, bereits versucht und gescheitert). Getestet wird daher:

- **Statische Codeanalyse** — Flows Zeile für Zeile nachvollzogen (Datentyp, Nullability, Race-Bedingungen, Effekt-Reihenfolge).
- **Reale automatisierte Tests** — bestehende Jest-Suite (16 Suiten, 58 Tests) als Baseline, plus neu geschriebene, gezielte Tests/Skripte zur Simulation von Grenzfällen (Race Conditions, Malformed Data, extreme Werte).
- **Nicht ausführbar in dieser Umgebung** (explizit markiert je Testfall): OS-Permission-Dialoge, Live-GPS/Mock-Location, App-Backgrounding/Kill&Restart, Gerätespeicher/Battery-Verhalten, echte Push-Notification-Zustellung, App-Store-Review-Verhalten.

## Feature-Inventar (aus Codebase-Analyse)

| Feature | Datei(en) | Persistenz | Externe Services |
|---|---|---|---|
| App-Einstieg / Tab-Navigation | `App.tsx`, `DemoApp.tsx`, `TabBar.tsx` | — | — |
| Theme / Dark Mode | `theme.tsx` | AsyncStorage `demo.darkMode` | — |
| Standort-Onboarding (Erststart-Gate) | `LocationOnboarding.tsx`, `location.tsx`, `DemoApp.tsx` | AsyncStorage `demo.location` | Nominatim (GPS-Fix), expo-location |
| Standort manuell (Ort/PLZ) | `LocationOnboarding.tsx`, `geocode.ts` | — | Nominatim `/search` |
| Standort per GPS | `LocationOnboarding.tsx`, `geocode.ts` | — | expo-location, Nominatim `/reverse` |
| Standort ändern (Profil) | `ProfileScreen.tsx`, `LocationOnboarding.tsx` (Radius-Slider) | AsyncStorage `demo.location` | wie oben |
| Feed (echte Events) | `FeedScreen.tsx`, `getEvents.ts`, `filterEvents.ts`, `geo.ts` | AsyncStorage `events-cache-v1` | `events.json` (GitHub Pages) |
| Leerer-Radius-Hinweis / Umkreis vergrößern | `FeedScreen.tsx` | — | — |
| Event-Karte (Anzeige) | `EventPostCard.tsx`, `eventDisplay.ts` | — | — |
| Mock-Like (Herz) | `EventPostCard.tsx` | nur lokaler State, kein Persist | — |
| Favoriten (🔖) | `favorites.tsx`, `EventPostCard.tsx`, `ProfileScreen.tsx` | AsyncStorage `demo.favorites` | — |
| Push-Erinnerung | `reminders.ts` (über Favoriten getriggert) | expo-notifications (OS-seitig) | expo-notifications |
| Kalender-Export (📅) | `ics.ts`, `calendarExport.ts` | Datei im Cache-Verzeichnis (nativ) | expo-file-system, expo-sharing |
| Event teilen (📤) | `share.ts`, `shareEvent.ts` | — | RN `Share` / `navigator.share` |
| Wetter-Badge | `weather.ts`, `EventPostCard.tsx` | — | Open-Meteo |
| Karte (Mock) | `MapScreen.tsx` | — | statische Kachel-URL (OSM) |
| Freunde-Feed (Mock) | `FriendsFeedScreen.tsx`, `demoData.ts` | — | — |
| Profil (Stats, Settings) | `ProfileScreen.tsx` | — | — |
| **Totes Legacy-Screen** (nicht erreichbar) | `EventListScreen.tsx`, `FilterBar.tsx`, `LocationInput.tsx`, `EventCard.tsx` | — | — |

Bestätigt: `App.tsx` importiert nur `DemoApp`, die Legacy-Screens (`EventListScreen` & co.) sind über keinen Pfad erreichbar — werden im Folgenden nicht als User-facing getestet, nur auf Bit-Rot/Vollständigkeit geprüft, falls sie versehentlich reaktiviert würden.

---

## 1. App-Start / Navigation

| # | Testfall | Erwartung |
|---|---|---|
| 1.1 | Erststart, kein AsyncStorage-Eintrag | Kurz nichts (Ladephase), dann Location-Onboarding, kein Tab-UI |
| 1.2 | Start mit gespeichertem Standort | Direkt Tab-UI, **kein** Aufblitzen des Onboardings |
| 1.3 | Tab-Wechsel Feed→Karte→Freunde→Profil→Feed | Jeder Screen rendert, State bleibt pro Screen lokal (kein Cross-Tab-Leck) |
| 1.4 | Web: Fenstergröße/Resize während Nutzung | Phone-Frame bleibt fix, kein Layout-Crash |
| 1.5 | AsyncStorage liefert korrupten JSON-String für `demo.location`/`demo.favorites`/`demo.darkMode` | App darf nicht crashen |

## 2. Standort-Onboarding (Schwerpunkt)

### 2.1 Permission-Zustände (GPS-Button "Standort verwenden")

| # | Testfall | Erwartung | Ausführbar hier? |
|---|---|---|---|
| 2.1.1 | Permission noch nie gefragt | OS-Dialog erscheint, bei Erlauben → Standort gesetzt | Nein — nur Code-Pfad geprüft |
| 2.1.2 | Permission bereits erlaubt | Kein Dialog, direkter GPS-Fix | Nein |
| 2.1.3 | Permission abgelehnt | Fehlertext `"Standort nicht verfügbar — bitte manuell eingeben."`, kein Crash, manuelles Feld bleibt bedienbar | Ja — Codepfad `status !== "granted"` in `LocationOnboarding.tsx:55-58` |
| 2.1.4 | Permission "nur einmal" (iOS) | Nach Approx. gewährt für Session, danach erneut gefragt | Nein |
| 2.1.5 | Permission dauerhaft abgelehnt, kein Settings-Deeplink vorhanden | App bietet **keinen** Weg zu den Systemeinstellungen — Nutzer muss selbst wissen, wo das geht | Ja — Code geprüft, kein `Linking.openSettings()` Aufruf irgendwo im Repo |
| 2.1.6 | Permission live in Systemeinstellungen entzogen während App offen | Nächster `getCurrentPositionAsync()`-Call wirft — Verhalten? | Nein, nur Codepfad (catch-Block greift, Fehlertext erscheint) |
| 2.1.7 | Nur ungefährer Standort (approximate) erlaubt | `getCurrentPositionAsync({})` liefert ggf. ungenauere Koordinaten, App behandelt sie identisch zu exakten — funktioniert, aber Distanzfilter kann falsch einsortieren | Nein, nur Codepfad |
| 2.1.8 | GPS/Location Services systemweit aus | `requestForegroundPermissionsAsync` löst i.d.R. mit "denied" oder wirft je nach Plattform | Nein |
| 2.1.9 | Kein Fix / Timeout (schwaches Signal, Keller etc.) | Keine explizite Timeout-Behandlung in `getCurrentPositionAsync({})` — kein Optionsobjekt mit `timeout` gesetzt | Ja — Code geprüft, Lücke bestätigt |

### 2.2 Manuelle Eingabe (Ort/PLZ)

| # | Testfall | Erwartung |
|---|---|---|
| 2.2.1 | Gültiger Ortsname (z.B. "Ihringen") | Nominatim-Treffer, Standort gesetzt, Onboarding schließt |
| 2.2.2 | Gültige PLZ (z.B. "79241") | Treffer, Standort gesetzt |
| 2.2.3 | Unsinnseingabe ("asdkjfhaskdjf") | `NOT_FOUND_ERROR` Text erscheint |
| 2.2.4 | Leeres Feld, Bestätigen gedrückt | Kein Request (`if (!query.trim()) return`), kein Fehler, kein Loading |
| 2.2.5 | Nur Leerzeichen | Wie 2.2.4 (trim greift) |
| 2.2.6 | Feld mit führendem/nachgestelltem Leerzeichen um gültigen Ort ("  Ihringen  ") | `query` wird **nicht** getrimmt vor dem Request (nur die Leer-Prüfung trimmt, der eigentliche Query-String an Nominatim geht ungetrimmt raus) — potenziell schlechterer Match |
| 2.2.7 | Sehr langer String (5000 Zeichen) | Kein Client-seitiges Limit auf `TextInput` — geht als sehr lange URL an Nominatim |
| 2.2.8 | Emojis / Sonderzeichen / Umlaute ("Ihringen 🍷", "Bötzingen") | `encodeURIComponent` behandelt das korrekt, kein Crash |
| 2.2.9 | SQL-/Script-artiger String (`'; DROP TABLE--`, `<script>alert(1)</script>`) | Landet nur als URL-Query-Param bei Nominatim, kein lokales SQL/HTML-Rendering-Risiko (React Native `Text` escaped ohnehin) |
| 2.2.10 | Netzwerkfehler während Suche (Nominatim nicht erreichbar) | `NETWORK_ERROR` Text |
| 2.2.11 | Mehrfach schnell auf "Bestätigen" tippen (Spam-Tap) | Button ist während `loading` per `disabled={loading}` gesperrt — **aber:** `loading` wird erst nach dem ersten State-Update `true`, ein sehr schneller Doppel-Tap vor dem Re-Render könnte zwei Requests auslösen |
| 2.2.12 | Screen verlassen (Onboarding→Tab-UI durch GPS-Erfolg) während manuelle Suche noch läuft | `confirmManual`s `setError`/`setLoading`/`setOrigin` laufen nach Unmount — kein Cleanup-Guard, klassische "Can't perform a React state update on an unmounted component"-Situation (in modernem React nur eine Warnung, kein Crash, aber ein Geruch) |
| 2.2.13 | Stale Error danach durch leeres Resubmit | Fehlertext von vorherigem Fehlversuch bleibt stehen, wenn Feld geleert und erneut (leer) abgeschickt wird (bereits aus Code-Review bekannt) |

### 2.3 Standortänderung / Radius-Editor (Profil → "Standort ändern")

| # | Testfall | Erwartung |
|---|---|---|
| 2.3.1 | Radius-Slider ganz nach links (1 km) | `radiusMeters` = 1000, Feed filtert entsprechend eng |
| 2.3.2 | Radius-Slider ganz nach rechts (100 km) | `radiusMeters` = 100000 |
| 2.3.3 | Slider schnell hin und her ziehen | Jeder `onValueChange`-Tick persistiert einzeln (kein Debounce) — viele AsyncStorage-Writes hintereinander |
| 2.3.4 | "Fertig" ohne neue Standort-Eingabe, nur Radius geändert | Radius bleibt, Standort unverändert, zurück zu Profil |
| 2.3.5 | Neuen Standort im Editor setzen, dann sofort wieder "Standort ändern" | Alter/neuer Standort korrekt überschrieben, keine Race mit dem vorherigen |
| 2.3.6 | Editor-Modus verlassen durch Tab-Wechsel (falls möglich) statt "Fertig" | `editingLocation`-State ist lokal in `ProfileScreen` — beim Remount (Tab-Wechsel weg und zurück) zurückgesetzt auf `false`? Zu prüfen. |

### 2.4 Standort-Zustand / Distanzberechnung / Extremwerte

| # | Testfall | Erwartung |
|---|---|---|
| 2.4.1 | Standort 0/0 (Null Island) | `distanceMeters` rechnet mathematisch korrekt (Haversine ist überall definiert), keine Sonderbehandlung nötig, aber Nominatim-Reverse für 0/0 liefert vermutlich keinen sinnvollen Ort |
| 2.4.2 | Pole (lat=90/-90) | Haversine bleibt stabil (cos(90°)=0), keine Division durch 0 im Code |
| 2.4.3 | Datumsgrenze (lon=±180) | Keine spezielle Constraint-Behandlung — Haversine-Formel selbst ist grenzstetig, kein Wrap-Bug im Code sichtbar |
| 2.4.4 | Negative Koordinaten (Südhalbkugel/Westhalbkugel) | Funktioniert, `toRadians` behandelt negative Gradzahlen korrekt |
| 2.4.5 | Event ohne `location.lat`/`lon` (nur Adresstext) | `filterEvents` schließt diese Events aus, sobald ein Radius-Filter aktiv ist (`hasCoords` false → `return false`) — Event verschwindet komplett aus dem Feed, keine Fallback-Anzeige "Ort unbekannt" |
| 2.4.6 | Mehrfach "Standort aktualisieren" (GPS-Button) hintereinander tippen | Kein Debounce/Lock auf `useDeviceLocation` — jeder Tap startet einen neuen `requestForegroundPermissionsAsync`+`getCurrentPositionAsync`+`geocodeReverse`-Zyklus parallel; der zuletzt auflösende gewinnt (letzter `setOrigin`-Call) |
| 2.4.7 | Standort-Listener nach Verlassen des Onboarding-Screens | Kein `watchPositionAsync` im Code — nur Einmal-Abfrage `getCurrentPositionAsync`, kein dauerhafter Listener, daher **kein** Battery-Drain-Risiko durch offenen Location-Stream |
| 2.4.8 | Radius 0 km eingestellt (Slider-Minimum ist 1000, aber `MAX_RADIUS_METERS`-Konstante in `FeedScreen` erlaubt rechnerisch auch 0 falls je erreichbar) | `filterEvents`: `distance > radiusMeters` bei `radiusMeters=0` verlangt exakte Übereinstimmung — praktisch immer leer |
| 2.4.9 | Standort ändert sich stark zwischen zwei App-Starts (Mock: Emmendingen → Hamburg) | Neuer Standort wird korrekt persistiert und beim nächsten Start geladen, Feed filtert neu — kein "alter Standort hängt fest"-Bug im Code sichtbar (Storage wird atomar überschrieben) |

## 3. Feed

| # | Testfall | Erwartung |
|---|---|---|
| 3.1 | `events.json` lädt erfolgreich | Events erscheinen, gefiltert nach Radius |
| 3.2 | `events.json` nicht erreichbar, kein Cache vorhanden | Leere Liste, Hinweistext "Keine Events verfügbar" |
| 3.3 | `events.json` nicht erreichbar, alter Cache vorhanden | Cache wird angezeigt (kann veraltet sein — kein "zuletzt aktualisiert"-Hinweis für den Nutzer sichtbar) |
| 3.4 | `events.json` liefert ungültiges JSON | `getEvents` fängt den Parse-Fehler? — **zu prüfen**: `JSON.parse(text)` steht **innerhalb** des `try`, sollte also in den Catch-Fallback fallen |
| 3.5 | `events.json` liefert valides JSON, aber kein Array (z.B. `{}` oder `null`) | `filterEvents`/`.map()` würde crashen, falls `events` kein Array ist — **zu prüfen** |
| 3.6 | Alle Events außerhalb Radius | Empty-State mit "Umkreis vergrößern"-Button |
| 3.7 | "Umkreis vergrößern" mehrfach hintereinander tippen bis 100 km-Cap | Button bleibt bedienbar am Cap, kein Crash, aber auch kein visuelles Feedback dass das Maximum erreicht ist |
| 3.8 | Event mit Startdatum in der Vergangenheit | Kein Ausschluss-Filter für vergangene Events in `filterEvents` — vergangene Events bleiben im Feed sichtbar (kein "nur zukünftige Events"-Constraint im Code) |
| 3.9 | Pull-to-Refresh (falls FlatList das unterstützt) | Kein `refreshControl` auf der `FlatList` konfiguriert — kein Pull-to-Refresh vorhanden, `useEffect` lädt nur einmal beim Mount |
| 3.10 | Schnelles Scrollen in langer Liste | FlatList Standardverhalten, kein Custom-Rendering-Risiko erkennbar |
| 3.11 | Doppelte Event-IDs im JSON | `keyExtractor={(e) => e.id}` — React würde Warnung werfen, Rendering evtl. inkonsistent |

## 4. Event-Karte / Aktionen (EventPostCard)

| # | Testfall | Erwartung |
|---|---|---|
| 4.1 | Herz (Mock-Like) tippen | Lokaler Toggle, **kein** Persist — nach Remount/Reload wieder zurückgesetzt (ist so gewollt laut Spec, aber für echten Nutzer verwirrend: "gefällt mir" vergisst sich) |
| 4.2 | 🔖 Favorit setzen | Persistiert, Icon-Farbe wechselt, taucht in Profil auf |
| 4.3 | 🔖 Favorit auf derselben Karte doppelt/schnell tippen (Spam-Tap) | Toggle wechselt jedes Mal — bei ungerader Tap-Zahl am Ende favorisiert, bei gerader nicht. Siehe Race-Analyse unten. |
| 4.4 | 🔖 Favorit setzen, sofort wieder entfernen, bevor `scheduleReminder` (async) aufgelöst hat | **Bereits gefunden & gefixt in dieser Session** (Commit `7075860`): verwaiste Erinnerung wurde storniert. Regressionstest vorhanden. |
| 4.5 | 📅 Kalender-Export tippen (Web) | `.ics`-Datei-Download ausgelöst |
| 4.6 | 📅 Kalender-Export, Event ohne `location.name` und ohne `location.address` | `LOCATION:` Feld leer, kein Crash (`?? ""`-Fallback) |
| 4.7 | 📅 Event-Titel mit Komma/Semikolon/Backslash/Zeilenumbruch | Korrektes iCal-Escaping (durch `ics.test.ts` abgedeckt) |
| 4.8 | 📤 Teilen tippen (Web, `navigator.share` verfügbar) | Share-Sheet öffnet mit Titel/Text |
| 4.9 | 📤 Teilen tippen (Web, `navigator.share` **nicht** verfügbar, z.B. Desktop-Chrome ohne HTTPS) | Fallback auf Zwischenablage, **keine sichtbare Bestätigung für den Nutzer** ("kopiert!"-Toast fehlt) |
| 4.10 | 📤 Teilen bei fehlendem `location.name` | Fällt auf "?" zurück, kein Crash |
| 4.11 | Wetter-Badge bei Event ohne Koordinaten | Kein Fetch, kein Badge — korrekt |
| 4.12 | Wetter-Badge bei Event >14 Tage in der Zukunft | Kein Fetch, kein Badge |
| 4.13 | Wetter-Badge, Open-Meteo nicht erreichbar | `getWeather(...).then(setWeather)` hat **kein `.catch`** — unhandled promise rejection (bereits aus Review bekannt) |
| 4.14 | Karte in Feed **und** in Profil-Favoriten gleichzeitig gerendert (dasselbe Event) | Jede Karteninstanz hat eigenen `weather`/`liked`/`dabei`-State (unabhängige `useState`), aber teilen sich denselben globalen `favorited`-Status über `useFavorites()` — Favorit-Toggle in einer Instanz muss sich in der anderen spiegeln (Context-getrieben, sollte funktionieren) |

## 5. Favoriten / Profil

| # | Testfall | Erwartung |
|---|---|---|
| 5.1 | Erster Favorit gesetzt | Erscheint sofort unter "Meine Favoriten" |
| 5.2 | Alle Favoriten entfernt | Empty-State "Noch keine Favoriten" |
| 5.3 | Favorisiertes Event verschwindet aus `events.json` (Quelle entfernt es) | `favoriteEvents = events.filter(isFavorite)` — Event verschwindet automatisch aus der Liste, aber der Favoriten-Eintrag (und ggf. die geplante Erinnerung) bleibt in `demo.favorites` für immer bestehen ("Karteileiche") |
| 5.4 | Sehr viele Favoriten (50+) | `ScrollView` statt `FlatList` für die Favoriten-Sektion — kein Virtualisieren, bei sehr vielen Einträgen Performance-Risiko (alle `EventPostCard`s inkl. eigener Wetter-Fetches rendern gleichzeitig) |
| 5.5 | Dark-Mode-Toggle mehrfach schnell tippen | Jeder Tap toggelt + persistiert einzeln, kein Debounce nötig da synchron |
| 5.6 | Profil-Events laden parallel zu Feed-Events (beide screens aktiv/gemountet) | Zwei unabhängige `getEvents`-Aufrufe (eigener `useEffect` je Screen) — doppelter Netzwerk-Request beim ersten Öffnen beider Tabs, kein gemeinsamer Cache-Layer im State (nur AsyncStorage-Cache geteilt) |

## 6. Datenschutz / Logging

| # | Testfall | Erwartung |
|---|---|---|
| 6.1 | Wird der Standort irgendwo geloggt? | Kein `console.log` mit Standortdaten im gesamten `app/src`-Baum gefunden (zu verifizieren per Grep) |
| 6.2 | Wird der Standort an Drittanbieter gesendet? | Ja, implizit: Nominatim erhält Ort/PLZ-Text bzw. GPS-Koordinaten (Geocoding), Open-Meteo erhält Koordinaten jedes Events mit `lat`/`lon` (nicht direkt der Nutzerstandort, aber indirekt über den gefilterten Radius ableitbar). Keine Datenschutzerklärung/Consent-Screen im Code gefunden. |
| 6.3 | Standort in AsyncStorage — Klartext oder verschlüsselt? | Klartext-JSON (`demo.location`), Standard-AsyncStorage-Verhalten, auf gerooteten/jailbroken Geräten auslesbar — für eine Demo-App akzeptabel, für Produktion ggf. relevant |

## 7. Allgemeine Robustheit

| # | Testfall | Erwartung |
|---|---|---|
| 7.1 | App-Kill mitten in Standort-Bestätigung (async Nominatim-Call läuft) | Nicht ausführbar hier; Code-seitig: kein Persistenzverlust-Risiko, da `setOrigin` erst nach Response persistiert |
| 7.2 | App in Hintergrund/Vordergrund während Wetter-Fetch läuft | Nicht ausführbar; kein Abort-Mechanismus im Code, Fetch läuft im Hintergrund weiter, State-Update nach Resume könnte auf unmounted Komponente treffen falls Tab gewechselt wurde |
| 7.3 | Zwei Browser-Tabs mit derselben Web-Session offen | AsyncStorage(Web)=`localStorage`, kein Cross-Tab-Sync — Favorit in Tab A gesetzt erscheint nicht live in Tab B ohne Reload |
| 7.4 | Langsames Netz (throttled) beim ersten Laden von `events.json` | Kein Ladeindikator im Feed während des ersten Fetches — Nutzer sieht kommentarlos leeren Screen bis Events (oder Empty-State) erscheinen |
