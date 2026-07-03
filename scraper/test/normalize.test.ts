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
