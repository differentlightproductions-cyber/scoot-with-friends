import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GROUPS } from "../physics/groups";
import { surfaceTexture } from "./art";
import { asphaltTexture } from "../art/textures";
import { roadMarksMesh, scatterInRects } from "../art/road-marks";
import type { GutterLine } from "./gutters";

/**
 * Streets, curbs and sidewalks (#87). A street is laid a curb's height below
 * the park, as a real one is: the walks, lawns and pads keep the park's level
 * and the asphalt between them is sunk, edged by a concrete curb with a gutter
 * pan falling toward it. One plan answers everything: the ground height the
 * riding and walking read (so a curb is a real step), which curb a rider ran
 * into, the colliders under it all, and the meshes.
 *
 * A curb is not a crack to roll over: a scooter's small front wheel cannot
 * climb one, so riding into one puts the rider down (Simulation.meetWall).
 * Curb ramps and driveways are cut into the walk where paths cross, and a
 * rider can always hop up.
 */
export const CURB = 0.15; // reveal above the gutter lip (6 in)
export const DIP = 0.03; // the gutter pan falls this much to the curb face
export const FACE = CURB + DIP; // curb face above the flowline
export const GUTTER = 0.45; // gutter pan width
const NOSE = 0.15; // width of the curb's top

export interface Rect { x0: number; x1: number; z0: number; z1: number }
/**
 * A curb line: along x at z = `at` (`axis` "x") or along z at x = `at` ("z"),
 * from `from` to `to`; `dir` points from the street toward the high side.
 */
export interface Curb { axis: "x" | "z"; at: number; from: number; to: number; dir: 1 | -1 }
/** A curb ramp or driveway cut into the walk: the curb it meets and how far back it runs. */
export interface Ramp extends Curb { run: number; flare?: number; paving?: "walk" | "asphalt" }

const inside = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const uniq = (v: number[]) => [...new Set(v.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
/** A point's place relative to a curb: along it, and out from it (positive on the high side). */
const local = (c: Curb, x: number, z: number) => (c.axis === "x" ? { along: x, out: (z - c.at) * c.dir } : { along: z, out: (x - c.at) * c.dir });
/** World x, z of a place given along and out from a curb. */
const world = (c: Curb, along: number, out: number): [number, number] => (c.axis === "x" ? [along, c.at + c.dir * out] : [c.at + c.dir * out, along]);
/** A strip beside a curb, `a` to `b` out from it (negative is the street side). */
const strip = (c: Curb, a: number, b: number, from = c.from, to = c.to): Rect => {
  const [p0, q0] = [c.at + c.dir * a, c.at + c.dir * b];
  return c.axis === "x" ? { x0: from, x1: to, z0: Math.min(p0, q0), z1: Math.max(p0, q0) } : { x0: Math.min(p0, q0), x1: Math.max(p0, q0), z0: from, z1: to };
};
const flareOf = (r: Ramp) => r.flare ?? 0.6;
/** A ramp's footprint, flares included. */
export const rampRect = (r: Ramp) => strip(r, 0, r.run, r.from - flareOf(r), r.to + flareOf(r));

function rampHeight(r: Ramp, x: number, z: number) {
  const { along, out } = local(r, x, z);
  if (out < 0 || out > r.run) return 0;
  const flare = flareOf(r), side = along < r.from ? r.from - along : along > r.to ? along - r.to : 0;
  if (side > 0 && side >= flare) return 0;
  // The slope falls to the gutter; its flares fall from the walk to its edges.
  return -FACE * (1 - out / r.run) * (side > 0 ? 1 - side / flare : 1);
}

/** Splits `bounds` into flat rectangles by `level(x, z)` at each grid cell's centre, merged. */
function tile(bounds: Rect, cuts: Rect[], level: (x: number, z: number) => number) {
  const clip = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const xs = uniq([bounds.x0, bounds.x1, ...cuts.flatMap((r) => [clip(r.x0, bounds.x0, bounds.x1), clip(r.x1, bounds.x0, bounds.x1)])]);
  const zs = uniq([bounds.z0, bounds.z1, ...cuts.flatMap((r) => [clip(r.z0, bounds.z0, bounds.z1), clip(r.z1, bounds.z0, bounds.z1)])]);
  const out: { rect: Rect; top: number }[] = [];
  let open = new Map<string, { rect: Rect; top: number }>();
  for (let j = 0; j < zs.length - 1; j++) {
    const row: { x0: number; x1: number; top: number }[] = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const top = level((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2), last = row[row.length - 1];
      if (last && last.top === top && last.x1 === xs[i]) last.x1 = xs[i + 1];
      else row.push({ x0: xs[i], x1: xs[i + 1], top });
    }
    // A run with the same span and level as one in the row before extends it.
    const next = new Map<string, { rect: Rect; top: number }>();
    for (const r of row) {
      const key = `${r.x0}|${r.x1}|${r.top}`, prev = open.get(key);
      if (prev) { prev.rect.z1 = zs[j + 1]; next.set(key, prev); }
      else { const piece = { rect: { x0: r.x0, x1: r.x1, z0: zs[j], z1: zs[j + 1] }, top: r.top }; out.push(piece); next.set(key, piece); }
    }
    open = next;
  }
  return out;
}

/** Flat quads over rectangles at a height, with UVs from a mapping. */
function quads(rects: Rect[], y: number, uv: (x: number, z: number) => [number, number]) {
  const p: number[] = [], t: number[] = [], idx: number[] = [];
  for (const r of rects) {
    const b = p.length / 3;
    for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) { p.push(x, y, z); t.push(...uv(x, z)); }
    idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(p.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(t, 2));
  g.setIndex(idx);
  return g;
}

/** A height-sampled grid over a rectangle (ramps, gutter pans). */
function sheet(r: Rect, height: (x: number, z: number) => number, step: number, uv: (x: number, z: number) => [number, number]) {
  const nx = Math.max(1, Math.ceil((r.x1 - r.x0) / step)), nz = Math.max(1, Math.ceil((r.z1 - r.z0) / step));
  const p: number[] = [], t: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = r.x0 + ((r.x1 - r.x0) * i) / nx, z = r.z0 + ((r.z1 - r.z0) * j) / nz;
      p.push(x, height(x, z), z);
      t.push(...uv(x, z));
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(t, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class StreetPlan {
  /** Every curb line, traced round the streets and the islands in them. */
  readonly curbs: Curb[];
  /** The gutter pans, one along the street side of each curb. */
  readonly pans: Rect[];
  constructor(
    readonly streets: Rect[],
    readonly islands: Rect[] = [],
    readonly ramps: Ramp[] = [],
    /** The sidewalks the plan paves (at the park's level). */
    readonly walks: Rect[] = [],
  ) {
    this.curbs = this.trace();
    this.pans = this.curbs.map((c) => strip(c, -GUTTER, 0));
  }
  inStreet(x: number, z: number) {
    return this.streets.some((r) => inside(r, x, z)) && !this.islands.some((r) => inside(r, x, z));
  }
  /** Ground height relative to the park's level: 0, or lower in a street, its gutters and ramps. */
  offset(x: number, z: number) {
    if (this.inStreet(x, z)) {
      let d = GUTTER;
      for (const c of this.curbs) {
        const { along, out } = local(c, x, z);
        if (along >= c.from && along <= c.to && out <= 0 && -out < d) d = -out;
      }
      return -CURB - DIP * (1 - d / GUTTER);
    }
    let h = 0;
    for (const r of this.ramps) h = Math.min(h, rampHeight(r, x, z));
    return h;
  }
  /**
   * The tallest curb face a move from a to b rides into from the street side,
   * in metres (0 if none). A ramp or flare lowers the face where it is cut.
   */
  curbCrossed(ax: number, az: number, bx: number, bz: number) {
    let best = 0;
    for (const c of this.curbs) {
      const a = local(c, ax, az), b = local(c, bx, bz);
      if (a.out > 0 || b.out < 0 || b.out === a.out) continue;
      const along = a.along + ((b.along - a.along) * -a.out) / (b.out - a.out);
      if (along < c.from - 0.05 || along > c.to + 0.05) continue;
      const [x, z] = world(c, along, 0.02);
      best = Math.max(best, FACE + this.offset(x, z));
    }
    return best;
  }
  /** The curb a point is nearest, and how far (tests, gutter placement). */
  nearestCurb(x: number, z: number) {
    let best: { curb: Curb; distance: number } | null = null;
    for (const c of this.curbs) {
      const { along, out } = local(c, x, z), d = Math.hypot(Math.max(0, c.from - along, along - c.to), out);
      if (!best || d < best.distance) best = { curb: c, distance: d };
    }
    return best;
  }
  /**
   * Gutter flowlines along the curbs (gutters.ts): one per curb run long
   * enough to carry water, with inlets spaced along it. The flat streets are
   * built with a slight designed fall to each inlet.
   */
  gutterLines(options: { minLength?: number; spacing?: number; catchment: (c: Curb) => number }): GutterLine[] {
    const lines: GutterLine[] = [];
    for (const c of this.curbs) {
      const length = c.to - c.from;
      if (length < (options.minLength ?? 12)) continue;
      const n = Math.max(2, Math.ceil(length) + 1), points: THREE.Vector3[] = [], across: [number, number][] = [];
      let tallest = 0;
      for (let i = 0; i < n; i++) {
        const along = c.from + (length * i) / (n - 1), [x, z] = world(c, along, 0);
        const [sx, sz] = world(c, along, -0.02), [hx, hz] = world(c, along, NOSE * 0.5);
        points.push(new THREE.Vector3(x, this.offset(sx, sz), z));
        across.push(c.axis === "x" ? [0, -c.dir] : [-c.dir, 0]);
        tallest = Math.max(tallest, this.offset(hx, hz) - this.offset(sx, sz));
      }
      if (tallest < 0.05) continue; // a street end, ramped flush
      const count = Math.max(1, Math.round(length / (options.spacing ?? 36)));
      const inlets = Array.from({ length: count }, (_, k) => Math.round(((k + 0.5) / count) * (n - 1)));
      const grade = points.map((_, i) => 0.005 * Math.min(...inlets.map((k) => Math.abs(i - k))));
      lines.push({ points, across, catchment: options.catchment(c), inlets, grade, face: FACE });
    }
    return lines;
  }
  /** Curb lines where street cells meet anything else. */
  private trace() {
    const xs = uniq([...this.streets, ...this.islands].flatMap((r) => [r.x0, r.x1]));
    const zs = uniq([...this.streets, ...this.islands].flatMap((r) => [r.z0, r.z1]));
    const cell = (i: number, j: number) => i >= 0 && j >= 0 && i < xs.length - 1 && j < zs.length - 1 && this.inStreet((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
    const out: Curb[] = [];
    const push = (c: Curb) => {
      const last = out[out.length - 1];
      if (last && last.axis === c.axis && last.at === c.at && last.dir === c.dir && Math.abs(last.to - c.from) < 1e-6) last.to = c.to;
      else out.push(c);
    };
    for (let j = 0; j < zs.length; j++)
      for (let i = 0; i < xs.length - 1; i++) {
        const low = cell(i, j - 1), high = cell(i, j);
        if (low !== high) push({ axis: "x", at: zs[j], from: xs[i], to: xs[i + 1], dir: low ? 1 : -1 });
      }
    for (let i = 0; i < xs.length; i++)
      for (let j = 0; j < zs.length - 1; j++) {
        const low = cell(i - 1, j), high = cell(i, j);
        if (low !== high) push({ axis: "z", at: xs[i], from: zs[j], to: zs[j + 1], dir: low ? 1 : -1 });
      }
    return out;
  }
  private get cuts() { return [...this.streets, ...this.islands, ...this.pans, ...this.ramps.map(rampRect)]; }
  /** Flat pieces of the ground at their levels: the park's (0), the street's, and lower under gutters and ramps. */
  pieces(bounds: Rect) {
    const ramps = this.ramps.map(rampRect);
    return tile(bounds, this.cuts, (x, z) => {
      if (this.inStreet(x, z)) return this.pans.some((r) => inside(r, x, z)) ? -FACE : -CURB;
      return ramps.some((r) => inside(r, x, z)) ? -FACE : 0;
    });
  }
  /**
   * Colliders under the ground, flat cuboids at each level. Under a gutter or
   * ramp the cuboid sits at its lowest point, so it never lifts a rider above
   * the height the riding reads.
   */
  colliders(world: RAPIER.World, bounds: Rect, depth = 0.2) {
    for (const { rect: r, top } of this.pieces(bounds))
      world.createCollider(
        RAPIER.ColliderDesc.cuboid((r.x1 - r.x0) / 2, depth / 2, (r.z1 - r.z0) / 2)
          .setTranslation((r.x0 + r.x1) / 2, top - depth / 2, (r.z0 + r.z1) / 2)
          .setCollisionGroups(GROUPS.surface),
      );
  }
  /** The park-level parts of a rectangle: for lawns and ground that must not cover a street. */
  parkLevel(bounds: Rect) {
    const ramps = this.ramps.map(rampRect);
    return tile(bounds, this.cuts, (x, z) => (this.inStreet(x, z) || ramps.some((r) => inside(r, x, z)) ? -1 : 0)).filter((p) => p.top === 0).map((p) => p.rect);
  }
  /**
   * A flat ground cover (lawn, dirt) over `bounds` with the streets cut out.
   * UVs run 0..1 across `bounds`, as a box's top face would have them.
   */
  cover(bounds: Rect, y: number, material: THREE.Material, name: string) {
    const w = bounds.x1 - bounds.x0, d = bounds.z1 - bounds.z0;
    const mesh = new THREE.Mesh(quads(this.parkLevel(bounds), y, (x, z) => [(x - bounds.x0) / w, (bounds.z1 - z) / d]), material);
    mesh.name = name;
    mesh.receiveShadow = true;
    return mesh;
  }
  /** The asphalt, gutter pans, curbs, walks and ramps, as a few meshes. */
  build(scene: THREE.Scene, options: { bounds: Rect; asphaltTint?: number; walkColor?: number }) {
    const { bounds } = options;
    const group = new THREE.Group();
    group.name = "Streets, curbs and sidewalks";
    const concrete = (color: number, name: string) => {
      const map = surfaceTexture("concrete").clone();
      map.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: 0.0012, roughness: 0.93, name });
    };
    const walkColor = options.walkColor ?? 0xc8c5b7;
    const M = {
      asphalt: new THREE.MeshStandardMaterial({ map: asphaltTexture(), color: options.asphaltTint ?? 0xffffff, roughness: 0.92, name: "Street asphalt" }),
      walk: concrete(walkColor, "Sidewalk"),
      curb: concrete(0xd3cfc3, "Curb"),
      pan: concrete(0xb5b0a3, "Gutter pan"),
      tactile: new THREE.MeshStandardMaterial({ color: 0xd9a82a, map: domeTexture(), roughness: 0.7, name: "Tactile warning" }),
    };
    const world = (s: number) => (x: number, z: number): [number, number] => [x / s, z / s];
    const add = (g: THREE.BufferGeometry | null, m: THREE.Material, name: string, shadow = false) => {
      if (!g) return;
      const mesh = new THREE.Mesh(g, m);
      mesh.name = name;
      mesh.receiveShadow = true;
      mesh.castShadow = shadow;
      group.add(mesh);
    };
    const height = (x: number, z: number) => this.offset(x, z);
    // Asphalt over the streets, less the gutter pans (which fall below it).
    const street = this.pieces(bounds).filter((p) => p.top === -CURB).map((p) => p.rect);
    add(quads(street, -CURB, world(7)), M.asphalt, "Street asphalt");
    // Cracks and oil stains, sparse and all different (road-marks.ts).
    const marks = roadMarksMesh(scatterInRects(street, 70, 7031), () => -CURB, "Street cracks and oil");
    if (marks) group.add(marks);
    // Gutter pans, falling to the curb.
    add(mergeGeometries(this.pans.map((r) => sheet(r, height, 1, world(1.2)))), M.pan, "Gutter pans");
    // Walks, less the ramps cut into them; the ramps (and their flares).
    const ramps = this.ramps.map(rampRect);
    const walks = this.walks.flatMap((w) => tile(w, ramps, (x, z) => (ramps.some((r) => inside(r, x, z)) ? -1 : 0)).filter((p) => p.top === 0).map((p) => p.rect));
    add(quads(walks, 0, world(2.4)), M.walk, "Sidewalks");
    const walkRamps = this.ramps.filter((r) => r.paving !== "asphalt"), drives = this.ramps.filter((r) => r.paving === "asphalt");
    if (walkRamps.length) add(mergeGeometries(walkRamps.map((r) => sheet(rampRect(r), height, 0.3, world(2.4)))), M.walk, "Curb ramps");
    if (drives.length) add(mergeGeometries(drives.map((r) => sheet(rampRect(r), height, 0.5, world(7)))), M.asphalt, "Street ends");
    // Truncated-dome warning panels at the foot of each walk ramp.
    const panels = walkRamps.map((r) => {
      const g = sheet(strip(r, 0.02, Math.min(0.62, r.run * 0.45), r.from + 0.1, r.to - 0.1), (x, z) => height(x, z) + 0.004, 0.3, r.axis === "x" ? (x, z) => [x / 0.3, z / 0.3] : (x, z) => [z / 0.3, x / 0.3]);
      return g;
    });
    if (panels.length) add(mergeGeometries(panels), M.tactile, "Curb ramp warning panels");
    // Curbs: the face from the gutter up, a rounded nose, and the top.
    add(mergeGeometries(this.curbs.map((c) => this.curbGeometry(c))), M.curb, "Curbs", true);
    scene.add(group);
    return group;
  }
  /** One curb's face, nose and top, following the ramps cut into it. */
  private curbGeometry(c: Curb) {
    const stops = new Set<number>();
    for (let a = c.from; a < c.to; a += 0.5) stops.add(+a.toFixed(3));
    stops.add(c.to);
    for (const r of this.ramps)
      if (r.axis === c.axis && Math.abs(r.at - c.at) < 1e-3)
        for (const a of [r.from - flareOf(r), r.from, r.to, r.to + flareOf(r)]) if (a > c.from && a < c.to) stops.add(+a.toFixed(3));
    const along = [...stops].sort((a, b) => a - b);
    // Profile across the curb (out from its face, height): gutter, face, nose, top.
    const profile = (top: number): [number, number][] => [[-0.02, -FACE], [0, -FACE], [0, top - 0.025], [0.012, top - 0.004], [0.03, top + 0.003], [NOSE, top + 0.003]];
    const p: number[] = [], t: number[] = [], idx: number[] = [];
    const n = profile(0).length;
    for (const a of along) {
      const [hx, hz] = world(c, a, NOSE * 0.5);
      const top = Math.max(-FACE, this.offset(hx, hz));
      let v = 0;
      profile(top).forEach(([out, y], k) => {
        const [x, z] = world(c, a, out);
        p.push(x, y, z);
        if (k > 0) v += Math.hypot(out - profile(top)[k - 1][0], y - profile(top)[k - 1][1]);
        t.push(a / 1.2, v / 1.2);
      });
    }
    // Winding: the face and top look out of the street, whichever way the curb runs.
    const flip = (c.axis === "x" ? 1 : -1) * c.dir > 0;
    for (let i = 0; i < along.length - 1; i++)
      for (let k = 0; k < n - 1; k++) {
        const a = i * n + k, b = a + 1, d = a + n, e = d + 1;
        if (flip) idx.push(a, b, d, b, e, d);
        else idx.push(a, d, b, b, d, e);
      }
    // End caps where a run stops (an island's corners, a street end), closed from both sides.
    for (const a of [along[0], along[along.length - 1]]) {
      const [hx, hz] = world(c, a, NOSE * 0.5), top = Math.max(-FACE, this.offset(hx, hz));
      if (top + FACE < 0.01) continue;
      const base = p.length / 3, ring = [...profile(top).slice(1), [NOSE, -FACE] as [number, number]];
      for (const [out, y] of ring) { const [x, z] = world(c, a, out); p.push(x, y, z); t.push(out / 1.2, y / 1.2); }
      for (let k = 1; k < ring.length - 1; k++) idx.push(base, base + k, base + k + 1, base, base + k + 1, base + k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(t, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Truncated domes on a yellow warning panel. */
let domes: THREE.Texture | null = null;
function domeTexture() {
  if (domes) return domes;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d8d8d8";
  g.fillRect(0, 0, 64, 64);
  const dot = g.createRadialGradient(30, 29, 2, 32, 32, 14);
  dot.addColorStop(0, "#ffffff");
  dot.addColorStop(0.7, "#e2e2e2");
  dot.addColorStop(1, "#9a9a9a");
  g.fillStyle = dot;
  g.beginPath();
  g.arc(32, 32, 13, 0, Math.PI * 2);
  g.fill();
  domes = new THREE.CanvasTexture(c);
  domes.wrapS = domes.wrapT = THREE.RepeatWrapping;
  domes.colorSpace = THREE.SRGBColorSpace;
  return domes;
}

/** The plan on the map being ridden (null where a map has no streets). */
let active: StreetPlan | null = null;
export function setStreets(plan: StreetPlan | null) { active = plan; }
export function activeStreets() { return active; }
/** The curb face (m) a move from a to b rides into on the active map, 0 if none. */
export function curbCrossed(ax: number, az: number, bx: number, bz: number) {
  return active ? active.curbCrossed(ax, az, bx, bz) : 0;
}
