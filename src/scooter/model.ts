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
  hands: THREE.Group[] = [];
  knees: THREE.Mesh[] = [];
  neck: THREE.Mesh;
  walkOffset = 0;
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
    this.neck = rod(
      this.rider,
      v(0, 1.35, 0),
      v(0, 1.43, 0),
      0.055,
      this.materials.skin,
    );
    const white = new THREE.MeshStandardMaterial({ color: 0xe8dfce });
    for (const sign of [-1, 1]) {
      box(
        this.head,
        v(0.043, 0.027, 0.015),
        v(sign * 0.047, 0.012, 0.107),
        white,
      );
      box(
        this.head,
        v(0.018, 0.021, 0.012),
        v(sign * 0.046, 0.011, 0.119),
        this.materials.black,
      );
      box(
        this.head,
        v(0.046, 0.012, 0.018),
        v(sign * 0.047, 0.036, 0.11),
        this.materials.black,
      );
      sphere(
        this.head,
        0.032,
        v(sign * 0.123, -0.004, 0),
        this.materials.skin,
        v(0.6, 1, 0.7),
      );
      box(
        this.hips,
        v(0.011, 0.065, 0.085),
        v(sign * 0.145, -0.012, -0.035),
        this.materials.black,
      );
    }
    sphere(
      this.head,
      0.026,
      v(0, -0.014, 0.12),
      this.materials.skin,
      v(0.65, 0.8, 1.2),
    );
    box(
      this.head,
      v(0.045, 0.008, 0.009),
      v(0, -0.063, 0.1),
      this.materials.black,
    );
    box(this.hips, v(0.285, 0.025, 0.215), v(0, 0.07, 0), this.materials.black);
    for (const sign of [-1, 1]) {
      this.knees.push(
        sphere(this.rider, 0.077, v(sign * 0.1, 0.53, 0), this.materials.pants),
      );
      const hand = new THREE.Group();
      this.rider.add(hand);
      this.hands.push(hand);
      box(hand, v(0.066, 0.065, 0.031), v(0, 0, 0), this.materials.skin);
      for (let f = 0; f < 4; f++) {
        box(
          hand,
          v(0.012, 0.034, 0.014),
          v((f - 1.5) * 0.017, -0.045, 0.008),
          this.materials.skin,
        );
        const tip = box(
          hand,
          v(0.012, 0.024, 0.014),
          v((f - 1.5) * 0.017, -0.064, 0.021),
          this.materials.skin,
        );
        tip.rotation.x = -0.8;
      }
      const thumb = box(
        hand,
        v(0.021, 0.04, 0.021),
        v(-sign * 0.041, -0.018, 0.023),
        this.materials.skin,
      );
      thumb.rotation.z = sign * 0.55;
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
    this.walkOffset = damp(
      this.walkOffset,
      s.sitting?.id ? 0.78 : s.walking ? 0.48 : 0,
      14,
      dt,
    );
    this.scooter.position.x = this.walkOffset;
    this.scooter.position.z = this.carry * 0.12;
    this.rider.rotation.set(
      s.pitch * 0.65 - s.rampLean * TUNE.rampLeanAngle,
      0,
      s.roll * 0.9,
    );
    this.scooter.position.y = s.manual.active
      ? Math.sin(Math.abs(s.manual.pitch)) * 0.32
      : s.sitting
        ? -0.55
        : this.carry * 1.02;
    const bri = s.tricks.bri.angle,
      kickless = s.tricks.kickless.angle;
    const briActive =
      Math.abs(s.tricks.bri.velocity) > 0.1 || s.tricks.bri.mismatch > 0.02;
    const cycle = Math.abs(bri) % (Math.PI * 2),
      lift = Math.sin(cycle / 2),
      side = Math.sign(bri) || 1;
    const inward = side !== s.tricks.naturalDirection;
    this.scooter.rotation.order = "YXZ";
    this.scooter.rotation.x += (inward ? 1 : -1) * Math.abs(bri);
    this.scooter.rotation.y = briActive
      ? side * lift * (inward ? 0.12 : 0.65)
      : 0;
    this.scooter.rotation.z += Math.sin(kickless) * 0.55;
    const pivot = v(0, 1.01, 0.26),
      rotated = pivot.clone().applyEuler(this.scooter.rotation);
    if (briActive)
      this.scooter.position.add(
        v(side * 0.34 * lift, 1.01 + 0.22 * lift, 0.26).sub(rotated),
      );
    this.deckPivot.rotation.y = s.tricks.deck.angle + kickless;
    this.deckPivot.rotation.z = Math.sin(kickless) * 0.45;
    this.barPivot.rotation.y =
      s.tricks.bars.angle + (s.grounded ? -s.steer * 0.15 : 0);
    this.wheelAngle += (s.speed * dt) / 0.055;
    for (const w of this.wheels) w.rotation.x = this.wheelAngle;
    const crouchTarget =
      (s.sitting?.id ? 0.8 : 0) +
        s.getUpTimer * 0.8 +
        s.charge * 0.3 +
        s.compression * 0.16 +
        (s.landTimer > 0 ? s.landTimer * 0.65 : 0) +
        (s.popTimer > 0 ? 0.1 : 0);
    // Loading is quick; a released, unpopped crouch has a visible recovery.
    this.crouch = damp(
      this.crouch,
      crouchTarget,
      crouchTarget < this.crouch ? 5.5 : 16,
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
    this.torso.rotation.x += weight * 0.36;
    this.hips.position.set(0, 0.88 - c, -0.13 - c * 0.5);
    this.hips.position.z += weight * TUNE.airWeightShiftStrength * 0.65;
    this.hips.position
      .copy(
        v(0, -0.21, 0).applyEuler(this.torso.rotation).add(this.torso.position),
      )
      .add(v(0, -0.055, 0));
    this.hips.rotation.copy(this.torso.rotation);
    this.head.position.set(0, 1.49 - c, -0.01 + c * 0.3);
    this.helmet.position.set(0, 1.57 - c, -0.025 + c * 0.3);
    this.head.position.z += weight * TUNE.airWeightShiftStrength;
    this.helmet.position.z += weight * TUNE.airWeightShiftStrength;
    poseRod(
      this.neck,
      v(0, 0.225, 0).applyEuler(this.torso.rotation).add(this.torso.position),
      this.head.position.clone().add(v(0, -0.09, 0)),
    );
    this.rider.position.set(
      0,
      s.walking && !s.sitting
        ? Math.abs(Math.sin(s.elapsed * (s.running ? 13 : 9))) *
            Math.min(s.speed, 1) *
            0.025
        : s.manual.active
          ? Math.sin(Math.abs(s.manual.pitch)) * 0.32
          : 0,
      0,
    );
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
      if (s.sitting) {
        knee.set(sign * 0.12, 0.03, 0.34);
        foot.set(sign * 0.12, -0.49, 0.4);
        this.shoes[i].position.copy(foot);
      }
      this.knees[i].position.copy(knee);
      poseRod(
        this.thighs[i],
        v(sign * 0.095, -0.015, 0)
          .applyEuler(this.hips.rotation)
          .add(this.hips.position),
        knee,
      );
      poseRod(this.shins[i], knee, foot);
      const shoulder = v(sign * 0.19, 0.17, 0)
        .applyEuler(this.torso.rotation)
        .add(this.torso.position);
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
        const reach = Math.sin((1 - s.tricks.fingerTime / 0.35) * Math.PI);
        hand.lerp(v(sign * 0.35, 0.4, 0.3), reach);
        elbow.lerp(v(sign * 0.45, 0.78, 0.32), reach);
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
      if (
        briActive ||
        Math.abs(s.tricks.kickless.velocity) > 0.1 ||
        (!s.walking &&
          !pose &&
          s.tricks.fingerTime === 0 &&
          Math.abs(weight) > 0.01)
      ) {
        hand.copy(
          v(sign * 0.24, 1.01, 0.26)
            .applyEuler(this.scooter.rotation)
            .add(this.scooter.position)
            .sub(this.rider.position)
            .applyQuaternion(this.rider.quaternion.clone().invert()),
        );
        elbow.copy(shoulder).lerp(hand, 0.5);
        elbow.x += sign * 0.13;
        poseRod(this.upperArms[i], shoulder, elbow);
      }
      if (s.sitting) {
        hand.set(sign * 0.14, 0.16, 0.25);
        elbow.copy(shoulder).lerp(hand, 0.55);
        poseRod(this.upperArms[i], shoulder, elbow);
      }
      poseRod(this.forearms[i], elbow, hand);
      this.hands[i].position.copy(hand);
      this.hands[i].quaternion.setFromUnitVectors(
        v(0, 1, 0),
        elbow.clone().sub(hand).normalize(),
      );
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
          : s.manual.active
            ? Math.sin(Math.abs(s.manual.pitch)) * 0.32
            : 0,
        0,
      );
  }
}
