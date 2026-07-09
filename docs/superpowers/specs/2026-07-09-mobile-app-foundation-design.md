# Mobile App Foundation — Design

## Ziel

Fundament für eine mobile App (iOS + Android, App Store/Play Store), die Events aus der bestehenden Scraper-Pipeline anzeigt und filterbar macht. Kein Login, kein Backend-State — reine Anzeige- und Filterschicht auf Basis des bereits gebauten Scrapers ([[2026-07-03-event-discovery-design.md]]).

Dies ist **Spec 1** von zwei geplanten Folge-Specs. **Spec 2** (Freunde + Likes/RSVP, Supabase-Backend, Auth) baut später auf diesem Fundament auf und wird separat brainstormed, sobald dieses Spec umgesetzt ist. Eine dritte, noch nicht geplante Stufe (Empfehlungs-Engine basierend auf Like/RSVP-Daten) folgt danach.

Monetarisierung (Werbung) ist ein erklärtes späteres Ziel des Nutzers, aber nicht Teil dieses Specs.

## Scope-Abgrenzung

- **In diesem Spec:** Geocoding-Stufe im Scraper, Daten-Hosting via GitHub Pages, React-Native/Expo-App mit Event-Liste + Umkreis-/Zeitraum-Filter, Store-Veröffentlichung (iOS + Android).
- **Nicht in diesem Spec:** Accounts/Login, Freunde-System, Likes/RSVP, Empfehlungen, Werbung/Monetarisierung.

## Architektur-Übersicht

```
/scraper          (bestehend) + neue Geocoding-Stufe
/data              events.json, health.json, geocode-cache.json — ausgeliefert über GitHub Pages
/app               React Native (Expo) Mobile App
```

Kein neues Backend. Die App ist ein reiner Client der bereits von der Cron-Pipeline erzeugten und über GitHub Pages ausgelieferten JSON-Dateien.

## Geocoding im Scraper

**Problem:** Adapter (iCal, RSS, Template-Scraper etc.) liefern Standort meist nur als Text (`location.name`/`address`), nicht als lat/lon. Der Umkreisfilter der App braucht aber Koordinaten für praktisch alle Events, und die bestehende Dedup-Logik (`mergeEvents`, 500m-Merge-Radius) profitiert ebenfalls von mehr verfügbaren Koordinaten.

**Lösung:**
- Neues Modul `scraper/src/geocode.ts`: `geocodeAddress(text: string, fetchText: (url: string) => Promise<string>): Promise<{lat: number; lon: number} | null>`.
- Nutzt Nominatim (OpenStreetMap, kostenlos). Rate-Limit-Policy: max. 1 Anfrage/Sekunde, korrekter `User-Agent`-Header. Cache-Treffer überspringen den Delay.
- Persistenter Cache `data/geocode-cache.json`: Key = normalisierter Adresstext (wiederverwendet `normalizeTitle`-ähnliche Normalisierung), Value = `{lat, lon}`. Wird committed wie `events.json`/`health.json`.
- Neue Pipeline-Stufe in `run.ts`: läuft nach Adapter-Fetch, **vor** `mergeEvents()` — Raw-Events ohne Koordinaten werden geocodet, bevor Dedup über Distanz entscheidet.
- Events, bei denen Geocoding fehlschlägt (kein Adresstext oder kein Treffer), behalten `location` ohne lat/lon und werden im Umkreisfilter der App ausgeblendet, sobald dieser aktiv ist.
- Test: injizierte fetch-Funktion (kein Live-Netzwerk in Tests, wie beim Rest des Scrapers), Cache-Hit- und Cache-Miss-Pfad separat getestet.

## Daten-Hosting

`/data` (events.json, health.json, geocode-cache.json) wird zusätzlich über **GitHub Pages** als statischer Ordner ausgeliefert. Kein zusätzlicher Hosting-Service, keine laufenden Kosten. Die App lädt die JSON-URL beim App-Start und bei Pull-to-Refresh.

## Mobile App (`/app`, React Native / Expo)

```
/app
  App.tsx
  screens/
    EventListScreen.tsx     # Liste + Filter-UI
  components/
    EventCard.tsx            # Titel, Datum, Ort, Kategorie, Link zur Originalquelle
    FilterBar.tsx             # Umkreis-Regler + Standort-Toggle + Zeitraum-Auswahl
    LocationInput.tsx          # expo-location (Standort an/aus) + manuelles Standort-Feld als Alternative/Override
  lib/
    getEvents.ts               # fetch events.json von GitHub Pages, lokal cachen (Offline-Fallback via AsyncStorage)
    filterEvents.ts             # reine Funktion (events, filters) -> events, nutzt distanceMeters aus dem Scraper-Package
  test/
    filterEvents.test.ts
```

**Filter:**
- **Umkreis:** Standort per `expo-location` (Berechtigung + GPS-Position) ODER manuelle Standort-Eingabe mit Radius-Regler — beide Wege verfügbar, User kann zwischen automatischem Standort und manueller Eingabe wechseln.
- **Zeitraum:** Datumsbereich-Filter auf `start`.
- Events ohne Koordinaten: ausgeblendet, sobald der Umkreisfilter aktiv ist; ansonsten normal sichtbar.

**Offline-Verhalten:** Letzte erfolgreich geladene `events.json` wird lokal (AsyncStorage) gecacht und als Fallback angezeigt, falls beim App-Start kein Netzwerk verfügbar ist.

**Distribution:** Veröffentlichung über Apple App Store und Google Play Store (Entwicklerkosten: Apple 99$/Jahr, Google einmalig ~25$ — vom Nutzer akzeptiert im Hinblick auf geplante spätere Werbe-Monetarisierung). Build/Submit über Expo Application Services (EAS).

## Testing

- `filterEvents.test.ts`: Umkreis-Berechnung (baut auf bestehenden `distanceMeters`-Tests auf), Zeitraum-Grenzfälle, korrektes Ausblenden von Events ohne Koordinaten bei aktivem Umkreisfilter.
- `geocode.test.ts`: Cache-Hit vs. Cache-Miss, injizierte fetch-Funktion, kein Live-Netzwerk.
- Kein E2E-/Simulator-Test in dieser Phase — reine Unit-Tests, konsistent mit dem bestehenden Scraper-Testansatz (`superpowers:test-driven-development`).

## Offene Punkte für spätere Specs

- Spec 2: Supabase-Backend, Auth (Methode noch offen), Freunde-System (gegenseitig, Handle-Suche + Kontakte-Abgleich mit Consent-Flow), Likes (getrenntes Signal von RSVP), Sichtbarkeit nur für Freunde, Anzeige direkt auf Event-Karte/Detailseite.
- Spec 3 (ungeplant): Empfehlungs-Engine basierend auf Like/RSVP-Daten.
- Werbe-Monetarisierung: Zeitpunkt und Umsetzung noch offen, kein Bestandteil dieses oder des nächsten Specs.
