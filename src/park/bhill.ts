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
  scene.background = new THREE.Color(0xb7d3e4);
  scene.fog = new THREE.Fog(0xc7d9e2, 120, 420);
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x8a7a5a, 1.2));
  const sun = new THREE.DirectionalLight(0xffe9c8, 3.1);
  sun.position.set(-40, 70, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, far: 220 });
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---- Road ribbon: one mesh and one matching trimesh collider ----------------
  const across = [-CORRIDOR, -24, -16, -11, -ROAD_HALF_WIDTH - SHOULDER, -ROAD_HALF_WIDTH, -ROAD_HALF_WIDTH * 0.5, 0, ROAD_HALF_WIDTH * 0.5, ROAD_HALF_WIDTH, ROAD_HALF_WIDTH + SHOULDER, 11, 16, 24, CORRIDOR];
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], index: number[] = [];
  const asphalt = new THREE.Color(0x4b4d4f), shoulder = new THREE.Color(0x8b8374), dirt = new THREE.Color(0xa88a62), scrub = new THREE.Color(0x8c8a5a);
  const step = 2;
  const rows = Math.floor((ROUTE.length - 1) / step) + 1;
  for (let r = 0; r < rows; r++) {
    const p = ROUTE[Math.min(ROUTE.length - 1, r * step)];
    for (const o of across) {
      const x = p.x + p.tz * o, z = p.z - p.tx * o;
      // Heights use the same function queries use, at this vertex.
      const y = bHillHeight(x, z);
      positions.push(x, y, z);
      const d = Math.abs(o);
      const c = d <= ROAD_HALF_WIDTH ? asphalt : d <= ROAD_HALF_WIDTH + SHOULDER ? shoulder : d < 16 ? dirt : scrub;
      const tint = 1 + 0.04 * Math.sin(p.s * 0.21 + o);
      colors.push(c.r * tint, c.g * tint, c.b * tint);
      uvs.push(o * 0.5, p.s * 0.5);
    }
  }
  const cols = across.length;
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const road = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, map: surfaceTexture("concrete") }));
  road.name = "B Hill road and hillside";
  road.receiveShadow = true;
  scene.add(road);
  park.solids.push(road);
  road.userData.collider = world.createCollider(
    RAPIER.ColliderDesc.trimesh(new Float32Array(positions), new Uint32Array(index)).setFriction(0).setRestitution(0).setCollisionGroups(GROUPS.surface),
  ).handle;

  // Visual-only skirt beyond the rideable corridor: the ground falls away toward
  // a valley floor, so it never rises over another stretch of the road.
  {
    const skirt: number[] = [], skirtColors: number[] = [], skirtIndex: number[] = [];
    const reach = [0, 18, 40, 70];
    const ground = new THREE.Color(0x9d8660), far = new THREE.Color(0x8a8a62);
    for (const side of [-1, 1]) {
      const base = skirt.length / 3;
      for (let r = 0; r < rows; r++) {
        const p = ROUTE[Math.min(ROUTE.length - 1, r * step)];
        const ex = p.x + p.tz * CORRIDOR * side, ez = p.z - p.tx * CORRIDOR * side, edgeY = bHillHeight(ex, ez);
        for (const extra of reach) {
          const o = (CORRIDOR + extra) * side;
          skirt.push(p.x + p.tz * o, Math.max(-4, edgeY - extra * 0.45 - (extra / 70) ** 2 * 10), p.z - p.tx * o);
          const c = extra < 30 ? ground : far;
          skirtColors.push(c.r, c.g, c.b);
        }
      }
      const n = reach.length;
      for (let r = 0; r < rows - 1; r++)
        for (let c = 0; c < n - 1; c++) {
          const a0 = base + r * n + c, b0 = a0 + 1, d0 = a0 + n, e0 = d0 + 1;
          if (side > 0) skirtIndex.push(a0, d0, b0, b0, d0, e0);
          else skirtIndex.push(a0, b0, d0, b0, e0, d0);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(skirt, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(skirtColors, 3));
    g.setIndex(skirtIndex);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    mesh.name = "B Hill outer hillside (visual)";
    mesh.receiveShadow = true;
    scene.add(mesh);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.MeshStandardMaterial({ color: 0x8f8360, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -4.5, B_HILL_LENGTH / 2);
    floor.name = "B Hill valley floor (visual)";
    scene.add(floor);
  }

  // Lane markings: dashed centre line, solid edge lines (visual only).
  const markings = new THREE.Group();
  const paint = new THREE.MeshBasicMaterial({ color: 0xe8dcae });
  const white = new THREE.MeshBasicMaterial({ color: 0xdedcd2 });
  const dash = new THREE.PlaneGeometry(0.14, 3), edge = new THREE.PlaneGeometry(0.12, 2.05);
  for (let i = 0; i < ROUTE.length; i += 2) {
    const p = ROUTE[i];
    const place = (geo: THREE.PlaneGeometry, mat: THREE.Material, o: number) => {
      const m = new THREE.Mesh(geo, mat);
      const x = p.x + p.tz * o, z = p.z - p.tx * o;
      m.position.set(x, bHillHeight(x, z) + 0.02, z);
      m.rotation.set(-Math.PI / 2, 0, -Math.atan2(p.tx, p.tz), "YXZ");
      m.rotation.order = "YXZ";
      m.rotation.set(-Math.PI / 2 + Math.atan2(ROUTE[Math.min(ROUTE.length - 1, i + 1)].y - p.y, 1), Math.atan2(p.tx, p.tz), 0);
      markings.add(m);
    };
    if (i % 8 === 0) place(dash, paint, 0);
    place(edge, white, ROAD_HALF_WIDTH - 0.25);
    place(edge, white, -ROAD_HALF_WIDTH + 0.25);
  }
  markings.children.forEach((m) => { m.matrixAutoUpdate = false; m.updateMatrix(); });
  scene.add(markings);

  // ---- Houses, retaining walls, driveways, palms, rocks ----------------------
  const random = mulberry(20260917);
  const stucco = [0xe6d8bd, 0xd9c7a5, 0xcdb89a, 0xe9e1cf, 0xc9b28f];
  const roofs = [0x7b4f3a, 0x8c5b40, 0x6a5a4a, 0x9a6b48];
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9e8f78, roughness: 0.95 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x3f5560, roughness: 0.25, metalness: 0.2 });
  const box = (w: number, h: number, l: number, material: THREE.Material, x: number, y: number, z: number, yaw: number, parent: THREE.Object3D = scene, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  for (let s = 70; s < B_HILL_LENGTH - 120; s += 38 + random() * 22) {
    const p = ROUTE[Math.round(s)];
    const side = random() < 0.5 ? -1 : 1;
    const setback = 17 + random() * 7;
    const x = p.x + p.tz * setback * side, z = p.z - p.tx * setback * side;
    const ground = bHillHeight(x, z), pad = Math.max(ground, p.y + 0.6) + 0.9;
    const yaw = Math.atan2(p.tx, p.tz);
    const house = new THREE.Group();
    const w = 10 + random() * 5, l = 8 + random() * 4, h = 3.2 + (random() < 0.35 ? 3 : 0);
    const color = new THREE.MeshStandardMaterial({ color: stucco[Math.floor(random() * stucco.length)], roughness: 0.92 });
    // Pad and retaining wall facing the road.
    box(w + 6, pad - ground + 1.2, l + 6, wallMat, 0, (pad - ground + 1.2) / 2 - 1.2, 0, 0, house);
    box(w, h, l, color, 0, pad - ground + h / 2, 0, 0, house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, l) * 0.56, 1.8, 4), new THREE.MeshStandardMaterial({ color: roofs[Math.floor(random() * roofs.length)], roughness: 0.85 }));
    roof.position.set(0, pad - ground + h + 0.9, 0); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.hypot(w, l) * 1.3, 1, l / Math.hypot(w, l) * 1.3); roof.castShadow = true; house.add(roof);
    for (const wx of [-w * 0.28, w * 0.18]) box(1.6, 1.2, 0.08, glass, wx, pad - ground + 1.6, -side * (l / 2 + 0.03) * -1, 0, house, false);
    box(2.6, 2.2, 0.1, concrete, w * 0.42, pad - ground + 1.1, -side * (l / 2 + 0.04) * -1, 0, house, false);
    house.position.set(x, ground, z);
    house.rotation.y = yaw + (side < 0 ? Math.PI : 0) + Math.PI / 2 * 0;
    scene.add(house);
    // Driveway sloping from the pad down to the shoulder (visual; no collision into the road).
    const drive = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, setback - ROAD_HALF_WIDTH - SHOULDER - l / 2 - 2), concrete);
    const dm = (setback + ROAD_HALF_WIDTH + SHOULDER) / 2;
    const dx = p.x + p.tz * dm * side, dz = p.z - p.tx * dm * side;
    drive.position.set(dx, (bHillHeight(dx, dz) + pad) / 2 - 0.3, dz);
    drive.rotation.set(0, yaw + Math.PI / 2, 0);
    drive.receiveShadow = true;
    scene.add(drive);
  }
  // Palms and rocks kept well clear of the road and shoulders.
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1, 7), frond = new THREE.ConeGeometry(2.2, 0.8, 7), rock = new THREE.DodecahedronGeometry(1, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 1 }), frondMat = new THREE.MeshStandardMaterial({ color: 0x5f7a3c, roughness: 0.9 }), rockMat = new THREE.MeshStandardMaterial({ color: 0x9d8a70, roughness: 1, flatShading: true });
  for (let s = 30; s < B_HILL_LENGTH; s += 9 + random() * 14) {
    const p = ROUTE[Math.round(s)], side = random() < 0.5 ? -1 : 1, offset = ROAD_HALF_WIDTH + SHOULDER + 3 + random() * 20;
    const x = p.x + p.tz * offset * side, z = p.z - p.tx * offset * side, y = bHillHeight(x, z);
    if (random() < 0.45) {
      const height = 5 + random() * 5;
      const t = new THREE.Mesh(trunk, trunkMat); t.scale.set(1, height, 1); t.position.set(x, y + height / 2, z); t.rotation.z = (random() - 0.5) * 0.15; t.castShadow = true; scene.add(t);
      const f = new THREE.Mesh(frond, frondMat); f.position.set(x, y + height + 0.2, z); f.rotation.x = Math.PI; f.castShadow = true; scene.add(f);
    } else {
      const r = new THREE.Mesh(rock, rockMat); const size = 0.5 + random() * 1.6; r.scale.set(size * 1.3, size * 0.7, size); r.position.set(x, y + size * 0.25, z); r.rotation.y = random() * 6; r.castShadow = true; scene.add(r);
    }
  }
  // Distant connected ridgelines around the whole descent.
  const center = new THREE.Vector3(0, 0, B_HILL_LENGTH / 2);
  for (let layer = 0; layer < 2; layer++) {
    const p: number[] = [], ix: number[] = [], segments = 96, radius = 520 + layer * 140;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const hgt = 70 + layer * 40 + 35 * Math.sin(a * 3 + layer) + 18 * Math.sin(a * 7.3 + 1.1) + 9 * Math.sin(a * 13 + layer * 2);
      p.push(center.x + Math.cos(a) * radius, -30, center.z + Math.sin(a) * radius, center.x + Math.cos(a) * radius, hgt, center.z + Math.sin(a) * radius);
      if (i < segments) { const k = i * 2; ix.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setIndex(ix); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: layer ? 0xa9a08e : 0x9c8d72, side: THREE.DoubleSide, fog: false }));
    m.name = "B Hill distant ridge " + layer; scene.add(m);
  }
  // Start and finish banners.
  for (const [s, label] of [[70, "B HILL"], [B_HILL_LENGTH - 60, "FINISH"]] as const) {
    const pose = routePose(s);
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#223331"; ctx.fillRect(0, 0, 512, 96); ctx.fillStyle = "#f3e2bb"; ctx.font = "bold 62px Impact, sans-serif"; ctx.textAlign = "center"; ctx.fillText(label, 256, 70);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide }));
    banner.position.set(pose.x, pose.y + 5.4, pose.z); banner.rotation.y = pose.yaw; scene.add(banner);
    for (const o of [-5.4, 5.4]) {
      const px = pose.x + Math.cos(pose.yaw) * o, pz = pose.z - Math.sin(pose.yaw) * o;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.4, 8), trunkMat); post.position.set(px, bHillHeight(px, pz) + 3.2, pz); post.castShadow = true; scene.add(post);
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
