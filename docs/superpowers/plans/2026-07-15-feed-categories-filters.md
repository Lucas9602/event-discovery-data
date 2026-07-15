# Feed-Verbesserungen: Sortierung, Formatierung, Kategorien, Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix feed sort order and description formatting, replace the 6-category scheme with a 9-category one that actually fits the scraped data, drop pure club-admin noise, and add a category + date-range filter UI to the real feed.

**Architecture:** Scraper-side changes (`scraper/src/normalize.ts`, `scraper/src/dedup.ts`, `scraper/src/types.ts`) regenerate cleaner, better-categorized `EventRecord`s on the next scrape. App-side changes (`app/src/lib/filterEvents.ts`, new `app/src/lib/dateRange.ts`, new `app/src/demo/FilterChips.tsx`, `app/src/demo/FeedScreen.tsx`, `app/src/demo/eventDisplay.ts`, `app/src/demo/EventPostCard.tsx`) sort/filter/display what's already in `events.json`. No new dependencies.

**Tech Stack:** TypeScript, Vitest (scraper), Jest + React Testing Library (app) — matches existing project setup, no new tooling.

## Global Constraints

- Category slugs (exact strings, used as `EventRecord.category` and everywhere that keys off it): `weinfest`, `dorffest`, `konzert`, `markt`, `fuehrung-tour`, `vereinsleben`, `geselligkeit`, `kultur`, `sonstiges`. `vereins-sportfest` is removed — do not leave it anywhere.
- German display labels (exact strings): Weinfest, Dorffest & Feste, Konzert, Markt, Führung & Tour, Vereinsleben, Geselligkeit, Kultur, Sonstiges.
- No new npm dependencies in either `scraper/` or `app/` — every task uses only what's already installed.
- `events.json` is regenerated fully on every scrape run (every 3 days) — no migration step for old category values in old data needed anywhere in this plan.
- Filter state in the app is session-only (`useState`, no `AsyncStorage`) — do not persist category/Zeitraum selection across app restarts.
- No "Entfernung" (radius) filter chip and no "mehr anzeigen" description expand in this plan — explicitly out of scope per the design doc.

---

### Task 1: Sort feed events chronologically

**Files:**
- Modify: `app/src/lib/filterEvents.ts`
- Test: `app/__tests__/filterEvents.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `filterEvents()`'s return value is now always sorted ascending by `start` — later tasks (Task 7) can rely on this and don't need to sort again.

- [ ] **Step 1: Write the failing test**

Add to `app/__tests__/filterEvents.test.ts`, inside the existing `describe("filterEvents", ...)` block (after the last `it(...)`, before the closing `});`):

```ts
  it("returns events sorted chronologically by start date, regardless of input order", () => {
    const late = makeEvent({ id: "late", start: "2026-09-01T10:00:00.000Z" });
    const early = makeEvent({ id: "early", start: "2026-08-01T10:00:00.000Z" });
    const middle = makeEvent({ id: "middle", start: "2026-08-15T10:00:00.000Z" });

    const result = filterEvents([late, early, middle], {});

    expect(result.map((e) => e.id)).toEqual(["early", "middle", "late"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest filterEvents -t "sorted chronologically"`
Expected: FAIL — result is `["late", "early", "middle"]` (input order), not sorted.

- [ ] **Step 3: Write minimal implementation**

In `app/src/lib/filterEvents.ts`, replace the `filterEvents` function body:

```ts
export function filterEvents(events: EventRecord[], filters: EventFilters): EventRecord[] {
  const filtered = events.filter((event) => {
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

  return filtered.sort((a, b) => a.start.localeCompare(b.start));
}
```

(Only change: the `filter(...)` call result is now assigned to `filtered` and returned via `.sort(...)` instead of being returned directly.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest filterEvents`
Expected: PASS, all 6 tests (5 existing + 1 new) green.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/filterEvents.ts app/__tests__/filterEvents.test.ts
git commit -m "fix(app): sort feed events chronologically by start date"
```

---

### Task 2: Clean up scraped description text (entities + spacing/newline artifacts)

**Files:**
- Modify: `scraper/src/normalize.ts`
- Modify: `scraper/src/dedup.ts`
- Test: `scraper/test/normalize.test.ts`
- Test: `scraper/test/dedup.test.ts`

**Interfaces:**
- Produces: `cleanDescription(text: string): string`, exported from `scraper/src/normalize.ts`. Task 6's `isInternalClubBusiness` will live in the same file but is independent — no shared state.
- Consumes: nothing new.

Real scraped descriptions were inspected directly (not guessed): 485/704 have runs of 2+ consecutive spaces (source CMS text-reflow artifacts, e.g. `"st  ehen"` instead of `"stehen"`), 396/704 have single mid-paragraph newlines that are wrap artifacts rather than intentional breaks, 437/704 have genuine `\n\n` paragraph breaks that must be preserved, and 88 raw `&nbsp;`-style HTML entities appear across 55 events.

- [ ] **Step 1: Write the failing test**

Add to `scraper/test/normalize.test.ts`, after the existing `import` line add `cleanDescription` to the import, then add a new `describe` block before `describe("computeEventId", ...)`:

```ts
import { cleanDescription, computeEventId, dedupKey, normalizeCategory, normalizeTitle } from "../src/normalize";
```

```ts
describe("cleanDescription", () => {
  it("decodes common HTML entities", () => {
    expect(cleanDescription("Termine:&nbsp;&nbsp;heute")).toBe("Termine: heute");
  });

  it("collapses runs of spaces from source text-reflow artifacts", () => {
    expect(cleanDescription("Im Mittelpunkt st  ehen Erfahrungen")).toBe(
      "Im Mittelpunkt st ehen Erfahrungen",
    );
  });

  it("collapses a single mid-paragraph newline into a space", () => {
    expect(cleanDescription("Die Graphic-Novel-Ausstellung zeigt Migra\ntion")).toBe(
      "Die Graphic-Novel-Ausstellung zeigt Migra tion",
    );
  });

  it("preserves a real paragraph break (double newline)", () => {
    expect(cleanDescription("Erster Absatz.\n\nZweiter Absatz.")).toBe(
      "Erster Absatz.\n\nZweiter Absatz.",
    );
  });

  it("trims leading and trailing whitespace", () => {
    expect(cleanDescription("  Text mit Rand  ")).toBe("Text mit Rand");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/normalize.test.ts`
Expected: FAIL with `cleanDescription is not a function` (or a TS compile error, since it isn't exported yet).

- [ ] **Step 3: Write minimal implementation**

In `scraper/src/normalize.ts`, add near the top (after the `UMLAUT_MAP` constant, before `normalizeTitle`):

```ts
const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&uuml;": "ü",
  "&ouml;": "ö",
  "&auml;": "ä",
  "&Uuml;": "Ü",
  "&Ouml;": "Ö",
  "&Auml;": "Ä",
  "&szlig;": "ß",
};

function decodeHtmlEntities(text: string): string {
  let result = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.split(entity).join(char);
  }
  return result;
}

// Source CMS description fields carry two artifacts of their own display
// width: single newlines mid-paragraph (a wrap, not a real line break) and
// runs of extra spaces where words got reflowed. Genuine paragraph breaks
// (\n\n) must survive; everything else collapses to single spaces.
export function cleanDescription(text: string): string {
  const decoded = decodeHtmlEntities(text);
  const paragraphMarker = " ";
  const withParagraphsMarked = decoded.replace(/\n{2,}/g, paragraphMarker);
  const unwrapped = withParagraphsMarked.replace(/\n/g, " ");
  const collapsedSpaces = unwrapped.replace(/[ \t]+/g, " ");
  const restored = collapsedSpaces.replace(new RegExp(paragraphMarker, "g"), "\n\n");
  return restored.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/normalize.test.ts`
Expected: PASS, all tests including the 5 new ones.

- [ ] **Step 5: Wire into dedup.ts**

In `scraper/src/dedup.ts`, update the import line and the `description` field in `mergeEvents`:

```ts
import { cleanDescription, computeEventId, dedupKey, normalizeCategory } from "./normalize";
```

Change:

```ts
        description: canonical.rawEvent.description,
```

to:

```ts
        description: canonical.rawEvent.description
          ? cleanDescription(canonical.rawEvent.description)
          : undefined,
```

- [ ] **Step 6: Add a dedup-level regression test**

Add to `scraper/test/dedup.test.ts`, inside the `describe("mergeEvents", ...)` block:

```ts
  it("cleans up description text (entities and spacing artifacts)", () => {
    const a: RawEvent = {
      title: "Ausstellung Test",
      description: "Text mit&nbsp;Entity und  doppeltem Leerzeichen",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://a.test/1",
    };
    const merged = mergeEvents([entry(a, "source-a", "ical")], now);
    expect(merged[0].description).toBe("Text mit Entity und doppeltem Leerzeichen");
  });
```

- [ ] **Step 7: Run full scraper test suite**

Run: `cd scraper && npx vitest run`
Expected: PASS, all tests green.

- [ ] **Step 8: Commit**

```bash
git add scraper/src/normalize.ts scraper/src/dedup.ts scraper/test/normalize.test.ts scraper/test/dedup.test.ts
git commit -m "feat(scraper): decode HTML entities and clean spacing/newline artifacts in descriptions"
```

---

### Task 3: Compact description preview in the feed card

**Files:**
- Modify: `app/src/demo/EventPostCard.tsx`

**Interfaces:**
- Consumes: nothing new (cosmetic-only change to an existing render).

- [ ] **Step 1: Make the change**

In `app/src/demo/EventPostCard.tsx`, find this block near the end of the component:

```tsx
      {likedBy && likedBy.length > 0 ? (
        <Text style={styles.likes}>
          {likedBy.map((f) => f.name).join(" und ")} {likedBy.length === 1 ? "gefällt das" : "sind dabei"}
        </Text>
      ) : (
        <Text style={styles.likes}>{event.description}</Text>
      )}
```

Change the last line to cap the description at 3 lines:

```tsx
      {likedBy && likedBy.length > 0 ? (
        <Text style={styles.likes}>
          {likedBy.map((f) => f.name).join(" und ")} {likedBy.length === 1 ? "gefällt das" : "sind dabei"}
        </Text>
      ) : (
        <Text style={styles.likes} numberOfLines={3}>
          {event.description}
        </Text>
      )}
```

No test needed — `numberOfLines` is a React Native layout prop with no effect in the Jest/jsdom test environment (RTL doesn't do real text layout), and there is no existing snapshot/visual test for this component to break.

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/demo/EventPostCard.tsx
git commit -m "feat(app): cap event description preview at 3 lines in the feed card"
```

---

### Task 4: New category taxonomy across scraper and app

**Files:**
- Modify: `scraper/src/types.ts`
- Modify: `scraper/src/normalize.ts`
- Modify: `app/src/demo/eventDisplay.ts`
- Modify: `app/src/demo/EventPostCard.tsx`
- Test: `scraper/test/normalize.test.ts`
- Test: `app/__tests__/eventDisplay.test.ts`

**Interfaces:**
- Produces: the `Category` union type (scraper) is now `"weinfest" | "dorffest" | "konzert" | "markt" | "fuehrung-tour" | "vereinsleben" | "geselligkeit" | "kultur" | "sonstiges"`. Task 7's `FilterChips` category options must use exactly these 9 slugs plus an `"alle"` sentinel that is never sent to `filterEvents`.
- Consumes: nothing new.

This is one task even though it touches 4 files, because the category set is a single atomic concept — a partial update would leave e.g. the scraper emitting `fuehrung-tour` while the app has no color/label for it (falls back to the grey "sonstiges" style silently, which would look like a bug rather than an intentional fallback).

- [ ] **Step 1: Update the scraper's category list**

In `scraper/src/types.ts`, replace:

```ts
export const CATEGORIES = [
  "weinfest",
  "dorffest",
  "vereins-sportfest",
  "konzert",
  "markt",
  "sonstiges",
] as const;
```

with:

```ts
export const CATEGORIES = [
  "weinfest",
  "dorffest",
  "konzert",
  "markt",
  "fuehrung-tour",
  "vereinsleben",
  "geselligkeit",
  "kultur",
  "sonstiges",
] as const;
```

- [ ] **Step 2: Write the failing scraper-side inference tests**

In `scraper/test/normalize.test.ts`, inside `describe("normalizeCategory", ...)`, replace the existing `vereins-sportfest` test:

```ts
  it("infers vereins-sportfest from title/description keywords", () => {
    expect(normalizeCategory(undefined, "Fußballturnier der Jugendmannschaften")).toBe(
      "vereins-sportfest",
    );
    expect(normalizeCategory(undefined, "Vereinsturnier SV Testhausen")).toBe(
      "vereins-sportfest",
    );
  });
```

with:

```ts
  it("infers vereinsleben from club-event keywords, including sport tournaments", () => {
    expect(normalizeCategory(undefined, "Fußballturnier der Jugendmannschaften")).toBe(
      "vereinsleben",
    );
    expect(normalizeCategory(undefined, "Jubiläum \"50 Jahre TC Bahlingen e.V.\"")).toBe(
      "vereinsleben",
    );
  });

  it("infers fuehrung-tour from title/description keywords", () => {
    expect(normalizeCategory(undefined, "Kellerführung bei den Winzern")).toBe("fuehrung-tour");
    expect(normalizeCategory(undefined, "Wanderung im Herzen des Kaiserstuhls")).toBe(
      "fuehrung-tour",
    );
  });

  it("infers geselligkeit from title/description keywords", () => {
    expect(normalizeCategory(undefined, "Bürgercafé im Gemeindehaus")).toBe("geselligkeit");
    expect(normalizeCategory(undefined, "Offener Treff für alle")).toBe("geselligkeit");
  });

  it("infers kultur from title/description keywords", () => {
    expect(normalizeCategory(undefined, "Ausstellung: Kunst am Kaiserstuhl")).toBe("kultur");
  });
```

Also update the "prefers an explicit raw category" test and the "falls back to sonstiges" test if they reference removed categories — check both still use only valid categories (`"markt"` and `"konzert"` stay valid, no change needed there).

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd scraper && npx vitest run test/normalize.test.ts`
Expected: FAIL — `vereinsleben`/`fuehrung-tour`/`geselligkeit`/`kultur` keyword matching doesn't exist yet, `inferCategory` still returns `"sonstiges"` for all of these.

- [ ] **Step 4: Update the keyword table**

In `scraper/src/normalize.ts`, replace the `CATEGORY_KEYWORDS` array:

```ts
const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ["weinfest", /wein(fest|probe|tage|berg)|winzer/i],
  ["dorffest", /dorffest|stadtfest|sommerfest|herbstfest|fr[uü]hlingsfest|str[aä]ßenfest/i],
  ["vereins-sportfest", /sportfest|turnier|sch[uü]tzenfest/i],
  ["konzert", /konzert|musical/i],
  ["markt", /\bmarkt\b|weihnachtsmarkt|flohmarkt|adventsmarkt/i],
];
```

with:

```ts
const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ["weinfest", /wein(fest|probe|tage|berg)|winzer/i],
  ["dorffest", /dorffest|stadtfest|sommerfest|herbstfest|fr[uü]hlingsfest|str[aä]ßenfest/i],
  ["konzert", /konzert|musical/i],
  ["markt", /\bmarkt\b|weihnachtsmarkt|flohmarkt|adventsmarkt/i],
  ["fuehrung-tour", /f[uü]hrung|wanderung|rundgang|\btour\b/i],
  ["geselligkeit", /caf[eé]|\btreff\b|stammtisch/i],
  ["kultur", /ausstellung|vortrag/i],
  ["vereinsleben", /jubil[aä]um|vereinsfeier|sportfest|turnier|sch[uü]tzenfest/i],
];
```

(`vereinsleben` is checked last and is intentionally broad — it's the catch-all for anything club-related that isn't more specifically a Weinfest/Konzert/etc.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd scraper && npx vitest run`
Expected: PASS, full suite green.

- [ ] **Step 6: Write the failing app-side style/label tests**

In `app/__tests__/eventDisplay.test.ts`, replace the `it.each` table:

```ts
  it.each([
    ["weinfest", "#b3123d", "lokalfeste-wein"],
    ["dorffest", "#3a6b5c", "lokalfeste-sommer"],
    ["vereins-sportfest", "#c07a1e", "lokalfeste-sport"],
    ["markt", "#5b3a6e", "lokalfeste-markt"],
    ["konzert", "#2b5f8a", "lokalfeste-konzert"],
    ["sonstiges", "#5a5a5a", "lokalfeste-sonstiges"],
  ])("maps category %s to accent %s and image seed %s", (category, accent, seed) => {
```

with:

```ts
  it.each([
    ["weinfest", "#b3123d", "lokalfeste-wein"],
    ["dorffest", "#3a6b5c", "lokalfeste-sommer"],
    ["konzert", "#2b5f8a", "lokalfeste-konzert"],
    ["markt", "#5b3a6e", "lokalfeste-markt"],
    ["fuehrung-tour", "#6b5c3a", "lokalfeste-tour"],
    ["vereinsleben", "#c07a1e", "lokalfeste-verein"],
    ["geselligkeit", "#c1553a", "lokalfeste-cafe"],
    ["kultur", "#2f7a6b", "lokalfeste-kultur"],
    ["sonstiges", "#5a5a5a", "lokalfeste-sonstiges"],
  ])("maps category %s to accent %s and image seed %s", (category, accent, seed) => {
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd app && npx jest eventDisplay`
Expected: FAIL — the 4 new categories aren't in `CATEGORY_STYLES` yet, fall back to the sonstiges accent/seed.

- [ ] **Step 8: Update eventDisplay.ts**

In `app/src/demo/eventDisplay.ts`, replace `CATEGORY_STYLES`:

```ts
const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  weinfest: { accent: "#b3123d", image: "https://picsum.photos/seed/lokalfeste-wein/700/700" },
  dorffest: { accent: "#3a6b5c", image: "https://picsum.photos/seed/lokalfeste-sommer/700/700" },
  "vereins-sportfest": { accent: "#c07a1e", image: "https://picsum.photos/seed/lokalfeste-sport/700/700" },
  markt: { accent: "#5b3a6e", image: "https://picsum.photos/seed/lokalfeste-markt/700/700" },
  konzert: { accent: "#2b5f8a", image: "https://picsum.photos/seed/lokalfeste-konzert/700/700" },
  sonstiges: { accent: "#5a5a5a", image: "https://picsum.photos/seed/lokalfeste-sonstiges/700/700" },
};
```

with:

```ts
const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  weinfest: { accent: "#b3123d", image: "https://picsum.photos/seed/lokalfeste-wein/700/700" },
  dorffest: { accent: "#3a6b5c", image: "https://picsum.photos/seed/lokalfeste-sommer/700/700" },
  konzert: { accent: "#2b5f8a", image: "https://picsum.photos/seed/lokalfeste-konzert/700/700" },
  markt: { accent: "#5b3a6e", image: "https://picsum.photos/seed/lokalfeste-markt/700/700" },
  "fuehrung-tour": { accent: "#6b5c3a", image: "https://picsum.photos/seed/lokalfeste-tour/700/700" },
  vereinsleben: { accent: "#c07a1e", image: "https://picsum.photos/seed/lokalfeste-verein/700/700" },
  geselligkeit: { accent: "#c1553a", image: "https://picsum.photos/seed/lokalfeste-cafe/700/700" },
  kultur: { accent: "#2f7a6b", image: "https://picsum.photos/seed/lokalfeste-kultur/700/700" },
  sonstiges: { accent: "#5a5a5a", image: "https://picsum.photos/seed/lokalfeste-sonstiges/700/700" },
};
```

- [ ] **Step 9: Update EventPostCard.tsx labels**

In `app/src/demo/EventPostCard.tsx`, replace `CATEGORY_LABELS`:

```ts
const CATEGORY_LABELS: Record<string, string> = {
  weinfest: "Weinfest",
  dorffest: "Dorffest",
  "vereins-sportfest": "Vereinssportfest",
  konzert: "Konzert",
  markt: "Markt",
  sonstiges: "Sonstiges",
};
```

with:

```ts
const CATEGORY_LABELS: Record<string, string> = {
  weinfest: "Weinfest",
  dorffest: "Dorffest & Feste",
  konzert: "Konzert",
  markt: "Markt",
  "fuehrung-tour": "Führung & Tour",
  vereinsleben: "Vereinsleben",
  geselligkeit: "Geselligkeit",
  kultur: "Kultur",
  sonstiges: "Sonstiges",
};
```

- [ ] **Step 10: Run both test suites to verify everything passes**

Run: `cd app && npx jest && cd ../scraper && npx vitest run`
Expected: PASS, both suites fully green.

- [ ] **Step 11: Typecheck both**

Run: `cd app && npx tsc --noEmit && cd ../scraper && npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 12: Commit**

```bash
git add scraper/src/types.ts scraper/src/normalize.ts scraper/test/normalize.test.ts app/src/demo/eventDisplay.ts app/src/demo/EventPostCard.tsx app/__tests__/eventDisplay.test.ts
git commit -m "feat: replace 6-category scheme with a 9-category one that fits real scraped content"
```

---

### Task 5: Filter out internal club business (Versammlungen, Sitzungen, etc.)

**Files:**
- Modify: `scraper/src/normalize.ts`
- Modify: `scraper/src/dedup.ts`
- Test: `scraper/test/normalize.test.ts`
- Test: `scraper/test/dedup.test.ts`

**Interfaces:**
- Produces: `isInternalClubBusiness(title: string): boolean`, exported from `scraper/src/normalize.ts`.
- Consumes: nothing from other tasks.

Rule (confirmed with the user): pure administrative club meetings are dropped; anything public/celebratory (Jubiläum, Fest, Feier, and everything that isn't an explicit administrative-meeting keyword) stays.

- [ ] **Step 1: Write the failing test**

Add to `scraper/test/normalize.test.ts`, update the import line to include `isInternalClubBusiness`:

```ts
import {
  cleanDescription,
  computeEventId,
  dedupKey,
  isInternalClubBusiness,
  normalizeCategory,
  normalizeTitle,
} from "../src/normalize";
```

Add a new `describe` block:

```ts
describe("isInternalClubBusiness", () => {
  it("flags pure administrative meetings", () => {
    expect(isInternalClubBusiness("Generalversammlung des FC Bayern-Fanclub Bahlingen e.V.")).toBe(true);
    expect(isInternalClubBusiness("Mitgliederversammlung des Bahlinger Sport-Club e.V.")).toBe(true);
    expect(isInternalClubBusiness("Jahreshauptversammlung")).toBe(true);
    expect(isInternalClubBusiness("Einwohnerversammlung")).toBe(true);
    expect(isInternalClubBusiness("Sitzung des Gemeinderats")).toBe(true);
    expect(isInternalClubBusiness("Neuwahl des Vorstands")).toBe(true);
    expect(isInternalClubBusiness("Kassenbericht 2026")).toBe(true);
  });

  it("does not flag public or celebratory events", () => {
    expect(isInternalClubBusiness("Jubiläum \"50 Jahre TC Bahlingen e.V.\"")).toBe(false);
    expect(isInternalClubBusiness("Königsschießen des Schützenverein Bahlingen e.V.")).toBe(false);
    expect(isInternalClubBusiness("Ponynachmittag des Bahlinger Reit- und Fahrverein e.V.")).toBe(false);
    expect(isInternalClubBusiness("Weinfest Ihringen")).toBe(false);
  });

  it("does not false-positive on 'Wahl' as a word fragment", () => {
    expect(isInternalClubBusiness("Wahlfach-Vorstellung an der Schule")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scraper && npx vitest run test/normalize.test.ts`
Expected: FAIL — `isInternalClubBusiness` is not exported yet.

- [ ] **Step 3: Write minimal implementation**

In `scraper/src/normalize.ts`, add after `inferCategory`:

```ts
const INTERNAL_CLUB_BUSINESS_PATTERN =
  /versammlung|jahreshauptversammlung|\bsitzung\b|\bwahl\b|neuwahl|kassenbericht/i;

export function isInternalClubBusiness(title: string): boolean {
  return INTERNAL_CLUB_BUSINESS_PATTERN.test(title);
}
```

(`\bwahl\b` uses word boundaries so it matches standalone "Wahl"/"Neuwahl" but not "Wahlfach".)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scraper && npx vitest run test/normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into dedup.ts**

In `scraper/src/dedup.ts`, update the import:

```ts
import { cleanDescription, computeEventId, dedupKey, isInternalClubBusiness, normalizeCategory } from "./normalize";
```

At the start of `mergeEvents`, before the `buckets` map is built, filter the entries:

```ts
export function mergeEvents(entries: DedupEntry[], nowIso: string): EventRecord[] {
  const publicEntries = entries.filter(
    (entry) => !isInternalClubBusiness(entry.rawEvent.title),
  );

  const buckets = new Map<string, DedupEntry[][]>();

  for (const entry of publicEntries) {
```

(Only the loop's source array changes from `entries` to `publicEntries` — nothing else in the function body changes.)

- [ ] **Step 6: Add a dedup-level regression test**

Add to `scraper/test/dedup.test.ts`:

```ts
  it("drops internal club business events entirely", () => {
    const meeting: RawEvent = {
      title: "Mitgliederversammlung des SV Testhausen",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://a.test/1",
    };
    const festival: RawEvent = {
      title: "Jubiläum 50 Jahre SV Testhausen",
      start: "2026-08-16T18:00:00.000Z",
      sourceUrl: "https://a.test/2",
    };

    const merged = mergeEvents(
      [entry(meeting, "source-a", "ical"), entry(festival, "source-a", "ical")],
      now,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Jubiläum 50 Jahre SV Testhausen");
  });
```

- [ ] **Step 7: Run full scraper test suite**

Run: `cd scraper && npx vitest run`
Expected: PASS, full suite green.

- [ ] **Step 8: Commit**

```bash
git add scraper/src/normalize.ts scraper/src/dedup.ts scraper/test/normalize.test.ts scraper/test/dedup.test.ts
git commit -m "feat(scraper): drop pure internal club-administration events (Versammlung/Sitzung/Wahl)"
```

---

### Task 6: `FilterChips` component

**Files:**
- Create: `app/src/demo/FilterChips.tsx`
- Test: `app/__tests__/FilterChips.test.tsx`

**Interfaces:**
- Produces: `FilterChips` component and `ChipOption` interface, both exported from `app/src/demo/FilterChips.tsx`. Task 7 imports both.
- Consumes: `useTheme` from `./theme` (existing).

```ts
export interface ChipOption {
  value: string;
  label: string;
}

interface FilterChipsProps {
  options: ChipOption[];
  selected: string;
  onSelect: (value: string) => void;
}
```

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/FilterChips.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { FilterChips } from "../src/demo/FilterChips";
import { ThemeProvider } from "../src/demo/theme";

const OPTIONS = [
  { value: "alle", label: "Alle" },
  { value: "weinfest", label: "Weinfest" },
  { value: "konzert", label: "Konzert" },
];

describe("FilterChips", () => {
  it("renders every option's label", () => {
    render(
      <ThemeProvider>
        <FilterChips options={OPTIONS} selected="alle" onSelect={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Alle")).toBeTruthy();
    expect(screen.getByText("Weinfest")).toBeTruthy();
    expect(screen.getByText("Konzert")).toBeTruthy();
  });

  it("calls onSelect with the tapped option's value", () => {
    const onSelect = jest.fn();
    render(
      <ThemeProvider>
        <FilterChips options={OPTIONS} selected="alle" onSelect={onSelect} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByText("Weinfest"));
    expect(onSelect).toHaveBeenCalledWith("weinfest");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest FilterChips`
Expected: FAIL — `app/src/demo/FilterChips.tsx` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/demo/FilterChips.tsx`:

```tsx
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useTheme } from "./theme";

export interface ChipOption {
  value: string;
  label: string;
}

interface FilterChipsProps {
  options: ChipOption[];
  selected: string;
  onSelect: (value: string) => void;
}

export function FilterChips({ options, selected, onSelect }: FilterChipsProps) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.content}
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[
              styles.chip,
              { borderColor: colors.accent },
              active && { backgroundColor: colors.accent },
            ]}
          >
            <Text style={[styles.label, { color: active ? colors.onAccent : colors.accent }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0 },
  content: { paddingHorizontal: 12, gap: 8, paddingVertical: 6 },
  chip: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  label: { fontSize: 12, fontWeight: "700" },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest FilterChips`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/src/demo/FilterChips.tsx app/__tests__/FilterChips.test.tsx
git commit -m "feat(app): add generic FilterChips component (single-select horizontal chip row)"
```

---

### Task 7: Wire category + Zeitraum filters into the feed

**Files:**
- Create: `app/src/lib/dateRange.ts`
- Test: `app/__tests__/dateRange.test.ts`
- Modify: `app/src/lib/filterEvents.ts`
- Test: `app/__tests__/filterEvents.test.ts`
- Modify: `app/src/demo/FeedScreen.tsx`

**Interfaces:**
- Consumes: `Category` slugs from Task 4 (`weinfest`, `dorffest`, `konzert`, `markt`, `fuehrung-tour`, `vereinsleben`, `geselligkeit`, `kultur`, `sonstiges`), `FilterChips`/`ChipOption` from Task 6, sorted-output guarantee from Task 1.
- Produces: `zeitraumToDateRange(zeitraum, now)` from `app/src/lib/dateRange.ts` — pure function, no other task depends on it.

- [ ] **Step 1: Write the failing dateRange tests**

Create `app/__tests__/dateRange.test.ts`:

```ts
import { zeitraumToDateRange } from "../src/lib/dateRange";

describe("zeitraumToDateRange", () => {
  it("returns no bounds for 'alle'", () => {
    const result = zeitraumToDateRange("alle", new Date("2026-07-15T12:00:00.000Z"));
    expect(result).toEqual({});
  });

  it("returns the calendar week (Monday to Sunday) for 'diese-woche'", () => {
    // 2026-07-15 is a Wednesday
    const result = zeitraumToDateRange("diese-woche", new Date("2026-07-15T12:00:00.000Z"));
    expect(result.dateFrom).toBe(new Date(2026, 6, 13, 0, 0, 0, 0).toISOString());
    expect(result.dateTo).toBe(new Date(2026, 6, 19, 23, 59, 59, 999).toISOString());
  });

  it("handles a Sunday correctly for 'diese-woche' (week already started Monday)", () => {
    // 2026-07-19 is a Sunday
    const result = zeitraumToDateRange("diese-woche", new Date("2026-07-19T12:00:00.000Z"));
    expect(result.dateFrom).toBe(new Date(2026, 6, 13, 0, 0, 0, 0).toISOString());
    expect(result.dateTo).toBe(new Date(2026, 6, 19, 23, 59, 59, 999).toISOString());
  });

  it("returns the calendar month for 'dieser-monat'", () => {
    const result = zeitraumToDateRange("dieser-monat", new Date("2026-07-15T12:00:00.000Z"));
    expect(result.dateFrom).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).toISOString());
    expect(result.dateTo).toBe(new Date(2026, 6, 31, 23, 59, 59, 999).toISOString());
  });

  it("returns no bounds for 'zeitraum' (custom range handled separately by the caller)", () => {
    const result = zeitraumToDateRange("zeitraum", new Date("2026-07-15T12:00:00.000Z"));
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest dateRange`
Expected: FAIL — `app/src/lib/dateRange.ts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/lib/dateRange.ts`:

```ts
export type ZeitraumOption = "alle" | "diese-woche" | "dieser-monat" | "zeitraum";

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday, 0, 0, 0, 0);
}

export function zeitraumToDateRange(
  zeitraum: ZeitraumOption,
  now: Date,
): { dateFrom?: string; dateTo?: string } {
  if (zeitraum === "diese-woche") {
    const monday = startOfWeekMonday(now);
    const sunday = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + 6,
      23,
      59,
      59,
      999,
    );
    return { dateFrom: monday.toISOString(), dateTo: sunday.toISOString() };
  }

  if (zeitraum === "dieser-monat") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { dateFrom: first.toISOString(), dateTo: last.toISOString() };
  }

  return {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest dateRange`
Expected: PASS.

- [ ] **Step 5: Write the failing category-filter test**

Add to `app/__tests__/filterEvents.test.ts`, inside `describe("filterEvents", ...)`:

```ts
  it("filters by category when set", () => {
    const wein = makeEvent({ id: "wein", category: "weinfest" });
    const konzert = makeEvent({ id: "konzert", category: "konzert" });

    const result = filterEvents([wein, konzert], { category: "weinfest" });

    expect(result.map((e) => e.id)).toEqual(["wein"]);
  });

  it("returns all categories when no category filter is set", () => {
    const wein = makeEvent({ id: "wein", category: "weinfest" });
    const konzert = makeEvent({ id: "konzert", category: "konzert" });
    expect(filterEvents([wein, konzert], {})).toHaveLength(2);
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd app && npx jest filterEvents -t "category"`
Expected: FAIL — `EventFilters` has no `category` field yet, filter has no effect.

- [ ] **Step 7: Implement the category filter**

In `app/src/lib/filterEvents.ts`, add `category` to the `EventFilters` interface:

```ts
export interface EventFilters {
  origin?: { lat: number; lon: number };
  radiusMeters?: number;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
}
```

Add a check inside the `filter(...)` callback, after the existing `dateTo` check and before `return true;`:

```ts
    if (filters.category && event.category !== filters.category) return false;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd app && npx jest filterEvents`
Expected: PASS, all tests green.

- [ ] **Step 9: Wire chips and date-range inputs into FeedScreen**

Replace the full contents of `app/src/demo/FeedScreen.tsx`:

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { zeitraumToDateRange, type ZeitraumOption } from "../lib/dateRange";
import { filterEvents } from "../lib/filterEvents";
import { getEvents } from "../lib/getEvents";
import type { EventRecord } from "../lib/types";
import { EventPostCard } from "./EventPostCard";
import { toDisplayEvent } from "./eventDisplay";
import { FilterChips, type ChipOption } from "./FilterChips";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const EVENTS_URL = "https://lucas9602.github.io/event-discovery-data/events.json";
const RADIUS_STEP_METERS = 15000;
const MAX_RADIUS_METERS = 100000;

const CATEGORY_OPTIONS: ChipOption[] = [
  { value: "alle", label: "Alle" },
  { value: "weinfest", label: "Weinfest" },
  { value: "dorffest", label: "Dorffest & Feste" },
  { value: "konzert", label: "Konzert" },
  { value: "markt", label: "Markt" },
  { value: "fuehrung-tour", label: "Führung & Tour" },
  { value: "vereinsleben", label: "Vereinsleben" },
  { value: "geselligkeit", label: "Geselligkeit" },
  { value: "kultur", label: "Kultur" },
  { value: "sonstiges", label: "Sonstiges" },
];

const ZEITRAUM_OPTIONS: ChipOption[] = [
  { value: "alle", label: "Alle" },
  { value: "diese-woche", label: "Diese Woche" },
  { value: "dieser-monat", label: "Dieser Monat" },
  { value: "zeitraum", label: "Zeitraum wählen" },
];

function toStartOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  return new Date(`${dateText}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  return new Date(`${dateText}T23:59:59.999Z`).toISOString();
}

export function FeedScreen() {
  const { colors } = useTheme();
  const { origin, radiusMeters, setRadiusMeters } = useLocation();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState("alle");
  const [zeitraum, setZeitraum] = useState<ZeitraumOption>("alle");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        topbar: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
        word: { fontSize: 16, fontWeight: "800", color: colors.text },
        sub: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
        customDateRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
        customDateInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.text },
        empty: { alignItems: "center", padding: 32, gap: 12 },
        emptyText: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
        emptyButton: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
        emptyButtonText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
      }),
    [colors],
  );

  const loadEvents = useCallback(() => {
    return getEvents((url) => fetch(url).then((res) => res.text()), AsyncStorage, EVENTS_URL).then(setEvents);
  }, []);

  useEffect(() => {
    loadEvents().finally(() => setLoading(false));
  }, [loadEvents]);

  function onRefresh() {
    setRefreshing(true);
    loadEvents().finally(() => setRefreshing(false));
  }

  const presetRange = zeitraumToDateRange(zeitraum, new Date());
  const dateFrom = zeitraum === "zeitraum" ? toStartOfDayIso(customFrom) : presetRange.dateFrom;
  const dateTo = zeitraum === "zeitraum" ? toEndOfDayIso(customTo) : presetRange.dateTo;

  const visibleEvents = filterEvents(events, {
    ...(origin ? { origin, radiusMeters } : {}),
    ...(category !== "alle" ? { category } : {}),
    dateFrom,
    dateTo,
  }).map(toDisplayEvent);

  function widenRadius() {
    setRadiusMeters(Math.min(radiusMeters + RADIUS_STEP_METERS, MAX_RADIUS_METERS));
  }

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.word}>Lokalfeste</Text>
        <Text style={styles.sub}>
          Alle Feste · {Math.round(radiusMeters / 1000)} km um {origin?.label ?? ""}
        </Text>
      </View>
      <FilterChips options={CATEGORY_OPTIONS} selected={category} onSelect={setCategory} />
      <FilterChips
        options={ZEITRAUM_OPTIONS}
        selected={zeitraum}
        onSelect={(value) => setZeitraum(value as ZeitraumOption)}
      />
      {zeitraum === "zeitraum" ? (
        <View style={styles.customDateRow}>
          <TextInput
            placeholder="Von (JJJJ-MM-TT)"
            placeholderTextColor={colors.textMuted}
            value={customFrom}
            onChangeText={setCustomFrom}
            style={styles.customDateInput}
          />
          <TextInput
            placeholder="Bis (JJJJ-MM-TT)"
            placeholderTextColor={colors.textMuted}
            value={customTo}
            onChangeText={setCustomTo}
            style={styles.customDateInput}
          />
        </View>
      ) : null}
      <FlatList
        data={visibleEvents}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EventPostCard event={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : events.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Keine Events verfügbar — später nochmal versuchen.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Keine Feste im Umkreis von {Math.round(radiusMeters / 1000)} km gefunden.
              </Text>
              <Pressable style={styles.emptyButton} onPress={widenRadius}>
                <Text style={styles.emptyButtonText}>Umkreis vergrößern (+15 km)</Text>
              </Pressable>
            </View>
          )
        }
      />
    </View>
  );
}
```

- [ ] **Step 10: Run the full app test suite**

Run: `cd app && npx jest`
Expected: PASS, full suite green (including the existing FeedScreen-adjacent tests, if any render it indirectly — check for `ProfileScreen.test.tsx`/others that might import `FeedScreen`; none currently do per the existing test file list, so no other suite should be affected).

- [ ] **Step 11: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add app/src/lib/dateRange.ts app/__tests__/dateRange.test.ts app/src/lib/filterEvents.ts app/__tests__/filterEvents.test.ts app/src/demo/FeedScreen.tsx
git commit -m "feat(app): category + Zeitraum filter chips on the feed"
```

---

## Final Steps (after all tasks)

- [ ] Run both full test suites once more from the repo root: `cd scraper && npx vitest run && cd ../app && npx jest`
- [ ] Typecheck both: `cd scraper && npx tsc --noEmit && cd ../app && npx tsc --noEmit`
- [ ] Push to `scraper-core`. The next scheduled scrape run (or a manual `workflow_dispatch`) will regenerate `events.json` with cleaned descriptions, the new category set, and internal-business events dropped — no manual data migration needed.
