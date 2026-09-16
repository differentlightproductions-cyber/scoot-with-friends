import { TUNE, clamp } from "../core/config";
export class ManualBalance {
  active = false;
  nose = false;
  balance = 0;
  velocity = 0;
  duration = 0;
  // What the player is currently asking for, normalised to [-1, 1] with 0 at the
  // gentle-band hold position. The HUD shows this as the commanded notch beside
  // the real balance indicator; it is never used to draw the balance itself.
  command = 0;
  enter(nose: boolean) {
    this.active = true;
    this.nose = nose;
    this.balance = 0.06;
    this.velocity = 0;
    this.duration = 0;
    this.command = 0;
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
    // Signed request: zero at the gentle-band hold position, positive toward the
    // loop side. Nose manual mirrors it, which is the only sign inversion here.
    const request = input * direction - TUNE.manualNeutralHold;
    this.command = clamp(request / (1 - TUNE.manualNeutralHold), -1, 1);
    // Entry is forgiving for a moment: the destabilising pendulum term eases in
    // rather than reacting to the movement that started the manual. It decays,
    // so holding one is still a balance task and never a locked pose.
    const settled = 1 - Math.exp(-TUNE.manualEntryBlend * this.duration);
    this.velocity +=
      (this.balance * TUNE.manualStability * settled +
        request * TUNE.manualSensitivity -
        speedChange * 0.028 * direction) *
      dt;
    if(Math.abs(input)<.12)this.velocity -= 2.2*dt;
    this.velocity *= Math.exp(-0.7 * dt);
    // The stick also gets a little direct rate authority over the balance. This
    // is what makes the indicator answer the stick in the same frame: without
    // it the player commands acceleration only and the meter always trails.
    this.balance += (this.velocity + request * TUNE.manualRateAuthority) * dt;
    if (this.balance < TUNE.manualDropLimit) {
      this.active = false;
      return "drop";
    }
    if (this.balance > TUNE.manualLoopLimit) {
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
    this.command = 0;
  }
}
