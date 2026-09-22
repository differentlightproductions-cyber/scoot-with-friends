import {legFrame} from './limb-frame';
import {briPose} from './bri-pose';
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { tailored } from "./geometry";
import { GarmentSkin, sneakerGeometry } from './character-skin';
import { tube, detailTexture } from './surfaces';
import { Simulation } from "../physics/simulation";
import {ScooterAssembly, GRIP_PALM_OFFSET} from "./assembly";
import {ImportedHuman,loadImportedHuman} from './imported-human';
import { RIDERS } from "../data/riders";
import { clothing, defaultOutfit } from '../data/outfits';
import type { LocalProfile } from "../data/loadout";
import { damp, TUNE } from "../core/config";
import { LongboardAssembly } from "../longboard/assembly";
import { poseLongboard } from "../longboard/pose";
import { defaultLongboard, type LongboardLoadout } from "../data/longboardParts";
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
  shoe: new THREE.MeshStandardMaterial({ color: 0x263333, roughness: .86 }),
};
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function box(
  parent: THREE.Object3D,
  size: THREE.Vector3,
  pos: THREE.Vector3,
  mat: THREE.Material,
) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(size.x, size.y, size.z, 3, Math.min(size.x,size.y,size.z)*0.3), mat);
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
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat);
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
/** Flip tuck shape at full rotation rate (rider-local metres / radians). */
const TUCK = { crouch: 0.1, deckLift: 0.42, deckBack: 0.02, deckTilt: 0, round: 0.2, hipsBack: 0, torsoBack: 0 };
export function poseRod(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.scale.y = a.distanceTo(b);
  if(m.userData.legFrame)m.quaternion.copy(legFrame(a,b));else m.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
}
export class RiderModel {
  human?:ImportedHuman;
  private humanKey='';private humanRequest=0;
  private restingPose:{hip:THREE.Vector3;rotation:THREE.Quaternion;scooter:THREE.Vector3;scooterRotation:THREE.Quaternion;parts:{position:THREE.Vector3;rotation:THREE.Quaternion;scale:THREE.Vector3}[]}|null=null;
  private poseParts(){return [this.hips,this.torso,this.head,this.neck,...this.upperArms,...this.forearms,...this.hands,...this.thighs,...this.shins,...this.shoes];}
  assembly: ScooterAssembly;
  private materials = Object.fromEntries(
    Object.entries(materials).map(([key, value]) => [key, value.clone()]),
  ) as typeof materials;
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
  /** Longboard carry: 0 held by the top truck while moving, 1 tucked under the arm standing still. */
  boardHold = 0;
  /** 1 while pushing a longboard facing down the board, 0 in the sideways carving stance. */
  boardPushStance = 0;
  boardWheelAngle = 0;
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
  hood = new THREE.Group();
  garmentDetails = new THREE.Group();
  headDetails = new THREE.Group();
  shortLegs: THREE.Mesh[] = [];
  cuffs: THREE.Mesh[] = [];
  knees: THREE.Mesh[] = [];
  neck: THREE.Mesh;
  walkOffset = 0;
  crouch = 0;
  wheelAngle = 0;
  carry = 0;
  /** 0 in the rider's hands, 1 once a jump-on has put the deck under their feet. */
  placed = 0;
  private backpack=new THREE.Group();
  pushFoot = v(0.055, 0.2, -0.19);
  private garmentSkins:GarmentSkin[]=[];
  private trousers?:GarmentSkin;
  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.root.add(this.scooter, this.rider, this.board);
    this.board.visible = false;
    this.assembly = new ScooterAssembly(this.scooter);
    this.deckPivot = this.assembly.deckPivot;
    this.barPivot = this.assembly.barPivot;
    this.wheels = this.assembly.wheels;this.hands.forEach((h,i)=>h.userData.gripRadius=this.assembly.gripSockets[i]?.userData.gripRadius??.024);
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
    this.torso.geometry.dispose();
    this.torso.geometry=tailored([[-.225,.154,.107],[-.19,.16,.114],[-.12,.153,.113],[-.04,.163,.117],[.075,.182,.124],[.145,.184,.119],[.185,.15,.10],[.225,.067,.063]]);
    this.hips.geometry.dispose();
    this.hips.geometry=tailored([[-.10,.12,.09],[-.04,.153,.105],[.06,.15,.108],[.085,.14,.10]]);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(.069,.008,12,40),this.materials.shirt);
    seam.rotation.x=Math.PI/2;seam.position.y=.226;this.torso.add(seam);
    const hem = new THREE.Mesh(tailored([[-.225,.158,.108],[-.208,.16,.11]]),this.materials.shirt);
    this.torso.add(hem);
    this.torso.add(this.hood);
    this.torso.add(this.garmentDetails);
    sphere(this.hood,.12,v(0,.19,-.09),this.materials.shirt,v(1.05,1,.7));
    this.hood.visible=false;
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
    this.helmet.add(this.headDetails);
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
      hand.position.set(sign*.24,1.035,.26);
      this.rider.add(hand);
      this.hands.push(hand);
      box(hand, v(0.066, 0.065, 0.031), v(0, 0, 0), this.materials.skin);
      for (let f = 0; f < 4; f++) {
        box(
          hand,
          v(0.014, 0.028, 0.018),
          v((f - 1.5) * 0.017, -0.025, 0.026),
          this.materials.skin,
        );
        const tip = box(
          hand,
          v(0.014, 0.023, 0.017),
          v((f - 1.5) * 0.017, -0.044, 0.015),
          this.materials.skin,
        );
        tip.rotation.x = 0.9;
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
      const shoe=this.shoes[this.shoes.length-1];
      shoe.geometry.dispose();
      shoe.geometry=new RoundedBoxGeometry(.105,.08,.23,2,.028);
      box(shoe,v(.109,.021,.235),v(0,-.03,0),white);
      box(shoe,v(.069,.065,.085),v(0,.026,-.05),this.materials.black);
      box(shoe,v(.055,.055,.074),v(0,.027,.02),this.materials.pants).rotation.x=.3;
      box(shoe,v(.111,.026,.032),v(0,-.012,-.097),white);
      for(let j=0;j<3;j++) box(shoe,v(.059,.006,.012),v(0,.046,.003+j*.018),white);
      const thigh=this.thighs[this.thighs.length-1];
      thigh.geometry.dispose();thigh.geometry=tailored([[-.5,.079,.077],[-.38,.087,.081],[.18,.099,.093],[.5,.084,.08]]);
      const shorts=new THREE.Mesh(tailored([[-.51,.09,.09],[-.3,.106,.1],[.18,.102,.098],[.23,.106,.101]]),this.materials.pants);
      shorts.visible=false;thigh.add(shorts);this.shortLegs.push(shorts);
      const shin=this.shins[this.shins.length-1];
      shin.geometry.dispose();shin.geometry=tailored([[-.5,.051,.052],[-.4,.06,.06],[.05,.068,.063],[.5,.075,.074]]);
      const sleeve=this.upperArms[this.upperArms.length-1];
      sleeve.geometry.dispose();sleeve.geometry=tailored([[-.5,.073,.07],[-.43,.078,.075],[.3,.08,.075],[.5,.065,.06]]);
    }
  }

  private finishCharacter(){
    // Drivers remain authoritative for all established poses. Only the rendered surfaces change.
    this.trousers=new GarmentSkin(this.rider,[this.hips,this.thighs[0],this.shins[0],this.thighs[1],this.shins[1]],'pants',[this.materials.pants,this.materials.pants]);
    this.garmentSkins.push(this.trousers);
    for(let i=0;i<2;i++)this.garmentSkins.push(new GarmentSkin(this.rider,[this.upperArms[i],this.forearms[i]],'arm',[this.materials.shirt,this.materials.skin]));
    [...this.thighs,...this.shins].forEach(m=>m.userData.legFrame=true);
    this.hips.visible=false;this.thighs.forEach(o=>o.visible=false);this.shins.forEach(o=>o.visible=false);this.knees.forEach(o=>o.visible=false);this.upperArms.forEach(o=>o.visible=false);this.forearms.forEach(o=>o.visible=false);
    for(const key of ['shirt','pants','shoe'] as const){this.materials[key].bumpMap=detailTexture('fabric');this.materials[key].bumpScale=.0005;}
    for(let i=0;i<2;i++){
      const shoe=this.shoes[i];shoe.geometry.dispose();shoe.geometry=sneakerGeometry();shoe.clear();
      const sole=new THREE.Mesh(sneakerGeometry(true),new THREE.MeshStandardMaterial({color:0xdbd9cd,roughness:.88}));shoe.add(sole);
      const collar=new THREE.Mesh(new THREE.TorusGeometry(.032,.009,12,32),this.materials.shoe);collar.rotation.x=Math.PI/2;collar.scale.z=1.25;collar.position.set(0,.047,-.054);shoe.add(collar);
      const opening=new THREE.Mesh(new THREE.CircleGeometry(.029,24),this.materials.black);opening.rotation.x=-Math.PI/2;opening.position.set(0,.046,-.054);shoe.add(opening);
      box(shoe,v(.042,.012,.079),v(0,.047,-.002),this.materials.shoe).rotation.x=.2;
      for(let j=0;j<4;j++){const lace=new THREE.Mesh(tube([v(-.027,.045,-.028+j*.016),v(0,.057,-.02+j*.016),v(.027,.045,-.028+j*.016)],.0022),sole.material);shoe.add(lace);}
      for(const s of [-1,1]){
        const seam=new THREE.Mesh(tube([v(s*.039,.021,-.086),v(s*.051,.023,-.027),v(s*.05,.012,.058),v(s*.035,.011,.094)],.0012),sole.material);shoe.add(seam);
      }
      const hand=this.hands[i],sign=i===0?-1:1;hand.clear();
      sphere(hand,.035,v(0,.002,.001),this.materials.skin,v(1,.95,.48));
      for(let j=0;j<4;j++){
        const x=(j-1.5)*.016,len=j===0||j===3?.044:.052;
        const finger=new THREE.Mesh(tube([v(x,-.015,.01),v(x,-.024,.028),v(x,-.042,.033),v(x,-len,.017)],.0071),this.materials.skin);hand.add(finger);
        sphere(hand,.0072,v(x,-len,.017),this.materials.skin);
      }
      hand.add(new THREE.Mesh(tube([v(-sign*.026,.014,0),v(-sign*.041,-.009,.012),v(-sign*.035,-.028,.024)],.010),this.materials.skin));
    }
    // Chin, jaw and cheeks have deliberate profiles rather than a scaled sphere.
    this.head.geometry.dispose();this.head.geometry=tailored([[-.139,.046,.055],[-.114,.069,.073],[-.067,.095,.095],[-.015,.112,.111],[.046,.112,.108],[.102,.095,.087],[.137,.062,.061],[.149,.002,.002]]);
    this.head.scale.set(1,1,1);this.head.clear();
    const eye=new THREE.MeshStandardMaterial({color:0xf0e6d5,roughness:.55});
    for(const sign of [-1,1]){
      sphere(this.head,.032,v(sign*.106,-.012,.005),this.materials.skin,v(.55,1,.67));
      sphere(this.head,.023,v(sign*.044,.014,.100),eye,v(1,.66,.39));
      sphere(this.head,.010,v(sign*.043,.014,.109),this.materials.black,v(.77,1,.33));
      this.head.add(new THREE.Mesh(tube([v(sign*.023,.04,.105),v(sign*.044,.046,.11),v(sign*.064,.037,.099)],.0045),this.materials.black));
    }
    sphere(this.head,.022,v(0,-.018,.113),this.materials.skin,v(.65,.86,1.1));
    this.head.add(new THREE.Mesh(tube([v(-.024,-.070,.088),v(0,-.075,.098),v(.024,-.068,.088)],.0025),new THREE.MeshStandardMaterial({color:0x805a49,roughness:1})));
    this.root.userData.characterRevision='tailored-stylized-1';
  }

  setClothing(outfit: { top: string; bottom: string; shoes: string; head: string }) {
    for(const group of [this.garmentDetails,this.headDetails]) {
      group.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});group.clear();
    }
    this.hood.visible=outfit.top==="hoodie";
    this.helmet.visible=outfit.head!=='none';
    if(outfit.head==='vented')for(const x of [-.07,0,.07])box(this.headDetails,v(.019,.012,.09),v(x,.09,.025),this.materials.black);
    if(outfit.head==='visor')box(this.headDetails,v(.24,.022,.11),v(0,.005,.13),this.materials.helmet);
    if(['helmet','vented','visor'].includes(outfit.head))for(const side of [-1,1])rod(this.headDetails,v(side*.12,-.035,.015),v(side*.06,-.22,.04),.006,this.materials.black);
    this.forearms.forEach(arm=>arm.material=outfit.top==="tee"?this.materials.skin:this.materials.shirt);
    this.shins.forEach(leg=>leg.material=outfit.bottom==="shorts"?this.materials.skin:this.materials.pants);
    this.thighs.forEach(leg=>leg.material=outfit.bottom==="shorts"?this.materials.skin:this.materials.pants);
    this.knees.forEach(knee=>knee.material=outfit.bottom==="shorts"?this.materials.skin:this.materials.pants);
    this.shortLegs.forEach(leg=>leg.visible=outfit.bottom==="shorts");
    if(outfit.top==="jacket"){
      box(this.garmentDetails,v(.012,.4,.016),v(0,-.015,.117),this.materials.black);
      for(const side of [-1,1])box(this.garmentDetails,v(.08,.075,.013),v(side*.09,-.12,.11),this.materials.shirt);
    }
    if(outfit.top==="hoodie"){
      box(this.garmentDetails,v(.19,.07,.025),v(0,-.13,.115),this.materials.shirt);
      for(const side of [-1,1])rod(this.garmentDetails,v(side*.043,.19,.076),v(side*.045,.06,.13),.004,this.materials.black);
    }
    if(outfit.head==="cap")box(this.headDetails,v(.23,.018,.18),v(0,-.03,.105),this.materials.helmet);
    if(outfit.head==="beanie"){
      const rim=new THREE.Mesh(new THREE.TorusGeometry(.13,.018,5,12),this.materials.helmet);
      rim.rotation.x=Math.PI/2;rim.position.y=-.04;this.headDetails.add(rim);
    }
    this.shoes.forEach(shoe=>{shoe.scale.y=outfit.shoes==="high-top"?1.45:1;shoe.scale.z=outfit.shoes==='skate'?1.07:1;shoe.material=this.materials.shoe;});
    this.root.userData.clothing={...outfit};
    if(this.trousers){
      const shorts=outfit.bottom==='shorts';this.trousers.mesh.material=[this.materials.pants,shorts?this.materials.skin:this.materials.pants];
      this.hips.visible=false;this.thighs.forEach(o=>o.visible=false);this.shins.forEach(o=>o.visible=false);this.knees.forEach(o=>o.visible=false);
      for(const skin of this.garmentSkins.slice(1))skin.mesh.material=[this.materials.shirt,outfit.top==='tee'?this.materials.skin:this.materials.shirt];
    }
  }

  applyProfile(profile: LocalProfile) {
    if(!this.backpack.parent){
      this.backpack.name='Fitted canvas backpack';
      const fabric=new THREE.MeshStandardMaterial({color:0x34474b,roughness:.95}),trim=new THREE.MeshStandardMaterial({color:0x1b292c,roughness:.9});
      const bag=new THREE.Mesh(new RoundedBoxGeometry(.25,.32,.12,4,.045),fabric);bag.position.set(0,-.015,-.175);bag.castShadow=true;this.backpack.add(bag);
      const pocket=new THREE.Mesh(new RoundedBoxGeometry(.18,.13,.045,3,.02),fabric);pocket.position.set(0,-.085,-.25);pocket.castShadow=true;this.backpack.add(pocket);
      for(const side of [-1,1]){const curve=new THREE.CatmullRomCurve3([v(side*.085,-.13,-.17),v(side*.125,.11,-.15),v(side*.12,.21,-.045),v(side*.125,.12,.112),v(side*.13,-.10,.105),v(side*.085,-.14,-.17)]),positions:number[]=[],indices:number[]=[];
        for(let i=0;i<=32;i++){const p=curve.getPoint(i/32);positions.push(p.x-.016,p.y,p.z,p.x+.016,p.y,p.z);if(i<32){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}}
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const material=trim.clone();material.side=THREE.DoubleSide;const strap=new THREE.Mesh(geometry,material);strap.castShadow=true;this.backpack.add(strap);
      }
      const handle=new THREE.Mesh(tube([v(-.04,.15,-.18),v(-.035,.19,-.18),v(.035,.19,-.18),v(.04,.15,-.18)],.007),trim);this.backpack.add(handle);
      const zip=new THREE.Mesh(new THREE.BoxGeometry(.14,.004,.005),trim);zip.position.set(0,-.028,-.275);this.backpack.add(zip);this.rider.add(this.backpack);
    }
    this.backpack.position.copy(this.torso.position);this.backpack.quaternion.copy(this.torso.quaternion);
    this.backpack.visible=profile.pockets.backpack;
    if(!this.trousers)this.finishCharacter();
    this.assembly.build(profile.scooter);
    // Built only once a board is owned or shown, so scooter-only players pay nothing.
    if (profile.activeRideable === "longboard" || this.boardAssembly) this.setLongboard(profile.longboard);
    this.deckPivot = this.assembly.deckPivot;
    this.barPivot = this.assembly.barPivot;
    this.wheels = this.assembly.wheels;this.hands.forEach((h,i)=>h.userData.gripRadius=this.assembly.gripSockets[i]?.userData.gripRadius??.024);
    const rider = RIDERS.find((r) => r.id === profile.riderId) ?? RIDERS[0];
    this.materials.skin.color.set(rider.skin);
    this.materials.shirt.color.set(rider.shirt);
    this.materials.pants.color.set(rider.pants);
    this.materials.helmet.color.set(rider.helmet);
    const outfit=profile.outfit??defaultOutfit();
    const head=clothing(outfit,'head'),top=clothing(outfit,'top'),bottom=clothing(outfit,'bottom'),shoes=clothing(outfit,'shoes');
    this.setClothing({head:head.model,top:top.model,bottom:bottom.model,shoes:shoes.model});
    this.materials.shirt.color.set(top.color);this.materials.pants.color.set(bottom.color);
    this.materials.helmet.color.set(head.color);this.materials.shoe.color.set(shoes.color);
    this.rider.scale.x = 1;
    this.helmet.scale.set(this.human?1:rider.headScale, this.human?.85:0.73*rider.headScale, this.human?1.12:1);
    this.root.userData.riderId = rider.id;
    this.root.userData.stance = profile.settings.stance;
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1,
        front = profile.settings.stance === "regular" ? 0 : 1;
      const foot = v(sign * 0.055, 0.15, i === front ? 0.04 : -0.19),
        knee = v(sign * 0.13, 0.53, 0.04);
      this.shoes[i].position.copy(foot);
      poseRod(this.shins[i], knee, foot);
    }
    this.garmentSkins.forEach(g=>g.update());
    const quality=profile.settings.characterQuality==='auto'?profile.settings.fidelity:profile.settings.characterQuality;
    const key=[rider.id,profile.bodyBuild,profile.scooter.grips.partId,quality].join(':');
    if(this.human){[this.helmet,this.headDetails,this.hood,this.garmentDetails,...this.shortLegs,...this.cuffs,...this.shoes].forEach(o=>o.visible=false);this.garmentSkins.forEach(g=>g.mesh.visible=false);}
    if(this.humanKey!==key){const request=++this.humanRequest;void loadImportedHuman().then(()=>{
      if(request!==this.humanRequest)return;
      this.human?.dispose();this.human=new ImportedHuman(this,rider.id,quality,profile.bodyBuild);this.humanKey=key;
      [this.torso,this.head,this.neck,this.hips,...this.hands,...this.knees,...this.upperArms,...this.forearms,...this.thighs,...this.shins,...this.shoes,...this.shortLegs,...this.cuffs,this.hood,this.garmentDetails].forEach(o=>o.visible=false);
      this.garmentSkins.forEach(g=>g.mesh.visible=false);this.root.userData.characterRevision='christian-1';
      this.helmet.geometry.dispose();this.helmet.geometry=new THREE.SphereGeometry(.098,32,20,0,Math.PI*2,0,1.72);this.helmet.scale.set(1,.85,1.12);
      this.headDetails.visible=false;this.helmet.visible=false;
    });}
  }
  dispose(){this.humanRequest++;this.human?.dispose();this.human=undefined;const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.root.removeFromParent();}
  posePreviewHands() {
    this.backpack.position.copy(this.torso.position);this.backpack.quaternion.copy(this.torso.quaternion);
    this.root.updateMatrixWorld(true);
    const inverse=this.rider.getWorldQuaternion(new THREE.Quaternion()).invert();
    for(let i=0;i<2;i++){
      const sign=i===0?-1:1,socket=this.assembly.gripSockets[i];
      const rotation=socket.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverse);
      const hand=this.rider.worldToLocal(socket.getWorldPosition(new THREE.Vector3())).add(v(0,(this.hands[i].userData.gripRadius??.0165)+GRIP_PALM_OFFSET,-(this.hands[i].userData.palmLength??.082)).applyQuaternion(rotation));
      const shoulder=v(sign*.19,.17,0).applyEuler(this.torso.rotation).add(this.torso.position);
      const reach=shoulder.distanceTo(hand),bend=Math.sqrt(Math.max(.0004,.26*.26-Math.min(.25,reach/2)**2));
      const elbow=shoulder.clone().lerp(hand,.5).addScaledVector(v(sign*.34,-.85,-.12).normalize(),bend);
      poseRod(this.upperArms[i],shoulder,elbow);poseRod(this.forearms[i],elbow,hand);
      this.hands[i].position.copy(hand);this.hands[i].quaternion.copy(rotation);this.hands[i].userData.openHand=0;
    }
    this.garmentSkins.forEach(g=>g.update());this.human?.update(0);this.root.updateMatrixWorld(true);
  }
  /** Builds or rebuilds the longboard when its loadout changes. */
  setLongboard(loadout: LongboardLoadout = defaultLongboard()) {
    const key = JSON.stringify(loadout);
    if (key === this.boardKey && this.boardAssembly) return;
    this.boardKey = key;
    if (this.boardAssembly) this.boardAssembly.build(loadout);
    else this.boardAssembly = new LongboardAssembly(this.board, loadout);
  }
  /** Shared end of every pose: clothing, the anatomical mesh and the backpack follow the drivers. */
  finishPose(elapsed: number) {
    this.garmentSkins.forEach(g=>g.update());
    this.human?.update(elapsed);
    this.backpack.position.copy(this.torso.position);this.backpack.quaternion.copy(this.torso.quaternion);
  }
  private tuck = 0;
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
    this.scooter.position.y+=fingerReach*.28;
    const grabBlend=s.tricks.visualPose==='Deck Grab'?s.tricks.poseBlend:0;
    this.scooter.position.y+=grabBlend*.13;
    const fountainBlend=s.emote?.id==='drink-fountain'?THREE.MathUtils.smoothstep(s.emote.time,0,.55)*(1-THREE.MathUtils.smoothstep(s.emote.time,2.25,2.8)):0;
    const c = this.crouch+grabBlend*.4+fingerReach*.28+fountainBlend*.25,
      whip = Math.abs(s.tricks.deck.velocity) > 1 || kicklessActive || briActive;
    this.torso.position.set(
      0,
      1.13 - c - s.rampLean * 0.05,
      -0.045 + c * 0.12 - s.rampLean * 0.12,
    );
    this.torso.rotation.x = 0.10 + c * 0.85 + this.flipTuck(s) * TUCK.round;
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
      const inFlip = s.bodyFlip.active ? 1 : 0;
      this.torso.rotation.x += blend * (1.2 - inFlip * 0.45);
      this.torso.position.z -= blend * .1;
      this.torso.position.y -= blend * .06;
      this.scooter.position.lerp(inFlip ? v(.03,.30,.50) : v(.03,.36,.34),blend);
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
    // Tuck: seat back so the thighs fold forward rather than into the chest.
    this.hips.position.z -= this.flipTuck(s) * TUCK.hipsBack;
    this.head.position.copy(v(0,.36,.01).applyEuler(this.torso.rotation).add(this.torso.position));
    this.helmet.position.set(0, (this.human?1.55:1.57) - c, -0.025 + c * 0.3);
    this.head.position.z += weight * TUNE.airWeightShiftStrength*.2;
    if(usingItem){this.scooter.position.set(.68,0,-.10);this.scooter.rotation.set(0,0,-.2);}
    this.head.rotation.set(s.bodyFlip.active?THREE.MathUtils.clamp(s.bodyFlip.velocity*.025,-.15,.15):0,0,0);
    if(s.emote) {
      const t=s.emote.time,fade=Math.min(1,t*6,(s.emote.duration-t)*6);
      if(s.emote.id==="nod"||s.emote.id==="laugh")this.head.rotation.x=Math.sin(t*9)*.2*fade;
      if(s.emote.id==="shake")this.head.rotation.y=Math.sin(t*8)*.35*fade;
      if(s.emote.id==="facepalm")this.head.rotation.x=.25*fade;
    }
    this.helmet.position.z += weight * TUNE.airWeightShiftStrength;
    this.helmet.rotation.copy(this.head.rotation);
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
    this.root.updateMatrixWorld(true);
    this.root.userData.trickBodyClearance=null;
    if(briActive||kicklessActive){
      // Keep the rigid bar sweep within both arms' reach before solving hands.
      // Clamping each wrist alone leaves a visible gap at the far grip.
      const inverse=this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      for(let pass=0;pass<4;pass++)for(let i=0;i<2;i++){
        const socket=this.assembly.gripSockets[i],q=socket.getWorldQuaternion(new THREE.Quaternion()).premultiply(inverse);
        const wrist=this.root.worldToLocal(socket.getWorldPosition(v(0,0,0))).add(v(0,(this.hands[i].userData.gripRadius??.0165)+GRIP_PALM_OFFSET,-(this.hands[i].userData.palmLength??.082)).applyQuaternion(q));
        const shoulder=this.root.worldToLocal(this.rider.localToWorld(v((i===0?-1:1)*.19,.17,0).applyQuaternion(this.torso.quaternion).add(this.torso.position)));
        const delta=shoulder.sub(wrist),distance=delta.length();
        if(distance>.66){this.scooter.position.addScaledVector(delta,(distance-.66)/distance);this.root.updateMatrixWorld(true);}
      }
    }
    if(!s.walking&&!s.sitting&&(briActive||kicklessActive||fingerReach>0||grabBlend>0||pose==='Superman')){
      this.clearTrickBody(briActive?side:kicklessActive?Math.sign(kickless):0);
      this.root.updateMatrixWorld(true);
    }
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      const rear = s.tricks.stance === "regular" ? 1 : 0;
      const push =
        i === rear && s.pushTimer > 0 ? 1 - s.pushTimer / TUNE.pushCadence : -1;
      const foot = v(
        sign * (.043 + (Math.abs(s.tricks.deck.velocity)>1||kicklessActive?1:briActive?bp.clearance:0)*.177),
        0.15 + (Math.abs(s.tricks.deck.velocity)>1||kicklessActive?1:briActive?bp.clearance:0)*.2 + grabBlend*.13,
        i !== rear ? 0.04 : -0.19,
      );
      if (push >= 0 && !s.walking) {
        // Lift forward, plant, drive backward, then recover over the deck.
        // The path and blend both reach zero velocity at the cadence boundaries.
        const ease = (t: number) => t * t * (3 - 2 * t);
        const keys = [
          v(0.055, 0.15, -0.19),
          v(0.2, 0.08, 0.2),
          v(0.2, 0.045, -0.65),
          v(0.16, 0.29, -0.49),
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
      if(s.fastplant&&i===rear){
        const plant=s.fastplant;
        const target=this.rider.worldToLocal(plant.foot.clone().add(v(0,.045,0)));
        const contact=plant.launched?Math.max(0,1-(plant.time-TUNE.fastplantContactTime)/.12):Math.min(1,plant.time/.045);
        foot.lerp(target,contact);
      }
      this.shoes[i].quaternion.identity();
      if(!s.walking&&!s.sitting&&!whip&&push<0&&!s.fastplant&&!pose){
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
        this.shoes[i].position.copy(foot);
      }
      // Imported feet are anchored at the ankle, while the old targets located
      // the shoe centre. Apply the measured sole offset before solving the leg.
      foot.add(v(0,this.human?.ankleOffsets[i]??0,0).applyQuaternion(this.shoes[i].quaternion));
      this.shoes[i].position.copy(foot);
      if(!s.sitting){const hip=v(sign*.095,-.015,0).applyEuler(this.hips.rotation).add(this.hips.position),delta=foot.clone().sub(hip),length=delta.length(),direction=delta.clone().normalize();const bendDirection=v(sign*.07,0,1);const pole=bendDirection.addScaledVector(direction,-bendDirection.dot(direction)).normalize();knee.copy(hip).lerp(foot,.5).addScaledVector(pole,Math.sqrt(Math.max(.0001,.415*.415-Math.min(.413,length/2)**2)));}
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
      if(s.emote && s.walking) {
        const t=s.emote.time,fade=Math.min(1,t*6,(s.emote.duration-t)*6), id=s.emote.id;
        const target=hand.clone();
        if(id==="wave"&&i===0)target.set(-.38+Math.sin(t*12)*.08,1.65,.03);
        if(id==="point"&&i===0)target.set(-.16,1.28,.59);
        if(id==="clap")target.set(sign*(.035+Math.abs(Math.sin(t*10))*.13),1.23,.34);
        if(id==="celebrate")target.set(sign*.39,1.74+Math.sin(t*8)*.04,0);
        if(id==="facepalm"&&i===0)target.copy(this.head.position).add(v(-.02,.045,.13));
        if(id==="laugh")target.set(sign*.11,.98,.14);
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
      const grabbingHand=(pose==='Deck Grab'||pose==='Superman')&&i===(s.tricks.stance==='regular'?1:0);
      // Walking or running, the hand on the scooter's side keeps hold of its bar.
      const walkingGrip=s.walking&&!s.sitting&&!s.emote&&!s.heldItem&&sign>0&&this.walkOffset>.3;
      const holdingGrip=walkingGrip||!s.walking&&!s.sitting&&!s.emote&&(!pose||(pose==='Deck Grab'||pose==='Superman')&&!grabbingHand)&&(s.tricks.fingerTime===0||sign!==s.tricks.fingerHand)&&Math.abs(s.tricks.bars.velocity)<1;
      const gripRotation=new THREE.Quaternion();
      if(holdingGrip){
        this.assembly.gripSockets[i].getWorldQuaternion(gripRotation);
        const riderRotation=this.rider.getWorldQuaternion(new THREE.Quaternion()).invert();gripRotation.premultiply(riderRotation);
        hand.copy(this.rider.worldToLocal(this.assembly.gripSockets[i].getWorldPosition(new THREE.Vector3()))).add(v(0,(this.hands[i].userData.gripRadius??.0165)+GRIP_PALM_OFFSET,-(this.hands[i].userData.palmLength??.082)).applyQuaternion(gripRotation));
      }
      const carryingContact=this.carry>.001&&!s.emote&&!s.heldItem;
      if(carryingContact){
        const relative=this.rider.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.scooter.getWorldQuaternion(new THREE.Quaternion()));
        // Align the palm's grip axis with the upright stem or deck edge.
        const rotation=relative.clone().multiply(i===0?new THREE.Quaternion().setFromUnitVectors(v(1,0,0),v(0,.63,-.03).normalize()):new THREE.Quaternion());
        gripRotation.copy(this.hands[i].quaternion).slerp(rotation,this.carry);
        hand.add(v(0,i===0?.030:.038,-(this.hands[i].userData.palmLength??.082)).applyQuaternion(rotation).multiplyScalar(this.carry));
      }
      if(grabbingHand){
        const deckTarget=this.rider.worldToLocal(this.assembly.deckSocket.getWorldPosition(new THREE.Vector3()));
        deckTarget.x=sign*Math.abs(deckTarget.x);
        const deckRotation=this.assembly.deckSocket.getWorldQuaternion(new THREE.Quaternion());deckRotation.premultiply(this.rider.getWorldQuaternion(new THREE.Quaternion()).invert());deckRotation.multiply(new THREE.Quaternion().setFromAxisAngle(v(0,1,0),-sign*Math.PI/2));
        gripRotation.copy(deckRotation);
        deckTarget.sub(v(0,-.035,this.hands[i].userData.palmLength??.082).applyQuaternion(deckRotation));
        const aroundThigh=deckTarget.clone().add(v(sign*.22,.08,.10));
        hand.copy(aroundThigh.lerp(deckTarget,THREE.MathUtils.smoothstep(blend,.55,1)));
      }
      const fingerContact=s.tricks.fingerTime>0&&sign===s.tricks.fingerHand;
      if(s.walking&&s.heldItem&&i===0&&!usingItem)hand.set(-.22,.95,.20);
      if(fingerContact){const local=this.assembly.deckSocket.position.clone();local.x*=sign;const deckTarget=this.rider.worldToLocal(this.deckPivot.localToWorld(local));const sidePoint=v(sign*.38,Math.max(.55,deckTarget.y+.15),.30);const contact=deckTarget.x*sign>=-.02&&s.tricks.fingerTime>.20;const target=contact?sidePoint.lerp(deckTarget,THREE.MathUtils.smoothstep(fingerReach,.35,.7)):sidePoint;hand.lerp(target,fingerReach);}
      if(holdingGrip||grabbingHand||fingerContact||this.carry>.001){
        const delta=hand.clone().sub(shoulder);const reach=delta.length();
        if(reach>.68)hand.copy(shoulder).addScaledVector(delta,.68/reach);
        const bend=Math.sqrt(Math.max(.0004,.26*.26-Math.min(.25,reach/2)**2));
        elbow.copy(shoulder).lerp(hand,.5).addScaledVector((fingerContact||grabbingHand?v(sign*.8,-.3,.7):v(sign*.34,-.85,-.12)).normalize(),bend);
        poseRod(this.upperArms[i],shoulder,elbow);
      }
      poseRod(this.forearms[i], elbow, hand);
      this.hands[i].userData.openHand=holdingGrip||fingerContact||grabbingHand||this.carry>.5?0:s.emote?1:s.walking?.65:.7;
      this.hands[i].position.copy(hand);
      this.hands[i].quaternion.setFromUnitVectors(
        v(0, 1, 0),
        elbow.clone().sub(hand).normalize(),
      );
      if(holdingGrip||grabbingHand||carryingContact)this.hands[i].quaternion.copy(gripRotation);
      if(s.walking&&s.heldItem&&i===0){const t=s.emote?.time??0,sip=s.emote?.id==='drink'?THREE.MathUtils.smoothstep(t,.48,1)*(1-THREE.MathUtils.smoothstep(t,1.75,2.35)):0;this.hands[i].quaternion.setFromEuler(new THREE.Euler(-.9*sip,0,Math.PI/2));this.hands[i].userData.openHand=0;}
    }
    this.garmentSkins.forEach(g=>g.update());
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
    this.human?.update(s.elapsed);
    this.backpack.position.copy(this.torso.position);this.backpack.quaternion.copy(this.torso.quaternion);
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
  }
  private crashPose(s:Simulation){
    const crash=s.crash!;this.root.position.set(0,0,0);this.root.rotation.set(0,0,0);
    this.rider.quaternion.copy(crash.rider.rotation());this.rider.position.copy(crash.rider.translation()).sub(v(0,.85,0).applyQuaternion(this.rider.quaternion));
    this.scooter.position.copy(crash.scooter.translation());this.scooter.quaternion.copy(crash.scooter.rotation());this.deckPivot.rotation.set(0,0,0);this.barPivot.rotation.set(0,0,0);
    this.torso.position.set(0,1.1,0);this.torso.rotation.set(.05,0,0);this.hips.position.set(0,.86,0);this.hips.rotation.set(0,0,0);this.head.position.set(0,1.46,.015);
    const look=crash.rest>2&&crash.rest<4?Math.sin((crash.rest-2)*Math.PI)*.2:0;this.head.rotation.set(0,look,0);poseRod(this.neck,v(0,1.32,0),v(0,1.38,.015));
    const brace=Math.max(0,1-crash.age/.75);
    for(let i=0;i<2;i++){const sign=i?1:-1,foot=v(sign*.13,.12,i?.12:-.08),knee=v(sign*.13,.48,.14+brace*.16),hip=v(sign*.095,.85,0),shoulder=v(sign*.19,1.27,0),elbow=v(sign*(.25+brace*.06),1.05,.12+brace*.17),hand=v(sign*.18,.98+brace*.12,.16+brace*.32);poseRod(this.thighs[i],hip,knee);poseRod(this.shins[i],knee,foot);this.shoes[i].position.copy(foot);this.shoes[i].quaternion.identity();poseRod(this.upperArms[i],shoulder,elbow);poseRod(this.forearms[i],elbow,hand);this.hands[i].position.copy(hand);this.hands[i].quaternion.identity();this.hands[i].userData.openHand=.6;}
    this.backpack.position.copy(this.torso.position);this.backpack.quaternion.copy(this.torso.quaternion);
    this.human?.update(s.elapsed);this.root.updateMatrixWorld(true);
    this.restingPose={hip:this.hips.getWorldPosition(new THREE.Vector3()),rotation:this.rider.getWorldQuaternion(new THREE.Quaternion()),scooter:this.scooter.getWorldPosition(new THREE.Vector3()),scooterRotation:this.scooter.getWorldQuaternion(new THREE.Quaternion()),parts:this.poseParts().map(p=>({position:p.position.clone(),rotation:p.quaternion.clone(),scale:p.scale.clone()}))};
  }
}
