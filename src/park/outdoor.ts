import * as THREE from "three";
import type { Park } from "./park";

export const outdoorSpawns = [
  { name: "PLAZA / RUNWAY", x: -10, z: -19, yaw: 0 },
  { name: "SMALL BOX", x: -1.5, z: 13, yaw: Math.PI },
  { name: "BACK QUARTER", x: 4, z: 18, yaw: 0 },
  { name: "FRONT QUARTER", x: -8, z: -18, yaw: Math.PI },
  { name: "STREET RAIL", x: 15, z: -9, yaw: 0 },
  { name: "DROP / SPINE", x: 4.5, z: 26.2, yaw: Math.PI },
  { name: "DROP / SMALL BOX", x: -1.5, z: 26.2, yaw: Math.PI },
  { name: "DROP / LARGE TRANSFER", x: -10, z: 26.2, yaw: Math.PI },
];
export interface RampModule {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  kind: "quarter" | "spine" | "box";
  reverse: boolean;
  run: number;
  deck: number;
}
// Existing opposing ends and connected left/center/right structure, refined in place.
export const modules: RampModule[] = [
  {
    id: "front-quarter",
    x0: -13,
    x1: 13,
    z0: -30,
    z1: -22,
    h: 3.6,
    kind: "quarter",
    reverse: true,
    run: 4.25,
    deck: 3.75,
  },
  {
    id: "back-quarter",
    x0: -13,
    x1: 13,
    z0: 22,
    z1: 30,
    h: 3.6,
    kind: "quarter",
    reverse: false,
    run: 4.25,
    deck: 3.75,
  },
  {
    id: "spine",
    x0: 1,
    x1: 8,
    z0: -2.625,
    z1: 3.625,
    h: 2.2,
    kind: "spine",
    reverse: false,
    run: 3,
    deck: 0.25,
  },
  {
    id: "small-box",
    x0: -4,
    x1: 1,
    z0: -7.5,
    z1: 5.5,
    h: 1.4,
    kind: "box",
    reverse: true,
    run: 2.75,
    deck: 1.75,
  },
  {
    id: "large-transfer",
    x0: -16,
    x1: -4,
    z0: -9,
    z1: 8,
    h: 2.3,
    kind: "box",
    reverse: true,
    run: 4,
    deck: 1.65,
  },
];
const curved = (distance: number, run: number, height: number) => {
  const d = THREE.MathUtils.clamp(distance, 0, run),
    radius = (run * run + height * height) / (2 * height);
  return radius - Math.sqrt(Math.max(0, radius * radius - d * d));
};
export function rampLips(m: RampModule) {
  return m.kind === "quarter"
    ? [m.reverse ? m.z1 - m.run : m.z0 + m.run]
    : m.kind === "spine"
      ? [m.z0 + m.run, m.z1 - m.run]
      : [m.z1 - m.run];
}
export function profile(m: RampModule, z: number) {
  if (z < m.z0 || z > m.z1) return 0;
  if (m.kind === "quarter")
    return curved(m.reverse ? m.z1 - z : z - m.z0, m.run, m.h);
  if (m.kind === "spine")
    return curved(Math.min(z - m.z0, m.z1 - z), m.run, m.h);
  const lip = m.z1 - m.run,
    deckEnd = lip - m.deck;
  if (z >= lip) return curved(m.z1 - z, m.run, m.h);
  if (z >= deckEnd) return m.h;
  const t = THREE.MathUtils.clamp((z - m.z0) / (deckEnd - m.z0), 0, 1);
  return m.h * t * t * (3 - 2 * t);
}
export function outdoorLip(x: number, z: number, vz: number) {
  for (const m of modules) {
    if (x < m.x0 + 0.2 || x > m.x1 - 0.2) continue;
    for (const lip of rampLips(m)) {
      const direction =
        m.kind === "quarter"
          ? m.reverse
            ? -1
            : 1
          : m.kind === "box"
            ? -1
            : lip == rampLips(m)[0]
              ? 1
              : -1;
      const distance = (lip - z) * direction;
      if (distance > -0.4 && distance < 1.3 && vz * direction > 0)
        return { module: m, lip, direction, distance };
    }
  }
  return null;
}
export function outdoorHeight(x: number, z: number) {
  let height = 0;
  for (const m of modules)
    if (x >= m.x0 && x <= m.x1) height = Math.max(height, profile(m, z));
  return height;
}
export function buildOutdoor(park: Park) {
  const { scene } = park;
  scene.background = new THREE.Color(0x9dc6e6);
  scene.fog = new THREE.Fog(0xadcde2, 85, 220);
  scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x777b46, 2.4));
  const sun = new THREE.DirectionalLight(0xffebcd, 3.2);
  sun.position.set(-28, 45, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -48,
    right: 48,
    top: 55,
    bottom: -55,
    far: 150,
  });
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
    solid = false,
  ) =>
    park.box(new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, d), c, solid);
  box(0, -0.15, 0, 230, 0.2, 230, 0x719253);
  // Dark sheet-metal sides follow each curved profile rather than solid blocks.
  for (const m of modules) {
    for (const x of [m.x0, m.x1]) {
      const vertices: number[] = [],
        indices: number[] = [];
      for (let i = 0; i <= 72; i++) {
        const z = m.z0 + ((m.z1 - m.z0) * i) / 72;
        vertices.push(x, 0, z, x, profile(m, z), z);
        if (i < 72) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: 0x303735,
          side: THREE.DoubleSide,
          roughness: 0.85,
        }),
      );
      mesh.castShadow = true;
      scene.add(mesh);
    }
    // Plywood panel joints, a thin steel apron, and coping across the lip.
    for (let x = m.x0 + 1.2; x < m.x1; x += 1.2) {
      const points = [];
      for (let i = 0; i <= 64; i++) {
        const z = m.z0 + ((m.z1 - m.z0) * i) / 64;
        points.push(new THREE.Vector3(x, profile(m, z) + 0.009, z));
      }
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: 0x8f724d,
            transparent: true,
            opacity: 0.4,
          }),
        ),
      );
    }
    box(
      (m.x0 + m.x1) / 2,
      0.006,
      m.reverse ? m.z1 : m.z0,
      m.x1 - m.x0,
      0.012,
      0.3,
      0x606b6b,
    );
    if (m.kind === "spine")
      for (const lip of rampLips(m))
        park.rail(
          "Spine coping",
          new THREE.Vector3(m.x0 + 0.1, m.h + 0.025, lip),
          new THREE.Vector3(m.x1 - 0.1, m.h + 0.025, lip),
          "ledge",
        );
    if (m.kind === "box") {
      const lip = rampLips(m)[0];
      box(
        (m.x0 + m.x1) / 2,
        m.h + 0.009,
        lip,
        m.x1 - m.x0,
        0.018,
        0.12,
        0x606b6b,
      );
    }
    if (m.kind === "quarter") {
      const lip = rampLips(m)[0];
      park.rail(
        "Quarter coping",
        new THREE.Vector3(m.x0 + 0.1, m.h + 0.025, lip),
        new THREE.Vector3(m.x1 - 0.1, m.h + 0.025, lip),
        "ledge",
      );
      const back = m.reverse ? m.z0 : m.z1;
      for (let x = m.x0; x <= m.x1; x += 2.5)
        box(x, m.h + 0.65, back, 0.15, 1.3, 0.15, 0x9f764c, true);
      for (const h of [0.45, 1.1])
        box(
          (m.x0 + m.x1) / 2,
          m.h + h,
          back,
          m.x1 - m.x0,
          0.11,
          0.12,
          0xae8754,
          true,
        );
    }
  }
  park.bench("Small box bench", 0.55, 1.4, 1.85, 0.6, 1.35);
  park.rail(
    "Plaza flat rail",
    new THREE.Vector3(15, 0.62, -3),
    new THREE.Vector3(15, 0.62, 8),
    "rail",
  );
  for (let x = -24; x <= 24; x += 6)
    box(x, 0.002, 0, 0.012, 0.004, 66, 0x8d9691);
  for (let z = -30; z <= 30; z += 6)
    box(0, 0.002, z, 48, 0.004, 0.012, 0x8d9691);
  // Planting and distant hills frame the concrete pad without blocking lines.
  const leaf = new THREE.MeshStandardMaterial({
    color: 0x3f673c,
    roughness: 1,
  });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x776048 });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2,
      x = Math.cos(a) * (40 + (i % 3) * 5),
      z = Math.sin(a) * (51 + (i % 4) * 3);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.38, 4, 7),
      trunk,
    );
    stem.position.set(x, 2, z);
    scene.add(stem);
    for (let j = 0; j < 3; j++) {
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(3.4 - j * 0.65, 5, 9),
        leaf,
      );
      foliage.position.set(x, 4 + j * 1.8, z);
      foliage.castShadow = true;
      scene.add(foliage);
    }
  }
  for (const x of [-26, 26])
    for (const z of [-28, 28]) {
      box(x, 5, z, 0.13, 10, 0.13, 0xa4adb0);
      box(x - 1, 10, z, 2.2, 0.12, 0.35, 0x667273);
    }
  for (let i = 0; i < 12; i++) {
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(18, 10 + (i % 4) * 3, 5),
      new THREE.MeshStandardMaterial({ color: 0x9da5a4, roughness: 1 }),
    );
    hill.position.set(-110 + i * 20, 2, 95);
    scene.add(hill);
  }
  for (const x of [-27, 27]) park.bench("Plaza bench " + x, x, 0, 0);
}
