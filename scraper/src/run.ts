import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { icalAdapter } from "./adapters/ical";
import { rssAdapter } from "./adapters/rss";
import { schemaOrgAdapter } from "./adapters/schemaOrg";
import { templateScraperAdapter } from "./adapters/templateScraper";
import { aiGenericAdapter } from "./adapters/aiGeneric";
import { getAdapter, registerAdapter } from "./adapters/registry";
import { type DedupEntry, mergeEvents } from "./dedup";
import { updateHealth } from "./health";
import type { EventRecord, Region, Source, SourceHealth } from "./types";

registerAdapter(icalAdapter);
registerAdapter(rssAdapter);
registerAdapter(schemaOrgAdapter);
registerAdapter(templateScraperAdapter);
registerAdapter(aiGenericAdapter);

function readJsonFiles<T>(dir: string): T[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as T);
}

export interface RunScrapeOptions {
  regionsDir: string;
  sourcesDir: string;
  templatesDir: string;
  outDir: string;
  fetchText: (url: string) => Promise<string>;
  now: () => string;
}

export interface RunScrapeResult {
  events: EventRecord[];
  health: SourceHealth[];
}

function readPreviousHealth(outDir: string): Map<string, SourceHealth> {
  const healthPath = path.join(outDir, "health.json");
  try {
    const parsed = JSON.parse(readFileSync(healthPath, "utf-8")) as SourceHealth[];
    return new Map(parsed.map((h) => [h.sourceId, h]));
  } catch {
    return new Map();
  }
}

export async function runScrape(options: RunScrapeOptions): Promise<RunScrapeResult> {
  const nowIso = options.now();

  const regions = readJsonFiles<Region>(options.regionsDir);
  if (regions.length === 0) {
    throw new Error(`No region config found in ${options.regionsDir}`);
  }

  const allFiles = readJsonFiles<Source>(options.sourcesDir);
  const sources = allFiles.filter((s) => s.active);
  const previousHealth = readPreviousHealth(options.outDir);

  const dedupEntries: DedupEntry[] = [];
  const health: SourceHealth[] = [];

  for (const source of sources) {
    let resolvedSource = source;

    const templateName = source.adapterConfig.templateName as string | undefined;
    if (source.adapterType === "template-scraper" && templateName) {
      const templatePath = path.join(options.templatesDir, `${templateName}.json`);
      const template = JSON.parse(readFileSync(templatePath, "utf-8"));
      resolvedSource = { ...source, adapterConfig: { ...source.adapterConfig, template } };
    }

    const previous = previousHealth.get(source.id);
    let outcome = { success: false, eventCount: 0 };

    try {
      const adapter = getAdapter(source.adapterType);
      const rawEvents = await adapter.fetchEvents(resolvedSource, options.fetchText);

      for (const rawEvent of rawEvents) {
        dedupEntries.push({
          rawEvent,
          sourceId: source.id,
          adapterType: source.adapterType,
          region: source.region,
        });
      }

      outcome = { success: true, eventCount: rawEvents.length };
    } catch {
      // outcome stays { success: false, eventCount: 0 }
    }

    health.push(updateHealth(previous, source.id, outcome, nowIso));
  }

  const events = mergeEvents(dedupEntries, nowIso);

  mkdirSync(options.outDir, { recursive: true });
  writeFileSync(path.join(options.outDir, "events.json"), JSON.stringify(events, null, 2));
  writeFileSync(path.join(options.outDir, "health.json"), JSON.stringify(health, null, 2));

  return { events, health };
}

async function main() {
  const root = path.join(import.meta.dirname, "..");
  const result = await runScrape({
    regionsDir: path.join(root, "config/regions"),
    sourcesDir: path.join(root, "config/sources"),
    templatesDir: path.join(root, "config/templates"),
    outDir: path.join(root, "..", "data"),
    fetchText: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fetch failed for ${url}: ${res.status}`);
      return res.text();
    },
    now: () => new Date().toISOString(),
  });
  console.log(`Wrote ${result.events.length} events, ${result.health.length} health records.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
