// Built wooden ramps for the Veterans Memorial wood park.
//
// Every visible surface is generated from the same analytic profile the
// physics rides (outdoor.ts `profile`), so the riding sheet, sides and plates
// sit exactly on the collision surface: no gap around the base, no lumpy
// imported skin. Construction follows a real outdoor ramp: birch plywood
// riding sheets on sheathed plywood sides trimmed with 2x lumber, a steel kick
// plate at the foot of every transition and steel coping at every lip.
import * as THREE from "three";
import type { RampModule } from "./outdoor";

/** Riding sheet thickness above the physics surface. */
const SHEET = 0.012;
/** Plywood sheet size (4 x 8 ft). */
const SHEET_W = 1.22, SHEET_L = 2.44;
/** Kick plate run up the transition from the ground. */
const PLATE = 0.46;

const cache = new Map<string, THREE.Texture>();
function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * One 4 x 8 ft birch plywood sheet: pale face veneer with long soft grain,
 * the odd patched knot, a dark seam at the sheet edges and rows of countersunk
 * screws along the framing it is fixed to. `worn` adds the grey wheel polish
 * riding sheets pick up.
 */
function plywoodTexture(kind: "riding" | "side" | "trim") {
  const hit = cache.get(kind);
  if (hit) return hit;
  const w = 512, h = 1024, c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const random = seeded(kind === "riding" ? 81 : kind === "side" ? 202 : 377);
  const base = kind === "trim" ? [168, 114, 62] : kind === "side" ? [194, 150, 98] : [208, 166, 108];
  const img = ctx.createImageData(w, h);
  // Long grain along the sheet: layered sine bands warped by low-frequency waves.
  const phase = Array.from({ length: 6 }, () => random() * 10);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const warp = Math.sin(y * 0.003 + phase[0]) * 10 + Math.sin(y * 0.013 + phase[1]) * 3;
      const u = x + warp;
      // Rotary-cut face veneer: fine parallel lines with a few wide soft figure bands.
      const fine = Math.sin(u * 0.55 + Math.sin(y * 0.02 + u * 0.01) * 0.8);
      const figure = Math.sin(u * 0.045 + Math.sin(u * 0.011 + phase[2]) * 2.2 + phase[3]);
      const grain = fine * 0.35 + figure * 0.65;
      const tone = 1 + grain * (kind === "trim" ? 0.1 : kind === "side" ? 0.05 : 0.075) + (random() - 0.5) * 0.03;
      const i = (y * w + x) * 4;
      img.data[i] = base[0] * tone;
      img.data[i + 1] = base[1] * tone;
      img.data[i + 2] = base[2] * tone;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  // Soft colour drift across the veneer so tiled sheets do not read as copies.
  for (let k = 0; k < 7; k++) {
    const g = ctx.createRadialGradient(random() * w, random() * h, 0, random() * w, random() * h, 120 + random() * 260);
    g.addColorStop(0, `rgba(${random() < 0.5 ? "120,80,40" : "255,235,200"},${0.05 + random() * 0.05})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (kind !== "trim") {
    // Football patches and small tight knots, as on a real B/BB face.
    for (let k = 0; k < 4; k++) {
      const x = 40 + random() * (w - 80), y = 60 + random() * (h - 120);
      ctx.fillStyle = "rgba(150,105,60,.28)";
      ctx.beginPath(); ctx.ellipse(x, y, 5 + random() * 4, 11 + random() * 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(110,75,40,.25)"; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  if (kind === "riding") {
    // Grey wheel polish down the middle of the sheet.
    const wear = ctx.createLinearGradient(0, 0, w, 0);
    wear.addColorStop(0, "rgba(80,70,60,0)"); wear.addColorStop(0.5, "rgba(80,70,60,.14)"); wear.addColorStop(1, "rgba(80,70,60,0)");
    ctx.fillStyle = wear; ctx.fillRect(0, 0, w, h);
  }
  if (kind !== "trim") {
    // Sheet seams and screw rows into the framing below (edges and centre).
    ctx.fillStyle = "rgba(60,36,16,.75)";
    ctx.fillRect(0, 0, w, 3); ctx.fillRect(0, 0, 3, h);
    ctx.fillStyle = "rgba(255,240,210,.18)";
    ctx.fillRect(0, 2, w, 1); ctx.fillRect(2, 0, 1, h);
    const screw = (x: number, y: number) => {
      ctx.fillStyle = "rgba(60,58,55,.75)"; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(200,195,185,.35)"; ctx.beginPath(); ctx.arc(x - 0.6, y - 0.6, 1, 0, Math.PI * 2); ctx.fill();
    };
    for (let y = 26; y < h; y += 64) for (const x of [9, w / 2, w - 7]) screw(x + (random() - 0.5) * 2, y);
    for (let x = 30; x < w; x += 60) for (const y of [8, h - 6]) screw(x, y + (random() - 0.5) * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(kind, t);
  return t;
}

/** Brushed steel: fine lengthwise streaks for the kick plates. */
function steelTexture() {
  const hit = cache.get("steel");
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const ctx = c.getContext("2d")!, random = seeded(9);
  ctx.fillStyle = "#b8bcbd"; ctx.fillRect(0, 0, 256, 64);
  for (let k = 0; k < 400; k++) {
    const y = random() * 64, v = 160 + random() * 70;
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 4},.35)`;
    ctx.fillRect(random() * 256, y, 20 + random() * 120, 0.8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set("steel", t);
  return t;
}

let shared: { riding: THREE.MeshStandardMaterial; side: THREE.MeshStandardMaterial; trim: THREE.MeshStandardMaterial; steel: THREE.MeshStandardMaterial } | null = null;
export function woodRampMaterials() {
  if (shared) return shared;
  const riding = plywoodTexture("riding"), side = plywoodTexture("side"), trim = plywoodTexture("trim");
  shared = {
    riding: new THREE.MeshStandardMaterial({ map: riding, bumpMap: riding, bumpScale: 0.0015, roughness: 0.74, name: "Birch plywood riding sheet" }),
    side: new THREE.MeshStandardMaterial({ map: side, bumpMap: side, bumpScale: 0.0015, roughness: 0.82, name: "Plywood side sheathing" }),
    trim: new THREE.MeshStandardMaterial({ map: trim, roughness: 0.8, name: "2x lumber trim" }),
    steel: new THREE.MeshStandardMaterial({ map: steelTexture(), color: 0xffffff, metalness: 0.8, roughness: 0.36, name: "Steel kick plate" }),
  };
  return shared;
}

/** Reverses a geometry's triangle winding (turns its faces around). */
function flip(g: THREE.BufferGeometry) {
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    idx.setX(i, idx.getX(i + 1));
    idx.setX(i + 1, a);
  }
}

/** Where the riding surface meets the ground for each module (z of each foot). */
function feet(m: RampModule) {
  if (m.kind === "quarter") return [m.reverse ? m.z1 : m.z0];
  return [m.z0, m.z1];
}

/**
 * Builds one module's visual. `profile` is the physics height along z,
 * `x0/x1` the surface span (it runs a little past free edges) and `floors`
 * gives, per side, the height the side sheathing starts from: the ground, or
 * a neighbouring module's surface where the two share an edge, so only the
 * part standing above the neighbour is closed.
 * Returns the meshes added to the scene.
 */
export function buildWoodRamp(
  scene: THREE.Scene,
  m: RampModule,
  profile: (z: number) => number,
  span: [number, number],
  floors: [(z: number) => number, (z: number) => number],
) {
  const mat = woodRampMaterials();
  const [x0, x1] = span;
  // Samples along z, denser where the profile bends.
  const zs: number[] = [];
  const steps = Math.ceil((m.z1 - m.z0) / 0.04);
  for (let i = 0; i <= steps; i++) zs.push(m.z0 + ((m.z1 - m.z0) * i) / steps);
  const ys = zs.map((z) => profile(z));
  const arc: number[] = [0];
  for (let i = 1; i < zs.length; i++) arc.push(arc[i - 1] + Math.hypot(zs[i] - zs[i - 1], ys[i] - ys[i - 1]));
  const out: THREE.Mesh[] = [];
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    out.push(mesh);
    return mesh;
  };
  const ribbon = (points: { x: number; y: number; z: number; u: number; v: number }[][]) => {
    const p: number[] = [], uv: number[] = [], index: number[] = [];
    const cols = points[0].length;
    for (const row of points) for (const q of row) { p.push(q.x, q.y, q.z); uv.push(q.u, q.v); }
    for (let r = 0; r < points.length - 1; r++)
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    return g;
  };

  // Riding sheet: sheets laid across the ramp, seams every 4 ft across and 8 ft along.
  const across = [x0, ...Array.from({ length: Math.max(0, Math.ceil((x1 - x0) / SHEET_W) - 1) }, (_, k) => x0 + (k + 1) * SHEET_W).filter((x) => x < x1 - 0.01), x1];
  add(ribbon(zs.map((z, i) => across.map((x) => ({ x, y: ys[i] + SHEET, z, u: (x - m.x0) / SHEET_W, v: arc[i] / SHEET_L })))), mat.riding, `Wood ramp ${m.id} riding sheet`);

  // Steel kick plates at the foot of every transition (both faces of a spine).
  for (const foot of feet(m)) {
    const dir = foot === m.z0 ? 1 : -1;
    const start = foot === m.z0 ? 0 : zs.length - 1;
    const rows: { x: number; y: number; z: number; u: number; v: number }[][] = [];
    // A bevelled leading edge flush with the ground, then the plate up the transition.
    rows.push([x0, x1].map((x) => ({ x, y: 0.002, z: foot - dir * 0.03, u: x / 1.2, v: 0 })));
    for (let i = start; i >= 0 && i < zs.length; i += dir) {
      const along = Math.abs(arc[i] - arc[start]);
      rows.push([x0, x1].map((x) => ({ x, y: ys[i] + SHEET + 0.004, z: zs[i], u: x / 1.2, v: (along + 0.03) / 1.2 })));
      if (along > PLATE) break;
    }
    const plate = ribbon(rows);
    if (dir < 0) flip(plate);
    add(plate, mat.steel, `Wood ramp ${m.id} kick plate`);
  }

  // Sides: plywood sheathing from the ground to the sheet, capped with a 2x6 fascia.
  for (const [k, x] of [[0, x0], [1, x1]] as const) {
    const s = k === 0 ? -1 : 1, floor = zs.map((z, i) => Math.min(ys[i] + SHEET, floors[k](z)));
    if (floor.every((f, i) => f >= ys[i] + SHEET - 0.005)) continue;
    const sheath = ribbon(zs.map((z, i) => [
      { x, y: floor[i], z, u: (z - m.z0) / SHEET_L, v: floor[i] / SHEET_W },
      { x, y: ys[i] + SHEET, z, u: (z - m.z0) / SHEET_L, v: (ys[i] + SHEET) / SHEET_W },
    ]));
    if (s > 0) flip(sheath);
    add(sheath, mat.side, `Wood ramp ${m.id} side`);
    // Fascia: a 140 mm board following the top edge, standing 19 mm proud.
    const fx = x + s * 0.019;
    const top = zs.map((z, i) => ys[i] + SHEET);
    const fascia = ribbon(zs.map((z, i) => [
      { x: fx, y: Math.max(floor[i], top[i] - 0.14), z, u: arc[i] / 1.5, v: 0 },
      { x: fx, y: top[i] + 0.004, z, u: arc[i] / 1.5, v: 0.14 },
    ]));
    if (s > 0) flip(fascia);
    add(fascia, mat.trim, `Wood ramp ${m.id} fascia`);
    // The fascia's top and outer edge thickness, so it reads as a board.
    const lip = ribbon(zs.map((z, i) => [
      { x, y: top[i] + 0.004, z, u: arc[i] / 1.5, v: 0 },
      { x: fx, y: top[i] + 0.004, z, u: arc[i] / 1.5, v: 0.02 },
    ]));
    if (s < 0) flip(lip);
    add(lip, mat.trim, `Wood ramp ${m.id} fascia edge`);
    // Vertical 2x4 battens where the side meets the ground at each sheet seam.
    for (let z = m.z0 + SHEET_L; z < m.z1 - 0.2; z += SHEET_L) {
      const low = floors[k](z), hgt = profile(z) + SHEET - 0.14 - low;
      if (hgt < 0.25) continue;
      const batten = new THREE.Mesh(new THREE.BoxGeometry(0.02, hgt, 0.09), mat.trim);
      batten.position.set(x + s * 0.01, low + hgt / 2, z);
      batten.castShadow = true;
      batten.name = `Wood ramp ${m.id} batten`;
      scene.add(batten);
      out.push(batten);
    }
  }

  // A quarter's back wall, from the ground to the deck.
  if (m.kind === "quarter") {
    const z = m.reverse ? m.z0 : m.z1, top = m.h + SHEET;
    const wall = ribbon([
      [{ x: x0, y: 0, z, u: 0, v: 0 }, { x: x1, y: 0, z, u: (x1 - x0) / SHEET_L, v: 0 }],
      [{ x: x0, y: top, z, u: 0, v: top / SHEET_W }, { x: x1, y: top, z, u: (x1 - x0) / SHEET_L, v: top / SHEET_W }],
    ]);
    if (!m.reverse) flip(wall);
    add(wall, mat.side, `Wood ramp ${m.id} back wall`);
  }
  return out;
}
