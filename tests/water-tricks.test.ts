import { test } from "node:test";
import assert from "node:assert/strict";
import { entryOf, judgeWater, settleTarget, type WaterAir } from "../src/tricks/water";

const air = (over: Partial<WaterAir> = {}): WaterAir => ({ flip: 0, side: 0, twist: 0, tuck: false, spread: false, height: 1.5, gainer: false, board: false, ...over });
const T = Math.PI * 2;

test("entry attitude: feet first, head first or flat", () => {
  assert.equal(entryOf(0), "feet");
  assert.equal(entryOf(T * 0.9), "feet");
  assert.equal(entryOf(T * 0.5), "head");
  assert.equal(entryOf(-T * 1.55), "head");
  assert.equal(entryOf(T * 0.25), "flat");
  assert.equal(entryOf(-T * 0.7), "flat");
});

test("plain jumps are named by how the body is held", () => {
  assert.equal(judgeWater(air()).name, "Pencil Jump");
  assert.equal(judgeWater(air({ tuck: true })).name, "Cannonball");
  assert.equal(judgeWater(air({ spread: true })).name, "Star Jump");
  assert.ok(judgeWater(air({ tuck: true })).points > judgeWater(air()).points);
});

test("flips count in halves, with diving names", () => {
  assert.equal(judgeWater(air({ flip: T * 0.5 })).name, "Front Dive");
  assert.equal(judgeWater(air({ flip: T * 0.5, spread: true })).name, "Swan Dive");
  assert.equal(judgeWater(air({ flip: T })).name, "Front Flip");
  assert.equal(judgeWater(air({ flip: T * 1.5 })).name, "Front 1½");
  assert.equal(judgeWater(air({ flip: T * 2 })).name, "Double Front");
  assert.equal(judgeWater(air({ flip: -T })).name, "Back Flip");
  assert.equal(judgeWater(air({ flip: -T, gainer: true })).name, "Gainer Flip");
  assert.equal(judgeWater(air({ side: T })).name, "Side Flip");
  // The probe's 0.85-turn flip still enters feet first and names as a flip.
  const probe = judgeWater(air({ flip: T * 0.85 }));
  assert.equal(probe.name, "Front Flip");
  assert.ok(probe.clean);
});

test("twists are named like spins and stack with flips", () => {
  assert.equal(judgeWater(air({ twist: Math.PI * 2 })).name, "360 Twist");
  assert.equal(judgeWater(air({ twist: Math.PI * 3.1 })).name, "540 Twist");
  assert.equal(judgeWater(air({ flip: -T, twist: -Math.PI * 2 })).name, "Back Flip 360");
  assert.ok(judgeWater(air({ flip: T, twist: T })).points > judgeWater(air({ flip: T })).points + judgeWater(air({ twist: T })).points - 1);
});

test("flat entries flop, and a head-first landing on the ground is not clean", () => {
  const flop = judgeWater(air({ flip: T * 0.25 }));
  assert.equal(flop.name, "Belly Flop");
  assert.equal(flop.clean, false);
  assert.equal(judgeWater(air({ flip: -T * 0.3 })).name, "Back Smack");
  assert.equal(judgeWater(air({ side: T * 0.75 })).name, "Side Smack");
  assert.equal(judgeWater(air({ flip: T * 0.5 }), true).clean, false);
  assert.equal(judgeWater(air({ flip: T }), true).clean, true);
});

test("height and the springboard raise the score", () => {
  const low = judgeWater(air({ flip: T, height: 1.2 })).points, high = judgeWater(air({ flip: T, height: 5 })).points;
  assert.ok(high > low * 1.8, `${low} -> ${high}`);
  assert.ok(judgeWater(air({ flip: T, board: true })).points > judgeWater(air({ flip: T })).points);
});

test("a let-go rotation settles on the next whole half turn", () => {
  assert.equal(settleTarget(0.4, 1), Math.PI);
  assert.equal(settleTarget(Math.PI * 1.2, 1), Math.PI * 2);
  assert.equal(settleTarget(-Math.PI * 0.3, -1), -Math.PI);
  assert.equal(settleTarget(Math.PI, 1), Math.PI);
});
