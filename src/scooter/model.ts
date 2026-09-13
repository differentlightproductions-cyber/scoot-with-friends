import * as THREE from "three";
import { Simulation } from "../physics/simulation";
import { ScooterAssembly } from "./assembly";
import { RIDERS } from "../data/riders";
import type { LocalProfile } from "../data/loadout";
import { damp, TUNE } from "../core/config";
const materials = {
  deck: new THREE.MeshStandardMaterial({
    color: 0xe65330,
    metalness: 0.65,
    roughness: 0.35,
  }),
  steel: new THREE.MeshStandardMaterial({
    color: 0xb8cbc6,
    metalness: 0.75,
    roughness: 0.26,
  }),
  black: new THREE.MeshStandardMaterial({ color: 0x263333, roughness: 0.8 }),
  shirt: new THREE.MeshStandardMaterial({ color: 0xe6dfc6, roughness: 0.95 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x304b4d, roughness: 0.95 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc69470, roughness: 0.9 }),
  helmet: new THREE.MeshStandardMaterial({ color: 0xdf5434, roughness: 0.55 }),
};
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function box(
  parent: THREE.Object3D,
  size: THREE.Vector3,
  pos: THREE.Vector3,
  mat: THREE.Material,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  m.position.copy(pos);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function sphere(
  parent: THREE.Object3D,
  r: number,
  pos: THREE.Vector3,
  mat: THREE.Material,
  scale = v(1, 1, 1),
) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
  m.position.copy(pos);
  m.scale.copy(scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function rod(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  mat: THREE.Material,
) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), mat);
  parent.add(m);
  m.castShadow = true;
  poseRod(m, a, b);
  return m;
}
function poseRod(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.scale.y = a.distanceTo(b);
  m.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
}
export class RiderModel {
  assembly: ScooterAssembly;
  private materials = Object.fromEntries(
    Object.entries(materials).map(([key, value]) => [key, value.clone()]),
  ) as typeof materials;
  root = new THREE.Group();
  scooter = new THREE.Group();
  deckPivot = new THREE.Group();
  barPivot = new THREE.Group();
  rider = new THREE.Group();
  wheels: THREE.Mesh[] = [];
  torso: THREE.Mesh;
  head: THREE.Mesh;
  helmet: THREE.Mesh;
  hips: THREE.Mesh;
  upperArms: THREE.Mesh[] = [];
  forearms: THREE.Mesh[] = [];
  thighs: THREE.Mesh[] = [];
  shins: THREE.Mesh[] = [];
  shoes: THREE.Mesh[] = [];
  crouch = 0;
  wheelAngle = 0;
  carry = 0;
  pushFoot = v(0.055, 0.2, -0.19);
  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.root.add(this.scooter, this.rider);
    this.assembly = new ScooterAssembly(this.scooter);
    this.deckPivot = this.assembly.deckPivot;
    this.barPivot = this.assembly.barPivot;
    this.wheels = this.assembly.wheels;
    this.torso = box(
      this.rider,
      v(0.36, 0.45, 0.22),
      v(0, 1.13, -0.1),
      this.materials.shirt,
    );
    this.hips = box(
      this.rider,
      v(0.28, 0.15, 0.21),
      v(0, 0.88, -0.13),
      this.materials.pants,
    );
    this.head = sphere(
      this.rider,
      0.13,
      v(0, 1.49, -0.01),
      this.materials.skin,
      v(0.88, 1.12, 0.93),
    );
    this.helmet = sphere(
      this.rider,
      0.145,
      v(0, 1.57, -0.025),
      this.materials.helmet,
      v(1, 0.73, 1),
    );
    for (const sign of [-1, 1]) {
      this.upperArms.push(
        rod(
          this.rider,
          v(sign * 0.18, 1.3, 0),
          v(sign * 0.25, 1.13, 0.12),
          0.065,
          this.materials.shirt,
        ),
      );
      this.forearms.push(
        rod(
          this.rider,
          v(sign * 0.25, 1.13, 0.12),
          v(sign * 0.24, 1.01, 0.26),
          0.044,
          this.materials.skin,
        ),
      );
      this.thighs.push(
        rod(
          this.rider,
          v(sign * 0.095, 0.9, -0.1),
          v(sign * 0.1, 0.53, -0.02),
          0.079,
          this.materials.pants,
        ),
      );
      this.shins.push(
        rod(
          this.rider,
          v(sign * 0.1, 0.53, -0.02),
          v(sign * 0.08, 0.22, -0.1),
          0.058,
          this.materials.pants,
        ),
      );
      this.shoes.push(
        box(
          this.rider,
          v(0.095, 0.07, 0.21),
          v(sign * 0.07, 0.2, -0.12),
          this.materials.black,
        ),
      );
    }
  }

  applyProfile(profile: LocalProfile) {
    this.assembly.build(profile.scooter);
    this.deckPivot = this.assembly.deckPivot;
    this.barPivot = this.assembly.barPivot;
    this.wheels = this.assembly.wheels;
    const rider = RIDERS.find((r) => r.id === profile.riderId) ?? RIDERS[0];
    this.materials.skin.color.set(rider.skin);
    this.materials.shirt.color.set(rider.shirt);
    this.materials.pants.color.set(rider.pants);
    this.materials.helmet.color.set(rider.helmet);
    this.rider.scale.x = rider.width;
    this.helmet.scale.set(rider.headScale, 0.73 * rider.headScale, 1);
    this.root.userData.riderId = rider.id;
    this.root.userData.stance = profile.settings.stance;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1,
        front = profile.settings.stance === "regular" ? 0 : 1;
      const foot = v(sign * 0.055, 0.2, i === front ? 0.04 : -0.19),
        knee = v(sign * 0.13, 0.53, 0.04);
      this.shoes[i].position.copy(foot);
      poseRod(this.shins[i], knee, foot);
    }
  }
  update(s: Simulation, dt: number, alpha: number) {
    this.root.position.copy(s.previousPosition).lerp(s.position, alpha);
    this.root.position.y -= 0.22;
    this.root.rotation.set(
      0,
      s.previousYaw + (s.yaw - s.previousYaw) * alpha,
      0,
    );
    this.carry = damp(this.carry, s.walking && s.running ? 1 : 0, 8, dt);
    this.scooter.rotation.set(
      s.pitch * (1 - this.carry),
      0,
      s.roll * (1 - this.carry) + (this.carry * Math.PI) / 2,
    );
    this.scooter.position.x = damp(
      this.scooter.position.x,
      s.walking ? 0.48 : 0,
      14,
      dt,
    );
    this.scooter.position.z = this.carry * 0.12;
    this.rider.rotation.set(
      s.pitch * 0.65 - s.rampLean * TUNE.rampLeanAngle,
      0,
      s.roll * 0.9,
    );
    this.scooter.position.y = s.manual.active
      ? Math.sin(Math.abs(s.manual.pitch)) * 0.32
      : this.carry * 1.02;
    const bri = s.tricks.bri.angle,
      kickless = s.tricks.kickless.angle;
    this.scooter.rotation.x += bri;
    this.scooter.rotation.z +=
      Math.sin(bri / 2) * 0.65 + Math.sin(kickless) * 0.55;
    const pivot = v(0, 1.01, 0.26),
      rotated = pivot.clone().applyEuler(this.scooter.rotation);
    if (Math.abs(s.tricks.bri.velocity) > 0.1 || s.tricks.bri.mismatch > 0.02)
      this.scooter.position.add(pivot.sub(rotated));
    this.deckPivot.rotation.y = s.tricks.deck.angle + Math.sin(kickless) * 2.7;
    this.deckPivot.rotation.z = Math.sin(kickless) * 0.45;
    this.barPivot.rotation.y =
      s.tricks.bars.angle + (s.grounded ? -s.steer * 0.15 : 0);
    this.wheelAngle += (s.speed * dt) / 0.055;
    for (const w of this.wheels) w.rotation.x = this.wheelAngle;
    this.crouch = damp(
      this.crouch,
      s.charge * 0.3 +
        s.compression * 0.16 +
        (s.landTimer > 0 ? s.landTimer * 0.65 : 0) +
        (s.popTimer > 0 ? 0.1 : 0),
      16,
      dt,
    );
    const c = this.crouch,
      whip = Math.abs(s.tricks.deck.velocity) > 1;
    this.torso.position.set(
      0,
      1.13 - c - s.rampLean * 0.05,
      -0.1 + c * 0.3 - s.rampLean * 0.12,
    );
    this.torso.rotation.x = -0.15 - c * 0.5;
    const weight = s.airWeight.shift;
    const pose = s.tricks.visualPose,
      blend = s.tricks.poseBlend;
    if (pose === "Superman") {
      this.torso.rotation.x -= blend * 0.85;
      this.torso.position.z -= blend * 0.35;
    }
    if (pose === "Tuck No-hander") {
      this.torso.position.y -= blend * 0.2;
      this.scooter.position.y += blend * 0.2;
    }
    if (s.dropIn.phase) {
      this.torso.position.z += s.dropIn.lean * 0.25;
      this.hips.position.z -= 0.12;
    }
    this.torso.position.z += weight * TUNE.airWeightShiftStrength;
    this.torso.rotation.x += weight * 0.18;
    this.hips.position.set(0, 0.88 - c, -0.13 - c * 0.5);
    this.hips.position.z += weight * TUNE.airWeightShiftStrength * 0.65;
    this.head.position.set(0, 1.49 - c, -0.01 + c * 0.3);
    this.helmet.position.set(0, 1.57 - c, -0.025 + c * 0.3);
    this.head.position.z += weight * TUNE.airWeightShiftStrength;
    this.helmet.position.z += weight * TUNE.airWeightShiftStrength;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      const rear = s.tricks.stance === "regular" ? 1 : 0;
      const push =
        i === rear && s.pushTimer > 0 ? 1 - s.pushTimer / TUNE.pushCadence : -1;
      const foot = v(
        sign * (whip ? 0.22 : 0.055),
        0.2 + (whip ? 0.2 : 0),
        i !== rear ? 0.04 : -0.19,
      );
      if (push >= 0 && !s.walking) {
        // Lift forward, plant, drive backward, then recover over the deck.
        // The path and blend both reach zero velocity at the cadence boundaries.
        const ease = (t: number) => t * t * (3 - 2 * t);
        const keys = [
          v(0.055, 0.2, -0.19),
          v(0.2, 0.08, 0.2),
          v(0.2, 0.045, -0.65),
          v(0.16, 0.29, -0.49),
          v(0.055, 0.2, -0.19),
        ];
        const phase = push * 4,
          index = Math.min(3, Math.floor(phase));
        foot.copy(keys[index]).lerp(keys[index + 1], ease(phase - index));
        if (rear === 0) foot.x = -foot.x;
      }
      if (i === rear && !s.walking && !whip) {
        this.pushFoot.lerp(foot, 1 - Math.exp(-24 * dt));
        foot.copy(this.pushFoot);
      }
      if (pose === "One-footer" && i === rear) {
        foot.x = sign * 0.48;
        foot.y = 0.45;
        foot.z = -0.35;
      }
      if (!s.walking) {
        const target = foot.clone();
        if (pose === "Superman") target.set(sign * 0.16, 0.7, -1.05);
        if (pose === "No Foot") target.set(sign * 0.48, 0.45, -0.1);
        if (pose === "Can Can")
          target.set(s.tricks.poseSide * (0.5 + i * 0.14), 0.5, -0.15);
        foot.lerp(target, blend);
        const reversal = s.tricks.deck.reversals.at(-1);
        if (
          s.tricks.deck.reversalAge < 0.18 &&
          reversal?.side === (i === 0 ? "left" : "right")
        )
          foot.lerp(
            v(
              Math.sin(reversal.angle) * 0.35,
              0.35,
              Math.cos(reversal.angle) * 0.35,
            ),
            1 - s.tricks.deck.reversalAge / 0.18,
          );
      }
      this.shoes[i].position.copy(foot);
      if (s.walking) {
        const gait =
          Math.sin(s.elapsed * (s.running ? 13 : 9) + i * Math.PI) *
          Math.min(s.speed / TUNE.walkSpeed, 1);
        foot.set(
          sign * 0.12,
          0.045 + Math.max(0, gait) * (s.running ? 0.24 : 0.13),
          -0.1 + gait * (s.running ? 0.43 : 0.28),
        );
        this.shoes[i].position.copy(foot);
      }
      const knee = v(sign * 0.13, 0.53 - c * 0.55, 0.04 + c * 0.4);
      poseRod(this.thighs[i], v(sign * 0.1, 0.89 - c, -0.13 - c * 0.5), knee);
      poseRod(this.shins[i], knee, foot);
      const shoulder = v(
        sign * 0.19,
        1.3 - c,
        -0.07 + c * 0.3 + weight * TUNE.airWeightShiftStrength,
      );
      let hand = v(sign * 0.24, 1.01, 0.26);
      const elbow = v(sign * 0.28, 1.13 - c * 0.7, 0.04);
      if (s.walking) {
        hand.set(
          sign > 0 ? 0.45 : -0.23,
          sign > 0 ? 1.01 : 0.78,
          sign > 0 ? 0.26 : -0.03 + Math.sin(s.elapsed * 9) * 0.12,
        );
        elbow.set(sign * 0.29, 1.08, 0);
      }
      if (this.carry > 0.001) {
        const grip = i === 0 ? v(0, 1.01, 0.26) : v(0, 0.15, -0.24);
        grip.applyEuler(this.scooter.rotation).add(this.scooter.position);
        hand.lerp(grip, this.carry);
        elbow.lerp(v(sign * 0.32, 1.13, 0.06), this.carry);
      }
      if (s.tricks.fingerTime > 0 && sign === s.tricks.fingerHand) {
        hand.set(sign * 0.16, 0.3, -0.06);
        elbow.set(sign * 0.32, 0.72, -0.04);
      }
      if (pose === "Superman") hand.z += blend * 0.15;
      if (
        pose === "Deck Grab" &&
        i === (s.tricks.stance === "regular" ? 1 : 0)
      ) {
        hand.lerp(v(0, 0.22, -0.1), blend);
        elbow.y -= blend * 0.3;
      }
      if (pose.includes("No-hander")) {
        hand.lerp(
          v(
            sign * (pose === "Tuck No-hander" ? 0.32 : 0.58),
            pose === "Tuck No-hander" ? 1.16 : 1.35,
            -0.06,
          ),
          blend,
        );
        elbow.set(sign * 0.37, 1.25 - c, -0.01);
      } else if (Math.abs(s.tricks.bars.velocity) > 1)
        hand.set(
          sign * 0.25,
          1.06,
          0.27 + Math.sin(s.tricks.bars.angle + sign) * 0.1,
        );
      poseRod(this.upperArms[i], shoulder, elbow);
      poseRod(this.forearms[i], elbow, hand);
    }
    if (s.state === "Bail") {
      const t = s.bailTimer;
      this.rider.position.set(
        Math.sin(t * 3) * 0.65,
        0.25 + Math.sin(Math.min(t, 1) * Math.PI) * 0.7,
        -t * 0.65,
      );
      this.rider.rotation.set(t * 4, 0, t * 1.2);
      this.scooter.rotation.set(0.2, t * 2, Math.min(1.4, t * 3));
    } else
      this.rider.position.set(
        0,
        s.walking
          ? Math.abs(Math.sin(s.elapsed * (s.running ? 13 : 9))) *
              Math.min(s.speed, 1) *
              0.025
          : this.scooter.position.y,
        0,
      );
  }
}
