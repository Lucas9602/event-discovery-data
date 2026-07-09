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
