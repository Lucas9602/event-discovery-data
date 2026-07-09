import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { templateScraperAdapter } from "../../src/adapters/templateScraper";
import type { Source } from "../../src/types";

const fixtureHtml = readFileSync(
  path.join(__dirname, "../fixtures/template-scraper.html"),
  "utf-8",
);
const templateConfig = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../config/templates/example-cms.json"),
    "utf-8",
  ),
);

const source: Source = {
  id: "test-template-source",
  name: "Test Template Source",
  url: "https://example.test/veranstaltungen",
  region: "test-region",
  adapterType: "template-scraper",
  adapterConfig: { template: templateConfig },
  legal: { basis: "public", robotsChecked: "2026-07-03" },
  active: true,
};

describe("templateScraperAdapter", () => {
  it("extracts events using the CSS selectors from adapterConfig.template", async () => {
    const events = await templateScraperAdapter.fetchEvents(source, async () => fixtureHtml);
    expect(events).toHaveLength(2);

    const [first] = events;
    expect(first.title).toBe("Winzerfest Testhausen");
    expect(first.description).toBe("Weinprobe und Livemusik.");
    expect(first.location?.name).toBe("Winzergenossenschaft");
    expect(first.start).toBe(new Date(2026, 7, 15).toISOString());
    expect(first.sourceUrl).toBe("https://example.test/veranstaltungen/winzerfest");
  });

  it("falls back to the source URL when no link is present", async () => {
    const events = await templateScraperAdapter.fetchEvents(source, async () => fixtureHtml);
    expect(events[1].sourceUrl).toBe(source.url);
    expect(events[1].description).toBeUndefined();
  });

  it("throws a clear error when adapterConfig.template is missing", async () => {
    const badSource = { ...source, adapterConfig: {} };
    await expect(
      templateScraperAdapter.fetchEvents(badSource, async () => fixtureHtml),
    ).rejects.toThrow("template-scraper requires adapterConfig.template");
  });
});
