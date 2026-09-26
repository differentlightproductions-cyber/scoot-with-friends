// Overhead utility lines: weathered wooden poles with a crossarm, porcelain pin
// insulators, a pole-top insulator and a black communications cable lower down;
// now and then a pole carries a grey can transformer. Three primaries and the
// cable sag between the poles. Poles, hardware and transformers are instanced;
// the wires are one merged mesh. Also the ground-level utility boxes: green
// pad-mounted transformers and small telecom pedestals.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** A pole's foot on the ground, turned `yaw` about y: the crossarm runs along local x, which should point at the street. */
export interface PoleSpot { x: number; y: number; z: number; yaw: number; transformer?: boolean }

const HEIGHT = 10.9, ARM = 10.25, ARM_REACH = 1.05, COMM = 6.2, COMM_OUT = 0.22;

let woodTexture: THREE.CanvasTexture | null = null;
/** Sun-bleached pole wood: grey-brown with long grain streaks and drying checks. */
function poleWood() {
  if (woodTexture) return woodTexture;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#6f6152"; g.fillRect(0, 0, 128, 512);
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 260; i++) {
    const x = r() * 128, w = 0.6 + r() * 2.4, light = r() < 0.5;
    g.fillStyle = light ? `rgba(168,152,128,${0.08 + r() * 0.16})` : `rgba(40,32,24,${0.08 + r() * 0.18})`;
    g.fillRect(x, r() * 512 - 200, w, 150 + r() * 420);
  }
  // Checks: thin dark splits running with the grain.
  g.strokeStyle = "rgba(24,18,12,0.55)";
  for (let i = 0; i < 14; i++) {
    const x = r() * 128, y = r() * 512, len = 30 + r() * 120;
    g.lineWidth = 0.8 + r() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + len); g.stroke();
  }
  woodTexture = new THREE.CanvasTexture(c);
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
  woodTexture.anisotropy = 4;
  return woodTexture;
}

const colored = (g: THREE.BufferGeometry, color: number | ((y: number) => THREE.Color)) => {
  const p = g.getAttribute("position"), out: number[] = [], fixed = typeof color === "number" ? new THREE.Color(color) : null;
  for (let i = 0; i < p.count; i++) { const c = fixed ?? (color as (y: number) => THREE.Color)(p.getY(i)); out.push(c.r, c.g, c.b); }
  g.setAttribute("color", new THREE.Float32BufferAttribute(out, 3));
  return g.index ? g.toNonIndexed() : g;
};
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0) => { if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); return g.translate(x, y, z); };

/** The pole and its wooden crossarm and braces, UVs in metres for the wood. */
function poleGeometry() {
  const shaft = new THREE.CylinderGeometry(0.115, 0.165, HEIGHT + 0.4, 12, 6);
  shaft.translate(0, (HEIGHT + 0.4) / 2 - 0.4, 0);
  // Creosote dark at the foot, fading up; the top weathered paler.
  const shade = (y: number) => new THREE.Color(0xffffff).multiplyScalar(y < 1.6 ? 0.55 + 0.45 * THREE.MathUtils.smoothstep(y, 0, 1.6) : 1 + 0.08 * THREE.MathUtils.smoothstep(y, 7, HEIGHT));
  const uv = shaft.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.9, uv.getY(i) * (HEIGHT + 0.4) / 2.4);
  const arm = new THREE.BoxGeometry(ARM_REACH * 2 + 0.35, 0.1, 0.09);
  const armUv = arm.getAttribute("uv");
  for (let i = 0; i < armUv.count; i++) armUv.setXY(i, armUv.getX(i) * 0.1, armUv.getY(i) * 1.1);
  arm.translate(0, ARM, 0.13);
  const parts = [colored(shaft, shade), colored(arm, 0xe6ddd0)];
  for (const s of [-1, 1]) {
    // Flat braces from the pole up to the arm.
    const brace = new THREE.BoxGeometry(0.05, 0.86, 0.018);
    brace.rotateZ(s * 0.72);
    brace.translate(s * 0.3, ARM - 0.36, 0.1);
    parts.push(colored(brace, 0x9a948c));
  }
  return mergeGeometries(parts)!;
}
/** Insulators, bolts, the cable bracket and the pole tag: everything not wood. */
function hardwareGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const porcelain = 0xdcdad2, steel = 0x6f7275;
  const insulator = (x: number, y: number, z: number) => {
    parts.push(colored(at(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), x, y + 0.05, z), steel));
    for (const [r, dy] of [[0.055, 0.1], [0.045, 0.14], [0.035, 0.18]] as const) parts.push(colored(at(new THREE.CylinderGeometry(r * 0.7, r, 0.045, 10), x, y + dy, z), porcelain));
    parts.push(colored(at(new THREE.SphereGeometry(0.03, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), x, y + 0.2, z), porcelain));
  };
  for (const x of [-ARM_REACH, ARM_REACH]) insulator(x, ARM + 0.05, 0.13);
  insulator(0, HEIGHT - 0.02, 0);
  // Through-bolts and washers on the arm.
  for (const x of [-0.25, 0.25]) parts.push(colored(at(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6), x, ARM, 0.19, Math.PI / 2), steel));
  // The communications cable's bracket and a clamp.
  // The communications cable's bracket (out toward the street, +x) and its clamp.
  parts.push(colored(at(new THREE.BoxGeometry(COMM_OUT, 0.05, 0.05), 0.1 + COMM_OUT / 2, COMM, 0), steel));
  parts.push(colored(at(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8), 0.1 + COMM_OUT, COMM - 0.03, 0, Math.PI / 2), 0x222222));
  // An aluminium pole tag at eye height, facing the street.
  parts.push(colored(at(new THREE.BoxGeometry(0.01, 0.14, 0.09), 0.162, 2.1, 0), 0xb8bcbd));
  return mergeGeometries(parts)!;
}
/** A grey can transformer hung on the pole's back (field) side, with its bushings. */
function transformerGeometry() {
  const grey = 0x8e9496, parts: THREE.BufferGeometry[] = [];
  parts.push(colored(at(new THREE.CylinderGeometry(0.27, 0.27, 0.95, 18), -0.46, 8.55, 0), grey));
  parts.push(colored(at(new THREE.CylinderGeometry(0.29, 0.27, 0.05, 18), -0.46, 9.05, 0), grey));
  parts.push(colored(at(new THREE.CylinderGeometry(0.29, 0.25, 0.04, 18), -0.46, 8.06, 0), grey));
  // The hanger bracket and two bushings on the lid.
  parts.push(colored(at(new THREE.BoxGeometry(0.2, 0.8, 0.12), -0.2, 8.6, 0), 0x5d6163));
  for (const z of [-0.1, 0.1]) parts.push(colored(at(new THREE.CylinderGeometry(0.025, 0.035, 0.16, 8), -0.46, 9.15, z), 0x6a6d6f));
  return mergeGeometries(parts)!;
}

/** A sagging wire from a to b as a thin 4-sided tube; returns points along it too. */
function wire(a: THREE.Vector3, b: THREE.Vector3, sag: number, radius: number, out: THREE.BufferGeometry[]) {
  const n = Math.max(6, Math.round(a.distanceTo(b) / 3));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, p = a.clone().lerp(b, t); p.y -= 4 * sag * t * (1 - t); pts.push(p); }
  const pos: number[] = [], idx: number[] = [], up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), lift = new THREE.Vector3();
  const dir = b.clone().sub(a).setY(0).normalize();
  side.crossVectors(dir, up).normalize();
  for (const p of pts) for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
    lift.copy(side).multiplyScalar(Math.cos(ang) * radius).addScaledVector(up, Math.sin(ang) * radius);
    pos.push(p.x + lift.x, p.y + lift.y, p.z + lift.z);
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const a0 = i * 4 + k, a1 = i * 4 + ((k + 1) % 4), b0 = a0 + 4, b1 = a1 + 4;
    idx.push(a0, b0, a1, a1, b0, b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  out.push(g);
  return pts;
}

/**
 * A line of poles through `spots` (in order), wired pole to pole. Returns the
 * group, where birds can sit (on the wires and the arms' ends) and each pole's
 * foot for a collider.
 */
export function utilityLine(spots: PoleSpot[], name = "Utility line") {
  const group = new THREE.Group();
  group.name = name;
  const woodMaterial = new THREE.MeshStandardMaterial({ map: poleWood(), vertexColors: true, roughness: 0.9, name: "Pole wood" });
  const hardwareMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.25, name: "Pole hardware" });
  const cans = spots.filter((s) => s.transformer);
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const frame = (s: PoleSpot) => matrix.compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromAxisAngle(up, s.yaw), one);
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, list: PoleSpot[], label: string, shadow = true) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
    list.forEach((s, i) => mesh.setMatrixAt(i, frame(s)));
    mesh.count = list.length;
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    mesh.name = `${name}: ${label}`;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  instanced(poleGeometry(), woodMaterial, spots, "poles");
  instanced(hardwareGeometry(), hardwareMaterial, spots, "hardware", false);
  if (cans.length) instanced(transformerGeometry(), hardwareMaterial, cans, "transformers");

  // Where each wire leaves a pole, in world space.
  const local = (s: PoleSpot, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(frame(s));
  const primaries: THREE.BufferGeometry[] = [], cable: THREE.BufferGeometry[] = [], perches: THREE.Vector3[] = [];
  for (let i = 0; i + 1 < spots.length; i++) {
    const a = spots[i], b = spots[i + 1], span = Math.hypot(b.x - a.x, b.z - a.z);
    const sag = 0.18 + span * 0.008;
    for (const [x, y, z] of [[-ARM_REACH, ARM + 0.27, 0.13], [ARM_REACH, ARM + 0.27, 0.13], [0, HEIGHT + 0.2, 0]] as const) {
      const pts = wire(local(a, x, y, z), local(b, x, y, z), sag, 0.009, primaries);
      if (y < HEIGHT) for (const t of [0.3, 0.55]) perches.push(pts[Math.round(t * (pts.length - 1))].clone().setY(pts[Math.round(t * (pts.length - 1))].y + 0.01));
    }
    const pts = wire(local(a, 0.1 + COMM_OUT, COMM - 0.03, 0), local(b, 0.1 + COMM_OUT, COMM - 0.03, 0), sag * 1.4, 0.016, cable);
    for (const t of [0.25, 0.45, 0.7]) { const p = pts[Math.round(t * (pts.length - 1))]; perches.push(p.clone().setY(p.y + 0.017)); }
  }
  for (const s of spots) for (const x of [-ARM_REACH * 0.7, ARM_REACH * 0.7]) perches.push(local(s, x, ARM + 0.05, 0.13));
  // Drop leads from each transformer's bushing up to the nearest primary.
  for (const s of cans) wire(local(s, -0.46, 9.23, 0.1), local(s, -ARM_REACH, ARM + 0.27, 0.13), 0.05, 0.006, primaries);
  for (const [list, color, metal, label] of [[primaries, 0x8f9394, 0.6, "wires"], [cable, 0x1c1c1c, 0.1, "cable"]] as const) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list as THREE.BufferGeometry[])!, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: 0.45, name: `${name} ${label}` }));
    mesh.name = `${name}: ${label}`;
    group.add(mesh);
  }
  return { group, perches, feet: spots.map((s) => ({ x: s.x, y: s.y, z: s.z, radius: 0.17, height: HEIGHT })) };
}

/** Ground utility boxes: "transformer" is a green pad-mounted box on a concrete pad, "pedestal" a small telecom post. */
export interface BoxSpot { x: number; y: number; z: number; yaw: number; kind: "transformer" | "pedestal" }
export function utilityBoxes(spots: BoxSpot[], name = "Utility boxes") {
  const group = new THREE.Group();
  group.name = name;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2, name: "Utility box paint" });
  const green = 0x51664f, beige = 0xb9ae93, concrete = 0xa8a49b;
  const transformer = mergeGeometries([
    colored(at(new THREE.BoxGeometry(1.5, 0.12, 1.3), 0, 0.03, 0), concrete),
    colored(at(new THREE.BoxGeometry(1.2, 0.95, 1.0), 0, 0.565, 0), green),
    colored(at(new THREE.BoxGeometry(1.24, 0.04, 1.04), 0, 1.05, 0), green),
    // Door seam, handle and the warning label.
    colored(at(new THREE.BoxGeometry(0.01, 0.8, 0.012), 0, 0.56, 0.506), 0x3d4d3b),
    colored(at(new THREE.BoxGeometry(0.03, 0.14, 0.03), 0.08, 0.6, 0.515), 0x9aa09c),
    colored(at(new THREE.BoxGeometry(0.22, 0.12, 0.006), -0.3, 0.8, 0.503), 0xd9c64a),
  ])!;
  const pedestal = mergeGeometries([
    colored(at(new THREE.BoxGeometry(0.34, 0.95, 0.3), 0, 0.46, 0), beige),
    colored(at(new THREE.CylinderGeometry(0.02, 0.2, 0.12, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.9), 0, 0.99, 0), beige),
    colored(at(new THREE.BoxGeometry(0.12, 0.07, 0.006), 0, 0.72, 0.153), 0xe8e5dc),
  ])!;
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (const [geometry, kind] of [[transformer, "transformer"], [pedestal, "pedestal"]] as const) {
    const list = spots.filter((s) => s.kind === kind);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((s, i) => mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromAxisAngle(up, s.yaw), one)));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = `${name}: ${kind}s`;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
