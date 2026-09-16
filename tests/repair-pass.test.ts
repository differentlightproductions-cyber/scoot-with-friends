import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLanding } from "../src/player/landing.ts";
import { ManualBalance } from "../src/player/manual.ts";
import { StickPreload } from "../src/input/riding.ts";
import { emptyInput, type InputFrame } from "../src/input/input.ts";
import { TUNE } from "../src/core/config.ts";

const stick = (ry: number, rx = 0): InputFrame => {
  const f = emptyInput();
  f.ry = ry;
  f.rx = rx;
  return f;
};

test("RS bands keep one owner: the gentle manual region never loads a pop", () => {
  // The gentle band must sit clear of the deadzone below it and the preload
  // threshold above it, so ordinary drift cannot reach it and a manual can never
  // charge a hop.
  assert(TUNE.manualMin > 0.15 - 1e-9, "gentle band must start above the deadzone");
  assert(TUNE.manualMax < TUNE.preloadThreshold, "gentle band must stay clear of preload");
  const preload = new StickPreload();
  for (let i = 0; i < 240; i++) preload.step(1 / 120, stick(TUNE.manualMax), true);
  assert.equal(preload.amount, 0, "a held gentle manual position must not charge a hop");
  // A deliberate deep hold does load, and its release pops.
  for (let i = 0; i < 120; i++) preload.step(1 / 120, stick(1), true);
  assert(preload.amount > 0.9);
});

test("preload keeps hysteresis and a hop release consumes its own stroke", () => {
  const preload = new StickPreload();
  for (let i = 0; i < 60; i++) preload.step(1 / 120, stick(1), true);
  const loaded = preload.amount;
  // Easing back between the release floor and the entry threshold keeps the
  // charge rather than dropping it at an exact boundary.
  const between = (TUNE.preloadRelease + TUNE.preloadThreshold) / 2;
  for (let i = 0; i < 12; i++) preload.step(1 / 120, stick(between), true);
  assert(preload.amount >= loaded, "charge must survive the boundary region");
  const popped = preload.step(1 / 120, stick(-0.95), true);
  assert(popped !== null && popped > 0, "a completed up stroke pops");
  assert.equal(preload.briCharge, TUNE.briMinCharge,
    "a consumed hop stroke must not leave charge behind for a later trick");
});

test("Bri charge survives the scoop that has to leave the down position", () => {
  const preload = new StickPreload();
  // Load deeply for roughly a full second, then trace a sideways scoop. The
  // stick is no longer down, which used to discard the preload mid-gesture.
  for (let i = 0; i < Math.round(TUNE.briFullChargeTime * 120); i++)
    preload.step(1 / 120, stick(1), true);
  assert(preload.briCharge > 0.999, "a full hold reaches full charge");
  for (let i = 0; i < 24; i++) preload.step(1 / 120, stick(0.2, 0.95), true);
  assert(preload.briCharge > 0.999, "tracing the scoop must not throw the charge away");
  // It is a short latch, not a permanent one.
  for (let i = 0; i < Math.round(TUNE.briChargeHold * 120) + 12; i++)
    preload.step(1 / 120, stick(0, 0), true);
  assert.equal(preload.briCharge, TUNE.briMinCharge, "the latch expires");
});

test("an uncharged flick still attempts with the small pop it earned", () => {
  const preload = new StickPreload();
  for (let i = 0; i < 6; i++) preload.step(1 / 120, stick(1), true);
  const charge = preload.briCharge;
  assert(charge >= TUNE.briMinCharge, "never refused outright");
  assert(charge < 0.35, "and never given a hidden full launch");
});

test("manual balance answers the stick on the same frame it moves", () => {
  const hold = new ManualBalance();
  hold.enter(false);
  // Holding the neutral position is close to steady.
  for (let i = 0; i < 60; i++) hold.step(1 / 120, TUNE.manualNeutralHold, 0);
  assert(hold.active && Math.abs(hold.balance) < 0.35);
  // One frame of a correction must move the indicator, not just its velocity.
  const before = hold.balance;
  hold.step(1 / 120, TUNE.manualNeutralHold + 0.3, 0);
  assert(hold.balance > before, "the stick has direct rate authority over balance");
  assert(hold.command > 0, "and the commanded notch reads positive");
});

test("nose manual mirrors the command sign rather than inverting the response", () => {
  const nose = new ManualBalance();
  nose.enter(true);
  nose.step(1 / 120, -TUNE.manualNeutralHold, 0);
  assert(Math.abs(nose.command) < 1e-6, "the mirrored hold position is neutral");
  nose.step(1 / 120, -TUNE.manualNeutralHold - 0.3, 0);
  assert(nose.command > 0, "pushing further up commands the same way a manual does");
});

test("manuals stay failable in both directions", () => {
  const loop = new ManualBalance();
  loop.enter(false);
  let result = "active";
  for (let i = 0; i < 600 && result === "active"; i++) result = loop.step(1 / 120, 1, 0);
  assert.equal(result, "loop");
  const drop = new ManualBalance();
  drop.enter(false);
  result = "active";
  for (let i = 0; i < 600 && result === "active"; i++) result = drop.step(1 / 120, 0, 0);
  assert.equal(result, "drop", "releasing the stick settles the wheel back down");
});

test("landing grades read PERFECT / GOOD / SKETCHY / BAIL off the receiving surface", () => {
  const base = {
    yaw: 0,
    velocityYaw: 0,
    speed: 7,
    impact: 6,
    deckAngle: 0,
    barAngle: 0,
    pitchError: 0,
    spinSpeed: 0,
  };
  assert.equal(classifyLanding(base), "clean");
  // A routine landing with small recoverable errors is a success, not a
  // near-crash. This band did not exist before and is the whole point of the fix.
  assert.equal(classifyLanding({ ...base, yaw: 0.45 }), "good");
  assert.equal(classifyLanding({ ...base, pitchError: 0.6 }), "good");
  assert.equal(classifyLanding({ ...base, impact: 11 }), "good");
  assert.equal(classifyLanding({ ...base, yaw: 0.7 }), "sketchy");
  assert.equal(classifyLanding({ ...base, yaw: 1.5 }), "failed");
});

test("fakie and banked transition landings are not downgraded for being tilted", () => {
  const base = {
    yaw: 0,
    velocityYaw: 0,
    speed: 7,
    impact: 6,
    deckAngle: 0,
    barAngle: 0,
    pitchError: 0,
    spinSpeed: 0,
  };
  // Travelling backwards is an axis, not a forward-only vector.
  assert.equal(classifyLanding({ ...base, yaw: Math.PI }), "clean");
  // Pitched over with the ramp, not against it: measured against the surface
  // this is well aligned, and world-up tilt alone must not grade it down.
  assert.equal(
    classifyLanding({
      ...base,
      pitchError: 0,
      riderPitch: 0.6,
      surfacePitch: 0.6,
      weightBias: Math.sin(0.6) * 0.6,
    }),
    "clean",
  );
});

test("grade thresholds stay ordered so no band can be skipped", () => {
  assert(TUNE.cleanAngle < TUNE.goodAngle && TUNE.goodAngle < TUNE.failAngle);
  assert(TUNE.cleanImpact < TUNE.goodImpact && TUNE.goodImpact < TUNE.failImpact);
  assert(TUNE.cleanPartAngle < TUNE.goodPartAngle && TUNE.goodPartAngle < TUNE.failPartAngle);
  assert(TUNE.cleanPitchError < TUNE.goodPitchError);
  assert(TUNE.cleanBodyError < TUNE.goodBodyError);
  assert(TUNE.cleanWeightError < TUNE.goodWeightError);
  // A successful ride-away keeps most of its speed; only rough ones lose more.
  assert(TUNE.sketchySpeedKeep < TUNE.goodSpeedKeep && TUNE.goodSpeedKeep <= 1);
});
