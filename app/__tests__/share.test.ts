import { buildShareMessage } from "../src/lib/share";
import type { EventRecord } from "../src/lib/types";

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "1",
    title: "Weinfest",
    start: "2026-08-15T18:00:00.000Z",
    location: { name: "Marktplatz Ihringen" },
    category: "weinfest",
    sourceIds: ["a"],
    sourceUrl: "https://example.test/1",
    region: "test-region",
    lastSeenAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildShareMessage", () => {
  it("includes the title, location, and source URL", () => {
    const message = buildShareMessage(makeEvent());
    expect(message).toContain("Weinfest");
    expect(message).toContain("Marktplatz Ihringen");
    expect(message).toContain("https://example.test/1");
  });

  it("falls back to a question mark when the location name is missing", () => {
    const message = buildShareMessage(makeEvent({ location: {} }));
    expect(message).toContain(" in ?\n");
  });
});
