import { TUNE, clamp, wrap } from "../core/config";
export class FakieControl {
  mode: "Forward" | "Fakie" | "Reverting" = "Forward";
  private deliberate = 0;
  private target = 0;
  private angularSpeed = 0;
  private latched = false;
  reset() {
    this.mode = "Forward";
    this.deliberate = 0;
    this.angularSpeed = 0;
    this.latched = false;
  }
  step(
    dt: number,
    yaw: number,
    vx: number,
    vz: number,
    stick: number,
    enabled: boolean,
  ) {
    if (!enabled) {
      this.deliberate = 0;
      this.latched = false;
      return { yaw, reverting: false };
    }
    const speed = Math.hypot(vx, vz);
    if (this.latched) {
      const error = this.target - yaw;
      const desired =
        Math.sign(error) *
        Math.min(
          TUNE.fakieRevertSpeed,
          Math.sqrt(2 * TUNE.fakieRevertAcceleration * Math.abs(error)),
        );
      this.angularSpeed += clamp(
        desired - this.angularSpeed,
        -TUNE.fakieRevertAcceleration * dt,
        TUNE.fakieRevertAcceleration * dt,
      );
      const move = this.angularSpeed * dt;
      if (Math.abs(error) < 0.012 && Math.abs(this.angularSpeed) < 0.5) {
        yaw = this.target;
        this.latched = false;
        this.mode = "Forward";
        this.angularSpeed = 0;
      } else yaw += Math.abs(move) > Math.abs(error) ? error : move;
      return { yaw, reverting: true };
    }
    if (speed < TUNE.fakieMinSpeed) {
      this.deliberate = 0;
      return { yaw, reverting: false };
    }
    const alignment = (Math.sin(yaw) * vx + Math.cos(yaw) * vz) / speed;
    // Hysteresis is evaluated on grounded travel, never on airborne visual spins.
    if (alignment < -0.3) this.mode = "Fakie";
    else if (alignment > 0.3) this.mode = "Forward";
    this.deliberate =
      this.mode === "Fakie" && Math.abs(stick) >= TUNE.fakieRevertThreshold
        ? this.deliberate + dt
        : 0;
    if (this.deliberate >= TUNE.fakieRevertHold) {
      const direction = Math.sign(stick),
        travelYaw = Math.atan2(vx, vz);
      let delta = wrap(travelYaw - yaw);
      if (Math.sign(delta) !== direction) delta += direction * Math.PI * 2;
      this.target = yaw + delta;
      this.angularSpeed = 0;
      this.latched = true;
      this.mode = "Reverting";
      this.deliberate = 0;
    }
    return { yaw, reverting: this.latched };
  }
}
