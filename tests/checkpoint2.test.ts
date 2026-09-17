import { test } from "node:test";
import assert from "node:assert/strict";
import { BodyFlipControl } from "../src/player/body-flip.ts";
import { resolveTrick, type TrickPrimitives } from "../src/tricks/resolver.ts";
import { TUNE } from "../src/core/config.ts";

const TAU = Math.PI * 2;
const raw: TrickPrimitives = {
  bodyYaw: Math.PI,
  flipPitch: -TAU,
  deckAngle: 0,
  barAngle: 0,
  deckTurns: 0,
  barTurns: 0,
  states: [],
  out: false,
  direction: { body: 1, deck: 0, bars: 0 },
};

// --- Naming --------------------------------------------------------------

test("Flair and Front Flair follow the movement regardless of obstacle", () => {
  assert.equal(resolveTrick(raw).name, "Flair");
  assert.equal(resolveTrick({ ...raw, flairContext: true }).name, "Flair");
  assert.equal(resolveTrick({ ...raw, flipPitch: TAU }).name, "Front Flair");
  assert.equal(resolveTrick({ ...raw, flipPitch: TAU, flairContext: true }).name, "Front Flair");
});

test("Flair naming does not swallow other flip and spin combinations", () => {
  assert.equal(resolveTrick({ ...raw, bodyYaw: TAU }).name, "Backflip 360");
  assert.equal(resolveTrick({ ...raw, flipPitch: TAU, bodyYaw: TAU }).name, "Frontflip 360");
  assert.equal(resolveTrick({ ...raw, bodyYaw: TAU * 2 }).name, "Backflip 720");
  assert.equal(resolveTrick({ ...raw, flipPitch: TAU, bodyYaw: TAU * 2 }).name, "Frontflip 720");
  // A flip with no half turn is not a flair.
  assert(!resolveTrick({ ...raw, bodyYaw: 0 }).name.includes("Flair"));
  // Two flips with a half turn is not a flair either.
  assert(!resolveTrick({ ...raw, flipPitch: -TAU * 2 }).name.includes("Flair"));
});

test("Flair is recognised as its own result rather than a generic rule", () => {
  assert.equal(resolveTrick(raw).recognized, "flair");
  assert.equal(resolveTrick({ ...raw, flipPitch: TAU }).recognized, "front-flair");
});

// --- Flip-completion assist ----------------------------------------------

/**
 * Drives a flip to `turns`, lets the rate bleed off to `rate` (the player easing
 * toward a catch), then runs the final approach with the assist available.
 * Bleeding the rate matters: straight off full input the rider is rotating at
 * the maximum and no landing is reachable, which is correct but measures
 * momentum rather than the assist.
 */
function flipTo(turns: number, options: {
  seconds?: number;
  chord?: boolean;
  lean?: number;
  rate?: number;
  timeToContact?: number;
  surfacePitch?: number;
} = {}) {
  const flip = new BodyFlipControl();
  flip.begin("trick_initiated_pop", 0);
  for (let i = 0; i < 4000 && Math.abs(flip.angle) < Math.abs(turns) * TAU; i++)
    flip.step(1 / 120, true, -1, 0, { timeToContact: 99, surfacePitch: 0 });
  if (options.rate !== undefined) flip.velocity = options.rate;
  const drivenAngle = flip.angle;
  const assistBefore = flip.assistUsed;
  const preparedBefore = flip.prepared;
  const steps = Math.round((options.seconds ?? 0.3) * 120);
  for (let i = 0; i < steps; i++)
    flip.step(1 / 120, options.chord ?? false, options.lean ?? 0, 0, {
      timeToContact: options.timeToContact ?? 0.3,
      surfacePitch: options.surfacePitch ?? 0,
    });
  return { flip, drivenAngle, drawn: flip.assistUsed - assistBefore, prepared: flip.prepared - preparedBefore };
}

test("the assist only acts once a landing is imminent", () => {
  // Eased to a rate that would very nearly finish the revolution on its own.
  const far = flipTo(0.9, { rate: 2.1, timeToContact: 99 });
  assert.equal(far.prepared, 0, "a distant landing must not be shaped");
  assert.equal(far.drawn, 0, "a distant landing must not draw on the assist");
  const near = flipTo(0.9, { rate: 2.1, timeToContact: 0.3 });
  assert(near.prepared > 0, "an imminent, reachable landing should be shaped");
});

test("strong continued input keeps the rotation the player's own", () => {
  // Still driving hard in the direction of travel: no assistance at all.
  const driving = flipTo(0.85, { chord: true, lean: -1, timeToContact: 0.3 });
  assert.equal(driving.flip.assistUsed, 0);
  // The rider is free to carry on into a second revolution.
  assert(Math.abs(driving.flip.angle) > 0.85 * TAU);
});

test("the assist is bounded and cannot manufacture a missing half flip", () => {
  // Barely turning, with 40% of the revolution still owed: fabricating it would
  // need about 8 rad/s of correction, far outside the budget.
  const helped = flipTo(0.6, { rate: 0.4, timeToContact: 0.3, seconds: 0.3 });
  assert(helped.flip.assistUsed <= TUNE.flipAssistBudget + 1e-9,
    "assist must not exceed its budget");
  assert.equal(helped.drawn, 0, "an unreachable landing must not be manufactured");
  const turned = Math.abs(helped.flip.angle) / TAU;
  assert(turned < 0.8, `should not complete the flip from 0.6 turns, got ${turned}`);
});

test("a nearly finished flip is eased onto the whole revolution", () => {
  const helped = flipTo(0.9, { rate: 2.1, timeToContact: 0.3, seconds: 0.3 });
  assert(helped.prepared > 0, "landing preparation should contribute");
  const turned = Math.abs(helped.flip.angle) / TAU;
  assert(turned > 0.93, "the rotation should continue toward the revolution");
  assert(turned < 1.12, `it should settle near one revolution, got ${turned}`);
});

test("the assist never stops the rider at the first revolution by default", () => {
  // Held input through a second revolution must reach it.
  const flip = new BodyFlipControl();
  flip.begin("trick_initiated_pop", 0);
  for (let i = 0; i < 4000 && Math.abs(flip.angle) < 2 * TAU; i++)
    flip.step(1 / 120, true, -1, 0, { timeToContact: 0.3, surfacePitch: 0 });
  assert(Math.abs(flip.angle) >= 2 * TAU, "a double must remain achievable");
  assert.equal(flip.assistUsed, 0, "driving input must not draw on the assist");
});

test("a banked receiving surface is measured as level, not as rotation owed", () => {
  // Landing on a ramp pitched 0.5 rad: the reachable target shifts with it, so
  // the assist does not try to add that angle as if it were missing flip.
  const level = flipTo(0.93, { timeToContact: 0.3, surfacePitch: 0 });
  const banked = flipTo(0.93, { timeToContact: 0.3, surfacePitch: 0.5 });
  assert(banked.flip.assistUsed <= TUNE.flipAssistBudget + 1e-9);
  assert(
    Math.abs(banked.flip.angle - level.flip.angle) < TAU * 0.5,
    "a banked surface must not demand a large extra correction",
  );
});

test("the assist resets between attempts", () => {
  const { flip } = flipTo(0.9, { rate: 1.5, timeToContact: 0.3 });
  assert(flip.assistUsed > 0 && flip.prepared > 0);
  flip.begin("trick_initiated_pop", 0);
  assert.equal(flip.assistUsed, 0);
  assert.equal(flip.prepared, 0);
  assert.equal(flip.assisting, false);
});

test("assist limits are small enough to stay a nudge", () => {
  // A whole revolution is 6.28 rad; the budget must be a fraction of that so
  // several helpers can never stack into an invisible rescue.
  assert(TUNE.flipAssistBudget < TAU * 0.25);
  assert(TUNE.flipAssistRate < TUNE.flipMaxRate);
  assert(TUNE.flipAssistWindow <= 0.6);
});
