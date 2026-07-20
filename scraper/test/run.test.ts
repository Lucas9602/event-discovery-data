// scraper/test/run.test.ts
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeResponseText, runScrape } from "../src/run";

const fixturesDir = path.join(__dirname, "fixtures/run");
const brokenTemplateFixturesDir = path.join(__dirname, "fixtures/run-template-broken");
const icalFixture = readFileSync(path.join(__dirname, "fixtures/sample.ics"), "utf-8");
const templateHtmlFixture = readFileSync(
  path.join(__dirname, "fixtures/template-scraper.html"),
  "utf-8",
);

function fakeFetchText(url: string): Promise<string> {
  if (url === "fixture://ical") return Promise.resolve(icalFixture);
  if (url === "fixture://template") return Promise.resolve(templateHtmlFixture);
  if (url.startsWith("https://nominatim.openstreetmap.org/")) return Promise.resolve("[]");
  throw new Error(`Unexpected fixture URL: ${url}`);
}

describe("runScrape", () => {
  it("loads config, runs adapters, dedupes, and writes events.json + health.json", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "scrape-out-"));

    try {
      const result = await runScrape({
        regionsDir: fixturesDir,
        sourcesDir: fixturesDir,
        templatesDir: fixturesDir,
        outDir,
        geocodeCachePath: path.join(outDir, "geocode-cache.json"),
        fetchText: fakeFetchText,
        sleep: async () => {},
        now: () => "2026-07-03T12:00:00.000Z",
      });

      // sample.ics has 2 events, template-scraper.html has 2 events, none collide
      expect(result.events).toHaveLength(4);
      expect(result.health).toHaveLength(2);
      expect(result.health.every((h) => h.status === "ok")).toBe(true);

      const writtenEvents = JSON.parse(
        readFileSync(path.join(outDir, "events.json"), "utf-8"),
      );
      const writtenHealth = JSON.parse(
        readFileSync(path.join(outDir, "health.json"), "utf-8"),
      );
      expect(writtenEvents).toHaveLength(4);
      expect(writtenHealth).toHaveLength(2);
      expect(writtenEvents[0].region).toBe("test-region");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("records a broken source instead of crashing the whole run", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "scrape-out-"));

    try {
      const failingFetch = () => Promise.reject(new Error("network down"));
      const result = await runScrape({
        regionsDir: fixturesDir,
        sourcesDir: fixturesDir,
        templatesDir: fixturesDir,
        outDir,
        geocodeCachePath: path.join(outDir, "geocode-cache.json"),
        fetchText: failingFetch,
        sleep: async () => {},
        now: () => "2026-07-03T12:00:00.000Z",
      });

      expect(result.events).toHaveLength(0);
      expect(result.health).toHaveLength(2);
      expect(result.health.every((h) => h.consecutiveFailures === 1)).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("records a broken template resolution instead of crashing the whole run", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "scrape-out-"));

    try {
      const result = await runScrape({
        regionsDir: fixturesDir,
        sourcesDir: brokenTemplateFixturesDir,
        templatesDir: fixturesDir,
        outDir,
        geocodeCachePath: path.join(outDir, "geocode-cache.json"),
        fetchText: fakeFetchText,
        sleep: async () => {},
        now: () => "2026-07-03T12:00:00.000Z",
      });

      // The ical source has no template dependency and should still succeed;
      // the template source's templateName points at a nonexistent file.
      expect(result.events).toHaveLength(2);
      expect(result.health).toHaveLength(2);

      const icalHealth = result.health.find((h) => h.sourceId === "test-ical-source");
      const brokenHealth = result.health.find(
        (h) => h.sourceId === "test-broken-template-source",
      );
      expect(icalHealth?.status).toBe("ok");
      expect(brokenHealth?.consecutiveFailures).toBe(1);
      expect(brokenHealth?.status).toBe("ok"); // 1 failure doesn't hit the "broken" threshold yet

      const writtenEvents = JSON.parse(
        readFileSync(path.join(outDir, "events.json"), "utf-8"),
      );
      const writtenHealth = JSON.parse(
        readFileSync(path.join(outDir, "health.json"), "utf-8"),
      );
      expect(writtenEvents).toHaveLength(2);
      expect(writtenHealth).toHaveLength(2);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("accumulates consecutiveFailures across multiple runs by reading the previous health.json", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "scrape-out-"));
    const failingFetch = () => Promise.reject(new Error("network down"));

    try {
      let result;
      for (let i = 0; i < 3; i++) {
        result = await runScrape({
          regionsDir: fixturesDir,
          sourcesDir: fixturesDir,
          templatesDir: fixturesDir,
          outDir,
          geocodeCachePath: path.join(outDir, "geocode-cache.json"),
          fetchText: failingFetch,
          sleep: async () => {},
          now: () => "2026-07-03T12:00:00.000Z",
        });
      }

      expect(result!.health.every((h) => h.consecutiveFailures === 3)).toBe(true);
      expect(result!.health.every((h) => h.status === "broken")).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("geocodes an event location that has a name but no coordinates", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "scrape-out-"));
    const geocodeFetch = (url: string) => {
      if (url === "fixture://ical" || url === "fixture://template") {
        return url === "fixture://ical" ? Promise.resolve(icalFixture) : Promise.resolve(templateHtmlFixture);
      }
      return Promise.resolve(JSON.stringify([{ lat: "48.03", lon: "7.65" }]));
    };

    try {
      const result = await runScrape({
        regionsDir: fixturesDir,
        sourcesDir: fixturesDir,
        templatesDir: fixturesDir,
        outDir,
        geocodeCachePath: path.join(outDir, "geocode-cache.json"),
        fetchText: geocodeFetch,
        sleep: async () => {},
        now: () => "2026-07-03T12:00:00.000Z",
      });

      const geocoded = result.events.find((e) => e.location.name === "Marktplatz Testort");
      expect(geocoded?.location.lat).toBeCloseTo(48.03);
      expect(geocoded?.location.lon).toBeCloseTo(7.65);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

describe("decodeResponseText", () => {
  it("decodes as UTF-8 when no charset is declared", () => {
    const buffer = new TextEncoder().encode("Bücherwürmer").buffer;
    expect(decodeResponseText(buffer, null)).toBe("Bücherwürmer");
  });

  it("decodes as UTF-8 when the Content-Type declares charset=utf-8", () => {
    const buffer = new TextEncoder().encode("Bücherwürmer").buffer;
    expect(decodeResponseText(buffer, "text/html; charset=utf-8")).toBe("Bücherwürmer");
  });

  it("honors a non-UTF-8 charset instead of always decoding as UTF-8", () => {
    const latin1Bytes = Buffer.from("Bücherwürmer", "latin1");
    const buffer = latin1Bytes.buffer.slice(
      latin1Bytes.byteOffset,
      latin1Bytes.byteOffset + latin1Bytes.byteLength,
    );
    expect(decodeResponseText(buffer, "text/html; charset=iso-8859-1")).toBe("Bücherwürmer");
  });
});
