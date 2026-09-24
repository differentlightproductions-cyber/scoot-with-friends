import * as THREE from 'three';
import { INK, LIME, ORANGE, PAPER, TEAL, BODY, DISPLAY } from './canvas-ui';

/** Something worth finding on the map (world metres, x right / z down the map). */
export interface MapFeature { kind: 'spawn' | 'vending' | 'fountain' | 'rack' | 'shop' | 'bench' | 'rail' | 'friend'; x: number; z: number; label?: string; x2?: number; z2?: number }
export interface MapSource {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  features: () => MapFeature[];
  player: () => { x: number; z: number; yaw: number };
  /** Hides what should not appear in an overhead photo (the rider, weather) and restores it. */
  hide: () => () => void;
}

const SIZE = 1024;

/**
 * The MAP app's picture: one overhead orthographic render of the current map,
 * taken the first time the app opens on a map (a single frame of work), with
 * the player, spots and friends drawn live on top. Pan with LS / D-pad, zoom
 * with the bumpers or triggers.
 */
export class PhoneMap {
  private photo: HTMLCanvasElement | null = null;
  private key = '';
  private bounds = { x: 0, z: 0, size: 100 };
  /** View centre in world metres and zoom (1 shows the whole map). */
  centre = new THREE.Vector2();
  zoom = 2;
  follow = true;

  constructor(private source: MapSource) {}

  /** Forget the photo (a new map was loaded). */
  reset() { this.photo = null; this.key = ''; this.follow = true; this.zoom = 2; }

  private area(features: MapFeature[]) {
    const box = new THREE.Box2();
    for (const f of features) {
      if (f.kind === 'friend') continue;
      box.expandByPoint(new THREE.Vector2(f.x, f.z));
      if (f.x2 !== undefined && f.z2 !== undefined) box.expandByPoint(new THREE.Vector2(f.x2, f.z2));
    }
    const p = this.source.player();
    box.expandByPoint(new THREE.Vector2(p.x, p.z));
    const centre = box.getCenter(new THREE.Vector2()), extent = box.getSize(new THREE.Vector2());
    return { x: centre.x, z: centre.y, size: THREE.MathUtils.clamp(Math.max(extent.x, extent.y) * 1.3 + 24, 60, 260) };
  }

  /** The overhead photo, taken once per map. */
  private capture(mapKey: string) {
    if (this.photo && this.key === mapKey) return this.photo;
    const { renderer, scene } = this.source;
    const b = (this.bounds = this.area(this.source.features()));
    const half = b.size / 2;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 900);
    cam.position.set(b.x, 400, b.z);
    cam.up.set(0, 0, -1);
    cam.lookAt(b.x, 0, b.z);
    cam.updateMatrixWorld();
    const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { colorSpace: THREE.SRGBColorSpace });
    const restore = this.source.hide();
    const fog = scene.fog, background = scene.background, previous = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    scene.fog = null;
    scene.background = new THREE.Color(0xd8c9ad);
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0xd8c9ad, 1);
      renderer.clear();
      renderer.render(scene, cam);
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const g = canvas.getContext('2d')!;
      const image = g.createImageData(SIZE, SIZE);
      // Render targets read bottom-up.
      for (let y = 0; y < SIZE; y++) image.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
      g.putImageData(image, 0, 0);
      // A printed-map finish: warm paper, a touch of contrast, a fine grid.
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = '#f4e6c8';
      g.fillRect(0, 0, SIZE, SIZE);
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = '#0b0c0d18';
      g.lineWidth = 1;
      const step = SIZE / (b.size / 10);
      for (let x = 0; x < SIZE; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, SIZE); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(SIZE, x); g.stroke(); }
      this.photo = canvas;
      this.key = mapKey;
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clear, alpha);
      scene.fog = fog;
      scene.background = background;
      restore();
      target.dispose();
    }
    return this.photo!;
  }

  /** LS / D-pad pans (stops following), bumpers or triggers zoom, A re-centres. */
  input(pan: THREE.Vector2, zoom: number, recentre: boolean, dt: number) {
    if (recentre) this.follow = true;
    if (pan.lengthSq() > 0.04) {
      if (this.follow) { const p = this.source.player(); this.centre.set(p.x, p.z); }
      this.follow = false;
      this.centre.addScaledVector(pan, (this.bounds.size / this.zoom) * 0.7 * dt);
    }
    if (zoom) this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(zoom * 1.6 * dt), 1, 6);
  }

  draw(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, mapKey: string, mapName: string) {
    const photo = this.capture(mapKey);
    const b = this.bounds, p = this.source.player();
    if (this.follow) this.centre.set(p.x, p.z);
    const span = b.size / this.zoom, scale = w / span;
    const half = span / 2;
    // Keep the view over the photo.
    const cx = THREE.MathUtils.clamp(this.centre.x, b.x - b.size / 2 + half, b.x + b.size / 2 - half);
    const cz = THREE.MathUtils.clamp(this.centre.y, b.z - b.size / 2 + (half * h) / w, b.z + b.size / 2 - (half * h) / w);
    const toScreen = (wx: number, wz: number) => ({ sx: x + w / 2 + (wx - cx) * scale, sy: y + h / 2 + (wz - cz) * scale });
    g.fillStyle = '#d8c9ad';
    g.fillRect(x, y, w, h);
    const px = SIZE / b.size;
    const sx = (cx - half - (b.x - b.size / 2)) * px, sy = (cz - (half * h) / w - (b.z - b.size / 2)) * px;
    g.drawImage(photo, sx, sy, span * px, ((span * h) / w) * px, x, y, w, h);
    // Rails and ledges as ink lines, then spots, then friends, then you.
    const features = this.source.features();
    g.lineCap = 'round';
    for (const f of features) {
      if (f.kind !== 'rail' || f.x2 === undefined || f.z2 === undefined) continue;
      const a = toScreen(f.x, f.z), c = toScreen(f.x2, f.z2);
      g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(c.sx, c.sy); g.stroke();
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 1.5; g.stroke();
    }
    const pin = (sx: number, sy: number, fill: string, letter: string) => {
      g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.font = `10px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, sx, sy + 0.5);
    };
    const style: Record<string, [string, string]> = { spawn: [PAPER, '★'], vending: [TEAL, 'V'], fountain: ['#86c3d5', 'W'], rack: ['#d5d0c4', 'R'], shop: [ORANGE, '$'], bench: ['#b8a07a', 'B'] };
    for (const f of features) {
      const s = style[f.kind];
      if (!s) continue;
      const { sx, sy } = toScreen(f.x, f.z);
      if (sx < x - 10 || sx > x + w + 10 || sy < y - 10 || sy > y + h + 10) continue;
      if (f.kind === 'bench' && this.zoom < 2.5) continue;
      pin(sx, sy, s[0], s[1]);
    }
    g.textBaseline = 'alphabetic';
    for (const f of features) {
      if (f.kind !== 'friend') continue;
      const { sx, sy } = toScreen(f.x, f.z);
      g.beginPath(); g.arc(sx, sy, 7, 0, Math.PI * 2); g.fillStyle = LIME; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
      if (f.label) { g.font = `700 11px ${BODY}`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeText(f.label, sx, sy - 11); g.fillStyle = '#fff'; g.fillText(f.label, sx, sy - 11); }
    }
    const me = toScreen(p.x, p.z);
    g.save();
    g.translate(THREE.MathUtils.clamp(me.sx, x + 8, x + w - 8), THREE.MathUtils.clamp(me.sy, y + 8, y + h - 8));
    // Forward is (sin yaw, cos yaw) in x/z; the map's y axis is +z.
    g.rotate(Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw)) - Math.PI / 2);
    g.beginPath(); g.moveTo(0, 13); g.lineTo(9, -8); g.lineTo(0, -3); g.lineTo(-9, -8); g.closePath();
    g.fillStyle = ORANGE; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.restore();
    // Caption sticker and north arrow.
    g.font = `12px ${DISPLAY}`; g.textAlign = 'left';
    const label = mapName.toUpperCase(), tw = g.measureText(label).width;
    g.fillStyle = PAPER; g.fillRect(x + 8, y + 8, tw + 16, 22); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x + 8, y + 8, tw + 16, 22);
    g.fillStyle = INK; g.fillText(label, x + 16, y + 24);
    g.beginPath(); g.moveTo(x + w - 20, y + 12); g.lineTo(x + w - 13, y + 30); g.lineTo(x + w - 27, y + 30); g.closePath(); g.fillStyle = INK; g.fill();
    g.font = `10px ${DISPLAY}`; g.textAlign = 'center'; g.fillText('N', x + w - 20, y + 42);
    if (!this.follow) { g.font = `700 11px ${BODY}`; g.textAlign = 'right'; g.fillStyle = INK; g.fillText('A · CENTRE ON ME', x + w - 10, y + h - 10); }
  }
}
