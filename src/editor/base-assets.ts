import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Park } from "../park/park";
import { modules } from "../park/outdoor";
import { GROUPS } from "../physics/groups";
import type { ParkLayout } from "./layout";
// Owner-only changes are saved as local overrides. No public scene is modified.
export function buildBaseAssets(
  park: Park,
  layout: ParkLayout,
  owner: boolean,
) {
  if (!owner) return [];
  const scene = park.scene,
    result: THREE.Object3D[] = [];
  // Split the original sampled surface along obstacle footprints, retaining its exact vertices.
  const terrain = scene.children.find(
    (o) =>
      o instanceof THREE.Mesh &&
      (o.geometry.getAttribute("position")?.count ?? 0) > 300000,
  ) as THREE.Mesh | undefined;
  const moduleMeshes = new Map<string, THREE.Mesh>();
  if (terrain) {
    const buckets = new Map<string, number[]>();
    const p = terrain.geometry.getAttribute("position"),
      idx = terrain.geometry.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i),
        b = idx.getX(i + 1),
        c = idx.getX(i + 2),
        x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3,
        z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      const m = modules.find(
        (m) => x >= m.x0 && x <= m.x1 && z >= m.z0 && z <= m.z1,
      );
      const key = m?.id ?? "flat";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(a, b, c);
    }
    if (terrain.userData.collider !== undefined) {
      const c = park.world.getCollider(terrain.userData.collider);
      if (c) park.world.removeCollider(c, true);
    }
    scene.remove(terrain);
    park.solids = park.solids.filter((o) => o !== terrain);
    for (const [key, indices] of buckets) {
      const g = new THREE.BufferGeometry(),
        positions: number[] = [],
        colors: number[] = [],
        map = new Map<number, number>(),
        compact: number[] = [];
      const color = terrain.geometry.getAttribute("color");
      for (const old of indices) {
        if (!map.has(old)) {
          map.set(old, map.size);
          positions.push(p.getX(old), p.getY(old), p.getZ(old));
          colors.push(color.getX(old), color.getY(old), color.getZ(old));
        }
        compact.push(map.get(old)!);
      }
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      g.setIndex(compact);
      g.computeVertexNormals();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, terrain.material);
      mesh.receiveShadow = true;
      mesh.name = key;
      mesh.userData.collider = park.world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          p.array as Float32Array,
          new Uint32Array(indices),
        ).setCollisionGroups(GROUPS.surface),
      ).handle;
      scene.add(mesh);
      park.solids.push(mesh);
      moduleMeshes.set(key, mesh);
    }
    terrain.geometry.dispose();
  }
  // Individual trees, shrubs and rocks remain independently editable even when the public scene uses instancing.
  for (const o of scene.children.slice())
    if (o instanceof THREE.InstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        const mesh = new THREE.Mesh(o.geometry, o.material),
          matrix = new THREE.Matrix4();
        o.getMatrixAt(i, matrix);
        matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.name = o.name + " " + i;
        mesh.userData.treeIndex = o.name.startsWith("tree-") ? i : undefined;
        mesh.castShadow = o.castShadow;
        scene.add(mesh);
      }
      scene.remove(o);
    }
  const originalIds = new Map(scene.children.map((o, i) => [o, i]));
  const railIds = new Map(park.rails.map((r, i) => [r, i])),
    benchIds = new Map(park.benches.map((b, i) => [b, i]));
  const used = new Set<THREE.Object3D>();
  const bounds = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
  const groupAsset = (
    key: string,
    children: THREE.Object3D[],
    label: string,
    rails: typeof park.rails = [],
    benches: typeof park.benches = [],
  ) => {
    if (!children.length) return;
    const group = new THREE.Group();
    group.name = label;
    const box = new THREE.Box3();
    children.forEach((o) => box.union(bounds(o)));
    const center = box.getCenter(new THREE.Vector3());
    center.y = 0;
    group.position.copy(center);
    scene.add(group);
    children.forEach((o) => {
      used.add(o);
      group.attach(o);
    });
    group.userData.baseId = "base-" + key;
    group.userData.originalPosition = center.toArray();
    group.userData.originalRotation = 0;
    const edit = layout.baseEdits[group.userData.baseId];
    if (edit) {
      const q = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          edit.rotation,
        ),
        delta = new THREE.Vector3(edit.x, edit.y, edit.z);
      const scale = new THREE.Vector3(...(edit.scale ?? [1, 1, 1]));
      const point = (p: THREE.Vector3) =>
        p.sub(center).multiply(scale).applyQuaternion(q).add(center).add(delta);
      group.position.add(delta);
      group.rotation.y = edit.rotation;
      group.scale.copy(scale);
      group.visible = !edit.hidden;
      group.updateMatrixWorld(true);
      if (edit.color)
        group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.material = (o.material as THREE.MeshStandardMaterial).clone();
            (o.material as THREE.MeshStandardMaterial).color.set(edit.color!);
          }
        });
      const handles = new Set<number>();
      group.traverse((o) => {
        if (o.userData.collider !== undefined) handles.add(o.userData.collider);
      });
      for (const h of handles) {
        const c = park.world.getCollider(h);
        if (!c) continue;
        if (edit.scale) {
          let mesh: THREE.Mesh | undefined;
          group.traverse((o) => {
            if (o instanceof THREE.Mesh && o.userData.collider === h) mesh = o;
          });
          if (mesh) {
            const m = mesh as THREE.Mesh,
              position = m.geometry.getAttribute("position"),
              verts: number[] = [],
              indices = m.geometry.index
                ? Array.from(m.geometry.index.array)
                : Array.from({ length: position.count }, (_, i) => i);
            for (let i = 0; i < position.count; i++) {
              const p = new THREE.Vector3()
                .fromBufferAttribute(position, i)
                .applyMatrix4(m.matrixWorld);
              verts.push(p.x, p.y, p.z);
            }
            const rail = park.railHandles.has(h);
            const collisionGroups = c.collisionGroups();
            park.world.removeCollider(c, true);
            park.railHandles.delete(h);
            const next = park.world.createCollider(
              RAPIER.ColliderDesc.trimesh(
                new Float32Array(verts),
                new Uint32Array(indices),
              ).setCollisionGroups(rail ? collisionGroups : GROUPS.surface),
            );
            if (rail) park.railHandles.add(next.handle);
            if (rail) for (const line of park.rails) if(line.colliderHandle===h) line.colliderHandle=next.handle;
            m.userData.collider = next.handle;
            if (edit.hidden) next.setEnabled(false);
            continue;
          }
        }
        c.setTranslation(point(new THREE.Vector3().copy(c.translation())));
        c.setRotation(
          q.clone().multiply(new THREE.Quaternion().copy(c.rotation())),
        );
        if (edit.hidden) c.setEnabled(false);
      }
      for (const r of rails) {
        point(r.a);
        point(r.b);
        if (edit.hidden) park.rails = park.rails.filter((v) => v !== r);
      }
      for (const b of benches) {
        const p = point(new THREE.Vector3(b.x, b.seat, b.z));
        b.x = p.x;
        b.z = p.z;
        b.seat = p.y;
        b.base = b.base * scale.y + delta.y;
        b.yaw += edit.rotation;
        b.width *= scale.x;
        b.length *= scale.z;
        if (edit.hidden) park.benches = park.benches.filter((v) => v !== b);
      }
    }
    result.push(group);
  };
  const available = () =>
    scene.children.filter(
      (o) =>
        !used.has(o) &&
        !result.includes(o) &&
        (o instanceof THREE.Mesh || o instanceof THREE.Line),
    );
  for (const m of modules) {
    const children = available().filter((o) => {
      if (o === moduleMeshes.get(m.id)) return true;
      if ([...moduleMeshes.values()].includes(o as THREE.Mesh)) return false;
      const b = bounds(o),
        c = b.getCenter(new THREE.Vector3()),
        size = b.getSize(new THREE.Vector3());
      return (
        size.x < m.x1 - m.x0 + 1 &&
        size.z < m.z1 - m.z0 + 1 &&
        c.x >= m.x0 - 0.15 &&
        c.x <= m.x1 + 0.15 &&
        c.z >= m.z0 - 0.2 &&
        c.z <= m.z1 + 0.2
      );
    });
    groupAsset(
      "wood-" + m.id,
      children,
      m.id,
      park.rails.filter(
        (r) =>
          r.a.x >= m.x0 - 0.2 &&
          r.b.x <= m.x1 + 0.2 &&
          r.a.z >= m.z0 - 0.2 &&
          r.a.z <= m.z1 + 0.2,
      ),
      park.benches.filter(
        (b) => b.x >= m.x0 && b.x <= m.x1 && b.z >= m.z0 && b.z <= m.z1,
      ),
    );
  }
  groupAsset(
    "dirt-track",
    available().filter((o) => o.name.startsWith("Dirt riding track")),
    "Dirt riding track",
  );
  for (const tree of available().filter((o) =>
    o.name.startsWith("tree-trunks"),
  )) {
    const index = tree.userData.treeIndex;
    groupAsset(
      "tree-" + index,
      available().filter((o) => o.userData.treeIndex === index),
      "Tree " + index,
    );
  }
  for (const pathId of new Set(
    available()
      .map((o) => o.userData.pathId)
      .filter((v) => v !== undefined),
  )) {
    const children = available().filter((o) => o.userData.pathId === pathId);
    groupAsset("path-" + pathId, children, children[0]?.name ?? "Path");
  }
  for (const b of park.benches) {
    const children = available().filter((o) => {
      const box = bounds(o),
        c = box.getCenter(new THREE.Vector3()),
        s = box.getSize(new THREE.Vector3());
      return (
        s.x <= b.width + 0.3 &&
        s.z <= b.length + 0.3 &&
        Math.abs(c.x - b.x) < b.width / 2 + 0.12 &&
        Math.abs(c.z - b.z) < b.length / 2 + 0.12 &&
        Math.abs(c.y - b.seat) < 0.65
      );
    });
    groupAsset(
      "bench-" + benchIds.get(b),
      children,
      b.id,
      park.rails.filter((r) => r.id.startsWith(b.id)),
      [b],
    );
  }
  for (const r of park.rails) {
    const children = available().filter(
      (o) => o.name === r.id || o.name === r.id + " support",
    );
    groupAsset("rail-" + railIds.get(r), children, r.id, [r]);
  }
  for (const o of available())
    groupAsset("asset-" + originalIds.get(o), [o], o.name || "Park asset");
  return result;
}
