import * as THREE from 'three';

/**
 * Painted sets behind the 3D preview in the menus: Boulder City skies with a
 * striped low sun and layered desert ridgelines, one palette per part of the
 * menu so screens share a look without all being the same picture.
 */
export type BackdropMood = 'dusk' | 'noon' | 'night' | 'shop' | 'sunrise';
interface Palette { sky: [number, string][]; sun: [string, string, string]; sunAt: [number, number, number]; ridges: string[]; pattern: 'halftone' | 'stars' | 'pegboard' | 'none'; dots: string }
const PALETTES: Record<BackdropMood, Palette> = {
  // The rider creator and the home screen: dusk over the ranges.
  dusk: { sky: [[0, '#1d2350'], [0.34, '#5a3a78'], [0.55, '#d8667a'], [0.7, '#f7a35c'], [1, '#ffd29a']], sun: ['#fff3b0', '#ffb45e', '#ff7a59'], sunAt: [0.62, 0.63, 0.2], ridges: ['#9a6b9e', '#6b4a7c', '#4a3560'], pattern: 'halftone', dots: 'rgba(255,255,255,0.09)' },
  // Maps and play: hard desert noon, turquoise sky, sun high.
  noon: { sky: [[0, '#0f7fb8'], [0.45, '#3ec3e6'], [0.72, '#b9ecf2'], [1, '#f5e6c4']], sun: ['#ffffff', '#fff6c8', '#ffe08a'], sunAt: [0.24, 0.3, 0.1], ridges: ['#c9a27a', '#a8744f', '#7e5236'], pattern: 'halftone', dots: 'rgba(255,255,255,0.12)' },
  // Settings: night, stars, a neon-pink moon.
  night: { sky: [[0, '#05060f'], [0.5, '#141a3c'], [0.8, '#35306a'], [1, '#6a3f80']], sun: ['#ffe4f4', '#ff7ab8', '#c43f86'], sunAt: [0.72, 0.36, 0.09], ridges: ['#2a2350', '#1c1838', '#110f24'], pattern: 'stars', dots: 'rgba(255,255,255,0.8)' },
  // Rides, parts and shops: the shop's back wall at golden hour, pegboard.
  shop: { sky: [[0, '#2a1b12'], [0.5, '#6e3b1f'], [0.8, '#d9793a'], [1, '#ffc27a']], sun: ['#fff0c2', '#ffc861', '#ff8a3d'], sunAt: [0.35, 0.7, 0.16], ridges: ['#8a4a2a', '#5c2f1c', '#3a1d12'], pattern: 'pegboard', dots: 'rgba(0,0,0,0.35)' },
  // Trick book and online: pastel sunrise.
  sunrise: { sky: [[0, '#7fb6ff'], [0.45, '#c9b8ff'], [0.72, '#ffb3c8'], [1, '#ffe2b3']], sun: ['#ffffff', '#ffe6a8', '#ffb3a0'], sunAt: [0.5, 0.74, 0.18], ridges: ['#b79ad8', '#9277b8', '#6c5596'], pattern: 'halftone', dots: 'rgba(255,255,255,0.14)' },
};
const cache = new Map<BackdropMood, THREE.CanvasTexture>();

export function creatorBackdrop(mood: BackdropMood = 'dusk') {
  const hit = cache.get(mood);
  if (hit) return hit;
  const p = PALETTES[mood];
  const W = 1024, H = 1024, canvas = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = canvas.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H);
  for (const [at, colour] of p.sky) sky.addColorStop(at, colour);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  if (p.pattern === 'halftone') {
    // Halftone dots fading out toward the horizon.
    for (let y = 12; y < H * 0.5; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < W; x += 16) {
      const r = 3.2 * (1 - y / (H * 0.5));
      if (r < 0.4) continue;
      g.fillStyle = p.dots;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  } else if (p.pattern === 'stars') {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = rnd() * H * 0.62, r = rnd() < 0.08 ? 2.2 : 0.6 + rnd() * 1.1;
      g.fillStyle = p.dots; g.globalAlpha = 0.35 + rnd() * 0.65;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (r > 2) { g.fillRect(x - 7, y - 0.6, 14, 1.2); g.fillRect(x - 0.6, y - 7, 1.2, 14); }
    }
    g.globalAlpha = 1;
  } else if (p.pattern === 'pegboard') {
    for (let y = 18; y < H * 0.62; y += 30) for (let x = 18; x < W; x += 30) {
      g.fillStyle = p.dots; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
  }
  // Low striped sun (or moon).
  const cx = W * p.sunAt[0], cy = H * p.sunAt[1], R = W * p.sunAt[2];
  const sun = g.createLinearGradient(0, cy - R, 0, cy + R);
  sun.addColorStop(0, p.sun[0]);
  sun.addColorStop(0.6, p.sun[1]);
  sun.addColorStop(1, p.sun[2]);
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = sun;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) { const y = cy + R * (0.08 + i * 0.13), h = (3 + i * 2.2) * (R / (W * 0.2)); g.fillRect(cx - R, y, R * 2, h); }
  g.restore();
  // Ridgelines: the desert ranges round Boulder City.
  const ridge = (base: number, amp: number, seed: number, color: string) => {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const t = x / W, y = base - amp * (0.55 * Math.sin(t * 5.1 + seed) + 0.3 * Math.sin(t * 13.7 + seed * 2) + 0.15 * Math.sin(t * 31 + seed * 3));
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  ridge(H * 0.7, 46, 1.3, p.ridges[0]);
  ridge(H * 0.76, 38, 4.1, p.ridges[1]);
  ridge(H * 0.82, 22, 2.2, p.ridges[2]);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  cache.set(mood, texture);
  return texture;
}
