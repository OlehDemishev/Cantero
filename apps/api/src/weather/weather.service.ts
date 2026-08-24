import { Injectable, Logger } from "@nestjs/common";
import type { WeatherCondition } from "@prisma/client";

export interface WeatherForecastDay {
  date: string;
  condition: WeatherCondition;
  tempMaxC: number;
  tempMinC: number;
  risky: boolean;
}

const RISKY_CONDITIONS: WeatherCondition[] = ["rain", "snow", "extreme_heat", "extreme_cold", "other"];
const EXTREME_HEAT_C = 35;
const EXTREME_COLD_C = -10;
const FETCH_TIMEOUT_MS = 5000;
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Maps Open-Meteo's WMO weather-interpretation codes onto our (much coarser) WeatherCondition enum. */
function conditionFromWmoCode(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code <= 3 || code === 45 || code === 48) return "cloudy";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "other";
  return "other";
}

/**
 * Free, keyless geocoding + forecast via Open-Meteo — no API key or billing account needed,
 * which matters since this is a demo-stage integration with no ops budget yet. Never throws:
 * daily-log creation and the project weather widget both ride on this, and a flaky external
 * API shouldn't break either — callers get null/[] on any failure and log locally instead.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly geocodeCache = new Map<string, { coords: { lat: number; lon: number } | null; cachedAt: number }>();

  /** Best-effort: pulls the city out of a free-text "Street 9, 12345 City" address for geocoding, since street-level lookup isn't reliable via this API. */
  private extractLocality(address: string): string {
    const lastPart = address.split(",").pop() ?? address;
    return lastPart.replace(/\d/g, "").trim();
  }

  async geocode(address: string): Promise<{ lat: number; lon: number } | null> {
    const locality = this.extractLocality(address);
    if (!locality) return null;

    const cached = this.geocodeCache.get(locality);
    if (cached && Date.now() - cached.cachedAt < GEOCODE_CACHE_TTL_MS) return cached.coords;

    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locality)}&count=1&language=en&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`geocoding API returned ${res.status}`);
      const body = (await res.json()) as { results?: { latitude: number; longitude: number }[] };
      const coords = body.results?.[0] ? { lat: body.results[0].latitude, lon: body.results[0].longitude } : null;
      this.geocodeCache.set(locality, { coords, cachedAt: Date.now() });
      return coords;
    } catch (err) {
      this.logger.warn(`Geocoding failed for "${locality}": ${(err as Error).message ?? err}`);
      return null;
    }
  }

  /** Forecast covering `pastDays` days back through 7 days ahead, so both daily-log auto-fill (usually today or a recent date) and the forward-looking widget can pull from one call. */
  async forecast(lat: number, lon: number, pastDays = 7): Promise<WeatherForecastDay[]> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&forecast_days=7&past_days=${pastDays}&timezone=auto`;
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`forecast API returned ${res.status}`);
      const body = (await res.json()) as {
        daily?: { time: string[]; weathercode: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
      };
      if (!body.daily) return [];

      return body.daily.time.map((date, i) => {
        const tempMaxC = body.daily!.temperature_2m_max[i];
        const tempMinC = body.daily!.temperature_2m_min[i];
        let condition = conditionFromWmoCode(body.daily!.weathercode[i]);
        if (tempMaxC >= EXTREME_HEAT_C) condition = "extreme_heat";
        else if (tempMinC <= EXTREME_COLD_C) condition = "extreme_cold";
        return { date, condition, tempMaxC, tempMinC, risky: RISKY_CONDITIONS.includes(condition) };
      });
    } catch (err) {
      this.logger.warn(`Forecast fetch failed for (${lat}, ${lon}): ${(err as Error).message ?? err}`);
      return [];
    }
  }

  /** Convenience used by daily-log auto-fill: geocodes the address, then picks out just the one date's forecast. */
  async forecastForDate(address: string, date: Date): Promise<WeatherForecastDay | null> {
    const coords = await this.geocode(address);
    if (!coords) return null;
    const days = await this.forecast(coords.lat, coords.lon);
    const target = date.toISOString().slice(0, 10);
    return days.find((d) => d.date === target) ?? null;
  }
}
