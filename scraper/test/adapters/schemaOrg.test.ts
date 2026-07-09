import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { schemaOrgAdapter } from "../../src/adapters/schemaOrg";
import type { Source } from "../../src/types";

const fixture = readFileSync(
  path.join(__dirname, "../fixtures/schema-org.html"),
  "utf-8",
);

const source: Source = {
  id: "test-schema-source",
  name: "Test Schema.org Source",
  url: "https://example.test/veranstaltungen",
  region: "test-region",
  adapterType: "schema-org",
  adapterConfig: {},
  legal: { basis: "public", robotsChecked: "2026-07-03" },
  active: true,
};

describe("schemaOrgAdapter", () => {
  it("extracts a single-object JSON-LD Event", async () => {
    const events = await schemaOrgAdapter.fetchEvents(source, async () => fixture);
    const herbstmarkt = events.find((e) => e.title === "Herbstmarkt Testort");
    expect(herbstmarkt).toBeDefined();
    expect(herbstmarkt?.location?.name).toBe("Rathausplatz");
    expect(herbstmarkt?.sourceUrl).toBe("https://example.test/herbstmarkt");
  });

  it("extracts events from a JSON-LD array and falls back to the source URL", async () => {
    const events = await schemaOrgAdapter.fetchEvents(source, async () => fixture);
    const konzert = events.find((e) => e.title === "Konzert in der Kirche");
    expect(konzert).toBeDefined();
    expect(konzert?.sourceUrl).toBe(source.url);
  });

  it("returns exactly two events for the fixture", async () => {
    const events = await schemaOrgAdapter.fetchEvents(source, async () => fixture);
    expect(events).toHaveLength(2);
  });
});
