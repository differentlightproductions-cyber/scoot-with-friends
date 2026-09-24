import * as THREE from "three";
import { terrainSurface } from "./park";
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
}

export class WheelTracks {
  readonly mesh: THREE.InstancedMesh;
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
  }

  /** What the wheels are pressing into here, if anything: snow over everything once it has settled. */
  static ground(rider: TrackRider, snow: number): TrackGround | null {
    if (!rider.grounded || rider.walking || rider.normal.y < 0.9) return null;
    if (snow > 0.3) return "snow";
    if (rider.position.y >= TUNE.groundSurfaceHeight) return null;
    const surface = terrainSurface(rider.position.x, rider.position.z);
    return surface === "grass" || surface === "sand" ? surface : null;
  }

  /** Lays marks behind the wheels while they roll through something soft; fades old ones. */
  update(dt: number, rider: TrackRider, snow: number) {
    this.time += dt;
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
