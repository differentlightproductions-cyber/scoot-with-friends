// B Hill: a long neighbourhood descent for scooters and longboards.
//
// One centreline drives everything: the visible road and shoulders, the
// collision mesh, walking height (terrainHeight) and route metadata all sample
// the same elevation and cross-section functions, so the road has no seams,
// steps or invisible walls. The road follows the owner's aerial photo of B Hill
// (#89): its curves traced from the photo at 0.75 m a pixel, a staging pad
// above the top and a runout below the bottom. Two side streets leave it where
// the photo's roads toward Veterans Memorial Park and the church do, and
// houses line both sides on lots terraced into the hill; the ground under
// each lot (its yard, driveway and pool) is part of the same height function.
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { GROUPS } from "../physics/groups";
import type { Park } from "./park";
import { surfaceTexture } from "./art";
import { SkyDome } from "../art/sky";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Noise2, mulberry } from "../art/noise";
import { buildTerrain, desertMaterial, paintDesert, scatterDesert } from "../art/desert";
import { buildHouses, drivewayAt, planHouse, POOL_DEPTH, type HouseLot, type HousePlan } from "../art/houses";
import { asphaltTexture, gravelTexture } from "../art/textures";
import { aleppoPine, bursage, fanPalm, plant, yucca, type Placement } from "../art/flora";
import { Drainage, type GutterLine } from "./gutters";

/**
 * Plan-view control points (metres), top of the hill first: the blue line on
 * the owner's aerial photo, every 45 px of its length (x = the photo's rows,
 * z = its columns), with a straight staging pad before it and a runout after.
 */
const CONTROL: [number, number][] = [
  [0, -95], [19, -78.7], [37.9, -62.4], [56.9, -46.1], [89.2, -14.9], [113.8, 24.3], [125.6, 68.1], [133, 113.1],
  [137, 158.1], [138.5, 203.1], [136, 248.1], [122.9, 292.5], [98.4, 332.5], [84.5, 375.6], [92.1, 420.6], [112, 463],
  [131.7, 504.8], [140, 549.6], [136.7, 594.6], [132.1, 639.6], [134.6, 684.6], [140.9, 729.6], [143.3, 774.6], [136.8, 819.6],
  [123.4, 863.8], [92.4, 897.3], [55.5, 924.8], [18.5, 952.2], [-20.3, 977.7], [-56.9, 1006.4], [-80.9, 1044.9],
  [-94.9, 1094.3], [-105.7, 1132.8], [-116.6, 1171.3], [-128.9, 1214.6],
];
export const ROAD_HALF_WIDTH = 4.6;
const SHOULDER = 2.2;
const CORRIDOR = 40;
/** The rolled gutter's outer edge: past it, side streets and lots shape the ground. */
const GUTTER = ROAD_HALF_WIDTH + 0.65;
/** The shoulder's outer edge, where a driveway leaves it: the shoulder itself stays one flush surface. */
const VERGE = ROAD_HALF_WIDTH + SHOULDER;

interface Sample { x: number; z: number; s: number; y: number; tx: number; tz: number }

/** Sampled centreline every metre with arc length, elevation and tangent. */
const ROUTE: Sample[] = (() => {
  const curve = new THREE.CatmullRomCurve3(CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  const length = curve.getLength();
  const count = Math.ceil(length);
  const points = curve.getSpacedPoints(count);
  const samples: Sample[] = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) s += points[i].distanceTo(points[i - 1]);
    samples.push({ x: points[i].x, z: points[i].z, s, y: 0, tx: 0, tz: 1 });
  }
  // Elevation: the grade is keyed along the route. A short flat staging pad
  // behind the spawn, then the road tips over straight away, and each section
  // after that is steeper than the last, with brief easings into the photo's
  // tighter bends (the S-bends at 410-560 m, the right-hander at 690 m, the
  // pair at 940 and 1030 m, the long left at 1260 m) so a rider can set up.
  // Speed comes from this slope and gravity alone: nothing pushes the rider
  // down the hill.
  const total = s;
  const KEYS: [number, number][] = [
    [34, 0], [74, 0.11], [190, 0.105], // TOP: steep but manageable
    [250, 0.12], [340, 0.125], [395, 0.09], // EARLY DESCENT: serious speed, easing into the S-bends
    [470, 0.125], [600, 0.135], [655, 0.1], // MID: turns need planning
    [720, 0.14], [880, 0.15], [925, 0.12], // LOWER: small corrections matter
    [1000, 0.155], [1150, 0.165], [1230, 0.12], // FINAL FAST SECTIONS
    [total - 190, 0.05], [total - 140, 0], [total - 90, -0.07], // runout climbs to stop riders
  ];
  const grade = (d: number) => {
    if (d <= KEYS[0][0]) return 0;
    for (let k = 1; k < KEYS.length; k++)
      if (d < KEYS[k][0]) {
        const [s0, g0] = KEYS[k - 1], [s1, g1] = KEYS[k];
        return g0 + (g1 - g0) * THREE.MathUtils.smoothstep(d, s0, s1);
      }
    return KEYS[KEYS.length - 1][1];
  };
  let y = 0;
  for (let i = 1; i < samples.length; i++) {
    const ds = samples[i].s - samples[i - 1].s;
    y -= grade(samples[i].s) * ds;
    samples[i].y = y;
  }
  const drop = -Math.min(...samples.map((p) => p.y));
  for (const p of samples) p.y += drop + 2;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    samples[i].tx = (b.x - a.x) / len;
    samples[i].tz = (b.z - a.z) / len;
  }
  return samples;
})();
export const B_HILL_LENGTH = ROUTE[ROUTE.length - 1].s;

/** Nearest centreline sample (coarse search, then local refine). */
function nearest(x: number, z: number) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < ROUTE.length; i += 8) {
    const d = (ROUTE[i].x - x) ** 2 + (ROUTE[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  for (let i = Math.max(0, best - 10); i <= Math.min(ROUTE.length - 1, best + 10); i++) {
    const d = (ROUTE[i].x - x) ** 2 + (ROUTE[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  // Project between the neighbouring samples for a continuous station and offset.
  const p = ROUTE[best];
  const along = (x - p.x) * p.tx + (z - p.z) * p.tz;
  const j = THREE.MathUtils.clamp(best + along, 0, ROUTE.length - 1);
  const i0 = Math.floor(j), i1 = Math.min(ROUTE.length - 1, i0 + 1), f = j - i0;
  const a = ROUTE[i0], b = ROUTE[i1];
  const cx = a.x + (b.x - a.x) * f, cz = a.z + (b.z - a.z) * f, cy = a.y + (b.y - a.y) * f;
  const offset = (x - cx) * a.tz - (z - cz) * a.tx;
  return { index: j, y: cy, offset, s: a.s + (b.s - a.s) * f };
}

/** Cross-section height above the road crown for a lateral offset. */
function crossSection(offset: number, s: number) {
  const d = Math.abs(offset);
  // A slight crown sheds water; the shoulder is flush; beyond it the ground
  // rises gently into the hillside on both sides (the houses' lots are cut
  // into it), which keeps riders near the road without any invisible wall.
  const crown = -0.012 * Math.min(1, d / ROAD_HALF_WIDTH) ** 2 * ROAD_HALF_WIDTH;
  // Behind the staging area the road ends in a rising bank, never a drop.
  const backstop = s < 30 ? ((30 - s) / 30) ** 2 * 6 : 0;
  // Past the runout the road ends in the same kind of bank.
  const endstop = s > B_HILL_LENGTH - 25 ? ((s - B_HILL_LENGTH + 25) / 25) ** 2 * 5 : 0;
  if (d <= ROAD_HALF_WIDTH + SHOULDER) return crown + backstop + endstop;
  const out = d - ROAD_HALF_WIDTH - SHOULDER;
  const side = Math.sign(offset) || 1;
  const uphill = side * Math.sin(s * 0.011) > 0 ? 1 : 0.5;
  return crown + backstop + endstop + (out * 0.1 + out * out * 0.003) * uphill + Math.sin(s * 0.07 + offset * 0.3) * Math.min(1, out / 6) * 0.25;
}

// ---- Side streets (#89) --------------------------------------------------------
/**
 * Where the photo's red and yellow lines meet the road: the streets toward
 * Veterans Memorial Park (near the top) and the church (at the bottom). Each
 * leaves on the riders' left, climbs gently away and ends at a barricade
 * inside the corridor for now; the continuous city (#43) will carry them on.
 */
const SIDE_STREETS = [
  { id: "veterans", label: "VETERANS MEMORIAL PARK", s: 283, dir: [1, 0] as [number, number], length: 38, grade: 0.04 },
  { id: "church", label: "THE CHURCH", s: 1330, dir: [0.97, 0.25] as [number, number], length: 38, grade: 0.03 },
].map((st) => {
  const p = ROUTE[st.s], l = Math.hypot(...st.dir);
  return { ...st, x0: p.x, z0: p.z, dx: st.dir[0] / l, dz: st.dir[1] / l, y0: p.y + crossSection(ROAD_HALF_WIDTH, st.s) };
});
export const B_HILL_STREETS = SIDE_STREETS.map(({ id, label, s, x0, z0, dx, dz, length }) => ({ id, label, s, x: x0, z: z0, dx, dz, length }));
const STREET_HALF = 3.6;
/** Where a point is in a side street's frame: along it (t), across it (u), and the street's paved half-width there. */
function streetFrame(st: (typeof SIDE_STREETS)[number], x: number, z: number, past: number) {
  const t = (x - st.x0) * st.dx + (z - st.z0) * st.dz, u = (x - st.x0) * -st.dz + (z - st.z0) * st.dx;
  // The mouth flares into curb returns where it meets the road.
  return { t, u, half: STREET_HALF + 4 * (1 - THREE.MathUtils.smoothstep(past, 0, 7)) };
}
/** The side streets' ground: paved, then banks rising into the hillside around them. */
function streetGround(x: number, z: number, n: ReturnType<typeof nearest>, y: number) {
  const past = Math.abs(n.offset) - ROAD_HALF_WIDTH;
  for (const st of SIDE_STREETS) {
    if (Math.sign(n.offset) !== 1) continue;
    const { t, u, half } = streetFrame(st, x, z, past);
    if (t < 0 || t > st.length + 14) continue;
    const edge = n.y + crossSection(ROAD_HALF_WIDTH, n.s);
    const profile = st.y0 + Math.max(0, t - 6) * st.grade + (t > st.length ? ((t - st.length) / 6) ** 2 * 2.5 : 0);
    // Level with the road's shoulder across it, then easing into the street's own grade and crown.
    const crown = 0.012 * Math.min(1, Math.abs(u) / half) ** 2 * half;
    const paved = THREE.MathUtils.lerp(edge, profile - crown, THREE.MathUtils.smoothstep(past, SHOULDER, 14));
    const e = Math.abs(u) - half;
    if (e > 12) continue;
    if (e <= 0) return paved;
    // The banks rise off the road's shoulder, never on it (the shoulder stays one flush surface).
    const bank = paved + e * 0.12 + e * e * 0.004;
    return THREE.MathUtils.lerp(y, THREE.MathUtils.lerp(bank, y, THREE.MathUtils.smoothstep(e, 6, 12)), THREE.MathUtils.smoothstep(past, SHOULDER, SHOULDER + 4));
  }
  return y;
}
function onStreet(x: number, z: number, n: ReturnType<typeof nearest>, margin = 0) {
  if (n.offset <= 0) return false;
  const past = n.offset - ROAD_HALF_WIDTH;
  return SIDE_STREETS.some((st) => { const f = streetFrame(st, x, z, past); return f.t > 0 && f.t < st.length + margin && Math.abs(f.u) < f.half + margin; });
}

// ---- Lots (#89) ----------------------------------------------------------------
interface Site extends HouseLot { s: number; side: number; ax: number; az: number; fx: number; fz: number }
let SITES: Site[] | null = null, siting = false;
const BUCKET = 40, buckets = new Map<number, Site[]>();
/** A world point in a lot's frame (x across, z toward the street). */
const lotFrame = (lot: Site, x: number, z: number) => ({ lx: (x - lot.x) * lot.ax + (z - lot.z) * lot.az, lz: (x - lot.x) * lot.fx + (z - lot.z) * lot.fz });
/** Lots near a station. */
function lotsNear(s: number) {
  if (!SITES) sites();
  return buckets.get(Math.floor(s / BUCKET)) ?? [];
}
/**
 * The collision ribbon's height: the ground, except that around a pool it
 * drops to the pool's floor, so its coarse triangles never ramp up the pool's
 * walls (the retaining pad's blocks carry the deck, the ground query the rest).
 */
function ribbonHeight(x: number, z: number) {
  const y = bHillHeight(x, z), n = nearest(x, z);
  if (Math.abs(n.offset) <= VERGE) return y;
  let low = y;
  for (const lot of lotsNear(n.s)) {
    const pool = lot.plan.pool;
    if (!pool) continue;
    const { lx, lz } = lotFrame(lot, x, z);
    if (Math.abs(lx - pool.x) < pool.w / 2 + 4.5 && Math.abs(lz - pool.z) < pool.l / 2 + 4.5) low = Math.min(low, lot.pad - POOL_DEPTH);
  }
  return low;
}
/** How steeply the ground may fall from the shoulder's edge toward a lot below the road. */
const CUT = 0.9;
/**
 * The ground under and around a lot (off the shoulder only): level just under
 * the yard, the driveway slab exactly, the pool's floor, and a cut bank
 * rising back to the hillside; toward the road it never falls faster than
 * CUT from the shoulder's edge, so the shoulder never ends in a drop.
 */
function lotGround(x: number, z: number, n: ReturnType<typeof nearest>, y: number) {
  let carved = y;
  for (const lot of lotsNear(n.s)) {
    const { lx, lz } = lotFrame(lot, x, z), P = lot.plan;
    const drive = drivewayAt(P, lot, lx, lz, 0.4);
    if (drive !== null) return drive;
    const ox = Math.abs(lx) - P.LW / 2, oz = Math.abs(lz) - P.LD / 2;
    if (ox < 0 && oz < 0) {
      if (P.pool && Math.abs(lx - P.pool.x) < P.pool.w / 2 && Math.abs(lz - P.pool.z) < P.pool.l / 2) return lot.pad - POOL_DEPTH;
      return Math.min(y, lot.pad - 0.12);
    }
    const out = Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
    if (out < 8) carved = Math.min(carved, lot.pad - 0.12 + out * CUT);
  }
  return Math.max(carved, y - CUT * (Math.abs(n.offset) - VERGE));
}

/** Walkable/rideable ground height anywhere in the B Hill corridor. */
export function bHillHeight(x: number, z: number) {
  const n = nearest(x, z);
  let y = n.y + crossSection(n.offset, n.s);
  if (Math.abs(n.offset) > GUTTER) {
    y = streetGround(x, z, n, y);
    if (!siting && Math.abs(n.offset) > VERGE) y = lotGround(x, z, n, y);
  }
  return y;
}

/**
 * What the wheels are on at a position: the paved road, its flush shoulder or
 * the rough hillside beyond. The simulation reads this for high-speed
 * stability. Side streets, driveways, patios and pool decks are paved.
 */
export function bHillSurface(x: number, z: number): "road" | "shoulder" | "dirt" {
  const n = nearest(x, z), d = Math.abs(n.offset);
  if (d <= ROAD_HALF_WIDTH) return "road";
  if (onStreet(x, z, n)) return "road";
  for (const lot of lotsNear(n.s)) {
    const { lx, lz } = lotFrame(lot, x, z), P = lot.plan;
    if (drivewayAt(P, lot, lx, lz) !== null) return "road";
    if (Math.abs(lx - P.patio.x) < P.patio.w / 2 && Math.abs(lz - P.patio.z) < P.patio.l / 2) return "road";
    if (P.pool && Math.abs(lx - P.pool.x) < P.pool.w / 2 + 0.5 && Math.abs(lz - P.pool.z) < P.pool.l / 2 + 0.5) return "road";
  }
  return d <= ROAD_HALF_WIDTH + SHOULDER ? "shoulder" : "dirt";
}

/**
 * Sites the houses along both sides (once, on first use): lots every 20-30 m,
 * set back behind the shoulder, clear of the side streets and of each other,
 * the yard levelled a little above the street and the garage on whichever end
 * keeps its driveway under a 20% grade.
 */
function sites(): Site[] {
  if (SITES) return SITES;
  siting = true;
  const random = mulberry(20260925), list: Site[] = [];
  const natural = (x: number, z: number) => bHillHeight(x, z);
  const place = (plan: HousePlan, s: number, side: number, gap: number): Site | null => {
    const p = ROUTE[Math.round(s)], nx = p.tz * side, nz = -p.tx * side;
    const setback = ROAD_HALF_WIDTH + SHOULDER + gap + plan.LD / 2;
    const x = p.x + nx * setback, z = p.z + nz * setback, yaw = Math.atan2(-nx, -nz);
    const ax = Math.cos(yaw), az = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const at = (u: number, v: number) => [x + ax * u + fx * v, z + az * u + fz * v] as const;
    const edge: (readonly [number, number])[] = [];
    for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, 0, 1]) edge.push(at(u * plan.LW / 2, v * plan.LD / 2));
    for (const [cx, cz] of edge) {
      const n = nearest(cx, cz);
      if (Math.abs(n.offset) < ROAD_HALF_WIDTH + SHOULDER + 0.8 || Math.abs(n.offset) > CORRIDOR - 1.5 || n.s < 12 || n.s > B_HILL_LENGTH - 12) return null;
      if (onStreet(cx, cz, n, 6)) return null;
    }
    // Clear of the lots already sited (their rectangles, a metre apart).
    const me = { x, z, ax, az, fx, fz, hw: plan.LW / 2 + 0.5, hd: plan.LD / 2 + 0.5 };
    for (const other of list.slice(-6)) if (overlaps(me, { x: other.x, z: other.z, ax: other.ax, az: other.az, fx: other.fx, fz: other.fz, hw: other.plan.LW / 2 + 0.5, hd: other.plan.LD / 2 + 0.5 })) return null;
    // The driveway's foot: where its line meets the shoulder's outer edge (its
    // apron across the shoulder is flush with it, so the shoulder has no edges).
    const [dx0, dz0] = at(plan.gx, plan.LD / 2);
    let reach = Math.max(0.5, Math.abs(nearest(dx0, dz0).offset) - VERGE);
    for (let k = 0; k < 2; k++) { const n = nearest(dx0 + fx * reach, dz0 + fz * reach); reach = Math.max(0.5, reach + Math.abs(n.offset) - VERGE); }
    const nf = nearest(dx0 + fx * reach, dz0 + fz * reach), foot = nf.y + crossSection(VERGE, nf.s);
    // The street falls across the drive's foot: its corners meet the shoulder there too.
    const footAt = (u: number) => { const [ex, ez] = at(plan.gx + u * plan.drive, plan.LD / 2 + reach), n = nearest(ex, ez); return n.y + crossSection(VERGE, n.s); };
    const tilt = (footAt(1) - footAt(-1)) / (2 * plan.drive), rise = Math.abs(tilt) * plan.drive;
    const [cx0, cz0] = at(0, plan.LD / 2 + gap + SHOULDER), nc = nearest(cx0, cz0), street = nc.y + crossSection(GUTTER, nc.s);
    let pad = street + THREE.MathUtils.clamp(natural(x, z) - street, 0.3, 1.0);
    pad = Math.max(pad, foot + rise + 0.15);
    // High enough that the ground can fall from the shoulder's edge to the yard's front at CUT.
    for (const u of [-1, -0.5, 0, 0.5, 1]) {
      const [cx, cz] = at((u * plan.LW) / 2, plan.LD / 2), n = nearest(cx, cz);
      pad = Math.max(pad, n.y + crossSection(VERGE, n.s) - CUT * (Math.abs(n.offset) - VERGE) + 0.12);
    }
    const run = plan.LD / 2 + reach - plan.door;
    if ((pad - foot + rise) / run > 0.21) return null;
    const ground = Math.min(...edge.map(([ex, ez]) => natural(ex, ez)));
    return { plan, x, z, yaw, pad, ground: Math.min(ground, pad - 0.3), foot, reach, tilt, chunk: Math.floor(s / 160), s, side, ax, az, fx, fz };
  };
  for (const side of [-1, 1]) {
    // The first lot on the right leaves room for the hangout at the top.
    let seed = Math.floor(random() * 1e6), plan = planHouse(seed), s = (side < 0 ? 52 : 36) + random() * 10 + plan.LW / 2, tries = 0;
    while (s < B_HILL_LENGTH - 30) {
      const gap = 1.4 + random() * 1.8;
      // The garage on the rolled side, or the other if that keeps the driveway rideable.
      const site = place(plan, s, side, gap) ?? place(planHouse(seed, (-plan.gside) as 1 | -1), s, side, gap);
      if (site) {
        list.push(site);
        seed = Math.floor(random() * 1e6);
        const next = planHouse(seed);
        s += site.plan.LW / 2 + 1 + random() * 4 + next.LW / 2;
        plan = next; tries = 0;
      } else {
        s += 3;
        if (++tries > 8) { seed = Math.floor(random() * 1e6); plan = planHouse(seed); tries = 0; }
      }
    }
  }
  siting = false;
  SITES = list;
  buckets.clear();
  for (const lot of list) for (let b = Math.floor((lot.s - 40) / BUCKET); b <= Math.floor((lot.s + 40) / BUCKET); b++) (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(lot);
  return list;
}
/** Whether two rectangles (centre, axes, half sizes) overlap: separating axes. */
function overlaps(a: { x: number; z: number; ax: number; az: number; fx: number; fz: number; hw: number; hd: number }, b: typeof a) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ux, uz] of [[a.ax, a.az], [a.fx, a.fz], [b.ax, b.az], [b.fx, b.fz]]) {
    const ra = a.hw * Math.abs(a.ax * ux + a.az * uz) + a.hd * Math.abs(a.fx * ux + a.fz * uz);
    const rb = b.hw * Math.abs(b.ax * ux + b.az * uz) + b.hd * Math.abs(b.fx * ux + b.fz * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}
/** The sited lots (for tests and probes). */
export function bHillLots() {
  return sites().map(({ plan, x, z, yaw, pad, foot, reach, tilt, s, side }) => ({ x, z, yaw, pad, foot, reach, tilt, drive: plan.drive, s, side, style: plan.style, LW: plan.LW, LD: plan.LD, gx: plan.gx, door: plan.door, pool: plan.pool, patio: plan.patio, car: plan.car, rv: plan.rv, solar: plan.solar }));
}

/**
 * The hangout at the top: a rack, a vending machine and a drinking fountain on
 * a pad beside the staging area, on the riders' right, facing the road.
 */
export const B_HILL_HANGOUT = (() => {
  const p = ROUTE[32], o = ROAD_HALF_WIDTH + SHOULDER + 2.8;
  return { x: p.x - p.tz * o, z: p.z + p.tx * o, yaw: Math.atan2(p.tz, -p.tx) };
})();

/** Downhill grade (rise over run, positive = falling) at a distance along the route. */
export function bHillGrade(s: number) {
  const i = THREE.MathUtils.clamp(Math.round(s), 1, ROUTE.length - 2);
  return (ROUTE[i - 1].y - ROUTE[i + 1].y) / Math.max(1e-6, ROUTE[i + 1].s - ROUTE[i - 1].s);
}

/** Pose on the route at a distance along it (for spawns, recovery and checkpoints). */
export function routePose(s: number) {
  const i = THREE.MathUtils.clamp(Math.round(s), 0, ROUTE.length - 1), p = ROUTE[i];
  return { x: p.x, z: p.z, y: p.y, yaw: Math.atan2(p.tx, p.tz) };
}

export const B_HILL_SPAWNS = [
  { name: "B HILL / TOP", ...routePose(60) },
  { name: "B HILL / FIRST BENDS", ...routePose(300) },
  { name: "B HILL / NEIGHBORHOOD CORNERS", ...routePose(620) },
  { name: "B HILL / LOWER SWEEPERS", ...routePose(900) },
  { name: "B HILL / RUNOUT", ...routePose(B_HILL_LENGTH - 70) },
].map(({ name, x, z, yaw }) => ({ name, x, z, yaw }));

/** Lightweight route data for future races. No timing, rewards or validation yet. */
export const B_HILL_ROUTE = {
  id: "b_hill",
  length: B_HILL_LENGTH,
  start: routePose(60),
  finish: routePose(B_HILL_LENGTH - 60),
  checkpoints: [150, 320, 480, 620, 780, 920, 1040].filter((s) => s < B_HILL_LENGTH - 80).map((s) => ({ s, ...routePose(s) })),
  recovery: Array.from({ length: Math.floor(B_HILL_LENGTH / 50) }, (_, k) => ({ s: k * 50, ...routePose(k * 50) })),
  grid: [-2.4, 0, 2.4].map((dx) => { const p = routePose(50); return { x: p.x + dx, z: p.z, yaw: p.yaw }; }),
};

/** Distance along the route for a world position (progress readout / recovery). */
export function routeProgress(x: number, z: number) {
  return nearest(x, z).s;
}

export function buildBHill(park: Park) {
  const { scene, world } = park;
  new SkyDome(scene);
  scene.fog = new THREE.Fog(0xd3dee6, 160, 1100);
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x8a7a5a, 1.2));
  const sun = new THREE.DirectionalLight(0xffe9c8, 3.1);
  sun.position.set(-40, 70, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 220 });
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---- Road ribbon collider: one trimesh over the whole rideable corridor ----
  // Beyond the shoulder the columns are close enough to carry the lots' yards,
  // driveways and cut banks, and the side streets.
  const outside = [ROAD_HALF_WIDTH + SHOULDER, 8.6, 10.5, 12.5, 14.5, 17, 19.5, 22, 25, 28, 31.5, 35.5, CORRIDOR];
  const across = [...outside.map((o) => -o).reverse(), -ROAD_HALF_WIDTH, -ROAD_HALF_WIDTH * 0.5, 0, ROAD_HALF_WIDTH * 0.5, ROAD_HALF_WIDTH, ...outside];
  const positions: number[] = [], index: number[] = [];
  const step = 2;
  const rows = Math.floor((ROUTE.length - 1) / step) + 1;
  for (let r = 0; r < rows; r++) {
    const p = ROUTE[Math.min(ROUTE.length - 1, r * step)];
    for (const o of across) {
      const x = p.x + p.tz * o, z = p.z - p.tx * o;
      // Heights use the same function queries use, at this vertex.
      positions.push(x, ribbonHeight(x, z), z);
    }
  }
  const cols = across.length;
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  const colliderHandle = world.createCollider(
    RAPIER.ColliderDesc.trimesh(new Float32Array(positions), new Uint32Array(index)).setFriction(0).setRestitution(0).setCollisionGroups(GROUPS.surface),
  ).handle;

  // ---- What is drawn on it: asphalt, concrete gutters, gravel shoulders and
  // the desert hillside, each a band sampled from the same height function.
  const band = (offsets: number[], uvScale: number) => {
    const p: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let r = 0; r < rows; r++) {
      const q = ROUTE[Math.min(ROUTE.length - 1, r * step)];
      for (const o of offsets) {
        const x = q.x + q.tz * o, z = q.z - q.tx * o;
        p.push(x, bHillHeight(x, z), z);
        uv.push(o / uvScale, q.s / uvScale);
      }
    }
    const n = offsets.length;
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < n - 1; c++) {
        const a = r * n + c, b = a + 1, d = a + n, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const pair = (inner: number[], uvScale: number) => mergeGeometries([band(inner.map((o) => -o).reverse(), uvScale), band(inner, uvScale)])!;
  const gutter = ROAD_HALF_WIDTH + 0.65;
  const surfaces: [string, THREE.BufferGeometry, THREE.Material][] = [
    ["B Hill road", band([-ROAD_HALF_WIDTH, -ROAD_HALF_WIDTH * 0.5, 0, ROAD_HALF_WIDTH * 0.5, ROAD_HALF_WIDTH], 7), new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92, name: "Asphalt" })],
    ["B Hill gutters", pair([ROAD_HALF_WIDTH, gutter], 2), new THREE.MeshStandardMaterial({ map: surfaceTexture("concrete"), color: 0xd8d2c6, roughness: 0.9, name: "Rolled curb" })],
    ["B Hill shoulders", pair([gutter, ROAD_HALF_WIDTH + SHOULDER], 1.8), new THREE.MeshStandardMaterial({ map: gravelTexture(), color: 0xe2cfb2, roughness: 1, name: "Gravel shoulder" })],
    ["B Hill hillside", paintDesert(pair(outside, 5), (x, z) => nearest(x, z).y), desertMaterial()],
  ];
  for (const [name, geometry, material] of surfaces) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    scene.add(mesh);
    park.solids.push(mesh);
    if (name === "B Hill road") mesh.userData.collider = colliderHandle;
  }

  // ---- Gutters and storm drains (#87): water runs down both rolled gutters,
  // most of it into an inlet pair every 80 m; what gets past runs on to the
  // next. The dip before the runout climbs is a sag: its inlets take all of it.
  {
    const lines: GutterLine[] = [];
    const first = 30, last = ROUTE.length - 26;
    for (const side of [-1, 1]) {
      const o = (ROAD_HALF_WIDTH + 0.3) * side, points: THREE.Vector3[] = [], across: [number, number][] = [];
      for (let i = first; i <= last; i++) {
        const p = ROUTE[i], x = p.x + p.tz * o, z = p.z - p.tx * o;
        points.push(new THREE.Vector3(x, bHillHeight(x, z), z));
        across.push([-p.tz * side, p.tx * side]);
      }
      let sag = 0;
      points.forEach((p, i) => { if (p.y < points[sag].y) sag = i; });
      const inlets = [sag];
      for (let s = 100; s < last - 40; s += 80) if (Math.abs(s - first - sag) > 30) inlets.push(s - first);
      lines.push({ points, across, catchment: 9, inlets: inlets.sort((a, b) => a - b), face: 0 });
    }
    new Drainage(scene, lines, bHillHeight);
  }

  // ---- The land around the road: the hill it descends and the ranges beyond --
  // The hill is the route's own elevation spread smoothly outward (so between
  // switchbacks the ground climbs from the lower leg to the upper one); beyond
  // the road's cut it stands a little higher, rolls in swales further out and
  // rises into the River Mountains far off.
  const samples = ROUTE.filter((_, i) => i % 10 === 0);
  const noise = new Noise2(20260924);
  const hillBase = (x: number, z: number) => {
    let sw = 0, sy = 0, near = Infinity;
    for (const q of samples) {
      const d2 = (q.x - x) ** 2 + (q.z - z) ** 2, w = 1 / (d2 + 2500) ** 2;
      sw += w; sy += w * q.y; if (d2 < near) near = d2;
    }
    const dr = Math.sqrt(near);
    return { y: sy / sw - 2 + 9 * THREE.MathUtils.smoothstep(dr, 30, 70) + noise.fbm(x * 0.008, z * 0.008, 4) * 7 * THREE.MathUtils.smoothstep(dr, 60, 220), dr };
  };
  const centre = new THREE.Vector2(-15, 570);
  const land = (x: number, z: number) => {
    const { y: base, dr } = hillBase(x, z);
    let y = base;
    const t = THREE.MathUtils.smoothstep(dr, 420, 900);
    if (t > 0) {
      const angle = Math.atan2(z - centre.y, x - centre.x);
      const envelope = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(angle * 2 + 0.7)) * (0.7 + 0.3 * Math.sin(angle * 5 + 2.1));
      const crest = noise.ridged(x * 0.0022 + 11, z * 0.0022 - 7, 6), body = noise.fbm(x * 0.0011 - 3, z * 0.0011 + 5, 3) * 0.5 + 0.5;
      y += t * t * (40 + envelope * (160 + 330 * crest * body));
    }
    // Never over the road corridor: under it the land hides below the ribbon.
    if (dr < CORRIDOR + 11) {
      const n = nearest(x, z);
      if (Math.abs(n.offset) < CORRIDOR + 2) y = Math.min(y, bHillHeight(x, z) - 0.8);
    }
    return y;
  };
  const terrain = buildTerrain(scene, { center: centre, height: land, base: 0, floor: (x, z) => hillBase(x, z).y, radius: 1750, inner: 720, seed: 88, name: "B Hill desert and ranges" });

  // Skirt: joins the corridor's edge to the land, so there is no seam or gap.
  const SKIRT = [0, 8, 20, 36], BLEND = [0, 0.3, 0.72, 1];
  const underRoads = (x: number, z: number, y: number) => {
    const n = nearest(x, z);
    return Math.abs(n.offset) < CORRIDOR ? Math.min(y, bHillHeight(x, z) - 0.5) : y;
  };
  {
    const skirt: number[] = [], skirtIndex: number[] = [];
    for (const side of [-1, 1]) {
      const base = skirt.length / 3;
      for (let r = 0; r < rows; r++) {
        const p = ROUTE[Math.min(ROUTE.length - 1, r * step)];
        const ex = p.x + p.tz * CORRIDOR * side, ez = p.z - p.tx * CORRIDOR * side, edgeY = bHillHeight(ex, ez);
        SKIRT.forEach((extra, k) => {
          const o = (CORRIDOR + extra) * side, x = p.x + p.tz * o, z = p.z - p.tx * o;
          const y = k === 0 ? edgeY : underRoads(x, z, edgeY + (terrain.surface(x, z) + 0.05 - edgeY) * BLEND[k]);
          skirt.push(x, y, z);
        });
      }
      const n = SKIRT.length;
      for (let r = 0; r < rows - 1; r++)
        for (let c = 0; c < n - 1; c++) {
          const a0 = base + r * n + c, b0 = a0 + 1, d0 = a0 + n, e0 = d0 + 1;
          if (side > 0) skirtIndex.push(a0, d0, b0, b0, d0, e0);
          else skirtIndex.push(a0, b0, d0, b0, e0, d0);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(skirt, 3));
    g.setIndex(skirtIndex);
    g.computeVertexNormals();
    paintDesert(g, (x, z) => hillBase(x, z).y);
    const mesh = new THREE.Mesh(g, desertMaterial());
    mesh.name = "B Hill outer hillside (visual)";
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  /** The drawn ground anywhere: corridor, skirt or land. */
  const groundAt = (x: number, z: number) => {
    const n = nearest(x, z), d = Math.abs(n.offset);
    if (d <= CORRIDOR) return bHillHeight(x, z);
    if (d < CORRIDOR + SKIRT[SKIRT.length - 1]) {
      const side = Math.sign(n.offset), i = Math.round(n.index), p = ROUTE[Math.min(ROUTE.length - 1, i)];
      const edgeY = bHillHeight(p.x + p.tz * CORRIDOR * side, p.z - p.tx * CORRIDOR * side), extra = d - CORRIDOR;
      let k = 1;
      for (let j = 1; j < SKIRT.length; j++) if (extra < SKIRT[j]) { k = BLEND[j - 1] + (BLEND[j] - BLEND[j - 1]) * (extra - SKIRT[j - 1]) / (SKIRT[j] - SKIRT[j - 1]); break; }
      return underRoads(x, z, edgeY + (terrain.surface(x, z) + 0.05 - edgeY) * k);
    }
    return terrain.surface(x, z);
  };

  // Lane markings: dashed centre line, solid edge lines, merged into two meshes.
  const dashes: THREE.BufferGeometry[] = [], edges: THREE.BufferGeometry[] = [];
  const dash = new THREE.PlaneGeometry(0.14, 3), edge = new THREE.PlaneGeometry(0.12, 2.05), place = new THREE.Object3D();
  for (let i = 0; i < ROUTE.length; i += 2) {
    const p = ROUTE[i];
    const mark = (geo: THREE.PlaneGeometry, list: THREE.BufferGeometry[], o: number) => {
      const x = p.x + p.tz * o, z = p.z - p.tx * o;
      place.position.set(x, bHillHeight(x, z) + 0.02, z);
      place.rotation.order = "YXZ";
      // Pitched to the grade: the uphill end (behind) rises with the road.
      place.rotation.set(-Math.PI / 2 - Math.atan2(ROUTE[Math.min(ROUTE.length - 1, i + 1)].y - p.y, 1), Math.atan2(p.tx, p.tz), 0);
      place.updateMatrix();
      list.push(geo.clone().applyMatrix4(place.matrix));
    };
    if (i % 8 === 0) mark(dash, dashes, 0);
    if (!SIDE_STREETS.some((st) => Math.abs(p.s - st.s) < 10)) mark(edge, edges, ROAD_HALF_WIDTH - 0.25);
    mark(edge, edges, -ROAD_HALF_WIDTH + 0.25);
  }
  for (const [list, color, name] of [[dashes, 0xe8d49a, "B Hill centre line"], [edges, 0xe6e2d6, "B Hill edge lines"]] as const) {
    const mesh = new THREE.Mesh(mergeGeometries(list as THREE.BufferGeometry[])!, new THREE.MeshStandardMaterial({ color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.name = name;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---- Side streets: pavement over their ground, a barricade where they end for now.
  {
    const parts: THREE.BufferGeometry[] = [];
    for (const st of SIDE_STREETS) {
      const p: number[] = [], uv: number[] = [], idx: number[] = [];
      const across = [-1, -0.5, 0, 0.5, 1], rows = Math.ceil(st.length / 1.5) + 1;
      for (let r = 0; r < rows; r++) {
        const t = 2 + (r / (rows - 1)) * (st.length - 2);
        for (const a of across) {
          // Sample the paved half-width where this row crosses the street.
          const cx = st.x0 + st.dx * t, cz = st.z0 + st.dz * t, n = nearest(cx, cz), half = streetFrame(st, cx, cz, Math.abs(n.offset) - ROAD_HALF_WIDTH).half;
          const x = cx - st.dz * a * half, z = cz + st.dx * a * half;
          p.push(x, bHillHeight(x, z) + 0.015, z); uv.push((a * half) / 7, t / 7);
        }
      }
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < across.length - 1; c++) { const a = r * across.length + c, b = a + 1, d = a + across.length, e = d + 1; idx.push(a, b, d, b, e, d); }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      parts.push(g.toNonIndexed());
    }
    const streets = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92, name: "Side street asphalt", polygonOffset: true, polygonOffsetFactor: -1 }));
    streets.name = "B Hill side streets";
    streets.receiveShadow = true;
    scene.add(streets);
    park.solids.push(streets);
    // Type III barricades (orange and white rails) with a ROAD CLOSED sign, and a guide sign up the hill.
    const stripes = document.createElement("canvas"); stripes.width = 256; stripes.height = 32;
    { const c = stripes.getContext("2d")!; c.fillStyle = "#f4f1ea"; c.fillRect(0, 0, 256, 32); c.fillStyle = "#e0661c"; for (let k = -1; k < 9; k++) { c.beginPath(); c.moveTo(k * 32, 32); c.lineTo(k * 32 + 16, 0); c.lineTo(k * 32 + 32, 0); c.lineTo(k * 32 + 16, 32); c.fill(); } }
    const railMap = new THREE.CanvasTexture(stripes); railMap.colorSpace = THREE.SRGBColorSpace;
    const railMat = new THREE.MeshStandardMaterial({ map: railMap, roughness: 0.5 }), legMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.7 });
    const sign = (lines: string[], bg: string, fg: string, w: number, h: number) => {
      const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * h / w);
      const g = c.getContext("2d")!; g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, c.width - 20, c.height - 20);
      g.fillStyle = fg; g.textAlign = "center";
      lines.forEach((l, i) => {
        let size = Math.round(c.height / (lines.length + 1.2));
        g.font = `bold ${size}px Arial, sans-serif`;
        const wide = g.measureText(l).width;
        if (wide > 460) { size = Math.floor(size * 460 / wide); g.font = `bold ${size}px Arial, sans-serif`; }
        g.fillText(l, 256, (c.height / (lines.length + 0.4)) * (i + 1));
      });
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
    };
    const pole = new THREE.MeshStandardMaterial({ color: 0x8a8f93, metalness: 0.6, roughness: 0.4 });
    for (const st of SIDE_STREETS) {
      const t = st.length - 2, cx = st.x0 + st.dx * t, cz = st.z0 + st.dz * t, yaw = Math.atan2(st.dx, st.dz), y = bHillHeight(cx, cz);
      const group = new THREE.Group(); group.position.set(cx, y, cz); group.rotation.y = yaw; group.name = "Barricade: " + st.label;
      for (const h of [0.9, 1.35, 1.8]) for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 0.05), railMat); rail.position.set(side * 1.6, h, 0); group.add(rail);
      }
      for (const x of [-2.6, -0.6, 0.6, 2.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.0, 0.08), legMat); leg.position.set(x, 1.0, 0); group.add(leg); }
      const closed = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), sign(["ROAD CLOSED"], "#f4f1ea", "#111111", 1.6, 0.8)); closed.position.set(0, 2.4, -0.05); closed.rotation.y = Math.PI; group.add(closed);
      group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
      scene.add(group);
      world.createCollider(RAPIER.ColliderDesc.cuboid(2.8, 1.0, 0.25).setTranslation(cx, y + 1.0, cz).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }).setFriction(0.3).setCollisionGroups(GROUPS.surface));
      // The guide sign, 60 m up the hill on the street's side, facing riders coming down.
      const at = routePose(st.s - 60), o = ROAD_HALF_WIDTH + SHOULDER + 0.6, sx = at.x + Math.cos(at.yaw) * o, sz = at.z - Math.sin(at.yaw) * o, sy = bHillHeight(sx, sz);
      const guide = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), sign([st.label, "\u2190 NEXT LEFT"], "#1f6b43", "#f4f4f0", 3.2, 1.4));
      guide.position.set(sx, sy + 2.9, sz); guide.rotation.y = at.yaw + Math.PI; guide.name = "Guide sign: " + st.label;
      scene.add(guide);
      for (const px of [-1.2, 1.2]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 8), pole); post.position.set(sx + Math.cos(at.yaw) * px, sy + 1.8, sz - Math.sin(at.yaw) * px); post.castShadow = true; scene.add(post); }
    }
  }

  // ---- Houses on lots terraced into the hill, both sides of the street ---------
  const random = mulberry(20260917);
  const lots = sites();
  const houses = buildHouses(scene, lots.map((lot) => ({ ...lot, groundAt: bHillHeight })));
  scene.userData.detailChunks = houses.detail;
  // Riders crash into walls, houses and cars instead of passing through them,
  // and stand on the yards, the driveways and the pools' floors.
  for (const b of houses.solids)
    world.createCollider(RAPIER.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z).setTranslation(b.center.x, b.center.y, b.center.z).setRotation(b.quaternion).setFriction(0.3).setCollisionGroups(GROUPS.surface));
  const palms = [1, 2, 3].map(fanPalm), trees = [5, 6].map(aleppoPine), yuccas = [7, 8].map(yucca), shrubs = [7, 8].map(bursage);
  const yardLists = { palm: palms.map(() => [] as Placement[]), tree: trees.map(() => [] as Placement[]), yucca: yuccas.map(() => [] as Placement[]), shrub: shrubs.map(() => [] as Placement[]) };
  houses.yard.forEach((spot, i) => {
    const list = yardLists[spot.kind], scale = spot.kind === "palm" ? 0.8 + random() * 0.45 : spot.kind === "tree" ? 0.45 + random() * 0.25 : 0.8 + random() * 0.4;
    list[i % list.length].push({ x: spot.x, y: spot.y - 0.02, z: spot.z, scale, yaw: random() * Math.PI * 2 });
  });
  palms.forEach((m, k) => yardLists.palm[k].length && plant(scene, m, yardLists.palm[k], "B Hill yard palms"));
  trees.forEach((m, k) => yardLists.tree[k].length && plant(scene, m, yardLists.tree[k], "B Hill yard trees"));
  yuccas.forEach((m, k) => yardLists.yucca[k].length && plant(scene, m, yardLists.yucca[k], "B Hill yard yucca", true));
  shrubs.forEach((m, k) => yardLists.shrub[k].length && plant(scene, m, yardLists.shrub[k], "B Hill yard shrubs", true));

  // ---- Desert scatter over the hillsides ------------------------------------
  const inLot = (x: number, z: number) => {
    const n = nearest(x, z);
    if (onStreet(x, z, n, 3)) return true;
    return lotsNear(n.s).some((l) => { const { lx, lz } = lotFrame(l, x, z); return Math.abs(lx) < l.plan.LW / 2 + 1.5 && Math.abs(lz) < l.plan.LD / 2 + l.reach + 1.5; });
  };
  const scatter = scatterDesert(scene, {
    keepOut: (x, z) => Math.abs(nearest(x, z).offset) - (ROAD_HALF_WIDTH + SHOULDER + 1),
    // Fewer than before the houses (#89): the lots and yards fill the roadside now.
    ground: groundAt, center: centre, near: 0.3, far: 230, count: 2400, seed: 424,
    avoid: inLot,
    sample: (r) => {
      const p = ROUTE[Math.floor(r() * (ROUTE.length - 1))], side = r() < 0.5 ? -1 : 1, o = (ROAD_HALF_WIDTH + SHOULDER + 1) + Math.pow(r(), 1.5) * 262;
      return [p.x + p.tz * o * side, p.z - p.tx * o * side];
    },
  });
  // Boulders and yucca near the road are solid.
  for (const kind of scatter)
    if (kind.solid)
      kind.placements.forEach((list, m) => {
        const model = kind.models[m];
        for (const pl of list) {
          if (Math.abs(nearest(pl.x, pl.z).offset) > CORRIDOR + 4 || pl.scale * model.height < 0.5) continue;
          const radius = kind.name === "yucca" ? 0.3 * pl.scale : model.radius * pl.scale * 0.8, half = (model.height * pl.scale) / 2;
          world.createCollider(RAPIER.ColliderDesc.cylinder(half, radius).setTranslation(pl.x, pl.y + half, pl.z).setFriction(0.3).setCollisionGroups(GROUPS.surface));
        }
      });

  // Start and finish banners.
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5b5f63, metalness: 0.6, roughness: 0.45 });
  for (const [s, label] of [[70, "B HILL"], [B_HILL_LENGTH - 60, "FINISH"]] as const) {
    const pose = routePose(s);
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#223331"; ctx.fillRect(0, 0, 512, 96); ctx.fillStyle = "#f3e2bb"; ctx.font = "bold 62px Impact, sans-serif"; ctx.textAlign = "center"; ctx.fillText(label, 256, 70);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    // Readable from both sides: riders coming down see the uphill face.
    for (const turn of [Math.PI, 0]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshStandardMaterial({ map: texture }));
      banner.position.set(pose.x - Math.sin(pose.yaw) * (turn ? 0.01 : -0.01), pose.y + 5.4, pose.z - Math.cos(pose.yaw) * (turn ? 0.01 : -0.01));
      banner.rotation.y = pose.yaw + turn;
      banner.name = "B Hill banner";
      scene.add(banner);
    }
    for (const o of [-5.4, 5.4]) {
      const px = pose.x + Math.cos(pose.yaw) * o, pz = pose.z - Math.sin(pose.yaw) * o;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.4, 8), postMat); post.position.set(px, bHillHeight(px, pz) + 3.2, pz); post.castShadow = true; scene.add(post);
    }
  }
}
