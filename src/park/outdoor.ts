import { OUTDOOR } from './park';
import { surfaceRect } from "./surfaces";
import { activeLayout, localXZ } from "../editor/layout";
import * as THREE from "three";
import { buildDesert, scatterDesert } from "../art/desert";
import type { Park } from "./park";
import RAPIER from "@dimforge/rapier3d-compat";
import { GROUPS } from "../physics/groups";
import { buildWoodRamp, woodRampMaterials } from "./wood-ramps";
import { SkyDome } from "../art/sky";
import {
  buildMemorialGrounds,
  extensionHeight,
  metalQuarters,
  VETERANS_BOUNDS,
  VETERANS_STREETS,
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
  { name: "LAKESIDE DRIVE / FIELD", x: 117, z: -65, yaw: Math.PI / 2 },
  { name: "LAKE / DIVE DOCK", x: 312, z: -111, yaw: Math.PI / 2 },
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
    x0: 0.61,
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
    x1: 0.61,
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
// Each module's surface runs a little past its free side edges so a wheel on the
// very edge does not drop off early. Where two modules share an edge (the small
// box between the large transfer at x = -4 and the spine at x = 0.61) neither
// reaches over the other: the taller one used to extend 0.125 m onto the lower
// deck as an invisible, sloped wall that shoved riders sideways.
const EDGE_MARGIN = 0.125;
const sharedEdge = (m: RampModule, x: number) =>
  modules.some(o => o !== m && (Math.abs(o.x0 - x) < 1e-6 || Math.abs(o.x1 - x) < 1e-6) && o.z0 < m.z1 && o.z1 > m.z0);
export const surfaceSpan = modules.map(m => [
  m.x0 - (sharedEdge(m, m.x0) ? 0 : EDGE_MARGIN),
  m.x1 + (sharedEdge(m, m.x1) ? 0 : EDGE_MARGIN),
]);
export function outdoorHeight(x: number, z: number) {
  let height = extensionHeight(x, z);
  for (let i = 0; i < modules.length; i++)
    if (x >= surfaceSpan[i][0] && x <= surfaceSpan[i][1]) height = Math.max(height, profile(modules[i], z));
  // The streets and the lot lie a curb below the park (#87).
  return height > 0 ? height : height + VETERANS_STREETS.offset(x, z);
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
    x = 0.3;
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
  new SkyDome(scene);
  scene.fog = new THREE.Fog(0xd3dee6, 140, 900);
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
  // The lawn south of the park's ground slab (memorial.ts lays the rest, with
  // the streets cut out of it: under them this would show through).
  box(0, -0.15, 97.75, 230, 0.2, 35.5, 0x719253);
  // Beyond the park's lawns the Mojave runs out to the River Mountains. Under
  // the park it lies below the sunk streets and their gutters (#87).
  // The site runs from the south lawn north to the ballfields, and east across
  // Buchanan over the grass field to the lake (#100): the park's rectangle and
  // the east grounds' beside it.
  const north = VETERANS_BOUNDS.z0, south = 115, mid = (north + south) / 2, half = (south - north) / 2;
  const east = VETERANS_BOUNDS.x1 - 1, eastSouth = VETERANS_BOUNDS.z1, eastMid = (115 + east) / 2;
  const rectGap = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) => Math.hypot(Math.max(0, x0 - x, x - x1), Math.max(0, z0 - z, z - z1));
  const keepOut = (x: number, z: number) => Math.min(rectGap(x, z, -115, 115, north, south), rectGap(x, z, 115, east, north, eastSouth));
  const desert = buildDesert(scene, { center: new THREE.Vector2(125, -45), base: -0.2, keepOut, rangeStart: 700, apron: { x: 0, z: mid, halfX: 115, halfZ: half, width: 9 } });
  // A concrete mow curb finishes the lawn's edge where the rock border starts.
  const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c2b6, roughness: 0.9, name: "Mow curb concrete" });
  for (const [x, z, w, d] of [[0, south + 0.14, 230.56, 0.28], [(-115 + east) / 2, north - 0.14, east + 115.56, 0.28], [115.14, (eastSouth + south) / 2, 0.28, south - eastSouth], [-115.14, mid, 0.28, half * 2], [eastMid, eastSouth + 0.14, east - 115, 0.28], [east + 0.14, (north + eastSouth) / 2, 0.28, eastSouth - north]]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), curbMaterial);
    curb.position.set(x, -0.18, z);
    curb.receiveShadow = true;
    curb.name = "Mow curb";
    scene.add(curb);
  }
  scatterDesert(scene, { keepOut, ground: desert.surface, center: new THREE.Vector2(125, -45), near: 2.5, far: 420, count: 3800 });
  buildMemorialGrounds(park);
  // Built wooden ramps: plywood, framing, kick plates and coping, generated
  // from the same profiles the rider rides (see wood-ramps.ts).
  const trim = woodRampMaterials().trim;
  modules.forEach((m, i) => {
    // A side shared with a neighbour is closed only where it stands above it.
    const floor = (x: number) => {
      const o = modules.find((o) => o !== m && (Math.abs(o.x0 - x) < 1e-6 || Math.abs(o.x1 - x) < 1e-6) && o.z0 < m.z1 && o.z1 > m.z0);
      return o ? (z: number) => profile(o, z) + 0.012 : () => 0;
    };
    buildWoodRamp(scene, m, (z) => profile(m, z), [surfaceSpan[i][0], surfaceSpan[i][1]], [floor(m.x0), floor(m.x1)]);
  });
  // The steel pipe runs the whole lip, flush with the ramp's sides (#68): the
  // grind collider keeps its own, slightly shorter span, so a grind still
  // starts and ends exactly where it did.
  for (const m of modules) {
    if (m.kind === "spine")
      rampLips(m).forEach((lip, i) => {
        const a = new THREE.Vector3(m.x0 + 0.1, m.h + 0.025, lip),
          b = new THREE.Vector3(m.x1 - 0.1, m.h + 0.025, lip);
        park.extendPipe(park.rail("Spine coping", a, b, "ledge", true, new THREE.Vector3(0, 0, i === 0 ? 1 : -1)), a, b, 0.09, 0.09);
      });
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
      // The small box carries its ledge near the right-hand edge, so its coping
      // stops short of the ledge and of a rider grinding the ledge's left side.
      // Its pipe still runs right up to the ledge's side, as built (#68).
      const end = m.id === "small-box" ? m.x1 - 1.4 : m.x1 - 0.1;
      const a = new THREE.Vector3(m.x0 + 0.1, m.h + 0.025, lip),
        b = new THREE.Vector3(end, m.h + 0.025, lip);
      const ledge = smallBoxLedge();
      park.extendPipe(
        park.rail("Box coping " + m.id, a, b, "ledge", true, new THREE.Vector3(0, 0, -1)),
        a,
        b,
        0.09,
        (m.id === "small-box" ? ledge.line[0].x - ledge.width / 2 - 0.01 : m.x1 - 0.01) - end,
      );
    }
    if (m.kind === "quarter") {
      const lip = rampLips(m)[0];
      const a = new THREE.Vector3(m.x0 + 0.1, m.h + 0.025, lip),
        b = new THREE.Vector3(m.x1 - 0.1, m.h + 0.025, lip);
      park.extendPipe(park.rail("Quarter coping", a, b, "ledge", true, new THREE.Vector3(0, 0, m.reverse ? -1 : 1)), a, b, 0.09, 0.09);
      const back = m.reverse ? m.z0 : m.z1;
      // Back guardrail spans the whole deck; nothing arrives from behind now.
      const rail: THREE.Mesh[] = [];
      for (let x = m.x0; x <= m.x1 + 0.01; x += 2.6)
        rail.push(box(x, m.h + 0.65, back, 0.09, 1.3, 0.09, 0xffffff, true));
      rail.push(box(m.x1, m.h + 0.65, back, 0.09, 1.3, 0.09, 0xffffff, true));
      for (const h of [0.45, 1.1])
        rail.push(box((m.x0 + m.x1) / 2, m.h + h, back, m.x1 - m.x0, 0.09, 0.04, 0xffffff, true));
      for (const r of rail) r.material = trim;
      // The imported Tripo fence also returns along both deck sides. Thin full
      // fence-envelope colliders prevent the rider/scooter slipping between
      // decorative bars while following the visible back and side rails.
      park.world.createCollider(
        RAPIER.ColliderDesc.cuboid((m.x1 - m.x0) / 2, .65, .075)
          .setTranslation((m.x0 + m.x1) / 2, m.h + .65, back)
          .setFriction(.8)
          .setCollisionGroups(GROUPS.surface),
      );
      const sideMidZ = (back + lip) / 2;
      for (const x of [m.x0, m.x1])
        park.world.createCollider(
          RAPIER.ColliderDesc.cuboid(.075, .65, m.deck / 2)
            .setTranslation(x, m.h + .65, sideMidZ)
            .setFriction(.8)
            .setCollisionGroups(GROUPS.surface),
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
    // The hubba is built like the ramps: a 2x lumber top on plywood sheathing,
    // with steel angle along both grind edges.
    const skirtMaterial = woodRampMaterials().side.clone();
    skirtMaterial.side = THREE.DoubleSide;
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
      const slab = box(mid.x, mid.y, mid.z, width, thick, length + 0.02, 0xffffff);
      slab.material = trim;
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
      skirt.setAttribute("uv", new THREE.Float32BufferAttribute(vertices.flatMap((_, k) => k % 3 === 2 ? [vertices[k] / 2.44, vertices[k - 1] / 1.22] : []), 2));
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
    const angle = new THREE.MeshStandardMaterial({ color: 0xa9afb1, metalness: 0.75, roughness: 0.38, name: "Steel ledge angle" });
    for (const o of scene.children)
      if (o instanceof THREE.Mesh && /^Small box ledge -?1 \d/.test(o.name)) o.material = angle;
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
  for (const x of [-27, 27]) park.bench("Wood park bench " + x, x, 0, 6);
  // Detailed Tripo-authored visual skin. Analytic terrain and coping remain the
  // sole physics authority; procedural sides stay visible until loading succeeds.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(48, 66), new THREE.MeshStandardMaterial({ color: 0xb6b8ad, roughness: .91 }));
  apron.name = "Wood park concrete substrate";
  surfaceRect("road", -24, 24, -33, 33);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = .001;
  apron.receiveShadow = true;
  scene.add(apron);
}

