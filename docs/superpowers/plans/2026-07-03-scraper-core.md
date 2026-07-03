# Scraper Core (Adapter Layer, Data Model, Health, Dedup, Cron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the region-agnostic scraper core: data model, adapter registry with 6 adapter types (ical, rss, schema-org, template-scraper, ai-generic, custom-scraper stub), cross-source deduplication, per-source health monitoring, and a GitHub Actions cron job that runs the pipeline and commits `data/events.json` + `data/health.json`.

**Architecture:** Node/TypeScript project under `/scraper`. Each adapter implements a common `EventAdapter` interface and is looked up via a registry keyed by `adapterType` string, so new adapter types plug in without touching the orchestrator. `run.ts` loads `Source`/`Region` config from `/config`, calls the matching adapter per source, normalizes results into `EventRecord`s, deduplicates across sources, updates `SourceHealth`, and writes JSON output to `/data`. Every unit is tested against local fixtures — no live network calls in the test suite.

**Tech Stack:** TypeScript (ESM), Vitest for tests, `cheerio` (HTML/DOM parsing), `rss-parser` (RSS), `node-ical` (iCal), `@anthropic-ai/sdk` (Claude Haiku 4.5 for the ai-generic adapter), `tsx` to run TS directly in the cron job.

## Global Constraints

- Region-agnostic: no hardcoded place names, coordinates, or source URLs in `/scraper/src`. All of that lives under `/config`.
- No live network calls inside unit tests — adapters accept an injectable fetch/text function so fixtures can stand in for real HTTP responses.
- `ai-generic` adapter uses model id `claude-haiku-4-5` (cheapest tier) — never a more expensive model, per the project's cost-sensitivity requirement.
- Every adapter implements the same `EventAdapter` interface (`type`, `fetchEvents`) and registers itself in `adapterRegistry` — the orchestrator never special-cases an adapter type.
- Category values are restricted to the controlled vocabulary in `src/types.ts` (`CATEGORIES`) — never free text.
- Commit after each task passes its tests.

---

### Task 1: Scaffold the `/scraper` project

**Files:**
- Create: `scraper/package.json`
- Create: `scraper/tsconfig.json`
- Create: `scraper/vitest.config.ts`
- Create: `scraper/.gitignore`

**Interfaces:**
- Produces: an npm project at `/scraper` with `npm test` running Vitest and `npm run scrape` running `src/run.ts` via `tsx`.

- [ ] **Step 1: Create `scraper/package.json`**

```json
{
  "name": "event-discovery-scraper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "scrape": "tsx src/run.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "cheerio": "^1.0.0",
    "node-ical": "^0.20.1",
    "rss-parser": "^3.13.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `scraper/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `scraper/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `scraper/.gitignore`**

```
node_modules
dist
```

- [ ] **Step 5: Install dependencies**

Run: `cd scraper && npm install`
Expected: `node_modules` created, `package-lock.json` written, no errors.

- [ ] **Step 6: Commit**

```bash
git add scraper/package.json scraper/package-lock.json scraper/tsconfig.json scraper/vitest.config.ts scraper/.gitignore
git commit -m "Scaffold scraper project (TS, Vitest, adapter deps)"
```

---

### Task 2: Core types and category vocabulary

**Files:**
- Create: `scraper/src/types.ts`

**Interfaces:**
- Produces: `AdapterType`, `CATEGORIES`, `Category`, `Region`, `Source`, `RawEvent`, `EventRecord`, `SourceHealth`, `SourceHealthStatus` — every later task imports from this file.

- [ ] **Step 1: Write `scraper/src/types.ts`**

```ts
export type AdapterType =
  | "ical"
  | "rss"
  | "schema-org"
  | "template-scraper"
  | "ai-generic"
  | "custom-scraper";

export const CATEGORIES = [
  "weinfest",
  "dorffest",
  "vereins-sportfest",
  "konzert",
  "markt",
  "sonstiges",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Region {
  id: string;
  name: string;
  center: { lat: number; lon: number };
  parentRegion?: string;
}

export interface SourceLegal {
  basis: string;
  robotsChecked: string;
  notes?: string;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  region: string;
  adapterType: AdapterType;
  adapterConfig: Record<string, unknown>;
  legal: SourceLegal;
  active: boolean;
}

export interface RawEvent {
  title: string;
  description?: string;
  start: string;
  end?: string;
  location?: { name?: string; address?: string; lat?: number; lon?: number };
  category?: string;
  sourceUrl: string;
}

export interface EventLocation {
  name?: string;
  address?: string;
  lat?: number;
  lon?: number;
}

export interface EventRecord {
  id: string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  location: EventLocation;
  category: Category;
  sourceIds: string[];
  sourceUrl: string;
  region: string;
  lastSeenAt: string;
}

export type SourceHealthStatus = "ok" | "degraded" | "broken";

export interface SourceHealth {
  sourceId: string;
  lastRunAt: string;
  lastSuccessAt?: string;
  eventsFoundLastRun: number;
  consecutiveFailures: number;
  status: SourceHealthStatus;
}
```

- [ ] **Step 2: Type-check**

Run: `cd scraper && npx tsc --noEmit`
Expected: no errors (no test needed — this file has no logic, only type/const declarations).

- [ ] **Step 3: Commit**

```bash
git add scraper/src/types.ts
git commit -m "Add core data model types"
```

---

### Task 3: Geo utility (haversine distance)

**Files:**
- Create: `scraper/src/geo.ts`
- Test: `scraper/test/geo.test.ts`

**Interfaces:**
- Produces: `distanceMeters(a: {lat:number; lon:number}, b: {lat:number; lon:number}): number`
- Consumed later by: `dedup.ts` (Task 11)

- [ ] **Step 1: Write the failing test**

```ts
// scraper/test/geo.test.ts
import { describe, expect, it } from "vitest";
import { distanceMeters } from "../src/geo";

describe("distanceMeters", () => {
  it("returns ~0 for identical coordinates", () => {
    const p = { lat: 48.0836, lon: 7.6572 };
    expect(distanceMeters(p, p)).toBeLessThan(1);
  });

  it("returns the correct order of magnitude for a known distance", () => {
    // Freiburg im Breisgau (47.9990, 7.8421) to Emmendingen (48.1206, 7.8497)
    // real-world distance is ~13.6 km
    const freiburg = { lat: 47.999, lon: 7.8421 };
    const emmendingen = { lat: 48.1206, lon: 7.8497 };
    const d = distanceMeters(freiburg, emmendingen);
    expect(d).toBeGreaterThan(12000);
    expect(d).toBeLessThan(15000);
  });

  it("is symmetric", () => {
    const a = { lat: 48.05, lon: 7.6 };
    const b = { lat: 48.06, lon: 7.65 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/geo.test.ts`
Expected: FAIL — `Cannot find module '../src/geo'`

- [ ] **Step 3: Write `scraper/src/geo.ts`**

```ts
const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/geo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scraper/src/geo.ts scraper/test/geo.test.ts
git commit -m "Add haversine distance utility"
```

---

### Task 4: Normalization utilities (event ID hash, title/category normalization)

**Files:**
- Create: `scraper/src/normalize.ts`
- Test: `scraper/test/normalize.test.ts`

**Interfaces:**
- Produces: `normalizeTitle(title: string): string`, `dedupKey(title: string, isoDate: string): string`, `normalizeCategory(raw: string | undefined): Category`, `computeEventId(rawEvent: RawEvent, region: string): string`
- Consumes: `Category`, `CATEGORIES`, `RawEvent` from `types.ts`
- Consumed later by: `dedup.ts` (Task 11), `run.ts` (Task 13)

- [ ] **Step 1: Write the failing test**

```ts
// scraper/test/normalize.test.ts
import { describe, expect, it } from "vitest";
import { computeEventId, dedupKey, normalizeCategory, normalizeTitle } from "../src/normalize";
import type { RawEvent } from "../src/types";

describe("normalizeTitle", () => {
  it("lowercases, strips umlaut diacritics, and removes punctuation", () => {
    expect(normalizeTitle("Winzerfest Königschaffhausen!")).toBe(
      "winzerfest konigschaffhausen",
    );
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeTitle("Dorf-Fest   2026")).toBe("dorf fest 2026");
  });
});

describe("dedupKey", () => {
  it("combines normalized title with the calendar date only", () => {
    expect(dedupKey("Weinfest Ihringen", "2026-08-15T18:00:00.000Z")).toBe(
      "weinfest ihringen|2026-08-15",
    );
  });

  it("produces the same key regardless of time-of-day", () => {
    const a = dedupKey("Sommerfest", "2026-08-15T10:00:00.000Z");
    const b = dedupKey("Sommerfest", "2026-08-15T22:30:00.000Z");
    expect(a).toBe(b);
  });
});

describe("normalizeCategory", () => {
  it("passes through a known category", () => {
    expect(normalizeCategory("konzert")).toBe("konzert");
  });

  it("falls back to sonstiges for unknown or missing input", () => {
    expect(normalizeCategory("Feuerwerk")).toBe("sonstiges");
    expect(normalizeCategory(undefined)).toBe("sonstiges");
  });
});

describe("computeEventId", () => {
  it("produces a stable, deterministic hash for the same input", () => {
    const event: RawEvent = {
      title: "Weinfest Ihringen",
      start: "2026-08-15T18:00:00.000Z",
      location: { name: "Marktplatz" },
      sourceUrl: "https://ihringen.de/events/1",
    };
    const id1 = computeEventId(event, "de-bw-kaiserstuhl");
    const id2 = computeEventId(event, "de-bw-kaiserstuhl");
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[a-f0-9]{16}$/);
  });

  it("produces different hashes for different titles", () => {
    const base: RawEvent = {
      title: "Weinfest Ihringen",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://ihringen.de/events/1",
    };
    const other: RawEvent = { ...base, title: "Dorffest Eichstetten" };
    expect(computeEventId(base, "r")).not.toBe(computeEventId(other, "r"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/normalize.test.ts`
Expected: FAIL — `Cannot find module '../src/normalize'`

- [ ] **Step 3: Write `scraper/src/normalize.ts`**

```ts
import { createHash } from "node:crypto";
import { CATEGORIES, type Category, type RawEvent } from "./types";

const UMLAUT_MAP: Record<string, string> = {
  ä: "a",
  ö: "o",
  ü: "u",
  ß: "ss",
};

export function normalizeTitle(title: string): string {
  const lower = title.toLowerCase();
  const deUmlauted = lower.replace(/[äöüß]/g, (ch) => UMLAUT_MAP[ch] ?? ch);
  const withoutPunctuation = deUmlauted.replace(/[^a-z0-9\s]/g, " ");
  return withoutPunctuation.replace(/\s+/g, " ").trim();
}

export function dedupKey(title: string, isoDate: string): string {
  const dateOnly = isoDate.slice(0, 10);
  return `${normalizeTitle(title)}|${dateOnly}`;
}

export function normalizeCategory(raw: string | undefined): Category {
  if (raw && (CATEGORIES as readonly string[]).includes(raw)) {
    return raw as Category;
  }
  return "sonstiges";
}

export function computeEventId(rawEvent: RawEvent, region: string): string {
  const key = [
    region,
    normalizeTitle(rawEvent.title),
    rawEvent.start.slice(0, 10),
    rawEvent.location?.name ? normalizeTitle(rawEvent.location.name) : "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/normalize.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add scraper/src/normalize.ts scraper/test/normalize.test.ts
git commit -m "Add title/category normalization and event ID hashing"
```

---

### Task 5: Adapter interface and registry

**Files:**
- Create: `scraper/src/adapters/registry.ts`
- Test: `scraper/test/adapters/registry.test.ts`

**Interfaces:**
- Produces: `interface EventAdapter { type: string; fetchEvents(source: Source, fetchText: (url: string) => Promise<string>): Promise<RawEvent[]>; }`, `registerAdapter(adapter: EventAdapter): void`, `getAdapter(type: string): EventAdapter`, `adapterRegistry: Map<string, EventAdapter>`
- Consumes: `Source`, `RawEvent` from `types.ts`
- Consumed later by: every adapter file (Tasks 6-10) and `run.ts` (Task 13)

- [ ] **Step 1: Write the failing test**

```ts
// scraper/test/adapters/registry.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { adapterRegistry, getAdapter, registerAdapter, type EventAdapter } from "../../src/adapters/registry";

describe("adapter registry", () => {
  beforeEach(() => {
    adapterRegistry.clear();
  });

  it("registers and retrieves an adapter by type", () => {
    const dummy: EventAdapter = {
      type: "dummy",
      fetchEvents: async () => [],
    };
    registerAdapter(dummy);
    expect(getAdapter("dummy")).toBe(dummy);
  });

  it("throws a descriptive error for an unregistered type", () => {
    expect(() => getAdapter("does-not-exist")).toThrow(
      'No adapter registered for type "does-not-exist"',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/adapters/registry.test.ts`
Expected: FAIL — `Cannot find module '../../src/adapters/registry'`

- [ ] **Step 3: Write `scraper/src/adapters/registry.ts`**

```ts
import type { RawEvent, Source } from "../types";

export interface EventAdapter {
  type: string;
  fetchEvents(
    source: Source,
    fetchText: (url: string) => Promise<string>,
  ): Promise<RawEvent[]>;
}

export const adapterRegistry = new Map<string, EventAdapter>();

export function registerAdapter(adapter: EventAdapter): void {
  adapterRegistry.set(adapter.type, adapter);
}

export function getAdapter(type: string): EventAdapter {
  const adapter = adapterRegistry.get(type);
  if (!adapter) {
    throw new Error(`No adapter registered for type "${type}"`);
  }
  return adapter;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/adapters/registry.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scraper/src/adapters/registry.ts scraper/test/adapters/registry.test.ts
git commit -m "Add adapter interface and registry"
```

---

### Task 6: iCal adapter

**Files:**
- Create: `scraper/src/adapters/ical.ts`
- Create: `scraper/test/fixtures/sample.ics`
- Test: `scraper/test/adapters/ical.test.ts`

**Interfaces:**
- Produces: `icalAdapter: EventAdapter` (`type: "ical"`)
- Consumes: `EventAdapter`, `registerAdapter` from `registry.ts`; `node-ical` package

- [ ] **Step 1: Create the fixture `scraper/test/fixtures/sample.ics`**

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-1@example.test
DTSTART:20260815T180000Z
DTEND:20260815T230000Z
SUMMARY:Weinfest Testort
DESCRIPTION:Ein Fest zum Test
LOCATION:Marktplatz Testort
URL:https://example.test/events/1
END:VEVENT
BEGIN:VEVENT
UID:event-2@example.test
DTSTART:20260901T100000Z
SUMMARY:Dorffest Testdorf
END:VEVENT
END:VCALENDAR
```

- [ ] **Step 2: Write the failing test**

```ts
// scraper/test/adapters/ical.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { icalAdapter } from "../../src/adapters/ical";
import type { Source } from "../../src/types";

const fixture = readFileSync(
  path.join(__dirname, "../fixtures/sample.ics"),
  "utf-8",
);

const source: Source = {
  id: "test-source",
  name: "Test Source",
  url: "https://example.test/calendar.ics",
  region: "test-region",
  adapterType: "ical",
  adapterConfig: {},
  legal: { basis: "public", robotsChecked: "2026-07-03" },
  active: true,
};

describe("icalAdapter", () => {
  it("parses events from ICS text", async () => {
    const events = await icalAdapter.fetchEvents(source, async () => fixture);
    expect(events).toHaveLength(2);

    const [first] = events;
    expect(first.title).toBe("Weinfest Testort");
    expect(first.description).toBe("Ein Fest zum Test");
    expect(first.location?.name).toBe("Marktplatz Testort");
    expect(first.start).toBe("2026-08-15T18:00:00.000Z");
    expect(first.end).toBe("2026-08-15T23:00:00.000Z");
    expect(first.sourceUrl).toBe("https://example.test/events/1");
  });

  it("falls back to the source URL when an event has no URL of its own", async () => {
    const events = await icalAdapter.fetchEvents(source, async () => fixture);
    expect(events[1].sourceUrl).toBe(source.url);
    expect(events[1].end).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/adapters/ical.test.ts`
Expected: FAIL — `Cannot find module '../../src/adapters/ical'`

- [ ] **Step 4: Write `scraper/src/adapters/ical.ts`**

```ts
import ical from "node-ical";
import type { RawEvent, Source } from "../types";
import type { EventAdapter } from "./registry";

export const icalAdapter: EventAdapter = {
  type: "ical",

  async fetchEvents(source, fetchText) {
    const text = await fetchText(source.url);
    const parsed = ical.sync.parseICS(text);
    const events: RawEvent[] = [];

    for (const component of Object.values(parsed)) {
      if (component.type !== "VEVENT") continue;

      events.push({
        title: component.summary ?? "",
        description: component.description || undefined,
        start: new Date(component.start as unknown as string).toISOString(),
        end: component.end
          ? new Date(component.end as unknown as string).toISOString()
          : undefined,
        location: component.location ? { name: component.location } : undefined,
        sourceUrl: (component as { url?: string }).url || source.url,
      });
    }

    return events;
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/adapters/ical.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add scraper/src/adapters/ical.ts scraper/test/fixtures/sample.ics scraper/test/adapters/ical.test.ts
git commit -m "Add iCal adapter"
```

---

### Task 7: RSS adapter

**Files:**
- Create: `scraper/src/adapters/rss.ts`
- Create: `scraper/test/fixtures/sample-rss.xml`
- Test: `scraper/test/adapters/rss.test.ts`

**Interfaces:**
- Produces: `rssAdapter: EventAdapter` (`type: "rss"`)
- Consumes: `EventAdapter`, `registry.ts`; `rss-parser` package

- [ ] **Step 1: Create the fixture `scraper/test/fixtures/sample-rss.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Testgemeinde Veranstaltungen</title>
    <item>
      <title>Sommerfest Testgemeinde</title>
      <description>Musik, Essen, Trinken auf dem Dorfplatz.</description>
      <link>https://example.test/events/sommerfest</link>
      <pubDate>Sat, 15 Aug 2026 18:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
```

- [ ] **Step 2: Write the failing test**

```ts
// scraper/test/adapters/rss.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rssAdapter } from "../../src/adapters/rss";
import type { Source } from "../../src/types";

const fixture = readFileSync(
  path.join(__dirname, "../fixtures/sample-rss.xml"),
  "utf-8",
);

const source: Source = {
  id: "test-rss-source",
  name: "Test RSS Source",
  url: "https://example.test/feed.xml",
  region: "test-region",
  adapterType: "rss",
  adapterConfig: {},
  legal: { basis: "public", robotsChecked: "2026-07-03" },
  active: true,
};

describe("rssAdapter", () => {
  it("parses a feed item into a RawEvent", async () => {
    const events = await rssAdapter.fetchEvents(source, async () => fixture);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Sommerfest Testgemeinde");
    expect(events[0].description).toBe("Musik, Essen, Trinken auf dem Dorfplatz.");
    expect(events[0].sourceUrl).toBe("https://example.test/events/sommerfest");
    expect(events[0].start).toBe("2026-08-15T18:00:00.000Z");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/adapters/rss.test.ts`
Expected: FAIL — `Cannot find module '../../src/adapters/rss'`

- [ ] **Step 4: Write `scraper/src/adapters/rss.ts`**

```ts
import Parser from "rss-parser";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

export const rssAdapter: EventAdapter = {
  type: "rss",

  async fetchEvents(source, fetchText) {
    const text = await fetchText(source.url);
    const parser = new Parser();
    const feed = await parser.parseString(text);
    const events: RawEvent[] = [];

    for (const item of feed.items) {
      if (!item.title || !item.pubDate) continue;

      events.push({
        title: item.title,
        description: item.contentSnippet || item.content || undefined,
        start: new Date(item.pubDate).toISOString(),
        sourceUrl: item.link || source.url,
      });
    }

    return events;
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/adapters/rss.test.ts`
Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add scraper/src/adapters/rss.ts scraper/test/fixtures/sample-rss.xml scraper/test/adapters/rss.test.ts
git commit -m "Add RSS adapter"
```

---

### Task 8: Schema.org adapter

**Files:**
- Create: `scraper/src/adapters/schemaOrg.ts`
- Create: `scraper/test/fixtures/schema-org.html`
- Test: `scraper/test/adapters/schemaOrg.test.ts`

**Interfaces:**
- Produces: `schemaOrgAdapter: EventAdapter` (`type: "schema-org"`)
- Consumes: `EventAdapter`, `registry.ts`; `cheerio` package

- [ ] **Step 1: Create the fixture `scraper/test/fixtures/schema-org.html`**

```html
<!DOCTYPE html>
<html>
<head><title>Veranstaltungen</title></head>
<body>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Herbstmarkt Testort",
    "startDate": "2026-10-03T09:00:00+02:00",
    "endDate": "2026-10-03T18:00:00+02:00",
    "description": "Markt mit regionalen Produkten.",
    "url": "https://example.test/herbstmarkt",
    "location": { "@type": "Place", "name": "Rathausplatz" }
  }
  </script>
  <script type="application/ld+json">
  [
    {
      "@context": "https://schema.org",
      "@type": "Event",
      "name": "Konzert in der Kirche",
      "startDate": "2026-11-20T19:30:00+01:00"
    }
  ]
  </script>
</body>
</html>
```

- [ ] **Step 2: Write the failing test**

```ts
// scraper/test/adapters/schemaOrg.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { schemaOrgAdapter } from "../../src/adapters/schemaOrg";
import type { Source } from "../../src/types";

const fixture = readFileSync(
  path.join(__dirname, "../fixtures/schema-org.html"),
  "utf-8",
);

const source: Source = {
  id: "test-schema-source",
  name: "Test Schema.org Source",
  url: "https://example.test/veranstaltungen",
  region: "test-region",
  adapterType: "schema-org",
  adapterConfig: {},
  legal: { basis: "public", robotsChecked: "2026-07-03" },
  active: true,
};

describe("schemaOrgAdapter", () => {
  it("extracts a single-object JSON-LD Event", async () => {
    const events = await schemaOrgAdapter.fetchEvents(source, async () => fixture);
    const herbstmarkt = events.find((e) => e.title === "Herbstmarkt Testort");
    expect(herbstmarkt).toBeDefined();
    expect(herbstmarkt?.location?.name).toBe("Rathausplatz");
    expect(herbstmarkt?.sourceUrl).toBe("https://example.test/herbstmarkt");
  });

  it("extracts events from a JSON-LD array and falls back to the source URL", async () => {
    const events = await schemaOrgAdapter.fetchEvents(source, async () => fixture);
    const konzert = events.find((e) => e.title === "Konzert in der Kirche");
    expect(konzert).toBeDefined();
    expect(konzert?.sourceUrl).toBe(source.url);
  });

  it("returns exactly two events for the fixture", async () => {
    const events = await schemaOrgAdapter.fetchEvents(source, async () => fixture);
    expect(events).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/adapters/schemaOrg.test.ts`
Expected: FAIL — `Cannot find module '../../src/adapters/schemaOrg'`

- [ ] **Step 4: Write `scraper/src/adapters/schemaOrg.ts`**

```ts
import * as cheerio from "cheerio";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

interface SchemaOrgEvent {
  "@type"?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  url?: string;
  location?: { name?: string; address?: string };
}

function isEvent(node: unknown): node is SchemaOrgEvent {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as SchemaOrgEvent)["@type"] === "Event"
  );
}

export const schemaOrgAdapter: EventAdapter = {
  type: "schema-org",

  async fetchEvents(source, fetchText) {
    const html = await fetchText(source.url);
    const $ = cheerio.load(html);
    const events: RawEvent[] = [];

    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (!isEvent(candidate) || !candidate.name || !candidate.startDate) continue;

        events.push({
          title: candidate.name,
          description: candidate.description || undefined,
          start: new Date(candidate.startDate).toISOString(),
          end: candidate.endDate ? new Date(candidate.endDate).toISOString() : undefined,
          location: candidate.location
            ? { name: candidate.location.name, address: candidate.location.address }
            : undefined,
          sourceUrl: candidate.url || source.url,
        });
      }
    });

    return events;
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/adapters/schemaOrg.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add scraper/src/adapters/schemaOrg.ts scraper/test/fixtures/schema-org.html scraper/test/adapters/schemaOrg.test.ts
git commit -m "Add Schema.org JSON-LD adapter"
```

---

### Task 9: Template-scraper adapter (the CMS-family scaling hub)

**Files:**
- Create: `scraper/src/adapters/templateScraper.ts`
- Create: `scraper/test/fixtures/template-scraper.html`
- Create: `scraper/config/templates/example-cms.json`
- Test: `scraper/test/adapters/templateScraper.test.ts`

**Interfaces:**
- Produces: `templateScraperAdapter: EventAdapter` (`type: "template-scraper"`); reads `source.adapterConfig.template` (a template config object with CSS selectors) either inline or via `source.adapterConfig` directly — no external file I/O inside the adapter (the orchestrator resolves the template file, see Task 13).
- Consumes: `EventAdapter`, `registry.ts`; `cheerio`

- [ ] **Step 1: Create the fixture `scraper/test/fixtures/template-scraper.html`**

```html
<!DOCTYPE html>
<html>
<body>
  <div class="event-list">
    <div class="event-item">
      <h3 class="event-title">Winzerfest Testhausen</h3>
      <span class="event-date">15.08.2026</span>
      <p class="event-description">Weinprobe und Livemusik.</p>
      <span class="event-location">Winzergenossenschaft</span>
      <a class="event-link" href="/veranstaltungen/winzerfest">Details</a>
    </div>
    <div class="event-item">
      <h3 class="event-title">Vereinsturnier SV Testhausen</h3>
      <span class="event-date">22.08.2026</span>
      <span class="event-location">Sportplatz</span>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 2: Create the template config `scraper/config/templates/example-cms.json`**

This is the config format a real CMS-family template (e.g. a future `hirsch-woelfl-v1.json`) would follow — CSS selectors only, no code.

```json
{
  "itemSelector": ".event-item",
  "titleSelector": ".event-title",
  "dateSelector": ".event-date",
  "dateFormat": "DD.MM.YYYY",
  "descriptionSelector": ".event-description",
  "locationSelector": ".event-location",
  "linkSelector": ".event-link",
  "linkAttr": "href"
}
```

- [ ] **Step 3: Write the failing test**

```ts
// scraper/test/adapters/templateScraper.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { templateScraperAdapter } from "../../src/adapters/templateScraper";
import type { Source } from "../../src/types";

const fixtureHtml = readFileSync(
  path.join(__dirname, "../fixtures/template-scraper.html"),
  "utf-8",
);
const templateConfig = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../config/templates/example-cms.json"),
    "utf-8",
  ),
);

const source: Source = {
  id: "test-template-source",
  name: "Test Template Source",
  url: "https://example.test/veranstaltungen",
  region: "test-region",
  adapterType: "template-scraper",
  adapterConfig: { template: templateConfig },
  legal: { basis: "public", robotsChecked: "2026-07-03" },
  active: true,
};

describe("templateScraperAdapter", () => {
  it("extracts events using the CSS selectors from adapterConfig.template", async () => {
    const events = await templateScraperAdapter.fetchEvents(source, async () => fixtureHtml);
    expect(events).toHaveLength(2);

    const [first] = events;
    expect(first.title).toBe("Winzerfest Testhausen");
    expect(first.description).toBe("Weinprobe und Livemusik.");
    expect(first.location?.name).toBe("Winzergenossenschaft");
    expect(first.start).toBe(new Date(2026, 7, 15).toISOString());
    expect(first.sourceUrl).toBe("https://example.test/veranstaltungen/winzerfest");
  });

  it("falls back to the source URL when no link is present", async () => {
    const events = await templateScraperAdapter.fetchEvents(source, async () => fixtureHtml);
    expect(events[1].sourceUrl).toBe(source.url);
    expect(events[1].description).toBeUndefined();
  });

  it("throws a clear error when adapterConfig.template is missing", async () => {
    const badSource = { ...source, adapterConfig: {} };
    await expect(
      templateScraperAdapter.fetchEvents(badSource, async () => fixtureHtml),
    ).rejects.toThrow("template-scraper requires adapterConfig.template");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/adapters/templateScraper.test.ts`
Expected: FAIL — `Cannot find module '../../src/adapters/templateScraper'`

- [ ] **Step 5: Write `scraper/src/adapters/templateScraper.ts`**

```ts
import * as cheerio from "cheerio";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

interface TemplateConfig {
  itemSelector: string;
  titleSelector: string;
  dateSelector: string;
  dateFormat: "DD.MM.YYYY";
  descriptionSelector?: string;
  locationSelector?: string;
  linkSelector?: string;
  linkAttr?: string;
}

function parseGermanDate(text: string): string {
  const match = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    throw new Error(`Cannot parse date "${text}" with format DD.MM.YYYY`);
  }
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toISOString();
}

function resolveUrl(base: string, href: string): string {
  return new URL(href, base).toString();
}

export const templateScraperAdapter: EventAdapter = {
  type: "template-scraper",

  async fetchEvents(source, fetchText) {
    const template = source.adapterConfig.template as TemplateConfig | undefined;
    if (!template) {
      throw new Error("template-scraper requires adapterConfig.template");
    }

    const html = await fetchText(source.url);
    const $ = cheerio.load(html);
    const events: RawEvent[] = [];

    $(template.itemSelector).each((_, el) => {
      const item = $(el);
      const title = item.find(template.titleSelector).first().text().trim();
      const dateText = item.find(template.dateSelector).first().text().trim();
      if (!title || !dateText) return;

      const description = template.descriptionSelector
        ? item.find(template.descriptionSelector).first().text().trim() || undefined
        : undefined;
      const locationName = template.locationSelector
        ? item.find(template.locationSelector).first().text().trim() || undefined
        : undefined;

      let sourceUrl = source.url;
      if (template.linkSelector) {
        const href = item.find(template.linkSelector).first().attr(template.linkAttr ?? "href");
        if (href) sourceUrl = resolveUrl(source.url, href);
      }

      events.push({
        title,
        description,
        start: parseGermanDate(dateText),
        location: locationName ? { name: locationName } : undefined,
        sourceUrl,
      });
    });

    return events;
  },
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/adapters/templateScraper.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add scraper/src/adapters/templateScraper.ts scraper/test/fixtures/template-scraper.html scraper/config/templates/example-cms.json scraper/test/adapters/templateScraper.test.ts
git commit -m "Add config-driven template-scraper adapter"
```

---

### Task 10: AI-generic adapter (Claude Haiku fallback)

**Files:**
- Create: `scraper/src/adapters/aiGeneric.ts`
- Test: `scraper/test/adapters/aiGeneric.test.ts`

**Interfaces:**
- Produces: `createAiGenericAdapter(client: AnthropicLike): EventAdapter` (`type: "ai-generic"`) — takes an injected Anthropic-shaped client so tests never call the real API; `aiGenericAdapter` (default export using the real `@anthropic-ai/sdk` client) for use by `run.ts`.
- Consumes: `EventAdapter`, `registry.ts`; `@anthropic-ai/sdk` types only (no network calls in tests)

- [ ] **Step 1: Write the failing test**

```ts
// scraper/test/adapters/aiGeneric.test.ts
import { describe, expect, it, vi } from "vitest";
import { createAiGenericAdapter, type AnthropicLike } from "../../src/adapters/aiGeneric";
import type { Source } from "../../src/types";

const source: Source = {
  id: "test-ai-source",
  name: "Test AI Source",
  url: "https://example.test/portal",
  region: "test-region",
  adapterType: "ai-generic",
  adapterConfig: {},
  legal: { basis: "public", robotsChecked: "2026-07-03" },
  active: true,
};

describe("aiGeneric adapter", () => {
  it("sends the HTML to the model and parses the structured JSON response", async () => {
    const fakeClient: AnthropicLike = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                events: [
                  {
                    title: "Herbstfest",
                    start: "2026-10-10T16:00:00.000Z",
                    description: "Ein Fest im Herbst",
                    location: { name: "Dorfplatz" },
                  },
                ],
              }),
            },
          ],
        }),
      },
    };

    const adapter = createAiGenericAdapter(fakeClient);
    const events = await adapter.fetchEvents(source, async () => "<html>...</html>");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Herbstfest");
    expect(events[0].sourceUrl).toBe(source.url);

    expect(fakeClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5" }),
    );
  });

  it("returns an empty array if the model response has no parseable JSON", async () => {
    const fakeClient: AnthropicLike = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "not json" }],
        }),
      },
    };

    const adapter = createAiGenericAdapter(fakeClient);
    const events = await adapter.fetchEvents(source, async () => "<html></html>");
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/adapters/aiGeneric.test.ts`
Expected: FAIL — `Cannot find module '../../src/adapters/aiGeneric'`

- [ ] **Step 3: Write `scraper/src/adapters/aiGeneric.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

export interface AnthropicLike {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: { role: "user"; content: string }[];
    }): Promise<{ content: { type: string; text?: string }[] }>;
  };
}

const EXTRACTION_PROMPT = `Du bekommst den HTML-Quelltext einer Veranstaltungsseite.
Extrahiere alle Events als JSON im folgenden Format, ohne zusätzlichen Text:
{"events": [{"title": string, "start": ISO-8601 string, "end"?: ISO-8601 string, "description"?: string, "location"?: {"name"?: string, "address"?: string}}]}
Wenn kein Datum eindeutig erkennbar ist, lass das Event weg. Antworte NUR mit dem JSON-Objekt.

HTML:
`;

function extractJson(text: string): { events: Partial<RawEvent>[] } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function createAiGenericAdapter(client: AnthropicLike): EventAdapter {
  return {
    type: "ai-generic",

    async fetchEvents(source, fetchText) {
      const html = await fetchText(source.url);
      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: EXTRACTION_PROMPT + html }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock?.text) return [];

      const parsed = extractJson(textBlock.text);
      if (!parsed?.events) return [];

      return parsed.events
        .filter((e): e is Partial<RawEvent> & { title: string; start: string } =>
          Boolean(e.title && e.start),
        )
        .map((e) => ({
          title: e.title,
          start: e.start,
          end: e.end,
          description: e.description,
          location: e.location,
          sourceUrl: source.url,
        }));
    },
  };
}

export const aiGenericAdapter = createAiGenericAdapter(new Anthropic());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/adapters/aiGeneric.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scraper/src/adapters/aiGeneric.ts scraper/test/adapters/aiGeneric.test.ts
git commit -m "Add ai-generic adapter using Claude Haiku 4.5"
```

---

### Task 11: Cross-source deduplication

**Files:**
- Create: `scraper/src/dedup.ts`
- Test: `scraper/test/dedup.test.ts`

**Interfaces:**
- Produces: `mergeEvents(entries: { rawEvent: RawEvent; sourceId: string; adapterType: AdapterType; region: string }[]): EventRecord[]`
- Consumes: `distanceMeters` from `geo.ts`; `dedupKey`, `normalizeCategory`, `computeEventId` from `normalize.ts`; `RawEvent`, `EventRecord`, `AdapterType` from `types.ts`

- [ ] **Step 1: Write the failing test**

```ts
// scraper/test/dedup.test.ts
import { describe, expect, it } from "vitest";
import { mergeEvents } from "../src/dedup";
import type { RawEvent } from "../src/types";

const now = "2026-07-03T12:00:00.000Z";

function entry(
  rawEvent: RawEvent,
  sourceId: string,
  adapterType: "ical" | "rss" | "schema-org" | "template-scraper" | "ai-generic" | "custom-scraper",
) {
  return { rawEvent, sourceId, adapterType, region: "test-region" };
}

describe("mergeEvents", () => {
  it("merges two events with the same normalized title and date into one record", () => {
    const a: RawEvent = {
      title: "Weinfest Ihringen",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://ihringen.de/1",
      location: { lat: 48.03, lon: 7.65 },
    };
    const b: RawEvent = {
      title: "weinfest ihringen!",
      start: "2026-08-15T09:00:00.000Z",
      sourceUrl: "https://naturgarten-kaiserstuhl.de/1",
      location: { lat: 48.0301, lon: 7.6501 },
    };

    const merged = mergeEvents([
      entry(a, "source-a", "ical"),
      entry(b, "source-b", "ai-generic"),
    ], now);

    expect(merged).toHaveLength(1);
    expect(merged[0].sourceIds.sort()).toEqual(["source-a", "source-b"]);
    // higher-priority adapter (ical) wins the canonical sourceUrl
    expect(merged[0].sourceUrl).toBe("https://ihringen.de/1");
  });

  it("keeps events with the same title+date but coordinates >500m apart separate", () => {
    const a: RawEvent = {
      title: "Sommerfest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://a.test/1",
      location: { lat: 48.03, lon: 7.65 },
    };
    const b: RawEvent = {
      title: "Sommerfest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://b.test/1",
      location: { lat: 48.15, lon: 7.9 }, // >10km away
    };

    const merged = mergeEvents([
      entry(a, "source-a", "ical"),
      entry(b, "source-b", "ical"),
    ], now);

    expect(merged).toHaveLength(2);
  });

  it("keeps events with different titles as separate records", () => {
    const a: RawEvent = {
      title: "Weinfest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://a.test/1",
    };
    const b: RawEvent = {
      title: "Dorffest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://b.test/1",
    };

    const merged = mergeEvents([entry(a, "source-a", "ical"), entry(b, "source-b", "ical")], now);
    expect(merged).toHaveLength(2);
  });

  it("sets lastSeenAt and defaults category to sonstiges", () => {
    const a: RawEvent = {
      title: "Konzert",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://a.test/1",
    };
    const merged = mergeEvents([entry(a, "source-a", "ical")], now);
    expect(merged[0].lastSeenAt).toBe(now);
    expect(merged[0].category).toBe("sonstiges");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/dedup.test.ts`
Expected: FAIL — `Cannot find module '../src/dedup'`

- [ ] **Step 3: Write `scraper/src/dedup.ts`**

```ts
import { distanceMeters } from "./geo";
import { computeEventId, dedupKey, normalizeCategory } from "./normalize";
import type { AdapterType, EventRecord, RawEvent } from "./types";

const ADAPTER_PRIORITY: AdapterType[] = [
  "ical",
  "rss",
  "schema-org",
  "template-scraper",
  "ai-generic",
  "custom-scraper",
];

function priorityRank(adapterType: AdapterType): number {
  const idx = ADAPTER_PRIORITY.indexOf(adapterType);
  return idx === -1 ? ADAPTER_PRIORITY.length : idx;
}

const MAX_MERGE_DISTANCE_METERS = 500;

export interface DedupEntry {
  rawEvent: RawEvent;
  sourceId: string;
  adapterType: AdapterType;
  region: string;
}

function canMerge(a: DedupEntry, b: DedupEntry): boolean {
  const locA = a.rawEvent.location;
  const locB = b.rawEvent.location;
  const hasCoordsA = typeof locA?.lat === "number" && typeof locA?.lon === "number";
  const hasCoordsB = typeof locB?.lat === "number" && typeof locB?.lon === "number";

  if (!hasCoordsA || !hasCoordsB) return true;

  const distance = distanceMeters(
    { lat: locA!.lat!, lon: locA!.lon! },
    { lat: locB!.lat!, lon: locB!.lon! },
  );
  return distance <= MAX_MERGE_DISTANCE_METERS;
}

export function mergeEvents(entries: DedupEntry[], nowIso: string): EventRecord[] {
  const buckets = new Map<string, DedupEntry[][]>();

  for (const entry of entries) {
    const key = dedupKey(entry.rawEvent.title, entry.rawEvent.start);
    const groups = buckets.get(key) ?? [];

    const matchingGroup = groups.find((group) => group.every((existing) => canMerge(existing, entry)));
    if (matchingGroup) {
      matchingGroup.push(entry);
    } else {
      groups.push([entry]);
    }

    buckets.set(key, groups);
  }

  const records: EventRecord[] = [];

  for (const groups of buckets.values()) {
    for (const group of groups) {
      const sorted = [...group].sort(
        (a, b) => priorityRank(a.adapterType) - priorityRank(b.adapterType),
      );
      const canonical = sorted[0];

      records.push({
        id: computeEventId(canonical.rawEvent, canonical.region),
        title: canonical.rawEvent.title,
        description: canonical.rawEvent.description,
        start: canonical.rawEvent.start,
        end: canonical.rawEvent.end,
        location: canonical.rawEvent.location ?? {},
        category: normalizeCategory(canonical.rawEvent.category),
        sourceIds: group.map((e) => e.sourceId),
        sourceUrl: canonical.rawEvent.sourceUrl,
        region: canonical.region,
        lastSeenAt: nowIso,
      });
    }
  }

  return records;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/dedup.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scraper/src/dedup.ts scraper/test/dedup.test.ts
git commit -m "Add cross-source deduplication with adapter-priority tiebreaker"
```

---

### Task 12: Source health monitoring

**Files:**
- Create: `scraper/src/health.ts`
- Test: `scraper/test/health.test.ts`

**Interfaces:**
- Produces: `updateHealth(previous: SourceHealth | undefined, sourceId: string, result: { success: boolean; eventCount: number }, nowIso: string): SourceHealth`
- Consumes: `SourceHealth`, `SourceHealthStatus` from `types.ts`

- [ ] **Step 1: Write the failing test**

```ts
// scraper/test/health.test.ts
import { describe, expect, it } from "vitest";
import { updateHealth } from "../src/health";

const now = "2026-07-03T12:00:00.000Z";

describe("updateHealth", () => {
  it("creates a fresh ok health record on first successful run", () => {
    const health = updateHealth(undefined, "source-a", { success: true, eventCount: 5 }, now);
    expect(health).toEqual({
      sourceId: "source-a",
      lastRunAt: now,
      lastSuccessAt: now,
      eventsFoundLastRun: 5,
      consecutiveFailures: 0,
      status: "ok",
    });
  });

  it("marks a source broken after 3 consecutive failures", () => {
    let health = updateHealth(undefined, "source-a", { success: false, eventCount: 0 }, now);
    expect(health.status).toBe("ok");
    health = updateHealth(health, "source-a", { success: false, eventCount: 0 }, now);
    expect(health.status).toBe("ok");
    health = updateHealth(health, "source-a", { success: false, eventCount: 0 }, now);
    expect(health.status).toBe("broken");
    expect(health.consecutiveFailures).toBe(3);
  });

  it("resets consecutiveFailures and returns to ok after a success", () => {
    let health = updateHealth(undefined, "source-a", { success: false, eventCount: 0 }, now);
    health = updateHealth(health, "source-a", { success: false, eventCount: 0 }, now);
    health = updateHealth(health, "source-a", { success: true, eventCount: 3 }, now);
    expect(health.status).toBe("ok");
    expect(health.consecutiveFailures).toBe(0);
    expect(health.eventsFoundLastRun).toBe(3);
  });

  it("marks degraded when a source that historically had events suddenly returns zero", () => {
    let health = updateHealth(undefined, "source-a", { success: true, eventCount: 4 }, now);
    health = updateHealth(health, "source-a", { success: true, eventCount: 0 }, now);
    expect(health.status).toBe("degraded");
    expect(health.consecutiveFailures).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/health.test.ts`
Expected: FAIL — `Cannot find module '../src/health'`

- [ ] **Step 3: Write `scraper/src/health.ts`**

```ts
import type { SourceHealth } from "./types";

const BROKEN_AFTER_FAILURES = 3;

export function updateHealth(
  previous: SourceHealth | undefined,
  sourceId: string,
  result: { success: boolean; eventCount: number },
  nowIso: string,
): SourceHealth {
  const consecutiveFailures = result.success ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
  const lastSuccessAt = result.success ? nowIso : previous?.lastSuccessAt;

  const hadEventsBefore = (previous?.eventsFoundLastRun ?? 0) > 0;
  const wentToZero = result.success && result.eventCount === 0 && hadEventsBefore;

  let status: SourceHealth["status"] = "ok";
  if (consecutiveFailures >= BROKEN_AFTER_FAILURES) {
    status = "broken";
  } else if (wentToZero) {
    status = "degraded";
  }

  return {
    sourceId,
    lastRunAt: nowIso,
    lastSuccessAt,
    eventsFoundLastRun: result.eventCount,
    consecutiveFailures,
    status,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/health.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scraper/src/health.ts scraper/test/health.test.ts
git commit -m "Add source health monitoring"
```

---

### Task 13: Orchestrator (`run.ts`) with fixture-based integration test

**Files:**
- Create: `scraper/src/run.ts`
- Create: `scraper/test/fixtures/run/region.json`
- Create: `scraper/test/fixtures/run/source-ical.json`
- Create: `scraper/test/fixtures/run/source-template.json`
- Create: `scraper/test/fixtures/run/template.json`
- Test: `scraper/test/run.test.ts`

**Interfaces:**
- Produces: `runScrape(options: { regionsDir: string; sourcesDir: string; templatesDir: string; outDir: string; fetchText: (url: string) => Promise<string>; now: () => string; }): Promise<{ events: EventRecord[]; health: SourceHealth[] }>` — writes `events.json` and `health.json` into `outDir` as a side effect and also returns the in-memory result (so the integration test can assert without re-reading disk, and so `main()` can log a summary)
- Consumes: everything from Tasks 2-12; registers all adapters into `adapterRegistry` at module load

- [ ] **Step 1: Create fixture `scraper/test/fixtures/run/region.json`**

```json
{
  "id": "test-region",
  "name": "Testregion",
  "center": { "lat": 48.03, "lon": 7.65 }
}
```

- [ ] **Step 2: Create fixture `scraper/test/fixtures/run/template.json`**

```json
{
  "itemSelector": ".event-item",
  "titleSelector": ".event-title",
  "dateSelector": ".event-date",
  "dateFormat": "DD.MM.YYYY",
  "descriptionSelector": ".event-description",
  "locationSelector": ".event-location"
}
```

- [ ] **Step 3: Create fixture `scraper/test/fixtures/run/source-ical.json`**

```json
{
  "id": "test-ical-source",
  "name": "Test iCal Source",
  "url": "fixture://ical",
  "region": "test-region",
  "adapterType": "ical",
  "adapterConfig": {},
  "legal": { "basis": "public", "robotsChecked": "2026-07-03" },
  "active": true
}
```

- [ ] **Step 4: Create fixture `scraper/test/fixtures/run/source-template.json`**

```json
{
  "id": "test-template-source",
  "name": "Test Template Source",
  "url": "fixture://template",
  "region": "test-region",
  "adapterType": "template-scraper",
  "adapterConfig": { "templateName": "template" },
  "legal": { "basis": "public", "robotsChecked": "2026-07-03" },
  "active": true
}
```

- [ ] **Step 5: Write the failing test**

```ts
// scraper/test/run.test.ts
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runScrape } from "../src/run";

const fixturesDir = path.join(__dirname, "fixtures/run");
const icalFixture = readFileSync(path.join(__dirname, "fixtures/sample.ics"), "utf-8");
const templateHtmlFixture = readFileSync(
  path.join(__dirname, "fixtures/template-scraper.html"),
  "utf-8",
);

function fakeFetchText(url: string): Promise<string> {
  if (url === "fixture://ical") return Promise.resolve(icalFixture);
  if (url === "fixture://template") return Promise.resolve(templateHtmlFixture);
  throw new Error(`Unexpected fixture URL: ${url}`);
}

describe("runScrape", () => {
  it("loads config, runs adapters, dedupes, and writes events.json + health.json", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "scrape-out-"));

    try {
      const result = await runScrape({
        regionsDir: fixturesDir,
        sourcesDir: fixturesDir,
        templatesDir: fixturesDir,
        outDir,
        fetchText: fakeFetchText,
        now: () => "2026-07-03T12:00:00.000Z",
      });

      // sample.ics has 2 events, template-scraper.html has 2 events, none collide
      expect(result.events).toHaveLength(4);
      expect(result.health).toHaveLength(2);
      expect(result.health.every((h) => h.status === "ok")).toBe(true);

      const writtenEvents = JSON.parse(
        readFileSync(path.join(outDir, "events.json"), "utf-8"),
      );
      const writtenHealth = JSON.parse(
        readFileSync(path.join(outDir, "health.json"), "utf-8"),
      );
      expect(writtenEvents).toHaveLength(4);
      expect(writtenHealth).toHaveLength(2);
      expect(writtenEvents[0].region).toBe("test-region");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("records a broken source instead of crashing the whole run", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "scrape-out-"));

    try {
      const failingFetch = () => Promise.reject(new Error("network down"));
      const result = await runScrape({
        regionsDir: fixturesDir,
        sourcesDir: fixturesDir,
        templatesDir: fixturesDir,
        outDir,
        fetchText: failingFetch,
        now: () => "2026-07-03T12:00:00.000Z",
      });

      expect(result.events).toHaveLength(0);
      expect(result.health).toHaveLength(2);
      expect(result.health.every((h) => h.consecutiveFailures === 1)).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("accumulates consecutiveFailures across multiple runs by reading the previous health.json", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "scrape-out-"));
    const failingFetch = () => Promise.reject(new Error("network down"));

    try {
      let result;
      for (let i = 0; i < 3; i++) {
        result = await runScrape({
          regionsDir: fixturesDir,
          sourcesDir: fixturesDir,
          templatesDir: fixturesDir,
          outDir,
          fetchText: failingFetch,
          now: () => "2026-07-03T12:00:00.000Z",
        });
      }

      expect(result!.health.every((h) => h.consecutiveFailures === 3)).toBe(true);
      expect(result!.health.every((h) => h.status === "broken")).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/run.test.ts`
Expected: FAIL — `Cannot find module '../src/run'`

- [ ] **Step 7: Write `scraper/src/run.ts`**

```ts
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { icalAdapter } from "./adapters/ical";
import { rssAdapter } from "./adapters/rss";
import { schemaOrgAdapter } from "./adapters/schemaOrg";
import { templateScraperAdapter } from "./adapters/templateScraper";
import { aiGenericAdapter } from "./adapters/aiGeneric";
import { getAdapter, registerAdapter } from "./adapters/registry";
import { type DedupEntry, mergeEvents } from "./dedup";
import { updateHealth } from "./health";
import type { EventRecord, Region, Source, SourceHealth } from "./types";

registerAdapter(icalAdapter);
registerAdapter(rssAdapter);
registerAdapter(schemaOrgAdapter);
registerAdapter(templateScraperAdapter);
registerAdapter(aiGenericAdapter);

function readJsonFiles<T>(dir: string): T[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as T);
}

export interface RunScrapeOptions {
  regionsDir: string;
  sourcesDir: string;
  templatesDir: string;
  outDir: string;
  fetchText: (url: string) => Promise<string>;
  now: () => string;
}

export interface RunScrapeResult {
  events: EventRecord[];
  health: SourceHealth[];
}

function readPreviousHealth(outDir: string): Map<string, SourceHealth> {
  const healthPath = path.join(outDir, "health.json");
  try {
    const parsed = JSON.parse(readFileSync(healthPath, "utf-8")) as SourceHealth[];
    return new Map(parsed.map((h) => [h.sourceId, h]));
  } catch {
    return new Map();
  }
}

export async function runScrape(options: RunScrapeOptions): Promise<RunScrapeResult> {
  const nowIso = options.now();

  const regions = readJsonFiles<Region>(options.regionsDir);
  if (regions.length === 0) {
    throw new Error(`No region config found in ${options.regionsDir}`);
  }

  const allFiles = readJsonFiles<Source>(options.sourcesDir);
  const sources = allFiles.filter((s) => s.active);
  const previousHealth = readPreviousHealth(options.outDir);

  const dedupEntries: DedupEntry[] = [];
  const health: SourceHealth[] = [];

  for (const source of sources) {
    let resolvedSource = source;

    const templateName = source.adapterConfig.templateName as string | undefined;
    if (source.adapterType === "template-scraper" && templateName) {
      const templatePath = path.join(options.templatesDir, `${templateName}.json`);
      const template = JSON.parse(readFileSync(templatePath, "utf-8"));
      resolvedSource = { ...source, adapterConfig: { ...source.adapterConfig, template } };
    }

    const previous = previousHealth.get(source.id);

    try {
      const adapter = getAdapter(source.adapterType);
      const rawEvents = await adapter.fetchEvents(resolvedSource, options.fetchText);

      for (const rawEvent of rawEvents) {
        dedupEntries.push({
          rawEvent,
          sourceId: source.id,
          adapterType: source.adapterType,
          region: source.region,
        });
      }

      health.push(updateHealth(previous, source.id, { success: true, eventCount: rawEvents.length }, nowIso));
    } catch {
      health.push(updateHealth(previous, source.id, { success: false, eventCount: 0 }, nowIso));
    }
  }

  const events = mergeEvents(dedupEntries, nowIso);

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(path.join(options.outDir, "events.json"), JSON.stringify(events, null, 2));
  writeFileSync(path.join(options.outDir, "health.json"), JSON.stringify(health, null, 2));

  return { events, health };
}

async function main() {
  const root = path.join(import.meta.dirname, "..");
  const result = await runScrape({
    regionsDir: path.join(root, "config/regions"),
    sourcesDir: path.join(root, "config/sources"),
    templatesDir: path.join(root, "config/templates"),
    outDir: path.join(root, "..", "data"),
    fetchText: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed for ${url}: ${res.status}`);
      return res.text();
    },
    now: () => new Date().toISOString(),
  });
  console.log(`Wrote ${result.events.length} events, ${result.health.length} health records.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/run.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Run the full test suite**

Run: `cd scraper && npm test`
Expected: PASS — all tests across all tasks green.

- [ ] **Step 10: Commit**

```bash
git add scraper/src/run.ts scraper/test/run.test.ts scraper/test/fixtures/run
git commit -m "Add scraper orchestrator wiring adapters, dedup, and health together"
```

---

### Task 14: GitHub Actions cron + real config skeleton

**Files:**
- Create: `.github/workflows/scrape.yml`
- Create: `scraper/config/regions/.gitkeep`
- Create: `scraper/config/sources/.gitkeep`
- Create: `scraper/config/templates/.gitkeep`
- Create: `data/.gitkeep`

**Interfaces:**
- Produces: a scheduled workflow that installs dependencies, runs `npm run scrape` in `/scraper`, and commits any changes to `/data` back to the repository.
- Consumes: `scraper/src/run.ts`'s `main()` entry point (Task 13)

- [ ] **Step 1: Create placeholder config directories**

```bash
mkdir -p "scraper/config/regions" "scraper/config/sources" "scraper/config/templates" "data"
touch "scraper/config/regions/.gitkeep" "scraper/config/sources/.gitkeep" "scraper/config/templates/.gitkeep" "data/.gitkeep"
```

- [ ] **Step 2: Write `.github/workflows/scrape.yml`**

```yaml
name: Scrape events

on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: scraper/package-lock.json

      - name: Install dependencies
        working-directory: scraper
        run: npm ci

      - name: Run scraper
        working-directory: scraper
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: npm run scrape

      - name: Run tests
        working-directory: scraper
        run: npm test

      - name: Commit updated data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/events.json data/health.json
          git diff --cached --quiet || git commit -m "Update scraped events [skip ci]"
          git push
```

- [ ] **Step 3: Verify the workflow YAML is well-formed**

Run: `cd "C:\Users\Lucas\Desktop\app" && npx -y js-yaml .github/workflows/scrape.yml`
Expected: prints the parsed YAML structure back out with no error (js-yaml is used only as an ad-hoc linter here, not added as a project dependency).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/scrape.yml scraper/config/regions/.gitkeep scraper/config/sources/.gitkeep scraper/config/templates/.gitkeep data/.gitkeep
git commit -m "Add GitHub Actions cron for the scraper"
```

---

## After this plan

Config directories are intentionally empty except `.gitkeep`. Per the design doc's open items, populating real Kaiserstuhl-region sources requires:
1. Fetching live HTML from Vogtsburg, Ihringen, Eichstetten, Emmendingen, etc. and deriving verified CSS-selector templates for the Hirsch & Wölfl and Komm.ONE CMS families (structural HTML diff across 2-3 real sites per family before trusting one template for all of them).
2. Checking each source's robots.txt before adding it as a `Source` config entry.
3. Adding `ANTHROPIC_API_KEY` as a GitHub Actions secret before any `ai-generic` source goes live.

This is deliberately out of scope for this plan (it needs live network access and can't be driven by TDD against fixtures) — treat it as the first follow-up plan once this one is merged.

`custom-scraper` is registered as an `AdapterType` in `types.ts` but has no generic adapter implementation — by design (per the spec, it's a last resort, one bespoke file per source). Add a source-specific file under `scraper/src/adapters/custom/` and `registerAdapter(...)` it only when a real source needs it.
