import * as THREE from "three";
import { terrainHeight, terrainSurface } from "./park";
import { TUNE } from "../core/config";

/**
 * Wheel tracks (#46): short marks pressed into a lawn, a ballfield's infield
 * sand, or fresh snow behind the wheels, fading after LIFE seconds. The
 * scooter's two wheels run in line and leave one track; the longboard's
 * trucks leave two. All marks share one pooled instanced mesh (the oldest
 * mark is reused first), so a long session never grows the scene.
 */
const MAX = 900, LIFE = 45, FADE = 12, STEP = 0.3;
const TINT = { grass: new THREE.Color(0x4a6431), sand: new THREE.Color(0x94734c), snow: new THREE.Color(0xaab6c4) };
export type TrackGround = keyof typeof TINT;

export interface TrackRider {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  yaw: number;
  grounded: boolean;
  walking: boolean;
  rideable: "scooter" | "longboard";
  /** On foot: running strides are longer. */
  running?: boolean;
  /** In the lake: no prints. */
  swim?: unknown;
  state?: string;
}

export class WheelTracks {
  readonly mesh: THREE.InstancedMesh;
  /** Shoe prints on foot (#61), in the same scene and on the same clock. */
  readonly feet: FootPrints;
  private born = new Float32Array(MAX).fill(-1e9);
  private place: { mid: THREE.Vector3; turn: THREE.Quaternion; width: number; length: number }[] = [];
  private slot = 0;
  private time = 0;
  private fadeClock = 0;
  private last: THREE.Vector3 | null = null;
  private matrix = new THREE.Matrix4();
  private scale = new THREE.Vector3();
  private basis = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
  private up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -60 });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX);
    this.mesh.name = "Wheel tracks";
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    for (let i = 0; i < MAX; i++) this.place.push({ mid: new THREE.Vector3(), turn: new THREE.Quaternion(), width: 0, length: 0 });
    scene.add(this.mesh);
    this.feet = new FootPrints(scene);
  }

  /** What the wheels are pressing into here, if anything: snow over everything once it has settled. */
  static ground(rider: TrackRider, snow: number): TrackGround | null {
    if (!rider.grounded || rider.walking || rider.normal.y < 0.9) return null;
    if (snow > 0.3) return "snow";
    // The ground under the wheels, not a ramp over it: the rider's centre rides a wheel radius above it.
    const ground = terrainHeight(rider.position.x, rider.position.z);
    if (ground >= TUNE.groundSurfaceHeight || rider.position.y - ground > TUNE.radius + TUNE.groundSurfaceHeight) return null;
    const surface = terrainSurface(rider.position.x, rider.position.z);
    return surface === "grass" || surface === "sand" ? surface : null;
  }

  /** Lays marks behind the wheels while they roll through something soft; fades old ones. */
  update(dt: number, rider: TrackRider, snow: number, wet = 0) {
    this.time += dt;
    this.feet.update(dt, rider, snow, wet);
    const ground = WheelTracks.ground(rider, snow), at = rider.position;
    if (!ground) this.last = null;
    else if (!this.last) this.last = at.clone();
    else if (at.distanceTo(this.last) > 2) this.last.copy(at); // a respawn or teleport, not a roll
    else if (at.distanceTo(this.last) >= STEP) {
      const lines = rider.rideable === "longboard" ? [-0.11, 0.11] : [0];
      const along = this.basis.z.subVectors(at, this.last).normalize();
      const side = this.basis.x.crossVectors(this.up, along).normalize();
      for (const offset of lines) this.stamp(this.last, at, side, offset, rider.rideable === "longboard" ? 0.06 : 0.055, ground);
      this.last.copy(at);
    }
    // Fading marks narrow away; checked a few times a second.
    this.fadeClock -= dt;
    if (this.fadeClock <= 0) {
      this.fadeClock = 0.25;
      let changed = false;
      for (let i = 0; i < this.mesh.count; i++) {
        const age = this.time - this.born[i];
        if (age < LIFE - FADE) continue;
        this.write(i, Math.max(0, (LIFE - age) / FADE));
        changed = true;
      }
      if (changed) this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private stamp(from: THREE.Vector3, to: THREE.Vector3, side: THREE.Vector3, offset: number, width: number, ground: TrackGround) {
    const i = this.slot, p = this.place[i];
    this.slot = (this.slot + 1) % MAX;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    const along = this.basis.z.subVectors(to, from), length = along.length();
    along.normalize();
    const normal = this.basis.y.crossVectors(along, side).normalize();
    p.mid.addVectors(from, to).multiplyScalar(0.5).addScaledVector(side, offset).addScaledVector(normal, 0.012);
    p.turn.setFromRotationMatrix(this.matrix.makeBasis(side, normal, along));
    p.width = width; p.length = length + 0.02;
    this.born[i] = this.time;
    this.write(i, 1);
    this.mesh.setColorAt(i, TINT[ground]);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private write(i: number, fade: number) {
    const p = this.place[i];
    this.mesh.setMatrixAt(i, this.matrix.compose(p.mid, p.turn, this.scale.set(p.width * fade, 1, p.length * (fade > 0 ? 1 : 0))));
  }

  /** Marks currently laid (tests). */
  get marks() {
    let n = 0;
    for (let i = 0; i < this.mesh.count; i++) if (this.time - this.born[i] < LIFE) n++;
    return n;
  }
}

// ---- Footprints (#61) ------------------------------------------------------------
/** Where a shoe leaves a print: snow, sand, mud (wet dirt or sand), and wet pavement in the rain. */
const PRINT_TINT = {
  snow: new THREE.Color(0x8e9db2), sand: new THREE.Color(0x8a6b47), mud: new THREE.Color(0x3f3326), wet: new THREE.Color(0x1f2427),
};
export type PrintGround = keyof typeof PRINT_TINT;
/** Seconds a print lasts: wet shoes dry off the pavement quickly; snow and mud hold them. */
const PRINT_LIFE: Record<PrintGround, number> = { snow: 60, sand: 45, mud: 60, wet: 14 };
const PRINT_OPACITY: Record<PrintGround, number> = { snow: 1, sand: 0.9, mud: 1, wet: 0.55 };
const PRINTS = 360, PRINT_FADE = 8;

/** A sole with a heel, an arch and tread bars, drawn once into an alpha map. */
function soleTexture() {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas"); c.width = 64; c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000"; g.fillRect(0, 0, 64, 160);
  const sole = new Path2D();
  // Toe at the top (the print's forward direction), heel at the bottom; the arch is on the inside (x < 32).
  sole.moveTo(30, 6); sole.bezierCurveTo(48, 4, 58, 22, 57, 46); sole.bezierCurveTo(56, 70, 50, 86, 46, 100);
  sole.bezierCurveTo(44, 112, 50, 130, 46, 146); sole.bezierCurveTo(42, 158, 18, 158, 15, 146);
  sole.bezierCurveTo(12, 132, 19, 116, 20, 100); sole.bezierCurveTo(20, 88, 8, 72, 7, 48); sole.bezierCurveTo(6, 22, 14, 8, 30, 6);
  g.save(); g.clip(sole);
  g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, 64, 160);
  // Tread: bars across the forefoot and the heel, deeper (brighter) than the sole between them.
  g.fillStyle = "#fff";
  for (let y = 12; y < 96; y += 9) g.fillRect(0, y, 64, 5);
  for (let y = 112; y < 156; y += 9) g.fillRect(0, y, 64, 5);
  g.restore();
  // A soft rim so the print sits in the ground rather than on it.
  g.globalCompositeOperation = "lighter"; g.strokeStyle = "rgba(90,90,90,0.8)"; g.lineWidth = 3; g.stroke(sole);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.NoColorSpace; texture.anisotropy = 4;
  return texture;
}

/**
 * Shoe prints: a rider on foot presses alternating left and right prints into
 * snow, sand and mud, and leaves wet prints on pavement in the rain. Prints
 * follow the stride (longer when running), turn with the heading, and fade
 * away; they share one pooled instanced mesh like the wheel tracks.
 */
export class FootPrints {
  readonly mesh: THREE.InstancedMesh;
  private born = new Float32Array(PRINTS).fill(-1e9);
  private life = new Float32Array(PRINTS).fill(1);
  private place: { at: THREE.Vector3; turn: THREE.Quaternion; mirror: number }[] = [];
  private slot = 0;
  private time = 0;
  private fadeClock = 0;
  private last: THREE.Vector3 | null = null;
  private left = false;
  private matrix = new THREE.Matrix4();
  private scale = new THREE.Vector3();
  private color = new THREE.Color();
  private yawTurn = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  constructor(scene: THREE.Scene) {
    // A US men's 9 is about 28 cm long and 10 cm wide.
    const geometry = new THREE.PlaneGeometry(0.105, 0.28).rotateX(-Math.PI / 2);
    const alphaMap = soleTexture();
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, transparent: true, alphaMap, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -60 });
    this.mesh = new THREE.InstancedMesh(geometry, material, PRINTS);
    this.mesh.name = "Footprints";
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PRINTS * 3), 3);
    for (let i = 0; i < PRINTS; i++) this.place.push({ at: new THREE.Vector3(), turn: new THREE.Quaternion(), mirror: 1 });
    scene.add(this.mesh);
  }

  /** What a shoe presses into here, if anything. */
  static ground(rider: TrackRider, snow: number, wet: number): PrintGround | null {
    if (!rider.walking || !rider.grounded || rider.swim || rider.state === "Bail" || rider.normal.y < 0.85) return null;
    if (snow > 0.3) return "snow";
    const low = terrainHeight(rider.position.x, rider.position.z) < TUNE.groundSurfaceHeight;
    const surface = low ? terrainSurface(rider.position.x, rider.position.z) : "road";
    if (surface === "sand" || surface === "dirt") return wet > 0.35 ? "mud" : surface === "sand" ? "sand" : null;
    return wet > 0.45 ? "wet" : null;
  }

  update(dt: number, rider: TrackRider, snow: number, wet: number) {
    this.time += dt;
    const ground = FootPrints.ground(rider, snow, wet), at = rider.position;
    // A walking step is about 0.7 m, a running one about 1.1 m; one print per step.
    const step = rider.running ? 1.05 : 0.68;
    if (!ground) this.last = null;
    else if (!this.last) this.last = at.clone();
    else if (at.distanceTo(this.last) > 3) this.last.copy(at);
    else if (at.distanceTo(this.last) >= step) {
      const dx = at.x - this.last.x, dz = at.z - this.last.z, heading = Math.atan2(-dx, -dz);
      this.left = !this.left;
      this.print(at, heading, this.left, ground, rider.normal);
      this.last.copy(at);
    }
    this.fadeClock -= dt;
    if (this.fadeClock <= 0) {
      this.fadeClock = 0.25;
      let changed = false;
      for (let i = 0; i < this.mesh.count; i++) {
        const age = this.time - this.born[i], life = this.life[i];
        if (age < life - PRINT_FADE) continue;
        this.write(i, Math.max(0, (life - age) / PRINT_FADE));
        changed = true;
      }
      if (changed) this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private print(at: THREE.Vector3, heading: number, left: boolean, ground: PrintGround, normal: THREE.Vector3) {
    const i = this.slot, p = this.place[i];
    this.slot = (this.slot + 1) % PRINTS;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    // Feet land about 9 cm either side of the line of travel, toes turned out a touch.
    const side = left ? -1 : 1, splay = side * 0.08;
    p.at.set(at.x + Math.cos(heading) * 0.09 * side, at.y + 0.012, at.z - Math.sin(heading) * 0.09 * side);
    p.turn.setFromUnitVectors(this.up, normal).multiply(this.yawTurn.setFromAxisAngle(this.up, heading + splay));
    p.mirror = left ? -1 : 1;
    this.born[i] = this.time;
    this.life[i] = PRINT_LIFE[ground];
    this.write(i, 1);
    // Opacity rides in the colour: a faint print is a colour close to the ground's own.
    this.color.copy(PRINT_TINT[ground]).multiplyScalar(PRINT_OPACITY[ground]);
    this.mesh.setColorAt(i, this.color);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private write(i: number, fade: number) {
    const p = this.place[i], s = fade > 0 ? 0.55 + 0.45 * fade : 0;
    this.mesh.setMatrixAt(i, this.matrix.compose(p.at, p.turn, this.scale.set(p.mirror * s, 1, s)));
  }

  /** Prints currently on the ground (tests). */
  get marks() {
    let n = 0;
    for (let i = 0; i < this.mesh.count; i++) if (this.time - this.born[i] < this.life[i]) n++;
    return n;
  }
}
