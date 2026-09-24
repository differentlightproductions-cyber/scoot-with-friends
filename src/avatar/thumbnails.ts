import * as THREE from 'three';
import { SKIN_TONES, swatchHex, type AvatarConfig } from './config';
import { FACE_SIZE, FACE_SPAN, faceLayout, faceX, faceY, paintFace, type FacePart } from './face';
import { standingAvatar } from './standing';

/**
 * Creator thumbnails (docs/AVATAR-DESIGN.md §11): every tile shows the item on
 * the rider being edited, in their own colours. Face features are cropped from
 * a painted face (instant); 3D items are rendered one per frame on a small
 * off-screen renderer that exists only while the creator is open.
 */
export type ThumbView = 'head' | 'hair' | 'torso' | 'legs' | 'feet' | 'body' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'beard';

const SIZE = 176;
/** Face crops: centre height (metres from the head centre) and width of the crop. */
const FACE_CROPS: Record<string, (L: ReturnType<typeof faceLayout>) => { y: number; width: number }> = {
  eyes: L => ({ y: L.eyeY, width: 2 * L.eyeX + 0.085 }),
  brows: L => ({ y: L.browY - 0.004, width: 2 * L.browX + 0.075 }),
  nose: () => ({ y: -0.03, width: 0.1 }),
  mouth: () => ({ y: -0.078, width: 0.13 }),
  beard: L => ({ y: L.mouthY + 0.01, width: 0.3 }),
};
/** 3D framings: what the camera looks at, where from, how far. */
const FRAMES: Record<string, { target: (a: ReturnType<typeof standingAvatar>['avatar']) => THREE.Vector3; from: THREE.Vector3; distance: number }> = {
  head: { target: a => a.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.02, 0)), from: new THREE.Vector3(0.5, 0.12, 1), distance: 1.08 },
  hair: { target: a => a.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.05, 0)), from: new THREE.Vector3(0.95, 0.3, 0.8), distance: 1.12 },
  torso: { target: a => a.chest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.08, 0)), from: new THREE.Vector3(0.55, 0.08, 1), distance: 1.4 },
  legs: { target: () => new THREE.Vector3(0, 0.46, 0), from: new THREE.Vector3(0.55, 0.12, 1), distance: 2.15 },
  feet: { target: a => a.feet[1].getWorldPosition(new THREE.Vector3()).setY(0.05).add(new THREE.Vector3(0, 0, 0.05)), from: new THREE.Vector3(1, 0.55, 0.7), distance: 0.78 },
  body: { target: () => new THREE.Vector3(0, 0.88, 0), from: new THREE.Vector3(0.45, 0.06, 1), distance: 4.1 },
};

type Job = { key: string; config: AvatarConfig; view: ThumbView; done: ((url: string) => void)[] };

export class ThumbnailStudio {
  private cache = new Map<string, string>();
  private jobs = new Map<string, Job>();
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.02, 20);
  private frame = 0;
  private face: HTMLCanvasElement | null = null;

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6f6252, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(1.5, 2.5, 3);
    const rim = new THREE.DirectionalLight(0xbfe6ff, 1.4);
    rim.position.set(-2, 1.5, -2.5);
    this.scene.add(key, rim);
  }

  /** The cached image for a view of this rider, or null (it is queued and `ready` fires later). */
  get(config: AvatarConfig, view: ThumbView, ready: (url: string) => void): string | null {
    const key = view + JSON.stringify(config);
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (view in FACE_CROPS) {
      const url = this.faceCrop(config, view);
      this.remember(key, url);
      return url;
    }
    const job = this.jobs.get(key);
    if (job) job.done.push(ready);
    else this.jobs.set(key, { key, config: structuredClone(config), view, done: [ready] });
    if (!this.frame) this.frame = requestAnimationFrame(() => this.pump());
    return null;
  }

  /** Drops queued work (the tiles asking for it are gone). */
  cancel() { this.jobs.clear(); }

  /** Frees the renderer; the cache of finished images stays. */
  release() {
    this.cancel();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
  }

  private remember(key: string, url: string) {
    this.cache.set(key, url);
    if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value!);
  }

  private pump() {
    this.frame = 0;
    const start = performance.now();
    // A frame's budget: at least one thumbnail, more while it stays quick.
    while (this.jobs.size && performance.now() - start < 14) {
      const job = this.jobs.values().next().value!;
      this.jobs.delete(job.key);
      let url = '';
      try { url = this.render(job.config, job.view); } catch (error) { console.warn('thumbnail', error); }
      if (!url) continue;
      this.remember(job.key, url);
      for (const done of job.done) done(url);
    }
    if (this.jobs.size) this.frame = requestAnimationFrame(() => this.pump());
  }

  private render(config: AvatarConfig, view: ThumbView) {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(SIZE, SIZE, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.renderer.setClearColor(0x000000, 0);
    }
    const { rider, avatar } = standingAvatar(config, 'high', 0);
    this.scene.add(rider);
    const frame = FRAMES[view] ?? FRAMES.body, target = frame.target(avatar);
    this.camera.position.copy(target).addScaledVector(frame.from.clone().normalize(), frame.distance);
    this.camera.lookAt(target);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(rider);
    avatar.dispose();
    return url;
  }

  /** A face feature cropped from the painted face, on the rider's skin. */
  private faceCrop(config: AvatarConfig, view: ThumbView) {
    this.face ??= Object.assign(document.createElement('canvas'), { width: FACE_SIZE, height: FACE_SIZE });
    paintFace(this.face, config, false, view as FacePart);
    const L = faceLayout(config), crop = FACE_CROPS[view](L);
    const out = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
    const g = out.getContext('2d')!;
    const skin = new THREE.Color(swatchHex(SKIN_TONES, config.skinTone));
    const light = skin.clone().lerp(new THREE.Color(0xffffff), 0.22), glow = g.createRadialGradient(SIZE * 0.4, SIZE * 0.35, 4, SIZE / 2, SIZE / 2, SIZE * 0.75);
    glow.addColorStop(0, '#' + light.getHexString());
    glow.addColorStop(1, '#' + skin.getHexString());
    g.fillStyle = glow;
    g.fillRect(0, 0, SIZE, SIZE);
    const px = (crop.width / FACE_SPAN) * FACE_SIZE, cx = faceX(0), cy = faceY(crop.y);
    g.drawImage(this.face, cx - px / 2, cy - px / 2, px, px, 0, 0, SIZE, SIZE);
    return out.toDataURL('image/png');
  }
}
