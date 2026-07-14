import { toDisplayEvent } from "../src/demo/eventDisplay";
import type { EventRecord } from "../src/lib/types";

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "1",
    title: "Test Event",
    start: "2026-08-15T18:00:00.000Z",
    location: { name: "Marktplatz" },
    category: "weinfest",
    sourceIds: ["a"],
    sourceUrl: "https://example.test/1",
    region: "test-region",
    lastSeenAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("toDisplayEvent", () => {
  it.each([
    ["weinfest", "#b3123d", "lokalfeste-wein"],
    ["dorffest", "#3a6b5c", "lokalfeste-sommer"],
    ["vereins-sportfest", "#c07a1e", "lokalfeste-sport"],
    ["markt", "#5b3a6e", "lokalfeste-markt"],
    ["konzert", "#2b5f8a", "lokalfeste-konzert"],
    ["sonstiges", "#5a5a5a", "lokalfeste-sonstiges"],
  ])("maps category %s to accent %s and image seed %s", (category, accent, seed) => {
    const result = toDisplayEvent(makeEvent({ category }));
    expect(result.accent).toBe(accent);
    expect(result.image).toBe(`https://picsum.photos/seed/${seed}/700/700`);
  });

  it("falls back to the sonstiges style for an unrecognized category", () => {
    const result = toDisplayEvent(makeEvent({ category: "unknown-category" }));
    expect(result.accent).toBe("#5a5a5a");
    expect(result.image).toBe("https://picsum.photos/seed/lokalfeste-sonstiges/700/700");
  });

  it("passes through all other EventRecord fields unchanged", () => {
    const event = makeEvent({ description: "Test description" });
    const result = toDisplayEvent(event);
    expect(result.id).toBe(event.id);
    expect(result.title).toBe(event.title);
    expect(result.description).toBe(event.description);
    expect(result.start).toBe(event.start);
    expect(result.location).toEqual(event.location);
    expect(result.category).toBe(event.category);
    expect(result.sourceIds).toEqual(event.sourceIds);
    expect(result.sourceUrl).toBe(event.sourceUrl);
    expect(result.region).toBe(event.region);
    expect(result.lastSeenAt).toBe(event.lastSeenAt);
  });
});
