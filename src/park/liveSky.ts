import { siderealHours } from "../art/stars";
import type { DayPhase } from "./daylight";
import type { WeatherMode } from "./weather";

/**
 * "Match the real sky" (#48): the time of day and the weather as they are right
 * now in the map's real city. Time comes from the sun's actual elevation there
 * (no network needed); weather comes from Open-Meteo's free forecast API (the
 * NOAA models over the US; no key, sent only the city's coordinates) and from
 * the National Weather Service's latest observation at the city's airport
 * station, which reports what is really happening: wind, gusts, cloud layers,
 * blowing dust and dust devils. Offline, or when a request is blocked, the
 * last readings (up to six hours old) are used, then a clear sky. Cities are
 * data, so other city maps can join by adding a row.
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
 * rain, showers and thunderstorms are Rain; snow and snow showers are Snow;
 * everything else is Sunny, with its clouds, wind and dust carried by the
 * live conditions. Falling leaves belong to the Fall setting alone (#74): a
 * clear October day in the Mojave does not rain leaves.
 */
export function weatherFromCode(code: number, _date?: Date, _timeZone?: string): WeatherMode {
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  return "sunny";
}
/** The city's local clock, e.g. "7:42 PM". */
export const localClock = (date: Date, city: City) => new Intl.DateTimeFormat("en-US", { timeZone: city.timeZone, hour: "numeric", minute: "2-digit" }).format(date);

/** The forecast model's reading (Open-Meteo: NOAA's HRRR and GFS over the US). */
export interface LiveReading { code: number; at: number; cloud?: number; wind?: number; gust?: number; from?: number; temperature?: number }
/** What the city's own airport weather station last reported (National Weather Service). */
export interface StationReading { at: number; observedAt: number; text: string; wind: number | null; gust: number | null; from: number | null; temperature: number | null; cloud: number | null; phenomena: string[] }
/** Conditions beyond the four weathers, for wind, clouds and dust in the park. */
export interface LiveConditions {
  /** Cloud cover 0..1. */
  cloud: number;
  /** Mean wind and gusts near the ground (m/s), and where it blows from (degrees: 0 north, 90 east). */
  wind: number; gust: number; from: number;
  /** Air temperature (degrees C), when known. */
  temperature: number | null;
  /** Blowing dust or sand, 0..1 (a dust storm is 1). */
  dust: number;
  /** How likely dust devils are now, 0..1: hot sunny afternoons with light wind, or 1 when the station sees them. */
  devils: number;
  /** The station's own words ("Blowing Dust", "Clear") when its report is recent. */
  observed: string | null;
}
export interface LiveNow { phase: DayPhase; weather: WeatherMode; source: LiveSource; code: number | null; clock: string; sidereal: number; city: City; conditions: LiveConditions }
export type LiveSource = "live" | "saved" | "offline" | "loading";
const CACHE_KEY = (city: string) => `swf-live-sky-${city}`, STATION_KEY = (city: string) => `swf-live-station-${city}`;
const REFRESH = 15 * 60 * 1000, STALE = 6 * 60 * 60 * 1000, RETRY = 2 * 60 * 1000, STATION_FRESH = 2 * 60 * 60 * 1000;
/** Each city's NWS observing station: Boulder City Municipal Airport. */
export const STATIONS: Record<string, string> = { "boulder-city": "KBVU" };

const smooth = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const COVER: Record<string, number> = { SKC: 0, CLR: 0, NSC: 0, FEW: 0.2, SCT: 0.45, BKN: 0.75, OVC: 1, VV: 1 };
const RAIN = new Set(["rain", "rain_showers", "drizzle", "thunderstorms", "hail", "squalls"]), SNOW = new Set(["snow", "snow_grains", "snow_pellets", "ice_pellets", "ice_crystals"]);
const DUST = new Set(["dust", "sand", "dust_storm", "sand_storm", "dust_whirls"]);
/**
 * An NWS observation (api.weather.gov stations/{id}/observations/latest) to a
 * station reading: wind in km/h to m/s, the cloud layers' greatest cover, and
 * the present weather as words ("dust", "blowing dust", "dust_whirls").
 */
export function parseStation(body: unknown, now = Date.now()): StationReading | null {
  const p = (body as { properties?: Record<string, unknown> } | null)?.properties;
  if (!p || typeof p.timestamp !== "string") return null;
  const observedAt = Date.parse(p.timestamp);
  if (!Number.isFinite(observedAt)) return null;
  const value = (key: string) => { const v = (p[key] as { value?: unknown } | undefined)?.value; return typeof v === "number" && Number.isFinite(v) ? v : null; };
  const kmh = (key: string) => { const v = value(key); return v === null ? null : v / 3.6; };
  const layers = Array.isArray(p.cloudLayers) ? (p.cloudLayers as { amount?: string }[]) : [];
  const cloud = layers.length ? Math.max(...layers.map((l) => COVER[l.amount ?? ""] ?? 0)) : null;
  const phenomena = (Array.isArray(p.presentWeather) ? (p.presentWeather as { weather?: string; modifier?: string | null; intensity?: string | null }[]) : [])
    .filter((w) => typeof w.weather === "string").map((w) => [w.intensity, w.modifier, w.weather].filter(Boolean).join(" "));
  return { at: now, observedAt, text: typeof p.textDescription === "string" ? p.textDescription : "", wind: kmh("windSpeed"), gust: kmh("windGust"), from: value("windDirection"), temperature: value("temperature"), cloud, phenomena };
}
/** The game's weather from what the station sees falling, if anything. */
export function weatherFromStation(station: StationReading): WeatherMode | null {
  const kinds = station.phenomena.map((p) => p.split(" ").pop()!);
  if (kinds.some((k) => SNOW.has(k))) return "snow";
  if (kinds.some((k) => RAIN.has(k))) return "rain";
  return null;
}
/**
 * Wind, cloud and dust from the station when its report is under two hours
 * old, otherwise from the forecast model. Dust devils need a hot, sunny
 * afternoon with light wind (strong wind mixes the heated air away); the
 * station reporting them ("dust_whirls") settles it.
 */
export function conditionsAt(model: LiveReading | null, station: StationReading | null, date: Date, city: City): LiveConditions {
  const fresh = station && date.getTime() - station.observedAt < STATION_FRESH ? station : null;
  const codeCloud = model ? ({ 0: 0.05, 1: 0.2, 2: 0.5, 3: 0.95, 45: 0.9, 48: 0.9 } as Record<number, number>)[model.code] ?? 0.6 : 0.2;
  const cloud = fresh?.cloud ?? (model?.cloud !== undefined ? model.cloud / 100 : codeCloud);
  const wind = fresh?.wind ?? model?.wind ?? 1.3, gust = Math.max(wind, fresh?.gust ?? model?.gust ?? wind * 1.6), from = fresh?.from ?? model?.from ?? 225;
  const temperature = fresh?.temperature ?? model?.temperature ?? null;
  const kinds = fresh?.phenomena ?? [], wet = kinds.some((k) => RAIN.has(k.split(" ").pop()!) || SNOW.has(k.split(" ").pop()!)) || (model ? weatherFromCode(model.code) !== "sunny" : false);
  const reported = kinds.some((k) => DUST.has(k.split(" ").pop()!) && !k.endsWith("dust_whirls")) ? (kinds.some((k) => /storm|heavy/.test(k)) ? 1 : 0.7) : 0;
  const dust = wet ? 0 : Math.max(reported, 0.6 * smooth(gust, 13, 21));
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: city.timeZone, hour: "numeric", hourCycle: "h23" }).format(date));
  const sunUp = sunAt(date, city).elevation > 20;
  const devils = kinds.some((k) => k.endsWith("dust_whirls")) ? 1 : wet || !sunUp ? 0 : smooth(temperature ?? 22, 24, 35) * (1 - smooth(cloud, 0.25, 0.6)) * (1 - smooth(wind, 5.5, 9)) * smooth(hour, 10, 12) * (1 - smooth(hour, 17, 19));
  return { cloud, wind, gust, from, temperature, dust, devils, observed: fresh?.text || null };
}

export class LiveSky {
  private readings = new Map<string, LiveReading>();
  private stations = new Map<string, StationReading>();
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
    const reading = this.reading(city, now.getTime()), station = this.station(city, now.getTime());
    this.refresh(city, now.getTime());
    const fresh = station && now.getTime() - station.observedAt < STATION_FRESH ? station : null;
    const weather: WeatherMode = (fresh && weatherFromStation(fresh)) ?? weatherFromCode(reading?.code ?? 0);
    const source: LiveSource = (reading && !this.failed.has(city.id)) || (fresh && !this.failed.has(city.id + ":station")) ? "live" : reading || fresh ? "saved" : this.pending.has(city.id) ? "loading" : "offline";
    const value: LiveNow = { phase: phaseAt(now, city), weather, source, code: reading?.code ?? null, clock: localClock(now, city), sidereal: siderealHours(now, city.lon), city, conditions: conditionsAt(reading, fresh, now, city) };
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
  private station(city: City, now: number) {
    let r = this.stations.get(city.id);
    if (!r) {
      try { const saved = JSON.parse(localStorage.getItem(STATION_KEY(city.id)) ?? "null"); if (Number.isFinite(saved?.observedAt) && Array.isArray(saved?.phenomena)) this.stations.set(city.id, (r = saved)); } catch { /* storage unavailable */ }
    }
    return r && now - r.observedAt < STALE ? r : null;
  }
  private refresh(city: City, now: number) {
    const r = this.readings.get(city.id);
    this.fetchOnce(city.id, now, r?.at, `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m&wind_speed_unit=ms&timezone=auto`, {}, (body) => {
      const c = (body as { current?: Record<string, number> })?.current, code = Number(c?.weather_code);
      if (!Number.isFinite(code)) throw new Error("no weather_code");
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
      const reading: LiveReading = { code, at: Date.now(), cloud: num(c?.cloud_cover), wind: num(c?.wind_speed_10m), gust: num(c?.wind_gusts_10m), from: num(c?.wind_direction_10m), temperature: num(c?.temperature_2m) };
      this.readings.set(city.id, reading);
      try { localStorage.setItem(CACHE_KEY(city.id), JSON.stringify(reading)); } catch { /* storage unavailable */ }
    });
    const id = STATIONS[city.id];
    if (!id) return;
    const s = this.stations.get(city.id);
    this.fetchOnce(city.id + ":station", now, s?.at, `https://api.weather.gov/stations/${id}/observations/latest`, { headers: { Accept: "application/geo+json" } }, (body) => {
      const reading = parseStation(body);
      if (!reading) throw new Error("no observation");
      this.stations.set(city.id, reading);
      try { localStorage.setItem(STATION_KEY(city.id), JSON.stringify(reading)); } catch { /* storage unavailable */ }
    });
  }
  /** One request for `key` when due: every 15 minutes, retried after 2 when it failed. */
  private fetchOnce(key: string, now: number, last: number | undefined, url: string, init: RequestInit, use: (body: unknown) => void) {
    const tried = this.lastTry.get(key) ?? -Infinity;
    if (this.pending.has(key) || (last !== undefined && now - last < REFRESH && !this.failed.has(key)) || now - tried < RETRY) return;
    this.lastTry.set(key, now);
    this.pending.add(key);
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 8000);
    this.fetcher(url, { ...init, signal: abort.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body) => { use(body); this.failed.delete(key); this.memo = null; })
      .catch(() => { this.failed.add(key); this.memo = null; })
      .finally(() => { clearTimeout(timer); this.pending.delete(key); });
  }
}
/** One shared instance: the menu shows what the park is doing. */
export const liveSky = new LiveSky();
