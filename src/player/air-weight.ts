import { TUNE, clamp, damp } from "../core/config";
import type { Vector3 } from "three";
// Bounded body counterweight, separate from the yaw channel and future flip torque.
export class AirWeightControl {
  shift = 0;
  pitchBias = 0;
  pitchVelocity = 0;
  driftSpent = 0;
  entryPitch = 0;
  entryYaw = 0;
  reset(pitch = 0, yaw = 0) {
    this.shift = 0;
    this.pitchBias = 0;
    this.pitchVelocity = 0;
    this.driftSpent = 0;
    this.entryPitch = pitch;
    this.entryYaw = yaw;
  }
  step(dt: number, stick: number, yaw: number, velocity: Vector3) {
    this.shift = damp(
      this.shift,
      -stick,
      Math.abs(stick) > 0.03
        ? TUNE.airWeightShiftResponse
        : TUNE.airWeightRecentering,
      dt,
    );
    const target = this.shift * TUNE.airPitchBiasMax;
    const speed = clamp(
      (target - this.pitchBias) * TUNE.airWeightShiftResponse,
      -TUNE.airPitchBiasSpeed,
      TUNE.airPitchBiasSpeed,
    );
    this.pitchVelocity += clamp(
      speed - this.pitchVelocity,
      -TUNE.airPitchBiasAcceleration * dt,
      TUNE.airPitchBiasAcceleration * dt,
    );
    this.pitchBias = clamp(
      this.pitchBias + this.pitchVelocity * dt,
      -TUNE.airPitchBiasMax,
      TUNE.airPitchBiasMax,
    );
    const delta =
      Math.sign(this.shift) *
      Math.min(
        Math.abs(this.shift) * TUNE.airTrajectoryInfluence * dt,
        Math.max(0, TUNE.airTrajectoryBudget - this.driftSpent),
      );
    this.driftSpent += Math.abs(delta);
    velocity.x += Math.sin(yaw) * delta;
    velocity.z += Math.cos(yaw) * delta;
  }
  basePitch(yaw: number, airTime: number) {
    return (
      this.entryPitch *
      Math.cos(yaw - this.entryYaw) *
      Math.exp(-airTime * TUNE.airEntryPitchDecay)
    );
  }
}
