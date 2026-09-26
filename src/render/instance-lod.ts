import * as THREE from "three";

/**
 * Distance detail for instanced scenery (#98). A plant or rock kind is one
 * InstancedMesh for the whole map, so the camera could only cull all of it or
 * none, and every instance of a 1.5 km hillside went through both the main
 * pass and the shadow pass. Here each registered mesh keeps its full list and
 * draws only the instances within its range of the viewer, repacked as the
 * viewer moves (every few metres, not every frame).
 * Draw calls stay the same; triangles and shadow work shrink to what is near.
 * The preset scales the ranges, and its scenery density picks the leading,
 * pre-shuffled share of instances as before.
 */
interface Lod { all: Float32Array; colors: Float32Array | null; xz: Float32Array; total: number; range: number; density: number; at: THREE.Vector2 | null }
const REPACK = 6;

/** Registers an instanced mesh for distance culling at `range` metres (before the preset's scale). */
export function enableInstanceLod(scene: THREE.Scene, mesh: THREE.InstancedMesh, range: number) {
  const total = mesh.count, all = new Float32Array(mesh.instanceMatrix.array.subarray(0, total * 16));
  const xz = new Float32Array(total * 2);
  for (let i = 0; i < total; i++) { xz[i * 2] = all[i * 16 + 12]; xz[i * 2 + 1] = all[i * 16 + 14]; }
  const colors = mesh.instanceColor ? new Float32Array(mesh.instanceColor.array.subarray(0, total * 3)) : null;
  const lod: Lod = { all, colors, xz, total, range, density: 1, at: null };
  mesh.userData.instanceLod = lod;
  ((scene.userData.instanceLods ??= []) as THREE.InstancedMesh[]).push(mesh);
  return mesh;
}

/** The share of instances a preset draws (see fidelity.ts); forces a repack. */
export function setInstanceDensity(mesh: THREE.InstancedMesh, density: number) {
  const lod = mesh.userData.instanceLod as Lod | undefined;
  if (!lod) return false;
  lod.density = density;
  lod.at = null;
  return true;
}

/** Repacks every registered mesh the viewer has moved `REPACK` metres from; `scale` is the preset's range factor. */
export function updateInstanceLods(scene: THREE.Scene, eye: THREE.Vector3, scale: number, force = false) {
  const list = scene.userData.instanceLods as THREE.InstancedMesh[] | undefined;
  if (!list) return 0;
  let packed = 0;
  for (const mesh of list) {
    const lod = mesh.userData.instanceLod as Lod;
    if (!force && lod.at && Math.hypot(lod.at.x - eye.x, lod.at.y - eye.z) < REPACK) continue;
    (lod.at ??= new THREE.Vector2()).set(eye.x, eye.z);
    const r2 = (lod.range * scale) ** 2, limit = Math.max(1, Math.round(lod.total * lod.density));
    const out = mesh.instanceMatrix.array as Float32Array, colors = mesh.instanceColor?.array as Float32Array | undefined;
    let n = 0;
    for (let i = 0; i < limit; i++) {
      const dx = lod.xz[i * 2] - eye.x, dz = lod.xz[i * 2 + 1] - eye.z;
      if (dx * dx + dz * dz > r2) continue;
      out.set(lod.all.subarray(i * 16, i * 16 + 16), n * 16);
      if (colors && lod.colors) colors.set(lod.colors.subarray(i * 3, i * 3 + 3), n * 3);
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, Math.max(16, n * 16));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) { mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, Math.max(3, n * 3)); mesh.instanceColor.needsUpdate = true; }
    // The bounds shrink to what is drawn, so the camera and the shadow pass cull it as a whole again.
    if (n) mesh.computeBoundingSphere();
    packed++;
  }
  return packed;
}

/** Draws every instance again (loading warm-up, previews): no distance limit. */
export function showAllInstances(scene: THREE.Scene) {
  const list = scene.userData.instanceLods as THREE.InstancedMesh[] | undefined;
  if (!list) return;
  for (const mesh of list) {
    const lod = mesh.userData.instanceLod as Lod;
    const limit = Math.max(1, Math.round(lod.total * lod.density));
    (mesh.instanceMatrix.array as Float32Array).set(lod.all.subarray(0, limit * 16));
    if (mesh.instanceColor && lod.colors) (mesh.instanceColor.array as Float32Array).set(lod.colors.subarray(0, limit * 3));
    mesh.count = limit; mesh.visible = true;
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) { mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.needsUpdate = true; }
    mesh.computeBoundingSphere();
    lod.at = null;
  }
}
