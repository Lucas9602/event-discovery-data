import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  geocodeAddress,
  geocodeRawEvent,
  geocodeWithCache,
  loadGeocodeCache,
  saveGeocodeCache,
  type GeocodeCache,
} from "../src/geocode";
import type { RawEvent } from "../src/types";

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

describe("loadGeocodeCache / saveGeocodeCache", () => {
  it("returns an empty cache when the file does not exist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "geocode-cache-"));
    try {
      const cache = loadGeocodeCache(path.join(dir, "geocode-cache.json"));
      expect(cache).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips a cache through save and load", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "geocode-cache-"));
    try {
      const cachePath = path.join(dir, "geocode-cache.json");
      const cache = { "marktplatz ihringen": { lat: 48.03, lon: 7.65 } };
      saveGeocodeCache(cachePath, cache);
      expect(loadGeocodeCache(cachePath)).toEqual(cache);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("geocodeRawEvent", () => {
  it("leaves an event with existing coordinates untouched", async () => {
    const event: RawEvent = {
      title: "Weinfest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://example.test/1",
      location: { name: "Marktplatz", lat: 48.03, lon: 7.65 },
    };
    const fetchText = vi.fn();
    const result = await geocodeRawEvent(event, {}, fetchText, vi.fn());
    expect(result).toEqual(event);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("geocodes an event whose location has a name but no coordinates", async () => {
    const event: RawEvent = {
      title: "Weinfest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://example.test/1",
      location: { name: "Marktplatz Ihringen" },
    };
    const fetchText = vi.fn().mockResolvedValue(NOMINATIM_RESPONSE);
    const result = await geocodeRawEvent(event, {}, fetchText, vi.fn().mockResolvedValue(undefined));
    expect(result.location).toEqual({ name: "Marktplatz Ihringen", lat: 48.0301, lon: 7.6501 });
  });

  it("returns the event unchanged when there is no location to geocode", async () => {
    const event: RawEvent = {
      title: "Weinfest",
      start: "2026-08-15T18:00:00.000Z",
      sourceUrl: "https://example.test/1",
    };
    const result = await geocodeRawEvent(event, {}, vi.fn(), vi.fn());
    expect(result).toEqual(event);
  });
});
