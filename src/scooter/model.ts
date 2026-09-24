import {briPose} from './bri-pose';
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { tube } from './surfaces';
import { Simulation } from "../physics/simulation";
import {ScooterAssembly, GRIP_PALM_OFFSET} from "./assembly";
import { Avatar } from '../avatar/avatar';
import { ARM_REACH, RIDE_STANCE, RIG, STAND, headFromChest, hipJoint, pelvisFromChest, shoulderJoint } from '../avatar/rig';
import type { AvatarConfig } from '../avatar/config';
import type { LocalProfile } from "../data/loadout";
import { damp, TUNE } from "../core/config";
import { clampGrabHand, frontFootIndex, pushFootIndex, sideIndex } from "../core/stance";
import { LongboardAssembly } from "../longboard/assembly";
import { poseLongboard } from "../longboard/pose";
import { defaultLongboard, type LongboardLoadout } from "../data/longboardParts";
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/**
 * Where a hand holding a round bar puts its wrist to reach toward `shoulder`:
 * the hand rolls round the bar (Avatar.update), so the wrist can sit anywhere
 * on the circle of radius `roll` about the bar axis through `centre`; the
 * nearest point of that circle to the shoulder is the one it reaches for.
 */
function barWrist(shoulder:THREE.Vector3,centre:THREE.Vector3,axis:THREE.Vector3,roll:number){
  const d=shoulder.clone().sub(centre),perp=d.addScaledVector(axis,-d.dot(axis)),length=perp.length();
  return length<1e-6?centre.clone():centre.clone().addScaledVector(perp,roll/length);
}
/** Elbow hint for a hand target: a hinge with the avatar's fixed arm segments, bent toward `pole`. */
function armElbow(shoulder:THREE.Vector3,hand:THREE.Vector3,pole:THREE.Vector3){
  const delta=hand.clone().sub(shoulder),distance=Math.max(.001,delta.length()),direction=delta.divideScalar(distance);
  const upper=RIG.upperArm,lower=RIG.forearm,reach=Math.min(distance,upper+lower-1e-4);
  const along=(upper*upper-lower*lower+reach*reach)/(2*reach);
  pole.addScaledVector(direction,-pole.dot(direction));
  if(pole.lengthSq()<.001)pole.set(0,0,1).addScaledVector(direction,-direction.z);
  return shoulder.clone().addScaledVector(direction,along).addScaledVector(pole.normalize(),Math.sqrt(Math.max(0,upper*upper-along*along)));
}
/** An invisible pose driver. */
function driver(parent:THREE.Object3D,name:string,position=v(0,0,0)){const o=new THREE.Object3D();o.name=name;o.position.copy(position);parent.add(o);return o;}
/** Flip tuck shape at full rotation rate (rider-local metres / radians). */
const TUCK = { crouch: 0.1, deckLift: 0.42, deckBack: 0.02, deckTilt: 0, round: 0.2, hipsBack: 0, torsoBack: 0 };
// Clamp Grab: the rider folds forward over the bars and pulls the scooter up and
// back toward the reaching hand, because the clamp sits low on the stem, far
// below the shoulders. Tuned so both arms stay inside the avatar's reach.
export const CLAMP = { crouch: 0.9, lift: 0.14, back: -0.1, pitch: -0.4 };
/** Body tricks done with the feet: both hands keep hold of the grips. */
const FOOT_TRICKS = new Set(['One-footer', 'Can Can', 'No Foot']);
if (import.meta.env?.DEV && typeof window !== "undefined") (window as any).__CLAMP = CLAMP; // tuning handle for tests
// Decade body: while the rider swings round the bars the knees draw up (crouch)
// with the feet together (footWidth either side of centre), lifted and a little
// back so the legs clear the deck, which stays still underneath.
export const DECADE = { crouch: 0.2, footWidth: 0.075, footLift: 0.26, footBack: -0.08 };
if (import.meta.env?.DEV && typeof window !== "undefined") (window as any).__DECADE = DECADE;
// Deck Grab: a deep tuck with the scooter pulled up (lift), in toward the rider
// (back), nose up (pitch) and tipped toward the grabbing hand (roll), so the free hand closes on the deck's edge
// `along` of the way from the neck to the tail, beside the front foot.
export const DECK_GRAB = { crouch: 0.8, lift: 0.3, back: -0.05, pitch: -0.6, roll: 0.2, along: 0.35 };
// Finger whip: the same pull-up while the free hand flicks the spinning deck;
// it is complete by the moment of contact and held until the hand lets go.
export const FINGER = { crouch: 0.86, lift: 0.36, back: 0.07, pitch: -0.22, roll: 0.22, along: 0.2 };
// Superman: the arms reach along `arms` (torso frame: up the spine, a little
// toward the chest), gripping at `reach` of full arm length (flipReach in a flip).
export const SUPERMAN = { arms: v(0, 0.85, 0.5), reach: 0.88, flipReach: 0.92 };
if (import.meta.env?.DEV && typeof window !== "undefined") Object.assign(window as any, { __DECK_GRAB: DECK_GRAB, __FINGER: FINGER });
export function poseRod(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.scale.y = a.distanceTo(b);
  m.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
}
export class RiderModel {
  /** The rendered rider, rebuilt from the profile's avatar configuration (docs/AVATAR-DESIGN.md). */
  avatar!: Avatar;
  private avatarKey='';
  private restingPose:{hip:THREE.Vector3;rotation:THREE.Quaternion;scooter:THREE.Vector3;scooterRotation:THREE.Quaternion;parts:{position:THREE.Vector3;rotation:THREE.Quaternion;scale:THREE.Vector3}[]}|null=null;
  private poseParts(){return [this.hips,this.torso,this.head,...this.upperArms,...this.forearms,...this.hands,...this.thighs,...this.shins,...this.shoes];}
  assembly: ScooterAssembly;
  root = new THREE.Group();
  scooter = new THREE.Group();
  /** The Sometimes Summer board, built on first use and shown in place of the scooter. */
  board = new THREE.Group();
  boardAssembly?: LongboardAssembly;
  private boardKey = "";
  /** 0 walking with the board, 1 standing sideways on it. */
  boardStance = 0;
  /** Set by the first-person camera for the local rider only. */
  hideHead = false;
  /** Head pitch while reading the phone, and the phone arm pose (set by the game for the local rider). */
  phoneTilt = 0;
  phonePose: ((rider: RiderModel) => void) | null = null;
  /** Longboard carry: 0 held by the top truck while moving, 1 tucked under the arm standing still. */
  boardHold = 0;
  /** 1 while pushing a longboard facing down the board, 0 in the sideways carving stance. */
  boardPushStance = 0;
  boardWheelAngle = 0;
  deckPivot = new THREE.Group();
  barPivot = new THREE.Group();
  rider = new THREE.Group();
  wheels: THREE.Mesh[] = [];
  /**
   * Semantic pose drivers (invisible). The chest (torso), pelvis (hips) and
   * head centre take frames; upper arms, forearms, thighs and shins are rods
   * (poseRod) whose far ends hint the elbows and knees; hands hold the wrist
   * and grip frame; shoes hold the ankle and foot frame. The avatar follows
   * them with its own fixed limb lengths (src/avatar/avatar.ts).
   */
  torso: THREE.Object3D;
  head: THREE.Object3D;
  hips: THREE.Object3D;
  upperArms: THREE.Object3D[] = [];
  forearms: THREE.Object3D[] = [];
  thighs: THREE.Object3D[] = [];
  shins: THREE.Object3D[] = [];
  shoes: THREE.Object3D[] = [];
  hands: THREE.Object3D[] = [];
  knees: THREE.Object3D[] = [];
  walkOffset = 0;
  crouch = 0;
  wheelAngle = 0;
  carry = 0;
  /** 0 in the rider's hands, 1 once a jump-on has put the deck under their feet. */
  placed = 0;
  private backpack=new THREE.Group();
  pushFoot = v(0.055, 0.2, -0.19);
  /** The deck pivot's resting position while a Decade holds the deck in place for a frame. */
  private deckHome: THREE.Vector3 | null = null;
  /** 0..1 of the way from the rider's usual pitch to the scooter's, to keep hold of the bars (leanIntoBars). */
  private barLean = 0;
  constructor(scene: THREE.Scene, avatar?: Partial<AvatarConfig>) {
    scene.add(this.root);
    this.root.add(this.scooter, this.rider, this.board);
    this.board.visible = false;
    this.assembly = new ScooterAssembly(this.scooter);
    this.deckPivot = this.assembly.deckPivot;
    this.barPivot = this.assembly.barPivot;
    this.wheels = this.assembly.wheels;
    this.torso = driver(this.rider, 'Chest driver', v(0, STAND.height, -0.045));
    this.hips = driver(this.rider, 'Pelvis driver');
    this.head = driver(this.rider, 'Head driver');
    this.hips.position.copy(pelvisFromChest(this.torso));
    this.head.position.copy(headFromChest(this.torso));
    for (const sign of [-1, 1]) {
      const i = sign < 0 ? 0 : 1;
      const shoulder = v(sign * .165, STAND.height + RIG.shoulderY, 0), elbow = v(sign * .2, shoulder.y - RIG.upperArm, 0), wrist = v(sign * .2, elbow.y - RIG.forearm, .02);
      const hip = v(sign * .09, this.hips.position.y + RIG.hipJointY, 0), knee = v(sign * .09, hip.y - RIG.thigh, .02), ankle = v(sign * .09, knee.y - RIG.shin, 0);
      this.upperArms.push(driver(this.rider, 'Upper arm driver ' + i));poseRod(this.upperArms[i], shoulder, elbow);
      this.forearms.push(driver(this.rider, 'Forearm driver ' + i));poseRod(this.forearms[i], elbow, wrist);
      this.hands.push(driver(this.rider, 'Hand driver ' + i, wrist));
      this.thighs.push(driver(this.rider, 'Thigh driver ' + i));poseRod(this.thighs[i], hip, knee);
      this.shins.push(driver(this.rider, 'Shin driver ' + i));poseRod(this.shins[i], knee, ankle);
      this.knees.push(driver(this.rider, 'Knee driver ' + i, knee));
      this.shoes.push(driver(this.rider, 'Foot driver ' + i, ankle));
      this.hands[i].userData.freeWrist = true;
    }
    this.hands.forEach((h,i)=>h.userData.gripRadius=this.assembly.gripSockets[i]?.userData.gripRadius??.024);
    this.setAvatar(avatar ?? {});
  }

  /** Rebuilds the rendered rider when the configuration changes; the drivers and the pose are untouched. */
  setAvatar(config: Partial<AvatarConfig>) {
    const key = JSON.stringify(config);
    if (key === this.avatarKey && this.avatar) return;
    this.avatarKey = key;
    this.avatar?.dispose();
    this.avatar = new Avatar(this, config);
    this.avatar.anchors.back.add(this.backpack);
    this.root.userData.characterRevision = 'avatar-1';
    this.root.userData.avatar = this.avatar.config;
  }

  applyProfile(profile: LocalProfile) {
    if(!this.backpack.children.length){
      this.backpack.name='Fitted canvas backpack';
      const fabric=new THREE.MeshStandardMaterial({color:0x34474b,roughness:.95}),trim=new THREE.MeshStandardMaterial({color:0x1b292c,roughness:.9});
      // Built against the chest's back (the avatar's back anchor); +z faces the rider.
      const bag=new THREE.Mesh(new RoundedBoxGeometry(.25,.3,.12,4,.045),fabric);bag.position.set(0,-.02,-.06);bag.castShadow=true;this.backpack.add(bag);
      const pocket=new THREE.Mesh(new RoundedBoxGeometry(.18,.13,.045,3,.02),fabric);pocket.position.set(0,-.08,-.135);pocket.castShadow=true;this.backpack.add(pocket);
      for(const side of [-1,1]){const curve=new THREE.CatmullRomCurve3([v(side*.085,-.13,-.05),v(side*.115,.11,-.03),v(side*.11,.2,.06),v(side*.115,.12,.2),v(side*.12,-.08,.2),v(side*.085,-.14,-.05)]),positions:number[]=[],indices:number[]=[];
        for(let i=0;i<=32;i++){const p=curve.getPoint(i/32);positions.push(p.x-.016,p.y,p.z,p.x+.016,p.y,p.z);if(i<32){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}}
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const material=trim.clone();material.side=THREE.DoubleSide;const strap=new THREE.Mesh(geometry,material);strap.castShadow=true;this.backpack.add(strap);
      }
      const handle=new THREE.Mesh(tube([v(-.04,.13,-.06),v(-.035,.17,-.06),v(.035,.17,-.06),v(.04,.13,-.06)],.007),trim);this.backpack.add(handle);
      const zip=new THREE.Mesh(new THREE.BoxGeometry(.14,.004,.005),trim);zip.position.set(0,-.028,-.155);this.backpack.add(zip);
    }
    this.backpack.visible=profile.pockets.backpack;
    this.setAvatar(profile.avatar);
    this.assembly.build(profile.scooter);
    // Built only once a board is owned or shown, so scooter-only players pay nothing.
    if (profile.activeRideable === "longboard" || this.boardAssembly) this.setLongboard(profile.longboard);
    this.deckPivot = this.assembly.deckPivot;
    this.barPivot = this.assembly.barPivot;
    this.wheels = this.assembly.wheels;this.hands.forEach((h,i)=>h.userData.gripRadius=this.assembly.gripSockets[i]?.userData.gripRadius??.024);
    this.root.userData.stance = profile.settings.stance;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1,
        front = frontFootIndex(profile.settings.stance);
      const foot = v(sign * 0.055, 0.15 + this.avatar.ankleOffsets[i], i === front ? 0.04 : -0.19),
        knee = v(sign * 0.13, 0.53, 0.04);
      this.shoes[i].position.copy(foot);
      poseRod(this.shins[i], knee, foot);
    }
    this.avatar.update(0);
  }
  dispose(){this.avatar.dispose();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.root.removeFromParent();}
  /** The menu preview pose: hands on the grips. `time` drives the blink. */
  posePreviewHands(time = 0) {
    this.root.updateMatrixWorld(true);
    const inverse=this.rider.getWorldQuaternion(new THREE.Quaternion()).invert();
    for(let i=0;i<2;i++){
      const sign=i===0?-1:1,socket=this.assembly.gripSockets[i];
      const rotation=socket.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverse);
      const hand=this.rider.worldToLocal(socket.getWorldPosition(new THREE.Vector3())).add(v(0,(this.hands[i].userData.gripRadius??.0165)+GRIP_PALM_OFFSET,-(this.hands[i].userData.palmLength??RIG.palm)).applyQuaternion(rotation));
      const shoulder=shoulderJoint(this.torso,sign as -1|1,this.avatar.shape);
      const elbow=armElbow(shoulder,hand,v(sign*.34,-.85,-.12));
      poseRod(this.upperArms[i],shoulder,elbow);poseRod(this.forearms[i],elbow,hand);
      this.hands[i].position.copy(hand);this.hands[i].quaternion.copy(rotation);this.hands[i].userData.openHand=0;this.hands[i].userData.freeWrist=false;
      this.hands[i].userData.barLift=(this.hands[i].userData.gripRadius??.0165)+GRIP_PALM_OFFSET;
    }
    this.avatar.update(time);this.root.updateMatrixWorld(true);
  }
  /** Builds or rebuilds the longboard when its loadout changes. */
  setLongboard(loadout: LongboardLoadout = defaultLongboard()) {
    const key = JSON.stringify(loadout);
    if (key === this.boardKey && this.boardAssembly) return;
    this.boardKey = key;
    if (this.boardAssembly) this.boardAssembly.build(loadout);
    else this.boardAssembly = new LongboardAssembly(this.board, loadout);
  }
  /** Shared end of every pose: the avatar follows the drivers. */
  finishPose(elapsed: number) {
    this.avatar.update(elapsed);
  }
  private tuck = 0;
  /** 1 standing on the deck, 0 walking or sitting; eases the torso between drivers. */
  private rideStance = 1;
  /**
   * 0..1 while the scooter is busy doing its own trick inside a flip. The tuck
   * pulls the deck up to the seat so the knees can fold, which is only right
   * when nothing else moves the scooter: with a whip, barspin, Bri, fingerwhip,
   * grab or Superman it put the spinning deck and bars between the legs and
   * through the torso. Only a tuck no-hander keeps the full ball-up.
   */
  private trickClear = 0;
  /** Keep the rigid scooter outside the chest/head during its authored sweep.
   * This adjusts presentation before hand IK; it never moves the physics body. */
  /**
   * Holding the bars at any pitch. The rider normally pitches only 65% as far
   * as the scooter, which on a steep nose-down air carried the grips past the
   * rider's arms (hands 8-16 cm off the bars) and on a nose-up one brought the
   * stem into the chest. This leans the whole rider further toward the
   * scooter's pitch, only as far as that needs; the wheels stay where the
   * physics put them. It is measured against the scooter's ordinary pose, not a
   * Bri's sweep, so a Bri caught at a steep pitch ends exactly on the ordinary
   * pose instead of popping when the Bri's own reach and body clearance let go.
   * More lean is taken at once (the hands never leave the bars); less eases off.
   */
  /**
   * Superman: the body is stretched out flat behind the bars with both arms
   * reaching forward past the head. Moves the scooter so the middle of its grips
   * sits SUPERMAN.reach of the way to full arm's length from the shoulders,
   * along the stretched arms, instead of at a fixed spot the arms could not
   * always reach.
   */
  private fitSupermanBars(blend:number,inFlip:boolean){
    this.root.updateMatrixWorld(true);
    const toRoot=(o:THREE.Object3D,p:THREE.Vector3)=>this.root.worldToLocal(o.localToWorld(p));
    const shoulders=toRoot(this.rider,v(0,RIG.shoulderY,RIG.shoulderZ).applyQuaternion(this.torso.quaternion).add(this.torso.position));
    const arms=SUPERMAN.arms.clone().normalize().applyQuaternion(this.torso.quaternion).applyQuaternion(this.rider.quaternion);
    const length=(Math.min(...this.avatar.armReach)+this.gripRoll(0))*(inFlip?SUPERMAN.flipReach:SUPERMAN.reach);
    const grips=toRoot(this.assembly.gripSockets[0],v(0,0,0)).lerp(toRoot(this.assembly.gripSockets[1],v(0,0,0)),.5);
    this.scooter.position.addScaledVector(shoulders.addScaledVector(arms,length).sub(grips),blend);
    this.root.updateMatrixWorld(true);
  }
  /** Distance from a held grip's bar axis to the wrist: palm height over the bar and the palm's length. */
  private gripRoll(i:number){
    return Math.hypot((this.hands[i].userData.gripRadius??.0165)+GRIP_PALM_OFFSET,this.hands[i].userData.palmLength??RIG.palm);
  }
  private leanIntoBars(baseScooter:THREE.Matrix4,scooterPitch:number,barYaw:number,handsOnBars:boolean,dt:number){
    const from=this.rider.rotation.x,span=scooterPitch-from;
    if(Math.abs(span)<1e-4){this.barLean=0;return;}
    const bars=baseScooter.clone().multiply(new THREE.Matrix4().compose(this.barPivot.position,new THREE.Quaternion().setFromAxisAngle(v(0,1,0),barYaw),v(1,1,1)));
    const sockets=this.assembly.gripSockets.map(o=>o.position.clone().applyMatrix4(bars));
    const barAxis=v(1,0,0).transformDirection(bars),roll=[this.gripRoll(0),this.gripRoll(1)];
    const segments:[THREE.Line3,number][]=[[new THREE.Line3(v(0,.30,-.008).applyMatrix4(bars),sockets[0].clone().lerp(sockets[1],.5)),.025],[new THREE.Line3(sockets[0],sockets[1]),.028]];
    const reach=this.avatar.armReach.map(r=>r*.98);
    const shoulders=([-1,1] as const).map(sign=>shoulderJoint(this.torso,sign,this.avatar.shape));
    const centres:[THREE.Vector3,number][]=[[this.hips.position.clone(),.17],[this.torso.position.clone().add(v(0,.05,0).applyQuaternion(this.torso.quaternion)),.2],[this.head.position.clone(),.135]];
    const euler=this.rider.rotation.clone(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=v(0,0,0);
    let limit='';
    const violation=(t:number)=>{
      euler.x=from+span*t;matrix.compose(this.rider.position,q.setFromEuler(euler),this.rider.scale);
      let worst=-Infinity;
      const note=(value:number,name:string)=>{if(value>worst){worst=value;limit=name;}};
      if(handsOnBars)for(let i=0;i<2;i++){p.copy(shoulders[i]).applyMatrix4(matrix);note(p.distanceTo(barWrist(p,sockets[i],barAxis,roll[i]))-reach[i],'reach'+i);}
      centres.forEach(([centre,radius],c)=>{p.copy(centre).applyMatrix4(matrix);segments.forEach(([segment,thickness],k)=>note(.01-(segment.closestPointToPoint(p,true,v(0,0,0)).distanceTo(p)-radius-thickness),['hips','chest','head'][c]+(k?'-bar':'-stem')));});
      return worst;
    };
    // Whatever cannot be met even leaning all the way (a crude body sphere
    // touching the bars in the ordinary stance) is not asked for.
    const floor=Math.max(0,violation(1))+1e-4,start=violation(0);
    this.root.userData.barLean={start:+start.toFixed(4),floor:+floor.toFixed(4),limit};
    let needed=0;
    if(start>floor){let lo=0,hi=1;for(let k=0;k<12;k++){const mid=(lo+hi)/2;if(violation(mid)>floor)lo=mid;else hi=mid;}needed=hi;}
    this.barLean=needed>=this.barLean?needed:damp(this.barLean,needed,10,dt);
    this.rider.rotation.x=from+span*this.barLean;
    this.root.updateMatrixWorld(true);
  }
  private clearTrickBody(side:number) {
    const toRoot=(object:THREE.Object3D,p:THREE.Vector3)=>this.root.worldToLocal(object.localToWorld(p));
    const direction=v(side*.8,0,.6).normalize(),total=v(0,0,0);
    const centres:[THREE.Vector3,number][]=[
      [toRoot(this.rider,this.hips.position.clone()),.17],
      [toRoot(this.rider,this.torso.position.clone().add(v(0,.05,0).applyQuaternion(this.torso.quaternion))),.20],
      [toRoot(this.rider,this.head.position.clone()),.135],
    ];
    let minimum=Infinity;
    for(let pass=0;pass<7;pass++){
      this.root.updateMatrixWorld(true);
      const grips=this.assembly.gripSockets.map(o=>toRoot(o,v(0,0,0)));
      const segments:[THREE.Vector3,THREE.Vector3,number][]=[
        [toRoot(this.barPivot,v(0,.30,-.008)),grips[0].clone().lerp(grips[1],.5),.025],
        [grips[0],grips[1],.028],
        [toRoot(this.deckPivot,v(0,.10,-.62)),toRoot(this.deckPivot,v(0,.10,0)),.085],
      ];
      let shift=0;minimum=Infinity;
      for(const [centre,radius] of centres)for(const [a,b,thickness] of segments){
        const delta=new THREE.Line3(a,b).closestPointToPoint(centre,true,v(0,0,0)).sub(centre),clearance=delta.length()-radius-thickness;
        minimum=Math.min(minimum,clearance);
        if(clearance<.006){const dot=delta.dot(direction),r=radius+thickness+.008;shift=Math.max(shift,-dot+Math.sqrt(Math.max(0,dot*dot+r*r-delta.lengthSq())));}
      }
      if(shift<.001)break;
      const step=direction.clone().multiplyScalar(Math.min(.16,shift));this.scooter.position.add(step);total.add(step);
    }
    this.root.userData.trickBodyClearance={minimum,offset:total.toArray()};
  }
  /** 0..1 flip tuck from the rotation rate, smoothed so it opens out gradually. */
  private flipTuck(s: Simulation) {
    const rate = s.bodyFlip.active ? THREE.MathUtils.smoothstep(Math.abs(s.bodyFlip.velocity), 1.5, 6) : 0;
    return s.tricks.visualPose === "Tuck No-hander" ? rate : rate * (1 - this.trickClear);
  }
  update(s: Simulation, dt: number, alpha: number) {
    const onBoard = s.rideable === "longboard";
    this.hands.forEach(h=>{h.userData.freeWrist=false;h.userData.barLift=0;});
    // Undo last frame's Decade hold on the deck (see orbitAroundScooter).
    if(this.deckHome){this.deckPivot.position.copy(this.deckHome);this.deckPivot.rotation.x=0;this.deckHome=null;}
    this.scooter.visible = !onBoard;
    this.board.visible = onBoard;
    if (onBoard && !this.boardAssembly) this.setLongboard();
    if(s.state==='Bail'&&s.crash){this.crashPose(s);if(onBoard){this.board.position.copy(this.scooter.position);this.board.quaternion.copy(this.scooter.quaternion);}return;}
    const flip=s.bodyFlip?.active?s.bodyFlip.angle:0,framed=!!s.bodyFlip?.active;
    // In a flip the root carries the takeoff pitch and roll (see below).
    const posturePitch=framed?0:s.pitch-flip,postureRoll=framed?0:s.roll;
    const riderPitch=framed?s.bodyFlip.basePitch*(.65-1):posturePitch*.65,riderRoll=framed?-.1*s.flipRoll0:s.roll*.9;
    this.root.position.copy(s.previousPosition).lerp(s.position, alpha);
    // The wheels sit one radius from the centre along the scooter's own up axis.
    // A fixed 22 cm straight down only holds on flat ground; on a steep
    // transition it floated the scooter off the wall or buried it, and the
    // correction arrived as a snap the moment the rider landed or levelled out.
    const riding = !s.walking && !s.sitting;
    const lean = riding
      ? s.pitch -
        (s.bodyFlip?.active ? s.bodyFlip.angle : 0) -
        (s.manual.active ? s.manual.pitch : 0)
      : 0;
    const heading = s.previousYaw + (s.yaw - s.previousYaw) * alpha,
      tilt = riding ? s.roll : 0;
    // The scooter's up axis after its pitch and roll (Euler XYZ) and the yaw.
    const upX = Math.cos(tilt) * Math.sin(lean),
      upY = Math.cos(tilt) * Math.cos(lean),
      sideX = -Math.sin(tilt);
    this.root.position.x -= (sideX * Math.cos(heading) + upX * Math.sin(heading)) * 0.22;
    this.root.position.y -= upY * 0.22;
    this.root.position.z -= (-sideX * Math.sin(heading) + upX * Math.cos(heading)) * 0.22;
    this.root.rotation.order='YXZ';
    this.root.rotation.set(
      flip,
      s.previousYaw + (s.yaw - s.previousYaw) * alpha,
      0,
    );
    // Rotate the complete rider and scooter around the body, not the front axle.
    if(s.bodyFlip?.active){
      // One body orientation (Simulation.flipOrientation): the takeoff frame,
      // the flip about its side axis, then air spin as a twist about the body's
      // own long axis. The frame already holds the takeoff pitch and roll, so the
      // children below do not apply them again.
      const frame=s.flipFrame(),q=s.flipOrientation(heading),pivot=v(0,.75,0);
      this.root.position.copy(s.previousPosition).lerp(s.position,alpha)
        .sub(v(0,.22,0).applyQuaternion(frame))
        .add(pivot.clone().applyQuaternion(frame))
        .sub(pivot.clone().applyQuaternion(q));
      this.root.quaternion.copy(q);
    }
    // Riding, walking and carrying on the longboard have their own pose;
    // sitting, emotes and getting up share the scooter's.
    if (onBoard && !s.sitting && !s.emote && s.getUpTimer <= 0) {
      poseLongboard(this, s, dt);
      return;
    }
    const usingItem=!!s.emote&&['drink','eat','drink-fountain','vend'].includes(s.emote.id);
    // A jump-on: the hands pull the deck in from beside the rider to under their
    // feet (walkOffset easing to zero) while the knees lift for it.
    const placing = !!s.jumpOn;
    this.placed = placing
      ? Math.min(1, this.placed + dt / TUNE.jumpOnPullTime)
      : 0;
    // The scooter rolls alongside a walking or running rider, hand on the bars;
    // it is never lifted onto its side.
    this.carry = damp(this.carry, 0, 8, dt);
    this.scooter.rotation.set(
      posturePitch * (1 - this.carry),
      0,
      postureRoll * (1 - this.carry) + (this.carry * Math.PI) / 2,
    );
    this.walkOffset = damp(
      this.walkOffset,
      s.sitting?.id ? 0.78 : s.walking && !placing ? 0.48 : 0,
      placing ? 1 / Math.max(.05, TUNE.jumpOnPullTime * .35) : 14,
      dt,
    );
    this.scooter.position.x = this.walkOffset;
    this.scooter.position.z = this.carry * 0.12;
    this.rider.rotation.set(
      riderPitch - s.rampLean * TUNE.rampLeanAngle,
      0,
      riderRoll,
    );
    this.scooter.position.y = s.manual.active
      ? Math.sin(Math.abs(s.manual.pitch)) * 0.32
      : s.sitting
        ? -0.55
        : this.carry * 1.02 + (placing ? Math.sin(this.placed * Math.PI) * 0.12 : 0);
    const bri = s.tricks.bri.angle,
      kickless = s.tricks.kickless.angle;
    const briActive =
      Math.abs(s.tricks.bri.velocity) > 0.1 || s.tricks.bri.mismatch > 0.02;
    const bp=briPose(bri,s.tricks.naturalDirection,s.tricks.quarterAir?s.tricks.yaw:0);
    const baseRotation=this.scooter.rotation.clone();
    // The scooter's ordinary pose this frame, before any trick moves it (see leanIntoBars).
    const baseScooter=new THREE.Matrix4().compose(this.scooter.position.clone(),new THREE.Quaternion().setFromEuler(baseRotation),this.scooter.scale);
    const cycle = Math.abs(bri) % (Math.PI * 2),
      lift = Math.sin(cycle / 2),
      side = Math.sign(bri) || 1;
    const inward = side !== s.tricks.naturalDirection;
    this.scooter.rotation.order = "YXZ";
    this.scooter.rotation.x += bp.rotation;
    this.scooter.rotation.y = briActive
      ? bp.yaw
      : 0;
    const kicklessActive=Math.abs(s.tricks.kickless.velocity)>.1||s.tricks.kickless.mismatch>.02;
    const kickLift=Math.sin((Math.abs(kickless)%(Math.PI*2))/2);
    this.scooter.rotation.z += Math.sign(kickless)*kickLift*.3;
    // Decade: the rider and bars go once round the steering axis (applied at the
    // end of update) while the deck is held exactly where it was.
    const decadeAngle=s.tricks.decade.angle;
    this.deckPivot.rotation.y = s.tricks.deck.angle-Math.sign(kickless)*kickLift*Math.PI*1.1;
    this.deckPivot.rotation.z = Math.sin(kickless) * 0.28;
    this.barPivot.rotation.y = s.tricks.bars.angle + (s.grounded ? -s.steer*.15 : 0) + (briActive?bp.barLead:0);
    this.barPivot.updateMatrix();
    const pivot=v(0,1.01,.26),actualGrip=this.assembly.gripSockets[0].position.clone().lerp(this.assembly.gripSockets[1].position,.5).applyMatrix4(this.barPivot.matrix);
    if(briActive){
      const barBase=this.barPivot.rotation.clone();barBase.y-=bp.barLead;
      const baselineGrip=this.assembly.gripSockets[0].position.clone().lerp(this.assembly.gripSockets[1].position,.5).applyEuler(barBase).add(this.barPivot.position);
      const desired=baselineGrip.applyEuler(baseRotation).add(v(...bp.offset));
      this.scooter.position.add(desired.sub(actualGrip.applyEuler(this.scooter.rotation)));
    }else if(kicklessActive){
      this.scooter.position.add(pivot.clone().applyEuler(baseRotation).add(v(0,kickLift*.12,kickLift*.06)).sub(pivot.clone().applyEuler(this.scooter.rotation)));
    }
    this.root.userData.briDebug={phase:bp.stage,progress:bp.phase,direction:side,angle:bri,relativePosition:this.scooter.position.toArray(),bodyRotation:flip,catching:bp.stage==='catch'};
    this.wheelAngle += (s.speed * dt) / 0.055;
    for (const w of this.wheels) w.rotation.x = this.wheelAngle;
    const scooterBusy = Math.abs(s.tricks.deck.velocity) > 1 || Math.abs(s.tricks.bars.velocity) > 1 || kicklessActive || briActive || s.tricks.fingerTime > 0 ||
      (!!s.tricks.visualPose && s.tricks.visualPose !== "Tuck No-hander");
    this.trickClear = damp(this.trickClear, scooterBusy ? 1 : 0, scooterBusy ? 14 : 4, dt);
    const crouchTarget =
      (s.sitting?.id ? 0.8 : s.emote?.id === "sit" ? .65 : 0) +
        s.getUpTimer * 0.8 +
        s.charge * 0.3 +
        this.flipTuck(s) * TUCK.crouch +
        (placing ? Math.sin(this.placed * Math.PI) * 0.3 : 0) +
        s.compression * 0.16 +
        (s.landTimer > 0 ? s.landTimer * (0.4 + s.landingCompression) : 0) +
        (s.popTimer > 0 ? 0.1 : 0);
    // Loading is quick; a released, unpopped crouch has a visible recovery.
    this.crouch = damp(
      this.crouch,
      crouchTarget,
      crouchTarget < this.crouch ? 5.5 : 16,
      dt,
    );
    // Tucked flips ball up like a real rider: the hips stay where they are, the
    // deck comes up behind toward the seat so the knees fold forward to the
    // chest, and the torso rounds over them. Dropping the whole body instead
    // crushed the legs through the torso. Opens out as the rotation slows.
    const tuck=this.flipTuck(s);
    this.scooter.position.y+=tuck*TUCK.deckLift;
    this.scooter.position.z+=tuck*TUCK.deckBack;
    this.scooter.rotation.x+=tuck*TUCK.deckTilt;
    const fingerReach=s.tricks.fingerTime>0?Math.sin((1-s.tricks.fingerTime/.35)*Math.PI):0;
    // Finger whip and Deck Grab: the deck is far below a standing rider's
    // 0.39 m arms, so the rider tucks deep and pulls the scooter up and toward
    // the free hand (as for the Clamp Grab) until the deck is within reach.
    const fingerPull=THREE.MathUtils.smoothstep(fingerReach,0,.7);
    this.scooter.position.y+=fingerPull*FINGER.lift;
    this.scooter.position.z-=fingerPull*FINGER.back;
    this.scooter.rotation.x+=fingerPull*FINGER.pitch;
    this.scooter.rotation.z+=fingerPull*FINGER.roll*s.tricks.fingerHand;
    const grabBlend=s.tricks.visualPose==='Deck Grab'?THREE.MathUtils.smoothstep(s.tricks.poseBlend,0,1):0;
    this.scooter.position.y+=grabBlend*DECK_GRAB.lift;
    this.scooter.position.z-=grabBlend*DECK_GRAB.back;
    this.scooter.rotation.x+=grabBlend*DECK_GRAB.pitch;
    // Regular grabs with the +x hand, Goofy with the -x hand (see grabbingHand).
    this.scooter.rotation.z+=grabBlend*DECK_GRAB.roll*(s.tricks.stance==='regular'?1:-1);
    const clampEase=s.tricks.visualPose==='Clamp Grab'?THREE.MathUtils.smoothstep(s.tricks.poseBlend,0,1):0;
    this.scooter.position.y+=clampEase*CLAMP.lift;
    this.scooter.position.z-=clampEase*CLAMP.back;
    this.scooter.rotation.x+=clampEase*CLAMP.pitch;
    const fountainBlend=s.emote?.id==='drink-fountain'?THREE.MathUtils.smoothstep(s.emote.time,0,.55)*(1-THREE.MathUtils.smoothstep(s.emote.time,2.25,2.8)):0;
    // 0 over the deck, 1 out at the side or front: the feet leave the deck for the
    // orbit. Eased so the knees draw up and set back down without a pop.
    const decadeLift=THREE.MathUtils.smoothstep(Math.abs(Math.sin(decadeAngle/2))*2.2,0,1);
    const c = this.crouch+grabBlend*DECK_GRAB.crouch+fingerPull*FINGER.crouch+fountainBlend*.25+clampEase*CLAMP.crouch+decadeLift*DECADE.crouch,
      whip = Math.abs(s.tricks.deck.velocity) > 1 || kicklessActive || briActive;
    // On the deck the avatar's fixed leg and arm lengths (avatar/rig.ts) set the
    // stance: hips high enough for relaxed (~28 degree) knees, the chest
    // leaning toward the bars so the hands reach the grips with bent elbows,
    // and a crouch that folds forward over the bars rather than dropping
    // straight down (which buried the shoulders below the grips and folded
    // the knees past 120 degrees). Walking and sitting keep their drivers.
    this.rideStance = damp(this.rideStance, riding ? 1 : 0, 10, dt);
    const ride = this.rideStance;
    this.torso.position.set(
      0,
      THREE.MathUtils.lerp(STAND.height - c, RIDE_STANCE.height - c * RIDE_STANCE.drop, ride) - s.rampLean * 0.05,
      THREE.MathUtils.lerp(-0.045 + c * 0.12, RIDE_STANCE.forward + c * RIDE_STANCE.reach, ride) - s.rampLean * 0.12,
    );
    this.torso.rotation.x = THREE.MathUtils.lerp(STAND.lean + c * 0.85, RIDE_STANCE.lean + c * RIDE_STANCE.fold, ride) + this.flipTuck(s) * TUCK.round;
    // Pushing: the standing knee bends and the hips drop and sit back so the
    // kicking foot can reach the ground; eased to zero at both cadence ends.
    const pushPhase = riding && s.pushTimer > 0 ? 1 - s.pushTimer / TUNE.pushCadence : -1;
    const pushDip = pushPhase >= 0 ? THREE.MathUtils.smoothstep(pushPhase, 0, .2) * (1 - THREE.MathUtils.smoothstep(pushPhase, .65, 1)) * ride : 0;
    this.torso.position.y -= pushDip * .14;
    this.torso.position.z -= pushDip * .1;
    this.torso.rotation.x += pushDip * .1;
    this.torso.position.z -= this.flipTuck(s) * TUCK.torsoBack;
    this.torso.rotation.y=briActive?bp.torsoYaw:0;
    this.torso.position.x-=briActive?side*bp.clearance*.055:0;
    this.torso.rotation.x+=fountainBlend*.39;
    this.torso.position.z+=fountainBlend*.16;
    const weight = s.airWeight.shift;
    const pose = s.tricks.visualPose,
      blend = s.tricks.poseBlend;
    if (pose === "Superman") {
      // Body stretched out flat toward the bars with the legs kicked back; the
      // scooter rises a little and stays ahead, so the deck never sweeps through
      // the torso on the way in.
      // Inside a flip the body stretches less and the scooter is held further out
      // in front and lower, so the stem cannot come back past the head as the
      // rotation carries the rider round it.
      // Both hands stay on the grips: the bars are placed at arm's length in
      // front of the shoulders once the body is posed (fitSupermanBars).
      const inFlip = s.bodyFlip.active ? 1 : 0;
      this.torso.rotation.x += blend * (1.2 - inFlip * 0.45);
      this.torso.position.z -= blend * .1;
      this.torso.position.y -= blend * .06;
      this.scooter.rotation.x+=blend*(.12 + inFlip * .25);
    }
    if (pose === "Tuck No-hander") {
      this.torso.position.y -= blend * 0.2;
      this.scooter.position.y += blend * 0.2;
    }
    if (s.dropIn.phase) {
      this.torso.position.z += s.dropIn.lean * 0.25;
      this.hips.position.z -= 0.12;
    }
    // Standing on the deck the lean reads mostly through the chest angle: a
    // full fore-aft shift carried the shoulders past the grips and flared
    // both elbows up like wings.
    this.torso.position.z += weight * TUNE.airWeightShiftStrength * (1 - .65 * ride);
    this.torso.rotation.x += weight * 0.36;
    this.hips.position.set(0, 0.88 - c, -0.13 - c * 0.5);
    this.hips.position.z += weight * TUNE.airWeightShiftStrength * 0.65;
    pelvisFromChest(this.torso, this.hips.position);
    this.hips.rotation.copy(this.torso.rotation);
    // Tuck: seat back so the thighs fold forward rather than into the chest.
    this.hips.position.z -= this.flipTuck(s) * TUCK.hipsBack;
    headFromChest(this.torso, this.head.position);
    this.head.position.z += weight * TUNE.airWeightShiftStrength*.2;
    if(usingItem){this.scooter.position.set(.68,0,-.10);this.scooter.rotation.set(0,0,-.2);}
    this.head.rotation.set(s.bodyFlip.active?THREE.MathUtils.clamp(s.bodyFlip.velocity*.025,-.15,.15):0,0,0);
    if(s.emote) {
      const t=s.emote.time,fade=Math.min(1,t*6,(s.emote.duration-t)*6);
      if(s.emote.id==="nod"||s.emote.id==="laugh")this.head.rotation.x=Math.sin(t*9)*.2*fade;
      if(s.emote.id==="shake")this.head.rotation.y=Math.sin(t*8)*.35*fade;
      if(s.emote.id==="facepalm")this.head.rotation.x=.25*fade;
      if(s.emote.id==="shrug"){this.head.rotation.z=Math.sin(Math.min(1,t*3)*Math.PI)*.12*fade;this.head.rotation.x=-.08*fade;}
      if(s.emote.id==="cheer")this.head.rotation.x=-.18*fade;
    }
    this.head.rotation.x+=this.phoneTilt;
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
    this.root.updateMatrixWorld(true);
    this.root.userData.trickBodyClearance=null;
    if(riding&&pose==='Superman')this.fitSupermanBars(blend,s.bodyFlip.active);
    if(riding&&pose!=='Superman'&&!placing&&!s.emote&&this.carry<.001)this.leanIntoBars(baseScooter,baseRotation.x,s.grounded?-s.steer*.15:0,!pose||FOOT_TRICKS.has(pose)||pose==='Clamp Grab',dt);
    else this.barLean=0;
    if(briActive||kicklessActive){
      // Keep the rigid bar sweep within both arms' reach before solving hands.
      // Clamping each wrist alone leaves a visible gap at the far grip.
      const inverse=this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      // The avatar's real shoulder joint and arm length, or the bars sweep
      // out of the hands. The margin covers the body clearance applied after.
      const reach=this.avatar.armReach.map(r=>r*.93);
      for(let pass=0;pass<6;pass++)for(let i=0;i<2;i++){
        const socket=this.assembly.gripSockets[i],q=socket.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverse);
        const shoulder=this.root.worldToLocal(this.rider.localToWorld(shoulderJoint(this.torso,i===0?-1:1,this.avatar.shape)));
        const wrist=barWrist(shoulder,this.root.worldToLocal(socket.getWorldPosition(v(0,0,0))),v(1,0,0).applyQuaternion(q),this.gripRoll(i));
        const delta=shoulder.sub(wrist),distance=delta.length();
        if(distance>reach[i]){this.scooter.position.addScaledVector(delta,(distance-reach[i])/distance);this.root.updateMatrixWorld(true);}
      }
    }
    if(!s.walking&&!s.sitting&&(briActive||kicklessActive||fingerReach>0||grabBlend>0||pose==='Superman')){
      this.clearTrickBody(briActive?side:kicklessActive?Math.sign(kickless):0);
      this.root.updateMatrixWorld(true);
    }
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      const rear = pushFootIndex(s.tricks.stance);
      const push =
        i === rear && s.pushTimer > 0 ? 1 - s.pushTimer / TUNE.pushCadence : -1;
      const foot = v(
        sign * (.043 + (Math.abs(s.tricks.deck.velocity)>1||kicklessActive?1:briActive?bp.clearance:0)*.177),
        0.15 + (Math.abs(s.tricks.deck.velocity)>1||kicklessActive?1:briActive?bp.clearance:0)*.2,
        i !== rear ? 0.04 : -0.19,
      );
      // Decade: the whole body swings round the bars as one piece, knees drawn
      // up with the feet together under the hips. Not the wide, kicking legs of
      // a whip, which made the orbit read as a tailwhip.
      if(decadeLift>0)foot.lerp(v(sign*DECADE.footWidth,.15+DECADE.footLift,DECADE.footBack),decadeLift);
      if (push >= 0 && !s.walking) {
        // Lift forward, plant, drive backward, then recover over the deck.
        // The path and blend both reach zero velocity at the cadence boundaries.
        const ease = (t: number) => t * t * (3 - 2 * t);
        // The avatar's leg (0.76 m hip to ankle) plants beside the front
        // foot and drives back along the ground inside its real reach;
        // the old stroke, 0.65 m behind, left its foot hanging in the air.
        const keys = [
          v(0.055, 0.15, -0.19),
          v(0.19, 0.05, 0.02),
          v(0.19, 0.045, -0.38),
          v(0.15, 0.19, -0.3),
          v(0.055, 0.15, -0.19),
        
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
        if (pose === "Superman") target.set(sign * 0.13, .82, -1.05);
        if (pose === "No Foot") target.set(sign * 0.48, 0.45, -0.1);
        if (pose === "Can Can")
          target.set(s.tricks.poseSide * (0.5 + i * 0.14), 0.5, -0.15);
        foot.lerp(target, blend);
        const reversal = s.tricks.deck.reversals.at(-1);
        if (
          s.tricks.deck.reversalAge < 0.18 &&
          reversal?.side === (i === 0 ? "left" : "right")
        ) {
          const kick=this.assembly.deckSocket.position.clone();
          kick.x=sign*Math.abs(kick.x);kick.y+=.045;
          kick.applyAxisAngle(v(0,1,0),reversal.angle).add(this.deckPivot.position);
          const contact=this.rider.worldToLocal(this.scooter.localToWorld(kick));
          foot.lerp(contact,1-s.tricks.deck.reversalAge/.18);
        }
      }
      if(s.fastplant&&i===rear){
        const plant=s.fastplant;
        const target=this.rider.worldToLocal(plant.foot.clone().add(v(0,.045,0)));
        const contact=plant.launched?Math.max(0,1-(plant.time-TUNE.fastplantContactTime)/.12):Math.min(1,plant.time/.045);
        foot.lerp(target,contact);
      }
      this.shoes[i].quaternion.identity();
      if(!s.walking&&!s.sitting&&!whip&&push<0&&!s.fastplant&&(!pose||pose==='Clamp Grab'||pose==='Deck Grab')){
        const worldFoot=this.scooter.localToWorld(foot.clone());foot.copy(this.rider.worldToLocal(worldFoot));
        this.shoes[i].quaternion.copy(this.rider.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.scooter.getWorldQuaternion(new THREE.Quaternion())));
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
        // Feet planted a shin's length below and a little ahead of the knee
        // edge of the seat; the old spot, half a metre out, was beyond the
        // rider's legs and locked both knees straight.
        const hipZ=hipJoint(this.hips,sign as -1|1,this.avatar.shape).z;foot.z=hipZ+.24;knee.z=hipZ+.36;
        this.shoes[i].position.copy(foot);
      }
      // Imported feet are anchored at the ankle, while the old targets located
      // the shoe centre. Apply the measured sole offset before solving the leg.
      foot.add(v(0,this.avatar.ankleOffsets[i],0).applyQuaternion(this.shoes[i].quaternion));
      this.shoes[i].position.copy(foot);
      const hip=hipJoint(this.hips,sign as -1|1,this.avatar.shape);
      if(!s.sitting){const delta=foot.clone().sub(hip),length=delta.length(),direction=delta.clone().normalize();const bendDirection=v(sign*.07,0,1);const pole=bendDirection.addScaledVector(direction,-bendDirection.dot(direction)).normalize();knee.copy(hip).lerp(foot,.5).addScaledVector(pole,Math.sqrt(Math.max(.0001,RIG.thigh*RIG.thigh-Math.min(RIG.thigh-.002,length/2)**2)));}
      this.knees[i].position.copy(knee);
      poseRod(this.thighs[i], hip, knee);
      poseRod(this.shins[i], knee, foot);
      const shoulder = shoulderJoint(this.torso, sign as -1|1, this.avatar.shape);
      let hand = v(sign * 0.24, 1.01, 0.26);
      const elbow = v(sign * 0.28, 1.13 - c * 0.7, 0.04);
      if (s.walking) {
        hand.set(
          sign > 0 ? 0.45 : -0.23,
          sign > 0 ? 1.01 : 0.78,
          sign > 0 ? 0.26 : -0.03 + Math.sin(s.elapsed * 9) * 0.12*Math.min(1,s.speed/TUNE.walkSpeed),
        );
        elbow.set(sign * 0.29, 1.08, 0);
      }
      if (this.carry > 0.001) {
        const low=v(0,.38,.29),high=v(0,1.01,.26),segment=high.clone().sub(low);
        const localShoulder=this.scooter.worldToLocal(this.rider.localToWorld(shoulder.clone()));
        const t=THREE.MathUtils.clamp(localShoulder.sub(low).dot(segment)/segment.lengthSq(),0,1);
        const contact=i===0?low.addScaledVector(segment,t):v(0,.15,-.24);
        const grip=this.rider.worldToLocal(this.scooter.localToWorld(contact));
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
        // Spread wide with soft elbows inside the avatar's reach instead of
        // locked out (or folded up).
        hand.lerp(v(sign * (pose === "Tuck No-hander" ? .46 : .5), pose === "Tuck No-hander" ? 1.22 : 1.44, .03), blend);
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
      if(s.emote && s.walking) {
        const t=s.emote.time,fade=Math.min(1,t*6,(s.emote.duration-t)*6), id=s.emote.id;
        const target=hand.clone();
        if(id==="wave"&&i===0)target.set(-.38+Math.sin(t*12)*.08,1.65,.03);
        if(id==="point"&&i===0)target.set(-.16,1.28,.59);
        if(id==="clap")target.set(sign*(.035+Math.abs(Math.sin(t*10))*.13),1.23,.34);
        if(id==="celebrate")target.set(sign*.39,1.74+Math.sin(t*8)*.04,0);
        if(id==="facepalm"&&i===0)target.copy(this.head.position).add(v(-.02,.045,.13));
        if(id==="laugh")target.set(sign*.11,.98,.14);
        if(id==="cheer"&&i===0)target.set(-.2,1.78+Math.abs(Math.sin(t*7))*.07,.06);
        if(id==="shrug"){const up=Math.sin(Math.min(1,t/1.2)*Math.PI);target.set(sign*(.3+.06*up),.98+.1*up,.2);}
        if(id==="sit")target.set(sign*.15,.4,.28);
        if(['drink','eat'].includes(id)&&i===0){const sip=THREE.MathUtils.smoothstep(t,.48,1.0)*(1-THREE.MathUtils.smoothstep(t,1.75,2.35)),tilt=id==='drink'?.9*sip:0;const wrist=v(-.035,-.052-.075*Math.sin(tilt)-.06*Math.cos(tilt),.105-.075*Math.cos(tilt)+.06*Math.sin(tilt));target.copy(v(-.18,1.0,.23).lerp(this.head.position.clone().add(wrist),sip));}
        if(['drink','eat','vend'].includes(id)&&i===1){target.set(.20,.88,.10);if(id==='drink'||id==='eat'){const opening=THREE.MathUtils.smoothstep(t,.12,.25)*(1-THREE.MathUtils.smoothstep(t,.43,.65));target.lerp(v(-.11,1.13,.27),opening);}}
        if(id==='drink-fountain')target.set(sign*.20,.92,.40);
        hand.lerp(target,fade);elbow.copy(shoulder).lerp(hand,.5);elbow.x+=sign*.08;
        poseRod(this.upperArms[i],shoulder,elbow);
      }
      if (s.sitting) {
        hand.set(sign * 0.14, 0.16, 0.25);
        elbow.copy(shoulder).lerp(hand, 0.55);
        poseRod(this.upperArms[i], shoulder, elbow);
      }
      // Superman keeps both hands on the bars with the body stretched out behind;
      // only the Deck Grab lets one hand go (Regular left, Goofy right, as before).
      const grabbingHand=pose==='Deck Grab'&&i===(s.tricks.stance==='regular'?1:0);
      // Clamp Grab: the stance-side hand (Regular right, Goofy left) leaves the bar; the other keeps its grip.
      const clampingHand=pose==='Clamp Grab'&&i===sideIndex(clampGrabHand(s.tricks.stance));
      // Walking or running, the hand on the scooter's side keeps hold of its bar.
      const walkingGrip=s.walking&&!s.sitting&&!s.emote&&!s.heldItem&&sign>0&&this.walkOffset>.3;
      const holdingGrip=walkingGrip||!s.walking&&!s.sitting&&!s.emote&&(!pose||FOOT_TRICKS.has(pose)||pose==='Clamp Grab'||pose==='Superman'||pose==='Deck Grab'&&!grabbingHand)&&(s.tricks.fingerTime===0||sign!==s.tricks.fingerHand)&&Math.abs(s.tricks.bars.velocity)<1;
      const gripRotation=new THREE.Quaternion();
      if(holdingGrip){
        this.assembly.gripSockets[i].getWorldQuaternion(gripRotation);
        const riderRotation=this.rider.getWorldQuaternion(new THREE.Quaternion()).invert();gripRotation.premultiply(riderRotation);
        const contact=this.assembly.gripSockets[i].getWorldPosition(new THREE.Vector3());
        if(walkingGrip){
          // Hold the crossbar near the stem while wheeling the scooter beside
          // the body. Reaching for its far grip overextended the right arm.
          contact.add(this.assembly.gripSockets[0].getWorldPosition(v(0,0,0))).multiplyScalar(.5);
          contact.add(v(-.075,0,0).applyQuaternion(this.assembly.gripSockets[i].getWorldQuaternion(new THREE.Quaternion())));
        }
        hand.copy(this.rider.worldToLocal(contact)).add(v(0,(walkingGrip?.012:this.hands[i].userData.gripRadius??.0165)+GRIP_PALM_OFFSET,-(this.hands[i].userData.palmLength??RIG.palm)).applyQuaternion(gripRotation));
      }
      const carryingContact=this.carry>.001&&!s.emote&&!s.heldItem;
      if(carryingContact){
        const relative=this.rider.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.scooter.getWorldQuaternion(new THREE.Quaternion()));
        // Align the palm's grip axis with the upright stem or deck edge.
        const rotation=relative.clone().multiply(i===0?new THREE.Quaternion().setFromUnitVectors(v(1,0,0),v(0,.63,-.03).normalize()):new THREE.Quaternion());
        gripRotation.copy(this.hands[i].quaternion).slerp(rotation,this.carry);
        hand.add(v(0,i===0?.030:.038,-(this.hands[i].userData.palmLength??RIG.palm)).applyQuaternion(rotation).multiplyScalar(this.carry));
      }
      if(clampingHand){
        // Ease from the grip to the clamp: the anchor is the equipped clamp's centre on the
        // stem and turns with the bars. A fist round a vertical stem: palm on the side the
        // hand comes from, fingers wrapping forward.
        const anchor=this.assembly.clampGrabAnchor,radius=(anchor.userData.radius as number|undefined)??.03;
        const rotation=anchor.getWorldQuaternion(new THREE.Quaternion()).premultiply(this.rider.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(new THREE.Quaternion().setFromAxisAngle(v(0,0,1),-sign*Math.PI/2));
        const palm=v(0,radius+GRIP_PALM_OFFSET,-(this.hands[i].userData.palmLength??RIG.palm)).applyQuaternion(rotation);
        const target=this.rider.worldToLocal(anchor.getWorldPosition(new THREE.Vector3())).add(palm);
        hand.lerp(target,clampEase);
        gripRotation.slerp(rotation,clampEase);
      }
      if(grabbingHand){
        // The deck's edge on the grabbing side, DECK_GRAB.along of the way from the neck to the tail.
        const edge=this.assembly.deckSocket.position.clone();edge.x=sign*Math.abs(edge.x);edge.z*=DECK_GRAB.along/.5;
        const deckTarget=this.rider.worldToLocal(this.deckPivot.localToWorld(edge));
        const deckRotation=this.assembly.deckSocket.getWorldQuaternion(new THREE.Quaternion());deckRotation.premultiply(this.rider.getWorldQuaternion(new THREE.Quaternion()).invert());deckRotation.multiply(new THREE.Quaternion().setFromAxisAngle(v(0,1,0),-sign*Math.PI/2));
        gripRotation.copy(deckRotation);
        deckTarget.sub(v(0,-.035,this.hands[i].userData.palmLength??RIG.palm).applyQuaternion(deckRotation));
        const aroundThigh=deckTarget.clone().add(v(sign*.22,.08,.10));
        hand.copy(aroundThigh.lerp(deckTarget,THREE.MathUtils.smoothstep(blend,.55,1)));
      }
      const fingerContact=s.tricks.fingerTime>0&&sign===s.tricks.fingerHand;
      if(s.walking&&s.heldItem&&i===0&&!usingItem)hand.set(-.22,.95,.20);
      if(fingerContact){
        const local=this.assembly.deckSocket.position.clone();local.x*=sign;local.z*=FINGER.along/.5;
        const deckTarget=this.rider.worldToLocal(this.deckPivot.localToWorld(local));
        const reachFrom=shoulderJoint(this.torso,sign as -1|1,this.avatar.shape);
        const toDeck=deckTarget.clone().sub(reachFrom);
        // The palm, not the wrist, meets the deck's edge.
        const onDeck=deckTarget.clone().addScaledVector(toDeck.clone().normalize(),-(this.hands[i].userData.palmLength??RIG.palm)*.5);
        // Before and after the flick the hand follows the deck, inside the arm's reach.
        const hover=reachFrom.clone().add(toDeck.clone().setLength(Math.min(toDeck.length(),this.avatar.armReach[i]*.95)));
        const contact=deckTarget.x*sign>=-.02&&s.tricks.fingerTime>.20;
        hand.lerp(contact?hover.lerp(onDeck,THREE.MathUtils.smoothstep(fingerReach,.35,.7)):hover,THREE.MathUtils.smoothstep(fingerReach,0,.55));
      }
      if(holdingGrip||grabbingHand||fingerContact||this.carry>.001||(s.walking&&!s.sitting&&!s.emote&&!s.heldItem)){
        // A held grip stays on its bar: the avatar rolls the fist round the bar
        // toward the shoulder to reach (avatar.ts). Only a free hand is pulled in.
        const delta=hand.clone().sub(shoulder);const reach=delta.length();
        if(reach>ARM_REACH&&!holdingGrip)hand.copy(shoulder).addScaledVector(delta,ARM_REACH/reach);
        elbow.copy(armElbow(shoulder,hand,fingerContact||grabbingHand?v(sign*.8,-.3,.7):clampingHand?v(sign*.34,-.85,-.12).lerp(v(sign*.9,-.15,-.45),clampEase):v(sign*.34,-.85,-.12)));
        poseRod(this.upperArms[i],shoulder,elbow);
      }
      poseRod(this.forearms[i], elbow, hand);
      this.hands[i].userData.openHand=holdingGrip||fingerContact||grabbingHand||this.carry>.5?0:s.emote?1:s.walking?.35:.7;
      this.hands[i].position.copy(hand);
      this.hands[i].quaternion.setFromUnitVectors(
        v(0, 1, 0),
        elbow.clone().sub(hand).normalize(),
      );
      if(holdingGrip||grabbingHand||carryingContact)this.hands[i].quaternion.copy(gripRotation);
      else if(s.walking&&!s.emote&&!s.sitting&&!s.heldItem){
        const fingers=hand.clone().sub(elbow).normalize(),back=v(sign,0,0);
        back.addScaledVector(fingers,-back.dot(fingers)).normalize();
        const across=back.clone().cross(fingers).normalize();
        this.hands[i].quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,back,fingers));
      }
      if(s.walking&&s.heldItem&&i===0){const t=s.emote?.time??0,sip=s.emote?.id==='drink'?THREE.MathUtils.smoothstep(t,.48,1)*(1-THREE.MathUtils.smoothstep(t,1.75,2.35)):0;this.hands[i].quaternion.setFromEuler(new THREE.Euler(-.9*sip,0,Math.PI/2));this.hands[i].userData.openHand=0;}
      // A hand gripping nothing lets the arm carry the wrist naturally.
      this.hands[i].userData.freeWrist=!(holdingGrip||grabbingHand||carryingContact)&&!(s.walking&&s.heldItem&&i===0);
      // Palm height above a held bar's axis; the avatar's fist may roll around the bar.
      this.hands[i].userData.barLift=holdingGrip&&!carryingContact?(walkingGrip?.012:this.hands[i].userData.gripRadius??.0165)+GRIP_PALM_OFFSET:0;
    }
    if(s.getUpTimer>0&&this.restingPose){
      const t=THREE.MathUtils.smoothstep(1-s.getUpTimer/.75,0,1),rest=this.restingPose;
      this.root.updateMatrixWorld(true);
      const targetHip=this.hips.getWorldPosition(new THREE.Vector3()),targetQ=this.rider.getWorldQuaternion(new THREE.Quaternion());
      const worldHip=rest.hip.clone().lerp(targetHip,t);worldHip.y+=Math.sin(t*Math.PI)*.23;
      this.poseParts().forEach((part,i)=>{part.position.lerpVectors(rest.parts[i].position,part.position,t);part.quaternion.slerpQuaternions(rest.parts[i].rotation,part.quaternion,t);part.scale.lerpVectors(rest.parts[i].scale,part.scale,t);});
      const inverse=this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.rider.quaternion.copy(rest.rotation).slerp(targetQ,t).premultiply(inverse);
      this.rider.position.copy(this.root.worldToLocal(worldHip)).sub(this.hips.position.clone().applyQuaternion(this.rider.quaternion));
      const scooterWorld=this.scooter.getWorldPosition(new THREE.Vector3()),scooterQ=this.scooter.getWorldQuaternion(new THREE.Quaternion());
      this.scooter.position.copy(this.root.worldToLocal(rest.scooter.clone().lerp(scooterWorld,t)));
      this.scooter.quaternion.copy(rest.scooterRotation).slerp(scooterQ,t).premultiply(inverse);
    }else this.restingPose=null;
    if(s.getUpTimer<=0)
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
    this.phonePose?.(this);
    this.avatar.update(s.elapsed);
    if (decadeAngle !== 0 && !s.walking && !s.sitting) this.orbitAroundScooter(decadeAngle);
  }
  /**
   * Decade: turns the rider and the bar assembly rigidly about the scooter's
   * steering axis (the deck's pivot), so the hands never leave the grips and the
   * rider goes around the front of the scooter. Done last so every pose above
   * was solved against an ordinary scooter; the deck is turned back separately.
   */
  private orbitAroundScooter(angle:number){
    this.root.updateMatrixWorld(true);
    // The deck (with the rear wheel) keeps exactly the world transform it had
    // before the orbit, position and orientation, whatever the scooter's tilt:
    // it neither turns nor slides, so nothing about it reads as a whip.
    const deckWorld=this.deckPivot.matrixWorld.clone();
    this.deckHome=this.deckPivot.position.clone();
    this.scooter.updateMatrix();
    const axis=this.deckPivot.position.clone().applyMatrix4(this.scooter.matrix),q=new THREE.Quaternion().setFromAxisAngle(v(0,1,0),angle);
    for(const o of [this.scooter,this.rider]){o.position.sub(axis).applyQuaternion(q).add(axis);o.quaternion.premultiply(q);}
    this.root.updateMatrixWorld(true);
    this.scooter.matrixWorld.clone().invert().multiply(deckWorld).decompose(this.deckPivot.position,this.deckPivot.quaternion,this.deckPivot.scale);
    this.deckPivot.updateMatrixWorld(true);
  }
  private crashPose(s:Simulation){
    const crash=s.crash!;this.root.position.set(0,0,0);this.root.rotation.set(0,0,0);
    this.rider.quaternion.copy(crash.rider.rotation());this.rider.position.copy(crash.rider.translation()).sub(v(0,.85,0).applyQuaternion(this.rider.quaternion));
    this.scooter.position.copy(crash.scooter.translation());this.scooter.quaternion.copy(crash.scooter.rotation());this.deckPivot.rotation.set(0,0,0);this.barPivot.rotation.set(0,0,0);
    this.torso.position.set(0,1.1,0);this.torso.rotation.set(.05,0,0);pelvisFromChest(this.torso,this.hips.position);this.hips.rotation.set(0,0,0);headFromChest(this.torso,this.head.position);
    const look=crash.rest>2&&crash.rest<4?Math.sin((crash.rest-2)*Math.PI)*.2:0;this.head.rotation.set(0,look,0);
    const brace=Math.max(0,1-crash.age/.75);
    for(let i=0;i<2;i++){const sign=i?1:-1,foot=v(sign*.13,.12,i?.12:-.08),knee=v(sign*.13,.48,.14+brace*.16),hip=hipJoint(this.hips,sign as -1|1,this.avatar.shape),shoulder=shoulderJoint(this.torso,sign as -1|1,this.avatar.shape),elbow=v(sign*(.25+brace*.06),1.05,.12+brace*.17),hand=v(sign*.18,.98+brace*.12,.16+brace*.32);poseRod(this.thighs[i],hip,knee);poseRod(this.shins[i],knee,foot);this.shoes[i].position.copy(foot);this.shoes[i].quaternion.identity();poseRod(this.upperArms[i],shoulder,elbow);poseRod(this.forearms[i],elbow,hand);this.hands[i].position.copy(hand);this.hands[i].quaternion.identity();this.hands[i].userData.openHand=.6;this.hands[i].userData.freeWrist=true;}
    this.avatar.update(s.elapsed);this.root.updateMatrixWorld(true);
    this.restingPose={hip:this.hips.getWorldPosition(new THREE.Vector3()),rotation:this.rider.getWorldQuaternion(new THREE.Quaternion()),scooter:this.scooter.getWorldPosition(new THREE.Vector3()),scooterRotation:this.scooter.getWorldQuaternion(new THREE.Quaternion()),parts:this.poseParts().map(p=>({position:p.position.clone(),rotation:p.quaternion.clone(),scale:p.scale.clone()}))};
  }
}
