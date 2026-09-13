import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Simulation } from "../physics/simulation";
import { InputFrame } from "../input/input";
import { TUNE, clamp, damp, wrap } from "../core/config";
export class ChaseCamera {
  camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.08, 160);
  heading = 0;
  orbit = 0;
  elevation = 0.2;
  target = new THREE.Vector3();
  initialized = false;
  recenterTime = 0;
  reset() {
    this.initialized = false;
    this.orbit = 0;
    this.elevation = 0.2;
    this.recenterTime = 0;
  }
  update(s: Simulation, input: InputFrame, dt: number, alpha: number) {
    const p = s.previousPosition.clone().lerp(s.position, alpha);
    const velocityYaw = Math.atan2(s.velocity.x, s.velocity.z);
    if (!this.initialized)
      this.heading =
        s.speed > TUNE.stationaryCameraFollowThreshold ? velocityYaw : s.yaw;
    const follow = s.walking
      ? 0
      : clamp(
          (s.speed - TUNE.stationaryCameraFollowThreshold) /
            (TUNE.cameraFullFollowSpeed - TUNE.stationaryCameraFollowThreshold),
          0,
          1,
        );
    this.heading +=
      wrap(velocityYaw - this.heading) * (1 - Math.exp(-4.8 * follow * dt));
    const cameraMode = s.context === "camera";
    if (s.dropIn.phase) {
      this.heading += wrap(s.yaw - this.heading) * (1 - Math.exp(-2 * dt));
      this.elevation = damp(this.elevation, 0.3, 2, dt);
    }
    if (cameraMode) {
      this.orbit += input.rx * (s.walking ? -1 : 1) * 2.3 * dt;
      this.elevation = clamp(
        this.elevation + input.ry * (s.walking ? -1 : 1) * 0.7 * dt,
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
      (!s.walking && !input.rx && s.speed > 2)
    ) {
      this.orbit = damp(
        this.orbit,
        0,
        this.recenterTime > 0 || input.held.recenter > 0 ? 6 : 0.8,
        dt,
      );
      this.elevation = damp(this.elevation, 0.2, 4, dt);
    }
    const distance = 4.7 + Math.min(s.speed * 0.055, 0.7);
    const a = this.heading + this.orbit;
    const look = p
      .clone()
      .add(new THREE.Vector3(0, 0.9, 0))
      .addScaledVector(s.velocity.clone().setY(0), 0.11);
    const desired = p
      .clone()
      .add(
        new THREE.Vector3(
          -Math.sin(a) * distance,
          2.25 + this.elevation * 3,
          -Math.cos(a) * distance,
        ),
      );
    const rayDir = desired.clone().sub(look);
    const len = rayDir.length();
    rayDir.normalize();
    const hit = s.world.castRay(
      new RAPIER.Ray(look, rayDir),
      len,
      true,
      undefined,
      undefined,
      undefined,
      s.body,
    );
    if (hit)
      desired
        .copy(look)
        .addScaledVector(rayDir, Math.max(0.7, hit.timeOfImpact - 0.23));
    if (!this.initialized) {
      this.camera.position.copy(desired);
      this.target.copy(look);
      this.initialized = true;
    }
    this.camera.position.lerp(desired, 1 - Math.exp(-12 * dt));
    this.target.lerp(look, 1 - Math.exp(-15 * dt));
    this.camera.lookAt(this.target);
    this.camera.fov = damp(
      this.camera.fov,
      56 + Math.min(s.speed * 0.38, 5),
      3,
      dt,
    );
    this.camera.updateProjectionMatrix();
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
