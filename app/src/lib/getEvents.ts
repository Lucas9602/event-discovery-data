import type { EventRecord } from "./types";

const CACHE_KEY = "events-cache-v1";

export interface EventStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export async function getEvents(
  fetchText: (url: string) => Promise<string>,
  storage: EventStorage,
  url: string,
): Promise<EventRecord[]> {
  try {
    const text = await fetchText(url);
    await storage.setItem(CACHE_KEY, text);
    return JSON.parse(text) as EventRecord[];
  } catch {
    const cached = await storage.getItem(CACHE_KEY);
    if (!cached) return [];
    return JSON.parse(cached) as EventRecord[];
  }
}
