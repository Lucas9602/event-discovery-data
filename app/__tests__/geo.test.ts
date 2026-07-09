import { distanceMeters } from "../src/lib/geo";

describe("distanceMeters", () => {
  it("returns ~0 for identical coordinates", () => {
    const p = { lat: 48.0836, lon: 7.6572 };
    expect(distanceMeters(p, p)).toBeLessThan(1);
  });

  it("returns the correct order of magnitude for a known distance", () => {
    const freiburg = { lat: 47.999, lon: 7.8421 };
    const emmendingen = { lat: 48.1206, lon: 7.8497 };
    const d = distanceMeters(freiburg, emmendingen);
    expect(d).toBeGreaterThan(12000);
    expect(d).toBeLessThan(15000);
  });
});
