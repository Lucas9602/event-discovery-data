# Standort per Ort/PLZ statt Koordinaten — Design

## Ziel

`LocationOnboarding` (Erststart-Gate + "Standort ändern" im Profil) fragt aktuell nach Breitengrad/Längengrad — niemand kennt seine Koordinaten. Ersetzt das durch ein einzelnes Freitextfeld ("Ort oder Postleitzahl"), das per Geocoding zu Koordinaten aufgelöst wird. Der GPS-Pfad ("Standort verwenden") bekommt aus Konsistenzgründen ebenfalls einen echten Ortsnamen statt Koordinaten-Label (per Reverse-Geocoding). Zusätzlich wird ein kleiner bekannter Bug mitgefixt: ein 1-Frame-Aufblitzen des Onboardings bei App-Neustart, bevor der gespeicherte Standort aus AsyncStorage geladen ist.

**Nicht Ziel:** Autocomplete/Vorschlagsliste während des Tippens, Mehrfachtreffer-Auswahl bei Ort-Namens-Kollisionen (Top-1-Treffer reicht fürs Prototyp-Stadium), Caching der Geocoding-Anfragen (jede Anfrage ist ein einmaliger Nutzer-Tap, kein Bulk-Betrieb wie im Scraper).

## Architektur

Neues Modul `app/src/lib/geocode.ts`, analog zu `scraper/src/geocode.ts` (gleiche Nominatim-API, gleiches `fetchText: (url) => Promise<string>`-Injection-Pattern wie bei `getEvents`), aber ohne Datei-Cache — jede Anfrage ist eine einmalige Nutzeraktion, kein Bulk-Scraping-Betrieb.

```ts
export interface GeocodeResult { lat: number; lon: number; label: string }

export async function geocodeForward(
  query: string,
  fetchText: (url: string) => Promise<string>,
): Promise<GeocodeResult | null>

export async function geocodeReverse(
  lat: number,
  lon: number,
  fetchText: (url: string) => Promise<string>,
): Promise<string | null> // gekürztes Label, oder null bei Fehlschlag
```

- **Forward:** `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=<query>`. `countrycodes=de`, weil die App laut Projekt-Design ausschließlich Deutschland abdeckt. Kein Treffer (leeres Array) → `null`.
- **Reverse:** `https://nominatim.openstreetmap.org/reverse?format=json&lat=<lat>&lon=<lon>`. Fehler/kein brauchbares Ergebnis → `null` (Aufrufer fällt dann auf das bisherige Koordinaten-Label zurück, kein harter Fehler).
- **Label-Zuschnitt:** Nominatim liefert `display_name` als langen kommaseparierten String (z. B. `"Ihringen, Landkreis Breisgau-Hochschwarzwald, Baden-Württemberg, Deutschland"`). Beide Funktionen extrahieren nur das erste Segment (`display_name.split(",")[0].trim()`) als `label`.
- **User-Agent:** beide Requests setzen `"User-Agent": "kaiserstuhl-event-app/0.1 (lucas_haas@web.de)"` wie im Scraper (Nominatim-Nutzungsrichtlinie). Auf Web wird der Browser diesen Header stillschweigend ignorieren (kein Fehler, `fetch` verbietet das Überschreiben von `User-Agent` im Browser) — auf nativen Plattformen (iOS/Android via Expo) greift er.

## `LocationOnboarding.tsx` Änderungen

- Ersetzt `manualLat`/`manualLon`-States und die beiden `TextInput`s durch einen einzelnen `query`-State mit `TextInput` (Platzhalter „Ort oder Postleitzahl").
- Neuer `loading`-State (bool), während eine Geocoding-Anfrage läuft — Bestätigen-Button zeigt „Suche…" und ist währenddessen deaktiviert (verhindert Doppel-Taps, da dies jetzt ein echter Netzwerk-Call ist statt vorher synchronem `parseFloat`).
- `confirmManual()` wird `async`:
  1. `setLoading(true)`, `setError(null)`
  2. `geocodeForward(query, fetchTextHelper)` aufrufen
  3. Treffer → `setOrigin({ lat, lon, label })`, `onDone?.()`
  4. Kein Treffer (`null`) → Fehlertext „Ort nicht gefunden — bitte anders schreiben oder Postleitzahl versuchen."
  5. Wurf/Netzwerkfehler → Fehlertext „Verbindung fehlgeschlagen — bitte erneut versuchen."
  6. `finally`: `setLoading(false)`
- `useDeviceLocation()`: nach erfolgreichem GPS-Fix zusätzlich `geocodeReverse(lat, lon, fetchTextHelper)` aufrufen. Ergebnis vorhanden → Label = Ortsname. `null`/Fehler → Label bleibt wie bisher `formatCoordLabel(lat, lon)` (kein zusätzlicher Fehlerzustand, stiller Fallback — der Standort selbst ist ja gültig, nur das Label ist weniger schön).
- `fetchTextHelper`: kleine lokale Funktion `(url) => fetch(url).then((res) => res.text())`, gleiches Muster wie in `FeedScreen.tsx`.

## Hydration-Flash-Fix

- `location.tsx`: `LocationContextValue` bekommt ein zusätzliches Feld `hydrated: boolean`. Der bestehende interne `hydrated`-Ref wird durch einen zusätzlichen `useState(false)` ergänzt (Ref bleibt für die Persist-Effect-Gate-Logik, State ist für den Context-Value/Re-Render nötig — ein reiner Ref löst bei seiner Änderung keinen Re-Render aus), auf `true` gesetzt im selben `.finally()`-Block wie bisher.
- `DemoApp.tsx`: `DemoAppContent` liest zusätzlich `hydrated` aus `useLocation()`. Solange `!hydrated`: rendert `null` (kein sichtbarer Inhalt) statt direkt die Onboarding/Tab-Verzweigung. Danach wie bisher: `origin === null ? <LocationOnboarding /> : <Tabs />`.

## Fehlerbehandlung — Übersicht

| Fall | Verhalten |
|---|---|
| GPS-Berechtigung verweigert / GPS-Fehler | unverändert: „Standort nicht verfügbar — bitte manuell eingeben." |
| GPS erfolgreich, Reverse-Geocoding schlägt fehl | kein Fehler, Label = Koordinaten (bisheriges Verhalten als Fallback) |
| Manuelle Eingabe: kein Treffer | „Ort nicht gefunden — bitte anders schreiben oder Postleitzahl versuchen." |
| Manuelle Eingabe: Netzwerk-/Serverfehler | „Verbindung fehlgeschlagen — bitte erneut versuchen." |

## Testing

- `app/__tests__/geocode.test.ts` (neu): reines Modul, testbar wie `eventDisplay.test.ts` — Fake-`fetchText`, die feste JSON-Antworten liefert. Fälle: erfolgreiche Vorwärtssuche mit Label-Zuschnitt, leeres Ergebnis-Array → `null`, erfolgreiche Rückwärtssuche mit Label-Zuschnitt, Rückwärtssuche ohne brauchbares Ergebnis → `null`.
- `app/__tests__/location.test.tsx` (erweitert): neuer Test-Case, der bestätigt, dass `hydrated` `false` startet und nach dem Laden (auch ohne vorhandenen Storage-Eintrag) auf `true` wechselt.
- `LocationOnboarding.tsx` bleibt wie die anderen visuellen Demo-Komponenten ohne automatisierten Rendering-Test (bestehende Konvention aus dem real-feed-Plan) — manuelle Verifikation.
- `DemoApp.tsx`: kein neuer automatisierter Test nötig (bestehende Konvention, gleiche Begründung wie Task 4 im real-feed-Plan).

## Scope

Betroffene Dateien:
- Neu: `app/src/lib/geocode.ts`, `app/__tests__/geocode.test.ts`
- Ändern: `app/src/demo/LocationOnboarding.tsx`, `app/src/demo/location.tsx`, `app/src/demo/DemoApp.tsx`, `app/__tests__/location.test.tsx`

Nicht angefasst: `FeedScreen.tsx`, `ProfileScreen.tsx` (nutzen `LocationOnboarding`/`useLocation` weiterhin unverändert über ihre bestehenden Interfaces), `EventListScreen.tsx` (weiterhin totes, unberührtes Legacy-Screen).
