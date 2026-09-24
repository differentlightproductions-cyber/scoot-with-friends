import * as THREE from 'three';

let backdrop: THREE.CanvasTexture | null = null;

/**
 * The creator's set: a Boulder City dusk behind the rider (warm desert sky,
 * a striped low sun, layered ridgelines, halftone dots in the upper sky),
 * painted once on a canvas and used as the preview scene background.
 */
export function creatorBackdrop() {
  if (backdrop) return backdrop;
  const W = 1024, H = 1024, canvas = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = canvas.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1d2350');
  sky.addColorStop(0.34, '#5a3a78');
  sky.addColorStop(0.55, '#d8667a');
  sky.addColorStop(0.7, '#f7a35c');
  sky.addColorStop(1, '#ffd29a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // Halftone dots fading out toward the horizon.
  for (let y = 12; y < H * 0.5; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < W; x += 16) {
    const r = 3.2 * (1 - y / (H * 0.5));
    if (r < 0.4) continue;
    g.fillStyle = 'rgba(255,255,255,0.09)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Low striped sun.
  const cx = W * 0.62, cy = H * 0.63, R = W * 0.2;
  const sun = g.createLinearGradient(0, cy - R, 0, cy + R);
  sun.addColorStop(0, '#fff3b0');
  sun.addColorStop(0.6, '#ffb45e');
  sun.addColorStop(1, '#ff7a59');
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = sun;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) { const y = cy + R * (0.08 + i * 0.13), h = 3 + i * 2.2; g.fillRect(cx - R, y, R * 2, h); }
  g.restore();
  // Ridgelines: far lavender, near dusk purple (the desert ranges round Boulder City).
  const ridge = (base: number, amp: number, seed: number, color: string) => {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const t = x / W, y = base - amp * (0.55 * Math.sin(t * 5.1 + seed) + 0.3 * Math.sin(t * 13.7 + seed * 2) + 0.15 * Math.sin(t * 31 + seed * 3));
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  ridge(H * 0.7, 46, 1.3, '#9a6b9e');
  ridge(H * 0.76, 38, 4.1, '#6b4a7c');
  ridge(H * 0.82, 22, 2.2, '#4a3560');
  backdrop = new THREE.CanvasTexture(canvas);
  backdrop.colorSpace = THREE.SRGBColorSpace;
  return backdrop;
}
