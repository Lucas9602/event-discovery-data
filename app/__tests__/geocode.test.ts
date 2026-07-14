import { geocodeForward, geocodeReverse } from "../src/lib/geocode";

const FORWARD_RESPONSE = JSON.stringify([
  {
    lat: "48.0301",
    lon: "7.6501",
    display_name: "Ihringen, Landkreis Breisgau-Hochschwarzwald, Baden-Württemberg, Deutschland",
  },
]);
const EMPTY_RESPONSE = JSON.stringify([]);
const REVERSE_RESPONSE = JSON.stringify({
  display_name: "Ihringen, Landkreis Breisgau-Hochschwarzwald, Baden-Württemberg, Deutschland",
});
const REVERSE_NO_RESULT = JSON.stringify({ error: "Unable to geocode" });

describe("geocodeForward", () => {
  it("parses lat/lon and a shortened label from a Nominatim-style response", async () => {
    const fetchText = jest.fn().mockResolvedValue(FORWARD_RESPONSE);
    const result = await geocodeForward("Ihringen", fetchText);
    expect(result).toEqual({ lat: 48.0301, lon: 7.6501, label: "Ihringen" });
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("nominatim.openstreetmap.org/search"));
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("countrycodes=de"));
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("q=Ihringen"));
  });

  it("returns null when there are no results", async () => {
    const fetchText = jest.fn().mockResolvedValue(EMPTY_RESPONSE);
    const result = await geocodeForward("Nonexistent Place XYZ", fetchText);
    expect(result).toBeNull();
  });
});

describe("geocodeReverse", () => {
  it("returns a shortened label from a Nominatim-style reverse response", async () => {
    const fetchText = jest.fn().mockResolvedValue(REVERSE_RESPONSE);
    const result = await geocodeReverse(48.03, 7.65, fetchText);
    expect(result).toBe("Ihringen");
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("nominatim.openstreetmap.org/reverse"));
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("lat=48.03"));
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("lon=7.65"));
  });

  it("returns null when the response has no display_name", async () => {
    const fetchText = jest.fn().mockResolvedValue(REVERSE_NO_RESULT);
    const result = await geocodeReverse(0, 0, fetchText);
    expect(result).toBeNull();
  });
});
