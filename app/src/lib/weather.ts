export interface WeatherInfo {
  code: number;
  maxTempC: number;
  icon: string;
}

const FORECAST_HORIZON_DAYS = 14;

function iconForCode(code: number): string {
  if (code === 0) return "☀️";
  if (code >= 1 && code <= 3) return "⛅";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "🌡️";
}

export async function getWeather(
  lat: number,
  lon: number,
  dateIso: string,
  fetchText: (url: string) => Promise<string>,
): Promise<WeatherInfo | null> {
  const date = new Date(dateIso);
  const daysAhead = Math.floor((date.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (daysAhead < 0 || daysAhead > FORECAST_HORIZON_DAYS) return null;

  const dateStr = date.toISOString().slice(0, 10);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
  const text = await fetchText(url);
  const data = JSON.parse(text) as { daily?: { weathercode?: number[]; temperature_2m_max?: number[] } };

  const code = data.daily?.weathercode?.[0];
  const maxTempC = data.daily?.temperature_2m_max?.[0];
  if (typeof code !== "number" || typeof maxTempC !== "number") return null;

  return { code, maxTempC, icon: iconForCode(code) };
}
