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
