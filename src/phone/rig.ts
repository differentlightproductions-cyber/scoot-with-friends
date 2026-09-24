import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { shoulderJoint, RIG } from '../avatar/rig';
import type { RiderModel } from '../scooter/model';

/**
 * The phone in the rider's hand, and the first-person close-up of it.
 *
 * Phone space: +x right, +y towards the top, +z out of the screen. It rests on
 * the open palm: the hand's fingers run up the phone and the screen faces
 * away from the palm (hand frame: x across, y back of the hand, z fingers).
 */
export const PHONE = { width: 0.078, height: 0.156, depth: 0.0105 };
/** Phone centre in the hand frame, and the turn that lays it on the palm. */
const IN_HAND = new THREE.Vector3(0, -0.0315, 0.094);
const HAND_TO_PHONE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const PHONE_TO_HAND = HAND_TO_PHONE.clone().invert();
/** Render layer of the first-person close-up (phone, hand and forearm). */
export const VIEWMODEL_LAYER = 5;
/** First person: where the phone sits in front of the eye (camera space, metres). */
const FP_OFFSET = new THREE.Vector3(0.05, -0.03, -0.27);
/** Third person: phone centre from the head centre, rider space (x toward the holding side). */
const TP_OFFSET = new THREE.Vector3(0.07, -0.19, 0.36);
/** Head pitch while reading (radians, down). */
export const READ_TILT = { third: 0.42, first: 0.26 };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (e0: number, e1: number, x: number) => THREE.MathUtils.smoothstep(x, e0, e1);

function stickerTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c6ff00'; g.beginPath(); g.roundRect(4, 4, 120, 56, 12); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#0b0c0d'; g.stroke();
  g.fillStyle = '#0b0c0d'; g.font = '34px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('SWF', 64, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PhoneRig {
  readonly model = new THREE.Group();
  readonly screen: THREE.Mesh;
  readonly viewCamera = new THREE.PerspectiveCamera(60, 1, 0.02, 4);
  private lightScan = 0;
  private layered = new Set<THREE.Object3D>();
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(screenTexture: THREE.Texture) {
    const { width: w, height: h, depth: d } = PHONE;
    // Candy-teal case with a clear-coat shine, black glass front, the live screen.
    const shell = new THREE.MeshPhysicalMaterial({ color: 0x19bcd6, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.18 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.08, metalness: 0.1 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.05, metalness: 0.6 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.18, metalness: 1 });
    const display = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
    const sticker = new THREE.MeshStandardMaterial({ map: stickerTexture(), roughness: 0.6, transparent: true });
    this.materials.push(shell, glass, lens, chrome, display, sticker);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.geometries.push(geometry);
      this.model.add(m);
      return m;
    };
    add(new RoundedBoxGeometry(w, h, d, 3, 0.009), shell);
    add(new RoundedBoxGeometry(w - 0.005, h - 0.005, 0.002, 2, 0.006), glass, 0, 0, d / 2 - 0.0006);
    this.screen = add(new THREE.PlaneGeometry(w - 0.012, (w - 0.012) * 2), display, 0, 0.001, d / 2 + 0.0006);
    this.screen.castShadow = false;
    // Camera bump, two lenses and a chrome ring, top left seen from the back.
    add(new RoundedBoxGeometry(0.024, 0.034, 0.003, 2, 0.006), glass, 0.019, 0.05, -d / 2 - 0.001);
    for (const y of [0.059, 0.042]) {
      add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.002, 20).rotateX(Math.PI / 2), lens, 0.019, y, -d / 2 - 0.0028);
      add(new THREE.TorusGeometry(0.0058, 0.0009, 6, 20), chrome, 0.019, y, -d / 2 - 0.0028);
    }
    // Side buttons and a sticker on the back.
    add(new RoundedBoxGeometry(0.002, 0.022, 0.004, 1, 0.0009), chrome, w / 2 + 0.0006, 0.03, 0);
    add(new RoundedBoxGeometry(0.002, 0.012, 0.004, 1, 0.0009), chrome, -w / 2 - 0.0006, 0.042, 0);
    const back = add(new THREE.PlaneGeometry(0.046, 0.023), sticker, -0.004, -0.03, -d / 2 - 0.0004);
    back.rotation.y = Math.PI;
    back.rotation.z = 0.18;
    back.castShadow = false;
    this.model.position.copy(IN_HAND);
    this.model.quaternion.copy(HAND_TO_PHONE);
    this.model.visible = false;
    this.viewCamera.layers.set(VIEWMODEL_LAYER);
  }

  /** Keeps the phone in the chosen hand of the current avatar (rebuilt when the rider changes). */
  attach(rider: RiderModel, hand: 0 | 1, raise: number) {
    // Out of the hand while pocketed, so rebuilding the rider never touches it.
    if (raise <= 0) { this.model.removeFromParent(); this.model.visible = false; return; }
    const parent = rider.avatar.hands[hand];
    if (this.model.parent !== parent) parent.add(this.model);
    this.model.visible = raise > 0.2;
  }

  /**
   * Arm and hand drivers for holding the phone up. `raise` 0..1: from the
   * current pose to the hip pocket, then up to reading distance. With a
   * camera (first person) the phone is placed in front of that eye; otherwise
   * in front of the face in rider space.
   */
  pose(rider: RiderModel, raise: number, hand: 0 | 1, eye: THREE.Camera | null) {
    if (raise <= 0) return;
    const sign = hand === 0 ? -1 : 1;
    const group = rider.rider;
    const target = V(), rotation = new THREE.Quaternion();
    if (eye) {
      eye.updateMatrixWorld();
      const at = FP_OFFSET.clone();
      at.x *= -sign;
      target.copy(group.worldToLocal(at.applyMatrix4(eye.matrixWorld)));
      // Facing the eye, the top tipped a little away, rolled slightly toward the hand.
      const look = eye.getWorldQuaternion(new THREE.Quaternion())
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, sign * 0.1, sign * 0.06)));
      rotation.copy(group.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(look));
    } else {
      target.copy(rider.head.position).add(V(sign * TP_OFFSET.x, TP_OFFSET.y, TP_OFFSET.z));
      const face = rider.head.position.clone().add(V(0, 0.03, 0.17));
      const normal = face.sub(target).normalize();
      const up = V(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
      const right = up.clone().cross(normal).normalize();
      rotation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal))
        .multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -sign * 0.1));
    }
    // Pocket: at the hip on the holding side, screen facing the leg.
    const pocket = V(sign * 0.21, 0.9, 0.05);
    const pocketRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, sign * Math.PI / 2, 0));
    const lift = smooth(0.25, 1, raise);
    const phoneAt = pocket.lerp(target, lift);
    const phoneRotation = pocketRotation.slerp(rotation, lift);
    const handRotation = phoneRotation.clone().multiply(PHONE_TO_HAND);
    const wrist = phoneAt.clone().sub(IN_HAND.clone().applyQuaternion(handRotation));
    const weight = smooth(0, 0.3, raise);
    const driver = rider.hands[hand];
    driver.position.lerp(wrist, weight);
    driver.quaternion.slerp(handRotation, weight);
    if (weight > 0.5) {
      driver.userData.freeWrist = false;
      driver.userData.barLift = 0;
      driver.userData.openHand = 1;
    }
    // Elbow hint: down and out from the shoulder.
    const shoulder = shoulderJoint(rider.torso, sign as -1 | 1, rider.avatar.shape);
    const toHand = driver.position.clone().sub(shoulder);
    const reach = Math.max(0.001, toHand.length()), dir = toHand.clone().divideScalar(reach);
    const pole = V(sign * 0.55, -0.8, -0.15);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const along = Math.min(reach, RIG.upperArm + RIG.forearm - 1e-4);
    const a = (RIG.upperArm ** 2 - RIG.forearm ** 2 + along ** 2) / (2 * along);
    const elbow = shoulder.clone().addScaledVector(dir, a).addScaledVector(pole, Math.sqrt(Math.max(0, RIG.upperArm ** 2 - a * a)));
    const rod = rider.upperArms[hand];
    const blendElbow = rod.position.clone().add(V(0, rod.scale.y / 2, 0).applyQuaternion(rod.quaternion)).lerp(elbow, weight);
    rod.position.copy(shoulder).add(blendElbow).multiplyScalar(0.5);
    rod.scale.y = shoulder.distanceTo(blendElbow);
    rod.quaternion.setFromUnitVectors(V(0, 1, 0), blendElbow.clone().sub(shoulder).normalize());
  }

  /** Puts the phone, hand and forearm on the close-up layer (first person) or back in the world. */
  layer(rider: RiderModel, hand: 0 | 1, closeUp: boolean) {
    const wanted = new Set<THREE.Object3D>();
    if (closeUp) {
      for (const root of [rider.avatar.forearms[hand], rider.avatar.hands[hand]]) root.traverse(o => { if ((o as THREE.Mesh).isMesh) wanted.add(o); });
    }
    for (const o of this.layered) if (!wanted.has(o)) { o.layers.set(0); this.layered.delete(o); }
    for (const o of wanted) if (!this.layered.has(o)) { o.layers.set(VIEWMODEL_LAYER); this.layered.add(o); }
    this.model.traverse(o => { if ((o as THREE.Mesh).isMesh) o.layers.set(closeUp ? VIEWMODEL_LAYER : 0); });
  }

  /**
   * First-person close-up: the same eye, a narrower lens, so the phone is
   * readable while the wide world view stays as it is. Drawn over the frame
   * after the world with only the depth cleared.
   */
  renderCloseUp(renderer: THREE.WebGLRenderer, scene: THREE.Scene, eye: THREE.PerspectiveCamera, dt: number) {
    this.lightScan -= dt;
    if (this.lightScan <= 0) {
      this.lightScan = 2;
      scene.traverse(o => { if ((o as THREE.Light).isLight) o.layers.enable(VIEWMODEL_LAYER); });
    }
    const cam = this.viewCamera;
    cam.position.copy(eye.position);
    cam.quaternion.copy(eye.quaternion);
    // Wide enough on a tall screen to keep the whole phone in view.
    const minHorizontal = THREE.MathUtils.degToRad(64);
    const vertical = Math.max(60, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minHorizontal / 2) / eye.aspect)));
    cam.fov = Math.min(100, vertical);
    cam.aspect = eye.aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const background = scene.background, autoClear = renderer.autoClear, shadows = renderer.shadowMap.autoUpdate;
    scene.background = null;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.clearDepth();
    renderer.render(scene, cam);
    scene.background = background;
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = shadows;
  }

  /** Screen pixel under a pointer (first person), or null. */
  screenPoint(ndc: THREE.Vector2) {
    const ray = new THREE.Raycaster();
    ray.layers.set(VIEWMODEL_LAYER);
    ray.setFromCamera(ndc, this.viewCamera);
    const hit = ray.intersectObject(this.screen, false)[0];
    return hit?.uv ? { u: hit.uv.x, v: 1 - hit.uv.y } : null;
  }

  dispose() {
    this.model.removeFromParent();
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => { (m as THREE.MeshStandardMaterial).map?.dispose?.(); m.dispose(); });
  }
}
