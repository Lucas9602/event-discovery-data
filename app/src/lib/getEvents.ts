import type { EventRecord } from "./types";

const CACHE_KEY = "events-cache-v1";

export interface EventStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function parseEvents(text: string): EventRecord[] | null {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as EventRecord[]) : null;
  } catch {
    return null;
  }
}

export async function getEvents(
  fetchText: (url: string) => Promise<string>,
  storage: EventStorage,
  url: string,
): Promise<EventRecord[]> {
  try {
    const text = await fetchText(url);
    const parsed = parseEvents(text);
    if (parsed) {
      await storage.setItem(CACHE_KEY, text);
      return parsed;
    }
  } catch {
    // network/fetch failure — fall through to cache below
  }

  const cached = await storage.getItem(CACHE_KEY);
  if (!cached) return [];
  return parseEvents(cached) ?? [];
}
