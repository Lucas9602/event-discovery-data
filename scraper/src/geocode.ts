import { normalizeTitle } from "./normalize";

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
