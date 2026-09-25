import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Simulation } from "../physics/simulation";
import { InputFrame } from "../input/input";
import { TUNE, clamp, damp, wrap } from "../core/config";
import type { RiderModel } from "../scooter/model";
import { terrainHeight } from "../park/park";
import { WATER } from "../park/water";
import { FP_FOV_DEFAULT, FP_FOV_MAX, FP_FOV_MIN, TP_FOV_DEFAULT, thirdPersonVertical } from "./fov";

const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0), FORWARD = new THREE.Vector3(0, 0, 1);
/** Very wide horizontal settings on a tall screen would become a fisheye; cap the vertical angle. */
const FP_MAX_VERTICAL_FOV = 120;
const channelBusy = (c: { angle: number; target: number; velocity: number }) => Math.abs(c.target - c.angle) > 0.08 || Math.abs(c.velocity) > 1;
/** 1 while a scooter trick, rider-around-scooter trick or grab is under way in the air. */
function trickActivity(s: Simulation) {
  if (s.grounded || s.rideable === "longboard") return 0;
  const t = s.tricks;
  return channelBusy(t.deck) || channelBusy(t.bars) || channelBusy(t.bri) || channelBusy(t.kickless) || channelBusy(t.decade) || t.poseBlend > 0.2 ? 1 : 0;
}
export class ChaseCamera {
  // Far enough for the desert and the mountains; depth precision with this
  // near plane barely depends on the far plane.
  camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.08, 1600);
  heading = 0;
  orbit = 0;
  elevation = 0.2;
  target = new THREE.Vector3();
  initialized = false;
  recenterTime = 0;
  mountFlourish=true;
  private clearance = 99;
  private lift = 0;
  private wasWalking=false;
  mountTime=0;
  private mountStart=new THREE.Vector3();
  // ---- First person ----------------------------------------------------------
  view: "third" | "first" = "third";
  /** Horizontal degrees; converted to the camera's vertical FOV for the aspect. */
  firstPersonFov = FP_FOV_DEFAULT;
  /** Third-person horizontal field of view at 16:9 (see fov.ts). */
  thirdPersonFov = TP_FOV_DEFAULT;
  /** Looking down at the phone on foot (radians); riding, the head's own tilt does it. */
  phonePitch = 0;
  motion: "reduced" | "full" = "reduced";
  /**
   * Mounted first-person framing. tilt: heads-up pitch from the head's forward
   * (radians, negative looks down); eyeBack: how far behind the head the eye
   * sits; charge: extra downward tilt at a full jump charge; focus: how far
   * (0..1) a trick in progress turns the view towards the scooter.
   */
  fpTune = { tilt: -0.8, eyeBack: 0.04, charge: 0.14, focus: 0.45 };
  rider: RiderModel | null = null;
  /** True while this frame is drawn from the rider's eyes (false during a heavy crash). */
  firstPersonActive = false;
  private fpInit = false;
  private fpCrash = 0;
  private fpYaw = 0;
  private fpPitch = 0;
  /** A plunge under the surface after a dive (#62): how deep and how far in. */
  private fpPlunge: { depth: number; time: number } | null = null;
  /** Diving or jumping in: the first-person view goes under for a moment. */
  plunge(depth: number) { this.fpPlunge = depth > 0 ? { depth, time: 0 } : null; }
  private fpLookYaw = 0;
  private fpLookPitch = 0;
  private fpCharge = 0;
  private fpFocus = 0;
  private fpPosition = new THREE.Vector3();
  private fpQuaternion = new THREE.Quaternion();
  reset() {
    this.fpInit = false;this.fpCrash = 0;this.fpLookYaw = this.fpLookPitch = 0;this.fpCharge = this.fpFocus = 0;
    this.initialized = false;
    this.wasWalking=false;this.mountTime=0;
    this.orbit = 0;
    this.elevation = 0.2;
    this.recenterTime = 0;
  }
  update(s: Simulation, input: InputFrame, dt: number, alpha: number) {
    if (this.view === "first" && this.updateFirst(s, input, dt)) return;
    if (this.firstPersonActive) { this.firstPersonActive = false; this.initialized = false; this.camera.near = 0.08; }
    const p = s.previousPosition.clone().lerp(s.position, alpha);
    const velocityYaw = Math.atan2(s.velocity.x, s.velocity.z);
    if(this.initialized && this.wasWalking && !s.walking){
      const viewYaw=wrap(this.heading+this.orbit);
      this.heading=s.speed>TUNE.stationaryCameraFollowThreshold?velocityYaw:s.yaw;
      this.orbit=wrap(viewYaw-this.heading);
      this.mountStart.copy(this.camera.position);this.mountTime=this.mountFlourish&&!matchMedia('(prefers-reduced-motion: reduce)').matches?.32:0;
    }
    this.wasWalking=s.walking;
    this.heading=wrap(this.heading);this.orbit=wrap(this.orbit);
    if (!this.initialized)
      this.heading =
        s.speed > TUNE.stationaryCameraFollowThreshold ? velocityYaw : s.yaw;
    // In the air the view holds the heading it took off with. Flight is
    // ballistic, so off a jump that is still the travel direction; off a
    // quarter it keeps the wall (where the rider is coming back to) in view
    // instead of swinging round after sideways travel along the coping while
    // the body flips and spins inside the frame.
    const airborne = !s.grounded && !s.grind && !s.walking && !s.sitting && s.state !== "Bail" && !s.dropIn.phase;
    const follow = s.walking || airborne
      ? 0
      : clamp(
          (s.speed - TUNE.stationaryCameraFollowThreshold) /
            (TUNE.cameraFullFollowSpeed - TUNE.stationaryCameraFollowThreshold),
          0,
          1,
        );
    // Follow the travel direction at a bounded turn rate. When travel reverses on
    // a quarter re-entry the raw follow swung the view by up to 13 degrees per
    // frame; capped, the same turn takes a readable half second or so.
    this.heading += clamp(
      wrap(velocityYaw - this.heading) * (1 - Math.exp(-4.8 * follow * dt)),
      -TUNE.cameraMaxTurnRate * dt,
      TUNE.cameraMaxTurnRate * dt,
    );
    // On the scooter the right stick is reserved exclusively for preload,
    // manuals and trick gestures.  Only on-foot movement can orbit the camera.
    const cameraMode = s.walking || !!s.sitting;
    if (s.dropIn.phase) {
      this.heading += wrap(s.yaw - this.heading) * (1 - Math.exp(-2 * dt));
      this.elevation = damp(this.elevation, 0.3, 2, dt);
    }
    if (cameraMode) {
      const rx=input.rx;
      const ry=input.ry;
      this.orbit -= rx * 2.3 * dt;
      this.elevation = clamp(
        this.elevation - ry * 0.7 * dt,
        -0.05,
        0.7,
      );
    }
    if (input.pressed.recenter) {
      this.orbit = wrap(this.orbit);
      this.recenterTime = 1.0;
    }
    this.recenterTime = Math.max(0, this.recenterTime - dt);
    if (
      this.recenterTime > 0 ||
      input.held.recenter > 0.5 ||
      (!s.walking && s.speed > 2)
    ) {
      this.orbit = damp(
        this.orbit,
        0,
        this.recenterTime > 0 || input.held.recenter > 0 ? 6 : 0.8,
        dt,
      );
      this.elevation = damp(this.elevation, 0.2, 4, dt);
    }
    // Bombing a hill past pushing speed the view eases back and looks further
    // down the road, so the next corner is on screen in time. Park riding never
    // reaches this range, so its framing is unchanged.
    const bomb = clamp((s.speed - TUNE.pushMaxSpeed) / 14, 0, 1) * (s.walking ? 0 : 1);
    const distance = 4.7 + Math.min(s.speed * 0.055, 0.7) + bomb * 1.1;
    const a = this.heading + this.orbit;
    const look = p
      .clone()
      .add(new THREE.Vector3(0, 0.9 - bomb * 0.2, 0))
      .addScaledVector(s.velocity.clone().setY(0), 0.11 + bomb * 0.1);
    // Leading the rider up a steep ramp put the look point inside the ramp, so the
    // obstruction ray started blocked and the camera snapped in about a metre.
    look.y = Math.max(look.y, terrainHeight(look.x, look.z) + 0.6);
    const desired = p
      .clone()
      .add(
        new THREE.Vector3(
          -Math.sin(a) * distance,
          2.25 + this.elevation * 3,
          -Math.cos(a) * distance,
        ),
      );
    // Obstruction (thin rails and coping pipes never block the view). A ramp coming between camera and rider is first answered by
    // rising over its edge (eased), which keeps the framing; only if the view is
    // still blocked does the camera pull in, instantly, so it never sits inside
    // the ramp. Pulling in alone jolted the view about a metre in one frame each
    // time a rider started up a transition.
    const cast = (to: THREE.Vector3) => {
      const dir = to.clone().sub(look), length = dir.length();
      dir.normalize();
      return { dir, length, hit: s.world.castRay(new RAPIER.Ray(look, dir), length, true, undefined, undefined, undefined, s.body, (c) => !c.isSensor() && !s.park.railHandles.has(c.handle)) };
    };
    let liftTarget = 0;
    if (cast(desired.clone().setY(desired.y + this.lift)).hit || cast(desired).hit)
      for (const extra of [0, 0.6, 1.2, 1.8, 2.4]) if (!cast(desired.clone().setY(desired.y + extra)).hit) { liftTarget = extra; break; } else liftTarget = 2.4;
    this.lift = !this.initialized ? liftTarget : this.lift + (liftTarget - this.lift) * (1 - Math.exp(-(liftTarget > this.lift ? 6 : 1.5) * dt));
    desired.y += this.lift;
    const { dir: rayDir, length: len, hit } = cast(desired);
    const clear = hit ? Math.max(0.7, hit.timeOfImpact - 0.23) : len;
    this.clearance = !this.initialized || clear < this.clearance ? clear : this.clearance + (clear - this.clearance) * (1 - Math.exp(-3 * dt));
    if (this.clearance < len) desired.copy(look).addScaledVector(rayDir, this.clearance);
    if (!this.initialized) {
      this.camera.position.copy(desired);
      this.target.copy(look);
      this.initialized = true;
    }
    if(this.mountTime>0){
      this.mountTime=Math.max(0,this.mountTime-dt);const t=1-this.mountTime/.32;
      this.camera.position.copy(this.mountStart).lerp(desired,THREE.MathUtils.smoothstep(t,0,1));
    }else this.camera.position.lerp(desired, 1 - Math.exp(-12 * dt));
    this.target.lerp(look, 1 - Math.exp(-15 * dt));
    this.camera.lookAt(this.target);
    this.camera.fov = damp(
      this.camera.fov,
      thirdPersonVertical(this.thirdPersonFov) + Math.min(s.speed * 0.38, 5) + bomb * 5,
      3,
      dt,
    );
    this.camera.updateProjectionMatrix();
  }
  /**
   * The rider's eyes. Riding, the view takes the head's orientation, which the
   * body's spin and flip already carry exactly once; scooter-only tricks move the
   * scooter, never the head, so they pass through the view. On foot RS looks
   * around and walking follows the view. A violent crash cuts to the third-person
   * view after a short reaction and returns once the rider is back up.
   */
  private updateFirst(s: Simulation, input: InputFrame, dt: number) {
    const r = this.rider;
    if (!r) return false;
    if (s.state === "Bail") {
      this.fpCrash += dt;
      const violent = (s.crash ? new THREE.Vector3().copy(s.crash.rider.angvel()).length() > 1.2 : true) || this.fpCrash > 0.9;
      if (this.fpCrash > 0.3 && violent) return false;
    } else if (this.fpCrash > 0) { this.fpCrash = 0; this.fpInit = false; }
    const reduced = this.motion === "reduced" || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    r.root.updateMatrixWorld(true);
    const headPosition = r.head.getWorldPosition(new THREE.Vector3());
    const headQuaternion = r.head.getWorldQuaternion(new THREE.Quaternion());
    const onFoot = s.walking || !!s.sitting;
    // In a tucked flip the torso rounds up under the chin: the eye sits further out and looks further ahead.
    const flipping = s.bodyFlip.active ? THREE.MathUtils.smoothstep(Math.abs(s.bodyFlip.velocity), 1.5, 6) : 0;
    let look: THREE.Quaternion;
    if (onFoot) {
      if (!this.fpInit || this.firstPersonActive === false) this.fpYaw = s.yaw;
      // RS looks; the body walks where the player looks (via heading below).
      this.fpYaw -= input.rx * 2.3 * dt;
      this.fpPitch = clamp(this.fpPitch - input.ry * 1.5 * dt, -1.15, 0.9);
      look = new THREE.Quaternion().setFromAxisAngle(UP, this.fpYaw);
      // A flip, side flip or twist on foot (a jump off the dock, a gainer into
      // the lake) turns the view with the body, in the same order the rider
      // model turns (model.ts): the world goes over the top like a frontflip on the scooter (#62).
      const d = s.diveFlip;
      if (d) look.multiply(new THREE.Quaternion().setFromAxisAngle(SIDE, d.angle)).multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD, d.side ?? 0)).multiply(new THREE.Quaternion().setFromAxisAngle(UP, d.twist ?? 0));
      look.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI)).multiply(new THREE.Quaternion().setFromAxisAngle(SIDE, this.fpPitch - 0.12 - this.phonePitch));
    } else {
      // Mounted: RS belongs to tricks. The heads-up view looks forward along the
      // head, tipped down enough to see hands, bars and deck with the line ahead
      // across the top of the frame. Holding RS down to charge a jump dips it a
      // little further; a trick in progress turns it towards the scooter.
      this.fpPitch = damp(this.fpPitch, 0, 3, dt);
      this.fpYaw = s.yaw;
      this.fpCharge = damp(this.fpCharge, s.charge > 0 ? s.charge : 0, 8, dt);
      look = headQuaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI)).multiply(new THREE.Quaternion().setFromAxisAngle(SIDE, this.fpTune.tilt - this.fpCharge * this.fpTune.charge + flipping * 0.55));
    }
    // A small rearward eye offset keeps the grips in front of the lens even
    // when the preload pose brings the rider's chin over the crossbar; it stays
    // small so the front of the deck shows past the rider's hips.
    const eye = new THREE.Vector3(0, 0.01 + flipping * 0.04, (onFoot ? 0.1 : -this.fpTune.eyeBack) + flipping * 0.14).applyQuaternion(headQuaternion).add(headPosition);
    // In the water (#62): a swimmer's eyes ride just above the surface; a dive or a
    // jump in plunges the view under for a moment before it comes back up.
    if (this.fpPlunge) {
      this.fpPlunge.time += dt;
      const t = this.fpPlunge.time / 1.3;
      if (t >= 1 || !s.swim) this.fpPlunge = null;
      else eye.y = Math.min(eye.y, WATER.surface + 0.1) - this.fpPlunge.depth * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.8;
    } else if (s.swim && !s.swim.out) eye.y = Math.max(eye.y, WATER.surface + 0.08);
    // Trick focus: while a scooter trick or grab is under way the view turns
    // towards the scooter (quickly), then eases back to the heads-up view once
    // the trick is caught. Flips keep their own rotation, so focus fades out
    // while the body is turning over.
    const trick = onFoot ? 0 : trickActivity(s);
    this.fpFocus = damp(this.fpFocus, trick, trick > this.fpFocus ? 9 : 2.6, dt);
    const focusWeight = this.fpFocus * (1 - flipping) * this.fpTune.focus;
    if (focusWeight > 1e-3) {
      // Aim between the grips, the headtube and the deck: the whole scooter, whichever way it is turning.
      const a = r.assembly, focus = a.barPivot.getWorldPosition(new THREE.Vector3()).add(a.deckSocket.getWorldPosition(new THREE.Vector3()));
      for (const grip of a.gripSockets) focus.addScaledVector(grip.getWorldPosition(new THREE.Vector3()), 1 / a.gripSockets.length);
      focus.divideScalar(3);
      const toFocus = focus.sub(eye);
      if (toFocus.lengthSq() > 1e-4) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(look);
        const aimed = new THREE.Quaternion().setFromUnitVectors(forward, toFocus.normalize()).multiply(look);
        look.slerp(aimed, focusWeight);
      }
    }
    // Short collision check from the chest to the eye; the rider's own body is not a collider.
    const chest = r.torso.getWorldPosition(new THREE.Vector3());
    const toEye = eye.clone().sub(chest), length = toEye.length();
    if (length > 1e-3) {
      toEye.divideScalar(length);
      const hit = s.world.castRay(new RAPIER.Ray(chest, toEye), length + 0.1, true, undefined, undefined, undefined, s.body);
      if (hit && hit.timeOfImpact < length + 0.1) eye.copy(chest).addScaledVector(toEye, Math.max(0, hit.timeOfImpact - 0.1));
    }
    // The eye is filtered as an offset from the rider's root, never in world
    // space, so it cannot trail behind the head at speed.
    const local = r.root.worldToLocal(eye.clone());
    const rootQuaternion = r.root.getWorldQuaternion(new THREE.Quaternion());
    // Likewise the look is filtered relative to the body, so a real spin or flip
    // turns the view immediately and exactly once; only rig noise is smoothed.
    const localLook = rootQuaternion.clone().invert().multiply(look);
    if (!this.fpInit || !this.firstPersonActive) {
      this.fpPosition.copy(local); this.fpQuaternion.copy(localLook); this.fpInit = true;
    } else {
      // One light filter only: meaningful motion comes through, rig noise does not.
      const positionRate = reduced ? (onFoot ? 12 : 28) : 60, turnRate = reduced ? 22 : 45;
      this.fpPosition.lerp(local, 1 - Math.exp(-positionRate * dt));
      this.fpQuaternion.slerp(localLook, 1 - Math.exp(-turnRate * dt));
    }
    this.camera.position.copy(r.root.localToWorld(this.fpPosition.clone()));
    this.camera.quaternion.copy(rootQuaternion).multiply(this.fpQuaternion);
    this.camera.near = 0.05;
    const horizontal = THREE.MathUtils.degToRad(clamp(this.firstPersonFov, FP_FOV_MIN, FP_FOV_MAX));
    this.camera.fov = Math.min(FP_MAX_VERTICAL_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontal / 2) / this.camera.aspect)));
    this.camera.updateProjectionMatrix();
    // Walking moves relative to where the rider looks.
    this.heading = onFoot ? this.fpYaw : s.yaw; this.orbit = 0;
    this.firstPersonActive = true;
    return true;
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
