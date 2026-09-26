import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { enableInstanceLod, setInstanceDensity, showAllInstances, updateInstanceLods } from '../src/render/instance-lod';

// 100 bushes in a row every 10 m along x, with a colour each.
function row() {
  const scene = new THREE.Scene(), mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 100), m = new THREE.Matrix4();
  for (let i = 0; i < 100; i++) { mesh.setMatrixAt(i, m.makeTranslation(i * 10, 0, 5)); mesh.setColorAt(i, new THREE.Color(i / 100, 0, 0)); }
  scene.add(mesh);
  return { scene, mesh };
}
const xs = (mesh: THREE.InstancedMesh) => Array.from({ length: mesh.count }, (_, i) => mesh.instanceMatrix.array[i * 16 + 12]);

test('only instances within range are drawn, with their own matrices and colours', () => {
  const { scene, mesh } = row();
  enableInstanceLod(scene, mesh, 100);
  updateInstanceLods(scene, new THREE.Vector3(300, 0, 0), 1);
  assert.deepEqual(xs(mesh), [210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 310, 320, 330, 340, 350, 360, 370, 380, 390]);
  assert.ok(Math.abs(mesh.instanceColor!.array[0] - 0.21) < 1e-6, 'colour follows its instance');
  assert.ok(mesh.boundingSphere!.radius < 100, 'bounds shrink to what is drawn');
  // The preset's scale shortens the range.
  updateInstanceLods(scene, new THREE.Vector3(300, 0, 0), 0.5, true);
  assert.equal(mesh.count, 9);
});

test('it repacks only after the viewer has moved a few metres, and hides a mesh with nothing near', () => {
  const { scene, mesh } = row();
  enableInstanceLod(scene, mesh, 30);
  assert.equal(updateInstanceLods(scene, new THREE.Vector3(0, 0, 0), 1), 1);
  assert.equal(updateInstanceLods(scene, new THREE.Vector3(4, 0, 0), 1), 0, 'no repack for a small move');
  assert.equal(updateInstanceLods(scene, new THREE.Vector3(12, 0, 0), 1), 1);
  updateInstanceLods(scene, new THREE.Vector3(0, 0, 3000), 1, true);
  assert.equal(mesh.count, 0);
  assert.equal(mesh.visible, false);
});

test('the preset density keeps its leading share, and everything can be shown again', () => {
  const { scene, mesh } = row();
  enableInstanceLod(scene, mesh, 5000);
  setInstanceDensity(mesh, 0.35);
  updateInstanceLods(scene, new THREE.Vector3(0, 0, 0), 1);
  assert.equal(mesh.count, 35);
  assert.equal(xs(mesh)[34], 340);
  setInstanceDensity(mesh, 1);
  showAllInstances(scene);
  assert.equal(mesh.count, 100);
  assert.equal(xs(mesh)[99], 990);
});
