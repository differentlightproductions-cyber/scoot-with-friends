import type { MapRide, PhoneMap } from '../phone/map';

/**
 * The riding HUD's top-left minimap: the phone MAP app's overhead photo and
 * features (one source of truth), drawn in a circle that turns with the
 * camera, with a compass ring and the rider's marker for their ride. Redrawn
 * a dozen times a second; hidden whenever a menu, the phone or a loading
 * screen owns the screen.
 */
export class Minimap {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private wait = 0;
  private shown = false;

  constructor(parent: HTMLElement, private map: PhoneMap) {
    this.root = document.createElement('div');
    this.root.id = 'minimap';
    this.root.hidden = true;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.root.append(this.canvas);
    parent.append(this.root);
    this.g = this.canvas.getContext('2d')!;
  }

  /**
   * `viewYaw` is the camera's look direction (atan2 of its x/z); `mapKey`
   * changes when a new map loads, which retakes the photo.
   */
  update(dt: number, visible: boolean, mapKey: string, viewYaw: number, ride: MapRide) {
    if (visible !== this.shown) { this.shown = visible; this.root.hidden = !visible; this.wait = 0; }
    if (!visible) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 1 / 12;
    const css = this.root.clientWidth || 150, ratio = Math.min(2, window.devicePixelRatio || 1), px = Math.round(css * ratio);
    if (this.canvas.width !== px) { this.canvas.width = this.canvas.height = px; }
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    const radius = px / 2 - px * 0.07;
    this.map.drawMini(g, px / 2, px / 2, radius, mapKey, viewYaw, ride);
  }
}
