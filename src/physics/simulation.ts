import { activeLayout } from '../editor/layout';

import { inWater } from "../park/water";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { TUNE, clamp, damp, wrap } from "../core/config";
import { Events } from "../core/events";
import { InputFrame } from "../input/input";
import { ridingButtons, StickPreload } from "../input/riding";
import { RidingDiagnostics } from "./diagnostics";
import {
  Park,
  type Rail,
  SPAWNS,
  terrainHeight,
  terrainNormal,
  OUTDOOR,
  ACTIVE_MAP,
} from "../park/park";
import { Tricks } from "../tricks/tricks";
import { ManualBalance } from "../player/manual";
import { classifyLanding, crookedLandingAngle, surfaceAxis } from "../player/landing";
import { pushFoot, sideSign } from "../core/stance";
import { GrindContact, continueGrind, findGrind } from "../grind/grind";
import { FakieControl } from "../player/fakie";
import { AirSpinControl } from "../player/air-spin";
import { GROUPS } from "./groups";
import { ScoreSystem } from "../tricks/score";
import { MarkerSystem } from "../player/marker";
import { outdoorLip } from "../park/outdoor";
import { DropIn } from "../player/drop-in";
import { AirWeightControl } from "../player/air-weight";
import { BodyFlipControl, type TakeoffOrigin } from '../player/body-flip';
import {CrashMotion} from '../player/crash';
import { LongboardMotion } from '../longboard/motion';
import type { RideableKind } from "../data/catalog";
export type { RideableKind };
export type RideState =
  | "Grounded"
  | "Preloading"
  | "Airborne"
  | "Manual"
  | "NoseManual"
  | "Grinding"
  | "Landing"
  | "SketchyLanding"
  | "Stall"
  | "Bail"
  | "Walking"
  | "Sitting"
  | "DropInReady"
  | "DropInCommit";
export class Simulation {
  get rampWorld(){return OUTDOOR || !!activeLayout?.objects.length;}
  body: RAPIER.RigidBody;
  tricks: Tricks;
  score: ScoreSystem;
  rampLean = 0;
  manual = new ManualBalance();
  fakie = new FakieControl();
  airSpin = new AirSpinControl();
  railGuard: RAPIER.Collider;
  /**
   * Contact suppression for the rider's own colliders, applied in the contact
   * filter hook rather than by flipping sensor flags. Rapier keeps sensor and
   * contact pairs in separate graphs; toggling a collider to a sensor while it
   * touched the coping left a stale contact pair that later collided as solid
   * even though the collider reported itself as a sensor.
   */
  guardClear = false;
  riderIntangible = false;
  private chassisHandle = -1;
  private guardHandle = -1;
  /**
   * The one launch of the current air. A natural lip departure records the
   * velocity and normal it left the surface with, before any redirect. A pop
   * inside the departure grace replaces that departure from the recorded state
   * instead of stacking a second impulse on top of it; any later launch writer
   * in the same air is rejected. Cleared whenever the rider is supported again.
   */
  /** Heading and roll when the body flip began; with bodyFlip.basePitch they fix
   * the flip's frame. The flip turns about that frame's side axis and air spin
   * twists about the body's own long axis, so a rider leaving a steep wall
   * rotates as one body instead of corkscrewing around world vertical. */
  flipYaw0 = 0;
  flipRoll0 = 0;
  flipFrame(yaw0 = this.flipYaw0, pitch0 = this.bodyFlip.basePitch, roll0 = this.flipRoll0) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch0, yaw0, roll0, "YXZ"));
  }
  /** The flip angle at which the body's up meets a surface normal, measured about
   * the frame's side axis, within half a turn. */
  private flipLevel(normal: THREE.Vector3, frame: THREE.Quaternion) {
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(frame);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(frame);
    const n = normal.clone().addScaledVector(side, -normal.dot(side));
    if (n.lengthSq() < 1e-6) return 0;
    n.normalize();
    return Math.atan2(side.dot(up.clone().cross(n)), up.dot(n));
  }
  /** Rider orientation during a body flip: frame, then flip, then twist. */
  flipOrientation(yaw = this.yaw) {
    return this.flipFrame()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.bodyFlip.angle))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw - this.flipYaw0));
  }
  /** A released spin finishes on a half turn counted from takeoff (fakie counts). */
  private guideSpin(dt: number, timeToContact: number) {
    const direction = Math.sign(this.spin), turned = this.tricks.yaw * direction;
    const current = Math.abs(this.spin);
    // Settle on the half turn this spin's own momentum is heading for, never one
    // it would not reach: a light tap settles straight instead of becoming a 180
    // (or a 360 on a drop-in), a real flick still finishes its 180/360.
    const reach = turned + current * Math.min(Math.max(0, timeToContact), 1.2) * 0.7;
    // A half turn is only claimed once momentum carries well past its midpoint.
    let goal = Math.floor(reach / Math.PI + 0.25) * Math.PI;
    if (goal < turned - TUNE.spinGuideOvershoot) goal = turned;
    const remaining = goal - turned;
    let desired = 0;
    if (remaining > 0) {
      const finish = Math.max(0.1, timeToContact - TUNE.spinFinishLead);
      desired = Math.min(
        Math.max(TUNE.spinGuideMinRate, remaining / finish),
        TUNE.airMaxSpin,
        Math.sqrt(2 * TUNE.spinGuideAcceleration * remaining),
      );
    }
    const next = desired < current
      ? Math.max(desired, current - TUNE.spinGuideAcceleration * dt)
      : Math.min(desired, current + TUNE.spinGuideAcceleration * dt);
    return direction * next;
  }
  /**
   * The wheels take the line on a crooked landing: travel turns onto the scooter's
   * axis (forward or fakie) and the rider pivots slightly into their travel, so
   * they ride away rather than sliding out sideways. Speed is kept in proportion
   * to how straight the landing was.
   *
   * The axis is the one the deck actually has on this surface (surfaceAxis) and
   * the same one the landing was graded against. It used to be the heading
   * projected onto the surface, which across a steep quarter wall lies up to 60
   * degrees from the deck while the grade compared flat yaw with flat travel:
   * a landing graded sketchy was then turned 60-90 degrees, sending a rider who
   * was coming down back UP the wall (relaunched off the coping on the same
   * tick, up to six times in a row) or reversing their travel along it.
   */
  private absorbCrookedLanding(normal: THREE.Vector3) {
    const heading = surfaceAxis(this.yaw, normal);
    const speed = this.velocity.length();
    if (speed < 0.5 || heading.lengthSq() < 0.5) return;
    const along = this.velocity.dot(heading);
    const axis = heading.clone().multiplyScalar(Math.sign(along) || 1);
    const angle = Math.acos(clamp(Math.abs(along) / speed, -1, 1));
    if (angle < 0.05) return;
    const keep = 1 - (1 - TUNE.crookedKeepAtFail) * clamp(angle / TUNE.failAngle, 0, 1) ** 2;
    const travelYaw = Math.atan2(this.velocity.x, this.velocity.z);
    const axisYaw = Math.atan2(axis.x, axis.z);
    this.yaw += wrap(travelYaw - axisYaw) * TUNE.crookedPivot;
    this.velocity.copy(axis).multiplyScalar(speed * keep);
    const vertical = this.velocity.dot(normal);
    this.velocity.addScaledVector(normal, -vertical);
  }
  /** Fakie at speed wobbles; LS must hold it steady or the rider goes down. */
  fakieWobble = { balance: 0, rate: 0, armed: false };
  /** Only a fakie landing on flat ground at speed arms the wobble; rolling out of a quarter fakie does not. */
  private armFakieWobble(normal: THREE.Vector3) {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const along = (Math.sin(this.yaw) * this.velocity.x + Math.cos(this.yaw) * this.velocity.z) / Math.max(speed, 1e-6);
    this.fakieWobble.armed = normal.y > 0.94 && along < -0.3 && speed > TUNE.pushMaxSpeed * TUNE.fakieWobbleSpeedRatio * 0.72;
  }
  private stepFakieWobble(dt: number, steer: number, fakie: boolean) {
    const threshold = TUNE.pushMaxSpeed * TUNE.fakieWobbleSpeedRatio;
    const w = this.fakieWobble;
    if (!fakie || this.speed < threshold * 0.72) w.armed = false;
    if (!w.armed) {
      w.balance = damp(w.balance, 0, 4, dt);
      w.rate = damp(w.rate, 0, 4, dt);
      return;
    }
    const excess = clamp((this.speed - threshold * 0.72) / (TUNE.pushMaxSpeed - threshold * 0.72), 0, 1.5);
    // Deterministic disturbance from the road, stronger with speed.
    const kick = (Math.sin(this.elapsed * 7.3) + 0.6 * Math.sin(this.elapsed * 13.1 + 1.7)) * TUNE.fakieWobbleKick * excess;
    const accel = w.balance * TUNE.fakieWobbleGrowth * excess + kick - steer * TUNE.fakieWobbleControl - w.rate * 1.2;
    w.rate += accel * dt;
    w.balance += w.rate * dt;
    this.roll += w.balance * 0.25;
    this.yaw += w.rate * 0.02 * dt;
    if (Math.abs(w.balance) > 1) {
      w.balance = w.rate = 0;
      this.bail("Fakie speed wobble");
    }
  }
  /** Rewrites yaw, pitch and roll from the flip orientation for landing checks. */
  private settleFlipOrientation() {
    if (!this.bodyFlip.active) return;
    const q = this.flipOrientation();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    let yaw = this.yaw;
    if (Math.hypot(forward.x, forward.z) > 0.2) yaw = this.yaw + wrap(Math.atan2(forward.x, forward.z) - this.yaw);
    const shift = yaw - this.yaw;
    this.yaw = yaw;
    this.previousYaw += shift;
    const heading = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.pitch = -Math.atan2(-up.dot(heading), up.y);
    this.roll = Math.asin(clamp(-(up.x * Math.cos(yaw) - up.z * Math.sin(yaw)), -1, 1));
  }
  launch: { id: number; kind: "natural" | "pop"; at: number; velocity: THREE.Vector3; normal: THREE.Vector3 } | null = null;
  private launchCount = 0;
  private grindBlocked = 0;
  /** The edge a pop left, with its joined segments; not recaptured this air unless grind is held. */
  private poppedEdge: Rail[] = [];
  private recordLaunch(kind: "natural" | "pop", id = ++this.launchCount) {
    this.launch = { id, kind, at: this.elapsed, velocity: this.velocity.clone(), normal: this.normal.clone() };
  }
  railImpactCooldown = 0;
  dropIn = new DropIn();
  footJumpTimer = 0;
  /**
   * The scooter placed under an airborne rider by Y after an on-foot jump. This
   * is the carried instance put down beneath their feet, never a second
   * scooter: `hasScooter` stays true throughout and landing completes the mount.
   */
  jumpOn: {
    deck: THREE.Vector3;
    yaw: number;
    time: number;
    running: boolean;
    approach: number;
    id: number;
  } | null = null;
  private jumpOnRearm = 0;
  /** True from an A jump on foot until the rider is back on the ground. */
  private footJumped = false;
  private jumpOnId = 0;
  /** Set for one landing when a jump-on succeeded, for the HUD and the rider pose. */
  jumpOnLanded = 0;
  /** Mounted in the air by a jump-on and not yet landed. */
  private jumpOnPending = false;
  mantle: { start: THREE.Vector3; end: THREE.Vector3; time: number } | null =
    null;
  walking = false;
  sitting: { id: string; origin: THREE.Vector3 } | null = null;
  hasScooter = true;
  heldItem:string|null=null;
  running = false;
  marker = new MarkerSystem();
  airWeight = new AirWeightControl();
  bodyFlip = new BodyFlipControl();
  crash:CrashMotion|null=null;
  private flipTakeoffIntent=false;
  /**
   * Which rideable the rider is on or carrying. Shared riding physics (ramps,
   * walls, landings, surface following) serve both; scooter-only systems -
   * grinds, fastplants, stalls, bar and deck tricks, manuals, flips - check it.
   */
  rideable: RideableKind = "scooter";
  board = new LongboardMotion();
  /** The rail a grind hop left, which it may land straight back on. */
  private hopRail: Rail | null = null;
  /**
   * Dropping back in off coping: first the rider turns on the coping to face
   * the ramp, then releases onto the transition facing down it.
   */
  private copingDrop: {
    toward: THREE.Vector3;
    yaw: number;
    time: number;
    released: boolean;
  } | null = null;
  private copingDropHeld = 0;
  /** Where the wheels were on the riding surface last tick, while grounded. */
  private surfaceMemory: {
    point: THREE.Vector3;
    normal: THREE.Vector3;
    centre: number;
  } | null = null;
  private airQuarter:ReturnType<typeof outdoorLip>=null;
  private departureLip:ReturnType<typeof outdoorLip>=null;
  /**
   * The lip under the rider at this instant. Deliberately not cached per tick:
   * position and velocity both change within a step (a pop rewrites velocity,
   * the solver moves position), so each caller needs the value as it stands
   * when it asks.
   */
  private currentLip() {
    return this.rampWorld
      ? outdoorLip(
          this.position.x,
          this.position.z,
          this.velocity.z,
          this.velocity.x,
        )
      : null;
  }
  /**
   * True while a quarter air is still over its own coping. A straight air leaves
   * the rider's centre just inside the lip for the whole flight, where the upper
   * rail guard overlaps the coping; letting it collide on the way down read as a
   * coping case on every clean re-entry.
   */
  private overQuarterLip() {
    const lip = this.airQuarter;
    if (this.grounded || !lip || !("x0" in lip.module)) return false;
    const along = lip.axis === "x" ? this.position.x : this.position.z;
    const distance = (lip.lip - along) * lip.direction;
    return distance > -TUNE.quarterAirClearOutside && distance < TUNE.quarterAirClearInside;
  }
  /**
   * True while the rail guard sits over the coping of the ramp the rider is on.
   * The guard is an upright capsule hung 0.26 m ahead along the HEADING and
   * 0.05-0.81 m above the rider's centre, so on the steep top of a transition it
   * overlaps the coping of the lip the rider faces whichever way they travel.
   * The crossing clearance below keys on travel toward a lip and excludes
   * manuals, so rolling back down under a lip the rider just failed to clear, a
   * fakie roll-in, or a manual up the wall left the guard solid inside that
   * coping: the solver then threw the rider (measured 1.6-6.1 m/s kicks, "Rail
   * impact" bails). Only guard-versus-coping pairs are released, and in the air
   * only while not travelling toward the lip, which is how a real case arrives.
   */
  private guardOverOwnCoping() {
    if (!this.rampWorld || this.grind) return false;
    const facing = outdoorLip(
      this.position.x,
      this.position.z,
      Math.cos(this.yaw),
      Math.sin(this.yaw),
    );
    if (!facing) return false;
    if (this.grounded)
      return this.normal.y < 0.95 || facing.module.kind === "box";
    return this.velocity.dot(facing.forward) <= 0;
  }
  /** Collider handles of every coping pipe, for the contact filter. */
  private copingHandles = new Set<number>();
  private copingRailCount = -1;
  private copingGuardClear = false;
  private launchLip(){
    const current=this.currentLip();
    return current ?? (this.velocity.y>0&&this.elapsed-this.lastGround<TUNE.coyoteTime?this.departureLip:null);
  }
  fastplant: {time:number;foot:THREE.Vector3;entry:THREE.Vector3;launched:boolean}|null=null;
  private plantQueued=-1;
  private plantLatched=false;
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
  pushHoldTime = 0;
  emote: { id: string; time: number; duration: number } | null = null;
  private pendingPushTap = false;
  private lastRS = { x: 0, y: 0 };
  pumpTimer = 0;
  popTimer = 0;
  airTime = 0;
  recovery = 0;
  landTimer = 0;
  landingCompression = 0;
  bailTimer = 0;
  private lastBailGetUpPress = -Infinity;
  stall: {
    anchor: THREE.Vector3;
    direction: THREE.Vector3;
    offset: number;
  } | null = null;
  manualEntryLock = 0;
  manualIntentTime = 0;
  // Sign of the held gentle intent: +1 down (manual), -1 up (nose manual).
  manualIntentSign = 0;
  // Gentle RS held this recently still reads as catch intent, so the held stick
  // survives the AIR -> SUPPORTED transition instead of being cleared by it.
  manualCatchTimer = 0;
  private manualCatchReady = false;
  manualCommand = 0;
  // When the last direct Bri/Inward takeoff left the ground, so a stale support
  // contact just after a valid upward launch cannot be read as a landing.
  briTakeoff = -99;
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
  private releasingRail: number | undefined;
  contactEvents = new RAPIER.EventQueue(true);
  private contactHooks: RAPIER.PhysicsHooks = {
    // Runs inside world.step: only plain numbers may be read here. Touching a
    // Rapier object (body.collider(), collider.handle) re-borrows the world.
    filterContactPair: (a,b) => {
      const chassis = this.chassisHandle, guard = this.guardHandle;
      if (this.riderIntangible && (a === chassis || b === chassis || a === guard || b === guard)) return null;
      if (this.guardClear && (a === guard || b === guard)) return null;
      if (this.copingGuardClear && (a === guard ? this.copingHandles.has(b) : b === guard && this.copingHandles.has(a))) return null;
      return this.grindCooldown > 0 && this.releasingRail !== undefined &&
        (a===this.releasingRail || b===this.releasingRail) ? null : RAPIER.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair: () => true,
  };
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
      RAPIER.ColliderDesc.ball(this.rampWorld ? 0.08 : 0.2)
        .setMass(65)
        .setFriction(0)
        .setRestitution(0)
        .setCollisionGroups(GROUPS.chassis)
        .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
      this.body,
    );
    this.railGuard = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.25, 0.13)
        .setTranslation(0, 0.43, 0.26)
        .setDensity(0)
        .setFriction(0.05)
        .setRestitution(0)
        .setCollisionGroups(GROUPS.railGuard)
        .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS),
      this.body,
    );
    this.chassisHandle = this.body.collider(0).handle;
    this.guardHandle = this.railGuard.handle;
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
          : this.walking?"camera":"riding";
  }
  resolvingSpawn = false;
  reset(index = this.spawnIndex, restart = false) {
    this.crash?.dispose();this.crash=null;

    this.bodyFlip.reset();this.airQuarter=null;
    this.departureLip=null;
    this.fastplant=null;this.plantQueued=-1;this.plantLatched=false;
    this.resolvingSpawn = true;
    this.releasingRail = undefined;
    this.groundIntent = null;
    this.waterBail = false;
    // A released deck and its rearm timer must not survive a respawn.
    this.jumpOn = null;
    this.jumpOnRearm = 0;
    this.jumpOnLanded = 0;
    this.jumpOnPending = false;
    this.footJumped = false;
    this.surfaceMemory = null;
    this.launch = null;
    this.poppedEdge = [];
    this.board.reset();
    this.hopRail = null;
    this.copingDrop = null;
    this.copingDropHeld = 0;
    this.preload.reset();
    this.briTakeoff = -99;
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
    this.riderIntangible = false;
    this.body.collider(0).setCollisionGroups(GROUPS.chassis);
    this.guardClear = false;
    this.copingGuardClear = false;
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
    this.lastBailGetUpPress = -Infinity;
    this.stall = null;
    this.recovery = 0;
    this.popTimer = 0;
    this.hopBuffer = 0;
    this.airTime = 0;
    this.pushTimer = 0;
    this.pushHoldTime = 0;
    this.pendingPushTap = false;
    this.lastLanding = "";
    this.grindCooldown = 0.3;
    this.lastPump = false;
    this.lastSlope = 0;
    this.manualRecorded = false;
    this.lastSpeed = 0;
    this.lastGround = restart ? 0 : this.elapsed;
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
  /**
   * Height of the rider's centre above the surface point directly below it.
   * The centre sits one radius out along the surface normal, which puts it
   * radius / normal.y above the surface at its own x/z. This used to be clamped
   * as if no slope were steeper than 57 degrees, so on the upper part of a
   * quarter the rider sat well inside the transition, the physics ball touched
   * first, and the rider scraped down "airborne" before snapping into place.
   */
  rideHeight(normal: THREE.Vector3) {
    return TUNE.radius / Math.max(TUNE.steepRideNormal, normal.y);
  }
  /**
   * Keeps a grounded rider on the surface, shared by every rideable. The Rapier
   * body stays dynamic for wall and ledge impacts.
   */
  private followSurface(
    support: { height: number; normal: THREE.Vector3; centre: number },
    gap: number,
    speed: number,
  ) {
    if (gap < 0.16 && gap > -0.5) {
      this.position.y = support.centre;
      this.body.setTranslation(this.position, true);
    }
    // Following the surface removes the into-surface component; restoring the
    // magnitude carries that momentum along the surface instead of dropping
    // it. This used to be gated on rampWorld, so the same slope bled speed in
    // the warehouse and preserved it outdoors - the single largest source of
    // "speed feels inconsistent". It now behaves identically on every map.
    // On flat ground the projection removes nothing, so this is a no-op there.
    const surfaceSpeed = this.velocity.length();
    this.velocity.addScaledVector(this.normal, -this.velocity.dot(this.normal));
    if (this.velocity.lengthSq() > 0.00001) this.velocity.setLength(surfaceSpeed);
    this.lastSpeed = speed;
    this.surfaceMemory = {
      point: new THREE.Vector3(this.position.x, support.height, this.position.z),
      normal: support.normal.clone(),
      centre: support.centre,
    };
  }
  /** Roll that lays the scooter flat on a surface sloping across its heading. */
  private sideSlope(normal: THREE.Vector3) {
    return Math.atan2(
      -(normal.x * Math.cos(this.yaw) - normal.z * Math.sin(this.yaw)),
      normal.y,
    );
  }
  private support(): { height: number; normal: THREE.Vector3; centre: number } {
    const p = this.position;
    // Two wheel footprints define the longitudinal riding plane. The center query
    // is retained as a chassis clearance check across a sharp crest or stair tread.
    // The wheelbase lies along the surface, so on a steep transition its
    // horizontal reach shrinks with the slope. Measuring it flat reached two
    // metres up a near-vertical wall and read the deck above as the support.
    const below = terrainNormal(p.x, p.z),
      heading = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)),
      along = heading.clone().projectOnPlane(below),
      reach = along.lengthSq() > 1e-6 ? 0.32 * Math.hypot(along.normalize().x, along.z) : 0.32;
    const dx = Math.sin(this.yaw) * reach,
      dz = Math.cos(this.yaw) * reach;
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
    // Where the rider's centre rests: the lowest height at which a ball of the
    // ride radius clears the terrain around it. On a plane that is the familiar
    // radius / normal.y, but over a convex edge - a coping lip, a spine crest,
    // the end of a deck - the ball rests on the edge itself, where the plane
    // formula overshoots and lifted the rider in a visible hop as they rolled
    // over it. Probing uphill and along the heading finds the touching point.
    const r = TUNE.radius;
    let centre = terrainHeight(p.x, p.z) + r;
    const probe = (x: number, z: number) => {
      for (const f of [0.25, 0.5, 0.7, 0.85, 0.95, 1]) {
        const d = r * f,
          y = terrainHeight(p.x + x * d, p.z + z * d) + Math.sqrt(r * r - d * d);
        if (y > centre) centre = y;
      }
    };
    const slopeX = terrainHeight(p.x + 0.15, p.z) - terrainHeight(p.x - 0.15, p.z),
      slopeZ = terrainHeight(p.x, p.z + 0.15) - terrainHeight(p.x, p.z - 0.15),
      slope = Math.hypot(slopeX, slopeZ);
    if (slope > 1e-4) probe(slopeX / slope, slopeZ / slope);
    probe(heading.x, heading.z);
    probe(-heading.x, -heading.z);
    if (hit && hit.normal.y > 0.4) {
      const y = p.y + 0.28 - hit.timeOfImpact;
      if (y > height + 0.02 && y < p.y + 0.08) {
        height = y;
        normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        centre = Math.max(centre, y + this.rideHeight(normal));
      }
    }
    return { height, normal, centre };
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
    this.guideLaunch(forward);
    this.spineLaunchVelocity.copy(this.velocity);
    this.spineLaunchAngle =
      (Math.atan2(this.velocity.y, Math.abs(this.velocity.z)) * 180) / Math.PI;
  }
  private redirectBox(
    forward: THREE.Vector3,
    charge = 0,
    timing = 0,
    intentional = false,
  ) {
    const across = this.velocity.dot(forward);
    const speed = Math.hypot(Math.max(0, across), this.velocity.y);
    // A box takes off upward first. Faster approaches increase both height and
    // carry, but the forward ratio eases down so speed cannot turn it into a
    // long, flat overshoot.
    const forwardRatio = intentional
      ? clamp(TUNE.boxTrickForwardRatio-Math.max(0,speed-8)*.008,.36,.48)
      : clamp(0.64 - Math.max(0, speed - 4) * 0.014, 0.48, 0.64);
    const vertical =
      speed * Math.sqrt(1 - forwardRatio * forwardRatio) +
        (intentional?0:charge * (0.3 + timing * 0.45));
    this.velocity.addScaledVector(
      forward,
      speed * forwardRatio - across,
    );
    this.velocity.y = Math.max(this.velocity.y, vertical);
    this.guideLaunch(forward);
  }
  /**
   * Where a launch off a box or spine should come down: past the crest and the
   * far lip, on the part of the landing whose slope best matches the angle the
   * rider left at, so the wheels meet it rather than slam into it. Returns the
   * distance along `forward` and the rider's centre height on touchdown.
   */
  private landingTarget(forward: THREE.Vector3, launchAngle: number) {
    const step = 0.1,
      heights: number[] = [];
    for (let s = 0; s <= TUNE.launchGuideReach; s += step)
      heights.push(
        terrainHeight(
          this.position.x + forward.x * s,
          this.position.z + forward.z * s,
        ),
      );
    let crest = 0;
    for (let i = 1; i < heights.length; i++) {
      if (heights[i] >= heights[crest] - 0.005) crest = i;
      else if (heights[crest] - heights[i] > 0.3) break;
    }
    let best = -1,
      bestError = Infinity;
    for (
      let i = crest + Math.round(TUNE.launchGuideLipClear / step);
      i < heights.length - 1;
      i++
    ) {
      if (heights[i] < 0.03) break;
      const down = (heights[i - 1] - heights[i + 1]) / (2 * step);
      if (down <= 0.02) continue;
      const error = Math.abs(Math.atan(down) - launchAngle);
      if (error < bestError - 1e-4) {
        bestError = error;
        best = i;
      }
    }
    if (best < 0) return null;
    const distance = best * step;
    return {
      distance,
      height:
        heights[best] +
        this.rideHeight(
          terrainNormal(
            this.position.x + forward.x * distance,
            this.position.z + forward.z * distance,
          ),
        ),
    };
  }
  /**
   * Guides a box or spine launch onto its landing. Speed is kept; only the
   * takeoff angle eases toward one that comes down on the landing, and only
   * when that is a small correction. A rider well under or over the speed the
   * obstacle is built for would need a large change, gets none, and falls short
   * or overshoots exactly as they arrived.
   */
  private guideLaunch(forward: THREE.Vector3) {
    const along = Math.max(0, this.velocity.dot(forward)),
      up = this.velocity.y,
      speed = Math.hypot(along, up);
    if (speed < 2 || up <= 0) return;
    const natural = Math.atan2(up, along);
    const target = this.landingTarget(forward, natural);
    if (!target) return;
    const g = TUNE.gravity,
      dx = target.distance,
      dy = target.height - this.position.y,
      v2 = speed * speed,
      disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
    if (disc < 0) return;
    const high = Math.atan((v2 + Math.sqrt(disc)) / (g * dx)),
      low = Math.atan((v2 - Math.sqrt(disc)) / (g * dx)),
      aim = Math.abs(high - natural) <= Math.abs(low - natural) ? high : low;
    const weight = clamp(
      (TUNE.launchGuideMax - Math.abs(aim - natural)) /
        (TUNE.launchGuideMax - TUNE.launchGuideFull),
      0,
      1,
    );
    if (weight === 0) return;
    const angle = natural + (aim - natural) * weight;
    this.diagnostics.assist(this.elapsed, "launch guide", { angleChange_rad: +(angle - natural).toFixed(3), weight: +weight.toFixed(2), speed: +speed.toFixed(2) });
    this.velocity.addScaledVector(forward, speed * Math.cos(angle) - along);
    this.velocity.y = speed * Math.sin(angle);
  }
  // Leaving a quarter lip without a deliberate pop. The transition turns the
  // momentum the rider already has; it never assigns jump energy. Plane speed is
  // conserved and only the split between outward and upward changes, which is
  // why bounding the ratio shortens the throw away from the coping WITHOUT
  // touching launch height, gravity or horizontal speed generally. Both natural
  // rollout paths share this one calculation so they cannot drift apart.
  private quarterRollout(
    forward: THREE.Vector3,
    lean: number,
  ) {
    const planeSpeed = Math.hypot(this.velocity.dot(forward), this.velocity.y);
    const ratio = clamp(
      (planeSpeed - TUNE.quarterOverDeckSpeed) * TUNE.quarterRolloutSpeedGain -
        clamp(lean, 0, 1) * TUNE.quarterLeanRatio +
        clamp(-lean, 0, 1) * TUNE.quarterDeckLeanRatio,
      TUNE.quarterRolloutRatioMin,
      Math.max(TUNE.quarterRolloutRatioMax, clamp(-lean, 0, 1) * TUNE.quarterDeckLeanRatio),
    );
    const outwardBefore = this.velocity.dot(forward);
    this.velocity.addScaledVector(
      forward,
      planeSpeed * ratio - this.velocity.dot(forward),
    );
    this.velocity.y = planeSpeed * Math.sqrt(Math.max(0, 1 - ratio * ratio));
    this.diagnostics.assist(this.elapsed, "quarter rollout", { outwardRatio: +ratio.toFixed(3), outwardChange_mps: +(planeSpeed * ratio - outwardBefore).toFixed(2), planeSpeed: +planeSpeed.toFixed(2) });
  }
  private pop(charge: number, lean = 0, origin:TakeoffOrigin='trick_initiated_pop') {
    const replacing = !this.grounded && !this.grind && this.launch;
    const fromGrind = !!this.grind;
    if (replacing) {
      if (replacing.kind === "pop" || this.elapsed - replacing.at > TUNE.coyoteTime + 1e-6) return;
      // Undo the departure's redirect; gravity since the departure still applies.
      this.velocity.copy(replacing.velocity);
      this.velocity.y -= TUNE.gravity * (this.elapsed - replacing.at);
      this.normal.copy(replacing.normal);
    }
    const grindVelocity = this.grind
      ? this.grind.direction.clone().multiplyScalar(this.grind.speed).add(
          new THREE.Vector3(this.grind.direction.z, 0, -this.grind.direction.x)
            .normalize().multiplyScalar(this.grind.lateralSpeed),
        )
      : null;
    this.bodyFlip.begin(origin,this.pitch);
    this.body.setGravityScale(1,true);
    const linked = this.manual.active || fromGrind;
    if (this.grind) {
      const rail = this.grind.rail, near = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceTo(b) < TUNE.grindJoinDistance;
      const edge = [rail];
      for (let grew = true; grew; ) {
        grew = false;
        for (const r of this.park.rails)
          if (!edge.includes(r) && edge.some((e) => near(e.a, r.a) || near(e.a, r.b) || near(e.b, r.a) || near(e.b, r.b))) { edge.push(r); grew = true; }
      }
      this.poppedEdge = edge;
    }
    this.finishManual();
    this.finishGrind();
    if (grindVelocity) this.velocity.copy(grindVelocity);
    const rampPop = !fromGrind && this.normal.y < 0.85 && this.velocity.y > 1;
    const rampRise = Math.max(0, this.velocity.y);
    const popLip = fromGrind ? null : this.launchLip(), boxPop = popLip?.module.kind === "box" && popLip.distance > -0.25 && popLip.distance < 1.25;
    const popHeight = boxPop ? TUNE.boxTrickPopHeight + charge * TUNE.boxTrickPopChargeHeight : TUNE.rampTrickPopHeight + charge * TUNE.rampTrickPopChargeHeight;
    const hop = origin==='fastplant' ? (rampPop?2.4:4.8) : rampPop
      ? Math.sqrt(rampRise * rampRise + 2 * TUNE.gravity * popHeight) - rampRise
      : TUNE.hopMin + (TUNE.hopMax - TUNE.hopMin) * charge;
    if (!rampPop && origin!=='fastplant')
      this.velocity.addScaledVector(this.normal, 0.8 + charge * 0.4);
    this.velocity.y = Math.max(0, this.velocity.y) + hop;
    if(origin==='manual_hop'&&this.flipTakeoffIntent)this.velocity.y+=TUNE.flipTakeoffContribution;
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
    // The lip this pop leaves is the one under the rider when it was asked for
    // (popLip). Looking it up again here read the velocity after the pop had
    // already turned it: the lip helper only answers while travel heads toward
    // the lip, so an LS-back lean (up to 49 degrees) that tipped the travel
    // past vertical made the lip vanish, skipped its bounded takeoff below, and
    // threw the rider 3-3.7 m/s backward off the quarter, spine or box.
    const lip = popLip ?? (fromGrind ? null : this.launchLip());
    this.airQuarter=lip?.module.kind==="quarter"?lip:null;
    if (lip && lip.distance > -0.25 && lip.distance < 1.25) {
      // A deliberate takeoff owns the coping for the rest of its short
      // approach. The terrain stays solid; only the thin coping guard stops
      // behaving like a wall under a valid upward takeoff.
      const towardLip = Math.max(2, Math.abs(this.velocity.dot(lip.forward)));
      const clearance = clamp((lip.distance + 0.35) / towardLip, 0.14, 0.46);
      const timing = clamp(1 - Math.abs(lip.distance - 0.1) / 0.85, 0, 1);
      this.lipClearTimer = Math.max(this.lipClearTimer, clearance);
      if (lip.module.kind === "spine")
        this.redirectSpine(lip.direction, lean, lip.forward);
      else if (lip.module.kind === "box")
        this.redirectBox(lip.forward, charge, timing, true);
      else if (lip.module.kind === "quarter") {
        const speed = Math.hypot(
          this.velocity.dot(lip.forward),
          this.velocity.y,
        );
        // Match the useful spine transfer: clear the lip mostly upward, with
        // only enough outward travel to keep the rider from clipping coping.
        const ratio = clamp(
          -0.035 + Math.max(0, speed - 12) * 0.003 - clamp(lean, -1, 1) * 0.09,
          -0.07,
          0.11,
        );
        this.velocity.addScaledVector(
          lip.forward,
          speed * ratio - this.velocity.dot(lip.forward),
        );
        this.velocity.y = speed * Math.sqrt(1 - ratio * ratio);
        // Timing at coping is useful but remains a small rider extension,
        // never an arcade launch multiplier.
        this.velocity.y += timing * (0.12 + charge * 0.22);
      }
    }
    if (!replacing)
      this.body.setTranslation(
        this.position.clone().add(new THREE.Vector3(0, fromGrind ? 0.12 : 0.06, 0)),
        true,
      );
    this.recordLaunch("pop", replacing ? replacing.id : undefined);
    this.grounded = false;
    this.state = "Airborne";
    this.popTimer = 0.15;
    this.airTime = 0;
    this.charge = 0;
    this.hopBuffer = 0;
    this.spin = 0;
    this.tricks.startAir(linked, true);
    this.lastGround=-99;
    this.departureLip=null;
    this.airWeight.reset(this.pitch, this.yaw);
    this.airSpin.reset();
    if (!replacing) this.events.emit({ type: "pop", charge });
  }
  fastplantOpportunity() {
    if(!this.grounded||this.walking||this.grind||this.stall||this.dropIn.phase||this.state==='Bail'||this.speed<3||this.tricks.airborne)return null;
    const forward=new THREE.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
    if(this.velocity.clone().setY(0).normalize().dot(forward)<.65)return null;
    const supportAt=(p:THREE.Vector3)=>{
      const ray=new RAPIER.Ray({x:p.x,y:this.position.y+.35,z:p.z},{x:0,y:-1,z:0});
      const hit=this.world.castRayAndGetNormal(ray,6,true,undefined,undefined,undefined,this.body,c=>!this.park.railHandles.has(c.handle));
      return hit&&hit.normal.y>.3?this.position.y+.35-hit.timeOfImpact:null;
    };
    // The planted foot is the pushing (rear) foot: the rider's right in Regular.
    const side=sideSign(pushFoot(this.tricks.stance));
    const foot=this.position.clone().add(new THREE.Vector3(Math.cos(this.yaw)*side*.23,0,-Math.sin(this.yaw)*side*.23));
    const ground=supportAt(foot);if(ground===null||Math.abs(this.position.y-.22-ground)>.32)return null;
    foot.y=ground;
    let drop=0;
    for(const distance of [.6,1,1.6]){const h=supportAt(this.position.clone().addScaledVector(forward,distance));if(h!==null)drop=Math.max(drop,ground-h);}
    const lip=this.currentLip();
    const ramp=!!lip&&lip.distance>-.1&&lip.distance<.85&&this.normal.y<.85&&this.velocity.y>1;
    if(!ramp&&drop<.75)return null;
    const vy=Math.max(0,this.velocity.y)+(ramp?2.4:4.8);
    const airtime=(vy+Math.sqrt(vy*vy+2*TUNE.gravity*drop))/TUNE.gravity;
    return airtime>=TUNE.fastplantMinAirtime?{foot,airtime}:null;
  }
  private updateFastplant(dt:number,input:InputFrame):InputFrame|null {
    if(input.held.hop<.5&&!input.pressed.hop)this.plantLatched=false;
    if(this.fastplant){
      const plant=this.fastplant;plant.time+=dt;
      if(!plant.launched){
        if(!this.grounded||this.state==='Bail'){this.fastplant=null;return input;}
        this.charge=Math.sin(Math.min(1,plant.time/TUNE.fastplantContactTime)*Math.PI)*.85;
        this.velocity.set(0,0,0);this.body.setLinvel(this.velocity,true);this.body.setGravityScale(0,true);
        if(plant.time<TUNE.fastplantContactTime){this.world.step(this.contactEvents,this.contactHooks);return null;}
        plant.launched=true;this.velocity.copy(plant.entry);
        this.pop(0,0,'fastplant');this.tricks.fastplant=true;
        this.bodyFlip.active=true;this.bodyFlip.velocity=TUNE.flipMaxRate;
        this.body.setLinvel(this.velocity,true);return null;
      }
      if(plant.time>.42||this.grounded||this.state==='Bail')this.fastplant=null;
    }
    const opportunity=this.fastplantOpportunity();
    if(!this.plantLatched&&this.plantQueued<0&&input.pressed.hop&&opportunity)this.plantQueued=0;
    if(this.plantQueued>=0){
      this.plantQueued+=dt;
      if(opportunity&&input.held.pumpGrind>.5&&input.lean<-.35){
        this.fastplant={time:0,foot:opportunity.foot,entry:this.velocity.clone(),launched:false};
        this.plantQueued=-1;this.plantLatched=true;this.preload.reset();this.hopBuffer=0;this.pendingPushTap=false;return null;
      }
      if(this.plantQueued<TUNE.fastplantChordWindow)return {...input,held:{...input.held,hop:0},pressed:{...input.pressed,hop:false}};
      this.plantQueued=-1;return {...input,pressed:{...input.pressed,hop:true}};
    }
    if(this.plantLatched)return {...input,held:{...input.held,hop:0},pressed:{...input.pressed,hop:false}};
    return input;
  }
  private footBrakeHeld = 0;
  bail(reason: string, runaway = false) {
    if (this.state === "Bail") return;
    this.crash?.dispose();this.crash=new CrashMotion(this.world,this.position,this.velocity,this.yaw,this.pitch,runaway);
    this.state = "Bail";
    this.getUpTimer = 0;
    this.bodyFlip.reset();this.airQuarter=null;
    this.fastplant=null;this.plantQueued=-1;
    this.preload.reset();
    this.grounded = false;
    this.bailTimer = 0;
    this.lastBailGetUpPress = -Infinity;
    this.manual.reset();
    this.grind = null;
    this.riderIntangible = false;
    this.guardClear = false;
    this.fakie.reset();
    this.tricks.finish("failed");
    this.tricks.reset();
    this.charge = 0;
    this.hopBuffer = 0;
    this.spin = 0;
    this.body.setGravityScale(0, true);this.body.setLinvel({x:0,y:0,z:0},true);
    this.riderIntangible = true;this.guardClear = true;
    this.groundIntent=null;this.dropIn.reset();this.stall=null;
    this.hopRail=null;this.copingDrop=null;
    this.events.emit({ type: "bail", reason });
  }
  private startStall(forward: THREE.Vector3) {
    const direction = forward.clone().setY(0);
    if (direction.lengthSq() < 0.01)
      direction.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    else direction.normalize();
    this.stall = { anchor: this.position.clone(), direction, offset: 0 };
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.state = "Stall";
    this.finishManual();
    this.preload.reset();
    this.tricks.finish("clean");
    this.body.collider(0).setCollisionGroups(GROUPS.chassisSurfaceOnly);
    this.guardClear = true;
    this.body.setTranslation(this.position, true);
    this.body.setLinvel(this.velocity, true);
    this.events.emit({
      type: "marker",
      message: "SPINE STALL / LEAN LS TO DROP",
      progress: 0,
    });
  }
  private stepStall(dt: number, input: InputFrame) {
    const stall = this.stall;
    if (!stall) return false;
    const gesture=this.tricks.gesture.step(dt,input.rx,input.ry);
    const loaded=this.preload.step(dt,input,true,Math.abs(input.rx)>.45);
    const whip=ridingButtons(this.tricks.stance,this.tricks.controlStyle).whip;
    if(input.pressed[whip] || input.pressed.brakeBars || gesture?.kind==="bri" || loaded!==null){
      this.stall=null;
      this.pop(loaded ?? Math.max(.15,this.preload.amount),input.lean);
      this.lipClearTimer=.3;
      if(gesture?.kind==="bri")this.tricks.bri.kick(gesture.direction*(gesture.short?this.tricks.naturalDirection:1));
      return false;
    }
    const side = new THREE.Vector3(stall.direction.z, 0, -stall.direction.x);
    stall.offset = clamp(stall.offset + input.steer * dt * 0.8, -0.8, 0.8);
    this.position.copy(stall.anchor).addScaledVector(side, stall.offset);
    this.yaw = damp(
      this.yaw,
      Math.atan2(stall.direction.x, stall.direction.z),
      7,
      dt,
    );
    this.pitch = damp(this.pitch, 0, 8, dt);
    this.roll = damp(this.roll, input.steer * 0.08, 8, dt);
    if (Math.abs(input.lean) > 0.58) {
      const release = stall.direction
        .clone()
        .multiplyScalar(input.lean < 0 ? 1 : -1);
      this.velocity.copy(release.multiplyScalar(2.8));
      this.velocity.y = 0.65;
      this.yaw = Math.atan2(release.x, release.z);
      this.grounded = false;
      this.state = "Airborne";
      this.airTime = 0;
      this.lipClearTimer = TUNE.transitionRailClearTime;
      this.body.setGravityScale(1, true);
      this.tricks.startAir(false, true);
      this.bodyFlip.begin('natural_ramp_air',this.pitch);
      this.airWeight.reset(this.pitch, this.yaw);
      this.airSpin.reset();
      this.stall = null;
    }
    this.body.setTranslation(this.position, true);
    this.score.observe(this.tricks.attempt);
    this.body.setLinvel(this.velocity, true);
    this.body.setRotation(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw),
      true,
    );
    return true;
  }
  recoverLocally() {
    const origin = this.waterBail||!Number.isFinite(this.position.lengthSq()) ? this.lastSafeGround : this.position;
    let target: THREE.Vector3 | null = null;
    const usable=(c:RAPIER.Collider)=>!c.isSensor()&&!this.park.railHandles.has(c.handle)&&c.parent()!==this.crash?.rider&&c.parent()!==this.crash?.scooter;
    for(const center of [origin,this.lastSafeGround]){
    for (const radius of [0, 0.6, 1.2, 2, 3, 5, 8]) {
      for (let i = 0; i < 16; i++) {
        const x = center.x + Math.cos((i * Math.PI) / 8) * radius;
        const z = center.z + Math.sin((i * Math.PI) / 8) * radius;
        if (this.rampWorld && inWater(x, z, 1.08)) continue;
        const top=Math.max(center.y+1.8,terrainHeight(x,z)+1.8);
        const hit=this.world.castRayAndGetNormal(new RAPIER.Ray({x,y:top,z},{x:0,y:-1,z:0}),Math.max(4,top-terrainHeight(x,z)+1),true,undefined,undefined,undefined,this.body,usable);
        if(!hit||hit.normal.y<.75)continue;
        const p = new THREE.Vector3(x,top-hit.timeOfImpact+TUNE.radius+.015,z);
        if (
          this.world.intersectionWithShape(
            p.clone().add(new THREE.Vector3(0, 0.65, 0)),
            { x: 0, y: 0, z: 0, w: 1 },
            new RAPIER.Capsule(0.35, 0.22),
            undefined,
            GROUPS.chassis,
            undefined,
            this.body,
            usable,
          )
        )
          continue;
        target = p;
        break;
      }
      if (target) break;
    }
    if(target)break;
    }
    if (!target) {
      return;
    }
    this.crash?.dispose();this.crash=null;
    this.position.copy(target);
    this.previousPosition.copy(target);
    this.body.setTranslation(target, true);
    this.velocity.set(0, 0, 0);
    this.body.setLinvel(this.velocity, true);
    this.body.setGravityScale(1, true);
    this.riderIntangible = false;
    this.guardClear = false;
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
    this.getUpTimer = 0.75;
    this.bailTimer = 0;
    this.lastBailGetUpPress = -Infinity;
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
      this.launch = null;
      this.releasingRail = this.grind.rail.colliderHandle;
      if (this.grindDuration > 0.08) this.tricks.add(this.grind.name);
      this.grind = null;
      this.grindCooldown = 0.22;
      this.riderIntangible = false;
      this.guardClear = false;
      this.body.setGravityScale(1, true);
    }
  }
  /**
   * A light RS flick on a rail hops in place over it. The rider keeps their
   * speed along the rail, rises a hand's width, and may land straight back on
   * the same rail; LS weight during the hop sets the stance they land in, which
   * is how Feeble and Smith are swapped mid-grind. A full load still pops off.
   */
  private grindHop() {
    const g = this.grind!;
    const along = g.direction.clone().multiplyScalar(g.speed);
    this.finishGrind();
    this.hopRail = g.rail;
    this.grindCooldown = TUNE.grindHopWindow;
    this.velocity.copy(along);
    this.velocity.y = Math.max(0, along.y) + TUNE.grindHopSpeed;
    this.recordLaunch("pop");
    this.body.setLinvel(this.velocity, true);
    this.grounded = false;
    this.state = "Airborne";
    this.airTime = 0;
    this.popTimer = 0;
    this.hopBuffer = 0;
    this.spin = 0;
    this.preload.reset();
    this.tricks.startAir(true);
    this.bodyFlip.begin("manual_hop", this.pitch);
    this.airWeight.reset(this.pitch, this.yaw);
    this.airSpin.reset();
    this.events.emit({ type: "pop", charge: 0 });
  }
  /**
   * Which way steering drops the rider off coping and back into a ramp: +1 or
   * -1 along the rail's side axis, or 0 when the steered side is not a
   * transition (the deck behind a quarter, or open ground).
   */
  private copingDropSide(g: GrindContact, side: THREE.Vector3, steer: number) {
    if (!g.rail.coping || Math.abs(steer) < TUNE.copingDropSteer) return 0;
    // Stick right moves the rider to their right, which is -side.
    const toward = -Math.sign(steer);
    const rail = g.rail.a.clone().lerp(g.rail.b, clamp(g.t, 0, 1));
    const beyond = terrainHeight(
      rail.x + side.x * toward * 0.6,
      rail.z + side.z * toward * 0.6,
    );
    return terrainHeight(rail.x, rail.z) - beyond > 0.3 ? toward : 0;
  }
  private releaseCopingDrop() {
    const g = this.grind,
      drop = this.copingDrop;
    if (!g || !drop) return;
    const along = g.direction.clone().multiplyScalar(g.speed).setY(0);
    this.finishGrind();
    this.velocity
      .copy(drop.toward)
      .multiplyScalar(TUNE.copingDropPush)
      .addScaledVector(along, TUNE.copingDropCarry);
    this.velocity.y = -0.3;
    this.body.setLinvel(this.velocity, true);
    drop.released = true;
    drop.time = 0;
    this.grounded = false;
    this.state = "Airborne";
    this.airTime = 0;
    this.popTimer = 0;
    this.spin = 0;
    this.lipClearTimer = TUNE.copingDropClearTime;
    this.tricks.startAir(true);
    this.bodyFlip.begin("natural_ramp_air", this.pitch);
    this.airWeight.reset(this.pitch, this.yaw);
    this.airSpin.reset();
  }
  private hasGrindOverride(input: InputFrame) {
    const buttons = ridingButtons(this.tricks.stance, this.tricks.controlStyle);
    return (
      !!this.groundIntent ||
      this.preload.amount > 0.08 ||
      this.tricks.gesture.confidence > 0.08 ||




      this.tricks.poseBlend > 0.05 ||

      input.pressed[buttons.whip] ||
      input.pressed.brakeBars ||
      input.held.body > 0.3 ||
      input.held.leftModifier > 0.3 ||
      input.held.rightModifier > 0.3 ||
      Math.abs(input.rx) > 0.58 ||
      Math.abs(input.ry) > 0.58
    );
  }
  /**
   * Where the rider sits on a rail: the band of lateral offsets along `side`
   * and the centre height above the rail line. See TUNE.grindPipeRadius.
   * `lateral` is the rider's current offset along `side`: until the wheels are
   * outboard of the pipe they ride over its surface rather than through it.
   */
  /**
   * How far along a rail the rider is, 0..1, measured in plan view. The rider
   * sits above a sloped rail, so projecting in 3D would read a rider over a
   * downhill segment as behind its start.
   */
  private railProgress(rail: Rail) {
    const run = rail.b.clone().sub(rail.a).setY(0);
    return this.position.clone().sub(rail.a).setY(0).dot(run) / Math.max(1e-6, run.lengthSq());
  }
  /** The pitch of a scooter lying along a rail direction, facing the rider's heading. */
  private railPitch(direction: THREE.Vector3) {
    const heading = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const along = direction.clone().multiplyScalar(Math.sign(direction.dot(heading)) || 1);
    return -Math.asin(clamp(along.y, -1, 1));
  }
  private grindSeat(rail: Rail, direction: THREE.Vector3, side: THREE.Vector3, lateral = Infinity) {
    if (!rail.solid)
      return { low: -TUNE.grindMaxOffset, high: TUNE.grindMaxOffset, height: TUNE.grindCentreHeight, seating: false };
    const outboard = rail.solid.dot(side) > 0 ? -1 : 1;
    const r = TUNE.grindPipeRadius,
      offset = lateral * outboard,
      dip = TUNE.grindDeckHalfLength * Math.abs(Math.sin(wrap(this.pitch - this.railPitch(direction))));
    // Lowest rider centre at which no part of the underside envelope is inside
    // the pipe, given where the scooter actually is across it.
    let base = -Infinity;
    for (const [halfWidth, lowest] of TUNE.grindUnderside) {
      const nearest = clamp(0, offset - halfWidth, offset + halfWidth);
      if (Math.abs(nearest) < r)
        base = Math.max(base, Math.sqrt(r * r - nearest * nearest) - lowest + dip);
    }
    const seatBase = (() => {
      const [halfWidth, lowest] = TUNE.grindUnderside[TUNE.grindUnderside.length - 1];
      const nearest = Math.min(Math.max(TUNE.grindSeatOffset - halfWidth, 0), r * 0.999);
      return Math.sqrt(r * r - nearest * nearest) - lowest + dip;
    })();
    return {
      low: outboard > 0 ? TUNE.grindSeatOffset : -TUNE.grindEdgeMaxOffset,
      high: outboard > 0 ? TUNE.grindEdgeMaxOffset : -TUNE.grindSeatOffset,
      // The envelope is measured square to the rail; a sloped rail needs more rise.
      height: (TUNE.radius + TUNE.grindSeatClearance + Math.max(base, seatBase)) /
        Math.sqrt(Math.max(0.2, 1 - direction.y * direction.y)),
      seating: offset < TUNE.grindSeatOffset - 0.005,
    };
  }
  private captureGrind(input: InputFrame) {
    if (
      this.rideable === "longboard" ||
      this.grounded ||
      this.walking ||
      this.grind
    )
      return;
    // Tricks, a transition exit, and a drop-in all have a higher priority than a rail.
    const lip = this.currentLip();
    const transitionExit =
      !!lip &&
      lip.distance > -0.35 &&
      lip.distance < 1.1 &&
      (this.normal.y < 0.97 || this.rampLean > 0.08 || this.velocity.y > 0.35);
    if (this.dropIn.phase || this.popTimer>0 || transitionExit) {
      this.grindCandidate = "—";
      return;
    }
    // A grind hop comes back down onto its rail; catching it at the apex made
    // the hop too short to see or to change stance in.
    if (this.hopRail && this.velocity.y > 0) return;
    const contact = this.position.clone().add(new THREE.Vector3(0, -0.12, 0));
    // Sweep a single fixed physics step ahead so a valid deck contact engages
    // before the rigid-body rail collision can bounce it away.
    const rails=this.park.rails.filter(r=>(this.grindCooldown<=0||r.colliderHandle!==this.releasingRail||r===this.hopRail)&&(input.held.pumpGrind>0.3||!this.poppedEdge.includes(r)));
    const intentional = input.held.pumpGrind > 0.3;
    const probe = (point: THREE.Vector3) =>
      findGrind(rails, point, this.velocity, this.yaw, this.pitch, this.grindAssist, intentional) ??
      findGrind(rails, point.clone().addScaledVector(this.velocity, TUNE.step),
        this.velocity, this.yaw, this.pitch, this.grindAssist, intentional);
    // A held grind also locks in when a wheel end reaches the rail first. The
    // centre probe alone let a nose-down wheel sink into a rising ledge pipe
    // before the centre came within reach.
    const wheelProbe = (end: number) => {
      const reach = end * TUNE.grindWheelReach;
      return contact.clone().add(new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch) * reach,
        -Math.sin(this.pitch) * reach,
        Math.cos(this.yaw) * Math.cos(this.pitch) * reach,
      ));
    };
    const candidate = probe(contact) ?? (intentional ? probe(wheelProbe(1)) ?? probe(wheelProbe(-1)) : null);
    this.grindCandidate = candidate?.rail.id ?? "—";
    if (
      candidate && Math.abs(wrap(this.pitch))<.55 &&
      this.tricks.deck.mismatch < 0.45 &&
      this.tricks.bars.mismatch < 0.45 && this.tricks.bri.mismatch < .35 && this.tricks.kickless.mismatch < .35
    ) {
      this.tricks.finish("clean");
      this.grind = candidate;
      {
        const side = new THREE.Vector3(candidate.direction.z, 0, -candidate.direction.x).normalize();
        const seat = this.grindSeat(candidate.rail, candidate.direction, side);
        candidate.contactOffset = clamp(candidate.contactOffset, seat.low, seat.high);
        // The deck lies along the rail. Only the Smith/Feeble tilt chosen during a
        // grind hop carries over; an air pitch still easing toward the ground below
        // is not a stance.
        candidate.stancePitch = this.hopRail
          ? clamp(
              wrap(candidate.entryPitch - this.railPitch(candidate.direction)),
              -TUNE.grindStancePitch,
              TUNE.grindStancePitch,
            )
          : 0;
      }
      this.grindDuration = 0;
      this.hopRail = null;
      this.copingDrop = null;
      this.velocity.y = candidate.direction.y * candidate.speed;
      this.body.setGravityScale(0, true);
      this.riderIntangible = false;
      this.body.collider(0).setCollisionGroups(GROUPS.chassisSurfaceOnly);
      this.guardClear = true;
      this.launch = null;
      this.state = "Grinding";
      // Preserve the rider's approach on entry. The lower spring below blends
      // into the rail over a moment instead of snapping to a fixed track.
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
    this.updateJumpOn(dt);
    this.body.collider(0).setCollisionGroups(GROUPS.chassis);
    this.guardClear = false;
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
    if (this.grounded) this.footJumped = false;
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
        this.footJumped = true;
      }
    }
    // Y in the air after an A jump puts the carried scooter down under the
    // rider's feet. Jumping on its own never releases it.
    if (
      input.pressed.body &&
      this.footJumped &&
      !this.grounded &&
      !this.jumpOn &&
      this.hasScooter &&
      this.jumpOnRearm === 0 &&
      !this.sitting
    ) {
      const travel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
      const heading =
        travel.lengthSq() > 0.04
          ? travel.clone().normalize()
          : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.jumpOn = {
        deck: this.position.clone().setY(this.position.y - TUNE.radius),
        yaw: Math.atan2(heading.x, heading.z),
        time: 0,
        running: this.running,
        approach: travel.length(),
        id: ++this.jumpOnId,
      };
      this.mountInAir(this.jumpOn, heading);
      return;
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
    this.world.step(this.contactEvents, this.contactHooks);
    this.position.copy(this.body.translation());
    this.velocity.copy(this.body.linvel());
    if (!this.grounded || this.walking || this.grind || this.manual.active || input.held.brake > 0.35) {
      this.pushHoldTime = 0;
      this.pendingPushTap = false;
    }
    this.tricks.tick(dt, false);
  }
  /**
   * Carries a placed deck down under the rider and completes the mount on
   * touchdown. The deck stays beneath their feet, so where they land is where
   * the scooter is; the only way to miss is an obstructed landing spot, and then
   * the rider simply lands on foot.
   */
  private updateJumpOn(dt: number) {
    this.jumpOnLanded = Math.max(0, this.jumpOnLanded - dt);
    this.jumpOnRearm = Math.max(0, this.jumpOnRearm - dt);
    const attempt = this.jumpOn;
    if (!attempt) return;
    // Mounted in the air: the attempt only times the hands pulling the deck in.
    if (!this.walking) {
      attempt.time += dt;
      attempt.deck.set(this.position.x, this.position.y - TUNE.radius, this.position.z);
      if (attempt.time > TUNE.jumpOnPullTime || this.grounded || (this.state as RideState) === "Bail") this.jumpOn = null;
      return;
    }
    attempt.time += dt;
    attempt.deck.set(this.position.x, this.support().height, this.position.z);
    if (
      attempt.time > TUNE.jumpOnWindow ||
      (this.state as RideState) === "Bail" ||
      !this.walking ||
      (this.grounded && this.footJumpTimer === 0)
    ) {
      this.jumpOn = null;
      return;
    }
    // Never at the apex: the rider has to actually come down onto the deck.
    if (this.velocity.y >= 0) return;
    const rise = this.position.y - TUNE.radius - attempt.deck.y;
    // Counts the fall still to come this tick, so a fast descent cannot step
    // straight past the deck and land on foot instead.
    if (rise > TUNE.jumpOnCaptureHeight - this.velocity.y * dt || rise < -0.3)
      return;
    const travel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    const heading = new THREE.Vector3(
      Math.sin(attempt.yaw),
      0,
      Math.cos(attempt.yaw),
    );
    if (
      this.world.intersectionWithShape(
        new THREE.Vector3(attempt.deck.x, attempt.deck.y + 0.35, attempt.deck.z),
        { x: 0, y: 0, z: 0, w: 1 },
        new RAPIER.Ball(0.22),
        undefined,
        GROUPS.chassis,
        undefined,
        this.body,
      )
    )
      return;
    // Only horizontal approach feeds the bonus: falling faster must never turn
    // into forward speed. A committed running approach earns it; a standing hop
    // mounts cleanly but earns nothing, and the rearm timer stops a mount and
    // dismount loop from farming it.
    const committed =
      attempt.running && attempt.approach >= TUNE.jumpOnRunSpeed;
    // Only travel along the deck counts: sideways drift in the air is not speed.
    const along = Math.max(0, travel.dot(heading));
    const speed = Math.min(
      TUNE.pushMaxSpeed,
      Math.max(along, Math.min(attempt.approach, along + 1)) +
        (committed ? TUNE.jumpOnBoost : 0),
    );
    this.walking = false;
    this.running = false;
    this.yaw = this.previousYaw = attempt.yaw;
    this.position.set(
      attempt.deck.x,
      attempt.deck.y + TUNE.radius,
      attempt.deck.z,
    );
    this.previousPosition.copy(this.position);
    this.body.setTranslation(this.position, true);
    this.velocity.copy(heading.multiplyScalar(speed));
    this.body.setLinvel(this.velocity, true);
    this.grounded = true;
    this.state = "Landing";
    this.landTimer = 0.3;
    this.landingCompression = 0.9;
    this.jumpOn = null;
    this.footJumped = false;
    this.jumpOnRearm = TUNE.jumpOnRearm;
    this.jumpOnLanded = 0.55;
    this.finishManual();
    this.events.emit({ type: "dismount", walking: false });
  }
  /**
   * Y in the air after an on-foot A jump: the rider's hands pull the scooter up
   * under their feet and they are riding from that moment. Everything a normal
   * air has then applies: LS pitch and spin, flips, and a landing graded and
   * aligned against the surface they come down on (a ramp, a drop-in, flat).
   * Vertical motion is untouched; a committed running approach adds the bounded
   * jump-on bonus along the heading once.
   */
  private mountInAir(attempt: NonNullable<Simulation["jumpOn"]>, heading: THREE.Vector3) {
    const travel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
    const committed = attempt.running && attempt.approach >= TUNE.jumpOnRunSpeed;
    const along = Math.max(0, travel.dot(heading));
    const speed = Math.min(TUNE.pushMaxSpeed, along + (committed ? TUNE.jumpOnBoost : 0));
    const vy = this.velocity.y;
    this.velocity.copy(heading).multiplyScalar(speed).setY(vy);
    this.body.setLinvel(this.velocity, true);
    this.walking = false;
    this.running = false;
    this.yaw = this.previousYaw = attempt.yaw;
    this.grounded = false;
    this.state = "Airborne";
    this.airTime = 0.1;
    this.footJumped = false;
    this.jumpOnPending = true;
    this.jumpOnRearm = TUNE.jumpOnRearm;
    this.finishManual();
    this.tricks.startAir(false);
    this.bodyFlip.begin("manual_hop", this.pitch);
    this.airWeight.reset(this.pitch, this.yaw);
    this.airSpin.reset();
    this.events.emit({ type: "dismount", walking: false });
  }
  /**
   * Tells the side of a box or ramp apart from a rideable transition. A
   * transition bends away from the surface the rider was on by millimetres per
   * tick; a wall rises by its whole height at once. Treating a wall as a slope
   * redirected the rider's horizontal speed straight upward and launched them,
   * so a wall is met as an obstacle: a hard hit bails, anything softer stops the
   * travel into it and leaves the rider sliding along it on their own surface.
   */
  private meetWall(support: {
    height: number;
    normal: THREE.Vector3;
    centre: number;
  }) {
    const memory = this.surfaceMemory;
    this.surfaceMemory = null;
    if (!memory || !this.grounded || this.grind || this.walking) return null;
    // A respawn, marker return or mount moves the rider without riding there;
    // one tick of riding never covers a metre, so the memory no longer applies.
    if (
      Math.hypot(
        this.position.x - memory.point.x,
        this.position.z - memory.point.z,
      ) > 1
    )
      return null;
    const rise =
      memory.normal.x * (this.position.x - memory.point.x) +
      memory.normal.y * (support.height - memory.point.y) +
      memory.normal.z * (this.position.z - memory.point.z);
    if (rise <= TUNE.stepUpHeight) return null;
    // The wall faces the way the ground climbs. Sample across the wheelbase so
    // the face is found whichever wheel reached it first.
    const heading = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const into = new THREE.Vector3();
    for (const reach of [0, 0.16, 0.32, -0.16, -0.32]) {
      const x = this.position.x + heading.x * reach,
        z = this.position.z + heading.z * reach,
        e = 0.15;
      const gradient = new THREE.Vector3(
        terrainHeight(x + e, z) - terrainHeight(x - e, z),
        0,
        terrainHeight(x, z + e) - terrainHeight(x, z - e),
      );
      if (gradient.lengthSq() > into.lengthSq()) into.copy(gradient);
    }
    if (into.lengthSq() < 1e-6)
      into.set(
        this.position.x - memory.point.x,
        0,
        this.position.z - memory.point.z,
      );
    if (into.lengthSq() < 1e-6) return null;
    into.normalize();
    const impact = Math.max(0, this.velocity.dot(into));
    this.position.set(
      memory.point.x,
      memory.centre,
      memory.point.z,
    );
    this.body.setTranslation(this.position, true);
    if (impact > TUNE.wallBailSpeed) {
      this.bail("Rode into a wall");
      return "bail" as const;
    }
    this.velocity.addScaledVector(into, -impact);
    this.body.setLinvel(this.velocity, true);
    if (impact > TUNE.wallWobbleSpeed)
      this.recovery = Math.max(this.recovery, 0.45);
    return {
      height: memory.point.y,
      normal: memory.normal.clone(),
      centre: memory.centre,
    };
  }
  private land(support: {
    height: number;
    normal: THREE.Vector3;
    centre: number;
  }) {
    this.settleFlipOrientation();
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
      // Judged on the landing surface against the axis the deck has there, the
      // same angle absorbCrookedLanding turns the travel through. Flat yaw versus
      // flat travel is the same thing on flat ground but means little on a
      // near-vertical wall, where the travel is mostly vertical.
      crookedAngle: crookedLandingAngle(this.velocity, support.normal, this.yaw),
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
      this.tricks.decadeUnfinished ||
      this.tricks.poseBlend > 0.65
    )
      quality = "failed";
    else if (this.tricks.poseBlend > 0.15 && quality === "clean")
      quality = "good";
    // A landing the player rides away from with the gentle stick already held is
    // a manual catch. Validity is judged on the pose actually reachable from the
    // receiving surface, so a wildly misaligned arrival cannot be rescued into
    // balance just because RS happens to be in the manual position.
    this.manualCatchReady =
      quality !== "failed" &&
      this.manualCatchTimer > 0 &&
      Math.abs(wrap(this.pitch - slopePitch)) < TUNE.manualCatchPitchError;
    this.lastLanding = quality;
    this.diagnostics.landing({
      t: this.elapsed, position: [this.position.x, this.position.y, this.position.z],
      velocity: [this.velocity.x, this.velocity.y, this.velocity.z],
      normal: [support.normal.x, support.normal.y, support.normal.z],
      impact, pitchError: wrap(this.pitch - slopePitch), quality,
      launch: this.launch ? this.launch.kind + "#" + this.launch.id : null,
      quarter: this.airQuarter && "id" in this.airQuarter.module ? this.airQuarter.module.id : null,
      deck: this.tricks.deck.angle, bars: this.tricks.bars.angle,
      bri: this.tricks.bri.angle, briMismatch: this.tricks.bri.mismatch,
    });
    if (this.jumpOnPending && quality !== "failed") this.jumpOnLanded = 0.55;
    this.jumpOnPending = false;
    this.events.emit({ type: "landing", quality, impact });
    if (this.airQuarter) this.lipClearTimer = Math.max(this.lipClearTimer, TUNE.quarterReentryClearTime);
    const quarter=this.airQuarter?.module;
    this.tricks.flairContext=!!quarter&&'x0' in quarter&&quality!=='failed'&&support.normal.y<.96&&this.position.x>=quarter.x0&&this.position.x<=quarter.x1&&this.position.z>=quarter.z0&&this.position.z<=quarter.z1;
    this.tricks.finish(quality);this.airQuarter=null;
    this.hopRail = null;
    this.copingDrop = null;
    if (quality === "failed") {
      this.bail("Unaligned landing");
      return;
    }
    this.grounded = true;
    this.pitch=wrap(this.pitch);this.bodyFlip.reset();this.airQuarter=null;
    this.state = quality === "sketchy" ? "SketchyLanding" : "Landing";
    this.landTimer = 0.25;
    this.landingCompression = clamp(impact / 12, 0.15, 1);
    this.recovery = quality === "sketchy" ? TUNE.recoveryTime : 0;
    this.velocity.addScaledVector(
      support.normal,
      -this.velocity.dot(support.normal),
    );
    // Contact losses only. A well-aligned landing keeps its energy and carries
    // into the next line; a rough one loses more. Nothing here adds speed, and
    // no grade is rewarded with speed it did not arrive with.
    if (quality === "sketchy")
      this.velocity.multiplyScalar(TUNE.sketchySpeedKeep);
    else if (quality === "good")
      this.velocity.multiplyScalar(TUNE.goodSpeedKeep);
    this.absorbCrookedLanding(support.normal);
    this.armFakieWobble(support.normal);
    this.spin *= 0.12;
    this.position.y =
      support.centre;
    this.body.setTranslation(this.position, true);
  }
  /** Replay buffer, assist log and extreme-state guard (see physics/diagnostics.ts). */
  readonly diagnostics = new RidingDiagnostics();
  step(dt: number, input: InputFrame) {
    const before = this.velocity.clone(), wasBail = this.state === "Bail";
    this.stepCore(dt, input);
    const bailing = wasBail || this.state === "Bail" || !!this.crash;
    if (this.diagnostics.check(this.elapsed, before, this.velocity, this.position, bailing)) {
      // Last resort: keep the rider on the previous velocity rather than let a
      // broken contact throw them across the map. The incident is recorded.
      this.velocity.copy(Number.isFinite(before.lengthSq()) ? before : new THREE.Vector3());
      if (!Number.isFinite(this.position.lengthSq())) this.position.copy(this.lastSafeGround);
      this.body.setTranslation(this.position, true);
      this.body.setLinvel(this.velocity, true);
    }
    const held: string[] = [], pressed: string[] = [], released: string[] = [];
    for (const key in input.held) if ((input.held as Record<string, number>)[key] > 0.5) held.push(key);
    for (const key in input.pressed) if ((input.pressed as Record<string, boolean>)[key]) pressed.push(key);
    for (const key in input.released) if ((input.released as Record<string, boolean>)[key]) released.push(key);
    this.diagnostics.record({
      t: +this.elapsed.toFixed(4), state: this.state, grounded: this.grounded, grind: this.grind?.rail.id ?? null,
      position: [this.position.x, this.position.y, this.position.z], velocity: [this.velocity.x, this.velocity.y, this.velocity.z],
      normalY: this.normal.y, launch: this.launch ? this.launch.kind + "#" + this.launch.id : null,
      orientation: [this.yaw, this.pitch, this.bodyFlip.angle],
      equipment: { deck: this.tricks.deck.angle, bars: this.tricks.bars.angle, bri: this.tricks.bri.angle, briTarget: this.tricks.bri.target, briMismatch: this.tricks.bri.mismatch },
      input: { steer: input.steer, lean: input.lean, rx: input.rx, ry: input.ry, held, pressed, released, brake: input.held.brake, pump: input.held.pumpGrind },
    });
  }
  private stepCore(dt: number, input: InputFrame) {
    this.flipTakeoffIntent=input.held.brake>.5&&input.held.pumpGrind>.5&&Math.abs(input.lean)>.25;

    if (!this.grounded || this.walking || this.grind || this.manual.active || input.held.brake > 0.35) {
      this.pushHoldTime = 0;
      this.pendingPushTap = false;
    }
    this.previousPosition.copy(this.position);
    this.previousYaw = this.yaw;
    this.elapsed += dt;
    this.score.tick(dt);
    // A jump-on mounted in the air keeps timing its deck pull while riding.
    if (this.jumpOn && !this.walking) this.updateJumpOn(dt);
    this.lipClearTimer = Math.max(0, this.lipClearTimer - dt);
    this.railImpactCooldown = Math.max(0, this.railImpactCooldown - dt);
    this.pushTimer = Math.max(0, this.pushTimer - dt);
    this.pumpTimer = Math.max(0, this.pumpTimer - dt);
    this.popTimer = Math.max(0, this.popTimer - dt);
    this.recovery = Math.max(0, this.recovery - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);
    this.manualEntryLock = Math.max(0, this.manualEntryLock - dt);
    this.manualCatchTimer = Math.max(0, this.manualCatchTimer - dt);
    if (this.manualCatchTimer === 0) this.manualCatchReady = false;
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
      (ACTIVE_MAP === "b_hill"
        ? Math.abs(this.position.x) > 280 || this.position.z < -120 || this.position.z > 1260 || this.position.y < -20 || this.position.y > 220
        : Math.abs(this.position.x) > (OUTDOOR ? 113 : 34) ||
          (OUTDOOR
            ? this.position.z < -166 || this.position.z > 78
            : Math.abs(this.position.z) > 46) ||
          this.position.y < -8 ||
          this.position.y > 35)
    ) {
      if(this.state==='Bail'){this.position.copy(this.lastSafeGround);this.recoverLocally();}else this.reset();
      return;
    }
    this.getUpTimer = Math.max(0, this.getUpTimer - dt);
    if(this.getUpTimer>0){this.velocity.set(0,0,0);this.body.setLinvel(this.velocity,true);return;}
    if (
      this.rampWorld &&
      inWater(this.position.x, this.position.z) &&
      this.position.y < 0.35 &&
      !this.waterBail
    ) {
      this.bail("Water — returning to shore");
      this.waterBail = true;
      this.riderIntangible = true;
      this.guardClear = true;
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
      if(input.pressed.hop){
        const skip=this.bailTimer-this.lastBailGetUpPress<.65;
        this.lastBailGetUpPress=this.bailTimer;
        if(skip){
          this.recoverLocally();
          if(!this.crash)this.getUpTimer=0;
          return;
        }
      }
      if(this.crash?.runaway&&input.pressed.body){this.crash.callBack();this.events.emit({type:"marker",message:"BOARD CALLED BACK",progress:1});}
      this.world.step(this.contactEvents, this.contactHooks);
      if(this.crash){this.crash.update(dt);this.position.copy(this.crash.rider.translation());this.position.y-=.4;this.velocity.copy(this.crash.rider.linvel());
        const scooter=this.crash.scooter.translation();
        if(!Number.isFinite(this.position.lengthSq()+this.velocity.lengthSq()+scooter.x+scooter.y+scooter.z)||this.position.y<terrainHeight(this.position.x,this.position.z)-2||scooter.y<terrainHeight(scooter.x,scooter.z)-2){this.recoverLocally();return;}
        this.body.setTranslation(this.position,true);}
      if (
        (this.waterBail && this.bailTimer > 1.1) ||
        (!this.waterBail && this.crash?.canRecover && input.pressed.hop)
      )
        this.recoverLocally();
      return;
    }
    if(this.dropIn.phase){
      const gesture=this.tricks.gesture.step(dt,input.rx,input.ry);
      const loaded=this.preload.step(dt,input,true,Math.abs(input.rx)>.45);
      const whip=ridingButtons(this.tricks.stance,this.tricks.controlStyle).whip;
      if(input.pressed[whip] || gesture?.kind==="bri" || loaded!==null){
        this.dropIn.reset();this.pop(loaded ?? Math.max(.15,this.preload.amount),input.lean);
        this.lipClearTimer=.4;
        if(gesture?.kind==="bri")this.tricks.bri.kick(gesture.direction*(gesture.short?this.tricks.naturalDirection:1));
      }
    }
    if (this.dropIn.step(this, dt, input)) return;
    if (this.stepStall(dt, input)) return;
    if (this.sitting) {
      if (input.pressed.brakeBars || input.pressed.body || input.pressed.hop || Math.hypot(input.steer,input.lean)>.2) {
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
      const local = (b: Park["benches"][number]) =>
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
      this.running &&
      this.grounded
    ) {
      const direction = this.velocity.clone().setY(0);
      if (direction.lengthSq() < 0.04)
        direction.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      direction.normalize();
      const mountSpeed = Math.min(
        TUNE.mountSpeedCap,
        Math.max(2.6, this.speed + TUNE.runMountBoost),
      );
      this.walking = false;
      this.running = false;
      this.velocity.copy(direction.multiplyScalar(mountSpeed));
      this.body.setLinvel(this.velocity, true);
      this.finishManual();
      this.events.emit({ type: "dismount", walking: false });
      return;
    } else if (
      input.pressed.body &&
      this.walking &&
      this.grounded &&
      this.dropIn.setup(this)
    )
      return;
    if (input.pressed.body && this.grounded && !this.grind && (this.walking||!(input.held.brake>.5||input.held.pumpGrind>.5||input.held.leftModifier>.5||input.held.rightModifier>.5))) {
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
    const plantInput=this.rideable==="longboard"?input:this.updateFastplant(dt,input);
    if(!plantInput)return;
    input=plantInput;
    this.captureGrind(input);
    let support = this.support();
    if (this.rampWorld)
      support.normal = terrainNormal(this.position.x, this.position.z);
    const wall = this.meetWall(support);
    if (wall === "bail") return;
    if (wall) support = wall;
    const copingLip = this.currentLip();
    const brakingForSpine =
      this.rideable === "scooter" &&
      this.grounded &&
      input.held.brake > 0.35 &&
      this.popTimer === 0 &&
      !this.hasGrindOverride(input) &&
      copingLip?.module.kind === "spine" &&
      copingLip.distance > -0.25 &&
      copingLip.distance < 1.1;
    if (brakingForSpine) {
      // LT says “settle into the coping.” It first sheds momentum through the
      // real approach, then becomes a stall only when the rider has slowed at it.
      const remaining = Math.max(0.03, copingLip!.distance);
      const targetSpeed = Math.sqrt(2 * 12 * remaining);
      if (this.velocity.length() > targetSpeed)
        this.velocity.setLength(damp(this.velocity.length(), targetSpeed, TUNE.copingStallBrake, dt));
      if (
        copingLip!.distance < 0.3 &&
        this.speed < TUNE.copingStallSettleSpeed
      ) {
        this.startStall(copingLip!.forward);
        return;
      }
    }
    const verticalGap =
      this.position.y -
      support.centre;
    // Contact thresholds are distances along the surface normal, so "touching"
    // means the same thing on the top of a quarter as it does on flat ground.
    const gap =
      verticalGap * Math.max(TUNE.steepRideNormal, support.normal.y);
    const wasGrounded = this.grounded;
    // Quarter re-entry has no separate catch. It used to push the rider back out
    // along the surface normal whenever they neared the transition, which kept
    // them hovering just off the wall - sliding down it "airborne" for a dozen
    // frames and then snapping into place further down. The rider now arrives
    // already aligned with the transition (see the air pitch below) at the
    // correct ride height, so touching down is simply touching down.
    // Immediately after a valid upward takeoff the rider can still be inside the
    // surface's contact band while genuinely rising — most visibly when climbing
    // a transition. Treating that as a touchdown ends the attempt and snaps the
    // scooter back under the feet mid-trick, so require real approach speed into
    // the surface during the grace window rather than mere proximity.
    const staleTakeoffContact =
      !wasGrounded &&
      this.elapsed >= this.briTakeoff &&
      this.elapsed - this.briTakeoff < TUNE.briTakeoffGrace &&
      this.velocity.dot(support.normal) > -0.5;
    // A grounded rider keeps a 10 cm band that holds them over small bumps. An
    // airborne rider touches down only when the wheels reach the surface within
    // this tick: the wide band made landings happen several ticks early and
    // closed the gap with a visible drop onto the surface.
    const contactBand = wasGrounded
      ? 0.1
      : Math.max(TUNE.touchdownGap, -this.velocity.dot(support.normal) * dt);
    if (
      !this.grind &&
      this.popTimer === 0 &&
      !staleTakeoffContact &&
      gap < contactBand &&
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
      this.world.step(this.contactEvents, this.contactHooks);
      return;
    }
    if (this.rampWorld && this.grounded) this.normal.copy(support.normal);
    else this.normal.lerp(support.normal, 1 - Math.exp(-18 * dt)).normalize();
    if (wasGrounded && !this.grounded && !this.grind) {
      const leavingLip = this.currentLip();
      this.recordLaunch("natural");
      if (leavingLip && leavingLip.distance < 0.55 && this.velocity.y > 0.3) {
        this.departureLip=leavingLip;this.airQuarter=leavingLip.module.kind==="quarter"?leavingLip:null;
        this.lipClearTimer = TUNE.transitionRailClearTime;
        this.popTimer = 0.12;
        if (leavingLip.module.kind === "spine")
          this.redirectSpine(
            leavingLip.direction,
            input.lean,
            leavingLip.forward,
          );
        if (leavingLip.module.kind === "box")
          this.redirectBox(leavingLip.forward, this.preload.amount, 0.65);
        if (leavingLip.module.kind === "quarter")
          this.quarterRollout(leavingLip.forward, input.lean);
        this.events.emit({ type: "pop", charge: 0 });
      }
      this.transitionAir = this.normal.y < 0.85 && this.rampLean > 0.1;
      this.finishManual();
      this.state = "Airborne";
      this.airTime = 0;
      this.tricks.startAir(false, true);
      this.bodyFlip.begin('natural_ramp_air',this.pitch);
      this.airWeight.reset(this.pitch, this.yaw);
      this.airSpin.reset();
    }
    if (this.grounded || this.grind) { this.launch = null; this.poppedEdge = []; }
    if (this.grounded) this.lastGround = this.elapsed;
    const edgeGrace =
      this.elapsed - this.lastGround < TUNE.coyoteTime &&
      (!this.rampWorld || !!this.launchLip());
    const supportedForTrick = this.grounded || !!this.grind || edgeGrace;
    const scooterTricks = this.rideable === "scooter";
    const gesture =
      scooterTricks &&
      supportedForTrick &&
      input.held.leftModifier < 0.5
        ? this.tricks.gesture.step(dt, input.rx, input.ry)
        : null;
    const chargedSide=scooterTricks&&supportedForTrick&&this.preload.amount>.08&&Math.abs(input.rx)>.85&&Math.abs(input.ry)<.35;
    if(input.held.body>.5&&(gesture||chargedSide)){this.pop(Math.max(.15,this.preload.amount),input.lean);this.preload.reset();}
    else if (gesture?.kind === "bri"||chargedSide)
      // Capture the charge the player actually built at the moment the takeoff
      // intent is accepted. Tracing the scoop necessarily moves RS out of the
      // down position, so reading the live amount here would launch uncharged.
      this.groundIntent = {
        direction: gesture?.kind==='bri'?gesture.direction*(gesture.short?this.tricks.naturalDirection:1):-Math.sign(input.rx)*this.tricks.naturalDirection,
        charge: this.preload.briCharge,
        age: 0,
      };
    const whip = ridingButtons(
      this.tricks.stance,
      this.tricks.controlStyle,
    ).whip;
    const takeoffLip = this.launchLip();
    const atTakeoff =
      !!takeoffLip &&
      takeoffLip.distance > -0.25 &&
      takeoffLip.distance < 1.25;
    const barButton =
      this.tricks.controlStyle === "arcade" ? "pushDeck" : "brakeBars";
    if (
      supportedForTrick &&
      (input.pressed[whip] ||
        (this.tricks.controlStyle === "arcade" && input.pressed.hop) ||
        (scooterTricks && atTakeoff && input.pressed[barButton]))
    ) {
      this.pop(Math.max(0.15, this.preload.amount), input.lean,
        this.tricks.controlStyle==='arcade'&&input.pressed.hop?'manual_hop':'trick_initiated_pop');
      this.preload.reset();
    }
    if (this.groundIntent) {
      const intent = this.groundIntent;
      intent.age += dt;
      const lip = this.currentLip();
      const waitForLip =
        this.grounded &&
        this.velocity.y > 1 &&
        lip &&
        lip.distance > 0.15 &&
        lip.distance < 0.9 &&
        intent.age < 0.16;
      if (!waitForLip) {
        // The launch contribution is applied exactly once, here. Bri/Inward
        // initiation must never stack a second impulse after takeoff.
        if (supportedForTrick)
          this.pop(Math.max(TUNE.briMinCharge, intent.charge), input.lean);
        this.tricks.bri.kick(intent.direction);
        this.briTakeoff = this.elapsed;
        this.groundIntent = null;
        this.preload.reset();
      }
    }
    // Preload survives the lip briefly and can buffer a release just before contact.
    const preloadLip =
      supportedForTrick && !this.manual.active ? this.currentLip() : null;
    const transitionRelease =
      !!preloadLip &&
      preloadLip.distance > -0.1 &&
      preloadLip.distance < 0.9 &&
      this.normal.y < 0.97;
    // One RS movement has one owner. Entry uses the narrow gentle band; once
    // intent exists the wider hold band keeps it, so ordinary drift near a
    // boundary cannot cancel a manual. The span between the gentle band and the
    // preload threshold is a transition owned by neither: passing through it
    // neither charges a hop nor discards a held manual intent.
    const established = this.manual.active || this.manualIntentTime > 0;
    const gentleLow = established ? TUNE.manualHoldMin : TUNE.manualMin;
    const gentleHigh = established ? TUNE.manualHoldMax : TUNE.manualMax;
    const gentleLateral = established
      ? TUNE.manualHoldLateral
      : TUNE.manualLateral;
    const rsDepth = Math.abs(input.ry);
    const gentleRS =
      rsDepth >= gentleLow &&
      rsDepth <= gentleHigh &&
      Math.abs(input.rx) < gentleLateral &&
      input.held.leftModifier < 0.3 &&
      input.held.rightModifier < 0.3;
    if (gentleRS) {
      // Crossing neutral is a different request, not a continuation.
      if (this.manualIntentSign && Math.sign(input.ry) !== this.manualIntentSign)
        this.manualIntentTime = 0;
      this.manualIntentTime += dt;
      this.manualIntentSign = Math.sign(input.ry);
      this.manualCatchTimer = TUNE.manualCatchWindow;
    } else if (rsDepth > gentleHigh && rsDepth < TUNE.preloadThreshold) {
      // Transition region: hold what we have rather than discarding it.
    } else {
      this.manualIntentTime = 0;
      this.manualIntentSign = 0;
    }
    // A sustained gentle manual position is not a trick gesture. Keep it out of
    // the recognizer so holding a manual cannot accumulate a false scoop; a
    // deliberate deeper movement leaves the band and owns the stick again.
    if (gentleRS && this.manualIntentTime >= TUNE.manualDwell)
      this.tricks.gesture.reset();
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
    // A short internal window preserves a physical RS flick through neutral,
    // but the rider stands up as soon as the user stops actively holding down.
    this.lastRS = { x: input.rx, y: input.ry };
    this.charge = (this.grounded||!!this.grind) && !this.manual.active && input.held.leftModifier < 0.5
      ? (input.ry >= TUNE.preloadThreshold ? clamp(input.ry, 0, 1) : 0) : 0;
    if (rsPop !== null) {
      this.bufferCharge = rsPop;
      this.hopBuffer = TUNE.hopBuffer;
      this.charge = 0;
    }
    // An accepted Bri/Inward takeoff owns the whole stroke that produced it. The
    // upward half of a scoop also looks like a hop release, and letting that hop
    // fire first would launch the rider, restart the air attempt and throw the
    // trick timeline away before the gesture ever resolved.
    if (this.groundIntent) this.hopBuffer = 0;
    if (
      this.hopBuffer > 0 &&
      (this.grounded ||
        this.grind ||
        this.elapsed - this.lastGround < TUNE.coyoteTime)
    ) {
      if (this.grind && this.bufferCharge < TUNE.grindHopCharge) this.grindHop();
      else this.pop(this.bufferCharge, input.lean,'manual_hop');
    }
    const forward = new THREE.Vector3(
      Math.sin(this.yaw),
      0,
      Math.cos(this.yaw),
    );
    this.steer = damp(this.steer, input.steer, TUNE.steeringResponse, dt);
    if (this.grind) {
      // Any fresh trick or hard sideways pop releases the rail immediately.
      if (
        input.pressed.brakeBars ||
        input.pressed[ridingButtons(this.tricks.stance, this.tricks.controlStyle).whip] ||
        chargedSide
      ) {
        this.pop(Math.max(.15,this.preload.amount),input.lean,'trick_initiated_pop');
      }
    }
    if (this.grind) {
      // this.velocity is the body's velocity after the last contact solve.
      const g = this.grind;
      const along = this.velocity.dot(g.direction) * Math.sign(g.speed);
      this.grindBlocked =
        this.grindDuration > 0.05 && Math.abs(g.speed) > 1.5 &&
        along < Math.abs(g.speed) * TUNE.grindBlockedRatio
          ? this.grindBlocked + dt
          : 0;
      if (this.grindBlocked > TUNE.grindBlockedTime) {
        this.grindBlocked = 0;
        this.events.emit({ type: "railImpact", speed: Math.abs(g.speed), bail: false });
        this.finishGrind();
        this.state = "Airborne";
        this.tricks.startAir(true);
        this.bodyFlip.begin("natural_ramp_air", this.pitch);
        this.popTimer = 0.12;
        this.airTime = 0;
      }
    }
    if (this.grind) {
      this.grindDuration += dt;
      this.score.holdContact(dt, this.grindDuration, true, 1 + Math.abs(this.grind.direction.y), this.grind.name);
      this.state = "Grinding";
      this.grounded = false;
      this.body.setGravityScale(0, true);
      const g = this.grind;
      g.speed +=
        (-TUNE.gravity * g.direction.y - Math.sign(g.speed) * 0.34) * dt;
      g.t = this.railProgress(g.rail);
      if (
        ((g.t > 1 && g.speed > 0) || (g.t < 0 && g.speed < 0)) &&
        continueGrind(this.park.rails, g)
      ) {
        // At a bend the rider can sit a hair behind the new segment's start.
        g.t = clamp(this.railProgress(g.rail), 0, 1);
      }
      const point = g.rail.a.clone().lerp(g.rail.b, g.t);
      const side = new THREE.Vector3(
        g.direction.z,
        0,
        -g.direction.x,
      ).normalize();
      const lateral = this.position.clone().sub(point).dot(side);
      const seat = this.grindSeat(g.rail, g.direction, side, lateral);
      // Stick right moves the rider toward their right along the rail.
      g.contactOffset=clamp(g.contactOffset-input.steer*.085*dt,seat.low,seat.high);
      const settling = this.grindDuration < TUNE.grindSettleTime;
      const spring = seat.seating
        ? TUNE.grindSeatSpring
        : this.grindAssist
          ? settling
            ? TUNE.grindLateralSpring
            : 12
          : 10;
      const damping = seat.seating ? TUNE.grindSeatDamping : settling ? TUNE.grindLateralDamping : 5;
      // Semi-implicit so the stiff seating spring stays stable at the fixed step.
      g.lateralSpeed =
        (g.lateralSpeed - (lateral - g.contactOffset) * spring * dt) /
        (1 + damping * dt + spring * dt * dt);
      this.velocity
        .copy(g.direction)
        .multiplyScalar(g.speed)
        .addScaledVector(side, g.lateralSpeed);
      this.velocity.y +=
        (point.y + seat.height > this.position.y + 0.005
          ? Math.min((point.y + seat.height - this.position.y) * TUNE.grindSeatResolve, 4)
          : clamp((point.y + seat.height - this.position.y) * 18, -2, 2));
      this.pitch = damp(this.pitch, this.railPitch(g.direction) + g.stancePitch + input.lean * 0.13, 8, dt);
      this.roll = damp(this.roll, -input.steer * 0.14, 8, dt);
      // Holding the stick toward the ramp while on coping turns the rider to
      // face it, then drops them back in.
      const dropSide = this.copingDrop
        ? 0
        : this.copingDropSide(g, side, input.steer);
      this.copingDropHeld = dropSide ? this.copingDropHeld + dt : 0;
      if (dropSide && this.copingDropHeld >= TUNE.copingDropHold) {
        const toward = side.clone().multiplyScalar(dropSide);
        this.copingDrop = {
          toward,
          yaw: Math.atan2(toward.x, toward.z),
          time: 0,
          released: false,
        };
      }
      if (this.copingDrop && !this.copingDrop.released) {
        const drop = this.copingDrop;
        drop.time += dt;
        const turn = wrap(drop.yaw - this.yaw);
        this.yaw += turn * (1 - Math.exp(-TUNE.copingDropTurnRate * dt));
        this.pitch = damp(this.pitch, 0.35, 8, dt);
        g.speed *= Math.exp(-4 * dt);
        if (Math.abs(turn) < 0.2 || drop.time > TUNE.copingDropTurnTime) {
          this.releaseCopingDrop();
        }
      } else if (
        g.t < 0 ||
        g.t > 1 ||
        (!settling && Math.abs(lateral - g.contactOffset) > 0.55) ||
        Math.abs(g.speed) < 0.8 ||
        ((g.contactOffset >= seat.high - 1e-6 || g.contactOffset <= seat.low + 1e-6) && Math.abs(input.steer) > .9 &&
          Math.sign(-input.steer) === Math.sign(g.contactOffset - (seat.low + seat.high) / 2))
      ) {
        this.finishGrind();
        this.state = "Airborne";
        this.tricks.startAir(true);
        this.bodyFlip.begin('natural_ramp_air',this.pitch);
        this.popTimer = 0.12;
        this.airTime = 0;
      }
    } else if (this.grounded && this.rideable === "longboard") {
      this.airWeight.shift = damp(this.airWeight.shift, 0, TUNE.airWeightRecentering, dt);
      this.airTime = 0;
      this.body.setGravityScale(0, true);
      const speed = this.speed;
      const buttons = ridingButtons(this.tricks.stance, this.tricks.controlStyle);
      const ride = this.board.ride(
        dt,
        {
          steer: input.steer,
          push: input.pressed[buttons.push],
          pushHeld: input.held[buttons.push] > 0.5,
          brake: input.held.brake,
          tuck: input.held.pumpGrind,
          slide: input.held.rightModifier,
        },
        this.velocity,
        this.yaw,
        this.normal,
        this.sideSlope(this.normal),
      );
      this.yaw = ride.yaw;
      this.steer = this.board.lean;
      // A hard foot brake at bombing speed cannot hold: the rider is thrown forward
      // and the board rolls on until Y calls it back.
      this.footBrakeHeld = input.held.brake > 0.6 && this.speed > TUNE.boardFootBrakeCrashSpeed ? this.footBrakeHeld + dt : 0;
      if (this.footBrakeHeld > TUNE.boardFootBrakeCrashHold) { this.footBrakeHeld = 0; this.bail("Foot brake at speed / Y calls the board back", true); return; }
      this.roll = this.recovery > 0
        ? Math.sin(this.elapsed * 25) * 0.1 * this.recovery + ride.roll
        : damp(this.roll, ride.roll, 10, dt);
      if (ride.pushed) this.events.emit({ type: "push" });
      this.rampLean = damp(this.rampLean, 0, 6, dt);
      this.pitch = damp(
        this.pitch,
        -Math.atan2(ride.tangent.y, Math.hypot(ride.tangent.x, ride.tangent.z)),
        14,
        dt,
      );
      if ((this.state as RideState) !== "Bail")
        this.state = this.recovery > 0
          ? "SketchyLanding"
          : this.landTimer > 0
            ? "Landing"
            : "Grounded";
      this.followSurface(support, gap, speed);
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
      // Rolling back down a transition fakie is ordinary; the wobble builds on the flat.
      this.stepFakieWobble(dt, input.steer, this.fakie.mode === "Fakie" && !revert.reverting && !this.manual.active && this.normal.y > 0.94);
      if (this.recovery > 0) {
        this.yaw += Math.sin(this.elapsed * 24) * 0.35 * this.recovery * dt;
        this.roll = Math.sin(this.elapsed * 25) * 0.1 * this.recovery;
      } else
        // Lean with the side slope as well as the carve, so riding across a
        // bank or along a wall the scooter lies on the surface.
        this.roll = damp(
          this.roll,
          this.sideSlope(this.normal) + this.steer * Math.min(speed * 0.022, 0.22),
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
      const crouching = this.preload.amount > 0.08 && input.ry > 0.55 && !this.manual.active;
      const downhill = tangent.y * sign;
      const brake = input.held.brake;
      const rollingDrag = (crouching && speed > 4
        ? TUNE.rollingDrag * TUNE.crouchFastDragMultiplier
        : TUNE.rollingDrag) + (along < -0.3 ? TUNE.fakieRollingDrag : 0);
      const loss = (rollingDrag + brake * TUNE.brake) * dt;
      const current = this.velocity.length();
      if (current > 0)
        this.velocity.multiplyScalar(Math.max(0, current - loss) / current);
      // A tuck trims drag at speed and gains only a modest amount on an
      // existing downhill line; it cannot manufacture speed on flat ground.
      if (crouching && downhill < -0.05 && speed > 4)
        this.velocity.addScaledVector(
          tangent,
          sign * TUNE.crouchDownhillGain * Math.min(1.25, speed / 10) * dt,
        );
      const pushButton = ridingButtons(
        this.tricks.stance,
        this.tricks.controlStyle,
      ).push;
      const holdingPush =
        input.held[pushButton] > 0.5;
      const pushAllowed =
        !this.manual.active &&
        !revert.reverting &&
        along >= -0.3 &&
        this.normal.y > 0.96 &&
        brake < 0.35 &&
        this.rampLean < 0.22;
      this.pushHoldTime = holdingPush && pushAllowed
        ? this.pushHoldTime + dt
        : 0;
      if (
        (input.pressed[pushButton] ||
          (holdingPush && this.pushHoldTime >= TUNE.pushHoldDelay)) &&
        this.pushTimer === 0 &&
        pushAllowed
      ) {
        this.velocity.addScaledVector(
          tangent,
          // Diminishing toward the pushing ceiling: the contribution reaches
          // zero at pushMaxSpeed, so pushing cannot exceed it while a downhill
          // run remains free to carry the rider past it.
          TUNE.push * clamp(1 - Math.max(0, along) / TUNE.pushMaxSpeed, 0, 1),
        );
        this.pushTimer = TUNE.pushCadence;
        this.events.emit({ type: "push" });
      }
      // Compression while descending and extension through changing curvature preserve energy.
      const slope = downhill;
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
      // Catching a completed trick into a manual uses the stick the player is
      // already holding: no fresh movement, no neutral reset, no second button.
      const catching = this.manualCatchReady && this.manualCatchTimer > 0;
      if (
        !this.manual.active &&
        (this.manualIntentTime >= TUNE.manualDwell || catching) &&
        speed > TUNE.manualMinSpeed &&
        (this.manualEntryLock === 0 || catching)
      ) {
        const nose = (this.manualIntentSign || Math.sign(input.ry)) < 0;
        this.manual.enter(nose);
        this.manualEntryLock = 0.35;
        this.manualRecorded = false;
        this.manualCatchReady = false;
      }
      if (this.manual.active) {
        this.score.holdContact(dt, this.manual.duration, false, 1, this.manual.nose ? "Nose Manual" : "Manual");
        // The stick keeps balance control every frame. Loading a pop out of the
        // manual, or easing through the transition region on the way to one,
        // commands the neutral hold rather than a hard correction: the manual is
        // held steady while that deeper movement is resolved by its own owner.
        const neutral = this.manual.nose
          ? -TUNE.manualNeutralHold
          : TUNE.manualNeutralHold;
        const balanceInput =
          this.preload.amount > 0 ||
          (Math.abs(input.ry) > gentleHigh && !gentleRS)
            ? neutral
            : input.ry;
        const result = this.manual.step(
          dt,
          balanceInput,
          (speed - this.lastSpeed) / dt,
        );
        this.manualCommand = this.manual.command;

        if (result === "loop") {
          this.bail(this.manual.nose ? "Over the bars" : "Looped manual");
        }
        if (result === "drop") {
          if(this.manual.duration>.18)this.tricks.add(this.manual.nose?"Nose Manual":"Manual");
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
      this.followSurface(support, gap, speed);
    } else {
      this.state = "Airborne";
      this.body.setGravityScale(1, true);
      this.airTime += dt;
      this.rampLean = damp(this.rampLean, 0, 4, dt);
      this.fakie.step(dt, this.yaw, this.velocity.x, this.velocity.z, 0, false);
      const flipChord=this.rideable==="scooter"&&input.held.brake>.5&&input.held.pumpGrind>.5&&(this.bodyFlip.active||Math.abs(input.lean)>.25);
      // Estimated time until the wheels reach the surface below, and the pitch
      // of that surface, so the assist aims at a landing that is actually
      // reachable rather than at world level.
      const closing = -this.velocity.dot(support.normal);
      const contact =
        closing > 0.2 && gap > 0 ? Math.max(0, gap) / closing : 99;
      const receiving = -Math.atan2(
        support.normal
          .clone()
          .negate()
          .dot(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))),
        support.normal.y,
      );
      // Ballistic time until the rider's centre reaches the surface below, valid
      // while still rising, for the flip's landing preparation.
      const fall = (this.velocity.y + Math.sqrt(Math.max(0, this.velocity.y * this.velocity.y + 2 * TUNE.gravity * Math.max(0, verticalGap)))) / TUNE.gravity;
      const flipStarting = !this.bodyFlip.active;
      const frame = flipStarting ? this.flipFrame(this.yaw, this.pitch, this.roll) : this.flipFrame();
      const level = this.flipLevel(support.normal, frame);
      this.pitch=this.bodyFlip.step(dt,flipChord,input.lean,this.pitch,{
        timeToContact:fall,
        level,
      });
      if (flipStarting && this.bodyFlip.active) {
        this.flipYaw0 = this.yaw;
        this.flipRoll0 = this.roll;
      }
      this.spin = this.airSpin.step(
        dt,
        this.spin,
        input.steer,
        this.velocity.y,
        Math.max(0, verticalGap),
        this.airTime,
        this.bodyFlip.active?TUNE.flipYawRateScale:1,
      );
      if (Math.abs(input.steer) < TUNE.spinStickDeadzone && !this.copingDrop && !this.hopRail && Math.abs(this.spin) > 0.05)
        this.spin = this.guideSpin(dt, fall);
      const rotation = this.spin * dt;
      this.yaw += rotation;
      this.tricks.yaw += rotation;
      // Dropping in off coping keeps turning the rider to face their travel.
      const dropping = this.copingDrop?.released ? this.copingDrop : null;
      if (dropping) {
        dropping.time += dt;
        const heading = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
        if (heading.lengthSq() > 0.04)
          this.yaw += wrap(Math.atan2(heading.x, heading.z) - this.yaw) *
            (1 - Math.exp(-TUNE.copingDropTurnRate * dt));
        if (dropping.time > 1) this.copingDrop = null;
      }
      if(!this.bodyFlip.active)this.airWeight.step(dt, input.lean, this.yaw, this.velocity);
      this.airYawInput = input.steer;
      // The scooter meets the surface it is about to land on. Over a quarter the
      // receiving transition owns the attitude for the whole air, so a straight
      // air comes back down already at the angle of the wall; elsewhere the
      // alignment eases in over the last moments before contact. Weight on LS
      // still biases it, which is what the landing grade judges.
      const basePitch = this.airWeight.basePitch(this.yaw, this.airTime);
      const alignment = this.airQuarter || dropping
        ? 1
        : clamp(1 - contact / TUNE.airLandingAlignTime, 0, 1);
      if (this.hopRail)
        // Mid grind hop, LS sets the stance to land back in: forward for Smith,
        // back for Feeble, and neutral keeps the current one.
        this.pitch = damp(
          this.pitch,
          Math.abs(input.lean) > 0.25
            ? -input.lean * TUNE.grindHopStancePitch
            : this.pitch,
          18,
          dt,
        );
      else if(!this.bodyFlip.active)this.pitch = damp(
        this.pitch,
        clamp(
          basePitch + (receiving - basePitch) * alignment + this.airWeight.pitchBias,
          -TUNE.airPitchLimit,
          TUNE.airPitchLimit,
        ),
        12,
        dt,
      );
      this.roll = this.bodyFlip.active
        ? this.flipRoll0
        : damp(
            this.roll,
            this.sideSlope(support.normal) * alignment + input.steer * 0.07,
            alignment > 0 ? 10 : 4,
            dt,
          );
      // Named against the surface being landed on: a frontflip back onto a steep
      // quarter wall is a whole flip at less than 360 raw degrees, a backflip at more.
      this.tricks.flip=this.bodyFlip.active?this.bodyFlip.angle-level:0;
      this.tricks.quarterAir=!!this.airQuarter;
      // Seconds until the wheels land; Clamp Grab lets go a moment before then.
      this.tricks.landingIn = Math.min(contact, fall);
      if (this.rideable === "scooter") {
        this.tricks.briPending = !!this.groundIntent;
        this.tricks.input(dt, input, flipChord);
      }
      this.captureGrind(input);
      if (input.held.pumpGrind <= 0.3) this.grindCandidate = "—";
    }
    // Protective ceiling on runaway travel. Applied to the horizontal component
    // only and eased rather than hard-clamped: scaling the whole vector (as this
    // did at 28) shortened jumps and bent airborne trajectories, because it
    // pulled vertical speed down with it. Measured before the fix, an airborne
    // (0, 12, 26) became (0, 11.61, 25.42) - a third of a metre per second of
    // climb removed in a single step, mid-flight.
    const travel = Math.hypot(this.velocity.x, this.velocity.z);
    if (travel > TUNE.extremeSpeed) {
      const eased =
        Math.max(
          TUNE.extremeSpeed,
          travel - (travel - TUNE.extremeSpeed) * TUNE.extremeSpeedResponse * dt,
        ) / travel;
      this.velocity.x *= eased;
      this.velocity.z *= eased;
    }
    const lip = this.currentLip();
    const onTransition =
      !!lip &&
      !brakingForSpine &&
      this.grounded &&
      !this.walking &&
      !this.manual.active &&
      (this.normal.y < 0.95 || lip.module.kind === "box");
    if (
      onTransition &&
      lip.distance <= TUNE.transitionLipReleaseDistance &&
      lip.distance >= -0.1 &&
      this.velocity.y > 0.3 &&
      this.popTimer === 0
    ) {
      this.recordLaunch("natural");
      this.departureLip=lip;this.airQuarter=lip.module.kind==="quarter"?lip:null;
      if (lip.module.kind === "spine")
        this.redirectSpine(lip.direction, input.lean, lip.forward);
      if (lip.module.kind === "box")
        this.redirectBox(lip.forward, this.preload.amount, 0.7);
      if (lip.module.kind === "quarter")
        this.quarterRollout(lip.forward, input.lean);
      this.finishManual();
      this.grounded = false;
      this.state = "Airborne";
      this.airTime = 0;
      this.popTimer = 0.12;
      this.lipClearTimer = TUNE.transitionRailClearTime;
      this.body.setGravityScale(1, true);
      this.tricks.startAir(false, true);
      this.bodyFlip.begin('natural_ramp_air',this.pitch);
      this.airSpin.reset();
      this.airWeight.reset(this.pitch, this.yaw);
      this.spin = 0;
      // A loaded transition pop adds only a small extension to the rider's
      // existing ramp momentum. This keeps a quarter pipe rideable and makes
      // the same in-ramp release feel responsive without turning it into a
      // flat-ground super jump.
      // A loaded stick is not a completed jump. Preserve the gesture through
      // the short lip departure window so its upward stroke owns the impulse.
      const transitionCharge = 0;
      this.charge = 0;
      this.events.emit({ type: "pop", charge: transitionCharge });
    }
    // The upper guard is too coarse for a rider unweighting over a lip. Temporarily
    // ignore only rail contacts on a valid transition crossing; terrain remains solid.
    const crossing =
      onTransition ||
      brakingForSpine ||
      this.lipClearTimer > 0 ||
      this.overQuarterLip();
    this.body
      .collider(0)
      .setCollisionGroups(
        this.grind ? GROUPS.chassisSurfaceOnly : crossing ? GROUPS.chassisClearCoping : GROUPS.chassis,
      );
    this.guardClear = !!this.grind || crossing;
    if (this.park.rails.length !== this.copingRailCount) {
      this.copingRailCount = this.park.rails.length;
      this.copingHandles = new Set(
        this.park.rails.filter((r) => r.coping && r.colliderHandle !== undefined).map((r) => r.colliderHandle!),
      );
    }
    this.copingGuardClear = this.guardOverOwnCoping();
    this.body.setLinvel(this.velocity, true);
    this.body.setRotation(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.yaw,
      ),
      true,
    );
    this.world.timestep = dt;
    this.world.step(this.contactEvents, this.contactHooks);
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
      const catchingLip =
        this.state === "Airborne" &&
        this.airTime > 0.1 &&
        this.velocity.y < -1.5 &&
        !!lip &&
        lip.distance > -0.35 &&
        lip.distance < 0.55;
      if (catchingLip) {
        const hardCase = railImpact >= TUNE.caseHardImpact;
        this.events.emit({
          type: "marker",
          message: hardCase ? "HARD CASE" : "CASE / HOLD ON",
          progress: 0,
        });
        if (hardCase) this.bail("Hard coping case");
        else {
          this.recovery = Math.max(this.recovery, 0.85);
          this.state = "SketchyLanding";
          this.velocity.copy(after).multiplyScalar(0.58);
          this.velocity.y = Math.max(0.35, this.velocity.y);
          this.body.setLinvel(this.velocity, true);
        }
      } else {
      const severe = railImpact >= TUNE.railImpactBailSpeed;
      this.events.emit({ type: "railImpact", speed: railImpact, bail: severe });
      if (severe) {
        if (
          lip?.module.kind === "spine" &&
          input.held.brake > 0.35 &&
          this.popTimer === 0 &&
          !this.hasGrindOverride(input)
        )
          this.startStall(lip.forward);
        else {
          const reaction = after
            .clone()
            .addScaledVector(this.velocity, TUNE.railCollisionImpulseScale);
          this.bail("Rail impact");
          this.velocity.copy(reaction);
          this.velocity.y = Math.max(this.velocity.y, 1.5);
          this.body.setLinvel(this.velocity, true);
        }
      } else {
        this.recovery = Math.max(this.recovery, 0.65);
        this.state = "SketchyLanding";
        this.velocity.copy(after).multiplyScalar(0.82);
        this.body.setLinvel(this.velocity, true);
      }
      }
    }
    if (
      this.speed > 4 &&
      Math.hypot(after.x, after.z) < this.speed * 0.25 &&
      this.state !== "Grinding" &&
      this.state !== "Stall" &&
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
      cumulativeYaw: this.tricks.yaw * 180 / Math.PI,
      rightStick: this.lastRS,
      surfaceNormal: this.normal.toArray(),
      surfaceTangent: new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).projectOnPlane(this.normal).normalize().toArray(),
      activeTrick: this.tricks.attempt,
      provisionalScore: this.tricks.attempt ? this.score.preview(this.tricks.attempt.raw) : 0,
      recentTrickSignatures: this.score.recent,
      grindCandidateScore: this.grind?.intent ?? 0,
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
      // Diagnostics for this repair pass. F3 only; disabled in normal play.
      rs: { x: this.lastRS.x, y: this.lastRS.y },
      rsOwner: this.manual.active
        ? "manual"
        : this.groundIntent
          ? "trick-takeoff"
          : this.charge > 0
            ? "preload"
            : this.manualIntentTime > 0
              ? "manual-intent"
              : "none",
      manualIntent: this.manualIntentTime,
      manualCatch: this.manualCatchTimer,
      manualCommand: this.manualCommand,
      manualActive: this.manual.active,
      preloadCharge: this.preload.availableCharge,
      briCharge: this.preload.briCharge,
      briPhase: this.tricks.bri.progress,
      briAngle: this.tricks.bri.angle,
      briMismatch: this.tricks.bri.mismatch,
      airQuarter: !!this.airQuarter,
      flipAngle: this.bodyFlip.angle,
      flipRate: this.bodyFlip.velocity,
      flipAssisting: this.bodyFlip.assisting,
      flipAssistUsed: this.bodyFlip.assistUsed,
      jumpOnArmed: !!this.jumpOn,
    };
  }
}
