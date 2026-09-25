// The real moon (#74): where it is in Boulder City's sky and how much of it is
// lit, from a low-precision lunar theory (the largest periodic terms of the
// Moon's longitude and latitude, Meeus ch. 47 abridged: about a quarter of a
// degree, far finer than the disk the sky draws). No network needed.
import * as THREE from "three";
import { siderealHours, starDirection } from "./stars";

const DEG = Math.PI / 180;
const wrap = (deg: number) => ((deg % 360) + 360) % 360;
const days = (date: Date) => date.getTime() / 86400000 + 2440587.5 - 2451545.0;
/** Ecliptic longitude of the Sun (degrees). */
function sunLongitude(d: number) {
  const g = (357.529 + 0.98560028 * d) * DEG, q = 280.459 + 0.98564736 * d;
  return wrap(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}
/** Ecliptic (longitude, latitude, degrees) to equatorial (RA hours, Dec degrees). */
function equatorial(lambda: number, beta: number, d: number) {
  const e = (23.439 - 0.00000036 * d) * DEG, l = lambda * DEG, b = beta * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  return { ra: wrap(ra / DEG) / 15, dec: dec / DEG };
}
export interface MoonState {
  /** Lit fraction of the disk, 0 (new) .. 1 (full). */
  illumination: number;
  /** Degrees of the sun-moon angle as seen from Earth: 0 new, 180 full. */
  elongation: number;
  /** Growing toward full (the lit limb faces the evening sun, west). */
  waxing: boolean;
  /** Days since the last new moon (0 .. 29.53). */
  age: number;
  /** "Waxing crescent", "Full moon" and so on. */
  name: string;
  /** Equatorial positions of the Moon and the Sun (RA hours, Dec degrees). */
  moon: { ra: number; dec: number };
  sun: { ra: number; dec: number };
}
const SYNODIC = 29.530589;
/** The Moon's phase and place on `date`. */
export function moonAt(date: Date): MoonState {
  const d = days(date);
  const L = 218.316 + 13.176396 * d, M = (134.963 + 13.064993 * d) * DEG, F = (93.272 + 13.22935 * d) * DEG;
  const D = (297.85 + 12.190749 * d) * DEG, Ms = (357.529 + 0.98560028 * d) * DEG;
  const lambda = wrap(L + 6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) + 0.214 * Math.sin(2 * M) - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F));
  const beta = 5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) + 0.278 * Math.sin(M - F) + 0.173 * Math.sin(2 * D - F);
  const sunLon = sunLongitude(d), ahead = wrap(lambda - sunLon);
  const elongation = Math.acos(Math.cos(beta * DEG) * Math.cos(ahead * DEG)) / DEG;
  const illumination = (1 - Math.cos(elongation * DEG)) / 2, waxing = ahead < 180;
  const age = (ahead / 360) * SYNODIC;
  const name = illumination < 0.03 ? "New moon" : illumination > 0.97 ? "Full moon" : Math.abs(illumination - 0.5) < 0.06 ? (waxing ? "First quarter" : "Last quarter") : `${waxing ? "Waxing" : "Waning"} ${illumination < 0.5 ? "crescent" : "gibbous"}`;
  return { illumination, elongation, waxing, age, name, moon: equatorial(lambda, beta, d), sun: equatorial(sunLon, 0, d) };
}
/**
 * The directions (y up, north -z, east +x) toward the Moon and the Sun from
 * `lat`/`lon` at `date`, for drawing the disk and its terminator.
 */
export function moonSky(date: Date, lat: number, lon: number, state = moonAt(date)) {
  const lst = siderealHours(date, lon);
  return { state, moon: starDirection(state.moon.ra, state.moon.dec, lst, lat), sun: starDirection(state.sun.ra, state.sun.dec, lst, lat) };
}
/**
 * Where the Sun must be for a moon drawn at `moonDir` to show this phase: at
 * the real sun-moon angle, on the west side of the Moon while it waxes (it
 * trails the evening sun) and the east side while it wanes, below it in the sky.
 */
export function sunForPhase(moonDir: THREE.Vector3, state: Pick<MoonState, "elongation" | "waxing">, out = new THREE.Vector3()) {
  const side = new THREE.Vector3(state.waxing ? -1 : 1, -0.6, 0);
  side.addScaledVector(moonDir, -side.dot(moonDir)).normalize();
  const a = state.elongation * DEG;
  return out.copy(moonDir).multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).normalize();
}
