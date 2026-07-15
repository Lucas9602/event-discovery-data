import { describe, expect, it } from "vitest";
import { cleanDescription, computeEventId, dedupKey, normalizeCategory, normalizeTitle } from "../src/normalize";
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

  it("falls back to sonstiges for unknown or missing input with no text to infer from", () => {
    expect(normalizeCategory("Feuerwerk")).toBe("sonstiges");
    expect(normalizeCategory(undefined)).toBe("sonstiges");
  });

  it("infers weinfest from title/description keywords when raw category is missing", () => {
    expect(normalizeCategory(undefined, "Winzerfest Ihringen")).toBe("weinfest");
    expect(normalizeCategory(undefined, "Weinprobe bei der Genossenschaft")).toBe("weinfest");
  });

  it("infers dorffest from title/description keywords", () => {
    expect(normalizeCategory(undefined, "Dorffest am Marktplatz")).toBe("dorffest");
    expect(normalizeCategory(undefined, "Sommerfest der Gemeinde")).toBe("dorffest");
  });

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

  it("infers konzert from title/description keywords", () => {
    expect(normalizeCategory(undefined, "Jahreskonzert des Musikvereins")).toBe("konzert");
  });

  it("infers markt from title/description keywords", () => {
    expect(normalizeCategory(undefined, "Weihnachtsmarkt in der Altstadt")).toBe("markt");
  });

  it("prefers an explicit raw category over inference", () => {
    expect(normalizeCategory("markt", "Jahreskonzert des Musikvereins")).toBe("markt");
  });

  it("falls back to sonstiges when no keyword matches, even with text provided", () => {
    expect(normalizeCategory(undefined, "Generalversammlung des Fanclubs")).toBe("sonstiges");
  });
});

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
