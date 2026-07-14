export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

function shortLabel(displayName: string): string {
  return displayName.split(",")[0].trim();
}

export async function geocodeForward(
  query: string,
  fetchText: (url: string) => Promise<string>,
): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(query)}`;
  const text = await fetchText(url);
  const results = JSON.parse(text) as { lat: string; lon: string; display_name: string }[];

  if (results.length === 0) return null;

  const first = results[0];
  return { lat: parseFloat(first.lat), lon: parseFloat(first.lon), label: shortLabel(first.display_name) };
}

export async function geocodeReverse(
  lat: number,
  lon: number,
  fetchText: (url: string) => Promise<string>,
): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const text = await fetchText(url);
  const result = JSON.parse(text) as { display_name?: string };

  if (!result.display_name) return null;

  return shortLabel(result.display_name);
}
