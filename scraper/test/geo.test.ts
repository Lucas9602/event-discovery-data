import { describe, expect, it } from "vitest";
import { distanceMeters } from "../src/geo";

describe("distanceMeters", () => {
  it("returns ~0 for identical coordinates", () => {
    const p = { lat: 48.0836, lon: 7.6572 };
    expect(distanceMeters(p, p)).toBeLessThan(1);
  });

  it("returns the correct order of magnitude for a known distance", () => {
    // Freiburg im Breisgau (47.9990, 7.8421) to Emmendingen (48.1206, 7.8497)
    // real-world distance is ~13.6 km
    const freiburg = { lat: 47.999, lon: 7.8421 };
    const emmendingen = { lat: 48.1206, lon: 7.8497 };
    const d = distanceMeters(freiburg, emmendingen);
    expect(d).toBeGreaterThan(12000);
    expect(d).toBeLessThan(15000);
  });

  it("is symmetric", () => {
    const a = { lat: 48.05, lon: 7.6 };
    const b = { lat: 48.06, lon: 7.65 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});
