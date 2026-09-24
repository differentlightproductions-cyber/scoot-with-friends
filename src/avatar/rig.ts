import * as THREE from 'three';
import type { BodyType } from './config';

/**
 * The one avatar skeleton (docs/AVATAR-DESIGN.md §2-5). Every rider, body type
 * and outfit shares these lengths, and the pose drivers in scooter/model.ts and
 * longboard/pose.ts are solved against them: the mechanics follow the
 * character. Rider metres; the rider faces +z, +y up.
 *
 * Driver frames: the torso driver is the chest bone, the hips driver the pelvis
 * bone, the head driver the head centre. Limbs are placed by two-bone IK with
 * the fixed segment lengths below (never stretched).
 */
export const RIG = {
  /** Pelvis driver below the chest along the spine, plus a fixed drop. */
  pelvisFromChest: 0.21,
  pelvisDrop: 0.055,
  /** Hip joint in the pelvis frame (x per side comes from the body type). */
  hipJointY: -0.015,
  /** Shoulder joint in the chest frame (x per side comes from the body type). */
  shoulderY: 0.19,
  shoulderZ: 0,
  /** Base of the neck in the chest frame. */
  neckBase: 0.215,
  /** Head centre in the chest frame. */
  head: new THREE.Vector3(0, 0.445, 0.01),
  upperArm: 0.245,
  forearm: 0.215,
  thigh: 0.38,
  shin: 0.38,
  /** Ankle above the sole. */
  ankle: 0.075,
  /** The shoe driver sits this far above the sole (the deck and walk targets use it). */
  shoeDriver: 0.045,
  /** Wrist to the centre of a gripped bar, along the fingers. */
  palm: 0.055,
  /** Head size (standard head, before the head-size setting). */
  headWidth: 0.365,
  headHeight: 0.4,
  headDepth: 0.365,
  /** Invisible over-length (1.5 %) that closes a millimetre reach gap instead of leaving it. */
  limbSlack: 0.015,
} as const;

export const ARM_REACH = RIG.upperArm + RIG.forearm;
export const LEG_REACH = RIG.thigh + RIG.shin;
/** Ankle above the legacy shoe driver point. */
export const ANKLE_OFFSET = RIG.ankle - RIG.shoeDriver;

export interface BodyShape {
  /** Chest width and depth at the ribs. */
  torsoWidth: number;
  torsoDepth: number;
  /** Pelvis width. */
  hipWidth: number;
  /** Multiplies every limb radius. */
  limb: number;
  /** Shoulder and hip joint distance from the centre line. */
  shoulderX: number;
  hipX: number;
  /** Belly forward of the chest line (stocky rounds out). */
  belly: number;
}

/** Same skeleton, different girth: joint heights, lengths and hand targets never change. */
export const BODY_SHAPES: Record<BodyType, BodyShape> = {
  slim: { torsoWidth: 0.3, torsoDepth: 0.185, hipWidth: 0.26, limb: 0.86, shoulderX: 0.155, hipX: 0.082, belly: 0 },
  standard: { torsoWidth: 0.345, torsoDepth: 0.21, hipWidth: 0.3, limb: 1, shoulderX: 0.165, hipX: 0.09, belly: 0.01 },
  stocky: { torsoWidth: 0.4, torsoDepth: 0.26, hipWidth: 0.35, limb: 1.2, shoulderX: 0.18, hipX: 0.1, belly: 0.035 },
};

/** Limb radii at the standard body (top of segment, bottom of segment). */
export const LIMB_RADII = {
  upperArm: [0.054, 0.047],
  forearm: [0.047, 0.041],
  thigh: [0.08, 0.066],
  shin: [0.062, 0.05],
} as const;

/**
 * Riding stance solved for this skeleton on the scooter (grips at y 1.01, the
 * deck's shoe targets at y 0.15): about 30 degree knees and 120 degree elbows at
 * rest, and at a full preload (crouch 0.6) the chest folds over the bars with
 * about 90 degree elbows and knees. Chest height, fore-aft and lean at rest,
 * then per unit of crouch.
 */
export const RIDE_STANCE = { height: 1.183, forward: -0.03, lean: 0.15, drop: 0.5, reach: -0.3, fold: 0.6 };
/** Walking and standing: chest height so the hips sit a slightly bent leg above the ankles. */
export const STAND = { height: 1.1, lean: 0.1 };

/** Where the shoulder joint sits in rider space for a chest driver. */
export function shoulderJoint(chest: THREE.Object3D, side: -1 | 1, shape: BodyShape, out = new THREE.Vector3()) {
  return out.set(side * shape.shoulderX, RIG.shoulderY, RIG.shoulderZ).applyQuaternion(chest.quaternion).add(chest.position);
}
/** Where the hip joint sits in rider space for a pelvis driver. */
export function hipJoint(pelvis: THREE.Object3D, side: -1 | 1, shape: BodyShape, out = new THREE.Vector3()) {
  return out.set(side * shape.hipX, RIG.hipJointY, 0).applyQuaternion(pelvis.quaternion).add(pelvis.position);
}
/** The pelvis driver's position for a chest driver. */
export function pelvisFromChest(chest: THREE.Object3D, out = new THREE.Vector3()) {
  return out.set(0, -RIG.pelvisFromChest, 0).applyQuaternion(chest.quaternion).add(chest.position).add(new THREE.Vector3(0, -RIG.pelvisDrop, 0));
}
/** The head driver's position for a chest driver. */
export function headFromChest(chest: THREE.Object3D, out = new THREE.Vector3()) {
  return out.copy(RIG.head).applyQuaternion(chest.quaternion).add(chest.position);
}

export type LimbSolve = { root: THREE.Vector3; mid: THREE.Vector3; end: THREE.Vector3; upperDir: THREE.Vector3; lowerDir: THREE.Vector3; axis: THREE.Vector3; short: number };
/**
 * Analytic two-bone IK (law of cosines) with fixed segment lengths: the elbow
 * or knee bends toward `pole`, never lengthens. `axis` is the hinge the joint
 * bends about; `short` reports how far the end fell short of the target.
 */
export function solveLimb(root: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number): LimbSolve {
  const to = target.clone().sub(root), length = to.length();
  const dir = length > 1e-6 ? to.divideScalar(length) : new THREE.Vector3(0, -1, 0);
  const stretch = THREE.MathUtils.clamp(length / (l1 + l2), 1, 1 + RIG.limbSlack), a = l1 * stretch, b = l2 * stretch;
  const dist = THREE.MathUtils.clamp(length, Math.abs(a - b) + 1e-4, a + b - 1e-5);
  const toPole = pole.clone().sub(root);
  toPole.addScaledVector(dir, -toPole.dot(dir));
  const axis = new THREE.Vector3().crossVectors(dir, toPole);
  if (axis.lengthSq() < 1e-10) axis.crossVectors(dir, Math.abs(dir.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1));
  axis.normalize();
  const cos = THREE.MathUtils.clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  // Rotating about dir x pole moves the middle joint toward the pole side.
  const upperDir = dir.clone().applyAxisAngle(axis, Math.acos(cos));
  const mid = root.clone().addScaledVector(upperDir, a), end = root.clone().addScaledVector(dir, dist);
  return { root: root.clone(), mid, end, upperDir, lowerDir: end.clone().sub(mid).normalize(), axis, short: Math.max(0, length - dist) };
}
