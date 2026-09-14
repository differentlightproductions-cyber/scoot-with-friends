import { inWater } from "../park/water";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { TUNE, clamp, damp, wrap } from "../core/config";
import { Events } from "../core/events";
import { InputFrame } from "../input/input";
import { ridingButtons, StickPreload } from "../input/riding";
import {
  Park,
  SPAWNS,
  terrainHeight,
  terrainNormal,
  OUTDOOR,
} from "../park/park";
import { Tricks } from "../tricks/tricks";
import { ManualBalance } from "../player/manual";
import { classifyLanding } from "../player/landing";
import { GrindContact, findGrind } from "../grind/grind";
import { FakieControl } from "../player/fakie";
import { AirSpinControl } from "../player/air-spin";
import { GROUPS } from "./groups";
import { ScoreSystem } from "../tricks/score";
import { MarkerSystem } from "../player/marker";
import { outdoorLip } from "../park/outdoor";
import { DropIn } from "../player/drop-in";
import { AirWeightControl } from "../player/air-weight";
export type RideState =
  | "Grounded"
  | "Preloading"
  | "Airborne"
  | "Manual"
  | "NoseManual"
  | "Grinding"
  | "Landing"
  | "SketchyLanding"
  | "Bail"
  | "Walking"
  | "Sitting"
  | "DropInReady"
  | "DropInCommit";
export class Simulation {
  body: RAPIER.RigidBody;
  tricks: Tricks;
  score: ScoreSystem;
  rampLean = 0;
  manual = new ManualBalance();
  fakie = new FakieControl();
  airSpin = new AirSpinControl();
  railGuard: RAPIER.Collider;
  railImpactCooldown = 0;
  dropIn = new DropIn();
  footJumpTimer = 0;
  mantle: { start: THREE.Vector3; end: THREE.Vector3; time: number } | null =
    null;
  walking = false;
  sitting: { id: string; origin: THREE.Vector3 } | null = null;
  running = false;
  marker = new MarkerSystem();
  airWeight = new AirWeightControl();
  transitionAir = false;
  lipClearTimer = 0;
  walkCameraYaw = 0;
  position = new THREE.Vector3();
  previousPosition = new THREE.Vector3();
  velocity = new THREE.Vector3();
  normal = new THREE.Vector3(0, 1, 0);
  yaw = 0;
  previousYaw = 0;
  spin = 0;
  steer = 0;
  pitch = 0;
  roll = 0;
  charge = 0;
  preload = new StickPreload();
  airYawInput = 0;
  spineLaunchVelocity = new THREE.Vector3();
  spineLaunchAngle = 0;
  state: RideState = "Grounded";
  grounded = true;
  grind: GrindContact | null = null;
  grindAssist = true;
  grindCandidate = "—";
  grindDuration = 0;
  pushTimer = 0;
  pumpTimer = 0;
  popTimer = 0;
  airTime = 0;
  recovery = 0;
  landTimer = 0;
  bailTimer = 0;
  manualEntryLock = 0;
  elapsed = 0;
  distance = 0;
  lastLanding = "";
  pumpFlash = 0;
  compression = 0;
  lastGround = 0;
  hopBuffer = 0;
  bufferCharge = 0;
  spawnIndex = 0;
  lastSafeGround = new THREE.Vector3();
  waterBail = false;
  getUpTimer = 0;
  groundIntent: { direction: number; charge: number; age: number } | null =
    null;
  private lastPump = false;
  private lastSlope = 0;
  private manualRecorded = false;
  private lastSpeed = 0;
  private grindCooldown = 0;
  constructor(
    public world: RAPIER.World,
    public park: Park,
    public events: Events,
  ) {
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-12, 0.24, -24)
        .lockRotations()
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(OUTDOOR ? 0.08 : 0.2)
        .setMass(65)
        .setFriction(0)
        .setRestitution(0)
        .setCollisionGroups(GROUPS.chassis),
      this.body,
    );
    this.railGuard = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.25, 0.13)
        .setTranslation(0, 0.43, 0.26)
        .setDensity(0)
        .setFriction(0.05)
        .setRestitution(0)
        .setCollisionGroups(GROUPS.railGuard),
      this.body,
    );
    this.tricks = new Tricks(events);
    this.score = new ScoreSystem(events);
    this.reset();
  }
  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
  get context() {
    if (!this.walking && this.preload.amount > 0) return "preload";
    return this.manual.active
      ? "manual"
      : this.grind
        ? "grind"
        : this.state === "Airborne"
          ? "airborne trick"
          : "camera";
  }
  resolvingSpawn = false;
  reset(index = this.spawnIndex, restart = false) {
    this.resolvingSpawn = true;
    this.groundIntent = null;
    this.waterBail = false;
    this.preload.reset();
    this.spineLaunchVelocity.set(0, 0, 0);
    this.spineLaunchAngle = 0;
    this.spawnIndex = index;
    const s = SPAWNS[index];
    this.position.set(s.x, terrainHeight(s.x, s.z) + TUNE.radius, s.z);
    this.previousPosition.copy(this.position);
    this.lastSafeGround.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.yaw = s.yaw;
    this.previousYaw = this.yaw;
    this.body.collider(0).setSensor(false);
    this.body.collider(0).setCollisionGroups(GROUPS.chassis);
    this.railGuard.setSensor(false);
    this.fakie.reset();
    this.airSpin.reset();
    this.railImpactCooldown = 0;
    this.dropIn.reset();
    this.footJumpTimer = 0;
    this.mantle = null;
    this.walking = false;
    this.sitting = null;
    this.running = false;
    this.transitionAir = false;
    this.lipClearTimer = 0;
    this.airWeight.reset();
    this.rampLean = 0;
    this.body.setRotation(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.yaw,
      ),
      true,
    );
    this.body.setTranslation(this.position, true);
    this.body.setLinvel(this.velocity, true);
    this.body.setGravityScale(1, true);
    this.body.resetForces(true);
    this.spin = 0;
    this.pitch = 0;
    this.roll = 0;
    this.steer = 0;
    this.charge = 0;
    this.grounded = true;
    this.state = "Grounded";
    this.grind = null;
    this.manual.reset();
    this.tricks.reset();
    this.normal.set(0, 1, 0);
    this.bailTimer = 0;
    this.recovery = 0;
    this.popTimer = 0;
    this.hopBuffer = 0;
    this.airTime = 0;
    this.pushTimer = 0;
    this.lastLanding = "";
    this.grindCooldown = 0.3;
    this.lastPump = false;
    this.lastSlope = 0;
    this.manualRecorded = false;
    this.lastSpeed = 0;
    this.lastGround = this.elapsed;
    if (restart) {
      this.marker.clear();
      this.elapsed = 0;
      this.distance = 0;
      this.events.history = [];
      this.tricks.history = [];
      this.score.restart();
    }
    this.resolvingSpawn = false;
    this.events.emit({ type: "reset" });
  }
  private support(): { height: number; normal: THREE.Vector3 } {
    const p = this.position;
    // Two wheel footprints define the longitudinal riding plane. The center query
    // is retained as a chassis clearance check across a sharp crest or stair tread.
    const dx = Math.sin(this.yaw) * 0.32,
      dz = Math.cos(this.yaw) * 0.32;
    const front = terrainHeight(p.x + dx, p.z + dz),
      rear = terrainHeight(p.x - dx, p.z - dz);
    const h = Math.max(terrainHeight(p.x, p.z), (front + rear) * 0.5);
    let height = h;
    let normal = terrainNormal(p.x + dx, p.z + dz)
      .add(terrainNormal(p.x - dx, p.z - dz))
      .normalize();
    // Rapier ray queries add support on ledges; chassis collision handles sides.
    const ray = new RAPIER.Ray(
      { x: p.x, y: p.y + 0.28, z: p.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = this.world.castRayAndGetNormal(
      ray,
      1.1,
      true,
      undefined,
      undefined,
      undefined,
      this.body,
      (c) => !this.park.railHandles.has(c.handle),
    );
    if (hit && hit.normal.y > 0.4) {
      const y = p.y + 0.28 - hit.timeOfImpact;
      if (y > height + 0.02 && y < p.y + 0.08) {
        height = y;
        normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
      }
    }
    return { height, normal };
  }
  private redirectSpine(
    direction: number,
    lean: number,
    forward = new THREE.Vector3(0, 0, direction),
  ) {
    const across = this.velocity.dot(forward);
    const speed = Math.hypot(across, this.velocity.y);
    const ratio = clamp(
      0.16 + Math.max(0, speed - 9) * 0.007 - lean * 0.025,
      0.1,
      0.23,
    );
    this.velocity.addScaledVector(forward, speed * ratio - across);
    this.velocity.y = speed * Math.sqrt(1 - ratio * ratio);
    this.spineLaunchVelocity.copy(this.velocity);
    this.spineLaunchAngle =
      (Math.atan2(this.velocity.y, Math.abs(this.velocity.z)) * 180) / Math.PI;
  }
  private pop(charge: number, lean = 0) {
    const linked = this.manual.active || !!this.grind;
    this.finishManual();
    this.finishGrind();
    const rampPop = this.normal.y < 0.85 && this.velocity.y > 1;
    const hop = rampPop
      ? 0.45 + charge * 1.05
      : TUNE.hopMin + (TUNE.hopMax - TUNE.hopMin) * charge;
    if (!rampPop)
      this.velocity.addScaledVector(this.normal, 0.8 + charge * 0.4);
    this.velocity.y = Math.max(0, this.velocity.y) + hop;
    this.transitionAir = this.normal.y < 0.85 && this.rampLean > 0.1;
    if (this.transitionAir) {
      // Lean redirects the launch in the ramp's normal plane. Tangential travel
      // along the coping remains untouched, retaining diagonal entry angles.
      const outward = this.normal.clone().setY(0).normalize().negate();
      const across = this.velocity.dot(outward),
        up = this.velocity.y;
      const angle = Math.max(clamp(lean, 0, 1) * TUNE.rampLaunchLeanAngle, 0);
      this.velocity.addScaledVector(
        outward,
        across * Math.cos(angle) - up * Math.sin(angle) - across,
      );
      this.velocity.y = across * Math.sin(angle) + up * Math.cos(angle);
    }
    const lip = OUTDOOR
      ? outdoorLip(
          this.position.x,
          this.position.z,
          this.velocity.z,
          this.velocity.x,
        )
      : null;
    if (rampPop && lip && lip.distance < 0.55) {
      this.lipClearTimer = TUNE.transitionRailClearTime;
      if (lip.module.kind === "spine")
        this.redirectSpine(lip.direction, lean, lip.forward);
      else if (lip.module.kind === "quarter") {
        const speed = Math.hypot(
          this.velocity.dot(lip.forward),
          this.velocity.y,
        );
        const ratio =
          clamp((speed - TUNE.quarterOverDeckSpeed) * 0.04, -0.035, 0.35) -
          clamp(lean, 0, 1) * 0.06;
        this.velocity.addScaledVector(
          lip.forward,
          speed * ratio - this.velocity.dot(lip.forward),
        );
        this.velocity.y = speed * Math.sqrt(1 - ratio * ratio);
      }
    }
    this.body.setTranslation(
      this.position.clone().add(new THREE.Vector3(0, 0.06, 0)),
      true,
    );
    this.grounded = false;
    this.state = "Airborne";
    this.popTimer = 0.15;
    this.airTime = 0;
    this.charge = 0;
    this.hopBuffer = 0;
    this.spin = 0;
    this.tricks.startAir(linked, true);
    this.airWeight.reset(this.pitch, this.yaw);
    this.airSpin.reset();
    this.events.emit({ type: "pop", charge });
  }
  bail(reason: string) {
    if (this.state === "Bail") return;
    this.state = "Bail";
    this.preload.reset();
    this.grounded = false;
    this.bailTimer = 0;
    this.manual.reset();
    this.grind = null;
    this.body.collider(0).setSensor(false);
    this.railGuard.setSensor(false);
    this.fakie.reset();
    this.tricks.finish("failed");
    this.tricks.reset();
    this.charge = 0;
    this.hopBuffer = 0;
    this.spin = 0;
    this.body.setGravityScale(1, true);
    this.velocity.multiplyScalar(0.72);
    this.velocity.y = Math.max(1.5, this.velocity.y);
    this.events.emit({ type: "bail", reason });
  }
  recoverLocally() {
    const origin = this.waterBail ? this.lastSafeGround : this.position;
    let target: THREE.Vector3 | null = null;
    for (const radius of [0, 0.6, 1.2, 2, 3, 5, 8]) {
      for (let i = 0; i < 16; i++) {
        const x = origin.x + Math.cos((i * Math.PI) / 8) * radius;
        const z = origin.z + Math.sin((i * Math.PI) / 8) * radius;
        if (OUTDOOR && inWater(x, z, 1.08)) continue;
        if (terrainNormal(x, z).y < 0.75) continue;
        const p = new THREE.Vector3(x, terrainHeight(x, z) + TUNE.radius, z);
        if (
          this.world.intersectionWithShape(
            p.clone().add(new THREE.Vector3(0, 0.65, 0)),
            { x: 0, y: 0, z: 0, w: 1 },
            new RAPIER.Capsule(0.35, 0.22),
            undefined,
            GROUPS.chassis,
            undefined,
            this.body,
          )
        )
          continue;
        target = p;
        break;
      }
      if (target) break;
    }
    if (!target) {
      this.reset();
      return;
    }
    this.position.copy(target);
    this.previousPosition.copy(target);
    this.body.setTranslation(target, true);
    this.velocity.set(0, 0, 0);
    this.body.setLinvel(this.velocity, true);
    this.body.setGravityScale(1, true);
    this.body.collider(0).setSensor(false);
    this.railGuard.setSensor(false);
    this.walking = true;
    this.running = false;
    this.sitting = null;
    this.mantle = null;
    this.state = "Walking";
    this.grounded = true;
    this.pitch = this.roll = this.spin = 0;
    this.preload.reset();
    this.groundIntent = null;
    this.tricks.reset();
    this.airWeight.reset(0, this.yaw);
    this.airSpin.reset();
    this.dropIn.reset();
    this.waterBail = false;
    this.getUpTimer = 0.45;
    this.bailTimer = 0;
    this.grindCooldown = 0.4;
  }
  private finishManual() {
    if (
      this.manual.active &&
      this.manual.duration > 0.18 &&
      !this.manualRecorded
    )
      this.tricks.add(this.manual.nose ? "Nose Manual" : "Manual");
    this.manual.reset();
    this.manualRecorded = false;
  }
  private finishGrind() {
    if (this.grind) {
      if (this.grindDuration > 0.08) this.tricks.add(this.grind.name);
      this.grind = null;
      this.grindCooldown = 0.22;
      this.body.collider(0).setSensor(false);
      this.railGuard.setSensor(false);
      this.body.setGravityScale(1, true);
    }
  }
  private captureGrind(input: InputFrame) {
    if (
      this.grounded ||
      this.walking ||
      this.grind ||
      (!this.grindAssist && input.held.pumpGrind <= 0.3) ||
      this.grindCooldown > 0
    )
      return;
    const candidate = findGrind(
      this.park.rails,
      this.position.clone().add(new THREE.Vector3(0, -0.12, 0)),
      this.velocity,
      this.yaw,
      this.pitch,
      this.grindAssist,
      input.held.pumpGrind > 0.3,
    );
    this.grindCandidate = candidate?.rail.id ?? "—";
    if (
      candidate &&
      this.tricks.deck.mismatch < 0.45 &&
      this.tricks.bars.mismatch < 0.45
    ) {
      this.tricks.finish("clean");
      this.grind = candidate;
      this.grindDuration = 0;
      this.body.setGravityScale(0, true);
      this.body.collider(0).setSensor(true);
      this.railGuard.setSensor(true);
      this.state = "Grinding";
      this.velocity.copy(candidate.direction).multiplyScalar(candidate.speed);
      this.events.emit({
        type: "grindCatch",
        name: candidate.name,
        assisted: this.grindAssist,
      });
    }
  }
  private walk(dt: number, input: InputFrame) {
    if (this.mantle) {
      const m = this.mantle;
      m.time += dt;
      const t = clamp(m.time / 0.55, 0, 1);
      const horizontal = clamp((t - 0.4) / 0.6, 0, 1);
      const eased = horizontal * horizontal * (3 - 2 * horizontal);
      this.position.copy(m.start).lerp(m.end, eased);
      this.position.y =
        m.start.y +
        (m.end.y - m.start.y) * Math.sin((Math.min(1, t / 0.6) * Math.PI) / 2) +
        Math.sin(t * Math.PI) * 0.12;
      this.body.setTranslation(this.position, true);
      this.velocity.set(0, 0, 0);
      this.body.setLinvel(this.velocity, true);
      if (t === 1) {
        this.mantle = null;
        this.grounded = true;
      }
      return;
    }
    this.footJumpTimer = Math.max(0, this.footJumpTimer - dt);
    this.body.collider(0).setCollisionGroups(GROUPS.chassis);
    this.railGuard.setSensor(false);
    if (input.pressed.sprint) this.running = !this.running;
    this.tricks.endFakie();
    this.rampLean = damp(this.rampLean, 0, 9, dt);
    const support = this.support();
    const targetY =
      support.height + TUNE.radius / Math.max(0.55, support.normal.y);
    const gap = this.position.y - targetY;
    this.grounded =
      this.footJumpTimer === 0 &&
      gap < 0.16 &&
      gap > -0.5 &&
      this.velocity.dot(support.normal) < 2;
    this.state = "Walking";
    const h = this.walkCameraYaw;
    const desired = new THREE.Vector3(
      -Math.sin(h) * input.lean - Math.cos(h) * input.steer,
      0,
      -Math.cos(h) * input.lean + Math.sin(h) * input.steer,
    );
    if (desired.length() > 1) desired.normalize();
    desired.multiplyScalar(this.running ? TUNE.runSpeed : TUNE.walkSpeed);
    if (input.pressed.hop) {
      const forward =
        desired.lengthSq() > 0.01
          ? desired.clone().normalize()
          : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      for (const distance of [0.45, 0.75, 1, 1.25]) {
        const end = this.position.clone().addScaledVector(forward, distance),
          height = terrainHeight(end.x, end.z);
        if (
          height + 0.22 - this.position.y > 0.25 &&
          height + 0.22 - this.position.y < 1.4 &&
          terrainNormal(end.x, end.z).y > 0.93
        ) {
          end.y = height + 0.24;
          if (
            !this.world.intersectionWithShape(
              end,
              { x: 0, y: 0, z: 0, w: 1 },
              new RAPIER.Ball(0.08),
              undefined,
              GROUPS.chassis,
              undefined,
              this.body,
            )
          ) {
            this.mantle = { start: this.position.clone(), end, time: 0 };
            return;
          }
        }
      }
      if (this.grounded) {
        this.velocity.y = 6;
        this.grounded = false;
        this.footJumpTimer = 0.18;
      }
    }
    if (this.grounded) {
      const magnitude = desired.length();
      desired
        .projectOnPlane(support.normal)
        .normalize()
        .multiplyScalar(magnitude);
      desired.addScaledVector(
        new THREE.Vector3(0, -1, 0).projectOnPlane(support.normal),
        1.8,
      );
    }
    this.velocity.x = damp(
      this.velocity.x,
      desired.x,
      this.grounded ? TUNE.walkAcceleration : 2.5,
      dt,
    );
    this.velocity.z = damp(
      this.velocity.z,
      desired.z,
      this.grounded ? TUNE.walkAcceleration : 2.5,
      dt,
    );
    if (desired.lengthSq() > 0.03)
      this.yaw +=
        wrap(Math.atan2(desired.x, desired.z) - this.yaw) *
        (1 - Math.exp(-TUNE.walkTurnResponse * dt));
    if (this.grounded) {
      this.position.y = targetY;
      this.body.setTranslation(this.position, true);
      this.normal.lerp(support.normal, 1 - Math.exp(-18 * dt));
      this.velocity.y =
        -(
          this.velocity.x * support.normal.x +
          this.velocity.z * support.normal.z
        ) / Math.max(0.55, support.normal.y);
      this.body.setGravityScale(0, true);
    } else this.body.setGravityScale(1, true);
    this.pitch = damp(
      this.pitch,
      this.grounded
        ? clamp(
            -Math.atan2(
              -support.normal.x * Math.sin(this.yaw) -
                support.normal.z * Math.cos(this.yaw),
              support.normal.y,
            ),
            -0.7,
            0.7,
          )
        : -0.1,
      12,
      dt,
    );
    this.roll = damp(this.roll, 0, 12, dt);
    this.body.setRotation(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.yaw,
      ),
      true,
    );
    this.body.setLinvel(this.velocity, true);
    this.world.timestep = dt;
    this.world.step();
    this.position.copy(this.body.translation());
    this.velocity.copy(this.body.linvel());
    this.tricks.tick(dt, false);
  }
  private land(support: { height: number; normal: THREE.Vector3 }) {
    const impact = Math.max(0, -this.velocity.dot(support.normal));
    const slopePitch = -Math.atan2(
      support.normal
        .clone()
        .negate()
        .dot(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))),
      support.normal.y,
    );
    let quality = classifyLanding({
      yaw: this.yaw,
      velocityYaw: Math.atan2(this.velocity.x, this.velocity.z),
      speed: this.speed,
      impact,
      deckAngle: this.tricks.deck.angle,
      barAngle: this.tricks.bars.angle,
      pitchError: wrap(this.pitch - slopePitch),
      weightBias: this.airWeight.shift,
      riderPitch: this.pitch + this.airWeight.shift * 0.16,
      surfacePitch: slopePitch,
      spinSpeed: this.spin,
    });
    if (
      this.tricks.bri.mismatch > 1 ||
      this.tricks.kickless.mismatch > 1 ||
      this.tricks.poseBlend > 0.65
    )
      quality = "failed";
    else if (this.tricks.poseBlend > 0.15 && quality === "clean")
      quality = "sketchy";
    this.lastLanding = quality;
    this.events.emit({ type: "landing", quality, impact });
    this.tricks.finish(quality);
    if (quality === "failed") {
      this.bail("Unaligned landing");
      return;
    }
    this.grounded = true;
    this.state = quality === "sketchy" ? "SketchyLanding" : "Landing";
    this.landTimer = 0.25;
    this.recovery = quality === "sketchy" ? TUNE.recoveryTime : 0;
    this.velocity.addScaledVector(
      support.normal,
      -this.velocity.dot(support.normal),
    );
    if (quality === "sketchy") this.velocity.multiplyScalar(0.73);
    this.spin *= 0.12;
    this.position.y =
      support.height + TUNE.radius / Math.max(0.55, support.normal.y);
    this.body.setTranslation(this.position, true);
  }
  step(dt: number, input: InputFrame) {
    this.previousPosition.copy(this.position);
    this.previousYaw = this.yaw;
    this.elapsed += dt;
    this.lipClearTimer = Math.max(0, this.lipClearTimer - dt);
    this.railImpactCooldown = Math.max(0, this.railImpactCooldown - dt);
    this.pushTimer = Math.max(0, this.pushTimer - dt);
    this.pumpTimer = Math.max(0, this.pumpTimer - dt);
    this.popTimer = Math.max(0, this.popTimer - dt);
    this.recovery = Math.max(0, this.recovery - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);
    this.manualEntryLock = Math.max(0, this.manualEntryLock - dt);
    this.grindCooldown = Math.max(0, this.grindCooldown - dt);
    this.pumpFlash = Math.max(0, this.pumpFlash - dt);
    this.hopBuffer = Math.max(0, this.hopBuffer - dt);
    this.position.copy(this.body.translation());
    this.velocity.copy(this.body.linvel());
    if (this.marker.step(dt, input, this)) {
      this.preload.reset();
      return;
    }
    this.compression = damp(
      this.compression,
      this.grounded ? input.held.pumpGrind : 0,
      12,
      dt,
    );
    if (input.pressed.reset) {
      this.reset();
      return;
    }
    if (
      !Number.isFinite(
        this.position.lengthSq() + this.velocity.lengthSq() + this.yaw,
      ) ||
      Math.abs(this.position.x) > (OUTDOOR ? 113 : 34) ||
      (OUTDOOR
        ? this.position.z < -166 || this.position.z > 78
        : Math.abs(this.position.z) > 46) ||
      this.position.y < -8 ||
      this.position.y > 35
    ) {
      this.reset();
      return;
    }
    this.getUpTimer = Math.max(0, this.getUpTimer - dt);
    if (
      OUTDOOR &&
      inWater(this.position.x, this.position.z) &&
      this.position.y < 0.35 &&
      !this.waterBail
    ) {
      this.bail("Water — returning to shore");
      this.waterBail = true;
      this.body.collider(0).setSensor(true);
      this.railGuard.setSensor(true);
      this.events.emit({
        type: "splash",
        x: this.position.x,
        z: this.position.z,
      });
    }
    if (
      this.grounded &&
      !inWater(this.position.x, this.position.z, 1.12) &&
      this.state !== "Bail" &&
      this.normal.y > 0.8
    )
      this.lastSafeGround.copy(this.position);
    if (this.state === "Bail") {
      this.bailTimer += dt;
      this.velocity.x *= Math.exp(-1.8 * dt);
      this.velocity.z *= Math.exp(-1.8 * dt);
      this.body.setLinvel(this.velocity, true);
      this.world.step();
      this.position.copy(this.body.translation());
      if (this.waterBail) {
        this.velocity.multiplyScalar(Math.exp(-7 * dt));
        this.velocity.y = -0.6;
        this.body.setLinvel(this.velocity, true);
      }
      if (
        this.bailTimer > (this.waterBail ? 1.1 : 2.0) ||
        (this.bailTimer > 0.25 && input.pressed.hop)
      )
        this.recoverLocally();
      return;
    }
    if (this.dropIn.step(this, dt, input)) return;
    if (this.sitting) {
      if (input.pressed.brakeBars || input.pressed.body || input.pressed.hop) {
        this.position.copy(this.sitting.origin);
        this.body.setTranslation(this.position, true);
        this.previousPosition.copy(this.position);
        this.sitting = null;
        this.state = "Walking";
      } else {
        this.velocity.set(0, 0, 0);
        this.body.setLinvel(this.velocity, true);
        this.state = "Sitting";
        return;
      }
    } else if (this.walking && this.grounded && input.pressed.brakeBars) {
      const local = (b: (typeof this.park.benches)[number]) =>
        new THREE.Vector3(
          this.position.x - b.x,
          0,
          this.position.z - b.z,
        ).applyAxisAngle(new THREE.Vector3(0, 1, 0), -b.yaw);
      const bench = this.park.benches.find((b) => {
        const p = local(b);
        return (
          Math.abs(p.x) < b.width / 2 + 0.9 &&
          Math.abs(p.z) < b.length / 2 + 0.3 &&
          Math.abs(this.position.y - 0.22 - b.base) < 0.35
        );
      });
      if (bench) {
        const p = local(bench);
        this.sitting = { id: bench.id, origin: this.position.clone() };
        this.yaw = (p.x < 0 ? -Math.PI / 2 : Math.PI / 2) + bench.yaw;
        this.previousYaw = this.yaw;
        this.position
          .set(
            0,
            bench.seat + 0.22,
            clamp(p.z, -bench.length / 2 + 0.3, bench.length / 2 - 0.3),
          )
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), bench.yaw)
          .add(new THREE.Vector3(bench.x, 0, bench.z));
        this.body.setTranslation(this.position, true);
        this.previousPosition.copy(this.position);
        this.velocity.set(0, 0, 0);
        this.body.setLinvel(this.velocity, true);
        this.running = false;
        this.state = "Sitting";
        return;
      }
    }
    if (
      input.pressed.body &&
      this.walking &&
      this.grounded &&
      this.dropIn.setup(this)
    )
      return;
    if (input.pressed.body && this.grounded && !this.grind) {
      this.walking = !this.walking;
      this.running = false;
      this.finishManual();
      this.charge = 0;
      this.hopBuffer = 0;
      this.spin = 0;
      this.fakie.reset();
      this.events.emit({ type: "dismount", walking: this.walking });
      this.preload.reset();
      if (!this.walking) this.state = "Grounded";
    }
    if (this.walking) {
      this.walk(dt, input);
      return;
    }
    this.captureGrind(input);
    const support = this.support();
    if (OUTDOOR)
      support.normal = terrainNormal(this.position.x, this.position.z);
    const gap =
      this.position.y -
      (support.height + TUNE.radius / Math.max(0.55, support.normal.y));
    const wasGrounded = this.grounded;
    if (
      !this.grind &&
      this.popTimer === 0 &&
      gap < 0.1 &&
      gap > -0.5 &&
      this.velocity.dot(support.normal) < 2.0
    ) {
      if (!wasGrounded && this.airTime > 0.07) this.land(support);
      else if ((this.state as RideState) !== "Bail") this.grounded = true;
    } else if (!this.grind) {
      this.grounded = false;
    }
    if ((this.state as RideState) === "Bail") {
      this.body.setLinvel(this.velocity, true);
      this.world.step();
      return;
    }
    if (OUTDOOR && this.grounded) this.normal.copy(support.normal);
    else this.normal.lerp(support.normal, 1 - Math.exp(-18 * dt)).normalize();
    if (wasGrounded && !this.grounded && !this.grind) {
      const leavingLip = OUTDOOR
        ? outdoorLip(
            this.position.x,
            this.position.z,
            this.velocity.z,
            this.velocity.x,
          )
        : null;
      if (leavingLip && leavingLip.distance < 0.55 && this.velocity.y > 0.3) {
        this.lipClearTimer = TUNE.transitionRailClearTime;
        this.popTimer = 0.12;
        if (leavingLip.module.kind === "spine")
          this.redirectSpine(
            leavingLip.direction,
            input.lean,
            leavingLip.forward,
          );
        if (leavingLip.module.kind === "quarter") {
          const planeSpeed = Math.hypot(
            this.velocity.dot(leavingLip.forward),
            this.velocity.y,
          );
          const ratio =
            clamp(
              (planeSpeed - TUNE.quarterOverDeckSpeed) * 0.04,
              -0.035,
              0.35,
            ) -
            clamp(input.lean, 0, 1) * 0.06;
          this.velocity.addScaledVector(
            leavingLip.forward,
            planeSpeed * ratio - this.velocity.dot(leavingLip.forward),
          );
          this.velocity.y = planeSpeed * Math.sqrt(1 - ratio * ratio);
        }
        this.events.emit({ type: "pop", charge: 0 });
      }
      this.transitionAir = this.normal.y < 0.85 && this.rampLean > 0.1;
      this.finishManual();
      this.state = "Airborne";
      this.airTime = 0;
      this.tricks.startAir(false, true);
      this.airWeight.reset(this.pitch, this.yaw);
      this.airSpin.reset();
    }
    if (this.grounded) this.lastGround = this.elapsed;
    const supportedForTrick = this.grounded || !!this.grind;
    const gesture =
      supportedForTrick &&
      input.held.body < 0.5 &&
      input.held.leftModifier < 0.5
        ? this.tricks.gesture.step(dt, input.rx, input.ry)
        : null;
    if (gesture?.kind === "bri")
      this.groundIntent = {
        direction: gesture.direction,
        charge: this.preload.amount,
        age: 0,
      };
    const whip = ridingButtons(
      this.tricks.stance,
      this.tricks.controlStyle,
    ).whip;
    if (
      supportedForTrick &&
      (input.pressed[whip] ||
        (this.tricks.controlStyle === "arcade" && input.pressed.hop))
    ) {
      this.pop(Math.max(0.15, this.preload.amount), input.lean);
      this.preload.reset();
    }
    if (this.groundIntent) {
      const intent = this.groundIntent;
      intent.age += dt;
      const lip = OUTDOOR
        ? outdoorLip(
            this.position.x,
            this.position.z,
            this.velocity.z,
            this.velocity.x,
          )
        : null;
      const waitForLip =
        this.grounded &&
        this.velocity.y > 1 &&
        lip &&
        lip.distance > 0.15 &&
        lip.distance < 0.9 &&
        intent.age < 0.16;
      if (!waitForLip) {
        if (this.grounded || this.grind)
          this.pop(Math.max(0.15, intent.charge), input.lean);
        this.tricks.bri.kick(intent.direction);
        this.groundIntent = null;
        this.preload.reset();
      }
    }
    // Preload survives the lip briefly and can buffer a release just before contact.
    const preloadLip = OUTDOOR && this.grounded && !this.manual.active
      ? outdoorLip(
          this.position.x,
          this.position.z,
          this.velocity.z,
          this.velocity.x,
        )
      : null;
    const transitionRelease =
      !!preloadLip &&
      preloadLip.distance > -0.1 &&
      preloadLip.distance < 0.9 &&
      this.normal.y < 0.97;
    const rsPop = this.preload.step(
      dt,
      input,
      this.grounded ||
        !!this.grind ||
        this.elapsed - this.lastGround < TUNE.coyoteTime,
      Math.hypot(input.rx, input.ry) > 0.55 &&
        (Math.abs(input.rx) > 0.45 || this.tricks.gesture.confidence > 0.1),
      transitionRelease,
    );
    this.charge = this.preload.amount;
    if (rsPop !== null) {
      this.bufferCharge = rsPop;
      this.hopBuffer = TUNE.hopBuffer;
      this.charge = 0;
    }
    if (
      this.hopBuffer > 0 &&
      (this.grounded ||
        this.grind ||
        this.elapsed - this.lastGround < TUNE.coyoteTime)
    )
      this.pop(this.bufferCharge, input.lean);
    const forward = new THREE.Vector3(
      Math.sin(this.yaw),
      0,
      Math.cos(this.yaw),
    );
    this.steer = damp(this.steer, input.steer, TUNE.steeringResponse, dt);
    if (this.grind) {
      this.grindDuration += dt;
      this.state = "Grinding";
      this.grounded = false;
      this.body.setGravityScale(0, true);
      const g = this.grind;
      g.speed +=
        (-TUNE.gravity * g.direction.y - Math.sign(g.speed) * 0.34) * dt;
      const railLength = g.rail.a.distanceTo(g.rail.b);
      g.t = this.position.clone().sub(g.rail.a).dot(g.direction) / railLength;
      const point = g.rail.a.clone().lerp(g.rail.b, g.t);
      const side = new THREE.Vector3(
        g.direction.z,
        0,
        -g.direction.x,
      ).normalize();
      const lateral = this.position.clone().sub(point).dot(side);
      const settling = this.grindDuration < TUNE.grindSettleTime;
      const spring = this.grindAssist
        ? settling
          ? TUNE.grindLateralSpring
          : 18
        : 18;
      g.lateralSpeed +=
        (-(lateral - g.contactOffset) * spring -
          g.lateralSpeed * (settling ? TUNE.grindLateralDamping : 5)) *
        dt;
      this.velocity
        .copy(g.direction)
        .multiplyScalar(g.speed)
        .addScaledVector(side, g.lateralSpeed);
      this.velocity.y +=
        (point.y + 0.14 - this.position.y) * (settling ? 18 : 10);
      this.yaw -= input.steer * TUNE.grindSteering * dt;
      this.pitch = damp(this.pitch, g.entryPitch + input.ry * 0.13, 8, dt);
      if (Math.abs(input.rx) > 0.25)
        this.roll = damp(this.roll, -input.rx * 0.14, 8, dt);
      if (
        g.t < 0 ||
        g.t > 1 ||
        (!settling && Math.abs(lateral - g.contactOffset) > 0.55) ||
        Math.abs(g.speed) < 0.8 ||
        (Math.abs(input.rx) > 0.95 && this.grindDuration > 0.6)
      ) {
        this.finishGrind();
        this.state = "Airborne";
        this.tricks.startAir(true);
        this.popTimer = 0.12;
        this.airTime = 0;
      }
    } else if (this.grounded) {
      this.airWeight.shift = damp(
        this.airWeight.shift,
        0,
        TUNE.airWeightRecentering,
        dt,
      );
      this.airTime = 0;
      this.body.setGravityScale(0, true);
      const speed = this.speed;
      const sign = this.velocity.dot(forward) < -0.3 ? -1 : 1;
      const yawRate =
        ((-this.steer * TUNE.steering * (0.18 + Math.min(speed / 3, 1))) /
          (1 + speed * 0.1)) *
        sign;
      const revert = this.fakie.step(
        dt,
        this.yaw,
        this.velocity.x,
        this.velocity.z,
        input.steer,
        !this.manual.active,
      );
      this.yaw = revert.reverting ? revert.yaw : this.yaw + yawRate * dt;
      if (this.recovery > 0) {
        this.yaw += Math.sin(this.elapsed * 24) * 0.35 * this.recovery * dt;
        this.roll = Math.sin(this.elapsed * 25) * 0.1 * this.recovery;
      } else
        this.roll = damp(
          this.roll,
          this.steer * Math.min(speed * 0.022, 0.22),
          8,
          dt,
        );
      const tangent = new THREE.Vector3(
        Math.sin(this.yaw),
        0,
        Math.cos(this.yaw),
      )
        .projectOnPlane(this.normal)
        .normalize();
      const along = this.velocity.dot(tangent);
      const alignment = speed > 0.5 ? this.velocity.dot(forward) / speed : 0;
      const aheadRise =
        (terrainHeight(
          this.position.x + forward.x * TUNE.rampLeanLookAhead,
          this.position.z + forward.z * TUNE.rampLeanLookAhead,
        ) -
          support.height) /
        TUNE.rampLeanLookAhead;
      const desiredLean = this.manual.active
        ? 0
        : clamp((Math.max(tangent.y, aheadRise) - 0.04) / 0.6, 0, 1) *
          clamp((alignment - 0.55) / 0.45, 0, 1) *
          clamp(speed / 4, 0, 1);
      const oldLean = this.rampLean;
      this.rampLean = damp(
        this.rampLean,
        desiredLean,
        TUNE.rampLeanResponse,
        dt,
      );
      // Lowering the rider's center of mass releases a small amount of potential
      // energy; standing back up pays it back instead of granting a free boost.
      if (speed > 0.8)
        this.velocity.setLength(
          Math.sqrt(
            Math.max(
              0,
              this.velocity.lengthSq() +
                2 *
                  TUNE.gravity *
                  TUNE.rampLeanCenterOfMassDrop *
                  (this.rampLean - oldLean),
            ),
          ),
        );
      const side = this.velocity
        .clone()
        .addScaledVector(tangent, -along)
        .projectOnPlane(this.normal);
      this.velocity.addScaledVector(
        side,
        -Math.min(
          1,
          TUNE.carveGrip *
            dt *
            (revert.reverting ? 0 : this.recovery > 0 ? 0.35 : 1),
        ),
      );
      this.velocity.addScaledVector(
        new THREE.Vector3(0, -TUNE.gravity, 0).projectOnPlane(this.normal),
        dt,
      );
      const brake = input.held.brake;
      const loss = (TUNE.rollingDrag + brake * TUNE.brake) * dt;
      const current = this.velocity.length();
      if (current > 0)
        this.velocity.multiplyScalar(Math.max(0, current - loss) / current);
      if (
        input.pressed[
          ridingButtons(this.tricks.stance, this.tricks.controlStyle).push
        ] &&
        this.pushTimer === 0 &&
        !this.manual.active &&
        !revert.reverting
      ) {
        this.velocity.addScaledVector(
          tangent,
          TUNE.push * clamp(1 - Math.max(0, along) / TUNE.maxSpeed, 0.05, 1),
        );
        this.pushTimer = TUNE.pushCadence;
        this.events.emit({ type: "push" });
      }
      // Compression while descending and extension through changing curvature preserve energy.
      const slope = tangent.y * sign;
      const pump = input.held.pumpGrind > 0.3;
      if (
        this.pumpTimer === 0 &&
        speed > 1.2 &&
        ((pump && !this.lastPump && slope < -0.1) ||
          (!pump &&
            this.lastPump &&
            (slope > 0.07 || Math.abs(slope - this.lastSlope) > 0.015)))
      ) {
        this.velocity.addScaledVector(
          tangent,
          sign * TUNE.pumpGain * clamp(speed / 7, 0.4, 1),
        );
        this.pumpTimer = TUNE.pumpCooldown;
        this.pumpFlash = 0.7;
        this.events.emit({ type: "pump" });
      }
      this.lastSlope = slope;
      this.lastPump = pump;
      if (
        !this.manual.active &&
        input.held.leftModifier > 0.5 &&
        Math.abs(input.ry) > 0.5 &&
        speed > 0.7 &&
        this.manualEntryLock === 0
      ) {
        this.manual.enter(input.ry < 0);
        this.manualEntryLock = 0.35;
        this.manualRecorded = false;
      }
      if (this.manual.active) {
        // Ignore the entry flick for a fraction of a second, then give the stick full balance control.
        const result = this.manual.step(
          dt,
          this.manualEntryLock > 0 || this.preload.amount > 0 ? 0 : input.ry,
          (speed - this.lastSpeed) / dt,
        );
        if (this.manual.duration > 0.25 && !this.manualRecorded) {
          this.tricks.add(this.manual.nose ? "Nose Manual" : "Manual");
          this.manualRecorded = true;
        }
        if (result === "loop") {
          this.bail(this.manual.nose ? "Over the bars" : "Looped manual");
        }
        if (result === "drop") {
          this.manualEntryLock = 0.5;
          this.manualRecorded = false;
        }
      }
      const slopePitch = -Math.atan2(
        tangent.y,
        Math.hypot(tangent.x, tangent.z),
      );
      this.pitch = damp(
        this.pitch,
        slopePitch + (this.manual.active ? this.manual.pitch : 0),
        14,
        dt,
      );
      if ((this.state as RideState) !== "Bail")
        this.state = this.manual.active
          ? this.manual.nose
            ? "NoseManual"
            : "Manual"
          : this.recovery > 0
            ? "SketchyLanding"
            : this.charge > 0
              ? "Preloading"
              : this.landTimer > 0
                ? "Landing"
                : "Grounded";
      // Follow a smooth support surface. The Rapier body remains dynamic for wall/ledge impacts.
      if (gap < 0.16 && gap > -0.5) {
        this.position.y =
          support.height + TUNE.radius / Math.max(0.55, support.normal.y);
        this.body.setTranslation(this.position, true);
      }
      const surfaceSpeed = this.velocity.length();
      this.velocity.addScaledVector(
        this.normal,
        -this.velocity.dot(this.normal),
      );
      if (OUTDOOR && this.velocity.lengthSq() > 0.00001)
        this.velocity.setLength(surfaceSpeed);
      this.lastSpeed = speed;
    } else {
      this.state = "Airborne";
      this.body.setGravityScale(1, true);
      this.airTime += dt;
      this.rampLean = damp(this.rampLean, 0, 4, dt);
      this.fakie.step(dt, this.yaw, this.velocity.x, this.velocity.z, 0, false);
      this.spin = this.airSpin.step(
        dt,
        this.spin,
        input.steer,
        this.velocity.y,
        Math.max(0, gap),
        this.airTime,
      );
      const rotation = this.spin * dt;
      this.yaw += rotation;
      this.tricks.yaw += rotation;
      this.airWeight.step(dt, input.lean, this.yaw, this.velocity);
      this.airYawInput = input.steer;
      const basePitch = this.airWeight.basePitch(this.yaw, this.airTime);
      this.pitch = damp(
        this.pitch,
        clamp(basePitch + this.airWeight.pitchBias, -1.25, 1.25),
        12,
        dt,
      );
      this.roll = damp(this.roll, input.steer * 0.07, 4, dt);
      this.tricks.input(dt, input);
      this.captureGrind(input);
      if (input.held.pumpGrind <= 0.3) this.grindCandidate = "—";
    }
    if (this.velocity.length() > 28) this.velocity.setLength(28);
    const lip = OUTDOOR
      ? outdoorLip(
          this.position.x,
          this.position.z,
          this.velocity.z,
          this.velocity.x,
        )
      : null;
    const onTransition =
      !!lip &&
      this.grounded &&
      !this.walking &&
      !this.manual.active &&
      this.normal.y < 0.95;
    if (
      onTransition &&
      lip.distance <= TUNE.transitionLipReleaseDistance &&
      lip.distance >= -0.1 &&
      this.velocity.y > 0.3 &&
      this.popTimer === 0
    ) {
      if (lip.module.kind === "spine")
        this.redirectSpine(lip.direction, input.lean, lip.forward);
      if (lip.module.kind === "quarter") {
        const planeSpeed = Math.hypot(
          this.velocity.dot(lip.forward),
          this.velocity.y,
        );
        // The transition turns existing momentum; it never assigns jump energy.
        // Only surplus speed produces a meaningful outward component over the deck.
        const outwardRatio =
          clamp((planeSpeed - TUNE.quarterOverDeckSpeed) * 0.04, -0.035, 0.35) -
          clamp(input.lean, 0, 1) * 0.06;
        this.velocity.addScaledVector(
          lip.forward,
          planeSpeed * outwardRatio - this.velocity.dot(lip.forward),
        );
        this.velocity.y =
          planeSpeed * Math.sqrt(Math.max(0, 1 - outwardRatio * outwardRatio));
      }
      this.finishManual();
      this.grounded = false;
      this.state = "Airborne";
      this.airTime = 0;
      this.popTimer = 0.12;
      this.lipClearTimer = TUNE.transitionRailClearTime;
      this.body.setGravityScale(1, true);
      this.tricks.startAir(false, true);
      this.airSpin.reset();
      this.airWeight.reset(this.pitch, this.yaw);
      this.spin = 0;
      // A loaded transition pop adds only a small extension to the rider's
      // existing ramp momentum. This keeps a quarter pipe rideable and makes
      // the same in-ramp release feel responsive without turning it into a
      // flat-ground super jump.
      const transitionCharge = this.preload.amount;
      if (transitionCharge > 0)
        this.velocity.y += 0.22 + transitionCharge * 0.78;
      this.preload.reset();
      this.charge = 0;
      this.events.emit({ type: "pop", charge: transitionCharge });
    }
    // The upper guard is too coarse for a rider unweighting over a lip. Temporarily
    // ignore only rail contacts on a valid transition crossing; terrain remains solid.
    const crossing = onTransition || this.lipClearTimer > 0;
    this.body
      .collider(0)
      .setCollisionGroups(
        crossing ? GROUPS.chassisSurfaceOnly : GROUPS.chassis,
      );
    this.railGuard.setSensor(!!this.grind || crossing);
    this.body.setLinvel(this.velocity, true);
    this.body.setRotation(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.yaw,
      ),
      true,
    );
    this.world.timestep = dt;
    this.world.step();
    const after = new THREE.Vector3().copy(this.body.linvel());
    let railImpact = 0;
    if (!this.grind && this.railImpactCooldown === 0) {
      for (const collider of [this.body.collider(0), this.railGuard])
        this.world.contactPairsWith(collider, (other) => {
          if (!this.park.railHandles.has(other.handle)) return;
          this.world.contactPair(collider, other, (manifold) => {
            if (manifold.numContacts() > 0) {
              const n = manifold.normal();
              railImpact = Math.max(
                railImpact,
                Math.abs(
                  this.velocity.x * n.x +
                    this.velocity.y * n.y +
                    this.velocity.z * n.z,
                ),
              );
            }
          });
        });
    }
    if (railImpact > TUNE.railImpactWobbleSpeed) {
      this.railImpactCooldown = TUNE.railImpactCooldown;
      const severe = railImpact >= TUNE.railImpactBailSpeed;
      this.events.emit({ type: "railImpact", speed: railImpact, bail: severe });
      if (severe) {
        const reaction = after
          .clone()
          .addScaledVector(this.velocity, TUNE.railCollisionImpulseScale);
        this.bail("Rail impact");
        this.velocity.copy(reaction);
        this.velocity.y = Math.max(this.velocity.y, 1.5);
        this.body.setLinvel(this.velocity, true);
      } else {
        this.recovery = Math.max(this.recovery, 0.65);
        this.state = "SketchyLanding";
        this.velocity.copy(after).multiplyScalar(0.82);
        this.body.setLinvel(this.velocity, true);
      }
    }
    if (
      this.speed > 4 &&
      Math.hypot(after.x, after.z) < this.speed * 0.25 &&
      this.state !== "Grinding" &&
      (this.state as RideState) !== "Bail" &&
      railImpact === 0 &&
      this.grounded
    )
      this.bail("Heavy collision");
    this.position.copy(this.body.translation());
    this.velocity.copy(this.body.linvel());
    this.distance += this.speed * dt;
    const holdingFakie =
      this.grounded &&
      this.fakie.mode === "Fakie" &&
      this.speed > TUNE.fakieMinSpeed &&
      !this.manual.active;
    if (holdingFakie) {
      this.tricks.holdFakie(dt);
      if (this.tricks.fakieRecord) this.score.holdFakie(dt);
    } else this.tricks.endFakie();
    this.tricks.tick(
      dt,
      !this.grounded || this.manual.active || !!this.grind || holdingFakie,
    );
  }
  snapshot() {
    return {
      state: this.state,
      walking: this.walking,
      sitting: this.sitting?.id ?? null,
      dropIn: { phase: this.dropIn.phase, lean: this.dropIn.lean },
      mantle: !!this.mantle,
      stance: this.tricks.stance,
      pushButton: ridingButtons(this.tricks.stance, this.tricks.controlStyle)
        .pushLabel,
      tailwhipButton: ridingButtons(
        this.tricks.stance,
        this.tricks.controlStyle,
      ).whipLabel,
      rsPreloadAmount: this.preload.amount,
      rsPopDetected: this.preload.popped,
      activeWhip: Math.abs(this.tricks.deck.velocity) > 1,
      whipDirection: Math.sign(this.tricks.deck.velocity),
      whipProgress: this.tricks.deck.progress,
      bumperHeldDuration: this.tricks.bumperHeldDuration,
      rewindCandidate:
        !!this.tricks.pendingBumper ||
        this.tricks.deck.canRewind ||
        this.tricks.bars.canRewind,
      kicklessCandidate:
        !!this.tricks.pendingBumper || this.tricks.deck.canRewind,
      airLeanForwardBack: this.airWeight.shift,
      airYawInput: this.airYawInput,
      spineLaunchVelocity: this.spineLaunchVelocity.toArray(),
      spineLaunchAngle: this.spineLaunchAngle,
      leadingFoot: this.tricks.stance === "regular" ? "left" : "right",
      naturalWhipDirection: this.tricks.naturalDirection,
      naturalBarDirection: this.tricks.naturalDirection,
      activeTrickPrimitive: this.tricks.inputContext,
      deckDirection: Math.sign(this.tricks.deck.velocity),
      deckReversalCount: this.tricks.deck.reversals.length,
      barDirection: Math.sign(this.tricks.bars.velocity),
      barReversalCount: this.tricks.bars.reversals.length,
      currentRewindWindow: {
        deck: this.tricks.deck.canRewind,
        bars: this.tricks.bars.canRewind,
      },
      gestureCandidate: this.tricks.gesture.candidate,
      gestureConfidence: this.tricks.gesture.confidence,
      oppositeWhip:
        this.tricks.deck.originalDirection !== 0 &&
        this.tricks.deck.originalDirection !== this.tricks.naturalDirection,
      running: this.running,
      marker: this.marker.saved,
      airWeight: {
        shift: this.airWeight.shift,
        pitchBias: this.airWeight.pitchBias,
        driftSpent: this.airWeight.driftSpent,
      },
      rampLean: this.rampLean,
      score: {
        total: this.score.total,
        line: this.score.line,
        multiplier: this.score.multiplier,
      },
      fakieSeconds: this.tricks.fakieDuration,
      position: this.position.toArray(),
      velocity: this.velocity.toArray(),
      speed: this.speed,
      yaw: this.yaw,
      spin: this.spin,
      travelState: this.fakie.mode,
      spinAuthority: this.airSpin.authority,
      grounded: this.grounded,
      charge: this.charge,
      pitch: this.pitch,
      deck: this.tricks.deck.angle,
      bars: this.tricks.bars.angle,
      balance: this.manual.balance,
      context: this.context,
      grind: this.grind?.name ?? null,
      grindCandidate: this.grindCandidate,
      line: [...this.tricks.line],
      lastTrick: this.tricks.last,
      lastTrickRecord: this.tricks.history.at(-1) ?? null,
      lastLanding: this.lastLanding,
      elapsed: this.elapsed,
    };
  }
}
