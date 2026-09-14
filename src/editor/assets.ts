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
export const MATERIALS: Record<string, number> = {
  wood: 0xc59c65,
  metal: 0x748e96,
  concrete: 0xb5b9ac,
  grass: 0x739556,
  dirt: 0xaa875c,
  gravel: 0x858578,
  asphalt: 0x51585b,
};
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
    idx.push(
      0,
      1,
      2,
      1,
      3,
      2,
      n * 4,
      n * 4 + 2,
      n * 4 + 1,
      n * 4 + 1,
      n * 4 + 2,
      n * 4 + 3,
    );
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        color,
        side: THREE.DoubleSide,
        roughness: 0.85,
      }),
    );
    mesh.castShadow = mesh.receiveShadow = true;
    park.scene.add(mesh);
    park.solids.push(mesh);
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
