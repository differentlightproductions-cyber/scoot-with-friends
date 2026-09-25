// B Hill: a long neighbourhood descent for scooters and longboards.
//
// One centreline drives everything: the visible road and shoulders, the
// collision mesh, walking height (terrainHeight) and route metadata all sample
// the same elevation and cross-section functions, so the road has no seams,
// steps or invisible walls. The route is a playable interpretation of a
// hillside desert neighbourhood, not a surveyed copy of a real street.
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { GROUPS } from "../physics/groups";
import type { Park } from "./park";
import { surfaceTexture } from "./art";
import { SkyDome } from "../art/sky";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Noise2 } from "../art/noise";
import { buildTerrain, desertMaterial, paintDesert, scatterDesert } from "../art/desert";
import { buildHouses, planHouse, type HouseLot } from "../art/houses";
import { asphaltTexture, gravelTexture } from "../art/textures";
import { bursage, fanPalm, plant, yucca, type Placement } from "../art/flora";
import { Drainage, type GutterLine } from "./gutters";

/** Plan-view control points (metres), top of the hill first. */
const CONTROL: [number, number][] = [
  [0, -95], [0, -40], [0, 40], [18, 120], [58, 190], [62, 260], [22, 320], [-48, 356], [-96, 420],
  [-100, 492], [-62, 548], [-4, 576], [52, 626], [70, 700], [44, 772], [-8, 812], [-40, 866],
  [-34, 940], [-6, 1000], [0, 1060], [0, 1130], [0, 1230],
];
export const ROAD_HALF_WIDTH = 4.6;
const SHOULDER = 2.2;
const CORRIDOR = 34;

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
  // after that is steeper than the last, with brief easings before the tight
  // corners so a rider can set up. Speed comes from this slope and gravity
  // alone: nothing pushes the rider down the hill.
  const total = s;
  const KEYS: [number, number][] = [
    [34, 0], [74, 0.11], [180, 0.105], // TOP: steep but manageable
    [230, 0.08], [290, 0.12], [400, 0.125], // EARLY DESCENT: serious speed
    [450, 0.09], [520, 0.13], [640, 0.135], // MID: turns need planning
    [700, 0.1], [760, 0.145], [900, 0.15], // LOWER: small corrections matter
    [980, 0.12], [1060, 0.16], [1250, 0.165], // FINAL FAST SECTIONS
    [1300, 0.12], [total - 190, 0.05], [total - 140, 0], [total - 90, -0.07], // runout climbs to stop riders
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
  // rises into the hillside on both sides, which keeps riders near the road
  // without any invisible wall.
  const crown = -0.012 * Math.min(1, d / ROAD_HALF_WIDTH) ** 2 * ROAD_HALF_WIDTH;
  // Behind the staging area the road ends in a rising bank, never a drop.
  const backstop = s < 30 ? ((30 - s) / 30) ** 2 * 6 : 0;
  // Past the runout the road ends in the same kind of bank.
  const endstop = s > B_HILL_LENGTH - 25 ? ((s - B_HILL_LENGTH + 25) / 25) ** 2 * 5 : 0;
  if (d <= ROAD_HALF_WIDTH + SHOULDER) return crown + backstop + endstop;
  const out = d - ROAD_HALF_WIDTH - SHOULDER;
  const side = Math.sign(offset) || 1;
  const uphill = side * Math.sin(s * 0.011) > 0 ? 1 : 0.55;
  return crown + backstop + endstop + (out * 0.22 + out * out * 0.012) * uphill + Math.sin(s * 0.07 + offset * 0.3) * Math.min(1, out / 6) * 0.35;
}

/** Walkable/rideable ground height anywhere in the B Hill corridor. */
export function bHillHeight(x: number, z: number) {
  const n = nearest(x, z);
  return n.y + crossSection(n.offset, n.s);
}

/**
 * What the wheels are on at a position: the paved road, its flush shoulder or
 * the rough hillside beyond. The simulation reads this for high-speed stability.
 */
export function bHillSurface(x: number, z: number): "road" | "shoulder" | "dirt" {
  const d = Math.abs(nearest(x, z).offset);
  return d <= ROAD_HALF_WIDTH ? "road" : d <= ROAD_HALF_WIDTH + SHOULDER ? "shoulder" : "dirt";
}

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
  const across = [-CORRIDOR, -24, -16, -11, -ROAD_HALF_WIDTH - SHOULDER, -ROAD_HALF_WIDTH, -ROAD_HALF_WIDTH * 0.5, 0, ROAD_HALF_WIDTH * 0.5, ROAD_HALF_WIDTH, ROAD_HALF_WIDTH + SHOULDER, 11, 16, 24, CORRIDOR];
  const positions: number[] = [], index: number[] = [];
  const step = 2;
  const rows = Math.floor((ROUTE.length - 1) / step) + 1;
  for (let r = 0; r < rows; r++) {
    const p = ROUTE[Math.min(ROUTE.length - 1, r * step)];
    for (const o of across) {
      const x = p.x + p.tz * o, z = p.z - p.tx * o;
      // Heights use the same function queries use, at this vertex.
      positions.push(x, bHillHeight(x, z), z);
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
    ["B Hill hillside", paintDesert(pair([ROAD_HALF_WIDTH + SHOULDER, 11, 16, 24, CORRIDOR], 5), (x, z) => nearest(x, z).y), desertMaterial()],
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
    if (dr < 45) {
      const n = nearest(x, z);
      if (Math.abs(n.offset) < CORRIDOR + 2) y = Math.min(y, n.y + crossSection(n.offset, n.s) - 0.8);
    }
    return y;
  };
  const terrain = buildTerrain(scene, { center: centre, height: land, base: 0, floor: (x, z) => hillBase(x, z).y, radius: 1750, inner: 720, seed: 88, name: "B Hill desert and ranges" });

  // Skirt: joins the corridor's edge to the land, so there is no seam or gap.
  const SKIRT = [0, 8, 20, 36], BLEND = [0, 0.3, 0.72, 1];
  const underRoads = (x: number, z: number, y: number) => {
    const n = nearest(x, z);
    return Math.abs(n.offset) < CORRIDOR ? Math.min(y, n.y + crossSection(n.offset, n.s) - 0.5) : y;
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
    mark(edge, edges, ROAD_HALF_WIDTH - 0.25);
    mark(edge, edges, -ROAD_HALF_WIDTH + 0.25);
  }
  for (const [list, color, name] of [[dashes, 0xe8d49a, "B Hill centre line"], [edges, 0xe6e2d6, "B Hill edge lines"]] as const) {
    const mesh = new THREE.Mesh(mergeGeometries(list as THREE.BufferGeometry[])!, new THREE.MeshStandardMaterial({ color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.name = name;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ---- Houses on cut-and-fill lots, with gravel yards and palms -------------
  const random = mulberry(20260917);
  const lots: HouseLot[] = [];
  const clear = (x: number, z: number, margin: number) => Math.abs(nearest(x, z).offset) > ROAD_HALF_WIDTH + SHOULDER + margin;
  for (let s = 70; s < B_HILL_LENGTH - 120; s += 34 + random() * 22) {
    const p = ROUTE[Math.round(s)], side = random() < 0.5 ? -1 : 1, seed = Math.floor(random() * 1e6);
    const plan = planHouse(seed);
    // Set back so the yard's front wall stands 3 m or more clear of the shoulder.
    const setback = ROAD_HALF_WIDTH + SHOULDER + 3 + plan.LD / 2 + random() * 3;
    const nx = p.tz * side, nz = -p.tx * side, yaw = Math.atan2(-nx, -nz);
    const x = p.x + nx * setback, z = p.z + nz * setback;
    // Every corner of the lot must clear every stretch of road (switchbacks).
    const ax = Math.cos(yaw), az = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([u, v]) => [x + ax * (plan.lotX + u * plan.LW / 2) + fx * v * plan.LD / 2, z + az * (plan.lotX + u * plan.LW / 2) + fz * v * plan.LD / 2]);
    if (!corners.every(([cx, cz]) => clear(cx, cz, 2.5))) continue;
    const frontGround = Math.min(...corners.map(([cx, cz]) => bHillHeight(cx, cz)));
    const pad = Math.max(bHillHeight(x, z), p.y + 0.6) + 0.9;
    const reach = setback - plan.LD / 2 - (ROAD_HALF_WIDTH + SHOULDER) + 0.3;
    const sx = p.x + nx * (ROAD_HALF_WIDTH + SHOULDER) + ax * plan.gx, sz = p.z + nz * (ROAD_HALF_WIDTH + SHOULDER) + az * plan.gx;
    const front = bHillHeight(x - nx * plan.LD / 2 + ax * plan.gx, z - nz * plan.LD / 2 + az * plan.gx);
    lots.push({ x, z, yaw, ground: Math.min(frontGround, pad - 1), front, pad, reach, drop: pad - bHillHeight(sx, sz), seed });
  }
  const houses = buildHouses(scene, lots);
  // Riders crash into walls and houses instead of passing through them.
  for (const b of houses.solids)
    world.createCollider(RAPIER.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z).setTranslation(b.center.x, b.center.y, b.center.z).setRotation(b.quaternion).setFriction(0.3).setCollisionGroups(GROUPS.surface));
  const palms = [1, 2, 3].map(fanPalm), yuccas = [7, 8].map(yucca), shrubs = [7, 8].map(bursage);
  const yardLists = { palm: palms.map(() => [] as Placement[]), yucca: yuccas.map(() => [] as Placement[]), shrub: shrubs.map(() => [] as Placement[]) };
  houses.yard.forEach((spot, i) => {
    const list = yardLists[spot.kind], scale = spot.kind === "palm" ? 0.8 + random() * 0.45 : 0.8 + random() * 0.4;
    list[i % list.length].push({ x: spot.x, y: spot.y - 0.02, z: spot.z, scale, yaw: random() * Math.PI * 2 });
  });
  palms.forEach((m, k) => yardLists.palm[k].length && plant(scene, m, yardLists.palm[k], "B Hill yard palms"));
  yuccas.forEach((m, k) => yardLists.yucca[k].length && plant(scene, m, yardLists.yucca[k], "B Hill yard yucca", true));
  shrubs.forEach((m, k) => yardLists.shrub[k].length && plant(scene, m, yardLists.shrub[k], "B Hill yard shrubs", true));

  // ---- Desert scatter over the hillsides ------------------------------------
  const inLot = (x: number, z: number) => lots.some((l) => Math.hypot(x - l.x, z - l.z) < 16);
  const scatter = scatterDesert(scene, {
    keepOut: (x, z) => Math.abs(nearest(x, z).offset) - (ROAD_HALF_WIDTH + SHOULDER + 1),
    ground: groundAt, center: centre, near: 0.3, far: 260, count: 3600, seed: 424,
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

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
