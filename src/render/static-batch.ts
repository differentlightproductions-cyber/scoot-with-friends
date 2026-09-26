import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Static batching (#85). The parks are built from thousands of small meshes
 * (a box per plank, post and curb), each its own draw call, twice over with
 * the shadow pass; Veterans drew about 1,350 a frame. Meshes that never move
 * and look the same are merged here, once the destination has finished
 * building, into one mesh per look per CELL-metre square, so the view still
 * culls by area and a frame draws a few hundred calls instead.
 *
 * Left alone: anything that moves or is looked up later (characters, doves,
 * throwables, the rider and friends, weather-dynamic groups), interactive props
 * (vending machines, trash cans), transparent or multi-material meshes,
 * materials with their own shader hooks, instanced and skinned meshes. A
 * material shared by several meshes is kept as its own batch, so code that
 * changes it later (the lamp lenses at night) still reaches every mesh that
 * uses it; one-off materials with an identical look share one.
 */
const CELL = 40;
/**
 * Bolts, brackets, cable ties, plank ends and other bits smaller than this
 * (bounding radius, metres) are merged apart from the rest of their cell and
 * drawn only near the viewer (#98; `scene.userData.smallDetail`, fidelity.ts).
 * Glowing parts (lamp lenses) always draw.
 */
const SMALL = 0.45;
const SKIP_ANCESTOR = /NPC|visitor|dove|Throwable|vending|Trash can|Preview floor|editor/i;
const SKIP_NAME = new Set(["lake-water", "Preview floor", "editor-collisions"]);

export interface BatchReport { before: number; merged: number; batches: number; skipped: Record<string, number>; small?: number }

const textureKey = (t: THREE.Texture | null | undefined) => {
  if (!t) return "";
  t.updateMatrix();
  return [t.source.uuid, t.wrapS, t.wrapT, t.magFilter, t.minFilter, t.colorSpace, t.channel, t.flipY, ...t.matrix.elements.map((n) => n.toFixed(5))].join(":");
};
const TEXTURE_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "bumpMap", "aoMap", "emissiveMap", "alphaMap", "lightMap", "displacementMap"] as const;

function lookKey(material: THREE.Material): string | null {
  // The weather hook (weather.ts) works in world space, so it survives baking; any other hook might not.
  const hooked = material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || material.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey;
  if (hooked && !material.userData.weatherHooked) return null;
  if (material.transparent || material.opacity < 1 || material.alphaTest > 0) return null;
  const m = material as THREE.MeshStandardMaterial & THREE.MeshPhysicalMaterial;
  const parts: unknown[] = [m.type, m.side, m.vertexColors, m.flatShading, m.depthTest, m.depthWrite, m.colorWrite, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.wireframe, m.fog, m.toneMapped, m.visible];
  for (const key of ["color", "emissive", "specularColor", "sheenColor", "attenuationColor"] as const) {
    const c = (m as unknown as Record<string, THREE.Color | undefined>)[key];
    parts.push(c ? c.getHexString() : "");
  }
  for (const key of ["roughness", "metalness", "emissiveIntensity", "envMapIntensity", "bumpScale", "aoMapIntensity", "lightMapIntensity", "displacementScale", "clearcoat", "clearcoatRoughness", "sheen", "transmission", "ior", "reflectivity", "shininess"] as const) {
    parts.push((m as unknown as Record<string, number | undefined>)[key]);
  }
  parts.push(m.normalScale ? `${m.normalScale.x},${m.normalScale.y}` : "", m.envMap?.uuid ?? "");
  for (const slot of TEXTURE_SLOTS) parts.push(textureKey((m as unknown as Record<string, THREE.Texture | null>)[slot]));
  try { parts.push(JSON.stringify(m.userData ?? {}), JSON.stringify((m as unknown as { defines?: unknown }).defines ?? {})); } catch { return null; }
  return parts.join("|");
}

const attributeKey = (g: THREE.BufferGeometry) =>
  Object.keys(g.attributes).sort().map((name) => {
    const a = g.attributes[name] as THREE.BufferAttribute;
    return `${name}/${a.itemSize}/${a.normalized}/${a.array.constructor.name}/${(a as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute ? "i" : ""}`;
  }).join(",");

export function batchStatic(scene: THREE.Scene): BatchReport {
  scene.updateMatrixWorld(true);
  const users = new Map<THREE.Material, number>();
  scene.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh && !Array.isArray(mesh.material)) users.set(mesh.material, (users.get(mesh.material) ?? 0) + 1); });
  const groups = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[]; template: THREE.Mesh; small: boolean }>();
  let before = 0;
  const skipped: Record<string, number> = {}, skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const centre = new THREE.Vector3();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    before++;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as unknown as { isBatchedMesh?: boolean }).isBatchedMesh) return skip("instanced");
    if (Array.isArray(mesh.material) || SKIP_NAME.has(mesh.name)) return skip("multi/name");
    if (mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || mesh.customDepthMaterial || mesh.customDistanceMaterial) return skip("hooks");
    for (let a: THREE.Object3D | null = mesh; a && a !== scene; a = a.parent) {
      if (!a.visible || a.userData.weatherDynamic || a.userData.noBatch || SKIP_ANCESTOR.test(a.name)) return skip("moving/interactive");
    }
    const g = mesh.geometry;
    if (!g.attributes.position || Object.keys(g.morphAttributes).length || g.drawRange.count !== Infinity || g.drawRange.start !== 0) return skip("geometry");
    if (mesh.matrixWorld.determinant() <= 0) return skip("mirrored");
    const look = lookKey(mesh.material);
    if (look === null) return skip("material");
    if (!g.boundingSphere) g.computeBoundingSphere();
    centre.copy(g.boundingSphere!.center).applyMatrix4(mesh.matrixWorld);
    const cell = `${Math.floor(centre.x / CELL)},${Math.floor(centre.z / CELL)}`;
    // Shared materials stay their own batch (see above); so do glowing ones,
    // whose intensity daylight.ts eases each evening per lamp. One-offs merge by look.
    const emissive = (mesh.material as THREE.MeshStandardMaterial).emissive;
    const owner = (users.get(mesh.material) ?? 0) > 1 || (emissive && emissive.getHex() !== 0) ? mesh.material.uuid : "";
    const glowing = !!emissive && emissive.getHex() !== 0;
    const small = !glowing && g.boundingSphere!.radius * mesh.matrixWorld.getMaxScaleOnAxis() < SMALL;
    const key = [look, owner, cell, attributeKey(g), g.index ? "ix" : "nx", mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled, small ? "small" : ""].join("#");
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { material: mesh.material, meshes: [], template: mesh, small }));
    group.meshes.push(mesh);
  });
  let merged = 0, batches = 0;
  const smallDetail: { center: THREE.Vector3; radius: number; meshes: THREE.Object3D[] }[] = [];
  const near = (object: THREE.Mesh) => {
    const sphere = object.geometry.boundingSphere ?? (object.geometry.computeBoundingSphere(), object.geometry.boundingSphere!);
    smallDetail.push({ center: sphere.center.clone().applyMatrix4(object.matrixWorld), radius: sphere.radius * object.matrixWorld.getMaxScaleOnAxis(), meshes: [object] });
  };
  for (const group of groups.values()) {
    if (group.meshes.length < 2) { if (group.small) near(group.meshes[0]); continue; }
    const geometries = group.meshes.map((mesh) => {
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      return g;
    });
    const geometry = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const t = group.template, batch = new THREE.Mesh(geometry, group.material);
    batch.name = `Static batch: ${group.material.name || "unnamed"} x${group.meshes.length}`;
    batch.castShadow = t.castShadow;
    batch.receiveShadow = t.receiveShadow;
    batch.renderOrder = t.renderOrder;
    batch.layers.mask = t.layers.mask;
    batch.frustumCulled = t.frustumCulled;
    batch.matrixAutoUpdate = false;
    batch.userData.staticBatch = group.meshes.length;
    for (const mesh of group.meshes) mesh.removeFromParent();
    scene.add(batch);
    batch.updateMatrixWorld();
    if (group.small) near(batch);
    merged += group.meshes.length;
    batches++;
  }
  scene.userData.smallDetail = smallDetail;
  return { before, merged, batches, skipped, small: smallDetail.length };
}
