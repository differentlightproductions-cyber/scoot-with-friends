import * as THREE from "three";
import { TUNE, clamp, damp } from "../core/config";
import type { Simulation } from "../physics/simulation";
import { poseRod, type RiderModel } from "../scooter/model";
import { deckTop } from "./assembly";
import { LONGBOARD_DIMENSIONS as D } from "../data/longboardParts";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (t: number) => t * t * (3 - 2 * t);
const Y = v(0, 1, 0);
const quat = (x: number, y: number, z: number, order: THREE.EulerOrder = "XYZ") => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, order));

// Carry holds, rider-local (the rider faces +z, their right side is -x).
// Walking: the board hangs down the right side, nose truck in the fist, grip
// toward the leg and the graphic facing out.
const TRUCK_HOLD = {
  rotation: new THREE.Quaternion().setFromAxisAngle(Y, -Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), -Math.PI / 2)),
  hand: v(-0.29, 0.9, 0.03),
};
/** The nose hanger in board space, where the knuckles wrap round. */
const TRUCK_GRIP = v(0, D.wheelDiameter / 2 + 0.015, D.wheelbase / 2);
// Standing still: on its edge under the right arm, grip against the ribs,
// long axis front to back, the hand cupping the lower rail ahead of the body.
const ARM_TUCK = { rotation: quat(0, 0, -Math.PI / 2), position: v(-0.3, 1.04, -0.02), hand: v(-0.29, 0.92, 0.2) };

/**
 * Sideways longboard stance, carry and push, written onto the same semantic
 * drivers the anatomical rider follows. There is no handlebar and no grip IK
 * here: hands are free for balance. Positions are rider-local; the rider faces
 * +z and their left side is +x.
 *
 * Pushing turns the rider to face down the board: front foot pointing forward
 * on the deck, the kicking foot reaching out to its own side and forward before
 * driving back. Between pushes, carving, tucking or sliding they settle back
 * into the sideways stance. Rolling backwards, a push switches the stance: the
 * other foot leads and the other foot kicks.
 */
export function poseLongboard(model: RiderModel, s: Simulation, dt: number) {
  const regular = s.tricks.stance === "regular";
  // Which way the board's nose lies along the rider's local x.
  const nose = regular ? 1 : -1;
  const board = s.board;
  // The end the rider is travelling toward: the nose, or the tail when riding switch.
  const lead = board.switchStance ? -1 : 1;
  const dir = nose * lead;
  const riding = !s.walking;
  const assembly = model.boardAssembly!;
  model.boardStance = damp(model.boardStance, riding ? 1 : 0, 10, dt);
  const stance = model.boardStance;

  // Push stance: facing down the board while kicking, easing back once the
  // pushes stop or the rider starts to carve, tuck, slide or brake.
  const pushingNow = riding && board.pushTimer > 0;
  const carving = Math.abs(board.lean) > 0.35 || board.tuck > 0.2 || board.slide > 0.1 || board.brake > 0.2;
  model.boardPushStance = damp(model.boardPushStance, pushingNow && !carving ? 1 : 0, pushingNow && !carving ? 9 : 3, dt);
  const ps = riding ? model.boardPushStance : 0;

  // ---- The board --------------------------------------------------------
  model.board.rotation.order = "XYZ";
  const moving = s.speed > 0.35;
  model.boardHold = damp(model.boardHold, riding || moving ? 0 : 1, 4, dt);
  if (riding) {
    // Pitch and the surface's side slope lay the whole board on the ground;
    // the carve lean rolls only the deck, so the trucks keep their wheels down.
    model.board.position.set(0, 0, 0);
    model.board.rotation.set(s.pitch, 0, board.surfaceRoll);
    assembly.setLean(s.roll - board.surfaceRoll, board.lean * 0.2 * (1 - board.slide));
    model.boardWheelAngle += (s.speed * dt) / 0.035;
  } else if (s.jumpOn) {
    // Pulled up under the feet for a jump-on.
    model.board.position.set(0, 0, 0);
    model.board.rotation.set(0, 0, 0);
    assembly.setLean(0, 0);
  } else {
    const truckPosition = TRUCK_HOLD.hand.clone().sub(TRUCK_GRIP.clone().applyQuaternion(TRUCK_HOLD.rotation));
    model.board.position.copy(truckPosition).lerp(ARM_TUCK.position, model.boardHold);
    model.board.quaternion.copy(TRUCK_HOLD.rotation).slerp(ARM_TUCK.rotation, model.boardHold);
    assembly.setLean(0, 0);
  }
  assembly.setRoll(model.boardWheelAngle);

  // ---- Whole-body frame -------------------------------------------------
  const sideways = -nose * Math.PI / 2;
  const downBoard = lead > 0 ? 0 : -nose * Math.PI;
  const facing = riding ? THREE.MathUtils.lerp(sideways, downBoard, ps) * stance : 0;
  model.rider.position.set(
    0,
    s.walking ? Math.abs(Math.sin(s.elapsed * (s.running ? 13 : 9))) * Math.min(s.speed, 1) * 0.025 : 0,
    0,
  );
  model.rider.quaternion.setFromEuler(
    new THREE.Euler(riding ? s.pitch * 0.5 : 0, 0, riding ? s.roll * 0.7 : 0, "XYZ"),
  ).multiply(new THREE.Quaternion().setFromAxisAngle(Y, facing));

  // Push phase 0..1 over the cadence; the kicking foot leaves, drives and returns.
  const pushing = pushingNow ? 1 - board.pushTimer / TUNE.boardPushCadence : -1;
  const pushEnvelope = pushing >= 0 ? Math.sin(Math.PI * pushing) : 0;
  const crouchTarget = riding
    ? 0.11 +
      board.tuck * 0.36 +
      board.slide * 0.22 +
      board.brake * 0.12 +
      s.compression * 0.12 +
      (s.landTimer > 0 ? s.landTimer * (0.35 + s.landingCompression) : 0) +
      (s.popTimer > 0 ? 0.08 : 0) +
      pushEnvelope * 0.1 * ps
    : 0;
  model.crouch = damp(model.crouch, crouchTarget, crouchTarget < model.crouch ? 5 : 14, dt);
  const c = model.crouch;

  // ---- Torso, hips and head ----------------------------------------------
  const twist = riding ? dir * (0.3 + board.tuck * 0.2 + pushEnvelope * 0.9) * (1 - ps) : 0;
  model.torso.position.set(0, 1.12 - c * 0.95, -0.03 + c * 0.14);
  model.torso.rotation.set(0.07 + c * 0.85 - board.slide * 0.25, twist, riding ? -board.lean * 0.12 : 0);
  model.hips.position.copy(v(0, -0.21, 0).applyEuler(model.torso.rotation).add(model.torso.position)).add(v(0, -0.055, 0));
  model.hips.rotation.set(model.torso.rotation.x * 0.5, twist * 0.4, model.torso.rotation.z);
  model.head.position.copy(v(0, 0.36, 0.01).applyEuler(model.torso.rotation).add(model.torso.position));
  // Look down the road: over the leading shoulder, against the torso's twist.
  model.head.rotation.set(riding ? -c * 0.5 : 0, riding ? (dir * 1.15 - twist) * (1 - ps) : 0, 0);
  model.helmet.position.copy(model.head.position).add(v(0, 0.06, 0));
  model.helmet.rotation.copy(model.head.rotation);
  poseRod(
    model.neck,
    v(0, 0.225, 0).applyEuler(model.torso.rotation).add(model.torso.position),
    model.head.position.clone().add(v(0, -0.09, 0)),
  );

  // ---- Legs ----------------------------------------------------------------
  model.root.updateMatrixWorld(true);
  const toRider = (local: THREE.Vector3) => model.rider.worldToLocal(model.board.localToWorld(local.clone()));
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? -1 : 1;
    const front = sign === dir;
    let foot: THREE.Vector3;
    let footYaw = 0;
    if (riding) {
      // Feet on the grip, in board space, then carried into rider space. In the
      // push stance the front foot moves up over the front truck, toes forward.
      const z = (front ? THREE.MathUtils.lerp(0.25, 0.3, ps) : -0.25) * lead;
      foot = toRider(v(0, deckTop(0, z) + 0.035, z));
      footYaw = front ? dir * (0.62 + pushEnvelope * 0.85) * (1 - ps) : -dir * 0.12 * (1 - ps);
      if (!front && pushing >= 0) {
        // Sideways stance kick (rider-local, facing across the board).
        const across = [foot.clone(), v(dir * 0.06, 0.05, 0.24), v(-dir * 0.62, 0.04, 0.2), v(-dir * 0.42, 0.32, 0.12), foot.clone()];
        // Push stance kick: out to the kicking foot's own side and forward,
        // plant, drive back past the tail, lift and return to the deck.
        const side = -dir * 0.24;
        const forward = [foot.clone(), v(side, 0.07, 0.3), v(side, 0.035, -0.5), v(side * 0.8, 0.26, -0.3), foot.clone()];
        const phase = pushing * 4,
          k = Math.min(3, Math.floor(phase));
        const a = across[k].clone().lerp(across[k + 1], ease(phase - k));
        const b = forward[k].clone().lerp(forward[k + 1], ease(phase - k));
        foot = a.lerp(b, ps);
        footYaw = dir * 0.9 * (1 - ps);
      } else if (!front && board.brake > 0.02) {
        // Foot brake: the rear sole drags on the road beside and behind.
        foot.lerp(v(-dir * 0.46, 0.04, 0.22), clamp(board.brake * 1.4, 0, 1));
        footYaw = dir * 1.1 * board.brake;
      }
    } else {
      const gait =
        Math.sin(s.elapsed * (s.running ? 13 : 9) + i * Math.PI) * Math.min(s.speed / TUNE.walkSpeed, 1);
      foot = v(sign * 0.12, 0.045 + Math.max(0, gait) * (s.running ? 0.24 : 0.13), -0.1 + gait * (s.running ? 0.43 : 0.28));
    }
    model.shoes[i].position.copy(foot);
    model.shoes[i].quaternion.setFromAxisAngle(Y, footYaw);
    const hip = v(sign * 0.095, -0.015, 0).applyEuler(model.hips.rotation).add(model.hips.position);
    const delta = foot.clone().sub(hip),
      length = delta.length(),
      direction = delta.clone().normalize();
    const bend = v(sign * 0.07 + (riding ? foot.x * 0.4 * (1 - ps) : 0), 0, 1);
    const pole = bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    const knee = hip
      .clone()
      .lerp(foot, 0.5)
      .addScaledVector(pole, Math.sqrt(Math.max(0.0001, 0.415 * 0.415 - Math.min(0.413, length / 2) ** 2)));
    model.knees[i].position.copy(knee);
    poseRod(model.thighs[i], hip, knee);
    poseRod(model.shins[i], knee, foot);
  }

  // ---- Arms ----------------------------------------------------------------
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? -1 : 1;
    const front = sign === dir;
    const shoulder = v(sign * 0.19, 0.17, 0).applyEuler(model.torso.rotation).add(model.torso.position);
    let hand: THREE.Vector3;
    let open = 0.75;
    let elbowOut = v(sign * 0.6, -0.35, -0.5);
    if (riding) {
      const relaxed = front
        ? v(dir * 0.34, 0.84 - c * 0.62, 0.15 + c * 0.1)
        : v(-dir * 0.31, 0.8 - c * 0.6, 0.02);
      hand = relaxed;
      // Carving: the arms counter the lean a little.
      hand.x += board.lean * 0.06;
      if (board.tuck > 0.01) {
        const knee = model.knees[i].position.clone().add(v(0, 0.06, 0.08));
        const tucked = front ? knee : v(-dir * 0.04, 0.92 - c * 0.6, -0.22);
        hand = hand.lerp(tucked, board.tuck);
      }
      if (board.slide > 0.01)
        hand.lerp(v(sign * 0.58, 1.02 - c * 0.5, front ? 0.14 : -0.02), board.slide);
      if (pushEnvelope > 0) hand.lerp(front ? v(dir * 0.3, 1.0, 0.3) : v(-dir * 0.2, 0.9, -0.15), pushEnvelope * 0.6 * (1 - ps));
      // Facing down the board, the arms swing against the kicking leg.
      if (ps > 0) hand.lerp(v(sign * 0.26, 0.86 - c * 0.5, (front ? -0.12 : 0.22) * (pushEnvelope * 2 - 1)), ps * 0.8);
    } else if (sign < 0 && !s.jumpOn) {
      // Right hand: knuckles round the top truck while walking, cupping the
      // lower rail with the board tucked under the arm standing still.
      hand = TRUCK_HOLD.hand.clone().lerp(ARM_TUCK.hand, model.boardHold);
      elbowOut = v(-0.5, -0.1 + model.boardHold * 0.5, -0.4);
      open = 0;
    } else {
      hand = v(sign * 0.23, 0.8, -0.03 + Math.sin(s.elapsed * 9) * 0.12 * Math.min(1, s.speed / TUNE.walkSpeed));
    }
    const reach = Math.min(0.66, shoulder.distanceTo(hand));
    hand = shoulder.clone().addScaledVector(hand.clone().sub(shoulder).normalize(), reach);
    const bend = Math.sqrt(Math.max(0.0004, 0.34 * 0.34 - Math.min(0.33, reach / 2) ** 2));
    const elbow = shoulder
      .clone()
      .lerp(hand, 0.5)
      .addScaledVector(elbowOut.normalize(), bend);
    poseRod(model.upperArms[i], shoulder, elbow);
    poseRod(model.forearms[i], elbow, hand);
    model.hands[i].position.copy(hand);
    model.hands[i].quaternion.setFromUnitVectors(Y, elbow.clone().sub(hand).normalize());
    model.hands[i].userData.openHand = open;
  }
  model.finishPose(s.elapsed);
}
