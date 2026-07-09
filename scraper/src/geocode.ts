import { readFileSync, writeFileSync } from "node:fs";
import { normalizeTitle } from "./normalize";
import type { RawEvent } from "./types";

export type GeocodeCache = Record<string, { lat: number; lon: number } | null>;

const NOMINATIM_DELAY_MS = 1100;

export async function geocodeAddress(
  address: string,
  fetchText: (url: string) => Promise<string>,
): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const text = await fetchText(url);
  const results = JSON.parse(text) as { lat: string; lon: string }[];

  if (results.length === 0) return null;

  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
}

export async function geocodeWithCache(
  address: string,
  cache: GeocodeCache,
  fetchText: (url: string) => Promise<string>,
  sleep: (ms: number) => Promise<void>,
): Promise<{ lat: number; lon: number } | null> {
  const key = normalizeTitle(address);

  if (key in cache) {
    return cache[key];
  }

  const result = await geocodeAddress(address, fetchText);
  await sleep(NOMINATIM_DELAY_MS);
  cache[key] = result;
  return result;
}

export function loadGeocodeCache(cachePath: string): GeocodeCache {
  try {
    return JSON.parse(readFileSync(cachePath, "utf-8")) as GeocodeCache;
  } catch {
    return {};
  }
}

export function saveGeocodeCache(cachePath: string, cache: GeocodeCache): void {
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

export async function geocodeRawEvent(
  rawEvent: RawEvent,
  cache: GeocodeCache,
  fetchText: (url: string) => Promise<string>,
  sleep: (ms: number) => Promise<void>,
): Promise<RawEvent> {
  const location = rawEvent.location;
  const hasCoords = typeof location?.lat === "number" && typeof location?.lon === "number";
  const addressText = location?.name || location?.address;

  if (hasCoords || !addressText) {
    return rawEvent;
  }

  const coords = await geocodeWithCache(addressText, cache, fetchText, sleep);
  if (!coords) return rawEvent;

  return { ...rawEvent, location: { ...location, ...coords } };
}
