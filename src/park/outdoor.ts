import { OUTDOOR } from './park';
import { activeLayout, localXZ } from "../editor/layout";
import * as THREE from "three";
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
// Quarter-pipe side access. The on-foot walker is pinned to the terrain height
// and only mantles onto terrain, so a flight built purely from solid boxes can
// never be climbed. The stairs are therefore part of the terrain as a steady
// ramp beneath the stepped visuals, which keeps the climb reliable and the
// collision in agreement with what the player sees.
export const STAIR_WIDTH = 0.85,
  STAIR_STEPS = 20,
  STAIR_RUN = 0.42;
export function stairHeight(x: number, z: number) {
  let height = 0;
  for (const m of modules) {
    if (m.kind !== "quarter") continue;
    const lip = rampLips(m)[0],
      back = m.reverse ? m.z0 : m.z1,
      away = Math.sign(back - lip),
      stairX = m.x0 - 1.2,
      span = STAIR_STEPS * STAIR_RUN;
    if (Math.abs(x - stairX) > STAIR_WIDTH) continue;
    const along = (z - back) * away;
    if (along < 0 || along > span) continue;
    height = Math.max(height, m.h * (1 - along / span));
  }
  return height;
}
export function outdoorHeight(x: number, z: number) {
  let height = extensionHeight(x, z);
  for (const m of modules)
    if (x >= m.x0 && x <= m.x1) height = Math.max(height, profile(m, z));
  return Math.max(height, stairHeight(x, z));
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
    x = box3.x1 - 0.3;
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
      // The steel lip is real coping: grindable along its length, and cleared
      // like quarter coping when rolling or launching over it.
      // The small box carries its ledge along the right-hand edge, so its
      // coping stops short of the ledge instead of running through its legs.
      const end = m.id === "small-box" ? m.x1 - 0.72 : m.x1 - 0.1;
      park.rail(
        "Box coping " + m.id,
        new THREE.Vector3(m.x0 + 0.1, m.h + 0.025, lip),
        new THREE.Vector3(end, m.h + 0.025, lip),
        "ledge",
        true,
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
      // Side access stairs to the top platform. They sit beyond the back edge
      // and outside the ramp's own x range, so they never cross the riding
      // transition, the coping takeoff or the landing. Rise 0.3 over run 0.46
      // is about 33 degrees, which the existing on-foot step-up handles.
      const away = Math.sign(back - lip);
      const stairX = m.x0 - 1.2,
        steps = STAIR_STEPS,
        run = STAIR_RUN,
        span = steps * run;
      // Treads are visual only: stairHeight() supplies the walkable surface, so
      // adding solid boxes here would fight it. Each tread sits on the ramp.
      for (let i = 0; i < steps; i++) {
        const along = span - i * run,
          z = back + away * along,
          y = m.h * (1 - along / span);
        box(stairX, y + 0.03, z, 1.7, 0.09, run + 0.14, 0xb08a5f, false);
        box(stairX, y - 0.09, z + away * run * 0.5, 1.6, 0.2, 0.06, 0x8d6c46, false);
      }
      box(stairX + 0.62, m.h - 0.05, back + away * 0.55, 2.9, 0.1, 1.3, 0xb08a5f, false);
      for (let i = 0; i <= steps; i += 5) {
        const along = span - i * run,
          z = back + away * along,
          y = m.h * (1 - along / span);
        box(stairX - 0.82, y + 0.55, z, 0.12, 1.1, 0.12, 0x9f764c, true);
      }
      box(stairX - 0.82, m.h * 0.6 + 0.2, back + away * span * 0.5, 0.1, 0.1, span, 0xae8754, true);
      // The guardrail opens where the stairs arrive, so the top step is not
      // walled off. A post on each side of the gap finishes the opening.
      const gate = m.x0 + 2.6;
      for (let x = gate; x <= m.x1; x += 2.5)
        box(x, m.h + 0.65, back, 0.15, 1.3, 0.15, 0x9f764c, true);
      box(m.x0, m.h + 0.65, back, 0.15, 1.3, 0.15, 0x9f764c, true);
      for (const h of [0.45, 1.1])
        box(
          (gate + m.x1) / 2,
          m.h + h,
          back,
          m.x1 - gate,
          0.11,
          0.12,
          0xae8754,
          true,
        );
    }
  }
  // The small box hub ledge (a hubba): an up-ledge along the bank, a level run
  // across the deck and a straight down-ledge over the lip transition. It used
  // to be 22 short slabs traced along the box profile, which stepped visibly
  // and bent 48 degrees over the lip - a kink no grind can follow, so every
  // grind dropped off there. Three long straight pieces read as one built ledge,
  // and their edges join end to end so a grind carries along the whole run.
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
        );
  }
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
}
