import { clamp, TUNE } from "../core/config";
import type { InputFrame } from "./input";

// Physical A/X names remain stable for menus and walking; riding resolves the
// preset here, once, after device normalisation.
//
//   Preset (stance)      Push   Tailwhip   Barspin
//   Normal ("regular")   A      X          B        <- default
//   Goofy  ("goofy")     X      A          B
//   Arcade (any stance)  X      B          X at takeoff / in air; A = quick hop
//
// Saves from before controls version 2 used the opposite names; loadProfile
// migrates them once so nobody's buttons change under them.
export type ControlStyle = "pro" | "arcade";
export const CONTROLS_VERSION = 2;
export const presetName = (stance: "regular" | "goofy") => (stance === "regular" ? "Normal" : "Goofy");
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
        push: "hop",
        whip: "pushDeck",
        pushLabel: "A",
        whipLabel: "X",
      } as const)
    : ({
        push: "pushDeck",
        whip: "hop",
        pushLabel: "X",
        whipLabel: "A",
      } as const);
}

export class StickPreload {
  amount = 0;
  dwell = 0;
  private upwardWindow = 0;
  popped = false;
  // The scoop gesture has to leave the down position to be traced at all, so the
  // live amount is gone by the time the resolver accepts the trick. Latch what
  // was actually loaded and keep it briefly, so one continuous load -> gesture ->
  // takeoff sequence launches with the charge the player really built.
  private heldCharge = 0;
  private heldDwell = 0;
  private heldAge = 99;
  /** Charge available to a takeoff accepted right now, live or just-released. */
  get availableCharge() {
    return this.heldAge <= TUNE.briChargeHold
      ? Math.max(this.amount, this.heldCharge)
      : this.amount;
  }
  /** How long RS was actually held down for the charge above. */
  get availableDwell() {
    return this.heldAge <= TUNE.briChargeHold
      ? Math.max(this.dwell, this.heldDwell)
      : this.dwell;
  }
  /** Charge for a direct Bri/Inward takeoff, on its own slower charge curve. */
  get briCharge() {
    return clamp(
      this.availableDwell / TUNE.briFullChargeTime,
      TUNE.briMinCharge,
      1,
    );
  }
  step(
    dt: number,
    input: InputFrame,
    supported: boolean,
    sweeping = false,
    transitionRelease = false,
  ) {
    this.popped = false;
    // A deliberate unmodified deep down hold loads a hop. The gentle band above
    // the deadzone belongs to the manual and must never reach this branch, so
    // the entry threshold stays deep; once loading, a lower release threshold
    // holds the charge rather than dropping it at the exact boundary.
    const threshold =
      this.amount > 0 ? TUNE.preloadRelease : TUNE.preloadThreshold;
    const down =
      input.ry > threshold &&
      Math.abs(input.rx) < 0.5 &&
      input.held.leftModifier < 0.5;
    this.heldAge += dt;
    if (down && supported) {
      this.upwardWindow = 0;
      this.dwell += dt;
      this.amount = clamp(
        this.amount + (dt / TUNE.preloadTime) * input.ry,
        0,
        1,
      );
      this.heldCharge = this.amount;
      this.heldDwell = this.dwell;
      this.heldAge = 0;
    } else if (sweeping && supported) {
      // A circular RS gesture owns the stick until it has finished. Do not
      // mistake its first sideways movement for a hop release.
      return null;
    } else if (
      input.ry <= -0.82 &&
      this.dwell >= 0.06 &&
      this.amount > 0
    ) {
      // A bunny hop completes when RS travels back up toward the rider.
      // The same completed stroke is required on ramps and flat ground.
      this.popped = supported;
      const charge = this.amount;
      // A completed hop release consumes its own stroke. Clearing the latch too
      // stops that same movement being reused as a later trick command.
      this.reset();
      this.popped = supported;
      return this.popped ? charge : null;
    } else if (!supported) this.reset();
    else if (this.amount > 0) {
      // A real upward flick crosses neutral before it reaches the pop zone.
      // Preserve the charge for that short gesture window; Simulation clears
      // its visual crouch immediately when the stick is no longer held down.
      this.upwardWindow += dt;
      // Drop the live crouch, but leave the latched charge to expire on its own
      // timer: a scoop being traced right now still owns that preload.
      if (this.upwardWindow > 0.24) {
        this.amount = this.dwell = 0;
        this.upwardWindow = 0;
      }
    } else this.dwell = 0;
    return null;
  }
  reset() {
    this.amount = this.dwell = 0;
    this.upwardWindow = 0;
    this.popped = false;
    this.heldCharge = this.heldDwell = 0;
    this.heldAge = 99;
  }
}
