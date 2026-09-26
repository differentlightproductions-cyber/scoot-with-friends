import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Park } from "./park";
import { GROUPS } from "../physics/groups";
import { surfaceMaterial } from "./art";

/**
 * The Veterans lake dive dock: the spot for on-foot water tricks. It stands at
 * the lake's north tip (#100: the lake lies east of the park, running
 * north-south) and runs south down the lake's length, with deep water ahead
 * and the trail round the lake passing behind it.
 *
 * A short gangway climbs from the grass to a plank deck 0.4 m over the water;
 * stairs on the east half rise to a 3.2 m tower; a springboard runs out past
 * the end on the west half; steel ladders let a swimmer climb back out onto the
 * deck. Everything here is plain data the simulation also reads (the swimmer's
 * footprint, the ladders and the springboard's bounce).
 */
export const DIVE_DOCK = {
  x0: 321.7, x1: 324.3, // deck width
  land: -107.75, // gangway foot on the grass
  z0: -106.35, z1: -98.55, // deck
  deck: 0.4,
  stairs: { x0: 323.0, x1: 324.3, z0: -104.55, z1: -100.15 },
  tower: { x0: 322.9, x1: 324.7, z0: -100.15, z1: -97.55, y: 3.2 },
  board: { x0: 322.1, x1: 322.7, z0: -99.35, z1: -95.75, y0: 0.46, y1: 0.66 },
  /** Water-side foot of each ladder and where it lets the swimmer out on the deck. */
  ladders: [
    { water: [321.25, -101.55] as const, top: [322.15, -101.55] as const },
    { water: [323.65, -98.05] as const, top: [323.65, -98.9] as const },
  ],
  /** A rack on the grass beside the gangway: put the ride up, go for a dip. */
  rack: [319.0, -106.35] as const,
} as const;

/** Springboard top height at (x, z), or null off the board. */
export function springboardTop(x: number, z: number) {
  const b = DIVE_DOCK.board;
  if (x < b.x0 - 0.05 || x > b.x1 + 0.05 || z < b.z0 || z > b.z1) return null;
  return b.y0 + ((z - b.z0) / (b.z1 - b.z0)) * (b.y1 - b.y0);
}

/** A swimmer cannot pass through the deck's footing (they swim under the board and the tower's overhang). */
export function dockBlocks(x: number, z: number, pad = 0.35) {
  const d = DIVE_DOCK;
  return x > d.x0 - pad && x < d.x1 + pad && z > d.land && z < d.z1 + pad;
}
/** The nearest point just clear of the deck's footing, for a swimmer who landed inside it. */
export function dockClear(x: number, z: number, pad = 0.36): [number, number] {
  const d = DIVE_DOCK;
  const west = x - (d.x0 - pad), east = d.x1 + pad - x, north = d.z1 + pad - z;
  const least = Math.min(west, east, north);
  if (least === west) return [d.x0 - pad, z];
  if (least === east) return [d.x1 + pad, z];
  return [x, d.z1 + pad];
}

/** The ladder a swimmer at (x, z) is reaching for, if any. */
export function ladderNear(x: number, z: number, reach = 1.0) {
  return DIVE_DOCK.ladders.find((l) => Math.hypot(x - l.water[0], z - l.water[1]) < reach) ?? null;
}

export function buildDiveDock(park: Park) {
  const d = DIVE_DOCK, scene = park.scene, world = park.world;
  const cx = (d.x0 + d.x1) / 2, width = d.x1 - d.x0;
  const wood = surfaceMaterial(0xb89872, "wood", 1, 1);
  wood.name = "Dock planks";
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x5d4632, roughness: 0.9, name: "Dock pilings" });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9d0d2, metalness: 0.85, roughness: 0.28, name: "Dock rail steel" });
  const fiberglass = new THREE.MeshStandardMaterial({ color: 0xf2f1ea, roughness: 0.35, name: "Springboard fibreglass" });
  const grip = new THREE.MeshStandardMaterial({ color: 0xc9b58f, roughness: 1, name: "Springboard grip" });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2c6e9e, roughness: 0.5, metalness: 0.2, name: "Springboard stand" });
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0) => {
    g.rotateX(rx); g.translate(x, y, z);
    (parts.get(m) ?? parts.set(m, []).get(m)!).push(g);
  };
  const box = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0) => add(m, new THREE.BoxGeometry(sx, sy, sz), x, y, z, rx);
  const post = (m: THREE.Material, x: number, z: number, y0: number, y1: number, r = 0.1) => add(m, new THREE.CylinderGeometry(r, r * 1.08, y1 - y0, 10), x, (y0 + y1) / 2, z);
  const pipe = (a: THREE.Vector3, b: THREE.Vector3, r = 0.024) => {
    const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    add(steel, g, m.x, m.y, m.z);
  };
  const solid = (x: number, y: number, z: number, hx: number, hy: number, hz: number, q?: THREE.Quaternion) => {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.3).setCollisionGroups(GROUPS.surface);
    if (q) desc.setRotation(q);
    world.createCollider(desc);
  };
  /** A slab whose top runs from (z0, y0) to (z1, y1), as a rotated cuboid. */
  const slope = (x0: number, x1: number, z0: number, y0: number, z1: number, y1: number, thick = 0.1) => {
    const len = Math.hypot(z1 - z0, y1 - y0), angle = Math.atan2(y1 - y0, z1 - z0);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle);
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).addScaledVector(n, -thick / 2);
    solid(c.x, c.y, c.z, (x1 - x0) / 2, thick / 2, len / 2, q);
    return { len, angle, q };
  };

  // Deck: planks across the dock with narrow gaps, on stringers and pilings.
  for (let z = d.z0 + 0.075; z < d.z1; z += 0.155) box(wood, cx, d.deck - 0.02, z, width, 0.04, 0.14);
  for (const x of [d.x0 + 0.1, cx, d.x1 - 0.1]) box(darkWood, x, d.deck - 0.1, (d.z0 + d.z1) / 2, 0.08, 0.16, d.z1 - d.z0);
  for (let z = d.z0 + 0.3; z <= d.z1; z += 1.95) for (const x of [d.x0 + 0.08, d.x1 - 0.08]) post(darkWood, x, z, -2.6, d.deck - 0.02, 0.09);
  solid(cx, d.deck - 0.06, (d.z0 + d.z1) / 2, width / 2, 0.06, (d.z1 - d.z0) / 2);
  // Fascia boards along the sides.
  for (const x of [d.x0 - 0.015, d.x1 + 0.015]) box(darkWood, x, d.deck - 0.08, (d.z0 + d.z1) / 2, 0.03, 0.14, d.z1 - d.z0);

  // Gangway from the grass, planked the same way, with a steel handrail on each side.
  const gang = slope(d.x0, d.x1, d.land, 0.0, d.z0, d.deck);
  for (let s = 0.07; s < gang.len; s += 0.155) {
    const z = d.land + Math.cos(gang.angle) * s, y = Math.sin(gang.angle) * s;
    box(wood, cx, y - 0.02, z, width, 0.04, 0.14, -gang.angle);
  }
  for (const x of [d.x0 + 0.05, d.x1 - 0.05]) {
    pipe(new THREE.Vector3(x, 0.9, d.land + 0.1), new THREE.Vector3(x, d.deck + 0.9, d.z0));
    post(steel, x, d.land + 0.1, 0, 0.9, 0.025);
    post(steel, x, d.z0, d.deck, d.deck + 0.9, 0.025);
  }

  // Stairs to the tower: treads over a sloped collider, stringers each side.
  const st = d.stairs, rise = d.tower.y - d.deck, steps = Math.round(rise / 0.2);
  const stairs = slope(st.x0, st.x1, st.z0, d.deck, st.z1, d.tower.y);
  for (let i = 0; i < steps; i++) {
    const z = st.z0 + ((i + 0.5) / steps) * (st.z1 - st.z0), y = d.deck + ((i + 1) / steps) * rise;
    box(wood, (st.x0 + st.x1) / 2, y - 0.02, z, st.x1 - st.x0, 0.04, (st.z1 - st.z0) / steps + 0.04);
    box(wood, (st.x0 + st.x1) / 2, y - 0.1, z - (st.z1 - st.z0) / steps / 2, st.x1 - st.x0 - 0.04, 0.16, 0.02);
  }
  for (const x of [st.x0 + 0.03, st.x1 - 0.03]) box(darkWood, x, (d.deck + d.tower.y) / 2 - 0.12, (st.z0 + st.z1) / 2, 0.05, 0.26, stairs.len, -stairs.angle);
  // Outer stair handrail (the inner side opens onto the deck).
  pipe(new THREE.Vector3(st.x1, d.deck + 0.9, st.z0), new THREE.Vector3(st.x1, d.tower.y + 0.9, st.z1));
  for (let i = 0; i <= 3; i++) {
    const z = st.z0 + (i / 3) * (st.z1 - st.z0), y = d.deck + (i / 3) * rise;
    post(steel, st.x1, z, y, y + 0.9, 0.022);
  }
  solid(st.x1 + 0.03, (d.deck + d.tower.y) / 2 + 0.45, (st.z0 + st.z1) / 2, 0.03, 0.45, stairs.len / 2, stairs.q);

  // Tower: a planked platform on four posts, railed on both sides, open at the front to jump from.
  const t = d.tower, tcx = (t.x0 + t.x1) / 2, tcz = (t.z0 + t.z1) / 2;
  for (let z = t.z0 + 0.075; z < t.z1; z += 0.155) box(wood, tcx, t.y - 0.02, z, t.x1 - t.x0, 0.04, 0.14);
  box(darkWood, tcx, t.y - 0.12, tcz, t.x1 - t.x0, 0.16, t.z1 - t.z0 - 0.1);
  for (const x of [t.x0 + 0.1, t.x1 - 0.1]) for (const z of [t.z0 + 0.1, t.z1 - 0.1]) post(darkWood, x, z, -2.6, t.y - 0.2, 0.11);
  // Cross bracing on the tower legs.
  for (const x of [t.x0 + 0.1, t.x1 - 0.1]) {
    const brace = Math.atan2(t.y - d.deck - 0.6, t.z1 - t.z0 - 0.2);
    box(darkWood, x, (d.deck + t.y) / 2 - 0.1, tcz, 0.05, 0.09, Math.hypot(t.y - d.deck - 0.6, t.z1 - t.z0 - 0.2), brace);
  }
  solid(tcx, t.y - 0.06, tcz, (t.x1 - t.x0) / 2, 0.06, (t.z1 - t.z0) / 2);
  for (const x of [t.x0 + 0.03, t.x1 - 0.03]) {
    for (const y of [0.5, 1.0]) pipe(new THREE.Vector3(x, t.y + y, t.z0), new THREE.Vector3(x, t.y + y, t.z1 - 0.05));
    for (const z of [t.z0, (t.z0 + t.z1) / 2, t.z1 - 0.05]) post(steel, x, z, t.y, t.y + 1.0, 0.022);
    solid(x, t.y + 0.5, tcz, 0.03, 0.5, (t.z1 - t.z0) / 2);
  }
  // Back rail where the stairs arrive only on the deck side of them.
  pipe(new THREE.Vector3(t.x0 + 0.03, t.y + 1.0, t.z0), new THREE.Vector3(st.x0, t.y + 1.0, t.z0));

  // Springboard: fibreglass on a blue stand and fulcrum, grip strip on top, bouncing (see Simulation).
  const b = d.board, bcx = (b.x0 + b.x1) / 2, blen = Math.hypot(b.z1 - b.z0, b.y1 - b.y0), bang = Math.atan2(b.y1 - b.y0, b.z1 - b.z0);
  const bq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -bang);
  const bmid = new THREE.Vector3(bcx, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  box(fiberglass, bmid.x, bmid.y - 0.03, bmid.z, b.x1 - b.x0, 0.06, blen, -bang);
  box(grip, bmid.x, bmid.y + 0.002, bmid.z + 0.2, b.x1 - b.x0 - 0.06, 0.004, blen - 0.5, -bang);
  box(blue, bcx, (d.deck + b.y0) / 2, b.z0 + 0.25, b.x1 - b.x0 + 0.1, b.y0 - d.deck, 0.5);
  box(blue, bcx, d.deck + 0.12, b.z0 + 1.2, b.x1 - b.x0 + 0.14, 0.18, 0.2);
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(bq);
  const bc = bmid.clone().addScaledVector(n, -0.03);
  solid(bc.x, bc.y, bc.z, (b.x1 - b.x0) / 2, 0.03, blen / 2, bq);

  // Ladders: two steel rails from the water to a handhold above the deck, rungs between.
  for (const l of d.ladders) {
    const [wx, wz] = l.water, [tx, tz] = l.top;
    const across = Math.abs(tx - wx) > Math.abs(tz - wz) ? new THREE.Vector3(0, 0, 0.22) : new THREE.Vector3(0.22, 0, 0);
    const edge = new THREE.Vector3(wx + (tx - wx) * 0.45, 0, wz + (tz - wz) * 0.45);
    for (const s of [-1, 1]) {
      const foot = edge.clone().addScaledVector(across, s).setY(-0.5);
      const top = foot.clone().setY(d.deck + 0.75);
      pipe(foot, top, 0.022);
      const over = top.clone().lerp(new THREE.Vector3(tx, top.y, tz).addScaledVector(across, s), 0.55);
      pipe(top, over, 0.022);
      pipe(over, over.clone().setY(d.deck), 0.022);
    }
    for (let y = -0.25; y < d.deck; y += 0.28) pipe(edge.clone().addScaledVector(across, -1).setY(y), edge.clone().addScaledVector(across, 1).setY(y), 0.016);
  }

  // A life ring on a post by the gangway, and the spot's sign.
  post(darkWood, d.x1 + 0.35, d.z0 + 0.2, 0, 1.5, 0.06);
  const ring = new THREE.TorusGeometry(0.28, 0.07, 10, 28);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xe8583a, roughness: 0.6, name: "Life ring" });
  add(ringMat, ring, d.x1 + 0.35, 1.15, d.z0 + 0.13);
  const sign = document.createElement("canvas");
  sign.width = 512; sign.height = 256;
  const g = sign.getContext("2d")!;
  g.fillStyle = "#f3efe2"; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#1f5f8b"; g.fillRect(0, 0, 512, 70);
  g.fillStyle = "#f3efe2"; g.font = "bold 48px sans-serif"; g.textAlign = "center"; g.fillText("DIVE DOCK", 256, 52);
  g.fillStyle = "#1c2326"; g.font = "bold 30px sans-serif";
  g.fillText("FLIPS · DIVES · CANNONBALLS", 256, 120);
  g.font = "24px sans-serif";
  g.fillText("Rack your ride · Jump at your own risk", 256, 166);
  g.fillText("Ladders at the side and the end", 256, 204);
  const tex = new THREE.CanvasTexture(sign);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  board.position.set(d.x0 - 0.9, 1.35, d.land + 0.4);
  board.rotation.y = Math.PI;
  scene.add(board);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.72, 0.04), darkWood);
  back.position.set(d.x0 - 0.9, 1.35, d.land + 0.43);
  scene.add(back);
  post(darkWood, d.x0 - 0.9, d.land + 0.45, 0, 1.05, 0.05);

  for (const [m, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list), m);
    mesh.name = `Dive dock ${m.name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    list.forEach((geo) => geo.dispose());
  }
}
