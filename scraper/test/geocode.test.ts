import { describe, expect, it, vi } from "vitest";
import { geocodeAddress, geocodeWithCache, type GeocodeCache } from "../src/geocode";

const NOMINATIM_RESPONSE = JSON.stringify([{ lat: "48.0301", lon: "7.6501" }]);
const EMPTY_RESPONSE = JSON.stringify([]);

describe("geocodeAddress", () => {
  it("parses lat/lon from a Nominatim-style JSON response", async () => {
    const fetchText = vi.fn().mockResolvedValue(NOMINATIM_RESPONSE);
    const result = await geocodeAddress("Marktplatz Ihringen", fetchText);
    expect(result).toEqual({ lat: 48.0301, lon: 7.6501 });
    expect(fetchText).toHaveBeenCalledWith(
      expect.stringContaining("nominatim.openstreetmap.org/search"),
    );
  });

  it("returns null when there are no results", async () => {
    const fetchText = vi.fn().mockResolvedValue(EMPTY_RESPONSE);
    const result = await geocodeAddress("Nonexistent Place XYZ", fetchText);
    expect(result).toBeNull();
  });
});

describe("geocodeWithCache", () => {
  it("returns a cached value without calling fetchText or sleep", async () => {
    const cache: GeocodeCache = { "marktplatz ihringen": { lat: 48.03, lon: 7.65 } };
    const fetchText = vi.fn();
    const sleep = vi.fn();

    const result = await geocodeWithCache("Marktplatz Ihringen", cache, fetchText, sleep);

    expect(result).toEqual({ lat: 48.03, lon: 7.65 });
    expect(fetchText).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("on cache miss, calls fetchText, sleeps, and stores the result in the cache", async () => {
    const cache: GeocodeCache = {};
    const fetchText = vi.fn().mockResolvedValue(NOMINATIM_RESPONSE);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await geocodeWithCache("Marktplatz Ihringen", cache, fetchText, sleep);

    expect(result).toEqual({ lat: 48.0301, lon: 7.6501 });
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1100);
    expect(cache["marktplatz ihringen"]).toEqual({ lat: 48.0301, lon: 7.6501 });
  });

  it("caches a null result too, so a second call for the same address does not re-fetch", async () => {
    const cache: GeocodeCache = {};
    const fetchText = vi.fn().mockResolvedValue(EMPTY_RESPONSE);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await geocodeWithCache("Unknown Place", cache, fetchText, sleep);
    const second = await geocodeWithCache("Unknown Place", cache, fetchText, sleep);

    expect(second).toBeNull();
    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(cache["unknown place"]).toBeNull();
  });
});
