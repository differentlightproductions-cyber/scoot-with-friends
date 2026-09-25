import * as THREE from 'three';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, sanitizeAvatar, swatchHex, type AvatarConfig } from './config';
import { faceTextures } from './face';
import { buildEyewear, buildFaceSolids, buildHair, buildHeadlamp, buildHeadwear, buildShoe, faceGeometry, handGeometry, headGeometry, limbGeometry, limbRadius, pelvisGeometry, ring, torsoGeometry } from './parts';
import { ANKLE_OFFSET, ARM_REACH, BODY_SHAPES, LEG_REACH, RIG, hipJoint, shoulderJoint, solveLimb, type BodyShape, type LimbSolve } from './rig';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * The semantic pose drivers the avatar follows (scooter/model.ts and
 * longboard/pose.ts write them). All in the rider group's space. Rods
 * (upper arms, forearms, thighs, shins) are posed by poseRod: midpoint,
 * scale.y = length, +y along the rod; only their far ends are read, as
 * elbow and knee hints.
 */
export interface AvatarDrivers {
  rider: THREE.Object3D;
  hips: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  upperArms: THREE.Object3D[];
  thighs: THREE.Object3D[];
  hands: THREE.Object3D[];
  shoes: THREE.Object3D[];
  hideHead?: boolean;
}

export type AvatarDetail = 'high' | 'low';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** Basis with +y along `along` and +z toward `front` (made perpendicular). */
function frame(along: THREE.Vector3, front: THREE.Vector3, out = new THREE.Quaternion()) {
  const y = along.clone().normalize(), z = front.clone().addScaledVector(y, -front.dot(y));
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
  if (z.lengthSq() < 1e-6) z.set(1, 0, 0);
  z.normalize();
  const x = y.clone().cross(z).normalize();
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
/** Far end of a poseRod driver. */
const rodEnd = (rod: THREE.Object3D) => UP.clone().applyQuaternion(rod.quaternion).multiplyScalar(rod.scale.y / 2).add(rod.position);

export class Avatar {
  readonly group = new THREE.Group();
  readonly config: AvatarConfig;
  readonly shape: BodyShape;
  /** Bones, each placed in rider space every frame; parts hang off them. */
  readonly pelvis = new THREE.Group();
  readonly chest = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  /** Carries the head-size scale; face, hair and headwear are its children. */
  readonly headRoot = new THREE.Group();
  readonly upperArms = [new THREE.Group(), new THREE.Group()];
  readonly forearms = [new THREE.Group(), new THREE.Group()];
  readonly hands = [new THREE.Group(), new THREE.Group()];
  readonly thighs = [new THREE.Group(), new THREE.Group()];
  readonly shins = [new THREE.Group(), new THREE.Group()];
  readonly feet = [new THREE.Group(), new THREE.Group()];
  /** Named attachment points (docs/AVATAR-DESIGN.md §3). */
  readonly anchors = { back: new THREE.Object3D(), eye: new THREE.Object3D(), crown: new THREE.Object3D() };
  /** Shoulder-to-wrist and hip-to-ankle reach per side (0 = rider -x). */
  readonly armReach = [ARM_REACH, ARM_REACH];
  readonly legReach = [LEG_REACH, LEG_REACH];
  /** Ankle above the legacy shoe driver point; pose drivers add it to foot targets. */
  readonly ankleOffsets = [ANKLE_OFFSET, ANKLE_OFFSET];
  /** Last frame's solved limbs (rider space), for pose drivers and tests. */
  readonly solved: { arms: LimbSolve[]; legs: LimbSolve[] } = { arms: [], legs: [] };
  /** A point along each hand's fingers at knuckle height (tools and tests measure grips with it). */
  readonly fingertips = [new THREE.Object3D(), new THREE.Object3D()];
  private gripRoll = [new THREE.Quaternion(), new THREE.Quaternion()];
  private handMeshes: { open: THREE.Mesh; closed: THREE.Mesh }[] = [];
  private firstPersonMeshes: THREE.Mesh[] = [];
  private ghosts = new Map<THREE.Material, THREE.Material>();
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private firstPerson = false;
  /** The night headlamp (#64): worn only while it is on; `housing` aims the beam. */
  readonly headlamp: { group: THREE.Group; lens: THREE.MeshStandardMaterial; housing: THREE.Group };
  private faceMaterial: THREE.MeshStandardMaterial;
  private faces: { open: THREE.Texture; closed: THREE.Texture };
  private nextBlink = 2 + Math.random() * 3;
  private blinkUntil = 0;
  private lastTime = 0;

  constructor(private drivers: AvatarDrivers, config: Partial<AvatarConfig>, readonly detail: AvatarDetail = 'high') {
    this.config = sanitizeAvatar(config);
    this.shape = BODY_SHAPES[this.config.bodyType];
    const c = this.config, shape = this.shape;
    this.group.name = 'Avatar rider';
    this.group.add(this.pelvis, this.chest, this.neck, this.head, ...this.upperArms, ...this.forearms, ...this.hands, ...this.thighs, ...this.shins, ...this.feet);
    this.head.add(this.headRoot);
    this.headRoot.scale.setScalar([0.92, 1, 1.1][c.headSize + 1] ?? 1);

    const cloth = (hex: number, roughness = 0.82) => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness: 0 });
    const skin = new THREE.MeshStandardMaterial({ color: swatchHex(SKIN_TONES, c.skinTone), roughness: 0.62 });
    const hair = new THREE.MeshStandardMaterial({ color: swatchHex(HAIR_COLORS, c.hairColor), roughness: 0.56, side: THREE.DoubleSide });
    const top = cloth(swatchHex(CLOTH_COLORS, c.topColor)), bottom = cloth(swatchHex(CLOTH_COLORS, c.bottomColor), 0.88);
    const topTrim = cloth(new THREE.Color(swatchHex(CLOTH_COLORS, c.topColor)).multiplyScalar(0.72).getHex());
    // Shoes: the chosen upper colour, a white rubber sole (grey-white under a white upper) and a
    // contrasting accent: a darker shade of the upper, or white over dark colours.
    const shoeHex = swatchHex(CLOTH_COLORS, c.shoeColor), shoeLight = new THREE.Color(shoeHex).getHSL({ h: 0, s: 0, l: 0 }).l > 0.72;
    const shoe = cloth(shoeHex, 0.72), sole = cloth(shoeLight ? 0xe4e1d8 : 0xf3f1ea, 0.62), dark = cloth(0x2a2826, 0.7);
    const shoeAccent = cloth(shoeLight ? 0x3b4250 : new THREE.Color(shoeHex).multiplyScalar(0.62).getHex(), 0.7);
    const laces = cloth(shoeLight ? 0x8d949c : 0xf4f2ec, 0.8);
    const headwear = c.headwear === 'helmet'
      ? new THREE.MeshPhysicalMaterial({ color: swatchHex(CLOTH_COLORS, c.headwearColor), roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2 })
      : cloth(swatchHex(CLOTH_COLORS, c.headwearColor), c.headwear === 'beanie' ? 0.95 : 0.8);
    const eyewear = new THREE.MeshStandardMaterial({ color: swatchHex(CLOTH_COLORS, c.eyewearColor), roughness: 0.35, metalness: 0.1 });
    const band = cloth(swatchHex(CLOTH_COLORS, c.wristbandColor), 0.95);
    this.faces = faceTextures(c);
    this.faceMaterial = new THREE.MeshStandardMaterial({ map: this.faces.open, transparent: true, depthWrite: false, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const d = this.detail;
    const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, firstPersonHidden = false) => {
      const m = new THREE.Mesh(geometry, material);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      if (firstPersonHidden) this.firstPersonMeshes.push(m);
      return m;
    };
    const hideTree = (root: THREE.Object3D) => root.traverse(o => { if (o instanceof THREE.Mesh) this.firstPersonMeshes.push(o); });

    // ---- Head, face and everything on it ----
    mesh(this.headRoot, headGeometry(c.headShape, d), skin, true);
    const face = mesh(this.headRoot, faceGeometry(c.headShape, d), this.faceMaterial, true);
    face.castShadow = false;
    face.renderOrder = 1;
    const solids = buildFaceSolids(c, skin, d), hairGroup = buildHair(c, hair, d), hat = buildHeadwear(c, headwear, dark, d), glasses = buildEyewear(c, eyewear, d);
    for (const part of [solids, hairGroup, hat, glasses]) { this.headRoot.add(part); hideTree(part); }
    this.headlamp = buildHeadlamp(c, d);
    this.headlamp.group.visible = false;
    this.headRoot.add(this.headlamp.group);
    hideTree(this.headlamp.group);
    this.headRoot.add(this.anchors.eye, this.anchors.crown);
    this.anchors.eye.position.set(0, 0.01, 0.06);
    this.anchors.crown.position.set(0, RIG.headHeight / 2, 0);
    mesh(this.neck, limbGeometry(0.048, 0.05, 0.1, d), skin, true);

    // ---- Torso and top ----
    const loose = c.top === 'oversized-tee' ? 1 : c.top === 'jacket' ? 0.35 : c.top === 'hoodie' || c.top === 'zip-hoodie' ? 0.2 : 0;
    mesh(this.chest, torsoGeometry(shape, loose, d), top, true);
    const frontZ = shape.torsoDepth / 2 * (1 + loose * 0.1);
    if (c.top === 'hoodie' || c.top === 'zip-hoodie') {
      const hood = mesh(this.chest, new THREE.TorusGeometry(0.085, 0.036, 10, 28), top, true);
      hood.position.set(0, 0.215, -0.04);
      hood.rotation.x = Math.PI / 2 - 0.5;
      hood.scale.set(1.15, 1, 1);
      for (const side of [-1, 1]) {
        const string = mesh(this.chest, limbGeometry(0.004, 0.004, 0.1, d), laces, true);
        string.position.set(side * 0.035, 0.2, frontZ - 0.005);
        string.rotation.x = Math.PI + 0.25;
      }
    }
    if (c.top === 'hoodie') {
      const pocket = mesh(this.chest, new RoundedBoxGeometry(shape.torsoWidth * 0.6, 0.085, 0.03, 2, 0.012), top, true);
      pocket.position.set(0, -0.16, frontZ - 0.004);
    }
    if (c.top === 'zip-hoodie' || c.top === 'jacket') {
      const zip = mesh(this.chest, new RoundedBoxGeometry(0.01, 0.42, 0.012, 1, 0.004), dark, true);
      zip.position.set(0, -0.04, frontZ + 0.002);
    }
    if (c.top === 'jacket') {
      mesh(this.chest, ring(0.078, 0.022, 0.205, d), topTrim, true);
      mesh(this.chest, ring(shape.torsoWidth * 0.44, 0.018, -0.285, d), topTrim, true).scale.set(1, 1, shape.torsoDepth / shape.torsoWidth);
    } else if (c.top !== 'hoodie' && c.top !== 'zip-hoodie') mesh(this.chest, ring(0.068, 0.011, 0.232, d), topTrim, true);
    this.chest.add(this.anchors.back);
    this.anchors.back.position.set(0, -0.01, -shape.torsoDepth / 2);

    // ---- Pelvis and bottoms ----
    mesh(this.pelvis, pelvisGeometry(shape, d), bottom, true);

    // ---- Arms ----
    const longSleeve = ['long-sleeve', 'hoodie', 'zip-hoodie', 'jacket'].includes(c.top);
    const [ua1, ua2] = limbRadius('upperArm', shape), [fa1, fa2] = limbRadius('forearm', shape);
    for (let i = 0; i < 2; i++) {
      const side = (i === 0 ? -1 : 1) as -1 | 1;
      if (longSleeve) {
        mesh(this.upperArms[i], limbGeometry(ua1 * 1.12, ua2 * 1.12, RIG.upperArm, d), top, true);
        mesh(this.forearms[i], limbGeometry(fa1 * 1.14, fa2 * 1.16, RIG.forearm, d), top);
        mesh(this.forearms[i], ring(fa2 * 1.16, c.top === 'long-sleeve' ? 0.007 : 0.012, RIG.forearm - 0.012, d), c.top === 'jacket' ? topTrim : top);
      } else {
        mesh(this.upperArms[i], limbGeometry(ua1, ua2, RIG.upperArm, d), skin, true);
        const wide = c.top === 'oversized-tee' ? 1.5 : 1.3;
        mesh(this.upperArms[i], limbGeometry(ua1 * wide, ua2 * wide, RIG.upperArm, d, 0, c.top === 'oversized-tee' ? 0.75 : 0.5, true, false), top, true);
        mesh(this.forearms[i], limbGeometry(fa1, fa2, RIG.forearm, d), skin);
      }
      if (c.wristband !== 'none' && side === 1) mesh(this.forearms[i], ring(fa2 * (longSleeve ? 1.2 : 1) + 0.006, 0.013, RIG.forearm - (longSleeve ? 0.045 : 0.03), d), band);
      const open = mesh(this.hands[i], handGeometry(side, false, d), skin), closed = mesh(this.hands[i], handGeometry(side, true, d), skin);
      this.handMeshes.push({ open, closed });
      this.hands[i].add(this.fingertips[i]);
      this.fingertips[i].position.set(0, 0, RIG.palm * 1.6);
      this.drivers.hands[i].userData.palmLength = RIG.palm;
    }

    // ---- Legs ----
    const [th1, th2] = limbRadius('thigh', shape), [sh1, sh2] = limbRadius('shin', shape);
    const legWidth = { 'loose-jeans': 1.28, 'straight-jeans': 1.12, cargo: 1.22, shorts: 1.3, 'skate-shorts': 1.38 }[c.bottom] ?? 1.15;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      if (c.bottom === 'shorts' || c.bottom === 'skate-shorts') {
        mesh(this.thighs[i], limbGeometry(th1, th2, RIG.thigh, d), skin);
        mesh(this.thighs[i], limbGeometry(th1 * legWidth, th2 * legWidth, RIG.thigh, d, 0, c.bottom === 'shorts' ? 0.82 : 1, true, c.bottom !== 'shorts'), bottom);
        mesh(this.shins[i], limbGeometry(sh1, sh2, RIG.shin, d), skin);
        if (c.bottom === 'skate-shorts') mesh(this.shins[i], limbGeometry(sh1 * 1.62, sh1 * 1.55, RIG.shin, d, 0, 0.22, true, false), bottom);
      } else {
        mesh(this.thighs[i], limbGeometry(th1 * legWidth, th2 * legWidth, RIG.thigh, d), bottom);
        const hem = c.bottom === 'loose-jeans' ? 1.62 : c.bottom === 'cargo' ? 1.3 : 1.18;
        mesh(this.shins[i], limbGeometry(sh1 * legWidth, sh2 * hem, RIG.shin, d, 0, 1.02, true, false), bottom);
        if (c.bottom === 'cargo') {
          const pocket = mesh(this.thighs[i], new RoundedBoxGeometry(0.03, 0.1, 0.085, 2, 0.01), bottom);
          pocket.position.set(side * (th2 * legWidth + 0.006), RIG.thigh * 0.55, 0);
        }
      }
      this.feet[i].add(buildShoe(c.shoes, shoe, sole, laces, d, shoeAccent));
    }
    this.drivers.rider.add(this.group);
    this.update(0);
  }

  /** Follows the drivers: bones take the driver frames, limbs are solved at fixed lengths. */
  update(time: number) {
    const d = this.drivers, shape = this.shape;
    this.pelvis.position.copy(d.hips.position);
    this.pelvis.quaternion.copy(d.hips.quaternion);
    this.chest.position.copy(d.torso.position);
    this.chest.quaternion.copy(d.torso.quaternion);
    this.head.position.copy(d.head.position);
    this.head.quaternion.copy(d.head.quaternion);
    const neckBase = V(0, RIG.neckBase, 0).applyQuaternion(d.torso.quaternion).add(d.torso.position);
    this.neck.position.copy(neckBase);
    this.neck.quaternion.setFromUnitVectors(UP, d.head.position.clone().sub(neckBase).normalize());
    const hipsForward = V(0, 0, 1).applyQuaternion(d.hips.quaternion);
    for (let i = 0; i < 2; i++) {
      const side = (i === 0 ? -1 : 1) as -1 | 1;
      // ---- Arm ----
      const shoulder = shoulderJoint(d.torso, side, shape);
      const pole = rodEnd(d.upperArms[i]).add(V(side * 0.06, -0.02, -0.02).applyQuaternion(d.torso.quaternion));
      const hold = d.hands[i], lift = hold.userData.barLift ?? 0;
      let r = solveLimb(shoulder, hold.position, pole, RIG.upperArm, RIG.forearm);
      this.gripRoll[i].copy(hold.quaternion);
      if (lift > 0) {
        // A hand on a round bar can roll around it: keep the grip centre and
        // roll the hand until the fingers continue the forearm, so the wrist
        // stays straight while the bars spin inside the fist.
        const offset = V(0, lift, -(hold.userData.palmLength ?? RIG.palm)), centre = hold.position.clone().sub(offset.clone().applyQuaternion(hold.quaternion));
        const bar = V(1, 0, 0).applyQuaternion(hold.quaternion);
        for (let pass = 0; pass < 2; pass++) {
          const fingers = r.lowerDir.clone().addScaledVector(bar, -r.lowerDir.dot(bar));
          if (fingers.lengthSq() < 0.04) break;
          fingers.normalize();
          const back = fingers.clone().cross(bar).normalize();
          this.gripRoll[i].setFromRotationMatrix(new THREE.Matrix4().makeBasis(bar, back, fingers));
          r = solveLimb(shoulder, centre.clone().add(offset.clone().applyQuaternion(this.gripRoll[i])), pole, RIG.upperArm, RIG.forearm);
        }
      }
      this.solved.arms[i] = r;
      this.upperArms[i].position.copy(r.root);
      frame(r.upperDir, r.upperDir.clone().cross(r.axis), this.upperArms[i].quaternion);
      this.forearms[i].position.copy(r.mid);
      frame(r.lowerDir, r.lowerDir.clone().cross(r.axis), this.forearms[i].quaternion);
      this.hands[i].position.copy(r.end);
      if (hold.userData.freeWrist) {
        // Nothing in the hand: the fingers continue the forearm, the back of the hand faces out.
        const fingers = r.lowerDir, back = V(side, 0, 0).applyQuaternion(d.torso.quaternion).addScaledVector(fingers, -V(side, 0, 0).applyQuaternion(d.torso.quaternion).dot(fingers));
        if (back.lengthSq() < 1e-4) back.set(0, 0, -1);
        back.normalize();
        this.hands[i].quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(back.clone().cross(fingers).normalize(), back, fingers));
      } else this.hands[i].quaternion.copy(this.gripRoll[i]);
      const closed = (hold.userData.openHand ?? 0) < 0.5;
      this.handMeshes[i].closed.visible = closed;
      this.handMeshes[i].open.visible = !closed;
      // ---- Leg ----
      const hip = hipJoint(d.hips, side, shape);
      const knee = rodEnd(d.thighs[i]).addScaledVector(hipsForward, 0.25).add(V(side * 0.03, 0, 0));
      const l = solveLimb(hip, d.shoes[i].position, knee, RIG.thigh, RIG.shin);
      this.solved.legs[i] = l;
      this.thighs[i].position.copy(l.root);
      frame(l.upperDir, l.upperDir.clone().cross(l.axis).negate(), this.thighs[i].quaternion);
      this.shins[i].position.copy(l.mid);
      frame(l.lowerDir, l.lowerDir.clone().cross(l.axis).negate(), this.shins[i].quaternion);
      this.feet[i].position.copy(l.end);
      this.feet[i].quaternion.copy(d.shoes[i].quaternion);
    }
    // Blink every few seconds. At a very low frame rate a blink would hold the
    // eyes shut for a whole frame, so it is skipped.
    const step = time - this.lastTime;
    this.lastTime = time;
    if (time > this.nextBlink) {
      this.blinkUntil = step > 0 && step < 0.09 ? time + 0.12 : 0;
      this.nextBlink = time + 2.2 + Math.random() * 3.5;
    }
    if (step > 0.09 || step < 0) this.blinkUntil = 0;
    const map = time < this.blinkUntil ? this.faces.closed : this.faces.open;
    if (this.faceMaterial.map !== map) this.faceMaterial.map = map;
    this.setFirstPerson(!!d.hideHead);
  }

  /**
   * A bone by a conventional humanoid name ("LeftArm", "RightForeArm",
   * "LeftHand", "LeftHandMiddle1", "RightUpLeg", "LeftLeg", "RightFoot",
   * "Hips", "Spine", "Neck", "Head"), for tools and tests. Left is the rider's
   * left, +x; each bone's origin is its root joint.
   */
  bone(name: string): THREE.Object3D | undefined {
    const side = name.startsWith('Left') ? 1 : name.startsWith('Right') ? 0 : -1, part = name.replace(/^(Left|Right)/, '');
    const limbs: Record<string, THREE.Object3D[]> = { Arm: this.upperArms, ForeArm: this.forearms, Hand: this.hands, HandMiddle1: this.fingertips, UpLeg: this.thighs, Leg: this.shins, Foot: this.feet };
    if (side >= 0) return limbs[part]?.[side];
    return ({ Hips: this.pelvis, Spine: this.chest, Spine1: this.chest, Spine2: this.chest, Neck: this.neck, Head: this.head } as Record<string, THREE.Object3D>)[name];
  }

  /** Puts the headlamp on (lens lit) or away. */
  setHeadlamp(on: boolean) {
    this.headlamp.group.visible = on;
    this.headlamp.lens.emissiveIntensity = on ? 3 : 0;
  }

  /** Hides the head, hair, neck, chest, pelvis and upper arms from the eye camera; shadows stay. */
  setFirstPerson(active: boolean) {
    if (active === this.firstPerson) return;
    this.firstPerson = active;
    for (const m of this.firstPersonMeshes) {
      if (active) {
        this.originals.set(m, m.material);
        const ghost = (material: THREE.Material) => {
          let g = this.ghosts.get(material);
          if (!g) { g = material.clone(); g.colorWrite = false; g.depthWrite = false; this.ghosts.set(material, g); }
          return g;
        };
        m.material = Array.isArray(m.material) ? m.material.map(ghost) : ghost(m.material);
      } else m.material = this.originals.get(m) ?? m.material;
    }
  }

  dispose() {
    this.setFirstPerson(false);
    this.group.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.group.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    this.ghosts.forEach(m => m.dispose());
    this.faces.open.dispose();
    this.faces.closed.dispose();
  }
}
