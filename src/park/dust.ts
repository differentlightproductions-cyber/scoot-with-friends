// Desert wind (#74): Boulder City's dust devils and windy days. A dust devil
// is a spinning column of sand that wanders across open desert or the
// ballfield on hot, calm afternoons, leaning with the breeze, dense at its
// skirt and thinning to nothing up high. On a windy day low streamers of sand
// race across the ground. Visual only (no collision), a few hundred points each.
import * as THREE from "three";
import type { Fidelity } from "../render/fidelity";
import { lightParticles } from "../art/particle-light";

const TAU = Math.PI * 2;
export interface DesertWindState {
  /** Where the rider is. */
  player: THREE.Vector3;
  /** Wind near the ground (m/s, the direction it blows toward). */
  wind: THREE.Vector3;
  /** Blowing dust 0..1. */
  dust: number;
  /** How likely dust devils are 0..1 (live conditions, or a little on sunny days). */
  devils: number;
  quality: Fidelity;
}
interface Devil { points: THREE.Points; centre: THREE.Vector3; height: number; base: number; top: number; spin: number; age: number; life: number; wander: number; u: Float32Array; angle: Float32Array; jitter: Float32Array; skirt: Uint8Array }

function softDisc() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,.9)"); r.addColorStop(0.5, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Sand-coloured soft points with a per-point alpha (aAlpha). */
function dustMaterial(map: THREE.Texture, size: number, color: number) {
  const m = new THREE.PointsMaterial({ color, size, map, transparent: true, depthWrite: false, alphaTest: 0.01 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("uniform float size;", "uniform float size;\nattribute float aAlpha;\nvarying float vDustAlpha;").replace("gl_PointSize = size;", "gl_PointSize = size;\n\tvDustAlpha = aAlpha * smoothstep(0.5, 2.0, -mvPosition.z);");
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", "varying float vDustAlpha;\nvoid main() {").replace("#include <alphatest_fragment>", "diffuseColor.a *= vDustAlpha;\n#include <alphatest_fragment>");
  };
  m.customProgramCacheKey = () => "swf-dust-v1";
  return lightParticles(m);
}

export class DesertWind {
  private group = new THREE.Group();
  private devils: Devil[] = [];
  private disc = softDisc();
  private material = dustMaterial(this.disc, 1.4, 0xb89a74);
  private streamMaterial = dustMaterial(this.disc, 0.5, 0xd2b893);
  private streamers?: THREE.Points;
  private streamPhase = new Float32Array(0);
  private next = 20 + Math.random() * 40;
  private time = 0;
  /** Dust devils on the map now (tests). */
  get count() { return this.devils.length; }
  /** The devils' centres and heights (tests). */
  get columns() { return this.devils.map((d) => ({ centre: d.centre.clone(), height: d.height, age: d.age, life: d.life })); }

  /**
   * `ground` gives the height at a point; `open` says whether a dust devil can
   * run there (open desert, the ballfield, a B Hill lot: not the lawns or the
   * skatepark's concrete).
   */
  constructor(private scene: THREE.Scene, private ground: (x: number, z: number) => number, private open: (x: number, z: number) => boolean) {
    this.group.name = "Desert wind";
    scene.add(this.group);
  }

  update(dt: number, state: DesertWindState) {
    const d = Math.min(dt, 0.05);
    this.time += d;
    // A new devil every minute or two when conditions are right; at most two at once.
    this.next -= d * state.devils;
    if (this.next <= 0) { this.next = 45 + Math.random() * 75; if (this.devils.length < 2) this.spawn(state); }
    for (const devil of this.devils) this.stepDevil(devil, d, state);
    for (const gone of this.devils.filter((v) => v.age >= v.life)) { gone.points.removeFromParent(); gone.points.geometry.dispose(); }
    this.devils = this.devils.filter((v) => v.age < v.life);
    this.stepStreamers(d, state);
  }

  /** Starts a devil 30-110 m from the rider on open ground, if there is any. */
  spawn(state: DesertWindState, at?: THREE.Vector3) {
    let centre = at?.clone() ?? null;
    for (let i = 0; !centre && i < 24; i++) {
      const a = Math.random() * TAU, r = 30 + Math.random() * 80, x = state.player.x + Math.cos(a) * r, z = state.player.z + Math.sin(a) * r;
      if (this.open(x, z)) centre = new THREE.Vector3(x, this.ground(x, z), z);
    }
    if (!centre) return null;
    const count = state.quality === "low" ? 220 : state.quality === "medium" ? 420 : 700;
    const positions = new Float32Array(count * 3), alpha = new Float32Array(count), u = new Float32Array(count), angle = new Float32Array(count), jitter = new Float32Array(count), skirt = new Uint8Array(count);
    for (let i = 0; i < count; i++) { u[i] = Math.random(); angle[i] = Math.random() * TAU; jitter[i] = 0.7 + Math.random() * 0.6; skirt[i] = Math.random() < 0.3 ? 1 : 0; if (skirt[i]) u[i] *= 0.08; }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    const points = new THREE.Points(geometry, this.material);
    points.frustumCulled = false; points.renderOrder = 2; points.name = "Dust devil";
    this.group.add(points);
    const devil: Devil = { points, centre, height: 9 + Math.random() * 14, base: 0.5 + Math.random() * 0.5, top: 2 + Math.random() * 2.5, spin: 7 + Math.random() * 4, age: 0, life: 25 + Math.random() * 40, wander: Math.random() * TAU, u, angle, jitter, skirt };
    this.devils.push(devil);
    return devil;
  }

  private stepDevil(v: Devil, dt: number, state: DesertWindState) {
    v.age += dt;
    // It drifts with the breeze and wanders; it dies out if it leaves open ground.
    v.wander += dt * 0.35;
    const drift = state.wind.clone().multiplyScalar(0.7).add(new THREE.Vector3(Math.cos(v.wander), 0, Math.sin(v.wander * 0.8)).multiplyScalar(1.4));
    v.centre.addScaledVector(drift, dt);
    v.centre.y = this.ground(v.centre.x, v.centre.z);
    if (!this.open(v.centre.x, v.centre.z) && v.life - v.age > 5) v.life = v.age + 5;
    const fade = Math.min(1, v.age / 4, (v.life - v.age) / 5);
    const pos = v.points.geometry.getAttribute("position") as THREE.BufferAttribute, alpha = v.points.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const lean = state.wind.clone().multiplyScalar(0.18 * v.height / Math.max(1, state.wind.length() + 3));
    for (let i = 0; i < v.u.length; i++) {
      // Sand rises up the column and spins faster where it is narrow; the skirt churns at the foot.
      const riseSpeed = v.skirt[i] ? 0.4 : 2.6 + v.jitter[i];
      v.u[i] += (riseSpeed / v.height) * dt;
      if (v.u[i] > (v.skirt[i] ? 0.08 : 1)) { v.u[i] = 0; v.angle[i] = Math.random() * TAU; }
      const u = v.u[i], r = (v.base + (v.top - v.base) * Math.pow(u, 1.6)) * v.jitter[i] * (v.skirt[i] ? 1.9 : 1);
      v.angle[i] += (v.spin / Math.max(0.4, r)) * dt;
      const h = u * v.height;
      pos.setXYZ(i, v.centre.x + Math.cos(v.angle[i]) * r + lean.x * u * u, v.centre.y + h + (v.skirt[i] ? 0.3 : 0), v.centre.z + Math.sin(v.angle[i]) * r + lean.z * u * u);
      alpha.setX(i, fade * (v.skirt[i] ? 0.7 : 0.6 * Math.pow(1 - u, 1.2)) * THREE.MathUtils.smoothstep(u, 0, 0.03 + (v.skirt[i] ? 0 : 0.02)));
    }
    pos.needsUpdate = true; alpha.needsUpdate = true;
  }

  /** Low streamers of sand racing across the ground on a windy day, around the rider. */
  private stepStreamers(dt: number, state: DesertWindState) {
    if (state.dust <= 0.01) { if (this.streamers) this.streamers.visible = false; return; }
    const count = state.quality === "low" ? 180 : state.quality === "medium" ? 360 : 700;
    if (!this.streamers || this.streamPhase.length !== count) {
      if (this.streamers) { this.streamers.removeFromParent(); this.streamers.geometry.dispose(); }
      const geometry = new THREE.BufferGeometry(), positions = new Float32Array(count * 3);
      this.streamPhase = new Float32Array(count);
      for (let i = 0; i < count; i++) { positions.set([state.player.x + (Math.random() - 0.5) * 50, 0, state.player.z + (Math.random() - 0.5) * 50], i * 3); this.streamPhase[i] = Math.random() * TAU; }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); geometry.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(count), 1));
      this.streamers = new THREE.Points(geometry, this.streamMaterial);
      this.streamers.frustumCulled = false; this.streamers.renderOrder = 2; this.streamers.name = "Blowing dust";
      this.group.add(this.streamers);
    }
    this.streamers.visible = true;
    const pos = this.streamers.geometry.getAttribute("position") as THREE.BufferAttribute, alpha = this.streamers.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const speed = Math.max(2, state.wind.length() * 1.3), dir = state.wind.lengthSq() > 1e-4 ? state.wind.clone().normalize() : new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + dir.x * speed * dt * (0.8 + (i % 5) * 0.1), z = pos.getZ(i) + dir.z * speed * dt * (0.8 + (i % 5) * 0.1);
      // Wrap within 25 m of the rider so there is always dust around them.
      const dx = x - state.player.x, dz = z - state.player.z;
      if (Math.abs(dx) > 25) x -= Math.sign(dx) * 50;
      if (Math.abs(dz) > 25) z -= Math.sign(dz) * 50;
      const hop = Math.abs(Math.sin(this.time * 2.3 + this.streamPhase[i])) * (0.2 + (i % 7) * 0.12);
      pos.setXYZ(i, x, this.ground(x, z) + 0.05 + hop, z);
      alpha.setX(i, state.dust * (0.25 + 0.2 * Math.sin(this.time * 1.7 + this.streamPhase[i] * 3)));
    }
    pos.needsUpdate = true; alpha.needsUpdate = true;
  }

  dispose() {
    for (const v of this.devils) v.points.geometry.dispose();
    if (this.streamers) this.streamers.geometry.dispose();
    this.material.dispose(); this.streamMaterial.dispose(); this.disc.dispose();
    this.group.removeFromParent();
  }
}
