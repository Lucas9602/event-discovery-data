import { getWeather } from "../src/lib/weather";

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

const FORECAST_RESPONSE = JSON.stringify({
  daily: { weathercode: [0], temperature_2m_max: [24.3] },
});
const EMPTY_RESPONSE = JSON.stringify({ daily: { weathercode: [], temperature_2m_max: [] } });

describe("getWeather", () => {
  it("returns weather info with a mapped icon for a near-future date", async () => {
    const fetchText = jest.fn().mockResolvedValue(FORECAST_RESPONSE);
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(3), fetchText);
    expect(result).toEqual({ code: 0, maxTempC: 24.3, icon: "☀️" });
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("api.open-meteo.com/v1/forecast"));
  });

  it("does not fetch and returns null for a date more than 14 days out", async () => {
    const fetchText = jest.fn();
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(20), fetchText);
    expect(result).toBeNull();
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("does not fetch and returns null for a date in the past", async () => {
    const fetchText = jest.fn();
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(-1), fetchText);
    expect(result).toBeNull();
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("returns null when the response has no daily data", async () => {
    const fetchText = jest.fn().mockResolvedValue(EMPTY_RESPONSE);
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(3), fetchText);
    expect(result).toBeNull();
  });

  it("maps a rain weathercode to the rain icon", async () => {
    const fetchText = jest
      .fn()
      .mockResolvedValue(JSON.stringify({ daily: { weathercode: [61], temperature_2m_max: [17] } }));
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(1), fetchText);
    expect(result?.icon).toBe("🌧️");
  });
});
