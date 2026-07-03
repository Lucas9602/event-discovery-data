# Event-Discovery-App — Design (Phase 1: Recherche & Architektur)

## Ziel

Kostenlose, deutschlandweit skalierbare App zum Finden lokaler Events (Weinfeste, Dorffeste, Vereins-Sportfeste, Konzerte etc.). Start-Region: Kaiserstuhl-Kernorte + Umland, Freiburg und Emmendingen als Anker. Oberstes Prinzip: **Region-Agnostik** — keine hartcodierten Orte/Quellen im Code, neue Region/Gemeinde = neue Config-Einträge.

## Rechercheergebnis Startregion

Geprüfte Gemeinden (Vogtsburg, Ihringen, Merdingen, Eichstetten, Emmendingen, Bahlingen, Breisach) sowie Tourismusportal Naturgarten Kaiserstuhl und Badische Zeitung/bz-ticket.

**Kernbefund:** Kein iCal/RSS/Schema.org-Markup für Events in der Region gefunden. Der reale Skalierungshebel sind zwei wiederkehrende CMS-Familien:

1. **Hirsch & Wölfl GmbH (TYPO3)** — bestätigt bei Eichstetten, Emmendingen, Bahlingen. Agentur mit 1.400+ Kommunal-Websites bundesweit → höchster Hebel für "deutschlandweit".
2. **Komm.ONE / Pirobase** — bestätigt bei Ihringen, Merdingen. Verbreiteter BW-Kommunal-IT-Dienstleister.

| Quelle | Adaptertyp | CMS | robots.txt | Rechtlich |
|---|---|---|---|---|
| Vogtsburg | template-scraper | aufwind-solutions | offen | öffentl. Amtsinfo, unbedenklich |
| Ihringen | template-scraper (Komm.ONE) | Komm.ONE/Pirobase | Crawl-delay 30, Events-Pfad frei | unbedenklich, Delay einhalten |
| Merdingen | template-scraper (Komm.ONE) | Komm.ONE | ungeprüft | unbedenklich |
| Eichstetten | template-scraper (Hirsch&Wölfl) | TYPO3/H&W | ungeprüft, vor Bau prüfen | unbedenklich |
| Emmendingen | template-scraper (Hirsch&Wölfl) | TYPO3/H&W | ungeprüft | unbedenklich |
| Bahlingen | template-scraper (Hirsch&Wölfl, vermutet) | TYPO3/H&W | ungeprüft | unbedenklich |
| Breisach | custom-scraper | unbekannt | ungeprüft | unbedenklich |
| Naturgarten Kaiserstuhl (Tourismusportal) | ai-generic | unklar | offen | Metadaten+Link vertretbar, AGB vor Produktivbetrieb prüfen |
| Badische Zeitung / bz-ticket.de | — nicht als Quelle nutzen | — | — | kommerzielles Ticketing/Redaktion, Urheberrecht strenger |

**Nicht verifiziert** (Zeitbudget Phase 1): Bötzingen, Sasbach, Gottenheim, Riegel, Forchheim, Königschaffhausen, March, Umkirch, Endingen, Wasenweiler. Vor Implementierung: robots.txt je Quelle prüfen, sowie 2-3 Seiten pro CMS-Familie strukturell diffen (Annahme "identisches Template" ist noch nicht HTML-verifiziert).

## Architektur-Übersicht

Monorepo:

```
/scraper        Node/TS, läuft als GitHub-Actions-Cron-Job
/web            Next.js, mobile-first, Vercel/GitHub Pages
/data           generiertes events.json + health.json (versioniert)
/config
  /sources      ein Eintrag pro Quelle (YAML/JSON)
  /templates    CMS-Familien-Configs (CSS-Selektoren) für template-scraper
  /regions      Region-Baum (Gemeinde -> Landkreis -> Bundesland)
```

## Datenmodell

```ts
type Source = {
  id: string;                // stable slug, z.B. "de-bw-vogtsburg-gemeinde"
  name: string;
  url: string;
  region: string;             // FK auf Region.id
  adapterType: "ical" | "rss" | "schema-org" | "template-scraper" | "ai-generic" | "custom-scraper";
  adapterConfig: Record<string, unknown>;
  legal: { basis: string; robotsChecked: string; notes?: string };
  active: boolean;
};

type Region = {
  id: string;
  name: string;
  center: { lat: number; lon: number };
  parentRegion?: string;
};

type Event = {
  id: string;                 // Hash aus Titel+Datum+Location
  title: string;
  description?: string;
  start: string;               // ISO 8601
  end?: string;
  location: { name?: string; address?: string; lat?: number; lon?: number };
  category: string;            // kontrolliertes Vokabular
  sourceIds: string[];
  sourceUrl: string;
  region: string;
  lastSeenAt: string;
};

type SourceHealth = {
  sourceId: string;
  lastRunAt: string;
  lastSuccessAt?: string;
  eventsFoundLastRun: number;
  consecutiveFailures: number;
  status: "ok" | "degraded" | "broken";
};
```

Kategorie als kontrolliertes Vokabular: Weinfest, Dorffest, Vereins-Sportfest, Konzert, Markt, Sonstiges.

## Adapter-Interface

```ts
interface EventAdapter {
  type: string;
  fetchEvents(source: Source): Promise<RawEvent[]>;
}

const adapterRegistry: Record<string, EventAdapter> = {
  "ical": icalAdapter,
  "rss": rssAdapter,
  "schema-org": schemaOrgAdapter,
  "template-scraper": templateScraperAdapter,
  "ai-generic": aiGenericAdapter,
  "custom-scraper": customScraperAdapter,
};
```

Neuer Adaptertyp = neuer Registry-Eintrag, kein Umbau am Runner.

`template-scraper` ist der Skalierungs-Hub: `adapterConfig.template` referenziert eine Datei unter `/config/templates/` (z. B. `hirsch-woelfl-v1.json`) mit CSS-Selektoren für Titel/Datum/Ort/Beschreibung. Neue Gemeinde im selben CMS = neuer `Source`-Eintrag mit bestehendem Template-Verweis, kein Code.

`ai-generic`: HTML → günstiges Modell (Haiku) mit festem JSON-Schema-Prompt. Fallback für Quellen außerhalb bekannter CMS-Cluster. HTML-Hash cachen, nur bei Änderung neu anfragen (Kostenkontrolle).

`custom-scraper`: Nur letzter Ausweg für wichtige Einzelquellen ohne Alternative.

## Health-Monitoring

Nach jedem Cron-Run `SourceHealth` aktualisieren. `status: "broken"` nach 3 aufeinanderfolgenden Fehlversuchen ODER 0 Events bei einer Quelle, die historisch >0 lieferte. Ergebnis in `/data/health.json`, Frontend kann "X Quellen aktuell gestört" anzeigen — verhindert stummes Leerlaufen einer Region bei Layout-Änderungen.

## Deduplizierung

Matching per normalisiertem Titel (lowercase, Umlaute/Satzzeichen entfernt) + Datum + Geo-Nähe (<500m falls Koordinaten vorhanden). Bei Match: `sourceIds` mergen, `sourceUrl` von der höchstpriorisierten Quelle (iCal > Schema.org > Template-Scraper > AI-generic > Custom). Regelbasiert, kein ML nötig für Startvolumen.

## Storage & Deployment

- Start: `events.json` + `health.json` unter `/data`, von GitHub Actions generiert und committed. Ausgeliefert über GitHub Pages oder direkt aus dem Repo an Vercel.
- Migrationspfad zu Supabase/PostGIS: `Event`/`Source`/`Region`-Typen sind 1:1 Tabellenkandidaten. Frontend liest ausschließlich über ein `getEvents(filter)`-Interface — Wechsel JSON→DB ändert nur die Implementierung dahinter, kein Rewrite.
- Cron: GitHub Actions, alle 6h `npm run scrape` → JSON generieren → committen. Kostenlos im Free-Tier-Rahmen dieses Umfangs.

## Kosten-Flag

`ai-generic` verursacht bei Skalierung auf tausende Quellen echte Kosten pro Lauf. Mitigation: HTML-Hash-Cache (nur bei Änderung neu parsen), `ai-generic` bleibt Fallback statt Standardpfad. Bei deutschlandweiter Skalierung erneut prüfen, sobald Quellenzahl in die Hunderte geht.

## Rechtliches — Grundsatz

Nur öffentlich zugängliche Amts-/Vereinsinformationen, robots.txt respektieren (inkl. Crawl-Delay), keine Server überlasten, jedes Event verlinkt zur Originalquelle. Ticketing-/redaktionelle Portale (Badische Zeitung, bz-ticket.de) bewusst ausgeschlossen. Vor Produktivbetrieb: Tourismusportal-AGB und alle noch ungeprüften robots.txt final checken.

## Offene Punkte für Phase 2

- robots.txt der noch ungeprüften Gemeinden (Bötzingen, Sasbach, Gottenheim, Riegel, Forchheim, Königschaffhausen, March, Umkirch, Endingen, Wasenweiler) klären.
- Hirsch&Wölfl- und Komm.ONE-Templates anhand von 2-3 echten Seiten pro Familie strukturell verifizieren (HTML-Diff), bevor der Template-Scraper gebaut wird.
- Konkrete Selektor-Configs für die beiden CMS-Familien erstellen.
