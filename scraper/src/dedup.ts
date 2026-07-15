import { distanceMeters } from "./geo";
import { cleanDescription, computeEventId, dedupKey, isInternalClubBusiness, normalizeCategory } from "./normalize";
import type { AdapterType, EventRecord, RawEvent } from "./types";

const ADAPTER_PRIORITY: AdapterType[] = [
  "ical",
  "rss",
  "schema-org",
  "template-scraper",
  "ai-generic",
  "custom-scraper",
];

function priorityRank(adapterType: AdapterType): number {
  const idx = ADAPTER_PRIORITY.indexOf(adapterType);
  return idx === -1 ? ADAPTER_PRIORITY.length : idx;
}

const MAX_MERGE_DISTANCE_METERS = 500;

export interface DedupEntry {
  rawEvent: RawEvent;
  sourceId: string;
  adapterType: AdapterType;
  region: string;
}

function canMerge(a: DedupEntry, b: DedupEntry): boolean {
  const locA = a.rawEvent.location;
  const locB = b.rawEvent.location;
  const hasCoordsA = typeof locA?.lat === "number" && typeof locA?.lon === "number";
  const hasCoordsB = typeof locB?.lat === "number" && typeof locB?.lon === "number";

  if (!hasCoordsA || !hasCoordsB) return true;

  const distance = distanceMeters(
    { lat: locA!.lat!, lon: locA!.lon! },
    { lat: locB!.lat!, lon: locB!.lon! },
  );
  return distance <= MAX_MERGE_DISTANCE_METERS;
}

export function mergeEvents(entries: DedupEntry[], nowIso: string): EventRecord[] {
  const publicEntries = entries.filter(
    (entry) => !isInternalClubBusiness(entry.rawEvent.title),
  );

  const buckets = new Map<string, DedupEntry[][]>();

  for (const entry of publicEntries) {
    const key = dedupKey(entry.rawEvent.title, entry.rawEvent.start);
    const groups = buckets.get(key) ?? [];

    const matchingGroup = groups.find((group) => group.every((existing) => canMerge(existing, entry)));
    if (matchingGroup) {
      matchingGroup.push(entry);
    } else {
      groups.push([entry]);
    }

    buckets.set(key, groups);
  }

  const records: EventRecord[] = [];

  for (const groups of buckets.values()) {
    for (const group of groups) {
      const sorted = [...group].sort(
        (a, b) => priorityRank(a.adapterType) - priorityRank(b.adapterType),
      );
      const canonical = sorted[0];

      const inferenceText = [canonical.rawEvent.title, canonical.rawEvent.description]
        .filter(Boolean)
        .join(" ");

      records.push({
        id: computeEventId(canonical.rawEvent, canonical.region),
        title: canonical.rawEvent.title,
        description: canonical.rawEvent.description
          ? cleanDescription(canonical.rawEvent.description)
          : undefined,
        start: canonical.rawEvent.start,
        end: canonical.rawEvent.end,
        location: canonical.rawEvent.location ?? {},
        category: normalizeCategory(canonical.rawEvent.category, inferenceText),
        sourceIds: group.map((e) => e.sourceId),
        sourceUrl: canonical.rawEvent.sourceUrl,
        region: canonical.region,
        lastSeenAt: nowIso,
      });
    }
  }

  return records;
}
