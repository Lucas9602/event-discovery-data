# Mobile App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a geocoding stage to the scraper so nearly every event has coordinates, publish `/data` via GitHub Pages, and build a React Native (Expo) mobile app that reads that data and lets users filter events by radius and date — no accounts, no backend.

**Architecture:** Two independent pieces that only meet at a JSON contract (`events.json`'s `EventRecord[]` shape). (1) `scraper/src/geocode.ts` adds a cached, rate-limited Nominatim lookup, wired into the existing scraper orchestrator (`scraper/src/run.ts`) right before deduplication. (2) A new standalone Expo app under `/app` fetches `events.json` from GitHub Pages, caches it locally for offline use, and filters it entirely client-side with pure functions mirroring the scraper's own tested utilities (`distanceMeters`, date comparisons).

**Tech Stack:** Scraper side unchanged (TypeScript, Vitest, injectable fetch). Mobile app: React Native via Expo, TypeScript, `expo-location`, `@react-native-async-storage/async-storage`, Jest + `jest-expo` (Expo's standard test runner — Vitest is not used here because Metro/React Native's module system isn't Vitest-compatible; this is a deliberate, scoped deviation from the scraper's Vitest convention). EAS (Expo Application Services) for iOS/Android store builds.

## Global Constraints

- No live network calls in any test — every adapter/fetch/sleep dependency is injected, per the existing scraper convention.
- `/app` is a separate npm package from `/scraper` (no shared workspace tooling exists yet) — the small pieces it needs from the scraper (`distanceMeters`, the `EventRecord`/`EventLocation` shape) are intentionally duplicated as tiny, stable, pure files rather than pulling in cross-package build tooling. Note this as YAGNI, not an oversight.
- Geocoding uses Nominatim (OpenStreetMap), free tier: max 1 request/second, and requests must carry an identifying `User-Agent` header (Nominatim usage policy) — the production fetch implementation sets `User-Agent: kaiserstuhl-event-scraper/0.1 (lucas_haas@web.de)`.
- **Dependency on the in-progress scraper-core plan:** Tasks 15-16 below (wiring geocoding into `run.ts`, adding a GitHub Pages publish step to `scrape.yml`) modify files created by `docs/superpowers/plans/2026-07-03-scraper-core.md` Tasks 13-14, which are not yet implemented (that plan is at Task 5/13 as of this writing). Tasks 1-14 in this plan have no such dependency and can run immediately. Tasks 15-16 must wait until scraper-core Tasks 6-14 are done; each carries an explicit precondition check.
- App working name: **"Lokalfeste"**, bundle identifier `com.lokalfeste.app` — easily renamed later in `app.json`/`eas.json` before an actual store submission, not a placeholder in the sense of unfinished work.

---

## Part A — Scraper: Geocoding

### Task 1: Geocoding core (`geocode.ts`) — address lookup with cache

**Files:**
- Create: `scraper/src/geocode.ts`
- Test: `scraper/test/geocode.test.ts`

**Interfaces:**
- Produces: `GeocodeCache = Record<string, { lat: number; lon: number } | null>`, `geocodeAddress(address: string, fetchText: (url: string) => Promise<string>): Promise<{lat: number; lon: number} | null>`, `geocodeWithCache(address: string, cache: GeocodeCache, fetchText: (url: string) => Promise<string>, sleep: (ms: number) => Promise<void>): Promise<{lat: number; lon: number} | null>`
- Consumes: `normalizeTitle` from `./normalize` (reused as the cache key normalizer)
- Consumed later by: Task 2 (cache file I/O), Task 15 (`run.ts` wiring)

- [ ] **Step 1: Write the failing test**

```ts
// scraper/test/geocode.test.ts
import { describe, expect, it, vi } from "vitest";
import { geocodeAddress, geocodeWithCache, type GeocodeCache } from "../src/geocode";

const NOMINATIM_RESPONSE = JSON.stringify([{ lat: "48.0301", lon: "7.6501" }]);
const EMPTY_RESPONSE = JSON.stringify([]);

describe("geocodeAddress", () => {
  it("parses lat/lon from a Nominatim-style JSON response", async () => {
    const fetchText = vi.fn().mockResolvedValue(NOMINATIM_RESPONSE);
    const result = await geocodeAddress("Marktplatz Ihringen", fetchText);
    expect(result).toEqual({ lat: 48.0301, lon: 7.6501 });
    expect(fetchText).toHaveBeenCalledWith(
      expect.stringContaining("nominatim.openstreetmap.org/search"),
    );
  });

  it("returns null when there are no results", async () => {
    const fetchText = vi.fn().mockResolvedValue(EMPTY_RESPONSE);
    const result = await geocodeAddress("Nonexistent Place XYZ", fetchText);
    expect(result).toBeNull();
  });
});

describe("geocodeWithCache", () => {
  it("returns a cached value without calling fetchText or sleep", async () => {
    const cache: GeocodeCache = { "marktplatz ihringen": { lat: 48.03, lon: 7.65 } };
    const fetchText = vi.fn();
    const sleep = vi.fn();

    const result = await geocodeWithCache("Marktplatz Ihringen", cache, fetchText, sleep);

    expect(result).toEqual({ lat: 48.03, lon: 7.65 });
    expect(fetchText).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("on cache miss, calls fetchText, sleeps, and stores the result in the cache", async () => {
    const cache: GeocodeCache = {};
    const fetchText = vi.fn().mockResolvedValue(NOMINATIM_RESPONSE);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await geocodeWithCache("Marktplatz Ihringen", cache, fetchText, sleep);

    expect(result).toEqual({ lat: 48.0301, lon: 7.6501 });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1100);
    expect(cache["marktplatz ihringen"]).toEqual({ lat: 48.0301, lon: 7.6501 });
  });

  it("caches a null result too, so a second call for the same address does not re-fetch", async () => {
    const cache: GeocodeCache = {};
    const fetchText = vi.fn().mockResolvedValue(EMPTY_RESPONSE);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await geocodeWithCache("Unknown Place", cache, fetchText, sleep);
    const second = await geocodeWithCache("Unknown Place", cache, fetchText, sleep);

    expect(second).toBeNull();
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(cache["unknown place"]).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/geocode.test.ts`
Expected: FAIL — `Cannot find module '../src/geocode'`

- [ ] **Step 3: Write `scraper/src/geocode.ts`**

```ts
import { normalizeTitle } from "./normalize";

export type GeocodeCache = Record<string, { lat: number; lon: number } | null>;

const NOMINATIM_DELAY_MS = 1100;

export async function geocodeAddress(
  address: string,
  fetchText: (url: string) => Promise<string>,
): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const text = await fetchText(url);
  const results = JSON.parse(text) as { lat: string; lon: string }[];

  if (results.length === 0) return null;

  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
}

export async function geocodeWithCache(
  address: string,
  cache: GeocodeCache,
  fetchText: (url: string) => Promise<string>,
  sleep: (ms: number) => Promise<void>,
): Promise<{ lat: number; lon: number } | null> {
  const key = normalizeTitle(address);

  if (key in cache) {
    return cache[key];
  }

  const result = await geocodeAddress(address, fetchText);
  await sleep(NOMINATIM_DELAY_MS);
  cache[key] = result;
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/geocode.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scraper/src/geocode.ts scraper/test/geocode.test.ts
git commit -m "Add cached, rate-limited Nominatim geocoding"
```

---

### Task 2: Geocode cache file I/O and raw-event enrichment

**Files:**
- Modify: `scraper/src/geocode.ts`
- Test: `scraper/test/geocode.test.ts`

**Interfaces:**
- Produces: `loadGeocodeCache(cachePath: string): GeocodeCache`, `saveGeocodeCache(cachePath: string, cache: GeocodeCache): void`, `geocodeRawEvent(rawEvent: RawEvent, cache: GeocodeCache, fetchText: (url: string) => Promise<string>, sleep: (ms: number) => Promise<void>): Promise<RawEvent>`
- Consumes: `RawEvent` from `./types`; `geocodeWithCache` from Task 1
- Consumed later by: Task 15 (`run.ts` wiring)

- [ ] **Step 1: Write the failing test**

```ts
// append to scraper/test/geocode.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  geocodeRawEvent,
  loadGeocodeCache,
  saveGeocodeCache,
} from "../src/geocode";
import type { RawEvent } from "../src/types";

describe("loadGeocodeCache / saveGeocodeCache", () => {
  it("returns an empty cache when the file does not exist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "geocode-cache-"));
    try {
      const cache = loadGeocodeCache(path.join(dir, "geocode-cache.json"));
      expect(cache).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips a cache through save and load", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "geocode-cache-"));
    try {
      const cachePath = path.join(dir, "geocode-cache.json");
      const cache = { "marktplatz ihringen": { lat: 48.03, lon: 7.65 } };
      saveGeocodeCache(cachePath, cache);
      expect(loadGeocodeCache(cachePath)).toEqual(cache);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("geocodeRawEvent", () => {
  it("leaves an event with existing coordinates untouched", async () => {
    const event: RawEvent = {
      title: "Weinfest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://example.test/1",
      location: { name: "Marktplatz", lat: 48.03, lon: 7.65 },
    };
    const fetchText = vi.fn();
    const result = await geocodeRawEvent(event, {}, fetchText, vi.fn());
    expect(result).toEqual(event);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("geocodes an event whose location has a name but no coordinates", async () => {
    const event: RawEvent = {
      title: "Weinfest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://example.test/1",
      location: { name: "Marktplatz Ihringen" },
    };
    const fetchText = vi.fn().mockResolvedValue(NOMINATIM_RESPONSE);
    const result = await geocodeRawEvent(event, {}, fetchText, vi.fn().mockResolvedValue(undefined));
    expect(result.location).toEqual({ name: "Marktplatz Ihringen", lat: 48.0301, lon: 7.6501 });
  });

  it("returns the event unchanged when there is no location to geocode", async () => {
    const event: RawEvent = {
      title: "Weinfest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://example.test/1",
    };
    const result = await geocodeRawEvent(event, {}, vi.fn(), vi.fn());
    expect(result).toEqual(event);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/geocode.test.ts`
Expected: FAIL — `loadGeocodeCache`/`saveGeocodeCache`/`geocodeRawEvent` not exported

- [ ] **Step 3: Add to `scraper/src/geocode.ts`**

```ts
import { readFileSync, writeFileSync } from "node:fs";
import type { RawEvent } from "./types";

export function loadGeocodeCache(cachePath: string): GeocodeCache {
  try {
    return JSON.parse(readFileSync(cachePath, "utf-8")) as GeocodeCache;
  } catch {
    return {};
  }
}

export function saveGeocodeCache(cachePath: string, cache: GeocodeCache): void {
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export async function geocodeRawEvent(
  rawEvent: RawEvent,
  cache: GeocodeCache,
  fetchText: (url: string) => Promise<string>,
  sleep: (ms: number) => Promise<void>,
): Promise<RawEvent> {
  const location = rawEvent.location;
  const hasCoords = typeof location?.lat === "number" && typeof location?.lon === "number";
  const addressText = location?.name || location?.address;

  if (hasCoords || !addressText) {
    return rawEvent;
  }

  const coords = await geocodeWithCache(addressText, cache, fetchText, sleep);
  if (!coords) return rawEvent;

  return { ...rawEvent, location: { ...location, ...coords } };
}
```

Add the `readFileSync, writeFileSync` import and `RawEvent` type import to the top of the file alongside the existing `normalizeTitle` import.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/geocode.test.ts`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add scraper/src/geocode.ts scraper/test/geocode.test.ts
git commit -m "Add geocode cache persistence and raw-event enrichment"
```

---

## Part B — Mobile App Scaffold

### Task 3: Scaffold the Expo app

**Files:**
- Create: `app/package.json`
- Create: `app/app.json`
- Create: `app/tsconfig.json`
- Create: `app/babel.config.js`
- Create: `app/App.tsx`
- Create: `app/.gitignore`

**Interfaces:**
- Produces: a runnable Expo TypeScript project at `/app` with `npm test` (Jest) and `npm start` (Expo dev server) scripts.

- [ ] **Step 1: Scaffold via Expo CLI**

Run: `npx create-expo-app@latest app --template blank-typescript`
Expected: `/app` directory created with a default Expo TypeScript project.

- [ ] **Step 2: Install additional dependencies**

Run:
```bash
cd app
npx expo install expo-location @react-native-async-storage/async-storage
npm install --save-dev jest-expo @testing-library/react-native
```

- [ ] **Step 3: Edit `app/package.json`** — add a `test` script

```json
{
  "scripts": {
    "test": "jest"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

Merge this into the generated `package.json` (Expo's scaffold already includes `start`, `android`, `ios`, `web` scripts — keep those, add `test` and the `jest` block alongside them).

- [ ] **Step 4: Set app identity in `app.json`**

Edit the generated `app.json`'s `expo` object:

```json
{
  "expo": {
    "name": "Lokalfeste",
    "slug": "lokalfeste",
    "ios": { "bundleIdentifier": "com.lokalfeste.app" },
    "android": { "package": "com.lokalfeste.app" }
  }
}
```

- [ ] **Step 5: Verify the scaffold runs**

Run: `cd app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/
git commit -m "Scaffold Expo mobile app (TypeScript, Jest)"
```

---

### Task 4: Duplicate `distanceMeters` for the app

**Files:**
- Create: `app/src/lib/geo.ts`
- Test: `app/__tests__/geo.test.ts`

**Interfaces:**
- Produces: `distanceMeters(a: {lat:number; lon:number}, b: {lat:number; lon:number}): number` — identical implementation and contract to `scraper/src/geo.ts`, duplicated per the Global Constraints note (no shared workspace tooling yet).
- Consumed later by: Task 6 (`filterEvents.ts`)

- [ ] **Step 1: Write the failing test**

```ts
// app/__tests__/geo.test.ts
import { distanceMeters } from "../src/lib/geo";

describe("distanceMeters", () => {
  it("returns ~0 for identical coordinates", () => {
    const p = { lat: 48.0836, lon: 7.6572 };
    expect(distanceMeters(p, p)).toBeLessThan(1);
  });

  it("returns the correct order of magnitude for a known distance", () => {
    const freiburg = { lat: 47.999, lon: 7.8421 };
    const emmendingen = { lat: 48.1206, lon: 7.8497 };
    const d = distanceMeters(freiburg, emmendingen);
    expect(d).toBeGreaterThan(12000);
    expect(d).toBeLessThan(15000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest geo.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/geo'`

- [ ] **Step 3: Write `app/src/lib/geo.ts`**

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

Run: `cd app && npx jest geo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/geo.ts app/__tests__/geo.test.ts
git commit -m "Add distanceMeters to the mobile app"
```

---

### Task 5: Event types for the app

**Files:**
- Create: `app/src/lib/types.ts`

**Interfaces:**
- Produces: `EventLocation`, `EventRecord` — the subset of `scraper/src/types.ts`'s shape the app actually reads. Duplicated by design (see Global Constraints).
- Consumed later by: Tasks 6, 7, 9-11

- [ ] **Step 1: Write `app/src/lib/types.ts`**

```ts
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
  category: string;
  sourceIds: string[];
  sourceUrl: string;
  region: string;
  lastSeenAt: string;
}
```

- [ ] **Step 2: Type-check**

Run: `cd app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/types.ts
git commit -m "Add EventRecord types to the mobile app"
```

---

### Task 6: `filterEvents` — radius and date-range filtering

**Files:**
- Create: `app/src/lib/filterEvents.ts`
- Test: `app/__tests__/filterEvents.test.ts`

**Interfaces:**
- Produces: `interface EventFilters { origin?: {lat: number; lon: number}; radiusMeters?: number; dateFrom?: string; dateTo?: string; }`, `filterEvents(events: EventRecord[], filters: EventFilters): EventRecord[]`
- Consumes: `distanceMeters` from `./geo`, `EventRecord` from `./types`

- [ ] **Step 1: Write the failing test**

```ts
// app/__tests__/filterEvents.test.ts
import { filterEvents } from "../src/lib/filterEvents";
import type { EventRecord } from "../src/lib/types";

function makeEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: "1",
    title: "Test Event",
    start: "2026-08-15T18:00:00.000Z",
    location: {},
    category: "sonstiges",
    sourceIds: ["a"],
    sourceUrl: "https://example.test/1",
    region: "test-region",
    lastSeenAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterEvents", () => {
  it("returns all events when no filters are set", () => {
    const events = [makeEvent({ id: "1" }), makeEvent({ id: "2" })];
    expect(filterEvents(events, {})).toHaveLength(2);
  });

  it("filters out events outside the given radius", () => {
    const near = makeEvent({ id: "near", location: { lat: 48.03, lon: 7.65 } });
    const far = makeEvent({ id: "far", location: { lat: 52.52, lon: 13.405 } }); // Berlin

    const result = filterEvents([near, far], {
      origin: { lat: 48.0301, lon: 7.6501 },
      radiusMeters: 5000,
    });

    expect(result.map((e) => e.id)).toEqual(["near"]);
  });

  it("excludes events without coordinates when a radius filter is active", () => {
    const noCoords = makeEvent({ id: "no-coords", location: { name: "Irgendwo" } });
    const withCoords = makeEvent({ id: "with-coords", location: { lat: 48.03, lon: 7.65 } });

    const result = filterEvents([noCoords, withCoords], {
      origin: { lat: 48.0301, lon: 7.6501 },
      radiusMeters: 5000,
    });

    expect(result.map((e) => e.id)).toEqual(["with-coords"]);
  });

  it("keeps events without coordinates when no radius filter is active", () => {
    const noCoords = makeEvent({ id: "no-coords", location: { name: "Irgendwo" } });
    expect(filterEvents([noCoords], {})).toHaveLength(1);
  });

  it("filters by date range", () => {
    const early = makeEvent({ id: "early", start: "2026-08-01T10:00:00.000Z" });
    const late = makeEvent({ id: "late", start: "2026-09-15T10:00:00.000Z" });

    const result = filterEvents([early, late], {
      dateFrom: "2026-08-10T00:00:00.000Z",
      dateTo: "2026-09-01T00:00:00.000Z",
    });

    expect(result).toHaveLength(0);
  });

  it("includes an event exactly on the dateFrom boundary", () => {
    const event = makeEvent({ id: "boundary", start: "2026-08-15T18:00:00.000Z" });
    const result = filterEvents([event], { dateFrom: "2026-08-15T18:00:00.000Z" });
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest filterEvents.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/filterEvents'`

- [ ] **Step 3: Write `app/src/lib/filterEvents.ts`**

```ts
import { distanceMeters } from "./geo";
import type { EventRecord } from "./types";

export interface EventFilters {
  origin?: { lat: number; lon: number };
  radiusMeters?: number;
  dateFrom?: string;
  dateTo?: string;
}

function hasCoords(event: EventRecord): boolean {
  return typeof event.location.lat === "number" && typeof event.location.lon === "number";
}

export function filterEvents(events: EventRecord[], filters: EventFilters): EventRecord[] {
  return events.filter((event) => {
    if (filters.origin && filters.radiusMeters !== undefined) {
      if (!hasCoords(event)) return false;
      const distance = distanceMeters(filters.origin, {
        lat: event.location.lat!,
        lon: event.location.lon!,
      });
      if (distance > filters.radiusMeters) return false;
    }

    if (filters.dateFrom && event.start < filters.dateFrom) return false;
    if (filters.dateTo && event.start > filters.dateTo) return false;

    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest filterEvents.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/filterEvents.ts app/__tests__/filterEvents.test.ts
git commit -m "Add radius and date-range event filtering"
```

---

### Task 7: `getEvents` — fetch with offline cache fallback

**Files:**
- Create: `app/src/lib/getEvents.ts`
- Test: `app/__tests__/getEvents.test.ts`

**Interfaces:**
- Produces: `interface EventStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; }`, `getEvents(fetchText: (url: string) => Promise<string>, storage: EventStorage, url: string): Promise<EventRecord[]>`
- Consumes: `EventRecord` from `./types`
- Consumed later by: Task 11 (`EventListScreen`)

- [ ] **Step 1: Write the failing test**

```ts
// app/__tests__/getEvents.test.ts
import { getEvents, type EventStorage } from "../src/lib/getEvents";

const SAMPLE_EVENTS = JSON.stringify([
  { id: "1", title: "Weinfest", start: "2026-08-15T18:00:00.000Z", location: {}, category: "weinfest", sourceIds: ["a"], sourceUrl: "https://x.test/1", region: "r", lastSeenAt: "2026-07-09T00:00:00.000Z" },
]);

function makeStorage(initial: Record<string, string> = {}): EventStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
  };
}

describe("getEvents", () => {
  it("fetches events and caches them in storage", async () => {
    const fetchText = jest.fn().mockResolvedValue(SAMPLE_EVENTS);
    const storage = makeStorage();

    const events = await getEvents(fetchText, storage, "https://example.test/events.json");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Weinfest");
    expect(await storage.getItem("events-cache-v1")).toBe(SAMPLE_EVENTS);
  });

  it("falls back to the cached copy when the fetch fails", async () => {
    const fetchText = jest.fn().mockRejectedValue(new Error("offline"));
    const storage = makeStorage({ "events-cache-v1": SAMPLE_EVENTS });

    const events = await getEvents(fetchText, storage, "https://example.test/events.json");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Weinfest");
  });

  it("returns an empty array when the fetch fails and there is no cache", async () => {
    const fetchText = jest.fn().mockRejectedValue(new Error("offline"));
    const storage = makeStorage();

    const events = await getEvents(fetchText, storage, "https://example.test/events.json");

    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest getEvents.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/getEvents'`

- [ ] **Step 3: Write `app/src/lib/getEvents.ts`**

```ts
import type { EventRecord } from "./types";

const CACHE_KEY = "events-cache-v1";

export interface EventStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export async function getEvents(
  fetchText: (url: string) => Promise<string>,
  storage: EventStorage,
  url: string,
): Promise<EventRecord[]> {
  try {
    const text = await fetchText(url);
    await storage.setItem(CACHE_KEY, text);
    return JSON.parse(text) as EventRecord[];
  } catch {
    const cached = await storage.getItem(CACHE_KEY);
    if (!cached) return [];
    return JSON.parse(cached) as EventRecord[];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest getEvents.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/getEvents.ts app/__tests__/getEvents.test.ts
git commit -m "Add getEvents with offline cache fallback"
```

---

### Task 8: `EventCard` component

**Files:**
- Create: `app/src/components/EventCard.tsx`
- Test: `app/__tests__/EventCard.test.tsx`

**Interfaces:**
- Produces: `EventCard({ event }: { event: EventRecord }): JSX.Element` — renders title, formatted date, location name, category, and a link to `event.sourceUrl`.
- Consumes: `EventRecord` from `../lib/types`

- [ ] **Step 1: Write the failing test**

```tsx
// app/__tests__/EventCard.test.tsx
import { render, screen } from "@testing-library/react-native";
import { EventCard } from "../src/components/EventCard";
import type { EventRecord } from "../src/lib/types";

const event: EventRecord = {
  id: "1",
  title: "Winzerfest Ihringen",
  start: "2026-08-15T18:00:00.000Z",
  location: { name: "Marktplatz" },
  category: "weinfest",
  sourceIds: ["a"],
  sourceUrl: "https://example.test/1",
  region: "test-region",
  lastSeenAt: "2026-07-09T00:00:00.000Z",
};

describe("EventCard", () => {
  it("renders the event title and location name", () => {
    render(<EventCard event={event} />);
    expect(screen.getByText("Winzerfest Ihringen")).toBeTruthy();
    expect(screen.getByText("Marktplatz")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest EventCard.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/EventCard'`

- [ ] **Step 3: Write `app/src/components/EventCard.tsx`**

```tsx
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { EventRecord } from "../lib/types";

export function EventCard({ event }: { event: EventRecord }) {
  const date = new Date(event.start).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Pressable style={styles.card} onPress={() => Linking.openURL(event.sourceUrl)}>
      <Text style={styles.title}>{event.title}</Text>
      <Text>{date}</Text>
      {event.location.name ? <Text>{event.location.name}</Text> : null}
      <Text style={styles.category}>{event.category}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#ddd", marginVertical: 6 },
  title: { fontWeight: "bold", fontSize: 16 },
  category: { color: "#666", marginTop: 4 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest EventCard.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/EventCard.tsx app/__tests__/EventCard.test.tsx
git commit -m "Add EventCard component"
```

---

### Task 9: `LocationInput` component

**Files:**
- Create: `app/src/components/LocationInput.tsx`
- Test: `app/__tests__/LocationInput.test.tsx`

**Interfaces:**
- Produces: `LocationInput({ onChange }: { onChange: (origin: {lat: number; lon: number} | undefined) => void }): JSX.Element` — a toggle for device geolocation (via an injected `locationProvider`) plus manual lat/lon text inputs; calls `onChange` whenever the effective origin changes.
- Consumes: nothing from earlier tasks; takes an injected location provider so tests never call real `expo-location`.

- [ ] **Step 1: Write the failing test**

```tsx
// app/__tests__/LocationInput.test.tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { LocationInput } from "../src/components/LocationInput";

describe("LocationInput", () => {
  it("calls onChange with the device position when geolocation is toggled on", async () => {
    const onChange = jest.fn();
    const getCurrentPosition = jest.fn().mockResolvedValue({ lat: 48.03, lon: 7.65 });

    render(<LocationInput onChange={onChange} getCurrentPosition={getCurrentPosition} />);
    fireEvent.press(screen.getByText("Standort verwenden"));

    await screen.findByText("Standort aktiv");
    expect(onChange).toHaveBeenCalledWith({ lat: 48.03, lon: 7.65 });
  });

  it("calls onChange with manually entered coordinates", () => {
    const onChange = jest.fn();
    render(<LocationInput onChange={onChange} getCurrentPosition={jest.fn()} />);

    fireEvent.changeText(screen.getByPlaceholderText("Breitengrad"), "48.03");
    fireEvent.changeText(screen.getByPlaceholderText("Längengrad"), "7.65");

    expect(onChange).toHaveBeenCalledWith({ lat: 48.03, lon: 7.65 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest LocationInput.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/LocationInput'`

- [ ] **Step 3: Write `app/src/components/LocationInput.tsx`**

```tsx
import { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";

export interface Coordinates {
  lat: number;
  lon: number;
}

interface LocationInputProps {
  onChange: (origin: Coordinates | undefined) => void;
  getCurrentPosition: () => Promise<Coordinates>;
}

export function LocationInput({ onChange, getCurrentPosition }: LocationInputProps) {
  const [deviceActive, setDeviceActive] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");

  async function useDeviceLocation() {
    const position = await getCurrentPosition();
    setDeviceActive(true);
    onChange(position);
  }

  function updateManual(latText: string, lonText: string) {
    setManualLat(latText);
    setManualLon(lonText);
    const lat = parseFloat(latText);
    const lon = parseFloat(lonText);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      setDeviceActive(false);
      onChange({ lat, lon });
    }
  }

  return (
    <View style={styles.container}>
      <Button title="Standort verwenden" onPress={useDeviceLocation} />
      {deviceActive ? <Text>Standort aktiv</Text> : null}
      <View style={styles.manualRow}>
        <TextInput
          placeholder="Breitengrad"
          keyboardType="numeric"
          value={manualLat}
          onChangeText={(text) => updateManual(text, manualLon)}
          style={styles.input}
        />
        <TextInput
          placeholder="Längengrad"
          keyboardType="numeric"
          value={manualLon}
          onChangeText={(text) => updateManual(manualLat, text)}
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  manualRow: { flexDirection: "row", gap: 8 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, flex: 1 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest LocationInput.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/LocationInput.tsx app/__tests__/LocationInput.test.tsx
git commit -m "Add LocationInput component"
```

---

### Task 10: `FilterBar` component

**Files:**
- Create: `app/src/components/FilterBar.tsx`
- Test: `app/__tests__/FilterBar.test.tsx`

**Interfaces:**
- Produces: `FilterBar({ onChange }: { onChange: (filters: EventFilters) => void; getCurrentPosition: () => Promise<Coordinates> }): JSX.Element` — combines `LocationInput`, a radius slider (1-100km, default 25km), and date-range inputs into one `EventFilters` object passed to `onChange`.
- Consumes: `EventFilters` from `../lib/filterEvents`, `LocationInput`/`Coordinates` from `./LocationInput`

- [ ] **Step 1: Write the failing test**

```tsx
// app/__tests__/FilterBar.test.tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { FilterBar } from "../src/components/FilterBar";

describe("FilterBar", () => {
  it("reports a default 25km radius once a location is set", async () => {
    const onChange = jest.fn();
    const getCurrentPosition = jest.fn().mockResolvedValue({ lat: 48.03, lon: 7.65 });

    render(<FilterBar onChange={onChange} getCurrentPosition={getCurrentPosition} />);
    fireEvent.press(screen.getByText("Standort verwenden"));
    await screen.findByText("Standort aktiv");

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ origin: { lat: 48.03, lon: 7.65 }, radiusMeters: 25000 }),
    );
  });

  it("reports dateFrom/dateTo as start/end-of-day ISO strings once entered", () => {
    const onChange = jest.fn();

    render(<FilterBar onChange={onChange} getCurrentPosition={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText("Von (JJJJ-MM-TT)"), "2026-08-10");
    fireEvent.changeText(screen.getByPlaceholderText("Bis (JJJJ-MM-TT)"), "2026-08-20");

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dateFrom: "2026-08-10T00:00:00.000Z",
        dateTo: "2026-08-20T23:59:59.999Z",
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest FilterBar.test.tsx`
Expected: FAIL — `Cannot find module '../src/components/FilterBar'`

- [ ] **Step 3: Write `app/src/components/FilterBar.tsx`**

```tsx
import Slider from "@react-native-community/slider";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { EventFilters } from "../lib/filterEvents";
import { LocationInput, type Coordinates } from "./LocationInput";

const DEFAULT_RADIUS_METERS = 25000;
const MIN_RADIUS_METERS = 1000;
const MAX_RADIUS_METERS = 100000;

interface FilterBarProps {
  onChange: (filters: EventFilters) => void;
  getCurrentPosition: () => Promise<Coordinates>;
}

function toStartOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  return new Date(`${dateText}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  return new Date(`${dateText}T23:59:59.999Z`).toISOString();
}

export function FilterBar({ onChange, getCurrentPosition }: FilterBarProps) {
  const [origin, setOrigin] = useState<Coordinates | undefined>(undefined);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
  const [dateFromText, setDateFromText] = useState("");
  const [dateToText, setDateToText] = useState("");

  function emit(
    nextOrigin: Coordinates | undefined,
    nextRadius: number,
    nextDateFromText: string,
    nextDateToText: string,
  ) {
    onChange({
      origin: nextOrigin,
      radiusMeters: nextOrigin ? nextRadius : undefined,
      dateFrom: toStartOfDayIso(nextDateFromText),
      dateTo: toEndOfDayIso(nextDateToText),
    });
  }

  return (
    <View style={styles.container}>
      <LocationInput
        getCurrentPosition={getCurrentPosition}
        onChange={(nextOrigin) => {
          setOrigin(nextOrigin);
          emit(nextOrigin, radiusMeters, dateFromText, dateToText);
        }}
      />
      <Text>Umkreis: {Math.round(radiusMeters / 1000)} km</Text>
      <Slider
        minimumValue={MIN_RADIUS_METERS}
        maximumValue={MAX_RADIUS_METERS}
        value={radiusMeters}
        onValueChange={(value: number) => {
          setRadiusMeters(value);
          emit(origin, value, dateFromText, dateToText);
        }}
      />
      <View style={styles.dateRow}>
        <TextInput
          placeholder="Von (JJJJ-MM-TT)"
          value={dateFromText}
          onChangeText={(text) => {
            setDateFromText(text);
            emit(origin, radiusMeters, text, dateToText);
          }}
          style={styles.dateInput}
        />
        <TextInput
          placeholder="Bis (JJJJ-MM-TT)"
          value={dateToText}
          onChangeText={(text) => {
            setDateToText(text);
            emit(origin, radiusMeters, dateFromText, text);
          }}
          style={styles.dateInput}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, padding: 12 },
  dateRow: { flexDirection: "row", gap: 8 },
  dateInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, flex: 1 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx expo install @react-native-community/slider && npx jest FilterBar.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/FilterBar.tsx app/__tests__/FilterBar.test.tsx app/package.json
git commit -m "Add FilterBar component with radius slider"
```

---

### Task 11: `EventListScreen` — wires everything together

**Files:**
- Create: `app/src/screens/EventListScreen.tsx`
- Modify: `app/App.tsx`
- Test: `app/__tests__/EventListScreen.test.tsx`

**Interfaces:**
- Produces: `EventListScreen(): JSX.Element` — on mount, calls `getEvents` (with a real `fetch`-backed `fetchText` and `AsyncStorage`-backed `storage`), renders `FilterBar` above a `FlatList` of `EventCard`s built from `filterEvents(events, filters)`.
- Consumes: `getEvents`/`EventStorage` from `../lib/getEvents`, `filterEvents`/`EventFilters` from `../lib/filterEvents`, `FilterBar` from `../components/FilterBar`, `EventCard` from `../components/EventCard`

- [ ] **Step 1: Write the failing test**

```tsx
// app/__tests__/EventListScreen.test.tsx
import { render, screen } from "@testing-library/react-native";
import { EventListScreen } from "../src/screens/EventListScreen";

jest.mock("../src/lib/getEvents", () => ({
  getEvents: jest.fn().mockResolvedValue([
    {
      id: "1",
      title: "Winzerfest Ihringen",
      start: "2026-08-15T18:00:00.000Z",
      location: { name: "Marktplatz" },
      category: "weinfest",
      sourceIds: ["a"],
      sourceUrl: "https://example.test/1",
      region: "test-region",
      lastSeenAt: "2026-07-09T00:00:00.000Z",
    },
  ]),
}));

describe("EventListScreen", () => {
  it("loads and displays events on mount", async () => {
    render(<EventListScreen />);
    expect(await screen.findByText("Winzerfest Ihringen")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest EventListScreen.test.tsx`
Expected: FAIL — `Cannot find module '../src/screens/EventListScreen'`

- [ ] **Step 3: Write `app/src/screens/EventListScreen.tsx`**

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet } from "react-native";
import { EventCard } from "../components/EventCard";
import { FilterBar } from "../components/FilterBar";
import { filterEvents, type EventFilters } from "../lib/filterEvents";
import { getEvents } from "../lib/getEvents";
import type { EventRecord } from "../lib/types";

const EVENTS_URL = "https://lucashaas.github.io/event-discovery-data/events.json";

async function getCurrentPosition(): Promise<{ lat: number; lon: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission denied");
  }
  const position = await Location.getCurrentPositionAsync({});
  return { lat: position.coords.latitude, lon: position.coords.longitude };
}

export function EventListScreen() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [filters, setFilters] = useState<EventFilters>({});

  useEffect(() => {
    getEvents(
      (url) => fetch(url).then((res) => res.text()),
      AsyncStorage,
      EVENTS_URL,
    ).then(setEvents);
  }, []);

  const visibleEvents = filterEvents(events, filters);

  return (
    <SafeAreaView style={styles.container}>
      <FilterBar onChange={setFilters} getCurrentPosition={getCurrentPosition} />
      <FlatList
        data={visibleEvents}
        keyExtractor={(event) => event.id}
        renderItem={({ item }) => <EventCard event={item} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest EventListScreen.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Update `app/App.tsx` to render the screen**

```tsx
import { EventListScreen } from "./src/screens/EventListScreen";

export default function App() {
  return <EventListScreen />;
}
```

- [ ] **Step 6: Run the full app test suite**

Run: `cd app && npm test`
Expected: PASS — all tests across all tasks green.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/EventListScreen.tsx app/App.tsx app/__tests__/EventListScreen.test.tsx
git commit -m "Wire EventListScreen into the app entry point"
```

---

## Part C — Store Distribution

### Task 12: EAS build configuration

**Files:**
- Create: `app/eas.json`
- Modify: `app/app.json`

**Interfaces:**
- Produces: EAS build profiles (`development`, `preview`, `production`) usable via `eas build --platform ios|android --profile production`.

- [ ] **Step 1: Install and log in to EAS CLI**

Run: `npm install -g eas-cli && eas login`
Expected: prompts for Expo account credentials (create a free Expo account if none exists yet — this is separate from and free relative to the Apple/Google developer accounts).

- [ ] **Step 2: Initialize EAS in the project**

Run: `cd app && eas build:configure`
Expected: creates `app/eas.json` and adds a `projectId` under `expo.extra.eas` in `app.json`.

- [ ] **Step 3: Verify `app/eas.json` has all three profiles**

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 4: Set the app version in `app.json`**

```json
{
  "expo": {
    "version": "0.1.0",
    "ios": { "buildNumber": "1" },
    "android": { "versionCode": 1 }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/eas.json app/app.json
git commit -m "Add EAS build configuration"
```

---

### Task 13: iOS App Store submission setup

**Files:**
- Modify: `app/eas.json`

**Interfaces:**
- Produces: an `eas submit --platform ios` -ready configuration once an Apple Developer account exists.

- [ ] **Step 1: Enroll in the Apple Developer Program**

Manual step (not scriptable): sign up at developer.apple.com, $99/year, requires an Apple ID. Note the Team ID once issued.

- [ ] **Step 2: Create the app in App Store Connect**

Manual step: create a new app entry with bundle identifier `com.lokalfeste.app`, matching `app/app.json`.

- [ ] **Step 3: Add iOS submit credentials to `app/eas.json`**

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "lucas_haas@web.de",
        "ascAppId": "<App Store Connect app ID, from Step 2>",
        "appleTeamId": "<Team ID, from Step 1>"
      }
    }
  }
}
```

- [ ] **Step 4: Build and submit**

Run: `cd app && eas build --platform ios --profile production && eas submit --platform ios`
Expected: build completes on EAS's servers, submission uploads to App Store Connect for review.

- [ ] **Step 5: Commit**

```bash
git add app/eas.json
git commit -m "Add iOS submit configuration"
```

---

### Task 14: Android Play Store submission setup

**Files:**
- Modify: `app/eas.json`

**Interfaces:**
- Produces: an `eas submit --platform android` -ready configuration once a Google Play Console account exists.

- [ ] **Step 1: Enroll in Google Play Console**

Manual step: sign up at play.google.com/console, one-time ~$25 fee.

- [ ] **Step 2: Create the app in Play Console and generate a service account key**

Manual step: create app entry with package `com.lokalfeste.app`; under Setup → API access, create a service account with "Release manager" permissions and download its JSON key to `app/play-store-service-account.json` (add this exact filename to `app/.gitignore` — it is a credential, never committed).

- [ ] **Step 3: Add the gitignore entry**

```
play-store-service-account.json
```

Append to `app/.gitignore`.

- [ ] **Step 4: Add Android submit credentials to `app/eas.json`**

```json
{
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./play-store-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

- [ ] **Step 5: Build and submit**

Run: `cd app && eas build --platform android --profile production && eas submit --platform android`
Expected: build completes on EAS's servers, submission uploads to the Play Console's internal track.

- [ ] **Step 6: Commit**

```bash
git add app/eas.json app/.gitignore
git commit -m "Add Android submit configuration"
```

---

## Part D — Integration With the Scraper Pipeline (gated on scraper-core completion)

### Task 15: Wire geocoding into `run.ts`

**Precondition:** `scraper/src/run.ts` must exist (created by `docs/superpowers/plans/2026-07-03-scraper-core.md` Task 13). Run `test -f scraper/src/run.ts` first — if it doesn't exist, finish scraper-core Tasks 6-13 before this task.

**Files:**
- Modify: `scraper/src/run.ts`
- Modify: `scraper/test/run.test.ts`

**Interfaces:**
- Modifies: `RunScrapeOptions` gains `geocodeCachePath: string` and `sleep: (ms: number) => Promise<void>`; `runScrape` geocodes each raw event before pushing it into `dedupEntries`, and persists the updated cache to `geocodeCachePath` alongside `events.json`/`health.json`.
- Consumes: `geocodeRawEvent`, `loadGeocodeCache`, `saveGeocodeCache` from `./geocode` (Tasks 1-2)

- [ ] **Step 1: Add a geocoding assertion to the existing integration test**

Add this test to `scraper/test/run.test.ts` (alongside the existing three):

```ts
it("geocodes an event location that has a name but no coordinates", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "scrape-out-"));
  const geocodeFetch = (url: string) => {
    if (url === "fixture://ical" || url === "fixture://template") {
      return url === "fixture://ical" ? Promise.resolve(icalFixture) : Promise.resolve(templateHtmlFixture);
    }
    return Promise.resolve(JSON.stringify([{ lat: "48.03", lon: "7.65" }]));
  };

  try {
    const result = await runScrape({
      regionsDir: fixturesDir,
      sourcesDir: fixturesDir,
      templatesDir: fixturesDir,
      outDir,
      geocodeCachePath: path.join(outDir, "geocode-cache.json"),
      fetchText: geocodeFetch,
      sleep: async () => {},
      now: () => "2026-07-03T12:00:00.000Z",
    });

    const geocoded = result.events.find((e) => e.location.name === "Marktplatz Ihringen");
    expect(geocoded?.location.lat).toBeCloseTo(48.03);
    expect(geocoded?.location.lon).toBeCloseTo(7.65);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
```

Update the other three existing tests in the same file to pass `geocodeCachePath: path.join(outDir, "geocode-cache.json")` and `sleep: async () => {}` in their `runScrape(...)` calls too (required fields on `RunScrapeOptions` after this task).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/run.test.ts`
Expected: FAIL — new test's location assertion fails (no geocoding wired in yet) and/or TypeScript errors on missing required options.

- [ ] **Step 3: Modify `scraper/src/run.ts`**

Add to the imports at the top:

```ts
import { geocodeRawEvent, loadGeocodeCache, saveGeocodeCache } from "./geocode";
```

Add two fields to `RunScrapeOptions`:

```ts
export interface RunScrapeOptions {
  regionsDir: string;
  sourcesDir: string;
  templatesDir: string;
  outDir: string;
  geocodeCachePath: string;
  fetchText: (url: string) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  now: () => string;
}
```

Replace the raw-event push loop inside `runScrape` (currently just pushing `rawEvent` straight into `dedupEntries`) with:

```ts
  const geocodeCache = loadGeocodeCache(options.geocodeCachePath);

  for (const source of sources) {
    // ... existing resolvedSource / previousHealth code above is unchanged ...

    try {
      const adapter = getAdapter(source.adapterType);
      const rawEvents = await adapter.fetchEvents(resolvedSource, options.fetchText);

      for (const rawEvent of rawEvents) {
        const geocoded = await geocodeRawEvent(rawEvent, geocodeCache, options.fetchText, options.sleep);
        dedupEntries.push({
          rawEvent: geocoded,
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
```

(Only the inner body of the `try` block's raw-event loop changes — the surrounding `for (const source of sources)` loop, `resolvedSource` resolution, and `catch` block stay exactly as scraper-core Task 13 wrote them.)

Add the cache write alongside the existing `events.json`/`health.json` writes:

```ts
  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(path.join(options.outDir, "events.json"), JSON.stringify(events, null, 2));
  writeFileSync(path.join(options.outDir, "health.json"), JSON.stringify(health, null, 2));
  saveGeocodeCache(options.geocodeCachePath, geocodeCache);
```

Update `main()`'s call to `runScrape` to pass the two new options, and set a Nominatim-compliant `User-Agent` on the real fetch:

```ts
async function main() {
  const root = path.join(import.meta.dirname, "..");
  const result = await runScrape({
    regionsDir: path.join(root, "config/regions"),
    sourcesDir: path.join(root, "config/sources"),
    templatesDir: path.join(root, "config/templates"),
    outDir: path.join(root, "..", "data"),
    geocodeCachePath: path.join(root, "..", "data", "geocode-cache.json"),
    fetchText: async (url) => {
      const res = await fetch(url, {
        headers: { "User-Agent": "kaiserstuhl-event-scraper/0.1 (lucas_haas@web.de)" },
      });
      if (!res.ok) throw new Error(`Fetch failed for ${url}: ${res.status}`);
      return res.text();
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date().toISOString(),
  });
  console.log(`Wrote ${result.events.length} events, ${result.health.length} health records.`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/run.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full scraper test suite**

Run: `cd scraper && npm test`
Expected: PASS — all tests across the whole scraper package green.

- [ ] **Step 6: Commit**

```bash
git add scraper/src/run.ts scraper/test/run.test.ts
git commit -m "Wire geocoding into the scrape orchestrator"
```

---

### Task 16: Publish `/data` via GitHub Pages

**Precondition:** `.github/workflows/scrape.yml` must exist (created by scraper-core Task 14). Run `test -f .github/workflows/scrape.yml` first — if it doesn't exist, finish scraper-core Task 14 before this task.

**Files:**
- Modify: `.github/workflows/scrape.yml`

**Interfaces:**
- Produces: on every successful scrape run, `/data`'s contents are published to GitHub Pages at `https://<username>.github.io/<repo>/events.json` (and `health.json`, `geocode-cache.json`).

- [ ] **Step 1: Enable GitHub Pages for the repository**

Manual step: in the repo's Settings → Pages, set source to "GitHub Actions" (not a branch) — this activates the `actions/deploy-pages` flow used below.

- [ ] **Step 2: Add Pages permissions and a deploy job to `.github/workflows/scrape.yml`**

Add to the top-level `permissions` block (already has `contents: write` from scraper-core Task 14):

```yaml
permissions:
  contents: write
  pages: write
  id-token: write
```

Add a new job after the existing `scrape` job:

```yaml
  deploy-pages:
    needs: scrape
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: data
      - uses: actions/deploy-pages@v4
        id: deployment
```

- [ ] **Step 3: Verify the workflow YAML is well-formed**

Run: `cd "C:\Users\Lucas\Desktop\app" && npx -y js-yaml .github/workflows/scrape.yml`
Expected: prints the parsed YAML structure back out with no error.

- [ ] **Step 4: Update the app's `EVENTS_URL` to the real Pages URL**

Once the first deploy has run and the real Pages URL is known (shown in the Actions run's `deploy-pages` job output), replace the placeholder in `app/src/screens/EventListScreen.tsx`:

```ts
const EVENTS_URL = "https://<actual-github-username>.github.io/<actual-repo-name>/events.json";
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/scrape.yml app/src/screens/EventListScreen.tsx
git commit -m "Publish scraped data via GitHub Pages"
```

---

## After this plan

- Spec 2 (Freunde-System + Likes/RSVP, Supabase backend, Auth) builds on top of this app — brainstorm it separately once this plan is merged and the app runs end-to-end on a device/simulator.
- Real Kaiserstuhl-region source configs still need to be populated (see scraper-core plan's "After this plan" section) — this app will show real data only once those sources exist.
- App Store/Play Store review can take days and may request changes (screenshots, privacy policy for location permission usage) — budget for at least one review round-trip before the app is publicly listed.
