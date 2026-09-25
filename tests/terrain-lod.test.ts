import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { simplifyGrid } from '../src/park/terrain-lod';

// A 16 x 12 m grid sampled every 12.5 cm, flat but for a bump, a raised strip on
// the edge and a patch of another surface.
function grid() {
  const step = 0.125, nx = 128, nz = 96, p: number[] = [], kind: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = i * step, z = j * step;
    const bump = Math.max(0, 0.4 - Math.hypot(x - 6, z - 5)) * 0.5, strip = x > 15 ? 0.05 : 0;
    p.push(x, bump + strip, z);
    kind.push(x < 4 && z > 8 ? 1 : 0);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(p.map((v, n) => (n % 3 === 1 ? 0.5 : v / 16)), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { g, nx, nz, kind, triangles: idx.length / 3 };
}

test('simplified ground is watertight, faces up, covers the same area and keeps every vertex exact', () => {
  const { g, nx, nz, kind, triangles } = grid();
  const chunks = simplifyGrid(g, nx, nz, kind, { tile: 32, coarse: 8, chunkTiles: 2 });
  assert.ok(chunks.length > 1, 'split into chunks');
  const key = (x: number, z: number) => `${Math.round(x * 8)},${Math.round(z * 8)}`;
  const source = g.getAttribute('position'), sourceColor = g.getAttribute('color'), byKey = new Map<string, number>();
  for (let k = 0; k < source.count; k++) byKey.set(key(source.getX(k), source.getZ(k)), k);
  const edges = new Map<string, number>();
  let area = 0, total = 0;
  for (const c of chunks) {
    const pos = c.getAttribute('position'), col = c.getAttribute('color'), nor = c.getAttribute('normal'), index = c.index!;
    for (let v = 0; v < pos.count; v++) {
      const k = byKey.get(key(pos.getX(v), pos.getZ(v)))!;
      assert.equal(pos.getY(v), source.getY(k));
      assert.equal(col.getX(v), sourceColor.getX(k));
      assert.equal(nor.getY(v), g.getAttribute('normal').getY(k));
    }
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, d] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      const cross = (pos.getZ(b) - pos.getZ(a)) * (pos.getX(d) - pos.getX(a)) - (pos.getX(b) - pos.getX(a)) * (pos.getZ(d) - pos.getZ(a));
      assert.ok(cross > 0, 'faces up');
      area += cross / 2;
      total++;
      for (const [u, w] of [[a, b], [b, d], [d, a]]) {
        const from = key(pos.getX(u), pos.getZ(u)), to = key(pos.getX(w), pos.getZ(w));
        edges.set(from + '>' + to, (edges.get(from + '>' + to) ?? 0) + 1);
      }
    }
  }
  assert.ok(Math.abs(area - 16 * 12) < 1e-6, `area ${area}`);
  // Every edge inside the grid is met by exactly one edge running the other way:
  // no cracks and no vertex sitting on another triangle's edge.
  for (const [edge, count] of edges) {
    assert.equal(count, 1, edge);
    const [from, to] = edge.split('>'), [x0, z0] = from.split(',').map(Number), [x1, z1] = to.split(',').map(Number);
    const outer = (x0 === x1 && (x0 === 0 || x0 === 128)) || (z0 === z1 && (z0 === 0 || z0 === 96));
    if (!outer) assert.ok(edges.has(to + '>' + from), 'unmatched edge ' + edge);
  }
  assert.ok(total < triangles * 0.5, `${total} of ${triangles} triangles`);
});

test('bumps, edges between surfaces and sloped normals keep full detail', () => {
  const { g, nx, nz, kind, triangles } = grid();
  const chunks = simplifyGrid(g, nx, nz, kind, { tile: 32, coarse: 8, chunkTiles: 8 });
  assert.equal(chunks.length, 1);
  const pos = chunks[0].getAttribute('position');
  const has = (x: number, z: number) => { for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getX(v) - x) < 1e-6 && Math.abs(pos.getZ(v) - z) < 1e-6) return true; return false; };
  assert.ok(has(6.125, 5.125), 'the bump tile keeps its samples');
  assert.ok(has(15.5, 1.125), 'the raised strip keeps its samples');
  assert.ok(has(3.125, 8.125) && has(4, 8.125), 'the surface boundary keeps its samples, and the flat tile beside it meets them point for point');
  assert.ok(!has(10.125, 1.125), 'a flat open tile drops its in-between samples');
  // A grid that does not divide into tiles is left as it was.
  assert.deepEqual(simplifyGrid(g, nx, nz, kind, { tile: 40 }), [g]);
  assert.ok(triangles > 0);
});
