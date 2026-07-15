# Feed-Verbesserungen: Sortierung, Formatierung, Kategorien, Filter — Design

## Ziel

Der Feed zeigt jetzt echte gescrapte Events (868 Stück, seit der Overnight-Session live). Beim ersten echten Blick auf reale Daten sind vier Probleme aufgefallen:

1. Events erscheinen in beliebiger Reihenfolge, nicht chronologisch.
2. Beschreibungstexte unter den Karten sind unformatiert — Zeilenumbruch-Artefakte aus den Quellseiten und undekodierte HTML-Entities landen 1:1 im UI, lange Texte werden komplett ungekürzt angezeigt.
3. Das bestehende 6-Kategorien-Schema (Weinfest, Dorffest, Vereins-Sportfest, Konzert, Markt, Sonstiges) bildet die real gescrapten Inhalte schlecht ab — 72 % aller Events landeten unter "Sonstiges".
4. Es gibt aktuell keine nutzbare Filter-UI im echten Feed (die alte `FilterBar.tsx` ist toter Code).

Dieses Dokument deckt alle vier ab, da sie zusammenhängen: die neue Kategorie-Liste ist die Grundlage für den Kategorie-Filter, und die Formatierungs-Bereinigung passiert an derselben Stelle im Scraper wie die neue Vereins-Interna-Filterung.

## 1. Sortierung (Bugfix)

`FeedScreen.tsx` zeigt `visibleEvents` aktuell in der Reihenfolge, in der `filterEvents()` sie zurückgibt — das ist die Reihenfolge aus `events.json`, die vom Scraper (Quellen-Reihenfolge, dann Dedup-Gruppierung) bestimmt wird, nicht vom Datum.

**Fix:** `filterEvents()` in `app/src/lib/filterEvents.ts` sortiert das Ergebnis aufsteigend nach `start` (ISO-String, lexikografisch sortierbar), bevor es zurückgegeben wird. Betrifft nur den einen Rückgabepfad, keine neue Filter-Option.

## 2. Text-Formatierung

### Ursache (verifiziert an echten Daten)

Beschreibungstexte aus `ical`- und `template-scraper`-Quellen enthalten:
- Harte Zeilenumbrüche mitten im Wort (~70–80 Zeichen pro "Zeile") — Artefakt der Quellseiten-Darstellungsbreite, wird beim Scrapen 1:1 übernommen.
- HTML-Entities wie `&nbsp;`, unkodiert.
- Teils sehr lange Fließtexte (mehrere Absätze, >2000 Zeichen bei Ausstellungstexten), die aktuell komplett und ungekürzt unter der Karte erscheinen.

### Fix

**Scraper-seitig** (`scraper/src/normalize.ts`, neue Funktion `cleanDescription(text: string): string`):
- HTML-Entities dekodieren (mindestens `&nbsp;`, `&amp;`, `&uuml;`-artige numerische/benannte Entities, die in den Quellen vorkommen — kleine, feste Entity-Tabelle statt Vollparser, YAGNI).
- Zeilenumbruch-Artefakte glätten: einzelne `\n` (kein Absatzumbruch) durch Leerzeichen ersetzen, `\n\n`+ (echter Absatzumbruch) auf genau `\n\n` normalisieren.
- Angewendet auf `RawEvent.description` bevor es in `EventRecord.description` landet (in `dedup.ts`s `mergeEvents`, an derselben Stelle wie die Kategorie-Inferenz).

**App-seitig** (`EventPostCard.tsx`):
- Beschreibungstext bekommt `numberOfLines` (React Native `Text`-Prop) für eine kompakte Vorschau statt unbegrenzter Länge. Kein "mehr anzeigen"-Expand in dieser ersten Version (YAGNI — Karten sollen kompakt bleiben, wer mehr wissen will klickt zur Quelle über `sourceUrl`, das ist bereits vorhanden über das Share-Icon).

## 3. Kategorien

### Neues Schema (ersetzt das bestehende 6er-Set)

| Slug | Label | Beispiele aus echten Daten |
|---|---|---|
| `weinfest` | Weinfest | Winzerfest, Weinprobe, Weintage |
| `dorffest` | Dorffest & Feste | Dorffest, Sommerfest, Hoffest, Stadtfest |
| `konzert` | Konzert | Jahreskonzert, Musical |
| `markt` | Markt | Weihnachtsmarkt, Flohmarkt |
| `fuehrung-tour` | Führung & Tour | Kellerführung, Wanderung, Stadtführung, Rundgang |
| `vereinsleben` | Vereinsleben | Jubiläum, öffentliche Vereinsfeier (NICHT reine Verwaltungstermine, siehe Abschnitt 4) |
| `geselligkeit` | Geselligkeit | Bürgercafé, offener Treff |
| `kultur` | Kultur | Ausstellung, Vortrag |
| `sonstiges` | Sonstiges | echter Restposten |

`vereins-sportfest` entfällt als eigene Kategorie — echte Sportvereins-Events (Turniere, Schützenfeste) sind selten genug, dass sie unter `vereinsleben` oder `sonstiges` mitlaufen; kann bei Bedarf später wieder aufgetrennt werden (User hat angekündigt, das Schema nochmal zu besprechen).

### Betroffene Stellen (alle drei müssen synchron bleiben — bestehendes Muster im Code, keine neue Abstraktion nötig)

- `scraper/src/types.ts` — `CATEGORIES`-Array + `Category`-Type
- `scraper/src/normalize.ts` — `CATEGORY_KEYWORDS` (Regex-Zuordnung für die Inferenz), erweitert um Keywords für die 4 neuen Kategorien
- `app/src/demo/eventDisplay.ts` — `CATEGORY_STYLES` (Akzentfarbe + Bild pro Kategorie)
- `app/src/demo/EventPostCard.tsx` — `CATEGORY_LABELS` (deutsches Anzeige-Label)

### Migration bestehender Daten

Kein Migrations-Schritt nötig — `events.json` wird alle 3 Tage komplett neu generiert (kein inkrementelles Update des Kategorie-Felds bestehender Einträge), die neue Kategorie-Logik greift beim nächsten Scrape-Lauf automatisch.

## 4. Vereins-Interna-Filter

### Regel

Rein verwaltungsinterne Vereinstermine werden beim Scrapen verworfen (erscheinen gar nicht in `events.json`), öffentliche/einladende Vereins-Events bleiben und laufen unter `vereinsleben`.

**Ausschluss-Keywords** (Titel enthält eins davon, case-insensitive): `versammlung`, `mitgliederversammlung`, `generalversammlung`, `jahreshauptversammlung`, `sitzung`, `wahl` (als eigenständiges Wort, nicht als Teilstring — sonst matcht z.B. "Wahlfach"), `kassenbericht`.

**Nicht ausgeschlossen** (bewusste Gegenbeispiele, damit die Regel nicht zu breit wird): `jubiläum`, `fest`, `feier`, `königsschießen`, `ponynachmittag` — alles, was kein Keyword-Match ist, bleibt automatisch drin.

### Umsetzung

Neue Funktion `isInternalClubBusiness(title: string): boolean` in `scraper/src/normalize.ts`. Aufruf in `dedup.ts`s `mergeEvents`: Events, die darauf matchen, werden vor der Ausgabe verworfen (nicht in `records` aufgenommen). Gilt pro Rohevent vor dem Dedup-Merge — ein ausgeschlossenes Event nimmt nicht an der Dedup-Gruppierung teil.

## 5. Filter-System (App)

### UI

Zwei horizontal scrollbare Chip-Reihen über der Event-Liste in `FeedScreen.tsx`, unterhalb der bestehenden Topbar:

```
[Alle] [Weinfest] [Dorffest & Feste] [Konzert] [Markt] [Führung & Tour] [Vereinsleben] [Geselligkeit] [Kultur] [Sonstiges]
[Alle] [Diese Woche] [Dieser Monat] [Zeitraum wählen]
```

Beide Reihen: Single-Select, `Alle` ist Default. Neue Komponente `app/src/components/FilterChips.tsx` (generisch, für beide Reihen wiederverwendet — nimmt `options`, `selected`, `onSelect` als Props).

### Zeitraum-Semantik

- **Diese Woche**: Kalenderwoche Montag–Sonntag (nicht rollierend). An einem Sonntag zeigt das nur noch den einen Tag — akzeptiert, `Dieser Monat`/`Alle` fangen das ab.
- **Dieser Monat**: Kalendermonat (1. bis letzter Tag).
- **Zeitraum wählen**: wenn dieser Chip aktiv ist, erscheint direkt darunter eine Zeile mit zwei Textfeldern (Von/Bis, Format `JJJJ-MM-TT`) — wiederverwendet das bestehende Eingabemuster aus der alten `FilterBar.tsx`, kein neuer Date-Picker-Dependency. Die Felder bleiben leer bis der Chip aktiv ist, kein zusätzlicher Modal/Sheet.

### State & Persistenz

Filter-Auswahl ist reiner In-Memory-State in `FeedScreen.tsx` (`useState`), **kein** `AsyncStorage`-Persistieren über Sessions hinweg — anders als Standort/Radius (die sind ein Setup-Schritt, Filter sind eine Momentaufnahme "was will ich jetzt sehen"). Bei App-Neustart ist wieder "Alle" aktiv. Kann bei Bedarf später ergänzt werden, kein Blocker.

### Datenfluss

`EventFilters` in `app/src/lib/filterEvents.ts` bekommt zwei neue optionale Felder: `category?: Category` und die bestehenden `dateFrom`/`dateTo` werden vom Zeitraum-Chip statt (aktuell ungenutzt) einer alten `FilterBar` befüllt. `filterEvents()` filtert zusätzlich auf `event.category === filters.category`, wenn gesetzt.

## Nicht in diesem Scope

- Entfernungs-Filter als Chip (User hat sich bei der Filter-Frage explizit gegen einen extra Entfernungs-Chip entschieden — Radius bleibt wie bisher im Standort-Onboarding/Profil).
- "Mehr anzeigen"-Expand für lange Beschreibungen.
- Persistenz der Filter-Auswahl über Sessions.
- Weitere Aufteilung/Umbenennung der Kategorien (User will das Schema nochmal separat besprechen).
