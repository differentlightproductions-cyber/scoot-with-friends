/** How long D-pad Down is held to take the phone out or put it away (seconds). */
export const PHONE_HOLD = 0.55;

/**
 * One button's hold gesture: fires once when held for `seconds`, then owns the
 * rest of that press until it is released, so a hold never repeats or leaks.
 */
export class HoldButton {
  held = 0;
  fired = false;
  constructor(public seconds = PHONE_HOLD) {}
  /** Feed the button every frame; true on the one frame the hold completes. */
  update(down: boolean, dt: number) {
    if (!down) { this.held = 0; this.fired = false; return false; }
    this.held += dt;
    if (!this.fired && this.held >= this.seconds) { this.fired = true; return true; }
    return false;
  }
  /** 0..1 toward the hold, for a fill ring; 0 once fired or released. */
  get progress() { return this.fired ? 0 : Math.min(1, this.held / this.seconds); }
}
