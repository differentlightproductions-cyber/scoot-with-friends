import { OUTDOOR } from './park';
import { activeLayout, localXZ } from "../editor/layout";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {addDesertRidges} from './ridges';
import type { Park } from "./park";
import RAPIER from "@dimforge/rapier3d-compat";
import { GROUPS } from "../physics/groups";
import {
  buildMemorialGrounds,
  extensionHeight,
  metalQuarters,
} from "./memorial";

export const outdoorSpawns = [
  { name: "WOOD PARK / RUNWAY", x: -10, z: -19, yaw: 0 },
  { name: "SMALL BOX", x: -1.5, z: 13, yaw: Math.PI },
  { name: "BACK QUARTER", x: 4, z: 18, yaw: 0 },
  { name: "FRONT QUARTER", x: -8, z: -18, yaw: Math.PI },
  { name: "STREET RAIL", x: 15, z: -9, yaw: 0 },
  { name: "DROP / SPINE", x: 4.5, z: 26.2, yaw: Math.PI },
  { name: "DROP / SMALL BOX", x: -1.5, z: 26.2, yaw: Math.PI },
  { name: "DROP / LARGE TRANSFER", x: -10, z: 26.2, yaw: Math.PI },
  { name: "METAL STREET PARK", x: -63, z: 6, yaw: 0 },
  { name: "METAL HALF PIPE", x: -64, z: 16, yaw: Math.PI / 2 },
  { name: "PARKING / PATHS", x: 15, z: -65, yaw: 0 },
  { name: "BMX TRACK GATE", x: 65, z: -25, yaw: 0 },
  { name: "LAKESIDE TRAIL", x: -86, z: -36, yaw: Math.PI },
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
export function outdoorLip(x: number, z: number, vz: number, vx = 0) {
  for (const o of activeLayout?.objects ?? []) {
    if (
      ![
        "Quarter Pipe",
        "Half Pipe",
        "Mini Ramp",
        "Spine",
        "Launch Ramp",
        "Box Jump",
        "Bank",
        "Landing Ramp",
      ].includes(o.type)
    )
      continue;
    const p = localXZ(o, x, z);
    if (Math.abs(p.x) > o.width / 2 - 0.1) continue;
    const forward = new THREE.Vector3(
      Math.sin(o.rotation),
      0,
      Math.cos(o.rotation),
    );
    const speed = vx * forward.x + vz * forward.z;
    const lips =
      o.type === "Spine"
        ? [-o.deck / 2, o.deck / 2]
        : ["Half Pipe", "Mini Ramp"].includes(o.type)
          ? [-o.length / 2, o.length / 2]
          : [
              o.type === "Quarter Pipe" || o.type === "Launch Ramp"
                ? -o.length / 2 + Math.min(o.radius, o.length)
                : o.length / 2,
            ];
    for (let i = 0; i < lips.length; i++) {
      const lip = lips[i],
        direction =
          o.type === "Spine"
            ? i === 0
              ? 1
              : -1
            : lips.length === 2
              ? i === 0
                ? -1
                : 1
              : 1,
        distance = (lip - p.z) * direction;
      if (distance > -0.4 && distance < 1.3 && speed * direction > 0)
        return {
          module: {
            kind:
              o.type === "Spine"
                ? "spine"
                : ["Quarter Pipe", "Half Pipe", "Mini Ramp"].includes(o.type)
                  ? "quarter"
                  : "box",
          },
          lip,
          direction,
          distance,
          axis: "z" as const,
          forward: forward.clone().multiplyScalar(direction),
        };
    }
  }
  if(!OUTDOOR)return null;
  for (const m of modules) {
    const edit = activeLayout?.baseEdits["base-wood-" + m.id];
    if (edit?.hidden) continue;
    const angle = edit?.rotation ?? 0,
      centerX = (m.x0 + m.x1) / 2,
      centerZ = (m.z0 + m.z1) / 2;
    const dx = x - centerX - (edit?.x ?? 0),
      dz = z - centerZ - (edit?.z ?? 0),
      localX =
        (dx * Math.cos(angle) - dz * Math.sin(angle)) /
          (edit?.scale?.[0] ?? 1) +
        centerX,
      localZ =
        (dx * Math.sin(angle) + dz * Math.cos(angle)) /
          (edit?.scale?.[2] ?? 1) +
        centerZ;
    const localVelocity = vx * Math.sin(angle) + vz * Math.cos(angle);
    if (localX < m.x0 + 0.2 || localX > m.x1 - 0.2) continue;
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
      const distance = (lip - localZ) * direction * (edit?.scale?.[2] ?? 1);
      if (distance > -0.4 && distance < 1.3 && localVelocity * direction > 0)
        return {
          module: m,
          lip,
          direction,
          distance,
          axis: "z" as const,
          forward: new THREE.Vector3(
            Math.sin(angle) * direction,
            0,
            Math.cos(angle) * direction,
          ),
        };
    }
  }
  for (const m of metalQuarters) {
    if (z < m.z0 + 0.2 || z > m.z1 - 0.2) continue;
    const lip = m.reverse ? m.x1 - 3.2 : m.x0 + 3.2;
    const direction = m.reverse ? -1 : 1;
    const distance = (lip - x) * direction;
    if (distance > -0.4 && distance < 1.3 && vx * direction > 0)
      return {
        module: { ...m, kind: "quarter" as const },
        lip,
        direction,
        distance,
        axis: "x" as const,
        forward: new THREE.Vector3(direction, 0, 0),
      };
  }
  return null;
}
export function outdoorHeight(x: number, z: number) {
  let height = extensionHeight(x, z);
  for (const m of modules)
    if (x >= m.x0 && x <= m.x1) height = Math.max(height, profile(m, z));
  return height;
}
/**
 * The small box hub ledge: the slab centre line (three straight pieces), the
 * slab width and thickness. Shared by the build and by clearance checks, so a
 * test measures against the ledge that is actually in the park.
 */
export function smallBoxLedge() {
  const box3 = modules.find((m) => m.id === "small-box")!;
  const lip = rampLips(box3)[0],
    deckStart = lip - box3.deck,
    top = 0.42,
    // Far enough in from the box's right edge that a rider grinding the right
    // side (seat plus half the bar width) clears the spine rising beside it at x1.
    x = box3.x1 - 0.7;
  return {
    line: [
      new THREE.Vector3(x, profile(box3, box3.z0 + 1) + top, box3.z0 + 1),
      new THREE.Vector3(x, box3.h + top, deckStart),
      new THREE.Vector3(x, box3.h + top, lip),
      new THREE.Vector3(x, top, box3.z1 + 0.7),
    ],
    width: 0.62,
    thick: 0.14,
  };
}
export function buildOutdoor(park: Park) {
  const { scene } = park;
  scene.background = new THREE.Color(0x9dc6e6);
  scene.fog = new THREE.Fog(0xadcde2, 85, 220);
  scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x777b46, 1.15));
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
  buildMemorialGrounds(park);
  // Dark sheet-metal sides follow each curved profile rather than solid blocks.
  const quarterFallbacks = new Map<string, THREE.Object3D[]>();
  for (const m of modules) {
    const visualStart = new Set(scene.children);
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
      mesh.name = `${m.id} structural side`;
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
    if (m.kind === "quarter" || m.id === "small-box" || m.id === "large-transfer")
      quarterFallbacks.set(m.id, scene.children.filter((child) => !visualStart.has(child)));
    if (m.kind === "spine")
      rampLips(m).forEach((lip, i) =>
        park.rail(
          "Spine coping",
          new THREE.Vector3(m.x0 + 0.1, m.h + 0.025, lip),
          new THREE.Vector3(m.x1 - 0.1, m.h + 0.025, lip),
          "ledge",
          true,
          new THREE.Vector3(0, 0, i === 0 ? 1 : -1),
        ),
      );
    if (m.kind === "box") {
      const boxVisualStart = new Set(scene.children);
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
      // The steel lip is real coping: grindable along its length, and cleared
      // like quarter coping when rolling or launching over it.
      // The small box carries its ledge near the right-hand edge, so its coping
      // stops short of the ledge and of a rider grinding the ledge's left side.
      const end = m.id === "small-box" ? m.x1 - 1.4 : m.x1 - 0.1;
      park.rail(
        "Box coping " + m.id,
        new THREE.Vector3(m.x0 + 0.1, m.h + 0.025, lip),
        new THREE.Vector3(end, m.h + 0.025, lip),
        "ledge",
        true,
        new THREE.Vector3(0, 0, -1),
      );
      if (m.id === "small-box" || m.id === "large-transfer")
        quarterFallbacks.get(m.id)?.push(...scene.children.filter((child) => !boxVisualStart.has(child)));
    }
    if (m.kind === "quarter") {
      const lip = rampLips(m)[0];
      const copingStart = new Set(scene.children);
      park.rail(
        "Quarter coping",
        new THREE.Vector3(m.x0 + 0.1, m.h + 0.025, lip),
        new THREE.Vector3(m.x1 - 0.1, m.h + 0.025, lip),
        "ledge",
        true,
        new THREE.Vector3(0, 0, m.reverse ? -1 : 1),
      );
      quarterFallbacks.get(m.id)?.push(...scene.children.filter((child) => !copingStart.has(child)));
      const back = m.reverse ? m.z0 : m.z1;
      // Back guardrail spans the whole deck; nothing arrives from behind now.
      const guardStart = new Set(scene.children);
      for (let x = m.x0; x <= m.x1 + 0.01; x += 2.6)
        box(x, m.h + 0.65, back, 0.15, 1.3, 0.15, 0x9f764c, true);
      box(m.x1, m.h + 0.65, back, 0.15, 1.3, 0.15, 0x9f764c, true);
      for (const h of [0.45, 1.1])
        box((m.x0 + m.x1) / 2, m.h + h, back, m.x1 - m.x0, 0.11, 0.12, 0xae8754, true);
      quarterFallbacks.get(m.id)?.push(...scene.children.filter((child) => !guardStart.has(child)));
    }
  }
  // The small box hub ledge (a hubba): an up-ledge along the bank, a level run
  // across the deck and a straight down-ledge over the lip transition. It used
  // to be 22 short slabs traced along the box profile, which stepped visibly
  // and bent 48 degrees over the lip - a kink no grind can follow, so every
  // grind dropped off there. Three long straight pieces read as one built ledge,
  // and their edges join end to end so a grind carries along the whole run.
  const hubVisualStart = new Set(scene.children);
  {
    const box3 = modules.find((m) => m.id === "small-box")!;
    const { line, width, thick } = smallBoxLedge(),
      x = line[0].x;
    const ground = (z: number) => (z > box3.z1 ? 0 : profile(box3, z));
    const skirtMaterial = new THREE.MeshStandardMaterial({
      color: 0x8f918a,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i],
        b = line[i + 1],
        mid = a.clone().add(b).multiplyScalar(0.5),
        run = b.clone().sub(a),
        length = run.length(),
        tilt = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          -Math.atan2(run.y, run.z),
        );
      const slab = box(mid.x, mid.y, mid.z, width, thick, length + 0.02, 0xb08a5f);
      slab.quaternion.copy(tilt);
      // The collider reaches well below the slab so a rider rolling into the
      // side meets the ledge, not a gap beneath a floating top.
      const depth = 0.95;
      const centre = mid
        .clone()
        .add(new THREE.Vector3(0, thick / 2 - depth / 2, 0).applyQuaternion(tilt));
      park.world.createCollider(
        RAPIER.ColliderDesc.cuboid(width / 2, depth / 2, length / 2 + 0.01)
          .setTranslation(centre.x, centre.y, centre.z)
          .setRotation(tilt)
          .setFriction(0.1)
          .setCollisionGroups(GROUPS.surface),
      );
      park.solids.push(slab);
      // A solid skirt from the slab down to whatever it stands on, following
      // the ramp surface underneath instead of leaving the top on stilts.
      const vertices: number[] = [],
        indices: number[] = [],
        samples = 24;
      for (const side of [-1, 1]) {
        const base = vertices.length / 3;
        for (let s = 0; s <= samples; s++) {
          const t = s / samples,
            z = a.z + run.z * t,
            y = a.y + run.y * t - thick / 2;
          vertices.push(x + side * (width / 2 - 0.05), y, z);
          vertices.push(x + side * (width / 2 - 0.05), ground(z) - 0.02, z);
          if (s < samples) {
            const p = base + s * 2;
            indices.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
          }
        }
      }
      // End caps where a piece meets open ground.
      for (const [end, z] of [
        [a, a.z],
        [b, b.z],
      ] as const) {
        if (end !== line[0] && end !== line[line.length - 1]) continue;
        const base = vertices.length / 3,
          y = end.y - thick / 2;
        for (const side of [-1, 1]) {
          vertices.push(x + side * (width / 2 - 0.05), y, z);
          vertices.push(x + side * (width / 2 - 0.05), ground(z) - 0.02, z);
        }
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
      const skirt = new THREE.BufferGeometry();
      skirt.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      skirt.setIndex(indices);
      skirt.computeVertexNormals();
      const skirtMesh = new THREE.Mesh(skirt, skirtMaterial);
      skirtMesh.castShadow = skirtMesh.receiveShadow = true;
      skirtMesh.name = "Small box ledge skirt";
      scene.add(skirtMesh);
    }
    // One grind edge per side, chained end to end along the whole run.
    for (const side of [-1, 1])
      for (let i = 0; i < line.length - 1; i++)
        park.rail(
          `Small box ledge ${side} ${i}`,
          line[i].clone().add(new THREE.Vector3(side * 0.28, 0.078, 0)),
          line[i + 1].clone().add(new THREE.Vector3(side * 0.28, 0.078, 0)),
          "ledge",
          false,
          new THREE.Vector3(-side, 0, 0),
        );
  }
  const hubFallback = scene.children.filter((child) => !hubVisualStart.has(child));
  park.rail(
    "Wood park flat rail",
    new THREE.Vector3(15, 0.62, -3),
    new THREE.Vector3(15, 0.62, 8),
    "rail",
  );
  for (let x = -24; x <= 24; x += 6)
    box(x, 0.002, 0, 0.012, 0.004, 66, 0x8d9691);
  for (let z = -30; z <= 30; z += 6)
    box(0, 0.002, z, 48, 0.004, 0.012, 0x8d9691);
  // Trees and paths are authored across the connected memorial grounds.
  for (const x of [-26, 26])
    for (const z of [-28, 28]) {
      box(x, 5, z, 0.13, 10, 0.13, 0xa4adb0);
      box(x - 1, 10, z, 2.2, 0.12, 0.35, 0x667273);
    }
  addDesertRidges(scene);
  for (const x of [-27, 27]) park.bench("Wood park bench " + x, x, 0, 6);
  // Detailed Tripo-authored visual skin. Analytic terrain and coping remain the
  // sole physics authority; procedural sides stay visible until loading succeeds.
  const parkGeneration = scene.userData.parkGeneration;
  const stale = () => scene.userData.parkGeneration !== parkGeneration;
  const disposeModel = (root: THREE.Object3D) => root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  if (new URLSearchParams(location.search).get("tripoQuarter") !== "0")
    new GLTFLoader().load("/models/park/wooden-quarter.glb?v=4", ({ scene: source }) => {
    if (stale()) { disposeModel(source); return; }
    for (const m of modules.filter((module) => module.kind === "quarter")) {
      const name = `Detailed ${m.id}`;
      if (scene.getObjectByName(name)) continue;
      const model = source.clone(true);
      model.position.set(0, 0, (m.z0 + m.z1) / 2);
      // Blender's glTF export changes the fitted Z-forward sign.
      model.rotation.y = m.reverse ? 0 : Math.PI;
      model.name = name;
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          const textured = material as THREE.MeshStandardMaterial;
          if (textured.map) textured.map.anisotropy = 8;
          if (object.name.startsWith("Quarter_side_cap")) {
            textured.color.setHex(0x765838);
            textured.depthTest = true;
          }
          textured.roughness = Math.max(0.82, textured.roughness ?? 0.82);
          textured.metalness = Math.min(0.05, textured.metalness ?? 0);
          if (textured.normalScale) textured.normalScale.set(Math.sign(textured.normalScale.x) * 0.4, Math.sign(textured.normalScale.y) * 0.4);
        }
      });
      scene.add(model);
      quarterFallbacks.get(m.id)?.forEach((object) => { object.visible = false; });
      // The authored skin is open below its riding sheet. Close that silhouette
      // just outside the imported trim, from the ground to the full profile.
      for (const x of [m.x0 - 0.04, m.x1 + 0.04]) {
        const vertices: number[] = [], indices: number[] = [];
        for (let i = 0; i <= 72; i++) {
          const z = m.z0 + ((m.z1 - m.z0) * i) / 72;
          vertices.push(x, 0.006, z, x, profile(m, z), z);
          if (i < 72) {
            const a = i * 2;
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const side = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
          color: 0x4f3420, roughness: 0.92, side: THREE.DoubleSide,
        }));
        side.name = `${m.id} detailed side closure`;
        side.castShadow = side.receiveShadow = true;
        scene.add(side);
      }
    }
    // The 12.5 cm terrain grid otherwise interpolates a tall wedge from each
    // quarter edge to the first flat sample outside it. Cover that masked cell
    // with the flat apron the height function specifies beyond x=+/-13.
    if (!scene.getObjectByName("Quarter flat side aprons")) {
      const aprons = new THREE.Group();
      aprons.name = "Quarter flat side aprons";
      for (const x of [-13.075, 13.075]) for (const z of [-26, 26]) {
        const apron = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.012, 8.02),
          new THREE.MeshStandardMaterial({ color: 0xb7bab4, roughness: 0.91 }),
        );
        apron.position.set(x, 0.002, z);
        apron.receiveShadow = true;
        aprons.add(apron);
      }
      scene.add(aprons);
    }
    park.showDetailedQuarters();
    });
  new GLTFLoader().load("/models/park/small-box.glb?v=4", ({ scene: model }) => {
    if (stale()) { disposeModel(model); return; }
    if (scene.getObjectByName("Detailed small-box")) { disposeModel(model); return; }
    model.name = "Detailed small-box";
    model.position.set(-1.5, 0, -1);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const textured = material as THREE.MeshStandardMaterial;
        if (textured.map) textured.map.anisotropy = 8;
        textured.roughness = Math.max(0.82, textured.roughness ?? 0.82);
        textured.metalness = Math.min(0.05, textured.metalness ?? 0);
      }
    });
    scene.add(model);
    quarterFallbacks.get("small-box")?.forEach((object) => { object.visible = false; });
    park.showDetailedSmallBox();
  });
  new GLTFLoader().load("/models/park/large-box.glb?v=4", ({ scene: model }) => {
    if (stale()) { disposeModel(model); return; }
    if (scene.getObjectByName("Detailed large-box")) { disposeModel(model); return; }
    model.name = "Detailed large-box";
    model.position.set(-10, 0, -0.5);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const textured = material as THREE.MeshStandardMaterial;
        if (textured.map) textured.map.anisotropy = 8;
        textured.roughness = Math.max(0.82, textured.roughness ?? 0.82);
        textured.metalness = Math.min(0.05, textured.metalness ?? 0);
      }
    });
    scene.add(model);
    quarterFallbacks.get("large-transfer")?.forEach((object) => { object.visible = false; });
    park.showDetailedLargeBox();
  });
  new GLTFLoader().load("/models/park/wood-hub.glb?v=4", ({ scene: model }) => {
    if (stale()) { disposeModel(model); return; }
    if (scene.getObjectByName("Detailed wood-hub")) { disposeModel(model); return; }
    model.name = "Detailed wood-hub";
    model.position.set(0.3, 0, -0.15);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        const textured = material as THREE.MeshStandardMaterial;
        if (textured.map) textured.map.anisotropy = 8;
        textured.roughness = Math.max(0.82, textured.roughness ?? 0.82);
        textured.metalness = Math.min(0.05, textured.metalness ?? 0);
      }
    });
    scene.add(model);
    hubFallback.forEach((object) => { object.visible = false; });
  });
}
