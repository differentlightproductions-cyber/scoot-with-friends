import * as THREE from 'three';
import { Avatar, type AvatarDetail } from './avatar';
import { sanitizeAvatar, type AvatarConfig } from './config';
import { BODY_SHAPES, RIG, STAND, headFromChest, hipJoint, pelvisFromChest, shoulderJoint } from './rig';

/**
 * Any avatar configuration standing relaxed on the ground (sole at y 0): park
 * visitors and the creator's thumbnails use it. `look` turns the head (radians).
 */
export function standingAvatar(config: Partial<AvatarConfig>, detail: AvatarDetail = 'high', look = 0) {
  const rider = new THREE.Group(), point = () => { const o = new THREE.Object3D(); rider.add(o); return o; };
  const rod = (a: THREE.Vector3, b: THREE.Vector3) => { const o = point(); o.position.copy(a).lerp(b, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); o.scale.y = a.distanceTo(b); return o; };
  const torso = point(), hips = point(), head = point();
  torso.position.set(0, STAND.height, -0.03);
  torso.rotation.x = 0.04;
  torso.updateMatrix();
  pelvisFromChest(torso, hips.position);
  headFromChest(torso, head.position);
  head.rotation.y = look;
  const drivers = { rider, torso, hips, head, upperArms: [] as THREE.Object3D[], thighs: [] as THREE.Object3D[], hands: [] as THREE.Object3D[], shoes: [] as THREE.Object3D[] };
  const shape = BODY_SHAPES[sanitizeAvatar(config).bodyType];
  for (const side of [-1, 1] as const) {
    const shoulder = shoulderJoint(torso, side, shape), wrist = shoulder.clone().add(new THREE.Vector3(side * 0.06, -0.43, 0.06));
    drivers.upperArms.push(rod(shoulder, shoulder.clone().add(new THREE.Vector3(side * 0.05, -RIG.upperArm, -0.03))));
    const hand = point();
    hand.position.copy(wrist);
    hand.userData.freeWrist = true;
    hand.userData.openHand = 0.7;
    drivers.hands.push(hand);
    const hip = hipJoint(hips, side, shape), ankle = new THREE.Vector3(side * 0.11, RIG.ankle, 0.02);
    drivers.thighs.push(rod(hip, hip.clone().lerp(ankle, 0.5).add(new THREE.Vector3(0, 0, 0.05))));
    const foot = point();
    foot.position.copy(ankle);
    foot.rotation.y = side * 0.12;
    drivers.shoes.push(foot);
  }
  const avatar = new Avatar(drivers, config, detail);
  avatar.update(0);
  rider.updateMatrixWorld(true);
  return { rider, avatar };
}
