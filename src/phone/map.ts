import * as THREE from 'three';
import { INK, LIME, ORANGE, PAPER, TEAL, BODY, DISPLAY } from './canvas-ui';

/** Something worth finding on the map (world metres, x right / z down the map). */
export interface MapFeature { kind: 'spawn' | 'vending' | 'fountain' | 'rack' | 'shop' | 'bench' | 'rail' | 'ramp' | 'friend'; x: number; z: number; label?: string; x2?: number; z2?: number }
/** How the rider is getting about, for the map marker. */
export type MapRide = 'scooter' | 'longboard' | 'foot';
export interface MapSource {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  features: () => MapFeature[];
  player: () => { x: number; z: number; yaw: number; ride?: MapRide };
  /** Hides what should not appear in an overhead photo (the rider, weather) and restores it. */
  hide: () => () => void;
}

const SIZE = 1024;
/** The minimap's rider-centred photo on long maps. */
const LOCAL_SIZE = 768;
/** Pin colour and letter per feature kind, shared by the phone map and the HUD minimap. */
const MARK: Partial<Record<MapFeature['kind'], [string, string]>> = { spawn: [PAPER, '★'], vending: [TEAL, 'V'], fountain: ['#86c3d5', 'W'], rack: ['#d5d0c4', 'R'], shop: [ORANGE, '$'], bench: ['#b8a07a', 'B'], ramp: ['#e2b87a', '▲'] };

/** The player's marker, pointing up: an arrow on the scooter, a board on the longboard, a dot and view cone on foot. */
function rideMarker(g: CanvasRenderingContext2D, ride: MapRide, size: number) {
  g.lineJoin = 'round';
  g.lineWidth = size * 0.22;
  g.strokeStyle = INK;
  g.fillStyle = ORANGE;
  g.beginPath();
  if (ride === 'longboard') {
    const w = size * 0.42, l = size * 1.05;
    g.moveTo(0, -l); g.quadraticCurveTo(w, -l, w, -l * 0.55); g.lineTo(w, l * 0.55); g.quadraticCurveTo(w, l, 0, l);
    g.quadraticCurveTo(-w, l, -w, l * 0.55); g.lineTo(-w, -l * 0.55); g.quadraticCurveTo(-w, -l, 0, -l);
    g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, -l * 1.55); g.lineTo(w * 0.8, -l * 1.1); g.lineTo(-w * 0.8, -l * 1.1); g.closePath(); g.fillStyle = INK; g.fill();
  } else if (ride === 'foot') {
    g.moveTo(0, 0); g.arc(0, 0, size * 1.6, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath();
    g.fillStyle = '#ff7a2f55'; g.fill();
    g.beginPath(); g.arc(0, 0, size * 0.55, 0, Math.PI * 2); g.fillStyle = ORANGE; g.fill(); g.stroke();
  } else {
    g.moveTo(0, -size); g.lineTo(size * 0.72, size * 0.62); g.lineTo(0, size * 0.25); g.lineTo(-size * 0.72, size * 0.62); g.closePath();
    g.fill(); g.stroke();
  }
}

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
  reset() { this.photo = null; this.local = null; this.key = ''; this.follow = true; this.zoom = 2; }
  /** Retake the photo next time it is drawn (the map changed: build pieces placed). */
  invalidate() { this.photo = null; this.local = null; }

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
    const b = (this.bounds = this.area(this.source.features()));
    this.photo = this.shoot(b, SIZE);
    this.key = mapKey;
    return this.photo;
  }

  /**
   * Long maps (B Hill runs for over a kilometre) do not fit one photo, so where
   * the rider is out near its edge the minimap uses a smaller photo centred on
   * them instead, retaken after they have travelled a way from its centre.
   */
  private local: { photo: HTMLCanvasElement; b: { x: number; z: number; size: number }; key: string } | null = null;
  private miniPhoto(mapKey: string, span: number) {
    const main = this.capture(mapKey), b = this.bounds, p = this.source.player();
    const inside = Math.max(Math.abs(p.x - b.x), Math.abs(p.z - b.z)) + span * 0.75 <= b.size / 2;
    if (inside) return { photo: main, b };
    const l = this.local;
    if (l && l.key === mapKey && Math.max(Math.abs(p.x - l.b.x), Math.abs(p.z - l.b.z)) + span * 0.75 <= l.b.size / 2) return l;
    const nb = { x: p.x, z: p.z, size: Math.max(160, span * 3) };
    this.local = { photo: this.shoot(nb, LOCAL_SIZE), b: nb, key: mapKey };
    return this.local;
  }

  private shoot(b: { x: number; z: number; size: number }, res: number) {
    const { renderer, scene } = this.source;
    let photo: HTMLCanvasElement;
    const half = b.size / 2;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 900);
    cam.position.set(b.x, 400, b.z);
    cam.up.set(0, 0, -1);
    cam.lookAt(b.x, 0, b.z);
    cam.updateMatrixWorld();
    const target = new THREE.WebGLRenderTarget(res, res, { colorSpace: THREE.SRGBColorSpace });
    const restore = this.source.hide();
    const background = scene.background, previous = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    // The photo has no haze. The fog is pushed out of range rather than removed:
    // removing it recompiles every material's shader for a fogless variant,
    // which took 82 s under a software renderer and hitches on real GPUs.
    const fog = scene.fog, range = fog instanceof THREE.Fog ? [fog.near, fog.far] : fog instanceof THREE.FogExp2 ? [fog.density] : null;
    if (fog instanceof THREE.Fog) { fog.near = 1e6; fog.far = 2e6; }
    else if (fog instanceof THREE.FogExp2) fog.density = 0;
    scene.background = new THREE.Color(0xd8c9ad);
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0xd8c9ad, 1);
      renderer.clear();
      renderer.render(scene, cam);
      const pixels = new Uint8Array(res * res * 4);
      renderer.readRenderTargetPixels(target, 0, 0, res, res, pixels);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = res;
      const g = canvas.getContext('2d')!;
      const image = g.createImageData(res, res);
      // Render targets read bottom-up.
      for (let y = 0; y < res; y++) image.data.set(pixels.subarray((res - 1 - y) * res * 4, (res - y) * res * 4), y * res * 4);
      g.putImageData(image, 0, 0);
      // A printed-map finish: warm paper, a touch of contrast, a fine grid.
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = '#f4e6c8';
      g.fillRect(0, 0, res, res);
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = '#0b0c0d18';
      g.lineWidth = 1;
      const step = res / (b.size / 10);
      for (let x = 0; x < res; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, res); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(res, x); g.stroke(); }
      photo = canvas;
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clear, alpha);
      if (fog instanceof THREE.Fog && range) { fog.near = range[0]; fog.far = range[1]; }
      else if (fog instanceof THREE.FogExp2 && range) fog.density = range[0];
      scene.background = background;
      restore();
      target.dispose();
    }
    return photo;
  }

  /**
   * The HUD minimap: the same photo and features as the MAP app, in a circle
   * centred on the rider and turned so the camera's view points up, with a
   * compass ring. `span` is the width shown in metres.
   */
  drawMini(g: CanvasRenderingContext2D, cx: number, cy: number, radius: number, mapKey: string, viewYaw: number, ride: MapRide, span = 72) {
    const { photo, b } = this.miniPhoto(mapKey, span), p = this.source.player();
    const scale = (radius * 2) / span, k = photo.width / b.size;
    const cos = Math.cos(viewYaw), sin = Math.sin(viewYaw);
    // World offset -> screen: the view direction (sin v, cos v) is up and the
    // camera's right, (-cos v, sin v), is right.
    const toScreen = (wx: number, wz: number) => {
      const dx = wx - p.x, dz = wz - p.z;
      return { sx: cx + (-cos * dx + sin * dz) * scale, sy: cy - (sin * dx + cos * dz) * scale };
    };
    g.save();
    g.beginPath(); g.arc(cx, cy, radius, 0, Math.PI * 2); g.closePath();
    g.fillStyle = '#d8c9ad'; g.fill();
    g.clip();
    g.save();
    g.translate(cx, cy);
    const s = scale / k;
    g.transform(-cos * s, -sin * s, sin * s, -cos * s, 0, 0);
    g.drawImage(photo, -(p.x - (b.x - b.size / 2)) * k, -(p.z - (b.z - b.size / 2)) * k);
    g.restore();
    const features = this.source.features();
    g.lineCap = 'round';
    for (const f of features) {
      if (f.kind !== 'rail' || f.x2 === undefined || f.z2 === undefined) continue;
      const a = toScreen(f.x, f.z), c = toScreen(f.x2, f.z2);
      g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(c.sx, c.sy); g.stroke();
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 1; g.stroke();
    }
    const pin = radius * 0.075;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // Pins of one kind that would overlap merge into one, with a count (a shop's
    // shelves, a row of vending machines), so the circle stays readable.
    const pins: { kind: MapFeature['kind']; sx: number; sy: number; n: number }[] = [];
    for (const f of features) {
      if (!MARK[f.kind] || f.kind === 'bench' || f.kind === 'spawn') continue;
      const { sx, sy } = toScreen(f.x, f.z);
      if (Math.hypot(sx - cx, sy - cy) > radius - pin) continue;
      const near = pins.find((q) => q.kind === f.kind && Math.hypot(q.sx - sx, q.sy - sy) < pin * 2.2);
      if (near) { near.sx = (near.sx * near.n + sx) / (near.n + 1); near.sy = (near.sy * near.n + sy) / (near.n + 1); near.n++; }
      else pins.push({ kind: f.kind, sx, sy, n: 1 });
    }
    for (const { kind, sx, sy, n } of pins) {
      const m = MARK[kind]!;
      g.beginPath(); g.arc(sx, sy, pin, 0, Math.PI * 2); g.fillStyle = m[0]; g.fill(); g.lineWidth = pin * 0.3; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.font = `${Math.round(pin * 1.15)}px ${DISPLAY}`; g.fillText(m[1], sx, sy + 0.5);
      if (n > 1) {
        const bx = sx + pin * 0.85, by = sy - pin * 0.85, br = pin * 0.62;
        g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fillStyle = PAPER; g.fill(); g.lineWidth = pin * 0.2; g.strokeStyle = INK; g.stroke();
        g.fillStyle = INK; g.font = `${Math.round(br * 1.3)}px ${DISPLAY}`; g.fillText(String(n), bx, by + 0.5);
      }
    }
    // Friends: a lime dot, pinned to the rim when out of range.
    for (const f of features) {
      if (f.kind !== 'friend') continue;
      let { sx, sy } = toScreen(f.x, f.z);
      const d = Math.hypot(sx - cx, sy - cy), edge = radius - pin;
      if (d > edge) { sx = cx + ((sx - cx) / d) * edge; sy = cy + ((sy - cy) / d) * edge; }
      g.beginPath(); g.arc(sx, sy, pin * 0.85, 0, Math.PI * 2); g.fillStyle = LIME; g.fill(); g.lineWidth = pin * 0.3; g.strokeStyle = INK; g.stroke();
    }
    g.restore();
    // The rider, turned from the view direction to their heading.
    g.save(); g.translate(cx, cy);
    g.beginPath(); g.arc(0, 0, radius * 0.2, 0, Math.PI * 2); g.fillStyle = '#fff6e6cc'; g.fill();
    g.rotate(viewYaw - p.yaw); rideMarker(g, ride, radius * 0.14); g.restore();
    // Compass ring: N/E/S/W where they lie from the camera.
    g.beginPath(); g.arc(cx, cy, radius, 0, Math.PI * 2); g.lineWidth = radius * 0.06; g.strokeStyle = INK; g.stroke();
    g.font = `${Math.round(radius * 0.16)}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [letter, wx, wz] of [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]] as const) {
      const sx = -cos * wx + sin * wz, sy = -(sin * wx + cos * wz), r = radius * 0.99;
      const x = cx + sx * r, y = cy + sy * r;
      g.beginPath(); g.arc(x, y, radius * 0.12, 0, Math.PI * 2); g.fillStyle = letter === 'N' ? ORANGE : PAPER; g.fill(); g.lineWidth = radius * 0.035; g.stroke();
      g.fillStyle = INK; g.fillText(letter, x, y + 1);
    }
    g.textBaseline = 'alphabetic';
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
    const main = this.capture(mapKey), p = this.source.player();
    // Following the rider out past the edge of a long map's photo, use the
    // rider-centred one the minimap uses (see miniPhoto).
    const { photo, b } = this.follow ? this.miniPhoto(mapKey, this.bounds.size / this.zoom) : { photo: main, b: this.bounds };
    if (this.follow) this.centre.set(p.x, p.z);
    const span = b.size / this.zoom, scale = w / span;
    const half = span / 2;
    // Keep the view over the photo.
    const cx = THREE.MathUtils.clamp(this.centre.x, b.x - b.size / 2 + half, b.x + b.size / 2 - half);
    const cz = THREE.MathUtils.clamp(this.centre.y, b.z - b.size / 2 + (half * h) / w, b.z + b.size / 2 - (half * h) / w);
    const toScreen = (wx: number, wz: number) => ({ sx: x + w / 2 + (wx - cx) * scale, sy: y + h / 2 + (wz - cz) * scale });
    g.fillStyle = '#d8c9ad';
    g.fillRect(x, y, w, h);
    const px = photo.width / b.size;
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
    for (const f of features) {
      const s = MARK[f.kind];
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
    // Forward is (sin yaw, cos yaw) in x/z and the map's y axis is +z, so the
    // up-pointing marker turns by pi - yaw.
    g.rotate(Math.PI - p.yaw);
    rideMarker(g, p.ride ?? 'scooter', 12);
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
