import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Cache-busted like every other park GLB (see spine.glb?v=7 etc. in
// outdoor.ts) - static assets are otherwise served with normal HTTP caching,
// so a re-exported file at the same path can silently keep serving a
// browser's old cached copy. Bump the version whenever the .glb changes.
export const CLOUD_URL = '/models/nature/cloud.glb?v=1';
export const PINE_TREE_URL = '/models/nature/pine-tree.glb?v=2';
export const CAMELLIA_SHRUB_URL = '/models/nature/camellia-shrub.glb?v=1';

/** Geometry is in real (authored) units with its lowest point on y = 0, so a
 * caller scales by (wanted size / height) and places the base on the ground. */
export interface NatureAsset { geometry: THREE.BufferGeometry; material: THREE.Material; width: number; height: number }

const loader = new GLTFLoader();
const cache = new Map<string, Promise<NatureAsset>>();

/**
 * Bakes one glTF mesh into plain float geometry in scene space. The files are
 * exported with KHR_mesh_quantization: positions/normals/uvs are normalized
 * integers and the transform that restores real size lives on the NODE, not on
 * the geometry. Using `mesh.geometry` alone dropped that transform, so trees
 * rendered about twice their intended size and centred on the ground - half of
 * every trunk underground.
 */
function bake(mesh: THREE.Mesh): THREE.BufferGeometry {
  const source = mesh.geometry, geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attribute = source.getAttribute(name);
    if (!attribute) continue;
    const values = new Float32Array(attribute.count * attribute.itemSize);
    for (let i = 0; i < attribute.count; i++)
      for (let k = 0; k < attribute.itemSize; k++) values[i * attribute.itemSize + k] = attribute.getComponent(i, k);
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
  }
  const index = source.getIndex();
  if (index) geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index.array as ArrayLike<number>), 1));
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Loads a single-mesh decorative GLB (cloud, tree, shrub) once. These are
 * placed dozens of times each, so callers build their own InstancedMesh: one
 * shared draw call per asset matters far more than for a one-off prop. */
export function loadNatureAsset(url: string): Promise<NatureAsset> {
  let request = cache.get(url);
  if (!request)
    request = loader.loadAsync(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      let mesh: THREE.Mesh | undefined;
      gltf.scene.traverse((o) => {
        if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
      });
      if (!mesh) throw new Error('Nature asset missing a mesh: ' + url);
      const geometry = bake(mesh), size = geometry.boundingBox!.getSize(new THREE.Vector3());
      return { geometry, material: mesh.material as THREE.Material, width: size.x, height: size.y };
    });
  cache.set(url, request);
  return request;
}

/**
 * Registers an authored-model request on the scene so the loading screen can
 * wait for it. Without that the plain procedural version of every ramp, tree
 * and bush was on screen for a moment before the authored one replaced it.
 */
export function trackAssetLoad(scene: THREE.Scene, request: Promise<unknown>) {
  (scene.userData.assetLoads ??= [] as Promise<unknown>[]).push(
    request.catch((error) => console.error('Authored model failed to load; keeping the simple version.', error)),
  );
}
