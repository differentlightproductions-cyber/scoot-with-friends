import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FACE_SPAN, faceLayout } from './face';
import { LIMB_RADII, RIG, type BodyShape } from './rig';
import type { AvatarConfig } from './config';

/**
 * Geometry for every avatar part (docs/AVATAR-DESIGN.md §6-8). Heads, hair and
 * headwear share one head-surface function so hair, hats and the painted face
 * always fit the chosen head shape. Head space: metres from the head centre,
 * +z the face, +y up. Limb space: +y along the bone from its root joint.
 */
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

type Detail = 'high' | 'low';
const seg = (detail: Detail, high: number, low: number) => (detail === 'high' ? high : low);

// ---- Head surface -----------------------------------------------------------

const HEAD_SHAPES: Record<string, { w: number; h: number; d: number; jaw: number; top: number; square: number; chin: number }> = {
  round: { w: 0.365, h: 0.39, d: 0.365, jaw: 0.02, top: 0, square: 2, chin: 0 },
  oval: { w: 0.345, h: 0.415, d: 0.365, jaw: -0.05, top: 0.02, square: 2, chin: 0.02 },
  narrow: { w: 0.322, h: 0.408, d: 0.354, jaw: -0.03, top: 0, square: 2.1, chin: 0.01 },
  wide: { w: 0.405, h: 0.376, d: 0.37, jaw: 0.05, top: -0.02, square: 2.1, chin: -0.01 },
  square: { w: 0.37, h: 0.39, d: 0.365, jaw: 0.07, top: -0.01, square: 3.4, chin: -0.03 },
  'soft-jaw': { w: 0.365, h: 0.395, d: 0.365, jaw: 0.13, top: -0.02, square: 2.4, chin: -0.02 },
};

/** A point on the head for a unit direction. */
export function headSurface(shape: string, dir: THREE.Vector3, out = V()) {
  const h = HEAD_SHAPES[shape] ?? HEAD_SHAPES.round;
  const horizontal = Math.hypot(dir.x, dir.z);
  // Superellipse in plan view: 2 is round, higher is squarer.
  let k = 1;
  if (horizontal > 1e-5 && h.square !== 2) {
    const nx = Math.abs(dir.x) / horizontal, nz = Math.abs(dir.z) / horizontal;
    k = Math.pow(Math.pow(nx, h.square) + Math.pow(nz, h.square), -1 / h.square);
  }
  const below = Math.max(0, -dir.y), above = Math.max(0, dir.y);
  // Cheeks and jaw fill out in the lower half; the chin flattens a little.
  const jaw = 1 + h.jaw * Math.sin(Math.PI * Math.min(1, below * 1.25)) - 0.05 * below * below;
  const crown = 1 + h.top * above;
  out.set(dir.x * k * (h.w / 2) * jaw * crown, dir.y * (h.h / 2) * (1 - h.chin * below * below), dir.z * k * (h.d / 2) * (1 + 0.5 * (jaw - 1)));
  return out;
}

const fromAngles = (azimuth: number, elevation: number) => V(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));

/** The head: a deformed sphere, smooth-shaded. */
export function headGeometry(shape: string, detail: Detail) {
  const g = new THREE.SphereGeometry(1, seg(detail, 56, 28), seg(detail, 42, 20));
  const p = g.getAttribute('position'), d = V(), q = V();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    headSurface(shape, d, q);
    p.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}

/** The face decal: the front of the head, 1.5 mm proud, with planar UVs for the painted canvas. */
export function faceGeometry(shape: string, detail: Detail) {
  const g = new THREE.SphereGeometry(1, seg(detail, 40, 22), seg(detail, 36, 18), Math.PI / 2 - 1.35, 2.7, 0.5, Math.PI - 0.72);
  const p = g.getAttribute('position'), uv = g.getAttribute('uv'), d = V(), q = V();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    headSurface(shape, d, q);
    q.addScaledVector(d, 0.0015);
    p.setXYZ(i, q.x, q.y, q.z);
    uv.setXY(i, 0.5 + q.x / FACE_SPAN, 0.5 + q.y / FACE_SPAN);
  }
  g.computeVertexNormals();
  return g;
}

/** A point on the head's surface in front of a face feature (for glasses and the nose). */
function facePoint(shape: string, x: number, y: number) {
  // March along +z from inside to the surface.
  const h = HEAD_SHAPES[shape] ?? HEAD_SHAPES.round;
  const dir = V(x, y, Math.sqrt(Math.max(0.0001, (h.d / 2) ** 2 - x * x - y * y))).normalize();
  for (let i = 0; i < 6; i++) {
    const s = headSurface(shape, dir);
    dir.set(x, y, Math.max(0.01, s.z)).normalize();
  }
  return headSurface(shape, dir);
}

// ---- Shells over the head (hair caps, helmets, hats) ------------------------

type Line = { front: number; side: number; back: number };
/** Elevation (radians) of an edge line at an azimuth: front at 0, side at +-pi/2, back at pi. */
function lineAt(line: Line, azimuth: number) {
  const t = Math.min(1, Math.abs(Math.atan2(Math.sin(azimuth), Math.cos(azimuth))) / Math.PI);
  return t < 0.5 ? THREE.MathUtils.lerp(line.front, line.side, smooth(0, 1, t / 0.5)) : THREE.MathUtils.lerp(line.side, line.back, smooth(0, 1, (t - 0.5) / 0.5));
}

/**
 * A shell that follows the head at `thickness(azimuth, elevation)` above the
 * edge line and tucks just inside the head below it, so the edge reads as a
 * clean, rounded hairline or rim.
 */
function shell(shape: string, edge: Line | ((a: number) => number), thickness: (a: number, e: number) => number, detail: Detail, band = 0.05, hang?: (a: number, e: number) => number) {
  const g = new THREE.SphereGeometry(1, seg(detail, 64, 30), seg(detail, 48, 22));
  const p = g.getAttribute('position'), d = V(), q = V(), edgeAt = typeof edge === 'function' ? edge : (a: number) => lineAt(edge, a);
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const a = Math.atan2(d.x, d.z), e = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    let k = smooth(edgeAt(a) - band, edgeAt(a) + band, e);
    // Hair that hangs is cut off at a hem well below the head.
    if (hang) k *= smooth(-1.2, -1.05, e);
    headSurface(shape, d, q).addScaledVector(d, THREE.MathUtils.lerp(-0.01, thickness(a, e), k));
    if (hang && k > 0) {
      const drop = hang(a, e) * k;
      q.y -= drop;
      // Falls a little narrower toward the neck, then eases out at the tips.
      const r = Math.hypot(q.x, q.z), scale = 1 - 0.1 * smooth(0, 0.12, drop) + 0.05 * smooth(0.12, 0.3, drop);
      if (r > 1e-5) { q.x *= scale; q.z *= scale; }
    }
    p.setXYZ(i, q.x, q.y, q.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Evenly spread directions over the upper head (Fibonacci sphere). */
function spread(count: number, minElevation: number) {
  const out: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0, n = count * 3; i < n && out.length < count; i++) {
    const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), d = V(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r);
    if (Math.asin(y) > minElevation) out.push(d);
  }
  return out;
}

/** Rim line of each headwear, shared with the hair so hair tucks underneath. */
export const HEADWEAR_RIM: Record<string, Line> = {
  helmet: { front: 0.56, side: 0.1, back: -0.32 },
  beanie: { front: 0.48, side: 0.08, back: -0.34 },
  cap: { front: 0.5, side: 0.24, back: 0.02 },
};

// ---- Hair -------------------------------------------------------------------

type HairSpec = { edge: Line | ((a: number) => number); thickness: (a: number, e: number) => number; hang?: (a: number, e: number) => number };
/** A hairline that frames the face and falls behind it: `front` over the forehead, open below `face` radians either side. */
const framing = (front: number, face: number) => (a: number) => THREE.MathUtils.lerp(front, -1.4, smooth(face - 0.18, face + 0.1, Math.abs(Math.atan2(Math.sin(a), Math.cos(a)))));
/** Length hanging below the head behind the face, longest at the back. */
const hangs = (length: number, face: number, back = 0.15) => (a: number, e: number) => {
  const behind = smooth(face - 0.1, face + 0.3, Math.abs(Math.atan2(Math.sin(a), Math.cos(a))));
  const t = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) / Math.PI;
  return length * behind * (1 - back + back * t) * smooth(0.3, -0.75, e) + 0.008 * Math.sin(a * 19) * smooth(0, -0.9, e);
};
const lumps = (a: number, e: number, amount: number, f = 7) => amount * (0.5 + 0.5 * Math.sin(a * f + e * 5.3) * Math.sin(e * (f + 2) + a * 2.1));
const HAIR: Record<string, HairSpec> = {
  'short-messy': { edge: { front: 0.5, side: 0.22, back: -0.5 }, thickness: (a, e) => 0.016 + lumps(a, e, 0.012) },
  buzz: { edge: { front: 0.56, side: 0.26, back: -0.52 }, thickness: () => 0.005 },
  'side-part': { edge: { front: 0.52, side: 0.2, back: -0.5 }, thickness: (a, e) => 0.02 + 0.006 * Math.sin(e * 3) },
  fluffy: { edge: { front: 0.42, side: 0.12, back: -0.52 }, thickness: (a, e) => 0.036 + lumps(a, e, 0.02, 9) },
  shag: { edge: framing(0.36, 1.25), thickness: (a, e) => 0.028 + lumps(a, e, 0.016, 11), hang: hangs(0.1, 1.25) },
  'long-straight': { edge: framing(0.5, 1.2), thickness: (a, e) => 0.02 + 0.01 * smooth(0, -0.8, e), hang: hangs(0.34, 1.2) },
  ponytail: { edge: { front: 0.52, side: 0.18, back: -0.42 }, thickness: () => 0.013 },
  bun: { edge: { front: 0.52, side: 0.18, back: -0.42 }, thickness: () => 0.013 },
  curly: { edge: { front: 0.46, side: 0.1, back: -0.55 }, thickness: () => 0.03 },
  afro: { edge: { front: 0.44, side: -0.05, back: -0.55 }, thickness: (a, e) => 0.055 + 0.035 * Math.max(0, Math.sin(e)) + lumps(a, e, 0.012, 13) },
  swept: { edge: { front: 0.5, side: 0.2, back: -0.5 }, thickness: (a, e) => 0.022 + 0.01 * Math.max(0, Math.sin(e)) },
  spiky: { edge: { front: 0.52, side: 0.22, back: -0.48 }, thickness: () => 0.014 },
  undercut: { edge: { front: 0.5, side: 0.22, back: -0.5 }, thickness: (a, e) => THREE.MathUtils.lerp(0.004, 0.036, smooth(0.62, 0.78, e)) },
  shoulder: { edge: framing(0.42, 1.2), thickness: (a, e) => 0.022 + 0.012 * smooth(0, -0.8, e), hang: hangs(0.16, 1.2, 0.05) },
};

function ellipsoid(radius: V3, detail: Detail) {
  const g = new THREE.SphereGeometry(1, seg(detail, 18, 10), seg(detail, 12, 8));
  g.scale(radius.x, radius.y, radius.z);
  return g;
}
type V3 = THREE.Vector3;

/** Places a piece on the head surface, its +y along the surface normal (tilted by `lean` toward the back). */
function onHead(mesh: THREE.Object3D, shape: string, dir: THREE.Vector3, lift: number, lean = 0) {
  const d = dir.clone().normalize();
  mesh.position.copy(headSurface(shape, d)).addScaledVector(d, lift);
  const up = d.clone().lerp(V(0, 0.2, -1), lean).normalize();
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), up);
  return mesh;
}

/**
 * All hair pieces for a style, in head space. Under headwear the cap stays
 * below the headwear's shell and pieces on top of the head are left out.
 */
export function buildHair(c: AvatarConfig, material: THREE.Material, detail: Detail) {
  const group = new THREE.Group();
  group.name = 'Hair';
  const spec = HAIR[c.hairStyle] ?? HAIR['short-messy'], shape = c.headShape;
  const rim = HEADWEAR_RIM[c.headwear];
  const covered = (d: THREE.Vector3) => !!rim && Math.asin(d.y) > lineAt(rim, Math.atan2(d.x, d.z)) - 0.12;
  const thickness = rim ? (a: number, e: number) => (e > lineAt(rim, a) - 0.05 ? Math.min(0.006, spec.thickness(a, e)) : spec.thickness(a, e)) : spec.thickness;
  const add = (g: THREE.BufferGeometry) => {
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  add(shell(shape, spec.edge, thickness, detail, c.hairStyle === 'buzz' ? 0.03 : 0.06, spec.hang));
  const piece = (dir: THREE.Vector3, radius: V3, lift: number, lean = 0) => {
    if (covered(dir)) return;
    onHead(add(ellipsoid(radius, detail)), shape, dir, lift, lean);
  };
  switch (c.hairStyle) {
    case 'short-messy':
      for (const [a, e] of [[-0.5, 0.75], [0, 0.72], [0.45, 0.78], [-0.25, 1.05], [0.2, 1.1], [-0.9, 0.5], [0.95, 0.52], [0, 1.35], [-0.1, 0.6], [0.3, 0.62]])
        piece(fromAngles(a, e), V(0.04, 0.022, 0.05), 0.012, 0.5);
      break;
    case 'side-part':
      piece(fromAngles(-0.35, 0.72), V(0.085, 0.03, 0.06), 0.012, 0.3);
      piece(fromAngles(0.25, 0.8), V(0.1, 0.028, 0.07), 0.014, 0.6);
      break;
    case 'swept':
      piece(fromAngles(-0.15, 0.66), V(0.12, 0.034, 0.07), 0.02, -0.2);
      piece(fromAngles(0.3, 0.85), V(0.1, 0.03, 0.08), 0.02, 0.4);
      break;
    case 'fluffy':
      for (const d of spread(16, 0.45)) piece(d, V(0.045, 0.03, 0.045), 0.03);
      break;
    case 'curly':
      for (const d of spread(detail === 'high' ? 46 : 24, -0.35)) {
        const a = Math.atan2(d.x, d.z);
        if (Math.asin(d.y) < lineAt(HAIR.curly.edge as Line, a) + 0.08) continue;
        piece(d, V(0.03, 0.026, 0.03), 0.026);
      }
      break;
    case 'spiky':
      for (const d of spread(13, 0.55)) {
        if (covered(d)) continue;
        const spike = add(new THREE.ConeGeometry(0.032, 0.1, seg(detail, 10, 6)));
        spike.geometry.translate(0, 0.04, 0);
        onHead(spike, shape, d, 0.004, 0.35);
      }
      break;
    case 'ponytail': {
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.011, 8, 18), material);
      onHead(tie, shape, fromAngles(Math.PI, 0.18), 0.012, 0);
      tie.rotateX(Math.PI / 2);
      group.add(tie);
      for (const [i, [y, z, r]] of [[0.015, -0.2, 0.046], [-0.06, -0.225, 0.042], [-0.135, -0.235, 0.034], [-0.2, -0.235, 0.022]].entries()) {
        const lock = add(ellipsoid(V(r, r * 1.5, r), detail));
        lock.position.set(0, y, z);
        lock.rotation.x = 0.25 + i * 0.1;
      }
      break;
    }
    case 'bun': {
      const bun = add(ellipsoid(V(0.07, 0.06, 0.07), detail));
      onHead(bun, shape, fromAngles(Math.PI, 0.95), 0.045);
      if (covered(fromAngles(Math.PI, 0.95))) bun.position.add(V(0, -0.1, -0.04));
      break;
    }
    case 'undercut':
      piece(fromAngles(0, 0.78), V(0.1, 0.036, 0.075), 0.03, 0.6);
      break;
  }
  return group;
}

// ---- Headwear and eyewear -----------------------------------------------------

export function buildHeadwear(c: AvatarConfig, material: THREE.Material, trim: THREE.Material, detail: Detail) {
  const group = new THREE.Group();
  group.name = 'Headwear';
  const rim = HEADWEAR_RIM[c.headwear];
  if (!rim) return group;
  const shape = c.headShape, add = (g: THREE.BufferGeometry, m = material) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  // Thicker than any hair cap under it (hair tucks to <= 6 mm under headwear).
  if (c.headwear === 'helmet') {
    add(shell(shape, rim, (a, e) => 0.038 + 0.008 * Math.max(0, Math.sin(e)), detail, 0.035));
    for (const x of [-0.05, 0, 0.05]) {
      const vent = add(new RoundedBoxGeometry(0.022, 0.012, 0.12, 2, 0.005), trim);
      onHead(vent, shape, fromAngles(x * 4, 1.05), 0.046, 0);
      vent.rotateX(-0.25);
    }
    for (const side of [-1, 1]) {
      const top = headSurface(shape, fromAngles(side * Math.PI / 2, 0.08)).add(V(side * 0.02, 0, 0)), chin = headSurface(shape, fromAngles(0, -1.2)).add(V(side * 0.035, -0.012, -0.04));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([top, top.clone().lerp(chin, 0.5).add(V(side * 0.03, 0, 0.01)), chin]), 10, 0.0045, 6), trim);
    }
  }
  if (c.headwear === 'beanie') {
    add(shell(shape, rim, (a, e) => 0.026 + 0.004 * Math.sin(a * 24) * Math.max(0, 1 - e), detail, 0.03));
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU - Math.PI, d = fromAngles(a, lineAt(rim, a) + 0.1);
      ring.push(headSurface(shape, d).addScaledVector(d, 0.03));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 64, 0.022, 10, true));
  }
  if (c.headwear === 'cap') {
    add(shell(shape, rim, () => 0.02, detail, 0.03));
    const brim = new THREE.Shape();
    brim.absarc(0, 0, 0.12, Math.PI * 1.05, Math.PI * 1.95, false);
    brim.quadraticCurveTo(0, -0.03, -0.116, -0.037);
    const g = new THREE.ExtrudeGeometry(brim, { depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 16 });
    g.rotateX(Math.PI / 2);
    const front = headSurface(shape, fromAngles(0, rim.front + 0.03));
    const mesh = add(g);
    mesh.position.set(0, front.y + 0.005, front.z - 0.04);
    mesh.rotation.set(-0.12, Math.PI, 0);
    const button = add(ellipsoid(V(0.014, 0.008, 0.014), detail));
    onHead(button, shape, V(0, 1, 0), 0.02);
  }
  return group;
}

export function buildEyewear(c: AvatarConfig, frameMaterial: THREE.Material, detail: Detail) {
  const group = new THREE.Group();
  group.name = 'Eyewear';
  if (c.eyewear === 'none') return group;
  const L = faceLayout(c), shades = c.eyewear === 'sunglasses';
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x0d1418, roughness: 0.08, metalness: 0.3, clearcoat: 1, transparent: true, opacity: 0.88 });
  const w = 0.036 * L.eyeScale + 0.008, h = 0.028 * L.eyeScale + 0.006;
  for (const side of [-1, 1]) {
    const x = side * L.eyeX, front = facePoint(c.headShape, x, L.eyeY).add(V(0, 0, 0.016));
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, seg(detail, 8, 5), seg(detail, 28, 14)), frameMaterial);
    frame.scale.set(w, h, 0.03);
    frame.position.copy(front);
    frame.rotation.y = side * 0.18;
    group.add(frame);
    if (shades) {
      const glass = new THREE.Mesh(new THREE.CircleGeometry(1, seg(detail, 28, 14)), lens);
      glass.scale.set(w, h, 1);
      glass.position.copy(front).add(V(0, 0, 0.001));
      glass.rotation.y = side * 0.18;
      group.add(glass);
    }
    // Temple arm back to the ear.
    const ear = headSurface(c.headShape, fromAngles(side * Math.PI * 0.5, 0.05)).add(V(side * 0.004, 0, 0));
    const hinge = front.clone().add(V(side * w, 0, -0.004));
    const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([hinge, hinge.clone().lerp(ear, 0.5).add(V(side * 0.012, 0, 0)), ear]), 8, 0.0035, 5), frameMaterial);
    group.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    facePoint(c.headShape, -L.eyeX + w, L.eyeY + 0.004).add(V(0, 0, 0.016)), facePoint(c.headShape, 0, L.eyeY + 0.01).add(V(0, 0, 0.018)), facePoint(c.headShape, L.eyeX - w, L.eyeY + 0.004).add(V(0, 0, 0.016)),
  ]), 8, 0.004, 5), frameMaterial);
  group.add(bridge);
  return group;
}

/** Ears and the nose bump, in skin. */
export function buildFaceSolids(c: AvatarConfig, skin: THREE.Material, detail: Detail) {
  const group = new THREE.Group();
  const size = c.earStyle === 'small' ? 0.038 : 0.048;
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(ellipsoid(V(size * 0.42, size * (c.earStyle === 'pointed' ? 1.3 : 1), size * 0.7), detail), skin);
    ear.position.copy(headSurface(c.headShape, fromAngles(side * Math.PI * 0.5, -0.02))).add(V(-side * 0.004, 0, -0.008));
    if (c.earStyle === 'pointed') ear.rotation.set(-0.35, 0, side * 0.2);
    ear.castShadow = true;
    group.add(ear);
  }
  const L = faceLayout(c);
  const nose: Record<string, V3> = { tiny: V(0.018, 0.016, 0.014), line: V(0.014, 0.019, 0.012), triangle: V(0.024, 0.026, 0.019), button: V(0.026, 0.022, 0.022), bridge: V(0.017, 0.034, 0.019), long: V(0.019, 0.038, 0.024) };
  const bump = new THREE.Mesh(ellipsoid(nose[c.noseStyle] ?? nose.button, detail), skin);
  bump.position.copy(facePoint(c.headShape, 0, L.noseY + 0.004)).add(V(0, 0, -0.004));
  group.add(bump);
  return group;
}

// ---- Body ---------------------------------------------------------------------

/** A body of revolution with an elliptical cross-section: `profile` is [radius 0..1, y]. */
function lathe(profile: [number, number][], width: number, depth: number, detail: Detail, frontBulge?: (y: number) => number) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg(detail, 40, 18));
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * width / 2, y = p.getY(i);
    let z = p.getZ(i) * depth / 2;
    if (frontBulge && z > 0) z += frontBulge(y) * (z / (depth / 2));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
const smoothProfile = (points: [number, number][], steps = 4) => {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getPoints(points.length * steps).map(p => [Math.max(0, p.x), p.y] as [number, number]);
};

/** Chest (torso driver space): from the waist to the base of the neck. `loose` widens and lengthens for oversized tops. */
export function torsoGeometry(shape: BodyShape, loose: number, detail: Detail) {
  const bottom = -0.27 - loose * 0.05;
  const profile = smoothProfile([[0, bottom - 0.002], [0.84, bottom], [0.95, -0.2], [0.99, -0.1], [1, 0.02], [0.99, 0.11], [0.9, 0.18], [0.68, 0.225], [0.36, 0.245], [0, 0.25]]);
  return lathe(profile, shape.torsoWidth * (1 + loose * 0.12), shape.torsoDepth * (1 + loose * 0.1), detail, y => shape.belly * Math.max(0, Math.sin(Math.PI * (y + 0.24) / 0.3)));
}
/** Pelvis (hips driver space). */
export function pelvisGeometry(shape: BodyShape, detail: Detail) {
  const profile = smoothProfile([[0, -0.115], [0.66, -0.11], [0.93, -0.075], [1, -0.01], [0.97, 0.06], [0.9, 0.1], [0, 0.105]]);
  return lathe(profile, shape.hipWidth, shape.torsoDepth * 0.95, detail);
}

/** A tapered capsule along +y from 0 to `length`: radius r1 at the root joint, r2 at the far joint; `from`/`to` cut a sleeve out of it. */
export function limbGeometry(r1: number, r2: number, length: number, detail: Detail, from = 0, to = 1, capRoot = true, capEnd = true) {
  const points: THREE.Vector2[] = [], arc = seg(detail, 8, 4);
  const y0 = length * from, y1 = length * to, ra = THREE.MathUtils.lerp(r1, r2, from), rb = THREE.MathUtils.lerp(r1, r2, to);
  // Profile in increasing y, so the lathe's faces point outward.
  if (capRoot) for (let i = 0; i <= arc; i++) { const t = (i / arc) * Math.PI / 2; points.push(new THREE.Vector2(Math.sin(t) * ra, y0 - Math.cos(t) * ra)); }
  else points.push(new THREE.Vector2(ra * 0.8, y0 - 0.0005), new THREE.Vector2(ra, y0));
  if (capEnd) for (let i = 0; i <= arc; i++) { const t = (i / arc) * Math.PI / 2; points.push(new THREE.Vector2(Math.cos(t) * rb, y1 + Math.sin(t) * rb)); }
  else points.push(new THREE.Vector2(rb, y1), new THREE.Vector2(rb * 0.8, y1 + 0.0005));
  return new THREE.LatheGeometry(points, seg(detail, 20, 10));
}

export const limbRadius = (part: keyof typeof LIMB_RADII, shape: BodyShape) => LIMB_RADII[part].map(r => r * shape.limb) as [number, number];

/** A ring (hem, cuff, collar) around +y at height y. */
export function ring(radius: number, tube: number, y: number, detail: Detail) {
  const g = new THREE.TorusGeometry(radius, tube, seg(detail, 8, 5), seg(detail, 24, 12));
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// ---- Hands and feet -----------------------------------------------------------

/**
 * Mitten hands in the grip frame: +z the fingers, +y the back of the hand, x
 * across the knuckles; the wrist at the origin. A gripped bar runs along x
 * below the palm, RIG.palm ahead of the wrist.
 */
export function handGeometry(side: -1 | 1, closed: boolean, detail: Detail) {
  const parts: THREE.BufferGeometry[] = [];
  const ball = (r: V3, at: V3) => { const g = new THREE.SphereGeometry(1, seg(detail, 22, 12), seg(detail, 16, 9)); g.scale(r.x, r.y, r.z); g.translate(at.x, at.y, at.z); return g; };
  const thumb = (at: V3, pitch: number, yaw: number) => { const g = limbGeometry(0.018, 0.016, 0.034, detail); g.rotateX(pitch); g.rotateY(yaw); g.translate(at.x, at.y, at.z); return g; };
  if (closed) {
    // A round fist closed over the bar; the bar runs through it along x.
    parts.push(ball(V(0.047, 0.043, 0.05), V(0, -0.012, RIG.palm - 0.006)));
    parts.push(thumb(V(-side * 0.03, 0.012, 0.03), Math.PI / 2 + 0.35, -side * 0.55));
  } else {
    // An open mitten: a soft paddle with the thumb out to the side.
    parts.push(ball(V(0.045, 0.026, 0.058), V(0, 0, 0.052)));
    parts.push(thumb(V(-side * 0.032, 0.002, 0.03), Math.PI / 2 - 0.1, -side * 0.75));
  }
  parts.push(ball(V(0.036, 0.03, 0.03), V(0, 0, 0.012)));
  return merge(parts);
}

function merge(parts: THREE.BufferGeometry[]) {
  const nonIndexed = parts.map(p => (p.index ? p.toNonIndexed() : p));
  for (const p of nonIndexed) for (const name of Object.keys(p.attributes)) if (name !== 'position' && name !== 'normal') p.deleteAttribute(name);
  const count = nonIndexed.reduce((n, p) => n + p.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
  let o = 0;
  for (const p of nonIndexed) {
    position.set(p.getAttribute('position').array as Float32Array, o * 3);
    normal.set(p.getAttribute('normal').array as Float32Array, o * 3);
    o += p.getAttribute('position').count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return g;
}

// ---- Shoes ----------------------------------------------------------------------

type Station = { z: number; y: number; w: number; h: number; top?: number; bottom?: number; x?: number };
/**
 * Lofts rounded cross-sections (superellipses, flatter at the bottom) along +z
 * into one closed, smooth surface: the way a shoe last is shaped.
 */
function loft(stations: Station[], ring: number) {
  const positions: number[] = [], index: number[] = [];
  const power = (v: number, n: number) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n);
  for (const st of stations) for (let k = 0; k < ring; k++) {
    const t = (k / ring) * TAU, c = Math.cos(t), sn = Math.sin(t), n = sn >= 0 ? st.top ?? 2.6 : st.bottom ?? 7;
    positions.push((st.x ?? 0) + (st.w / 2) * power(c, n), st.y + st.h / 2 + (st.h / 2) * power(sn, n), st.z);
  }
  for (let i = 0; i < stations.length - 1; i++) for (let k = 0; k < ring; k++) {
    const a = i * ring + k, b = i * ring + ((k + 1) % ring), c = a + ring, d = b + ring;
    index.push(a, c, b, b, c, d);
  }
  // Close the ends with rounded domes (a flat disc on a thin section reads as a cut).
  const sideFaces = index.length;
  for (const [i, direction] of [[0, -1], [stations.length - 1, 1]] as const) {
    const st = stations[i], centre = positions.length / 3, depth = Math.min(st.w, st.h) * 0.45;
    positions.push(st.x ?? 0, st.y + st.h / 2, st.z + direction * depth);
    for (let k = 0; k < ring; k++) index.push(centre, i * ring + k, i * ring + ((k + 1) % ring));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  // Every triangle faces outward: sides against their section centre, caps along the loft axis.
  const p = g.getAttribute('position'), ix = g.getIndex()!, a = V(), b = V(), c = V(), n = V(), centreOf = (k: number) => { const st = stations[Math.min(stations.length - 1, Math.floor(k / ring))]; return V(st.x ?? 0, st.y + st.h / 2, a.z); };
  for (let t = 0; t < ix.count; t += 3) {
    a.fromBufferAttribute(p, ix.getX(t)); b.fromBufferAttribute(p, ix.getX(t + 1)); c.fromBufferAttribute(p, ix.getX(t + 2));
    n.subVectors(b, a).cross(c.clone().sub(a));
    const outward = t < sideFaces ? a.clone().add(b).add(c).divideScalar(3).sub(centreOf(ix.getX(t))) : V(0, 0, t < sideFaces + ring * 3 ? -1 : 1);
    if (t < sideFaces) outward.z = 0;
    if (n.dot(outward) < 0) { const k = ix.getX(t + 1); ix.setX(t + 1, ix.getX(t + 2)); ix.setX(t + 2, k); }
  }
  g.computeVertexNormals();
  return g;
}

/** Plan-view outline of a sole: [z, width], heel to toe. */
const SOLE_PLAN: [number, number][] = [[-0.098, 0.035], [-0.092, 0.07], [-0.075, 0.09], [-0.04, 0.095], [0.01, 0.088], [0.06, 0.1], [0.11, 0.112], [0.15, 0.108], [0.18, 0.088], [0.197, 0.055], [0.204, 0.02]];
/** Upper height above the sole along the foot for a low-top: [z, height]. */
const UPPER_PROFILE: [number, number][] = [[-0.094, 0.05], [-0.086, 0.074], [-0.065, 0.088], [-0.03, 0.09], [0.0, 0.086], [0.04, 0.074], [0.08, 0.062], [0.12, 0.05], [0.15, 0.042], [0.175, 0.033], [0.192, 0.022], [0.2, 0.01]];
const interp = (table: [number, number][], z: number) => {
  if (z <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (z <= table[i][0]) { const [z0, a] = table[i - 1], [z1, b] = table[i]; return THREE.MathUtils.lerp(a, b, (z - z0) / (z1 - z0)); }
  return table[table.length - 1][1];
};

export type ShoeStyle = 'skate' | 'chunky' | 'sneaker' | 'high-top';
/**
 * A shoe in the foot frame: the ankle at the origin, +z the toe, the sole
 * RIG.ankle below. Four distinct constructions share one loft:
 *  skate    flat vulcanized sole with a foxing stripe, rubber toe cap, padded collar
 *  chunky   early-2000s puffy skate shoe: fat padded upper, thick cupsole, big tongue, overlays
 *  sneaker  slim runner: wedge midsole thicker at the heel, tapered toe, heel tab
 *  high-top padded ankle collar up the shin, laces to the top, toe cap, ankle patch
 */
export function buildShoe(style: string, upper: THREE.Material, sole: THREE.Material, trim: THREE.Material, detail: Detail, accent?: THREE.Material) {
  const group = new THREE.Group();
  group.name = 'Shoe';
  const kind = (['skate', 'chunky', 'sneaker', 'high-top'].includes(style) ? style : 'skate') as ShoeStyle;
  const ring = seg(detail, 32, 14), floor = -RIG.ankle;
  const spec = {
    skate: { sole: () => 0.03, width: 1, height: 1, spring: 0.008 },
    chunky: { sole: () => 0.042, width: 1.14, height: 1.2, spring: 0.012 },
    sneaker: { sole: (z: number) => THREE.MathUtils.lerp(0.036, 0.02, smooth(-0.09, 0.19, z)), width: 0.94, height: 0.9, spring: 0.016 },
    'high-top': { sole: () => 0.031, width: 1.02, height: 1, spring: 0.008 },
  }[kind];
  const spring = (z: number) => spec.spring * smooth(0.11, 0.205, z);
  // Dense stations (closer at the rounded heel and toe) keep the surface smooth.
  const count = seg(detail, 26, 12), zs = Array.from({ length: count }, (_, i) => THREE.MathUtils.lerp(-0.098, 0.204, 0.5 - 0.5 * Math.cos((i / (count - 1)) * Math.PI)));
  // Vulcanized soles (skate, high-top) wrap up over the toe as a rubber bumper.
  const bumper = (z: number) => (kind === 'skate' || kind === 'high-top' ? 0.016 * smooth(0.13, 0.19, z) : 0);
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const soleTop = (z: number) => floor + spring(z) + spec.sole(z);
  // Sole (outsole plus midsole), a touch wider than the upper.
  add(loft(zs.map(z => ({ z, y: floor + spring(z), w: interp(SOLE_PLAN, z) * spec.width, h: spec.sole(z) + bumper(z), top: bumper(z) > 0.002 ? 3.5 : 8, bottom: 9 })), ring), sole);
  // Upper sits on the sole, lower and narrower over the toes.
  const upperStations = (grow: number, from = -1, to = 1, scaleH = 1): Station[] => zs.filter(z => z >= from && z <= to).map(z => {
    const h = interp(UPPER_PROFILE, z) * spec.height * scaleH;
    return { z, y: soleTop(z) - 0.006, w: interp(SOLE_PLAN, z) * spec.width - 0.008 + grow, h: h + 0.006 + grow * 0.5, top: 2.4, bottom: 6 };
  });
  add(loft(upperStations(0), ring), upper);
  const second = accent ?? trim;
  if (kind === 'skate') {
    // Foxing stripe round the sole and a rubber toe cap.
    add(loft(zs.filter(z => z > -0.09 && z < 0.185).map(z => ({ z, y: soleTop(z) - 0.011, w: interp(SOLE_PLAN, z) * spec.width + 0.002, h: 0.005, top: 8, bottom: 8 })), ring), trim);
  }
  if (kind === 'chunky') {
    // Padded side overlays over the heel and a thick puffy tongue.
    add(loft(upperStations(0.006, -1, 0.05, 0.62), ring), second);
    const tongue = add(new RoundedBoxGeometry(0.058, 0.03, 0.1, 3, 0.013), upper);
    tongue.position.set(0, soleTop(0.02) + 0.082 * spec.height, 0.025);
    tongue.rotation.x = 0.55;
    add(loft(zs.map(z => ({ z, y: floor + spring(z) + 0.004, w: interp(SOLE_PLAN, z) * spec.width + 0.004, h: 0.008, top: 8, bottom: 8 })), ring), trim);
  }
  if (kind === 'sneaker') {
    // Heel tab and a swept side panel.
    const tab = add(new RoundedBoxGeometry(0.03, 0.045, 0.014, 2, 0.006), second);
    tab.position.set(0, soleTop(-0.09) + 0.07, -0.093);
    tab.rotation.x = 0.25;
    add(loft(upperStations(0.004, -0.05, 0.12, 0.45), ring), second);
  }
  if (kind === 'high-top') {
    // The padded shaft round the ankle: an oval sleeve up the shin, leaning back
    // with the leg, laced up the front, with a round ankle patch.
    const shaft = add(limbGeometry(0.062, 0.05, 0.135, detail, 0, 1, false, false), upper);
    shaft.scale.set(1, 1, 1.2);
    shaft.rotation.x = -0.14;
    shaft.position.set(0, -0.025, -0.028);
    for (let i = 0; i < 4; i++) {
      // On the shaft's front surface: its radius tapers and it leans back with height.
      const y = 0.0 + i * 0.03, h = y + 0.025, lace = add(new RoundedBoxGeometry(0.046, 0.006, 0.011, 1, 0.003), trim);
      lace.position.set(0, y, -0.028 + THREE.MathUtils.lerp(0.062, 0.05, h / 0.135) * 1.2 - h * 0.14 + 0.002);
      lace.rotation.x = Math.PI / 2 - 0.14;
    }
    for (const side of [-1, 1]) {
      const patch = add(new THREE.CircleGeometry(0.019, 18), trim);
      patch.position.set(side * 0.061, 0.03, -0.035);
      patch.rotation.y = side * Math.PI / 2;
    }
  }
  // Ankle opening: a dark lining with a padded rim. On a low shoe both follow the
  // upper's curved top (it drops toward the toe and the heel), so nothing floats.
  const liningMaterial = new THREE.MeshStandardMaterial({ color: 0x1d1b1a, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (kind === 'high-top') {
    const top = 0.11, lining = add(new THREE.CircleGeometry(0.05, seg(detail, 24, 12)), liningMaterial);
    lining.rotation.x = -Math.PI / 2 - 0.14;
    lining.scale.set(1, 1.2, 1);
    lining.position.set(0, top - 0.002, -0.043);
    const rim = add(new THREE.TorusGeometry(0.047, 0.009, seg(detail, 8, 5), seg(detail, 28, 14)), upper);
    rim.rotation.x = Math.PI / 2 - 0.14;
    rim.scale.set(1.02, 1.2, 0.85);
    rim.position.copy(lining.position).add(V(0, -0.002, 0));
    // The tongue rises out of the front of the collar.
    const tongue = add(new RoundedBoxGeometry(0.044, 0.05, 0.014, 2, 0.006), upper);
    tongue.position.set(0, top + 0.004, 0.012);
    tongue.rotation.x = -0.32;
  } else {
    const shape = (z: number) => ({ y: soleTop(z) - 0.006, w: interp(SOLE_PLAN, z) * spec.width - 0.008, h: interp(UPPER_PROFILE, z) * spec.height + 0.006 });
    // Height of the upper's top surface at (x, z): the loft's superellipse, top exponent 2.4.
    const surface = (x: number, z: number) => {
      const st = shape(z), c = Math.pow(Math.min(1, Math.abs((2 * x) / st.w)), 1.2), sn = Math.sqrt(Math.max(0, 1 - c * c));
      return st.y + st.h / 2 + (st.h / 2) * Math.pow(sn, 2 / 2.4);
    };
    const rx = 0.038 * spec.width, rz = 0.05 * spec.width, cz = -0.034, around = seg(detail, 28, 14), rings = 4;
    const at = (u: number, t: number, lift: number) => { const x = Math.cos(t) * rx * u, z = cz + Math.sin(t) * rz * u; return V(x, surface(x, z) + lift, z); };
    const positions: number[] = [], index: number[] = [];
    positions.push(...at(0, 0, 0.0015).toArray());
    for (let r = 1; r <= rings; r++) for (let k = 0; k < around; k++) positions.push(...at(r / rings, (k / around) * TAU, 0.0015).toArray());
    for (let k = 0; k < around; k++) index.push(0, 1 + ((k + 1) % around), 1 + k);
    for (let r = 1; r < rings; r++) for (let k = 0; k < around; k++) {
      const a = 1 + (r - 1) * around + k, b = 1 + (r - 1) * around + ((k + 1) % around), c = a + around, d = b + around;
      index.push(a, d, c, a, b, d);
    }
    const lining = new THREE.BufferGeometry();
    lining.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    lining.setIndex(index);
    lining.computeVertexNormals();
    add(lining, liningMaterial);
    const tube = kind === 'chunky' ? 0.011 : 0.0075;
    const edge = new THREE.CatmullRomCurve3(Array.from({ length: around }, (_, k) => at(1, (k / around) * TAU, tube * 0.35)), true);
    add(new THREE.TubeGeometry(edge, around * 2, tube, seg(detail, 8, 5), true), kind === 'chunky' ? second : upper);
  }
  // Laces across the instep, following the upper's top.
  const laceTop = (z: number) => soleTop(z) + interp(UPPER_PROFILE, z) * spec.height + 0.002;
  const laceSpan = kind === 'high-top' ? [0.09, 0.06, 0.03, 0.0] : [0.1, 0.07, 0.04];
  for (const z of laceSpan) {
    const lace = add(new RoundedBoxGeometry(0.052 * spec.width, 0.006, 0.011, 1, 0.003), trim);
    lace.position.set(0, laceTop(z), z);
    lace.rotation.x = -Math.atan2(laceTop(z + 0.01) - laceTop(z - 0.01), 0.02);
  }
  return group;
}
