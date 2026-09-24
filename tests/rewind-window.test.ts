import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyInput } from "../src/input/input";
import { Tricks, RotationChannel } from "../src/tricks/tricks";
import { Events } from "../src/core/events";

// #38: whip rewinds and Kickless have a wide window, belong only to a whip
// already spinning, and LB stays the Decade button otherwise.
const dt = 1 / 120;
const step = (t: Tricks, seconds: number, make = () => emptyInput()) => { for (let i = 0; i < Math.round(seconds * 120); i++) t.input(dt, make()); };
const press = (bumper: "leftModifier" | "rightModifier", hold = true) => { const f = emptyInput(); f.pressed[bumper] = true; if (hold) f.held[bumper] = 1; return f; };

test("the rewind window covers most of the whip", () => {
  assert.ok(RotationChannel.rewindWindow[0] <= 0.3 && RotationChannel.rewindWindow[1] >= 0.95);
});

test("a bumper tapped early in a whip rewinds it when the window opens", () => {
  for (const direction of [-1, 1]) {
    const t = new Tricks(new Events());
    t.startAir(false);
    t.deck.kick(direction);
    t.input(dt, emptyInput());
    assert.ok(!t.deck.canRewind, "the window is not open yet at the kick");
    const bumper = direction === 1 ? "leftModifier" : "rightModifier";
    t.input(dt, press(bumper));
    step(t, 1.2);
    assert.equal(t.deck.reversals.length, 1, `rewind ${direction}`);
  }
});

test("LB during a whip never starts a Decade; with no whip it does", () => {
  const whip = new Tricks(new Events());
  whip.startAir(false);
  whip.deck.kick(1);
  step(whip, 0.05);
  whip.input(dt, press("leftModifier"));
  step(whip, 0.1);
  assert.ok(!whip.decadeActive, "no Decade from a mid-whip LB");

  const plain = new Tricks(new Events());
  plain.startAir(false);
  plain.input(dt, press("leftModifier"));
  step(plain, 0.1);
  assert.ok(plain.decadeActive, "LB tap in the air is a Decade");
});
