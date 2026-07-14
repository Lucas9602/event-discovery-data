import { buildIcsContent } from "../src/lib/ics";
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

describe("buildIcsContent", () => {
  it("produces a VEVENT block with start/end and metadata", () => {
    const ics = buildIcsContent(makeEvent());
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:1@event-discovery-app");
    expect(ics).toContain("DTSTART:20260815T180000Z");
    expect(ics).toContain("DTEND:20260815T200000Z");
    expect(ics).toContain("SUMMARY:Weinfest");
    expect(ics).toContain("LOCATION:Marktplatz Ihringen");
    expect(ics).toContain("URL:https://example.test/1");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("defaults the end time to start + 2 hours when event.end is missing", () => {
    const ics = buildIcsContent(makeEvent({ start: "2026-08-15T10:00:00.000Z" }));
    expect(ics).toContain("DTSTART:20260815T100000Z");
    expect(ics).toContain("DTEND:20260815T120000Z");
  });

  it("uses event.end when present instead of the default duration", () => {
    const ics = buildIcsContent(makeEvent({ end: "2026-08-15T23:00:00.000Z" }));
    expect(ics).toContain("DTEND:20260815T230000Z");
  });

  it("escapes commas, semicolons, and backslashes in text fields", () => {
    const ics = buildIcsContent(makeEvent({ title: "Wein, Musik; Tanz \\ Spaß", description: "Line1\nLine2" }));
    expect(ics).toContain("SUMMARY:Wein\\, Musik\\; Tanz \\\\ Spaß");
    expect(ics).toContain("DESCRIPTION:Line1\\nLine2");
  });

  it("falls back to location.address when location.name is missing", () => {
    const ics = buildIcsContent(makeEvent({ location: { address: "Hauptstraße 1, Ihringen" } }));
    expect(ics).toContain("LOCATION:Hauptstraße 1\\, Ihringen");
  });
});
