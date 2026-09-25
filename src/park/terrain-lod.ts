import * as THREE from "three";

/**
 * Fewer triangles for a sampled ground grid, with the same look. The grid is cut
 * into square tiles; a tile that is perfectly flat, lit straight up and one
 * surface throughout keeps only every `coarse`-th row and column of its vertices,
 * and every other tile keeps them all. Edges stay watertight: a flat tile's side
 * that meets a detailed tile keeps every point of that side and fans into its
 * coarse grid, so no vertex ever sits on another triangle's edge (no cracks or
 * sparkling pixels along the seams). Every vertex is an original grid vertex with
 * all its attributes, so heights, colours, UVs and normals are unchanged.
 *
 * The result is split into chunks of `chunkTiles` x `chunkTiles` tiles, each its
 * own geometry, so the parts of the ground behind the camera are not drawn.
 * `nx`/`nz` are the grid's cell counts (vertex (i, j) is j * (nx + 1) + i); both
 * must be multiples of `tile`, and `tile` of `coarse`.
 */
export function simplifyGrid(
  source: THREE.BufferGeometry,
  nx: number,
  nz: number,
  kind: ArrayLike<number>,
  { tile = 32, coarse = 8, chunkTiles = 4 } = {},
): THREE.BufferGeometry[] {
  if (nx % tile || nz % tile || tile % coarse) return [source];
  const position = source.getAttribute("position"),
    normal = source.getAttribute("normal");
  const at = (i: number, j: number) => j * (nx + 1) + i;
  const tw = nx / tile,
    th = nz / tile;
  const flat = new Uint8Array(tw * th);
  for (let tj = 0; tj < th; tj++)
    for (let ti = 0; ti < tw; ti++) {
      const y0 = position.getY(at(ti * tile, tj * tile)),
        k0 = kind[at(ti * tile, tj * tile)];
      let ok = true;
      for (let j = tj * tile; j <= (tj + 1) * tile && ok; j++)
        for (let i = ti * tile; i <= (ti + 1) * tile; i++) {
          const k = at(i, j);
          if (Math.abs(position.getY(k) - y0) > 1e-4 || kind[k] !== k0 || (normal && normal.getY(k) < 1 - 1e-6)) {
            ok = false;
            break;
          }
        }
      flat[tj * tw + ti] = ok ? 1 : 0;
    }
  // A flat tile's side is detailed where the tile across it is not flat.
  const detailedAcross = (ti: number, tj: number) =>
    ti >= 0 && tj >= 0 && ti < tw && tj < th && !flat[tj * tw + ti];
  const chunks: THREE.BufferGeometry[] = [];
  const cells = tile / coarse;
  for (let cj = 0; cj < th; cj += chunkTiles)
    for (let ci = 0; ci < tw; ci += chunkTiles) {
      const index: number[] = [],
        used = new Map<number, number>(),
        order: number[] = [];
      const vertex = (i: number, j: number) => {
        const k = at(i, j);
        let local = used.get(k);
        if (local === undefined) {
          local = order.length;
          used.set(k, local);
          order.push(k);
        }
        return local;
      };
      // Wound to face up (+y), whatever order the points come in.
      const tri = (a: [number, number], b: [number, number], c: [number, number]) => {
        const cross = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
        if (cross === 0) return;
        if (cross > 0) index.push(vertex(a[0], a[1]), vertex(b[0], b[1]), vertex(c[0], c[1]));
        else index.push(vertex(a[0], a[1]), vertex(c[0], c[1]), vertex(b[0], b[1]));
      };
      for (let tj = cj; tj < Math.min(th, cj + chunkTiles); tj++)
        for (let ti = ci; ti < Math.min(tw, ci + chunkTiles); ti++) {
          const i0 = ti * tile,
            j0 = tj * tile;
          if (!flat[tj * tw + ti]) {
            for (let j = j0; j < j0 + tile; j++)
              for (let i = i0; i < i0 + tile; i++) {
                const a = vertex(i, j), b = vertex(i + 1, j), d = vertex(i, j + 1), e = vertex(i + 1, j + 1);
                index.push(a, d, b, b, d, e);
              }
            continue;
          }
          const fineSide = {
            left: detailedAcross(ti - 1, tj),
            right: detailedAcross(ti + 1, tj),
            bottom: detailedAcross(ti, tj - 1),
            top: detailedAcross(ti, tj + 1),
          };
          for (let v = 0; v < cells; v++)
            for (let u = 0; u < cells; u++) {
              const x0 = i0 + u * coarse, x1 = x0 + coarse, z0 = j0 + v * coarse, z1 = z0 + coarse;
              const left = u === 0 && fineSide.left,
                right = u === cells - 1 && fineSide.right,
                bottom = v === 0 && fineSide.bottom,
                top = v === cells - 1 && fineSide.top;
              if (!left && !right && !bottom && !top) {
                tri([x0, z0], [x0, z1], [x1, z0]);
                tri([x1, z0], [x0, z1], [x1, z1]);
                continue;
              }
              // The cell's outline, corner by corner (BL, BR, TR, TL), with every
              // point of a detailed side; then a fan from a corner whose two sides
              // are both coarse (a cell never has two opposite detailed sides).
              const ring: [number, number][] = [],
                corners: number[] = [];
              const side = (fine: boolean, from: [number, number], to: [number, number]) => {
                corners.push(ring.length);
                ring.push(from);
                if (!fine) return;
                const steps = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]),
                  sx = Math.sign(to[0] - from[0]),
                  sz = Math.sign(to[1] - from[1]);
                for (let s = 1; s < steps; s++) ring.push([from[0] + sx * s, from[1] + sz * s]);
              };
              side(bottom, [x0, z0], [x1, z0]);
              side(right, [x1, z0], [x1, z1]);
              side(top, [x1, z1], [x0, z1]);
              side(left, [x0, z1], [x0, z0]);
              // Corner c sits between side c-1 and side c (BL: left, bottom; ...).
              const sides = [bottom, right, top, left];
              const apexCorner = [0, 1, 2, 3].find((c) => !sides[c] && !sides[(c + 3) % 4])!;
              const start = corners[apexCorner],
                apex = ring[start];
              for (let s = 1; s < ring.length - 1; s++)
                tri(apex, ring[(start + s) % ring.length], ring[(start + s + 1) % ring.length]);
            }
        }
      if (!index.length) continue;
      const g = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(source.attributes)) {
        const a = attribute as THREE.BufferAttribute,
          size = a.itemSize,
          Typed = a.array.constructor as new (n: number) => THREE.TypedArray,
          out = new Typed(order.length * size);
        for (let n = 0; n < order.length; n++)
          for (let c = 0; c < size; c++) out[n * size + c] = a.array[order[n] * size + c];
        g.setAttribute(name, new THREE.BufferAttribute(out, size, a.normalized));
      }
      g.setIndex(order.length > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
      g.computeBoundingBox();
      g.computeBoundingSphere();
      chunks.push(g);
    }
  return chunks;
}
