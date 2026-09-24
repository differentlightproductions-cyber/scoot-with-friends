// Seeded noise for procedural scenery: 2D simplex, fractal sums and a ridged
// variant for mountain crests. Deterministic, so every player sees the same
// desert and a rebuild matches the last one.

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

export function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Noise2 {
  private perm = new Uint8Array(512);
  constructor(seed = 1) {
    const random = mulberry(seed), p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  /** Simplex noise in [-1, 1]. */
  simplex(x: number, y: number) {
    const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255, perm = this.perm;
    let n = 0;
    const corner = (dx: number, dy: number, g: number) => {
      const tt = 0.5 - dx * dx - dy * dy;
      if (tt <= 0) return 0;
      const gr = GRAD[g & 7];
      return tt * tt * tt * tt * (gr[0] * dx + gr[1] * dy);
    };
    n += corner(x0, y0, perm[ii + perm[jj]]);
    n += corner(x1, y1, perm[ii + i1 + perm[jj + j1]]);
    n += corner(x2, y2, perm[ii + 1 + perm[jj + 1]]);
    return 70 * n;
  }
  /** Fractal sum, roughly [-1, 1]. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2.03, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += this.simplex(x, y) * amp;
      norm += amp; amp *= gain; x *= lacunarity; y *= lacunarity;
    }
    return sum / norm;
  }
  /** Ridged multifractal in [0, 1]: sharp crests, soft valleys. */
  ridged(x: number, y: number, octaves = 6, lacunarity = 2.1, gain = 0.52) {
    let sum = 0, amp = 0.5, weight = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      let v = 1 - Math.abs(this.simplex(x, y));
      v *= v * weight;
      weight = Math.min(1, Math.max(0, v * 2));
      sum += v * amp; norm += amp;
      amp *= gain; x *= lacunarity; y *= lacunarity;
    }
    return sum / norm;
  }
}
