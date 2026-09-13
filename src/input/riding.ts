import { clamp, TUNE } from "../core/config";
import type { InputFrame } from "./input";

// Physical A/X names remain stable for menus and walking; riding resolves stance here.
export function ridingButtons(stance: "regular" | "goofy") {
  return stance === "regular"
    ? ({
        push: "pushDeck",
        whip: "hop",
        pushLabel: "X",
        whipLabel: "A",
      } as const)
    : ({
        push: "hop",
        whip: "pushDeck",
        pushLabel: "A",
        whipLabel: "X",
      } as const);
}

export class StickPreload {
  amount = 0;
  dwell = 0;
  popped = false;
  step(dt: number, input: InputFrame, supported: boolean) {
    this.popped = false;
    // LB owns manual entry/balance. A deliberate unmodified down hold loads a hop.
    const down =
      input.ry > 0.55 &&
      Math.abs(input.rx) < 0.5 &&
      input.held.leftModifier < 0.5;
    if (down && supported) {
      this.dwell += dt;
      this.amount = clamp(
        this.amount + (dt / TUNE.preloadTime) * input.ry,
        0,
        1,
      );
    } else if (!down && this.dwell >= 0.06 && this.amount > 0) {
      this.popped = supported;
      const charge = this.amount;
      this.amount = this.dwell = 0;
      return this.popped ? charge : null;
    } else if (!supported || !down) this.amount = this.dwell = 0;
    return null;
  }
  reset() {
    this.amount = this.dwell = 0;
    this.popped = false;
  }
}
