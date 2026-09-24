import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Park, baseTerrainHeight } from "../park/park";
import { GROUPS } from "../physics/groups";
import {
  CATALOG,
  ParkObject,
  surface,
  brushHeight,
  activeLayout,
} from "./layout";
import { woodRampMaterials } from "../park/wood-ramps";
import { surfaceMaterial } from "../park/art";
export const MATERIALS: Record<string, number> = {
  wood: 0xc59c65,
  metal: 0x748e96,
  concrete: 0xb5b9ac,
  grass: 0x739556,
  dirt: 0xaa875c,
  gravel: 0x858578,
  asphalt: 0x51585b,
};
/** Plywood sheet size (4 x 8 ft), matching the park's manufactured wood ramps. */
const SHEET_W = 1.22,
  SHEET_L = 2.44;
const tinted = new Map<string, THREE.MeshStandardMaterial>();
/**
 * The shared surface materials a profiled piece is dressed in: the park's own
 * birch plywood, side sheathing and steel for wood; brushed steel for metal;
 * poured concrete (tinted for the other ground kinds). Shared, never disposed
 * per piece (userData.shared). `scale` is metres per texture repeat.
 */
function pieceMaterials(kind: string) {
  if (kind === "wood" || kind === "metal") {
    const m = woodRampMaterials();
    for (const mat of Object.values(m)) mat.userData.shared = true;
    return kind === "wood"
      ? { top: m.riding, side: m.side, plate: m.steel as THREE.Material | null, u: SHEET_W, v: SHEET_L }
      : { top: m.steel, side: m.steel, plate: null, u: 1.2, v: 1.2 };
  }
  let mat = tinted.get(kind);
  if (!mat) {
    mat = surfaceMaterial(kind === "concrete" ? 0xffffff : (MATERIALS[kind] ?? 0xffffff), "concrete", 2.4, 2.4);
    mat.userData.shared = true;
    tinted.set(kind, mat);
  }
  return { top: mat, side: mat, plate: null, u: 2.4, v: 2.4 };
}

/** A grid of points (rows x columns) as an indexed, UV-mapped surface. */
function ribbon(points: { x: number; y: number; z: number; u: number; v: number }[][], flip = false) {
  const p: number[] = [],
    uv: number[] = [],
    index: number[] = [];
  const cols = points[0].length;
  for (const row of points)
    for (const q of row) {
      p.push(q.x, q.y, q.z);
      uv.push(q.u, q.v);
    }
  for (let r = 0; r < points.length - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c,
        b = a + 1,
        d = a + cols,
        e = d + 1;
      if (flip) index.push(a, b, d, b, e, d);
      else index.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * The visible body of a profiled piece (ramps, boxes, ledges, stairs): a riding
 * surface following the physics profile with arc-length UVs, flat sides and
 * end walls with their own UVs and normals (no smeared shading at the edges),
 * and steel kick plates where a wooden transition meets the floor.
 */
function profileMeshes(o: ParkObject) {
  const mat = pieceMaterials(o.material ?? "concrete");
  const W = o.width / 2,
    n = 96,
    lift = 0.006; // The riding face sits a hair proud of the floor it starts from.
  const zs: number[] = [],
    ys: number[] = [],
    arc: number[] = [0];
  for (let i = 0; i <= n; i++) {
    zs.push(-o.length / 2 + (o.length * i) / n);
    ys.push(surface(o, 0, zs[i]) ?? 0);
    if (i) arc.push(arc[i - 1] + Math.hypot(zs[i] - zs[i - 1], ys[i] - ys[i - 1]));
  }
  const out: THREE.Mesh[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = `${o.type} ${name}`;
    mesh.castShadow = mesh.receiveShadow = true;
    out.push(mesh);
  };
  add(ribbon(zs.map((z, i) => [-W, W].map((x) => ({ x, y: ys[i] + lift, z, u: (x + W) / mat.u, v: arc[i] / mat.v })))), mat.top, "riding surface");
  for (const x of [-W, W])
    add(
      ribbon(zs.map((z, i) => [0, ys[i] + lift].map((y) => ({ x, y, z, u: (z + o.length / 2) / mat.v, v: y / mat.u }))), x > 0),
      mat.side,
      "side",
    );
  for (const [z, h, far] of [[zs[0], ys[0], false], [zs[n], ys[n], true]] as const)
    if (h > 0.02)
      add(
        ribbon([0, h + lift].map((y) => [-W, W].map((x) => ({ x, y, z, u: (x + W) / mat.v, v: y / mat.u }))), far),
        mat.side,
        "end wall",
      );
  // Steel kick plates up each transition foot, as on the park's wooden ramps.
  if (mat.plate)
    for (const dir of [1, -1]) {
      const start = dir > 0 ? 0 : n;
      if (ys[start] > 0.02 || Math.abs(ys[start + dir] - ys[start]) < 1e-4) continue;
      const rows: { x: number; y: number; z: number; u: number; v: number }[][] = [];
      for (let i = start; i >= 0 && i <= n; i += dir) {
        const along = Math.abs(arc[i] - arc[start]);
        rows.push([-W, W].map((x) => ({ x, y: ys[i] + lift + 0.004, z: zs[i], u: x / 1.2, v: along / 1.2 })));
        if (along > 0.46) break;
      }
      add(ribbon(dir > 0 ? rows : rows.reverse()), mat.plate, "kick plate");
    }
  return out;
}

export function buildObject(park: Park, o: ParkObject) {
  const children = new Set(park.scene.children),
    handles = new Set<number>();
  park.world.forEachCollider((c) => handles.add(c.handle));
  const firstRail = park.rails.length,
    firstBench = park.benches.length;
  const color = MATERIALS[o.material] ?? MATERIALS.concrete;
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    l: number,
    c = color,
    solid = true,
  ) =>
    park.box(new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, l), c, solid);
  const rail = (a: THREE.Vector3, b: THREE.Vector3, ledge = false) => {
    if (!o.grindable) return;
    park.rail(
      o.id + " edge " + park.rails.length,
      a,
      b,
      ledge ? "ledge" : "rail",
      ledge && ["Quarter Pipe","Spine","Half Pipe","Mini Ramp"].includes(o.type),
      undefined,
      0,
    );
    if (ledge) park.rails.at(-1)!.coping = true;
  };
  const edges = (y: number) => {
    for (const x of [-o.width / 2, o.width / 2])
      rail(
        new THREE.Vector3(x, y, -o.length / 2),
        new THREE.Vector3(x, y, o.length / 2),
        true,
      );
  };
  if (o.type === "Path" && o.points) {
    const curve = new THREE.CatmullRomCurve3(
        o.points.map((p) => new THREE.Vector3(p[0], 0, p[1])),
      ),
      steps = Math.min(240, Math.max(8, Math.ceil(curve.getLength() * 2))),
      v: number[] = [],
      idx: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const p = curve.getPointAt(i / steps),
        t = curve.getTangentAt(i / steps),
        side = new THREE.Vector3(-t.z, 0, t.x).normalize();
      for (const sign of [-1, 1]) {
        const point = p.clone().addScaledVector(side, (sign * o.width) / 2);
        const wx =
            o.x +
            point.x * Math.cos(o.rotation) +
            point.z * Math.sin(o.rotation),
          wz =
            o.z -
            point.x * Math.sin(o.rotation) +
            point.z * Math.cos(o.rotation);
        v.push(
          point.x,
          brushHeight(wx, wz, baseTerrainHeight(wx, wz)) + o.height,
          point.z,
        );
      }
      if (i < steps) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        color,
        side: THREE.DoubleSide,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetUnits: -70,
      }),
    );
    mesh.receiveShadow = true;
    park.scene.add(mesh);
    park.solids.push(mesh);
    park.world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(v),
        new Uint32Array(idx),
      ).setCollisionGroups(GROUPS.surface),
    );
  } else if (
    CATALOG.Ramps.some((t) => t === o.type) ||
    ["Stairs", "Ledge", "Grind Box", "Platform", "Barrier"].includes(o.type)
  ) {
    const v: number[] = [],
      idx: number[] = [],
      n = 96;
    for (let i = 0; i <= n; i++) {
      const z = -o.length / 2 + (o.length * i) / n,
        h = surface(o, 0, z) ?? 0;
      v.push(
        -o.width / 2,
        h,
        z,
        o.width / 2,
        h,
        z,
        -o.width / 2,
        0,
        z,
        o.width / 2,
        0,
        z,
      );
      if (i < n) {
        const a = i * 4;
        idx.push(
          a,
          a + 4,
          a + 1,
          a + 1,
          a + 4,
          a + 5,
          a + 2,
          a + 6,
          a,
          a,
          a + 6,
          a + 4,
          a + 1,
          a + 5,
          a + 3,
          a + 3,
          a + 5,
          a + 7,
        );
      }
    }
    // End caps only where the profile has height: a zero-height cap at a ramp's
    // toe is a degenerate sliver the rider's ball snags on rolling back off it.
    if ((surface(o, 0, -o.length / 2) ?? 0) > 0.02) idx.push(0, 1, 2, 1, 3, 2);
    if ((surface(o, 0, o.length / 2) ?? 0) > 0.02)
      idx.push(n * 4, n * 4 + 2, n * 4 + 1, n * 4 + 1, n * 4 + 2, n * 4 + 3);
    for (const mesh of profileMeshes(o)) {
      park.scene.add(mesh);
      park.solids.push(mesh);
    }
    park.world.createCollider(
      RAPIER.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(idx))
        .setCollisionGroups(GROUPS.surface)
        .setFriction(0.05),
    );
    if (o.type === "Stairs") {
      const count = Math.max(2, Math.round(o.height / 0.25));
      for (let i = 1; i <= count; i++)
        box(
          0,
          (o.height * i) / count + 0.01,
          -o.length / 2 + (o.length * (i - 1)) / count,
          o.width,
          0.02,
          0.055,
          0xeee1b0,
          false,
        );
    }
    if (o.coping) {
      let zs: number[] = [];
      if (["Half Pipe", "Mini Ramp"].includes(o.type))
        zs = [-o.length / 2, o.length / 2];
      else if (o.type === "Spine") zs = [-o.deck / 2, o.deck / 2];
      else if (["Quarter Pipe", "Launch Ramp"].includes(o.type))
        zs = [-o.length / 2 + Math.min(o.radius, o.length)];
      else zs = [o.length / 2];
      for (const z of zs)
        rail(
          new THREE.Vector3(-o.width / 2, o.height + 0.025, z),
          new THREE.Vector3(o.width / 2, o.height + 0.025, z),
          true,
        );
    }
    if (["Ledge", "Grind Box", "Platform"].includes(o.type))
      edges(o.height + 0.02);
  } else if (/Rail|Coping/.test(o.type)) {
    const a = new THREE.Vector3(0, o.height, -o.length / 2),
      b = new THREE.Vector3(
        0,
        o.type === "Down Rail" ? 0.25 : o.height,
        o.length / 2,
      );
    rail(a, b, o.type === "Coping Edge");
    if (o.type === "Square Rail") {
      const m = box(
        0,
        (a.y + b.y) / 2,
        0,
        0.09,
        0.09,
        a.distanceTo(b),
        0x738185,
        false,
      );
      m.rotation.x = Math.atan2(a.y - b.y, o.length);
    }
    if (!o.grindable) {
      const mesh = box(0, o.height, 0, 0.09, 0.09, o.length, 0x738185);
      if (o.type === "Down Rail")
        mesh.rotation.x = Math.atan2(o.height - 0.25, o.length);
    }
  } else if (o.type === "Bench" || o.type === "Picnic Table") {
    park.bench(o.id, 0, o.height - 0.55, 0, Math.min(o.width, 1.5), o.length);
    if (o.type === "Picnic Table") {
      box(0, o.height + 0.3, 0, o.width, 0.15, o.length);
      for (const x of [-o.width * 0.65, o.width * 0.65])
        park.bench(o.id + " seat " + x, x, 0, 0, 0.45, o.length);
      edges(o.height + 0.38);
    }
  } else if (o.type === "Tree" || o.type === "Bush" || o.type === "Rock") {
    if (o.type === "Tree")
      box(0, o.height / 2, 0, 0.25, o.height, 0.25, 0x786047);
    const geo =
      o.type === "Rock"
        ? new THREE.IcosahedronGeometry(1, 0)
        : new THREE.ConeGeometry(1, 2, 7);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: o.type === "Rock" ? 0x898a7d : 0x52764b,
      }),
    );
    mesh.position.y = o.type === "Tree" ? o.height : o.height / 2;
    mesh.scale.set(o.width / 2, o.height / 2, o.length / 2);
    park.scene.add(mesh);
    if (o.type === "Rock")
      box(
        0,
        o.height * 0.3,
        0,
        o.width * 0.6,
        o.height * 0.6,
        o.length * 0.6,
        0x898a7d,
      );
  } else if (o.type === "Light Pole") {
    box(0, o.height / 2, 0, 0.14, o.height, 0.14, 0x647776);
    box(0, o.height, 0, o.width, 0.1, 0.4, 0xefe6bd);
  } else if (o.type === "Fence") {
    for (const x of [-o.width / 2, o.width / 2])
      box(x, o.height / 2, 0, 0.12, o.height, 0.12);
    for (const y of [o.height * 0.4, o.height * 0.9])
      box(0, y, 0, o.width, 0.1, 0.1);
  } else if (o.type === "Sign") {
    box(0, o.height / 2, 0, 0.12, o.height, 0.12);
    box(0, o.height, 0, o.width, o.height * 0.45, 0.1, 0x375d5a);
  } else box(0, o.height / 2, 0, o.width, o.height, o.length);
  const group = new THREE.Group();
  group.name = o.type;
  group.userData.editorId = o.id;
  for (const c of park.scene.children.slice())
    if (!children.has(c)) group.add(c);
  group.position.set(o.x, o.y, o.z);
  group.rotation.y = o.rotation;
  park.scene.add(group);
  group.updateMatrixWorld(true);
  const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      o.rotation,
    ),
    t = new THREE.Vector3(o.x, o.y, o.z);
  park.world.forEachCollider((c) => {
    if (handles.has(c.handle)) return;
    c.setTranslation(
      new THREE.Vector3().copy(c.translation()).applyQuaternion(q).add(t),
    );
    c.setRotation(
      q.clone().multiply(new THREE.Quaternion().copy(c.rotation())),
    );
  });
  for (const r of park.rails.slice(firstRail)) {
    r.a.applyQuaternion(q).add(t);
    r.b.applyQuaternion(q).add(t);
  }
  for (const b of park.benches.slice(firstBench)) {
    const p = new THREE.Vector3(b.x, b.seat, b.z).applyQuaternion(q).add(t);
    b.x = p.x;
    b.z = p.z;
    b.seat = p.y;
    b.base += o.y;
    b.yaw += o.rotation;
  }
  return group;
}

export function deformGroundLayers(park: Park) {
  if (!activeLayout?.terrain.length) return;
  for (const o of park.scene.children) {
    if (
      !(o instanceof THREE.Mesh) ||
      !(o.geometry instanceof THREE.BoxGeometry)
    )
      continue;
    const p = o.geometry.parameters;
    if (p.height > 0.1 || Math.abs(o.position.y) > 0.15) continue;
    const g = new THREE.PlaneGeometry(
      p.width,
      p.depth,
      Math.max(1, Math.ceil(p.width)),
      Math.max(1, Math.ceil(p.depth)),
    );
    g.rotateX(-Math.PI / 2);
    const a = g.getAttribute("position");
    for (let i = 0; i < a.count; i++) {
      const local = new THREE.Vector3(a.getX(i), 0, a.getZ(i))
          .applyQuaternion(o.quaternion)
          .add(o.position),
        x = local.x,
        z = local.z;
      a.setY(i, brushHeight(x, z, o.position.y + p.height / 2) - o.position.y);
    }
    g.computeVertexNormals();
    o.geometry.dispose();
    o.geometry = g;
  }
}
