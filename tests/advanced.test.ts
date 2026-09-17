import { test } from "node:test";
import assert from "node:assert/strict";
import { RotationChannel, Tricks } from "../src/tricks/tricks";
import { StickGesture } from "../src/tricks/gesture";
import { Events } from "../src/core/events";
import { emptyInput } from "../src/input/input";
test("Buttercup requires actual ordered whip, bri, whip completion", () => {
  const t = new Tricks(new Events());
  t.startAir(false);
  for (const c of [t.deck, t.bri, t.deck]) {
    c.kick(1);
    for (let i = 0; i < 160; i++) t.input(1 / 120, emptyInput());
  }
  t.finish("clean");
  assert.equal(t.last, "Buttercup");
  assert.deepEqual(t.history[0].raw.motionOrder, ["deck", "bri", "deck"]);
});
test("Mixed normal and finger rotations retain distinct component names", () => {
  const t = new Tricks(new Events());
  t.startAir(false);
  t.deck.kick(1);
  for (let i = 0; i < 160; i++) t.input(1 / 120, emptyInput());
  const f = emptyInput();
  // Normal preset: X is the whip button.
  f.pressed.pushDeck = true;
  f.held.pumpGrind = 1;
  t.input(1 / 120, f);
  for (let i = 0; i < 160; i++) t.input(1 / 120, emptyInput());
  t.finish("clean");
  assert.equal(t.last, "Tailwhip + Fingerwhip");
  assert.equal(t.history[0].raw.fingerTurns, 1);
});
const tick = (c: RotationChannel, n = 1) => {
  for (let i = 0; i < n; i++) c.step(1 / 120);
};
test("Rewinds require an active timing window, reverse momentum, reject the same direction and chain without a count cap", () => {
  const c = new RotationChannel(180, 22);
  assert.equal(c.rewind(-1, "left"), false);
  c.kick(1);
  assert.equal(c.rewind(-1, "left"), false);
  for (let r = 0; r < 5; r++) {
    let guard = 0;
    while (!c.canRewind && guard++ < 300) tick(c);
    assert.ok(c.canRewind);
    const direction = Math.sign(c.segmentEnd - c.segmentStart);
    assert.equal(c.rewind(direction, "wrong"), false);
    const before = c.velocity;
    assert.equal(c.rewind(-direction, direction > 0 ? "left" : "right"), true);
    assert.equal(c.velocity, before);
    tick(c, 20);
    assert.equal(Math.sign(c.velocity), -direction);
  }
  tick(c, 300);
  assert.equal(c.reversals.length, 5);
  assert.ok(c.mismatch < 0.02);
});
test("Contextual bar reversal records actual opposite angular direction", () => {
  const t = new Tricks(new Events());
  t.startAir(false);
  t.bars.kick(1);
  while (!t.bars.canRewind) t.bars.step(1 / 120);
  const f = emptyInput();
  f.pressed.rightModifier = true;
  t.input(1 / 120, f);
  assert.equal(t.bars.reversals.length, 0);
  f.pressed.rightModifier = false;
  f.pressed.leftModifier = true;
  t.input(1 / 120, f);
  assert.equal(t.bars.reversals.length, 1);
  for (let i = 0; i < 200; i++) t.input(1 / 120, emptyInput());
  t.finish("clean");
  assert.equal(t.last, "Bar Rewind");
});
test("Regular and goofy stance reverse natural whip recognition and preserve raw stance", () => {
  for (const stance of ["regular", "goofy"] as const) {
    const t = new Tricks(new Events());
    t.stance = stance;
    t.startAir(false);
    t.deck.kick(1);
    for (let i = 0; i < 240; i++) t.input(1 / 120, emptyInput());
    t.finish("clean");
    assert.equal(t.last, stance === "regular" ? "Tailwhip" : "Heelwhip");
    assert.equal(t.history[0].raw.stance, stance);
  }
});
test("Triggers initiate a slower hand-driven fingerwhip without remapping a normal whip", () => {
  const t = new Tricks(new Events());
  t.startAir(false);
  const f = emptyInput();
  f.held.pumpGrind = 1;
  f.pressed.pushDeck = true;
  t.input(1 / 120, f);
  assert.ok(t.fingerTime > 0);
  assert.equal(t.fingerHand, 1);
  for (let i = 0; i < 240; i++) t.input(1 / 120, emptyInput());
  t.finish("clean");
  assert.equal(t.last, "Fingerwhip");
});
test("Gesture recognition separates both circular sweeps from a lower scoop and rejects a single flick", () => {
  for (const direction of [-1, 1]) {
    const g = new StickGesture();
    let result = null;
    for (let i = 0; i <= 24; i++) {
      const angle = (direction * i * Math.PI * 2) / 24;
      result = g.step(0.02, Math.cos(angle), Math.sin(angle)) || result;
    }
    assert.equal(result?.kind, "bri");
    assert.equal(result?.direction, direction);
  }
  const g = new StickGesture();
  let result = null;
  for (let i = 0; i <= 12; i++) {
    const angle = (i * Math.PI) / 12;
    result = g.step(0.025, Math.cos(angle), Math.sin(angle)) || result;
  }
  result = g.step(0.02, 0, 0) || result;
  assert.equal(result?.kind, "kickless");
  g.reset();
  assert.equal(g.step(0.02, 1, 0), null);
  assert.equal(g.step(0.02, 0, 0), null);
});
test("Bri and kickless names require completed independent scooter rotations", () => {
  for (const [channel, direction, name] of [
    ["bri", 1, "Bri"],
    ["bri", -1, "Inward"],
    ["kickless", 1, "Kickless"],
  ] as const) {
    const t = new Tricks(new Events());
    t.startAir(false);
    t[channel].kick(direction);
    for (let i = 0; i < 240; i++) t.input(1 / 120, emptyInput());
    t.finish("clean");
    assert.equal(t.last, name);
    assert.equal(t.deck.angle, 0);
  }
});
