import { siderealHours } from "../art/stars";
import type { DayPhase } from "./daylight";
import type { WeatherMode } from "./weather";

/**
 * "Match the real sky" (#48): the time of day and the weather as they are right
 * now in the map's real city. Time comes from the sun's actual elevation there
 * (no network needed); weather comes from Open-Meteo's free forecast API, which
 * needs no key and is sent only the city's coordinates. Offline, or when the
 * request is blocked, the last reading (up to six hours old) is used, then a
 * clear sky. Cities are data, so other city maps can join by adding a row.
 */
export interface City { id: string; name: string; short: string; lat: number; lon: number; timeZone: string }
export const CITIES: Record<string, City> = {
  "boulder-city": { id: "boulder-city", name: "Boulder City, NV", short: "BOULDER CITY", lat: 35.978, lon: -114.832, timeZone: "America/Los_Angeles" },
};
/** Which real city each map stands in. Maps without one fall back to Boulder City. */
export const MAP_CITY: Record<string, string> = { outdoor: "boulder-city", b_hill: "boulder-city", church: "boulder-city", techno_gravity: "boulder-city", warehouse: "boulder-city" };
export const cityForMap = (map: string) => CITIES[MAP_CITY[map] ?? "boulder-city"] ?? CITIES["boulder-city"];

const DEG = Math.PI / 180;
/** The sun's elevation (degrees) and whether it is past noon, at `date` in `city`. */
export function sunAt(date: Date, city: Pick<City, "lat" | "lon">) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * DEG, q = 280.459 + 0.98564736 * d;
  const lambda = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG, e = (23.439 - 0.00000036 * d) * DEG;
  const ra = Math.atan2(Math.cos(e) * Math.sin(lambda), Math.cos(lambda)), dec = Math.asin(Math.sin(e) * Math.sin(lambda));
  const hourAngle = siderealHours(date, city.lon) * 15 * DEG - ra;
  const h = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle));
  const elevation = Math.asin(Math.sin(city.lat * DEG) * Math.sin(dec) + Math.cos(city.lat * DEG) * Math.cos(dec) * Math.cos(h)) / DEG;
  return { elevation, afternoon: h > 0 };
}
/** The game's four times of day from the real sun: golden hour runs from 8 degrees up to 6 below. */
export function phaseAt(date: Date, city: Pick<City, "lat" | "lon">): DayPhase {
  const sun = sunAt(date, city);
  if (sun.elevation > 8) return "day";
  if (sun.elevation < -6) return "night";
  return sun.afternoon ? "sunset" : "sunrise";
}
/**
 * WMO weather code (Open-Meteo `weather_code`) to the game's weather. Drizzle,
 * rain, showers and thunderstorms are Rain; snow and snow showers are Snow; a
 * dry autumn day (equinox to solstice) is Fall; anything else is Sunny.
 */
export function weatherFromCode(code: number, date: Date, timeZone: string): WeatherMode {
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  const [month, day] = new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric", day: "numeric" }).formatToParts(date).filter((p) => p.type !== "literal").map((p) => Number(p.value));
  const autumn = (month === 9 && day >= 22) || month === 10 || month === 11 || (month === 12 && day < 21);
  return autumn ? "fall" : "sunny";
}
/** The city's local clock, e.g. "7:42 PM". */
export const localClock = (date: Date, city: City) => new Intl.DateTimeFormat("en-US", { timeZone: city.timeZone, hour: "numeric", minute: "2-digit" }).format(date);

export interface LiveReading { code: number; at: number }
export interface LiveNow { phase: DayPhase; weather: WeatherMode; source: LiveSource; code: number | null; clock: string; sidereal: number; city: City }
export type LiveSource = "live" | "saved" | "offline" | "loading";
const CACHE_KEY = (city: string) => `swf-live-sky-${city}`;
const REFRESH = 15 * 60 * 1000, STALE = 6 * 60 * 60 * 1000, RETRY = 2 * 60 * 1000;

export class LiveSky {
  private readings = new Map<string, LiveReading>();
  private pending = new Set<string>();
  private lastTry = new Map<string, number>();
  private failed = new Set<string>();
  /** Injectable for tests; the browser's fetch otherwise. */
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = (url, init) => fetch(url, init);

  /** The time of day and weather in `city` at `now`, starting a weather refresh when one is due. */
  current(city: City, now = new Date()) {
    // Checked every frame by the park, so worked out at most once a second.
    const memo = this.memo;
    if (memo && memo.city === city && Math.abs(now.getTime() - memo.at) < 1000 && memo.source !== "loading") return memo.value;
    const reading = this.reading(city, now.getTime());
    this.refresh(city, now.getTime());
    const weather: WeatherMode = reading ? weatherFromCode(reading.code, now, city.timeZone) : weatherFromCode(0, now, city.timeZone);
    const source: LiveSource = reading && !this.failed.has(city.id) ? "live" : reading ? "saved" : this.pending.has(city.id) ? "loading" : "offline";
    const value = { phase: phaseAt(now, city), weather, source, code: reading?.code ?? null, clock: localClock(now, city), sidereal: siderealHours(now, city.lon), city };
    this.memo = { city, at: now.getTime(), source, value };
    return value;
  }
  private memo: { city: City; at: number; source: LiveSource; value: LiveNow } | null = null;
  private reading(city: City, now: number) {
    let r = this.readings.get(city.id);
    if (!r) {
      try { const saved = JSON.parse(localStorage.getItem(CACHE_KEY(city.id)) ?? "null"); if (Number.isFinite(saved?.code) && Number.isFinite(saved?.at)) this.readings.set(city.id, (r = saved)); } catch { /* storage unavailable */ }
    }
    return r && now - r.at < STALE ? r : null;
  }
  private refresh(city: City, now: number) {
    const r = this.readings.get(city.id), tried = this.lastTry.get(city.id) ?? -Infinity;
    if (this.pending.has(city.id) || (r && now - r.at < REFRESH && !this.failed.has(city.id)) || now - tried < RETRY) return;
    this.lastTry.set(city.id, now);
    this.pending.add(city.id);
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 8000);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=weather_code&timezone=auto`;
    this.fetcher(url, { signal: abort.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body) => {
        const code = Number(body?.current?.weather_code);
        if (!Number.isFinite(code)) throw new Error("no weather_code");
        const reading = { code, at: Date.now() };
        this.readings.set(city.id, reading);
        this.failed.delete(city.id);
        this.memo = null;
        try { localStorage.setItem(CACHE_KEY(city.id), JSON.stringify(reading)); } catch { /* storage unavailable */ }
      })
      .catch(() => { this.failed.add(city.id); this.memo = null; })
      .finally(() => { clearTimeout(timer); this.pending.delete(city.id); });
  }
}
/** One shared instance: the menu shows what the park is doing. */
export const liveSky = new LiveSky();
