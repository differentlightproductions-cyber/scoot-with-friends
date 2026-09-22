import { clamp, TUNE } from "../core/config";
import type { InputFrame } from "./input";

// Physical A/X names remain stable for menus and walking; riding resolves stance here.
export type ControlStyle = "pro" | "arcade";
export function ridingButtons(
  stance: "regular" | "goofy",
  style: ControlStyle = "pro",
) {
  if (style === "arcade")
    return {
      push: "pushDeck",
      whip: "brakeBars",
      pushLabel: "X",
      whipLabel: "B",
    } as const;
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
  private upwardWindow = 0;
  popped = false;
  step(
    dt: number,
    input: InputFrame,
    supported: boolean,
    sweeping = false,
    transitionRelease = false,
  ) {
    this.popped = false;
    // LB owns manual entry/balance. A deliberate unmodified down hold loads a hop.
    const down =
      input.ry > TUNE.preloadThreshold &&
      Math.abs(input.rx) < 0.5 &&
      input.held.leftModifier < 0.5;
    if (down && supported) {
      this.upwardWindow = 0;
      this.dwell += dt;
      this.amount = clamp(
        this.amount + (dt / TUNE.preloadTime) * input.ry,
        0,
        1,
      );
    } else if (sweeping && supported) {
      // A circular RS gesture owns the stick until it has finished. Do not
      // mistake its first sideways movement for a hop release.
      return null;
    } else if (
      (input.ry <= -0.82 || (transitionRelease && input.ry < 0.55)) &&
      this.dwell >= 0.06 &&
      this.amount > 0
    ) {
      // A bunny hop completes when RS travels back up toward the rider.
      // A quarter-pipe is the one exception: once the rider is already
      // unweighting over a valid lip, a normal release commits that pop.
      this.popped = supported;
      const charge = this.amount;
      this.amount = this.dwell = 0;
      this.upwardWindow = 0;
      return this.popped ? charge : null;
    } else if (!supported) this.reset();
    else if (this.amount > 0) {
      // A real upward flick crosses neutral before it reaches the pop zone.
      // Preserve the charge for that short gesture window; Simulation clears
      // its visual crouch immediately when the stick is no longer held down.
      this.upwardWindow += dt;
      if (this.upwardWindow > 0.24) this.reset();
    } else this.dwell = 0;
    return null;
  }
  reset() {
    this.amount = this.dwell = 0;
    this.upwardWindow = 0;
    this.popped = false;
  }
}
