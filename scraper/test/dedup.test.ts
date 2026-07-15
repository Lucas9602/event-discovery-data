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

  it("sets lastSeenAt and defaults category to sonstiges when nothing can be inferred", () => {
    const a: RawEvent = {
      title: "Generalversammlung",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://a.test/1",
    };
    const merged = mergeEvents([entry(a, "source-a", "ical")], now);
    expect(merged[0].lastSeenAt).toBe(now);
    expect(merged[0].category).toBe("sonstiges");
  });

  it("infers category from the title when the raw category is missing", () => {
    const a: RawEvent = {
      title: "Jahreskonzert des Musikvereins",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://a.test/1",
    };
    const merged = mergeEvents([entry(a, "source-a", "ical")], now);
    expect(merged[0].category).toBe("konzert");
  });

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
});
