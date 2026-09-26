import { activeLayout, brushHeight } from "../editor/layout";
import { addSurface, surfaceDisk, surfaceRect } from "./surfaces";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { addParkPeople } from "./people";
import { aleppoPine, boulder, bursage, plant, yucca, type Placement } from '../art/flora';
import RAPIER from "@dimforge/rapier3d-compat";
import type { Park } from "./park";
import { GROUPS } from "../physics/groups";
import { LAKES, WATER, bankRadius, buildShoreline, dressLake, lakeSurfaceGeometry } from "./water";
import { buildLakeBasin } from "./underwater";
import { floodlight, monumentSign, pavilion as buildPavilion, veteransPanel } from "./props";
import { DIVE_DOCK, buildDiveDock } from "./dive-dock";
import { surfaceMaterial } from "./art";
import { CURB, StreetPlan, setStreets, type Ramp, type Rect } from "./streets";
import { Drainage } from "./gutters";
import { asphaltTexture } from "../art/textures";
const clamp = THREE.MathUtils.clamp;
// The compact metal street plaza and BMX track have traded sides.  Keep the
// metal layout authored in its original local coordinates, then place it in
// the former western BMX zone.
const METAL_SHIFT_X = -127;
const METAL_SHIFT_Z = 3;
const mx = (x: number) => x + METAL_SHIFT_X;
const mz = (z: number) => z + METAL_SHIFT_Z;
const BMX = { x0: 46, x1: 84, z0: -22, z1: 22 };
const metalQuarterLocal = [
  {
    id: "metal-west-quarter",
    x0: 48,
    x1: 54,
    z0: 8,
    z1: 18,
    h: 2.2,
    reverse: true,
  },
  {
    id: "metal-east-quarter",
    x0: 72,
    x1: 78,
    z0: 8,
    z1: 18,
    h: 2.2,
    reverse: false,
  },
];
export const metalQuarters = metalQuarterLocal.map((m) => ({
  ...m,
  x0: mx(m.x0),
  x1: mx(m.x1),
  z0: mz(m.z0),
  z1: mz(m.z1),
}));
function quarterHeight(
  x: number,
  reverse: boolean,
  x0: number,
  x1: number,
  h: number,
) {
  const d = clamp(reverse ? x1 - x : x - x0, 0, 3.2),
    r = (3.2 * 3.2 + h * h) / (2 * h);
  return r - Math.sqrt(Math.max(0, r * r - d * d));
}
export function metalHeight(x: number, z: number) {
  x -= METAL_SHIFT_X;
  z -= METAL_SHIFT_Z;
  let h = 0;
  for (const m of metalQuarterLocal)
    if (x >= m.x0 && x <= m.x1 && z >= m.z0 && z <= m.z1)
      h = Math.max(h, quarterHeight(x, m.reverse, m.x0, m.x1, m.h));
  // Four-way street pyramid; clear central stairs beside the bank, with a flat catch deck.
  if (x >= 59 && x <= 72 && z >= -14 && z <= -2) {
    const side = clamp(Math.min(x - 59, 72 - x) / 3.5, 0, 1);
    const front = clamp((z + 14) / 4, 0, 1),
      back = clamp((-2 - z) / 4, 0, 1);
    h = Math.max(h, 1.4 * Math.min(side, front, back));
    if (x >= 65 && x <= 68 && z >= -6)
      h = Math.ceil(clamp((-2 - z) / 0.8, 0, 5)) * 0.28;
  }
  if (x >= 81 && x <= 85 && z >= -15 && z <= -8)
    h = Math.max(h, 0.9 * clamp((z + 15) / 5.5, 0, 1));
  return h;
}
export function bmxHeight(x: number, z: number) {
  if (x < BMX.x0 || x > BMX.x1 || z < BMX.z0 || z > BMX.z1) return 0;
  const edge = Math.min(
    clamp((x - BMX.x0) / 3, 0, 1),
    clamp((BMX.x1 - x) / 3, 0, 1),
    clamp((z - BMX.z0) / 3, 0, 1),
    clamp((BMX.z1 - z) / 3, 0, 1),
  );
  const lane = Math.floor((x - BMX.x0) / 9.5);
  const roller = Math.pow(
    Math.max(0, Math.sin(((z - BMX.z0 + lane * 2) * Math.PI) / 8)),
    2,
  );
  const berm = Math.pow(
    clamp((Math.abs(z - (BMX.z0 + BMX.z1) / 2) - 14) / 5, 0, 1),
    2,
  ) * 1.55;
  return edge * (roller * (lane % 2 ? 0.85 : 1.25) + berm);
}
/**
 * The ballfield DIY lot (#46): the patch of ground west of the west ballfield
 * that riders took over. A poured slab with their own concrete: two kickers
 * facing each other, a long bank against the west edge, a pyramid hip and a
 * waxed manual pad. Heights are terrain, like the metal plaza's, so every
 * feature rides with the same physics; grinds are the park's rails and benches.
 */
/**
 * Litter bins on the lawns (x, z), just off the paths: built as trash cans by
 * interactions.ts. [29, -37] stood in the middle of the path; it is on its edge now.
 */
export const PARK_BINS: readonly (readonly [number, number])[] = [[29, -38.7], [-27, 32], [89, 29]];
/** Picnic pavilions (x, z): the lawns' five and the one on the ballfield path. */
export const PAVILIONS: readonly (readonly [number, number])[] = [[-28, -40], [90, -40], [-87, -30], [-83, 42], [-52, -51], [27, -113]];
export const DIY = { x0: -88, x1: -34, z0: -146, z1: -104 };
export const DIY_PAD = { x0: -50, x1: -44, z0: -113.5, z1: -111.5, h: 0.3 };
export function diyHeight(x: number, z: number) {
  if (x < DIY.x0 || x > DIY.x1 || z < DIY.z0 || z > DIY.z1) return 0;
  let h = 0;
  // Kickers: 0.55 m over 1.8 m, one launching south (+z), one north.
  if (x >= -84 && x <= -81.6 && z >= -121 && z <= -119.2) h = Math.max(h, 0.55 * (z + 121) / 1.8);
  if (x >= -70 && x <= -67.6 && z >= -130.8 && z <= -129) h = Math.max(h, 0.55 * (-129 - z) / 1.8);
  // Bank: rises 0.9 m over 3 m to the lot's west edge.
  if (x <= -85 && z >= -140 && z <= -110) h = Math.max(h, 0.9 * clamp((-85 - x) / 3, 0, 1) * clamp(Math.min(z + 140, -110 - z) / 1.5, 0, 1));
  // Pyramid hip: 0.8 m, 7 m square, a 2 m flat top.
  const px = 3.5 - Math.abs(x + 60), pz = 3.5 - Math.abs(z + 125);
  if (px > 0 && pz > 0) h = Math.max(h, 0.8 * clamp(Math.min(px, pz) / 2.5, 0, 1));
  // Manual pad.
  if (x >= DIY_PAD.x0 && x <= DIY_PAD.x1 && z >= DIY_PAD.z0 && z <= DIY_PAD.z1) h = Math.max(h, DIY_PAD.h);
  return h;
}
// ---- Streets and the parking lot (#87) ----
// The lot, its drive aisle and the two streets are sunk a curb below the park
// (streets.ts): the lot's sidewalks and a walk along each street stay at the
// park's level behind a curb, with curb ramps where the paths cross.
/** Planted parking islands, centred on whole stalls in the lot's rear row. */
const PARKING_ISLANDS: [number, number][] = [
  [-22, -77],
  [24, -77],
  [66, -77],
];
const ISLAND_HX = 2.1,
  ISLAND_HZ = 4.5,
  ISLAND_EDGE = 0.17;
/**
 * The world's extent at Veterans (the ground slab the park is built on). It runs
 * east across Buchanan past the skatepark and the BMX track to the open grass
 * field and the lake (#100, from the owner's street views and aerial photo).
 */
export const VETERANS_BOUNDS: Rect = { x0: -116, x1: 372, z0: -170, z1: 80 };
/** The park's own lawns and streets, west of the east grounds. */
export const PARK_EAST_EDGE = 115;
/** The open grass field east of the BMX track (#100): room for a soccer pitch later. */
export const EAST_FIELD: Rect = { x0: 186, x1: 262, z0: -104, z1: -28 };
/**
 * Lakeside Drive's centreline (#100): from the lot's drive aisle across
 * Buchanan it winds north-east up to the field, rings its north, east and south
 * sides past the pond, and comes back to Buchanan south of the lot, opposite
 * the BMX track. The owner's street views put planted islands, lamps and tree
 * rows along it; the trees are here, the rest is still to dress.
 */
export const LAKESIDE_DRIVE: [number, number][] = [
  [115, -65], [126, -67], [137, -79], [143, -97], [153, -110], [172, -114.5], [205, -114], [238, -113], [258, -106], [268, -88],
  [270, -66], [268, -44], [259, -26], [240, -19], [205, -19], [172, -20], [148, -23], [126, -25], [115, -25],
];
export const LAKESIDE_DRIVE_WIDTH = 7;
const LOT: Rect = { x0: -38, x1: 92, z0: -89, z1: -49 };
const walkRamp = (axis: "x" | "z", at: number, from: number, to: number, dir: 1 | -1): Ramp => ({ axis, at, from, to, dir, run: 1.5 });
const streetEnd = (axis: "x" | "z", at: number, from: number, to: number, dir: 1 | -1): Ramp => ({ axis, at, from, to, dir, run: 3, flare: 1, paving: "asphalt" });
export const VETERANS_STREETS = new StreetPlan(
  [
    LOT,
    { x0: 92, x1: 98.5, z0: -69.5, z1: -60.5 }, // the drive aisle out to the street
    { x0: 98.5, x1: 107.5, z0: -99.125, z1: 69.5 }, // the east street: Buchanan Blvd
    { x0: -110.125, x1: 107.5, z0: 60.5, z1: 69.5 }, // the south street
    // Lakeside Drive's two ends across Buchanan (#100): opposite the drive
    // aisle, and opposite the BMX track.
    { x0: 107.5, x1: 112, z0: -69.5, z1: -60.5 },
    { x0: 107.5, x1: 112, z0: -29.5, z1: -20.5 },
  ],
  PARKING_ISLANDS.map(([x, z]) => ({ x0: x - ISLAND_HX - ISLAND_EDGE, x1: x + ISLAND_HX + ISLAND_EDGE, z0: z - ISLAND_HZ - ISLAND_EDGE, z1: z + ISLAND_HZ + ISLAND_EDGE })),
  [
    // From the park's two paths and the ballfield path down into the lot.
    walkRamp("x", LOT.z1, -3.5, 3.5, 1),
    walkRamp("x", LOT.z1, 61.5, 68.5, 1),
    walkRamp("x", LOT.z0, 25, 29, -1),
    // The east walk crosses the drive aisle.
    walkRamp("x", -69.5, 96.4, 98.5, -1),
    walkRamp("x", -60.5, 96.4, 98.5, 1),
    // And the far walk crosses both ends of Lakeside Drive.
    walkRamp("x", -69.5, 107.5, 109.6, -1),
    walkRamp("x", -60.5, 107.5, 109.6, 1),
    walkRamp("x", -29.5, 107.5, 109.6, -1),
    walkRamp("x", -20.5, 107.5, 109.6, 1),
    // Both corners where the streets meet.
    walkRamp("z", 98.5, 57, 59.5, -1),
    walkRamp("x", 60.5, 95, 97.5, -1),
    walkRamp("z", 107.5, 65.5, 68, 1),
    walkRamp("x", 69.5, 102.5, 105, 1),
    // Where each street runs out into the desert.
    streetEnd("x", -99.125, 98.5, 107.5, -1),
    streetEnd("z", -110.125, 60.5, 69.5, -1),
    // Lakeside Drive rises from the sunk street to the grounds' level.
    streetEnd("z", 112, -69.5, -60.5, 1),
    streetEnd("z", 112, -29.5, -20.5, 1),
  ],
  [
    { x0: -38, x1: 92, z0: -49, z1: -45 }, // the lot's south walk, along the park
    { x0: -38, x1: 92, z0: -93, z1: -89 }, // its north walk, along the ballfields
    { x0: 96.4, x1: 98.5, z0: -99.125, z1: -69.5 }, // the east street's park-side walk
    { x0: 96.4, x1: 98.5, z0: -60.5, z1: 60.5 },
    { x0: -110.125, x1: 98.5, z0: 58.4, z1: 60.5 }, // the south street's
    { x0: 107.5, x1: 109.6, z0: -99.125, z1: -69.5 }, // and the far walks
    { x0: 107.5, x1: 109.6, z0: -60.5, z1: -29.5 },
    { x0: 107.5, x1: 109.6, z0: -20.5, z1: 71.6 },
    { x0: -110.125, x1: 107.5, z0: 69.5, z1: 71.6 },
  ],
);

/**
 * Lakeside Drive (#100): a flat asphalt ribbon at the grounds' level with a
 * dashed centre line and white edge lines, as three meshes. The ground slab
 * under it is already the collider. Returns the centreline, sampled every 2 m.
 */
function buildLakesideDrive(scene: THREE.Scene, clearance: { a: number[]; b: number[]; width: number }[]) {
  const curve = new THREE.CatmullRomCurve3(LAKESIDE_DRIVE.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
  const pts = curve.getSpacedPoints(Math.ceil(curve.getLength() / 2));
  const half = LAKESIDE_DRIVE_WIDTH / 2, sides: THREE.Vector3[] = [], runs: number[] = [];
  let run = 0;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    sides.push(new THREE.Vector3(-(b.z - a.z) / l, 0, (b.x - a.x) / l));
    if (i) run += p.distanceTo(pts[i - 1]);
    runs.push(run);
  });
  // A strip `width` wide centred `offset` off the centreline, drawn where `keep` says; faces up.
  const strip = (offset: number, width: number, y: number, keep: (i: number) => boolean, uvScale = 0) => {
    const position: number[] = [], uv: number[] = [], index: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      if (!keep(i)) continue;
      const k = position.length / 3;
      for (const j of [i - 1, i]) {
        const p = pts[j], n = sides[j];
        position.push(p.x + n.x * (offset + width / 2), y, p.z + n.z * (offset + width / 2), p.x + n.x * (offset - width / 2), y, p.z + n.z * (offset - width / 2));
        uv.push(0, runs[j] * uvScale, width * uvScale, runs[j] * uvScale);
      }
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  const mesh = (g: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const m = new THREE.Mesh(g, material);
    m.name = name;
    m.receiveShadow = true;
    scene.add(m);
  };
  mesh(strip(0, LAKESIDE_DRIVE_WIDTH, 0.006, () => true, 1 / 7), new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92, polygonOffset: true, polygonOffsetUnits: -18, name: "Lakeside Drive asphalt" }), "Lakeside Drive");
  const paint = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, polygonOffset: true, polygonOffsetUnits: -24, name: "Lakeside Drive paint" });
  const inner = (i: number) => runs[i] > 6 && runs[i] < run - 6;
  mesh(strip(0, 0.12, 0.009, (i) => inner(i) && Math.floor(runs[i] / 4) % 2 === 0), paint(0xe9d797), "Lakeside Drive centre line");
  mesh(mergeGeometries([strip(half - 0.35, 0.1, 0.009, inner), strip(-half + 0.35, 0.1, 0.009, inner)]), paint(0xe8e6dc), "Lakeside Drive edge lines");
  // Ridden as road; kept clear of planting.
  for (let i = 0; i < pts.length - 1; i += 6) {
    const a = pts[i], b = pts[Math.min(pts.length - 1, i + 6)];
    addSurface("road", { kind: "segment", a: [a.x, a.z], b: [b.x, b.z], width: LAKESIDE_DRIVE_WIDTH + 0.3 });
    clearance.push({ a: [a.x, a.z], b: [b.x, b.z], width: LAKESIDE_DRIVE_WIDTH });
  }
  return pts;
}

export function extensionHeight(x: number, z: number) {
  return Math.max(metalHeight(x, z), bmxHeight(x, z), diyHeight(x, z));
}

export function buildMemorialGrounds(park: Park) {
  const { scene, world } = park;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
    solid = false,
  ) => {
    const mesh = park.box(v(x, y, z), v(w, h, d), c, solid);
    if (h <= 0.06) {
      mesh.castShadow = false;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.polygonOffset = true;
      material.polygonOffsetFactor = 0;
      material.polygonOffsetUnits = Math.round(-(y + h / 2) * 3000);
    }
    return mesh;
  };
  // Continuous flat collider under the connected grounds. Existing wooden ramp triangles stay untouched.
  setStreets(VETERANS_STREETS);
  if (!activeLayout?.terrain.length) VETERANS_STREETS.colliders(world, VETERANS_BOUNDS);
  else {
    // Edited ground: the coarse grid never rises above a street or ramp it spans.
    const low = (x: number, z: number) => Math.min(0, ...[[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dz]) => VETERANS_STREETS.offset(x + dx, z + dz)));
    const verts: number[] = [],
      indices: number[] = [],
      nx = Math.round((VETERANS_BOUNDS.x1 - VETERANS_BOUNDS.x0) / 2),
      nz = Math.round((VETERANS_BOUNDS.z1 - VETERANS_BOUNDS.z0) / 2);
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = VETERANS_BOUNDS.x0 + i * 2,
          z = VETERANS_BOUNDS.z0 + j * 2;
        verts.push(x, brushHeight(x, z, low(x, z)), z);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(verts),
        new Uint32Array(indices),
      ).setCollisionGroups(GROUPS.surface),
    );
  }
  // The ground slab and the lawn, with the streets cut out of them.
  const cover = (bounds: Rect, top: number, color: number, kind: "wood" | "grass", name: string) => {
    const material = surfaceMaterial(color, kind, bounds.x1 - bounds.x0, bounds.z1 - bounds.z0);
    material.polygonOffset = true;
    material.polygonOffsetUnits = Math.round(-top * 3000);
    scene.add(VETERANS_STREETS.cover(bounds, top, material, name));
  };
  cover(VETERANS_BOUNDS, -0.015, 0xb49a73, "wood", "Veterans ground");
  cover({ x0: 5 - 97.5, x1: 5 + 97.5, z0: 18 - 41, z1: 18 + 41 }, -0.008, 0x7f9b55, "grass", "Veterans lawn");
  VETERANS_STREETS.build(scene, { bounds: VETERANS_BOUNDS });
  // Gutters and storm drains: the lot's curbs gather a wider apron than a street's.
  const lotSide = (c: { axis: "x" | "z"; at: number; from: number; to: number }) => {
    const mid = (c.from + c.to) / 2, [x, z] = c.axis === "x" ? [mid, c.at] : [c.at, mid];
    return x >= LOT.x0 - 0.5 && x <= LOT.x1 + 0.5 && z >= LOT.z0 - 0.5 && z <= LOT.z1 + 0.5;
  };
  new Drainage(scene, VETERANS_STREETS.gutterLines({ catchment: (c) => (lotSide(c) ? 10 : 4.5) }), (x, z) => VETERANS_STREETS.offset(x, z));
  for (const r of VETERANS_STREETS.streets) surfaceRect("road", r.x0, r.x1, r.z0, r.z1);
  for (const r of VETERANS_STREETS.walks) surfaceRect("road", r.x0, r.x1, r.z0, r.z1);
  box(mx(65), 0.001, mz(0), 46, 0.008, 48, 0xb8bab3).name = "Metal street park base";
  box(65, -0.005, 0, 42, 0.008, 48, 0xc3a16f).name = "Dirt riding track base";
  // What the wheels feel (#46): the lawn drags; the plaza and the BMX track's
  // packed dirt ride like they always have.
  surfaceRect("grass", 5 - 97.5, 5 + 97.5, 18 - 41, 18 + 41);
  surfaceRect("road", mx(65) - 23, mx(65) + 23, mz(0) - 24, mz(0) + 24);
  surfaceRect("road", 65 - 21, 65 + 21, -24, 24);
  const patch = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    step: number,
    height: (x: number, z: number) => number,
    color: number,
  ) => {
    const nx = Math.round((x1 - x0) / step),
      nz = Math.round((z1 - z0) / step),
      points: number[] = [],
      indices: number[] = [];
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * step,
          z = z0 + j * step;
        points.push(x, height(x, z), z);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    const visible: number[] = [];
    for (let i = 0; i < indices.length; i += 3)
      if (
        indices.slice(i, i + 3).some((index) => points[index * 3 + 1] > 0.001)
      )
        visible.push(...indices.slice(i, i + 3));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    g.setIndex(visible);
    g.computeVertexNormals();
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        color,
        roughness: color === 0x333c42 ? 0.56 : 0.95,
        metalness: color === 0x333c42 ? 0.4 : 0,
      }),
    );
    m.name =
      x0 === BMX.x0
        ? "Dirt riding track"
        : x0 === 47.75
          ? "Metal half pipe"
          : x0 === 58.75
            ? "Metal pyramid"
            : "Metal kicker";
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
    park.solids.push(m);
    m.userData.collider = world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(points),
        new Uint32Array(indices),
      )
        .setFriction(0)
        .setCollisionGroups(GROUPS.surface),
    ).handle;
  };
  patch(mx(47.75), mx(78.25), mz(7.75), mz(18.25), 0.125, metalHeight, 0x333c42);
  patch(mx(58.75), mx(72.25), mz(-14.25), mz(-1.75), 0.125, metalHeight, 0x333c42);
  patch(mx(80.75), mx(85.25), mz(-15.25), mz(-7.75), 0.125, metalHeight, 0x333c42);
  // The BMX track is authored terrain, so brush strokes rebuild both its
  // visible sand and matching collision surface.
  patch(
    BMX.x0,
    BMX.x1,
    BMX.z0,
    BMX.z1,
    0.25,
    (x, z) => brushHeight(x, z, bmxHeight(x, z)),
    0xc3a16f,
  );
  // The dirt line is self-contained: its fence keeps the dunes off the
  // surrounding concrete paths and grass, with a clear south-side entrance.
  const wireCanvas=document.createElement('canvas');wireCanvas.width=wireCanvas.height=64;const wireContext=wireCanvas.getContext('2d')!;wireContext.strokeStyle='#a3b1ad';wireContext.lineWidth=2;wireContext.beginPath();wireContext.moveTo(0,32);wireContext.lineTo(32,0);wireContext.lineTo(64,32);wireContext.lineTo(32,64);wireContext.closePath();wireContext.stroke();const wireMap=new THREE.CanvasTexture(wireCanvas);wireMap.wrapS=wireMap.wrapT=THREE.RepeatWrapping;wireMap.repeat.set(12,7);const wireMaterial=new THREE.MeshStandardMaterial({map:wireMap,alphaTest:.35,side:THREE.DoubleSide,roughness:.65,metalness:.45});
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const dx=x1-x0,dz=z1-z0,length=Math.hypot(dx,dz),angle=Math.atan2(dx,dz),count=Math.ceil(length/2.8);
    for(let i=0;i<=count;i++){const t=i/count,x=x0+dx*t,z=z0+dz*t;box(x,.91,z,.09,1.82,.09,0x657276,true);box(x,1.84,z,.13,.055,.13,0x9ba7a7);}
    for(let i=0;i<count;i++){const t=(i+.5)/count,x=x0+dx*t,z=z0+dz*t,l=length/count;
      for(const y of [.19,1.72]){const rail=box(x,y,z,.045,.045,l,0x819293,true);rail.rotation.y=angle;world.getCollider(rail.userData.collider)?.setRotation(rail.quaternion);}
      const panel=box(x,.96,z,.025,1.48,l-.09,0x798b89,true);panel.rotation.y=angle;world.getCollider(panel.userData.collider)?.setRotation(panel.quaternion);panel.name='BMX chain-link panel';
      panel.material=wireMaterial;
      if(i%4===0){const brace=box(x,.95,z,.04,1.64,.04,0x7c8b89);brace.rotation.set(.35,angle,0);}
    }
  };
  const fenceX0 = BMX.x0 - 1.2,
    fenceX1 = BMX.x1 + 1.2,
    fenceZ0 = BMX.z0 - 2.8,
    fenceZ1 = BMX.z1 + 1.2,
    gateX0 = 61,
    gateX1 = 69;
  fence(fenceX0, fenceZ0, gateX0, fenceZ0);
  fence(gateX1, fenceZ0, fenceX1, fenceZ0);
  fence(fenceX0, fenceZ1, fenceX1, fenceZ1);
  fence(fenceX0, fenceZ0, fenceX0, fenceZ1);
  fence(fenceX1, fenceZ0, fenceX1, fenceZ1);
  box(gateX0, 1.1, fenceZ0, 0.16, 2.2, 0.16, 0x4f4131, true);
  box(gateX1, 1.1, fenceZ0, 0.16, 2.2, 0.16, 0x4f4131, true);
  // Hinged leaves are visibly parked open beside the posts. The opening has
  // no invisible crossbar collider and connects directly to the approach path.
  fence(gateX0,fenceZ0,gateX0,fenceZ0+3.4);fence(gateX1,fenceZ0,gateX1,fenceZ0+3.4);
  for(const x of [gateX0,gateX1])for(const y of [.3,1.4])box(x,y,fenceZ0,.18,.13,.18,0x9ba7a7);
  for(const x of [gateX0,gateX1]){
    // The open leaves retain their latch and handle at the free end.
    box(x+.09,1.0,fenceZ0+3.27,.04,.25,.055,0xb2bab5);
    box(x+.06,.93,fenceZ0+3.31,.16,.04,.06,0x556367);
  }
  // Low timber entrance sign inspired by the supplied BMX entrance photo.
  // Keep the usable gateway open and omit the reference's city and claims.
  for(const x of [55.3,59.7])box(x,.72,fenceZ0-.65,.18,1.44,.18,0x72513b,true);
  for(const y of [.48,1.05])box(57.5,y,fenceZ0-.69,4.9,.25,.12,0x826044,true);
  box(57.5,.83,fenceZ0-.80,3.9,.72,.12,0x513d2f,true);
  const gateCanvas=document.createElement('canvas');gateCanvas.width=1024;gateCanvas.height=192;
  const gateText=gateCanvas.getContext('2d')!;gateText.fillStyle='#eee8d8';gateText.textAlign='center';gateText.textBaseline='middle';gateText.font='bold 100px sans-serif';gateText.fillText('BMX',512,71);gateText.font='36px sans-serif';gateText.fillText('DIRT RIDING AREA',512,146);
  const gateMap=new THREE.CanvasTexture(gateCanvas);gateMap.colorSpace=THREE.SRGBColorSpace;
  const gateSign=new THREE.Mesh(new THREE.PlaneGeometry(3.7,.69),new THREE.MeshStandardMaterial({map:gateMap,transparent:true,roughness:1}));
  gateSign.position.set(57.5,.83,fenceZ0-.866);gateSign.rotation.y=Math.PI;gateSign.name='BMX timber entrance sign';scene.add(gateSign);
  const metalRail = (
    name: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    kind: "rail" | "ledge" = "rail",
    solid?: THREE.Vector3,
  ) => {
    const before = scene.children.length;
    const pipe = park.rail(name, a, b, kind, undefined, solid);
    for (const m of scene.children.slice(before))
      if (m instanceof THREE.Mesh)
        (m.material as THREE.MeshStandardMaterial).color.set(0x899396);
    return pipe;
  };
  for (const m of metalQuarters) {
    const lip = m.reverse ? m.x1 - 3.2 : m.x0 + 3.2;
    // The pipe runs the full lip, flush with both sides; the grind span is unchanged (#68).
    const a = v(lip, m.h + 0.025, m.z0 + 0.1), b = v(lip, m.h + 0.025, m.z1 - 0.1);
    park.extendPipe(metalRail(m.id + " coping", a, b, "ledge", v(m.reverse ? -1 : 1, 0, 0)), a, b, 0.09, 0.09);
    const back = m.reverse ? m.x0 + 0.15 : m.x1 - 0.15;
    for (let z = m.z0; z <= m.z1; z += 2)
      box(back, m.h + 0.6, z, 0.08, 1.2, 0.08, 0x343d42, true);
    for (const y of [m.h + 0.55, m.h + 1.15])
      box(back, y, mz(13), 0.08, 0.065, 10, 0x465158, true);
    for (const z of [m.z0, m.z1])
      for (let x = m.x0; x < m.x1; x += 0.25) {
        const h = metalHeight(x + 0.125, z);
        box(x + 0.125, h / 2, z, 0.25, h, 0.06, 0x252c31);
      }
  }
  // Stair noses and risers make this line read as stairs rather than a dark bank.
  for (let i = 0; i < 5; i++) {
    const y = 1.4 - i * 0.28,
      z = mz(-5.6 + i * 0.8);
    box(mx(66.5), y / 2, z, 3, y, 0.8, 0x252c31);
    box(mx(66.5), y + 0.008, z + 0.34, 3, 0.015, 0.1, 0x929ca0);
  }
  metalRail("Metal stair handrail", v(mx(65), 2.04, mz(-6.8)), v(mx(65), 0.55, mz(-1.7)));
  metalRail("Metal pyramid bank rail", v(mx(61), 0.58, mz(-14)), v(mx(62.8), 1.96, mz(-9.7)));
  box(mx(51), 0.35, mz(-7), 1.8, 0.7, 10, 0x333c42, true);
  for (const side of [-1, 1])
    metalRail(
      "Metal ledge " + side,
      v(mx(51 + side * 0.86), 0.73, mz(-12)),
      v(mx(51 + side * 0.86), 0.73, mz(-2)),
      "ledge",
      v(mx(51) - mx(51 + side * 0.86), 0, 0),
    );
  metalRail("Metal flat rail", v(mx(80), 0.6, mz(0)), v(mx(80), 0.6, mz(7)));
  for (const x of [44, 86])
    park.bench("Metal park bench " + x, mx(x), 0, mz(23), 1, 3.5);
  // Broad, level paths give a continuous ride from wood to metal, parking and lake.
  let pathSerial = 0;
  const pathClearance:{a:number[];b:number[];width:number}[]=[];
  const path = (points: number[][], width = 4, color = 0xc8c5b7) => {
    const pathId = pathSerial++;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1];
      pathClearance.push({a,b,width});
      addSurface("road", { kind: "segment", a: [a[0], a[1]], b: [b[0], b[1]], width: width + 0.3 });
      const mesh = box(
        (a[0] + b[0]) / 2,
        0.006,
        (a[1] + b[1]) / 2,
        width,
        0.012,
        Math.hypot(dx, dz) + 0.25,
        color,
      );
      mesh.userData.pathId = pathId;
      mesh.name = color === 0xc8c5b7 ? "Concrete path" : "Asphalt path";
      mesh.rotation.y = Math.atan2(dx, dz);
    }
  };
  path([
    [-30, -36],
    [0, -36],
    [35, -36],
    [65, -28],
    [90, -28],
  ]);
  path(
    [
      [25, 0],
      [36, 0],
      [42, 0],
    ],
    6,
  );
  path(
    [
      [0, -36],
      [0, -47],
    ],
    7,
  );
  path(
    [
      [65, -28],
      [65, -47],
    ],
    7,
  );
  path(
    [
      [-30, -36],
      [-35, -20],
      [-35, 25],
      [-27, 42],
      [15, 44],
      [50, 38],
      [88, 28],
      [94, 0],
      [94, -28],
    ],
    4,
  );
  path(
    [
      [-35, -20],
      [-88, -37],
      [-106, -27],
      [-109, 10],
      [-101, 40],
      [-87, 48],
      [-35, 42],
    ],
    4,
  );
  path(
    [
      [-35, -36],
      [-48, -55],
      [-81, -67],
      [-105, -51],
    ],
    4,
  );
  path(
    [
      [-35, 25],
      [-85, 36],
    ],
    4,
  );
  // The lot, the drive aisle and the streets are drawn by the street plan
  // (streets.ts); these are their clearances for planting.
  for (const [a, b, width] of [
    [[-38, -47], [92, -47], 4], [[-38, -91], [92, -91], 4], [[-35, -65], [89, -65], 7],
    [[103, -99], [103, 65], 9], [[103, 65], [-110, 65], 9], [[89, -65], [103, -65], 9],
    [[97.45, -99], [97.45, 60.5], 2.1], [[-110, 59.45], [98.5, 59.45], 2.1],
    [[108.55, -99], [108.55, 71.6], 2.1], [[-110, 70.55], [107.5, 70.55], 2.1],
    [[103, -65], [115, -65], 9], [[103, -25], [115, -25], 9],
  ] as [number[], number[], number][])
    pathClearance.push({ a, b, width });
  // Paint, wheel stops and islands stand on the sunk asphalt, a curb below the park.
  const low = (x: number, y: number, z: number, w: number, h: number, d: number, c: number, solid = false) => {
    const mesh = box(x, y - CURB, z, w, h, d, c, solid);
    if (h <= 0.06) (mesh.material as THREE.MeshStandardMaterial).polygonOffsetUnits = Math.round(-(y + h / 2) * 3000);
    return mesh;
  };
  // Landscaped islands occupy whole stalls in the rear row. Stall striping and
  // wheel stops stop at their curb instead of being drawn across soil and tree
  // trunks; each island is a raised planter at the park's level, curbed round
  // by the street plan, so a tree is never left standing on an invisible plane.
  for (const z of [-50, -72])
    for (let x = -30; x <= 85; x += 4) {
      const island = PARKING_ISLANDS.find(
        (i) => i[1] === z - 5 && Math.abs(x - i[0]) < ISLAND_HX + 0.35,
      );
      // A stripe meeting an island is trimmed back to the curb rather than
      // continuing through it; one fully inside the island is dropped.
      if (!island) low(x, 0.011, z - 5, 0.1, 0.008, 9, 0xeee6d3);
      // Wheel stops stay out of aisle / path crossings and out of the islands.
      const stopX = x + 1.8;
      const blocked = PARKING_ISLANDS.some(
        (i) => i[1] === z - 5 && Math.abs(stopX - i[0]) < ISLAND_HX + 1.4,
      );
      if (Math.abs(x) > 4 && Math.abs(x - 65) > 5 && !blocked)
        low(stopX, 0.095, z - 1, 2.8, 0.19, 0.3, 0xaeb2af, true);
    }
  for (const [ix, iz] of PARKING_ISLANDS)
    box(ix, -0.035, iz, (ISLAND_HX + ISLAND_EDGE - 0.15) * 2, 0.06, (ISLAND_HZ + ISLAND_EDGE - 0.15) * 2, 0x8d7048).name = "Parking island soil";
  for (const x of [-3, 5, 57, 65]) {
    low(x, 0.012, -54, 3.3, 0.01, 7, 0x376888);
    low(x, 0.019, -54, 0.18, 0.008, 3.5, 0xf0efe7);
  }
  // The east street's centre line, and the crosswalk where its walk crosses the aisle.
  for (let z = -95; z < 60; z += 8) low(103, 0.017, z, 0.12, 0.01, 3, 0xe9d797);
  for (let i = 0; i < 4; i++) low(96.6 + i * 0.6, 0.023, -65, 0.32, 0.012, 7.4, 0xe9e7d9);

  // Lake and surrounding trail, set outside the usable skatepark lines: the
  // water itself (water.ts), a slim concrete edge between it and the grass, and
  // the dive dock at its north tip for on-foot water tricks.
  const lake = new THREE.Mesh(lakeSurfaceGeometry());
  lake.name = "lake-water";
  dressLake(lake);
  lake.position.y = WATER.surface;
  scene.add(lake);
  // Under the surface: the basin, its stones and the surface seen from below (#62).
  scene.userData.lakeBasin = buildLakeBasin(scene);
  const shoreline = surfaceMaterial(0xdedad0, "concrete", 2.4, 2.4);
  shoreline.polygonOffset = true;
  shoreline.polygonOffsetUnits = -40;
  const shore = buildShoreline(scene, shoreline);
  buildDiveDock(park);
  // ---- East of the skatepark and the BMX track (#100) ----
  // From the owner's street views and aerial photo: Lakeside Drive leaves the
  // lot's drive aisle across Buchanan, winds up to the open grass field, rings
  // it and comes back to Buchanan opposite the BMX track. Past the field's far
  // end lie the Model Boat Pond and the lake. A gravel trail rings each body of
  // water; paths join the drive to the trails and the dive dock.
  cover(EAST_FIELD, -0.008, 0x7f9b55, "grass", "East field lawn");
  surfaceRect("grass", EAST_FIELD.x0, EAST_FIELD.x1, EAST_FIELD.z0, EAST_FIELD.z1);
  // Where the old lake was, inside its loop path on the west side: lawn.
  cover({ x0: -109, x1: -92.5, z0: -28, z1: 38 }, -0.008, 0x7f9b55, "grass", "West lawn");
  surfaceRect("grass", -109, -92.5, -28, 38);
  const gravel = surfaceMaterial(0xd6c29c, "concrete", 3, 3);
  gravel.polygonOffset = true;
  gravel.polygonOffsetUnits = -30;
  const trails = mergeGeometries([shore.band(0, 4.5, 7.5, 0.006, 3), shore.band(1, 3.5, 6, 0.0068, 3)]);
  const trail = new THREE.Mesh(trails, gravel);
  trail.name = "Lakeside trail";
  trail.receiveShadow = true;
  scene.add(trail);
  const drive = buildLakesideDrive(scene, pathClearance);
  path([[256, -104], [264, -111], [314, -111]], 4); // to the lake's north tip and the dock
  path([[272, -72], [279.5, -72]], 4); // to the pond's trail
  path([[257, -24], [268, -20], [307, -20]], 4); // to the lake's south trail
  const pavilion = (x: number, z: number) => {
    buildPavilion(park, x, z);
    surfaceRect("road", x - 3.5, x + 3.5, z - 3.5, z + 3.5);
    park.bench("Shelter bench " + x + " " + z, x - 1.7, 0, z, 0.85, 3);
  };
  for (const [x, z] of PAVILIONS) pavilion(x, z);
  // Weather (#85): dry ground under each pavilion roof.
  scene.userData.shelters = PAVILIONS.map(([x, z]) => ({ x0: x - 3, z0: z - 3, x1: x + 3, z1: z + 3, top: 3.2 }));
  // The adjoining recreation lawns complete the southern edge of the reference layout.
  path(
    [
      [-30, -93],
      [-30, -151],
      [91, -151],
      [91, -93],
    ],
    4,
  );
  path(
    [
      [27, -93],
      [27, -147],
    ],
    4,
  );
  for (const x of [-3, 57]) {
    const disk = (radius: number, y: number, color: number) => {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 64),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          polygonOffset: true,
          polygonOffsetUnits: -45 - y * 100,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, -123);
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    disk(25, 0.012, 0x718d46);
    disk(11, 0.022, 0xbc8f63);
    surfaceDisk("grass", x, -123, 25);
    surfaceDisk("sand", x, -123, 11);
    for (const [dx, dz] of [
      [0, 7],
      [-6, 0],
      [0, -7],
      [6, 0],
    ])
      box(x + dx, 0.04, -123 + dz, 0.5, 0.04, 0.5, 0xeee9d7);
    const mound = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.2, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0xc39a72 }),
    );
    mound.position.set(x, 0.04, -123);
    scene.add(mound);
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI * 2) / 32;
      if (i > 5 && i < 10) continue;
      box(
        x + Math.cos(angle) * 25,
        1,
        -123 + Math.sin(angle) * 25,
        0.065,
        2,
        0.065,
        0x87918b,
      );
    }
    park.bench("Ballfield bench " + x, x + 19, 0, -107, 1, 4);
  }
  // ---- Ballfield DIY lot (#46) ----
  // A cracked poured slab, the riders' concrete, and a painted tag.
  const slab = box((DIY.x0 + DIY.x1) / 2, 0.002, (DIY.z0 + DIY.z1) / 2, DIY.x1 - DIY.x0, 0.004, DIY.z1 - DIY.z0, 0xa29c8e);
  slab.name = "Ballfield DIY slab";
  surfaceRect("road", DIY.x0, DIY.x1, DIY.z0, DIY.z1);
  for (let i = 0; i < 9; i++) {
    const crack = box(DIY.x0 + 4 + i * 5.8, 0.0055, -125 + Math.sin(i * 2.1) * 12, 0.03, 0.002, 6 + (i % 3) * 3, 0x6f6a61);
    crack.rotation.y = Math.sin(i * 1.7) * 0.9;
  }
  patch(-84.25, -81.35, -121.25, -118.95, 0.125, diyHeight, 0x8f8a7e);
  patch(-70.25, -67.35, -131.05, -128.75, 0.125, diyHeight, 0x8f8a7e);
  patch(-88.25, -84.75, -140.25, -109.75, 0.125, diyHeight, 0x8f8a7e);
  patch(-63.75, -56.25, -128.75, -121.25, 0.125, diyHeight, 0x8f8a7e);
  patch(DIY_PAD.x0 - 0.25, DIY_PAD.x1 + 0.25, DIY_PAD.z0 - 0.25, DIY_PAD.z1 + 0.25, 0.125, diyHeight, 0x8f8a7e);
  // The pad's waxed edges grind on both long sides and both ends.
  const padY = DIY_PAD.h + 0.012;
  for (const [a, b] of [
    [[DIY_PAD.x0, DIY_PAD.z0 + 0.025], [DIY_PAD.x1, DIY_PAD.z0 + 0.025]],
    [[DIY_PAD.x0, DIY_PAD.z1 - 0.025], [DIY_PAD.x1, DIY_PAD.z1 - 0.025]],
  ])
    metalRail("Ballfield DIY manual pad edge", v(a[0], padY, a[1]), v(b[0], padY, b[1]), "ledge");
  // Flat bars on welded legs: a low one for learning, a taller one beside the hip.
  const flatBar = (name: string, x0: number, x1: number, z: number, y: number) => {
    metalRail(name, v(x0, y, z), v(x1, y, z));
    for (const x of [x0 + 0.4, (x0 + x1) / 2, x1 - 0.4]) box(x, y / 2, z, 0.06, y, 0.06, 0x5d6468);
    for (const x of [x0 + 0.4, x1 - 0.4]) box(x, 0.012, z, 0.5, 0.02, 0.5, 0x5d6468);
  };
  flatBar("Ballfield DIY low flat bar", -52, -40, -135, 0.35);
  flatBar("Ballfield DIY flat bar", -75, -65, -140, 0.55);
  // Benches dragged over from the dugouts, waxed and grindable.
  park.bench("Ballfield DIY bench north", -40, 0, -118, 1, 4);
  park.bench("Ballfield DIY bench south", -40, 0, -127, 1, 4);
  park.bench("Ballfield DIY bench west", -76, 0, -108, 1, 4);
  // The tag, sprayed on the slab.
  const tag = document.createElement("canvas"); tag.width = 512; tag.height = 192;
  const t = tag.getContext("2d")!;
  t.font = "900 118px Impact, sans-serif"; t.textAlign = "center"; t.textBaseline = "middle";
  t.lineWidth = 14; t.strokeStyle = "rgba(20,20,20,.75)"; t.strokeText("DIY", 256, 100);
  t.fillStyle = "rgba(255,90,31,.9)"; t.fillText("DIY", 256, 100);
  t.font = "700 30px Impact, sans-serif"; t.fillStyle = "rgba(240,240,230,.85)"; t.fillText("BALLFIELD CREW", 256, 170);
  const tagTexture = new THREE.CanvasTexture(tag); tagTexture.colorSpace = THREE.SRGBColorSpace;
  const tagMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.25), new THREE.MeshStandardMaterial({ map: tagTexture, transparent: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetUnits: -50 }));
  tagMesh.rotation.x = -Math.PI / 2; tagMesh.position.set(-60, 0.008, -110); tagMesh.name = "Ballfield DIY tag"; tagMesh.receiveShadow = true;
  scene.add(tagMesh);
  // Instancing keeps the larger reference landscape light enough for normal play.
  const trees: number[][] = [];
  const clearPlant=(x:number,z:number,r:number)=>!pathClearance.some(({a,b,width})=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<width/2+r;})&&!(x>19&&x<37&&Math.abs(z+44)<5)&&!(x>57&&x<73&&z>-30&&z<-20)&&!park.benches.some(b=>Math.hypot(x-b.x,z-b.z)<b.length/2+r+1)&&![[22,-34],[-42,-20],[52,-28]].some(([a,b])=>Math.hypot(x-a,z-b)<5+r);
  for (let i = 0; i < 90; i++) {
    const x = -109 + ((i * 37) % 215),
      z = -99 + ((i * 53) % 174);
    const excluded =
      (x > -34 && x < 96 && z > -94 && z < -43) ||
      (x > -33 && x < 32 && z > -45 && z < 36) ||
      (x > 39 && x < 90 && z > -26 && z < 26) ||
      (x > -83 && x < -41 && z > -31 && z < 37);
    if (!excluded&&clearPlant(x,z,2.7)) trees.push([x, z, 3.7 + (i % 4) * 0.7]);
  }
  trees.push(
    // Rooted inside the landscaped islands rather than on bare stall paint.
    [PARKING_ISLANDS[0][0], PARKING_ISLANDS[0][1], 4],
    [PARKING_ISLANDS[1][0], PARKING_ISLANDS[1][1], 4],
    [PARKING_ISLANDS[2][0], PARKING_ISLANDS[2][1], 4],
    [35, 12, 5],
    [34, -16, 4],
    [33, 28, 5],
    [91, 20, 4],
    [-29, 20, 5],
  );
  // East (#100): pines in rows along both sides of Lakeside Drive, round the
  // lake and pond past their trails, and scattered over the grounds.
  const bankGap = (x: number, z: number) => Math.min(...LAKES.map((l, i) => Math.hypot(x - l.x, z - l.z) - bankRadius(i, Math.atan2(z - l.z, x - l.x))));
  for (let i = 6; i < drive.length - 6; i += 10) {
    const a = drive[i - 1], b = drive[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    for (const side of [1, -1]) trees.push([drive[i].x + nx * side * 7.8, drive[i].z + nz * side * 7.8, 3.9 + (i % 3) * 0.5]);
  }
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2 + Math.sin(i * 1.7) * 0.05, out = 11 + (i % 3) * 1.6, R = bankRadius(0, a);
    trees.push([LAKES[0].x + Math.cos(a) * (R + out), LAKES[0].z + Math.sin(a) * (R + out), 3.8 + (i % 4) * 0.6]);
  }
  for (let i = 0; i < 40; i++) trees.push([122 + ((i * 53) % 244), -164 + ((i * 97) % 238), 3.6 + (i % 4) * 0.7]);
  for (let i = trees.length - 1; i >= 0; i--) {
    const [x, z] = trees[i];
    if (x > PARK_EAST_EDGE && (bankGap(x, z) < 9 || (x > EAST_FIELD.x0 - 2 && x < EAST_FIELD.x1 + 2 && z > EAST_FIELD.z0 - 2 && z < EAST_FIELD.z1 + 2) || x > VETERANS_BOUNDS.x1 - 3 || z < VETERANS_BOUNDS.z0 + 3 || z > VETERANS_BOUNDS.z1 - 3 || Math.hypot(x - DIVE_DOCK.rack[0], z - DIVE_DOCK.rack[1]) < 6)) trees.splice(i, 1);
  }
  for(let i=trees.length-1;i>=0;i--)if(!clearPlant(trees[i][0],trees[i][1],2.7))trees.splice(i,1);
  // A rider should not be able to ride straight through a tree trunk. One
  // fixed cylinder per tree, sized to the trunk rather than the full canopy
  // so it does not block grinding or riding under low branches.
  for (const [x, z, h] of trees) {
    const ground = park.groundHeight(x, z), radius = 0.28, height = Math.min(h, 2.4);
    park.world.createCollider(
      RAPIER.ColliderDesc.cylinder(height / 2, radius)
        .setTranslation(x, ground + height / 2, z)
        .setFriction(0.1)
        .setCollisionGroups(GROUPS.surface),
    );
  }
  // Aleppo pines: the park's big shade trees (generated, see art/flora.ts).
  // Four shapes, each tree its own size and turn.
  const pines = [0, 1, 2, 3].map((k) => aleppoPine(k + 1)), perches: THREE.Vector3[] = [], UP = new THREE.Vector3(0, 1, 0);
  pines.forEach((model, k) => {
    const mine = trees.filter((_, i) => i % pines.length === k);
    const placed = mine.map(([x, z, h], i) => ({ x, y: park.groundHeight(x, z) - 0.05, z, scale: (h * 2.3) / model.height, yaw: i * 2.399 + k }));
    plant(scene, model, placed, "tree-pines");
    // Branch tops in world space, for the mourning doves (#71).
    for (const p of placed) for (const b of model.perches ?? []) perches.push(b.clone().multiplyScalar(p.scale).applyAxisAngle(UP, p.yaw).add(new THREE.Vector3(p.x, p.y, p.z)));
  });
  scene.userData.treePerches = perches;
  addParkPeople(scene);
  // The old decorative park bins became usable trash cans (see PARK_BINS, #58).
  // Xeriscape beds along the paths: white bursage with the odd Mojave yucca.
  const beds: Placement[] = [], accents: Placement[] = [];
  for (let i = 0; i < 120; i++) {
    const strip = i < 40 ? -42 : i < 80 ? 36 : -94;
    const x = -105 + (i % 40) * 5.3,
      z = strip + Math.sin(i * 2.3) * 1.8;
    const entrance =
      strip === -42 &&
      (Math.abs(x) < 6 ||
        Math.abs(x - 65) < 7 ||
        Math.abs(x + 28) < 6 ||
        Math.abs(x - 90) < 5);
    if (entrance || !clearPlant(x, z, 1.1)) continue;
    const spot = { x, y: park.groundHeight(x, z), z, scale: 0.9 + (i % 3) * 0.2, yaw: i * 1.7 };
    (i % 9 === 4 ? accents : beds).push(spot);
  }
  [0, 1, 2].forEach((k) => plant(scene, bursage(k + 1), beds.filter((_, i) => i % 3 === k), "xeriscape bursage", true));
  plant(scene, yucca(3), accents, "yucca");
  // Varnished boulders set around the lawns, clear of the riding areas.
  const stones: Placement[] = [];
  for (let i = 0; i < 80; i++) {
    const x = -108 + ((i * 41) % 216),
      z = -100 + ((i * 47) % 174);
    const occupied =
      (x > -35 && x < 96 && z > -94 && z < 35) ||
      (x > -83 && x < -40 && z > -32 && z < 38);
    if (occupied || !clearPlant(x, z, 1)) continue;
    stones.push({ x, y: park.groundHeight(x, z) - 0.1, z, scale: 0.35 + (i % 4) * 0.18, yaw: i * 0.9 });
  }
  [0, 1, 2].forEach((k) => plant(scene, boulder(k + 5), stones.filter((_, i) => i % 3 === k), "rocks", true));
  // The three parking floodlights used to stand a metre inside the lot, in the
  // rear drive aisle. They now line its southern verge beyond the footpath.
  for (const [x, z] of [
    [35, -28],
    [43, 25],
    [88, 25],
    [88, -22],
    [-35, -45],
    [-24, -94.4],
    [22, -94.4],
    [85, -94.4],
    [-86, -35],
    [-86, 36],
  ]) {
    floodlight(park, new THREE.Vector3(x, 0, z));
  }
  // No city/state text in the game signage. The monument (props.ts) stands where
  // the old board sign stood, lettered on both faces.
  monumentSign(park, 28, -44, veteransPanel());
}
