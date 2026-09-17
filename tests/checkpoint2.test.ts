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

// --- Flip intent and landing guidance ------------------------------------

// A flip in flight with a ballistic contact estimate that counts down, driven by
// a scripted stick: `hold` seconds of full LS with the chord, then relaxed
// (`release`: triggers let go, otherwise chord held with LS neutral).
function fly(options: { hold: number; air: number; release?: boolean; surfacePitch?: number; lean?: number }) {
  const flip = new BodyFlipControl();
  flip.begin("trick_initiated_pop", 0);
  const dt = 1 / 120;
  let turnsAtContact = 0, peakRate = 0;
  for (let t = 0; t < options.air; t += dt) {
    const holding = t < options.hold;
    const chord = holding || !options.release;
    flip.step(dt, chord, holding ? (options.lean ?? -1) : 0, 0, { timeToContact: options.air - t, surfacePitch: options.surfacePitch ?? 0 });
    peakRate = Math.max(peakRate, Math.abs(flip.velocity));
  }
  turnsAtContact = Math.abs(flip.angle) / TAU;
  return { flip, turns: turnsAtContact, peakRate };
}

test("a brief flick with plenty of air completes one flip and holds it", () => {
  for (const release of [false, true]) {
    const run = fly({ hold: 0.2, air: 2.2, release });
    assert(Math.abs(run.turns - 1) < 0.06, `expected one flip, got ${run.turns.toFixed(2)} (release ${release})`);
    assert(Math.abs(run.flip.velocity) < 0.5, "the rider is held upright for the landing, not still turning");
    assert.equal(run.flip.intendedTurns, 1);
  }
});

test("holding the stick hard through the flip goes for a double", () => {
  const held = fly({ hold: 1.2, air: 2.2 });
  assert(held.flip.intendedTurns >= 2);
  assert(Math.abs(held.turns - 2) < 0.08, `expected two flips, got ${held.turns.toFixed(2)}`);
});

test("a flip is guided to finish within its air", () => {
  // Air the player can make with a normal flick: finishes cleanly.
  const run = fly({ hold: 0.25, air: 1.1 });
  assert(Math.abs(run.turns - 1) < 0.06, `got ${run.turns.toFixed(2)}`);
});

test("guidance cannot outrun the maximum rate, so too little air still lands short", () => {
  const run = fly({ hold: 0.1, air: 0.55 });
  assert(run.peakRate <= TUNE.flipMaxRate + 1e-9);
  assert(run.turns < 0.8, `should not complete from so little air, got ${run.turns.toFixed(2)}`);
});

test("opposite input brakes a flip to a stop and guidance does not restart it", () => {
  const flip = new BodyFlipControl();
  flip.begin("trick_initiated_pop", 0);
  for (let i = 0; i < 40; i++) flip.step(1 / 120, true, -1, 0, { timeToContact: 2, surfacePitch: 0 });
  for (let i = 0; i < 120; i++) flip.step(1 / 120, true, 1, 0, { timeToContact: 1.5, surfacePitch: 0 });
  assert.equal(flip.velocity, 0);
});

test("a banked receiving surface counts as level for the finish", () => {
  const level = fly({ hold: 0.2, air: 1.6, surfacePitch: 0 });
  const banked = fly({ hold: 0.2, air: 1.6, surfacePitch: 0.5 });
  // Relative to the landing surface both finish upright: the banked run stops 0.5 rad further round.
  assert(Math.abs(Math.abs(banked.flip.angle) - Math.abs(level.flip.angle) - 0.5) < 0.12,
    `level ${level.flip.angle.toFixed(2)} banked ${banked.flip.angle.toFixed(2)}`);
});

test("guidance state resets between attempts", () => {
  const { flip } = fly({ hold: 1.2, air: 2.2 });
  assert(flip.intendedTurns > 1 && flip.prepared > 0);
  flip.begin("trick_initiated_pop", 0);
  assert.equal(flip.intendedTurns, 1);
  assert.equal(flip.prepared, 0);
  assert.equal(flip.assisting, false);
});
