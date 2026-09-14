import { activeLayout } from '../editor/layout';

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
import { BodyFlipControl, type TakeoffOrigin } from '../player/body-flip';
import {CrashMotion} from '../player/crash';
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
  railImpactCooldown = 0;
  dropIn = new DropIn();
  footJumpTimer = 0;
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
  private departureLip:ReturnType<typeof outdoorLip>=null;
  private launchLip(){
    const current=this.rampWorld?outdoorLip(this.position.x,this.position.z,this.velocity.z,this.velocity.x):null;
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
  stall: {
    anchor: THREE.Vector3;
    direction: THREE.Vector3;
    offset: number;
  } | null = null;
  manualEntryLock = 0;
  manualIntentTime = 0;
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
    filterContactPair: (a,b) => this.grindCooldown > 0 && this.releasingRail !== undefined &&
      (a===this.releasingRail || b===this.releasingRail) ? null : RAPIER.SolverFlags.COMPUTE_IMPULSE,
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

    this.bodyFlip.reset();
    this.departureLip=null;
    this.fastplant=null;this.plantQueued=-1;this.plantLatched=false;
    this.resolvingSpawn = true;
    this.releasingRail = undefined;
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
  }
  private pop(charge: number, lean = 0, origin:TakeoffOrigin='trick_initiated_pop') {
    this.bodyFlip.begin(origin,this.pitch);
    this.body.setGravityScale(1,true);
    const linked = this.manual.active || !!this.grind;
    this.finishManual();
    this.finishGrind();
    const rampPop = this.normal.y < 0.85 && this.velocity.y > 1;
    const hop = origin==='fastplant' ? (rampPop?2.4:4.8) : rampPop
      ? TUNE.rampTrickPopMin + charge * TUNE.rampTrickPopCharge
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
    const lip = this.launchLip();
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
    this.lastGround=-99;
    this.departureLip=null;
    this.airWeight.reset(this.pitch, this.yaw);
    this.airSpin.reset();
    this.events.emit({ type: "pop", charge });
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
    const side=this.tricks.stance==='regular'?1:-1;
    const foot=this.position.clone().add(new THREE.Vector3(Math.cos(this.yaw)*side*.23,0,-Math.sin(this.yaw)*side*.23));
    const ground=supportAt(foot);if(ground===null||Math.abs(this.position.y-.22-ground)>.32)return null;
    foot.y=ground;
    let drop=0;
    for(const distance of [.6,1,1.6]){const h=supportAt(this.position.clone().addScaledVector(forward,distance));if(h!==null)drop=Math.max(drop,ground-h);}
    const lip=this.rampWorld?outdoorLip(this.position.x,this.position.z,this.velocity.z,this.velocity.x):null;
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
  bail(reason: string) {
    if (this.state === "Bail") return;
    this.crash?.dispose();this.crash=new CrashMotion(this.world,this.position,this.velocity,this.yaw,this.pitch);
    this.state = "Bail";
    this.bodyFlip.reset();
    this.fastplant=null;this.plantQueued=-1;
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
    this.body.setGravityScale(0, true);this.body.setLinvel({x:0,y:0,z:0},true);
    this.body.collider(0).setSensor(true);this.railGuard.setSensor(true);
    this.groundIntent=null;this.dropIn.reset();this.stall=null;
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
    this.railGuard.setSensor(true);
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
    this.getUpTimer = 0.75;
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
      this.releasingRail = this.grind.rail.colliderHandle;
      if (this.grindDuration > 0.08) this.tricks.add(this.grind.name);
      this.grind = null;
      this.grindCooldown = 0.22;
      this.body.collider(0).setSensor(false);
      this.railGuard.setSensor(false);
      this.body.setGravityScale(1, true);
    }
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
  private captureGrind(input: InputFrame) {
    if (
      this.grounded ||
      this.walking ||
      this.grind ||
      (!this.grindAssist && input.held.pumpGrind <= 0.3) ||
      this.grindCooldown > 0
    )
      return;
    // Tricks, a transition exit, and a drop-in all have a higher priority than a rail.
    const lip = this.rampWorld
      ? outdoorLip(
          this.position.x,
          this.position.z,
          this.velocity.z,
          this.velocity.x,
        )
      : null;
    const transitionExit =
      !!lip &&
      lip.distance > -0.35 &&
      lip.distance < 1.1 &&
      (this.normal.y < 0.97 || this.rampLean > 0.08 || this.velocity.y > 0.35);
    if (this.dropIn.phase || this.hasGrindOverride(input) || transitionExit) {
      this.grindCandidate = "—";
      return;
    }
    const contact = this.position.clone().add(new THREE.Vector3(0, -0.12, 0));
    // Sweep a single fixed physics step ahead so a valid deck contact engages
    // before the rigid-body rail collision can bounce it away.
    const candidate = findGrind(
      this.park.rails,
      contact,
      this.velocity,
      this.yaw,
      this.pitch,
      this.grindAssist,
      input.held.pumpGrind > 0.3,
    ) ?? findGrind(this.park.rails, contact.clone().addScaledVector(this.velocity, TUNE.step),
      this.velocity, this.yaw, this.pitch, this.grindAssist, input.held.pumpGrind > 0.3);
    this.grindCandidate = candidate?.rail.id ?? "—";
    if (
      candidate &&
      this.tricks.deck.mismatch < 0.45 &&
      this.tricks.bars.mismatch < 0.45 && this.tricks.bri.mismatch < .35 && this.tricks.kickless.mismatch < .35
    ) {
      this.tricks.finish("clean");
      this.grind = candidate;
      this.grindDuration = 0;
      this.velocity.y = candidate.direction.y * candidate.speed;
      this.body.setGravityScale(0, true);
      this.body.collider(0).setSensor(false);
      this.body.collider(0).setCollisionGroups(GROUPS.chassisSurfaceOnly);
      this.railGuard.setSensor(true);
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
    this.world.step(this.contactEvents, this.contactHooks);
    this.position.copy(this.body.translation());
    this.velocity.copy(this.body.linvel());
    if (!this.grounded || this.walking || this.grind || this.manual.active || input.held.brake > 0.35) {
      this.pushHoldTime = 0;
      this.pendingPushTap = false;
    }
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
    this.pitch=wrap(this.pitch);this.bodyFlip.reset();
    this.state = quality === "sketchy" ? "SketchyLanding" : "Landing";
    this.landTimer = 0.25;
    this.landingCompression = clamp(impact / 12, 0.15, 1);
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
    this.flipTakeoffIntent=input.held.brake>.5&&input.held.pumpGrind>.5&&Math.abs(input.lean)>.25;

    if (!this.grounded || this.walking || this.grind || this.manual.active || input.held.brake > 0.35) {
      this.pushHoldTime = 0;
      this.pendingPushTap = false;
    }
    this.previousPosition.copy(this.position);
    this.previousYaw = this.yaw;
    this.elapsed += dt;
    this.score.tick(dt);
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
        TUNE.maxSpeed * 0.72,
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
    const plantInput=this.updateFastplant(dt,input);
    if(!plantInput)return;
    input=plantInput;
    this.captureGrind(input);
    const support = this.support();
    if (this.rampWorld)
      support.normal = terrainNormal(this.position.x, this.position.z);
    const copingLip = this.rampWorld
      ? outdoorLip(
          this.position.x,
          this.position.z,
          this.velocity.z,
          this.velocity.x,
        )
      : null;
    const brakingForSpine =
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
    const gap =
      this.position.y -
      (support.height + TUNE.radius / Math.max(0.55, support.normal.y));
    const wasGrounded = this.grounded;
    // On a descending, already-aligned transition return, absorb only small
    // normal errors. This preserves player yaw and allows deliberate fakie
    // re-entry while making a near-clean rear-wheel catch feel connected.
    if (
      !this.grounded &&
      this.state === "Airborne" &&
      this.velocity.y < 0 &&
      support.normal.y < 0.94 &&
      gap > -0.18 &&
      gap < 0.46 &&
      this.velocity.dot(support.normal) < -1
    ) {
      const velocityYaw = Math.atan2(this.velocity.x, this.velocity.z);
      const yawError = Math.min(
        Math.abs(wrap(this.yaw - velocityYaw)),
        Math.abs(wrap(this.yaw - velocityYaw + Math.PI)),
      );
      const slopePitch = -Math.atan2(
        support.normal
          .clone()
          .negate()
          .dot(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))),
        support.normal.y,
      );
      if (yawError < 0.78 && Math.abs(wrap(this.pitch - slopePitch)) < 0.95) {
        const intoSurface = -this.velocity.dot(support.normal);
        this.velocity.addScaledVector(
          support.normal,
          intoSurface * TUNE.reentryCaptureStrength * Math.max(0,1-Math.hypot(input.steer,input.lean)),
        );
        if(!this.bodyFlip.active)this.pitch = damp(this.pitch, slopePitch, 4, dt);
      }
    }
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
      this.world.step(this.contactEvents, this.contactHooks);
      return;
    }
    if (this.rampWorld && this.grounded) this.normal.copy(support.normal);
    else this.normal.lerp(support.normal, 1 - Math.exp(-18 * dt)).normalize();
    if (wasGrounded && !this.grounded && !this.grind) {
      const leavingLip = this.rampWorld
        ? outdoorLip(
            this.position.x,
            this.position.z,
            this.velocity.z,
            this.velocity.x,
          )
        : null;
      if (leavingLip && leavingLip.distance < 0.55 && this.velocity.y > 0.3) {
        this.departureLip=leavingLip;
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
      this.bodyFlip.begin('natural_ramp_air',this.pitch);
      this.airWeight.reset(this.pitch, this.yaw);
      this.airSpin.reset();
    }
    if (this.grounded) this.lastGround = this.elapsed;
    const edgeGrace =
      this.elapsed - this.lastGround < TUNE.coyoteTime &&
      (!this.rampWorld || !!this.launchLip());
    const supportedForTrick = this.grounded || !!this.grind || edgeGrace;
    const gesture =
      supportedForTrick &&
      input.held.leftModifier < 0.5
        ? this.tricks.gesture.step(dt, input.rx, input.ry)
        : null;
    const chargedSide=supportedForTrick&&this.preload.amount>.08&&Math.abs(input.rx)>.85&&Math.abs(input.ry)<.35;
    if(input.held.body>.5&&(gesture||chargedSide)){this.pop(Math.max(.15,this.preload.amount),input.lean);this.preload.reset();}
    else if (gesture?.kind === "bri"||chargedSide)
      this.groundIntent = {
        direction: gesture?.kind==='bri'?gesture.direction*(gesture.short?this.tricks.naturalDirection:1):-Math.sign(input.rx)*this.tricks.naturalDirection,
        charge: this.preload.amount,
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
        (atTakeoff && input.pressed[barButton]))
    ) {
      this.pop(Math.max(0.15, this.preload.amount), input.lean,
        this.tricks.controlStyle==='arcade'&&input.pressed.hop?'manual_hop':'trick_initiated_pop');
      this.preload.reset();
    }
    if (this.groundIntent) {
      const intent = this.groundIntent;
      intent.age += dt;
      const lip = this.rampWorld
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
        if (supportedForTrick)
          this.pop(Math.max(0.15, intent.charge), input.lean);
        this.tricks.bri.kick(intent.direction);
        this.groundIntent = null;
        this.preload.reset();
      }
    }
    // Preload survives the lip briefly and can buffer a release just before contact.
    const preloadLip = this.rampWorld && supportedForTrick && !this.manual.active
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
    const gentleRS = Math.abs(input.ry)>=TUNE.manualMin && Math.abs(input.ry)<=TUNE.manualMax && Math.abs(input.rx)<.25 && input.held.leftModifier<.3 && input.held.rightModifier<.3;
    this.manualIntentTime=gentleRS?this.manualIntentTime+dt:0;
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
    this.charge = this.grounded && !this.manual.active && input.held.leftModifier < 0.5
      ? (input.ry >= TUNE.preloadThreshold ? clamp(input.ry, 0, 1) : 0) : 0;
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
      this.pop(this.bufferCharge, input.lean,'manual_hop');
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
        Math.abs(input.rx) > 0.72
      ) {
        this.finishGrind();
        this.grounded = false;
        this.state = "Airborne";
        this.tricks.startAir(true);
        this.bodyFlip.begin('trick_initiated_pop',this.pitch);
        this.popTimer = 0.1;
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
          : 12
        : 10;
      g.lateralSpeed +=
        (-(lateral - g.contactOffset) * spring -
          g.lateralSpeed * (settling ? TUNE.grindLateralDamping : 5)) *
        dt;
      this.velocity
        .copy(g.direction)
        .multiplyScalar(g.speed)
        .addScaledVector(side, g.lateralSpeed);
      this.velocity.y +=
        clamp((point.y + 0.14 - this.position.y) * 18, -2, 2);
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
        this.bodyFlip.begin('natural_ramp_air',this.pitch);
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
      const crouching = this.preload.amount > 0.08 && input.ry > 0.55 && !this.manual.active;
      const downhill = tangent.y * sign;
      const brake = input.held.brake;
      const rollingDrag = crouching && speed > 4
        ? TUNE.rollingDrag * TUNE.crouchFastDragMultiplier
        : TUNE.rollingDrag;
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
          TUNE.push * clamp(1 - Math.max(0, along) / TUNE.maxSpeed, 0, 1),
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
      if (
        !this.manual.active &&
        this.manualIntentTime >= TUNE.manualDwell &&
        speed > 0.7 &&
        this.manualEntryLock === 0
      ) {
        this.manual.enter(input.ry < 0);
        this.manualEntryLock = 0.35;
        this.manualRecorded = false;
      }
      if (this.manual.active) {
        this.score.holdContact(dt, this.manual.duration, false, 1, this.manual.nose ? "Nose Manual" : "Manual");
        // Ignore the entry flick for a fraction of a second, then give the stick full balance control.
        const result = this.manual.step(
          dt,
          this.preload.amount > 0 ? (this.manual.nose ? -.32 : .32) : input.ry,
          (speed - this.lastSpeed) / dt,
        );

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
      if (this.rampWorld && this.velocity.lengthSq() > 0.00001)
        this.velocity.setLength(surfaceSpeed);
      this.lastSpeed = speed;
    } else {
      this.state = "Airborne";
      this.body.setGravityScale(1, true);
      this.airTime += dt;
      this.rampLean = damp(this.rampLean, 0, 4, dt);
      this.fakie.step(dt, this.yaw, this.velocity.x, this.velocity.z, 0, false);
      const flipChord=input.held.brake>.5&&input.held.pumpGrind>.5&&(this.bodyFlip.active||((this.bodyFlip.origin==='manual_hop'||this.bodyFlip.origin==='fastplant')&&Math.abs(input.lean)>.25));
      this.pitch=this.bodyFlip.step(dt,flipChord,input.lean,this.pitch);
      this.spin = this.airSpin.step(
        dt,
        this.spin,
        input.steer,
        this.velocity.y,
        Math.max(0, gap),
        this.airTime,
        this.bodyFlip.active?TUNE.flipYawRateScale:1,
      );
      const rotation = this.spin * dt;
      this.yaw += rotation;
      this.tricks.yaw += rotation;
      if(!this.bodyFlip.active)this.airWeight.step(dt, input.lean, this.yaw, this.velocity);
      this.airYawInput = input.steer;
      const basePitch = this.airWeight.basePitch(this.yaw, this.airTime);
      if(!this.bodyFlip.active)this.pitch = damp(
        this.pitch,
        clamp(basePitch + this.airWeight.pitchBias, -1.25, 1.25),
        12,
        dt,
      );
      this.roll = damp(this.roll, input.steer * 0.07, 4, dt);
      this.tricks.flip=this.bodyFlip.angle;
      this.tricks.input(dt, input, flipChord);
      this.captureGrind(input);
      if (input.held.pumpGrind <= 0.3) this.grindCandidate = "—";
    }
    if (this.velocity.length() > 28) this.velocity.setLength(28);
    const lip = this.rampWorld
      ? outdoorLip(
          this.position.x,
          this.position.z,
          this.velocity.z,
          this.velocity.x,
        )
      : null;
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
      this.departureLip=lip;
      if (lip.module.kind === "spine")
        this.redirectSpine(lip.direction, input.lean, lip.forward);
      if (lip.module.kind === "box")
        this.redirectBox(lip.forward, this.preload.amount, 0.7);
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
    const crossing = onTransition || brakingForSpine || this.lipClearTimer > 0;
    this.body
      .collider(0)
      .setCollisionGroups(
        this.grind ? GROUPS.chassisSurfaceOnly : crossing ? GROUPS.chassisClearCoping : GROUPS.chassis,
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
    };
  }
}
