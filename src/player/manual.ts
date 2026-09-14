import { TUNE, clamp } from "../core/config";
export class ManualBalance {
  active = false;
  nose = false;
  balance = 0;
  velocity = 0;
  duration = 0;
  enter(nose: boolean) {
    this.active = true;
    this.nose = nose;
    this.balance = 0.06;
    this.velocity = 0;
    this.duration = 0;
  }
  step(
    dt: number,
    input: number,
    speedChange: number,
  ): "active" | "drop" | "loop" {
    this.duration += dt;
    // Unstable inverted pendulum. Nothing random; acceleration and player corrections
    // change its center of mass. Positive balance is beyond the supporting wheel.
    const direction = this.nose ? -1 : 1;
    this.velocity +=
      (this.balance * TUNE.manualStability +
        (input * direction - .32) * TUNE.manualSensitivity -
        speedChange * 0.028 * direction) *
      dt;
    if(Math.abs(input)<.12)this.velocity -= 2.2*dt;
    this.velocity *= Math.exp(-0.7 * dt);
    this.balance += this.velocity * dt;
    if (this.balance < -0.55) {
      this.active = false;
      return "drop";
    }
    if (this.balance > 0.85) {
      this.active = false;
      return "loop";
    }
    return "active";
  }
  get pitch() {
    return (this.nose ? 1 : -1) * (0.23 + clamp(this.balance, -0.5, 1) * 0.3);
  }
  reset() {
    this.active = false;
    this.balance = 0;
    this.velocity = 0;
    this.duration = 0;
  }
}
