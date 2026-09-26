// Boulder City plants and rocks, generated: creosote and white bursage for the
// open desert, Aleppo pines for the park, Washingtonia fan palms and Mojave
// yucca for yards, bunch grass, and varnished volcanic boulders. Each model is
// a few merged parts drawn with InstancedMesh, so a whole desert of bushes
// costs a handful of draw calls. Foliage sways a little in the wind.
import * as THREE from "three";
import { enableInstanceLod } from "../render/instance-lod";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry, Noise2 } from "./noise";
import { barkTexture, leafCard, rockTexture } from "./textures";

export interface PlantPart { geometry: THREE.BufferGeometry; material: THREE.Material; shadow: boolean }
export interface PlantModel { parts: PlantPart[]; height: number; radius: number; /** Spots on top of branches a bird can sit on (model space). */ perches?: V[] }

type V = THREE.Vector3;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---- Wind -------------------------------------------------------------------
const wind = { value: 0 };
/** How hard the wind blows the plants (1 a light breeze); weather.ts follows the real wind with it (#74). */
const windStrength = { value: 1 };
export function setWindStrength(value: number) { windStrength.value = value; }
let windClock = -1;
function tickWind() {
  const now = performance.now() / 1000;
  if (windClock !== now) { windClock = now; wind.value = now; }
}
/** Adds a sway that grows with height above the plant's base. */
function sway(material: THREE.MeshStandardMaterial, strength: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.uniforms.uWindStrength = windStrength;
    shader.vertexShader = "uniform float uWind;\nuniform float uWindStrength;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 root = instanceMatrix[3].xyz;
      #else
        vec3 root = vec3(0.0);
      #endif
      float bend = max(transformed.y, 0.0) * ${strength.toFixed(4)} * uWindStrength;
      float phase = uWind * 1.7 + root.x * 0.37 + root.z * 0.29;
      transformed.x += (sin(phase) + 0.35 * sin(phase * 2.3 + transformed.y)) * bend;
      transformed.z += (cos(phase * 0.8) * 0.6) * bend;`);
  };
  material.customProgramCacheKey = () => "sway2" + strength;
}

// ---- Geometry helpers -------------------------------------------------------
/** A tapered tube along a polyline: stems, trunks, branches, petioles. */
function tube(points: V[], radii: number[], sides: number, vScale = 1) {
  const p: number[] = [], n: number[] = [], uv: number[] = [], idx: number[] = [];
  let along = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dir = b.clone().sub(a).normalize();
    const side = Math.abs(dir.y) < 0.95 ? v3(0, 1, 0).cross(dir).normalize() : v3(1, 0, 0);
    const up = dir.clone().cross(side).normalize();
    if (i > 0) along += points[i].distanceTo(points[i - 1]);
    for (let s = 0; s <= sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      const normal = side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
      const q = points[i].clone().addScaledVector(normal, radii[i]);
      p.push(q.x, q.y, q.z); n.push(normal.x, normal.y, normal.z); uv.push(s / sides, along * vScale);
    }
  }
  for (let i = 0; i < points.length - 1; i++)
    for (let s = 0; s < sides; s++) {
      const a = i * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/**
 * A foliage card: a quad through `at`, facing `facing`, bent slightly so it is
 * not a flat plate. Normals lean away from `center` so a crown shades as a soft
 * volume instead of a pile of flat quads.
 */
function card(at: V, facing: V, up: V, w: number, h: number, center: V, roundness = 0.75, pivotBottom = false) {
  const f = facing.clone().normalize(), right = up.clone().cross(f).normalize(), top = f.clone().cross(right).normalize();
  const corners = pivotBottom
    ? [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]]
    : [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
  const p: number[] = [], n: number[] = [], uv: number[] = [];
  for (const [cx, cy] of corners) {
    const q = at.clone().addScaledVector(right, cx * w).addScaledVector(top, cy * h).addScaledVector(f, -Math.abs(cx) * w * 0.18);
    p.push(q.x, q.y, q.z);
    const outward = q.clone().sub(center).normalize();
    const normal = f.clone().lerp(outward, roundness).normalize();
    n.push(normal.x, normal.y, normal.z);
    uv.push(cx + 0.5, pivotBottom ? cy : cy + 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
}
function merged(list: THREE.BufferGeometry[]) {
  const g = mergeGeometries(list)!;
  list.forEach((x) => x.dispose());
  g.computeBoundingSphere();
  return g;
}

// ---- Shared materials -------------------------------------------------------
const materials = new Map<string, THREE.Material>();
function foliageMaterial(kind: Parameters<typeof leafCard>[0], tint: number, strength: number) {
  const key = "foliage-" + kind;
  let m = materials.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: leafCard(kind), color: tint, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, name: `${kind} foliage` });
    sway(m, strength);
    materials.set(key, m);
  }
  return m;
}
function barkMaterial(kind: "pine" | "palm" | "twig", tint = 0xffffff) {
  const key = "bark-" + kind;
  let m = materials.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ map: barkTexture(kind), color: tint, roughness: 0.95, name: `${kind} bark` }); materials.set(key, m); }
  return m;
}
function twigMaterial(tint: number, strength: number) {
  const key = "twig-" + tint;
  let m = materials.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) { m = new THREE.MeshStandardMaterial({ map: barkTexture("twig"), color: tint, roughness: 0.95, name: "twigs" }); sway(m, strength); materials.set(key, m); }
  return m;
}

// ---- Plants -----------------------------------------------------------------
/**
 * Creosote bush: an open vase of many thin grey stems rising from the base,
 * leafy only toward the tips, wider than it is tall.
 */
export function creosote(seed: number): PlantModel {
  const random = mulberry(seed * 7 + 1), stems: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [];
  const height = 1.1 + random() * 0.9, center = v3(0, height * 0.55, 0);
  const count = 11 + Math.floor(random() * 5);
  for (let k = 0; k < count; k++) {
    const angle = (k / count) * Math.PI * 2 + random() * 0.6, spread = 0.7 + random() * 0.8;
    const pts: V[] = [], r: number[] = [];
    let at = v3(Math.cos(angle) * 0.12 + (random() - 0.5) * 0.2, 0, Math.sin(angle) * 0.12 + (random() - 0.5) * 0.2);
    for (let s = 0; s <= 3; s++) {
      pts.push(at.clone()); r.push(0.017 * (1 - s / 4.2));
      const lean = spread * (0.8 + s * 0.15);
      at = at.clone().add(v3(Math.cos(angle) * lean * 0.5 * height / 3, height / 3 * (0.95 - s * 0.1), Math.sin(angle) * lean * 0.5 * height / 3));
    }
    stems.push(tube(pts, r, 3, 2));
    for (let c = 0; c < 6; c++) {
      const t = 0.35 + random() * 0.65, i = Math.min(2, Math.floor(t * 3)), f = t * 3 - i;
      const pos = pts[i].clone().lerp(pts[i + 1], f).add(v3((random() - 0.5) * 0.25, (random() - 0.2) * 0.2, (random() - 0.5) * 0.25));
      const facing = v3(Math.cos(angle + (random() - 0.5) * 2), (random() - 0.3) * 0.8, Math.sin(angle + (random() - 0.5) * 2));
      leaves.push(card(pos, facing, v3(0, 1, 0), 0.55 + random() * 0.3, 0.55 + random() * 0.35, center));
    }
  }
  return {
    height, radius: height * 0.55,
    parts: [
      { geometry: merged(stems), material: twigMaterial(0xb3aa9e, 0.012), shadow: false },
      { geometry: merged(leaves), material: foliageMaterial("creosote", 0xffffff, 0.02), shadow: true },
    ],
  };
}

/** White bursage: a low grey-green dome, dense and twiggy. */
export function bursage(seed: number): PlantModel {
  const random = mulberry(seed * 13 + 3), leaves: THREE.BufferGeometry[] = [];
  const height = 0.45 + random() * 0.35, radius = height * (0.9 + random() * 0.4), center = v3(0, height * 0.3, 0);
  for (let k = 0; k < 14; k++) {
    const a = random() * Math.PI * 2, e = random() * 1.2;
    const dir = v3(Math.cos(a) * Math.cos(e), Math.sin(e) * 0.8 + 0.2, Math.sin(a) * Math.cos(e));
    const pos = dir.clone().multiply(v3(radius * 0.55, height * 0.7, radius * 0.55)).add(v3(0, height * 0.25, 0));
    leaves.push(card(pos, dir, v3(0, 1, 0), 0.5 * radius + 0.2, 0.45 * height + 0.2, center, 0.85));
  }
  return { height, radius, parts: [{ geometry: merged(leaves), material: foliageMaterial("bursage", 0xffffff, 0.015), shadow: true }] };
}

/**
 * Aleppo pine: a leaning, slightly crooked trunk, a few long upswept limbs
 * and an open, irregular crown of needle tufts. The park's shade trees.
 */
export function aleppoPine(seed: number): PlantModel {
  const random = mulberry(seed * 31 + 9), wood: THREE.BufferGeometry[] = [], tufts: THREE.BufferGeometry[] = [], perches: V[] = [];
  const height = 11 + random() * 5;
  // A leaning trunk that forks into a few leaders partway up, the open,
  // irregular shape Aleppo pines grow into in a dry park.
  const lean = v3((random() - 0.5) * 0.4, 1, (random() - 0.5) * 0.4).normalize();
  const fork = height * (0.38 + random() * 0.12);
  const trunk: V[] = [], tr: number[] = [];
  for (let s = 0; s <= 4; s++) {
    const t = s / 4;
    trunk.push(lean.clone().multiplyScalar(fork * t).add(v3(Math.sin(t * 3 + seed) * 0.18, 0, Math.cos(t * 2.5 + seed) * 0.15)));
    tr.push(0.36 * (1 - t * 0.35) + (s === 0 ? 0.1 : 0));
  }
  wood.push(tube(trunk, tr, 8, 0.5));
  const top = trunk[4];
  let highest = 0;
  // A puff of needles at a branch tip: cards around a small ball, facing out.
  const clump = (at: V, r: number) => {
    const n = 7 + Math.floor(random() * 3);
    for (let c = 0; c < n; c++) {
      const dir = v3(random() - 0.5, random() * 0.9 - 0.2, random() - 0.5).normalize();
      const q = at.clone().addScaledVector(dir, r * (0.3 + random() * 0.5));
      tufts.push(card(q, dir.clone().add(v3(0, 0.5, 0)), v3(0, 1, 0), r * (1.5 + random() * 0.5), r * (1.2 + random() * 0.4), at, 0.92));
    }
    highest = Math.max(highest, at.y + r);
  };
  const leaders = 2 + Math.floor(random() * 3);
  for (let l = 0; l < leaders; l++) {
    const angle = (l / leaders) * Math.PI * 2 + random() * 0.9;
    const dir = v3(Math.cos(angle) * 0.55, 1, Math.sin(angle) * 0.55).normalize();
    const len = (height - fork) * (0.85 + random() * 0.25);
    const pts = [top.clone(), top.clone().addScaledVector(dir, len * 0.5).add(v3(Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4)), top.clone().addScaledVector(dir, len)];
    const r0 = tr[4] * (leaders > 2 ? 0.62 : 0.75);
    wood.push(tube(pts, [r0, r0 * 0.6, 0.05], 6, 0.5));
    clump(pts[2].clone().add(v3(0, 0.3, 0)), 1.3 + random() * 0.4);
    // Side branches along each leader, spreading outward then up at the tip.
    const sides = 4 + Math.floor(random() * 3);
    for (let s = 0; s < sides; s++) {
      const t = 0.15 + (s / sides) * 0.75 + random() * 0.08;
      const base = t < 0.5 ? pts[0].clone().lerp(pts[1], t * 2) : pts[1].clone().lerp(pts[2], t * 2 - 1);
      const a = angle + (random() - 0.5) * 2.6;
      const out = v3(Math.cos(a), 0.25 + random() * 0.45, Math.sin(a)).normalize();
      const reach = height * (0.2 + random() * 0.12) * (1.15 - t * 0.6);
      const mid = base.clone().addScaledVector(out, reach * 0.55), tip = base.clone().addScaledVector(out, reach).add(v3(0, reach * 0.18, 0));
      wood.push(tube([base, mid, tip], [r0 * 0.4, r0 * 0.22, 0.03], 4, 0.5));
      // On top of a lower branch a little way out from the leader, under the needles where it shows from the ground.
      if (t < 0.55) perches.push(base.clone().lerp(mid, 0.32).add(v3(0, r0 * 0.34, 0)));
      clump(tip, 0.9 + random() * 0.5);
      // Most branches carry a second puff partway along.
      if (random() < 0.85) clump(mid.clone().add(v3(0, 0.25, 0)), 0.75 + random() * 0.35);
    }
  }
  return {
    height: Math.max(height, highest), radius: height * 0.35, perches,
    parts: [
      { geometry: merged(wood), material: barkMaterial("pine"), shadow: true },
      { geometry: merged(tufts), material: foliageMaterial("pine", 0xd4dcae, 0.006), shadow: true },
    ],
  };
}

/**
 * Washingtonia fan palm: a tall slender ringed trunk, a brown skirt of dead
 * fronds, and a crown of fan leaves on long stalks, the lower ones drooping.
 */
export function fanPalm(seed: number): PlantModel {
  const random = mulberry(seed * 17 + 5);
  const height = 10 + random() * 8;
  const bend = v3((random() - 0.5) * 0.6, 0, (random() - 0.5) * 0.6);
  const trunk: V[] = [], tr: number[] = [];
  for (let s = 0; s <= 8; s++) {
    const t = s / 8;
    trunk.push(v3(bend.x * t * t * height * 0.1, height * t, bend.z * t * t * height * 0.1));
    tr.push(0.3 - t * 0.1 + (s === 0 ? 0.12 : 0));
  }
  const top = trunk[8], crown = top.clone().add(v3(0, 0.6, 0));
  const skirt: THREE.BufferGeometry[] = [], fronds: THREE.BufferGeometry[] = [], stalks: THREE.BufferGeometry[] = [];
  // Dead frond skirt: brown fans hanging down around the upper trunk.
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2 + random() * 0.3, out = v3(Math.cos(a), 0, Math.sin(a));
    const at = top.clone().add(v3(0, 0.2 - random() * 1.6, 0)).addScaledVector(out, 0.28);
    skirt.push(card(at, out.clone().add(v3(0, 0.2, 0)), v3(0, -1, 0).addScaledVector(out, 0.18), 1.5, 2.4, top, 0.5, true));
  }
  // Living fronds: a round head of fans on long stalks, young ones pointing
  // up out of the middle, mature ones level, old ones drooping over the skirt.
  const leaves = 30 + Math.floor(random() * 8);
  for (let k = 0; k < leaves; k++) {
    const a = k * 2.39996 + random() * 0.3, age = k / leaves;
    const elevation = THREE.MathUtils.lerp(1.2, -0.75, age) + (random() - 0.5) * 0.3;
    const flat = v3(Math.cos(a), 0, Math.sin(a));
    const out = flat.clone().multiplyScalar(Math.cos(elevation)).add(v3(0, Math.sin(elevation), 0));
    // The fan's face is square to its stalk, twisted a little at random.
    const face = flat.clone().multiplyScalar(-Math.sin(elevation)).add(v3(0, Math.cos(elevation), 0)).applyAxisAngle(out, (random() - 0.5) * 0.9);
    const reach = 1.1 + random() * 0.6;
    const bendDown = age > 0.55 ? (age - 0.55) * 0.8 : 0;
    const mid = crown.clone().addScaledVector(out, reach * 0.5), stalkEnd = crown.clone().addScaledVector(out, reach).add(v3(0, -bendDown, 0));
    stalks.push(tube([crown.clone(), mid, stalkEnd], [0.05, 0.035, 0.025], 3));
    const along = stalkEnd.clone().sub(mid).normalize();
    const size = 1.9 + random() * 0.6;
    fronds.push(card(stalkEnd.clone().addScaledVector(along, -0.15), face, along, size * 1.05, size, crown, 0.82, true));
  }
  return {
    height, radius: 3,
    parts: [
      { geometry: tube(trunk, tr, 8, 0.35), material: barkMaterial("palm"), shadow: true },
      { geometry: merged(skirt), material: foliageMaterial("palmDead", 0xffffff, 0.004), shadow: true },
      { geometry: merged(stalks), material: twigMaterial(0x8a8a60, 0.006), shadow: false },
      { geometry: merged(fronds), material: foliageMaterial("palm", 0xc9d2b4, 0.008), shadow: true },
    ],
  };
}

/** Mojave yucca: one to three short shaggy trunks, each ending in a rosette of stiff blades. */
export function yucca(seed: number): PlantModel {
  const random = mulberry(seed * 23 + 11), trunks: THREE.BufferGeometry[] = [], blades: THREE.BufferGeometry[] = [];
  const heads = 1 + Math.floor(random() * 3);
  let height = 0;
  for (let k = 0; k < heads; k++) {
    const h = 0.8 + random() * 1.6, a = random() * Math.PI * 2, off = k ? 0.35 : 0;
    const tip = v3(Math.cos(a) * off + (random() - 0.5) * 0.3, h, Math.sin(a) * off + (random() - 0.5) * 0.3);
    trunks.push(tube([v3(0, 0, 0), tip.clone().multiplyScalar(0.5).add(v3(0, 0.05, 0)), tip], [0.14, 0.12, 0.11], 5));
    for (let c = 0; c < 5; c++) {
      const ang = (c / 5) * Math.PI;
      blades.push(card(tip.clone().add(v3(0, -0.15, 0)), v3(Math.cos(ang), 0, Math.sin(ang)), v3(0, 1, 0), 1.2, 1.1, tip, 0.3, true));
    }
    height = Math.max(height, h + 0.9);
  }
  return {
    height, radius: 0.9,
    parts: [
      { geometry: merged(trunks), material: barkMaterial("palm", 0x8a7560), shadow: true },
      { geometry: merged(blades), material: foliageMaterial("yucca", 0xffffff, 0.01), shadow: true },
    ],
  };
}

/** Bunch grass: three crossed straw-coloured cards. */
export function grassTuft(seed: number): PlantModel {
  const random = mulberry(seed * 5 + 2), cards: THREE.BufferGeometry[] = [];
  const h = 0.35 + random() * 0.35;
  for (let c = 0; c < 3; c++) {
    const a = (c / 3) * Math.PI + random() * 0.4;
    cards.push(card(v3(0, 0, 0), v3(Math.cos(a), 0, Math.sin(a)), v3(0, 1, 0), h * 1.3, h, v3(0, -0.5, 0), 0.6, true));
  }
  return { height: h, radius: h * 0.6, parts: [{ geometry: merged(cards), material: foliageMaterial("grass", 0xffffff, 0.06), shadow: false }] };
}

/** Desert boulder: fractured volcanic rock with a dark varnished top, sat into the ground. */
export function boulder(seed: number): PlantModel {
  const noise = new Noise2(seed * 3 + 1), random = mulberry(seed);
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.getAttribute("position"), colors: number[] = [];
  const sx = 0.9 + random() * 0.6, sy = 0.5 + random() * 0.4, sz = 0.8 + random() * 0.5;
  const top = new THREE.Color(0x6e5646), mid = new THREE.Color(0xa7896c), low = new THREE.Color(0xc9b294);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // Faceted fracture planes plus a little lumpiness.
    let r = 1 + noise.fbm(x * 1.3, z * 1.3 + y, 3) * 0.22;
    r *= 1 - 0.12 * Math.max(0, Math.abs(noise.simplex(x * 2.2 + y, z * 2.2)) - 0.3);
    const yy = Math.max(-0.25, y * r) * sy;
    p.setXYZ(i, x * r * sx, yy, z * r * sz);
    const c = low.clone().lerp(mid, THREE.MathUtils.smoothstep(y, -0.3, 0.3)).lerp(top, THREE.MathUtils.smoothstep(y, 0.2, 0.95) * 0.85);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  let m = materials.get("boulder");
  if (!m) { m = new THREE.MeshStandardMaterial({ map: rockTexture(), vertexColors: true, roughness: 0.9, name: "desert boulder" }); materials.set("boulder", m); }
  return { height: sy, radius: Math.max(sx, sz), parts: [{ geometry: g, material: m, shadow: true }] };
}

// ---- Placement --------------------------------------------------------------
export interface Placement { x: number; y: number; z: number; scale: number; yaw: number }

/**
 * Plants `model` at every placement as instanced meshes (one per part). With
 * `thin`, lower render qualities draw only a leading fraction of them
 * (`userData.scatterCount`); the placements are shuffled so that is an even
 * thinning. Never thin anything with collision.
 */
export function plant(scene: THREE.Scene, model: PlantModel, placements: Placement[], name: string, thin = false) {
  const random = mulberry(placements.length * 7 + name.length);
  const list = placements.slice();
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = v3(0, 1, 0);
  const meshes: THREE.InstancedMesh[] = [], maxScale = list.reduce((m, pl) => Math.max(m, pl.scale), 0.5);
  for (const part of model.parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, list.length));
    list.forEach((pl, i) => {
      q.setFromAxisAngle(up, pl.yaw);
      matrix.compose(v3(pl.x, pl.y, pl.z), q, v3(pl.scale, pl.scale, pl.scale));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.count = list.length;
    if (thin) mesh.userData.scatterCount = list.length;
    mesh.castShadow = part.shadow;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.onBeforeRender = tickWind;
    scene.add(mesh);
    // Drawn only near the viewer (#98): taller plants carry further.
    enableInstanceLod(scene, mesh, THREE.MathUtils.clamp(140 + 50 * model.height * maxScale, 160, 520));
    meshes.push(mesh);
  }
  return meshes;
}
