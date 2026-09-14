import { test } from "node:test";
import assert from "node:assert/strict";
import { StickPreload, ridingButtons } from "../src/input/riding";
import { emptyInput } from "../src/input/input";
import { Tricks } from "../src/tricks/tricks";
import { Events } from "../src/core/events";
const dt = 1 / 120;
const run = (t: Tricks, seconds: number, input = emptyInput()) => {
  for (let i = 0; i < seconds * 120; i++) {
    t.input(dt, input);
    input.pressed = { ...emptyInput().pressed };
  }
};
function window(t: Tricks) {
  for (let i = 0; i < 240 && !t.deck.canRewind; i++) t.input(dt, emptyInput());
  assert.ok(t.deck.canRewind);
}
test("RS dwell loads analog charge and only pops after a full upward return; no airborne loading or single-flick hop", () => {
  const p = new StickPreload(),
    f = emptyInput();
  f.ry = 1;
  for (let i = 0; i < 60; i++) p.step(dt, f, true);
  assert.equal(p.amount, 1);
  f.rx = 1;
  f.ry = 0.3;
  assert.equal(p.step(dt, f, true), null);
  assert.equal(p.popped, false);
  f.rx = 0;
  f.ry = -0.9;
  assert.equal(p.step(dt, f, true), 1);
  assert.equal(p.popped, true);
  f.rx = 0;
  f.ry = 1;
  p.step(dt, f, true);
  f.ry = 0;
  assert.equal(p.step(dt, f, true), null);
  assert.ok(p.amount > 0);
  f.ry = -0.9;
  assert.equal(p.step(dt, f, true), null); // A single-step twitch is not a loaded hop.
  f.ry = 1;
  p.step(dt, f, true);
  f.ry = 0;
  for (let i = 0; i < 30; i++) p.step(dt, f, true);
  assert.equal(p.amount, 0);
  f.ry = 1;
  for (let i = 0; i < 60; i++) p.step(dt, f, false);
  assert.equal(p.amount, 0);
  f.held.leftModifier = 1;
  for (let i = 0; i < 60; i++) p.step(dt, f, true);
  assert.equal(p.amount, 0);
});
test("Both stances map natural, heel and finger whips without RS or same-thumb simultaneous inputs", () => {
  for (const stance of ["regular", "goofy"] as const)
    for (const heel of [false, true])
      for (const finger of [false, true]) {
        const t = new Tricks(new Events());
        t.stance = stance;
        t.startAir(false);
        const f = emptyInput(),
          m = ridingButtons(stance);
        assert.notEqual(m.push, m.whip);
        f.pressed[m.whip] = true;
        f.held.brake = +heel;
        f.held.pumpGrind = +finger;
        run(t, 1.3, f);
        assert.equal(
          Math.sign(t.deck.angle),
          (stance === "regular" ? 1 : -1) * (heel ? -1 : 1),
        );
        t.finish("clean");
        assert.equal(
          t.last,
          finger
            ? heel
              ? "Opposite Fingerwhip"
              : "Fingerwhip"
            : heel
              ? "Heelwhip"
              : "Tailwhip",
        );
      }
});
test("Bumper tap rewinds but held bumper transitions to kickless; eligibility survives the hold threshold", () => {
  for (const direction of [-1, 1])
    for (const hold of [false, true]) {
      const t = new Tricks(new Events());
      t.startAir(false);
      t.deck.kick(direction);
      window(t);
      const f = emptyInput();
      f.pressed.leftModifier = true;
      f.held.leftModifier = 1;
      run(t, hold ? 0.21 : 0.06, f);
      if (!hold) run(t, dt);
      assert.equal(t.deck.reversals.length, hold ? 0 : 1);
      assert.equal(t.kicklessHistory.length, hold ? 1 : 0);
      run(t, 1.2);
      if (hold) {
        assert.ok(Math.abs(t.kickless.turns) >= 1);
        assert.equal(t.kicklessHistory[0].direction, direction);
      }
    }
});
test("Whip rewind chains into a later contextual kickless without consuming a body modifier", () => {
  const t = new Tricks(new Events());
  t.startAir(false);
  t.deck.kick(1);
  window(t);
  let f = emptyInput();
  f.pressed.leftModifier = true;
  f.held.leftModifier = 1;
  run(t, 0.04, f);
  run(t, dt);
  window(t);
  f = emptyInput();
  f.pressed.rightModifier = true;
  f.held.rightModifier = 1;
  run(t, 0.22, f);
  assert.equal(t.deck.reversals.length, 1);
  assert.equal(t.kicklessHistory.length, 1);
  assert.equal(t.kicklessHistory[0].direction, -1);
});
test("Neutral bumper holds and RS scoops cannot create kickless, body family needs no RS", () => {
  const t = new Tricks(new Events());
  t.startAir(false);
  const f = emptyInput();
  f.pressed.leftModifier = true;
  f.held.leftModifier = 1;
  run(t, 0.4, f);
  assert.equal(t.kickless.target, 0);
  for (let i = 0; i <= 12; i++) {
    const f = emptyInput();
    f.rx = Math.cos((i * Math.PI) / 12);
    f.ry = Math.sin((i * Math.PI) / 12);
    run(t, 0.025, f);
  }
  run(t, 0.03);
  assert.equal(t.kickless.target, 0);
  for (const [name, modifiers] of [
    ["No-hander", {}],
    ["Tuck No-hander", { brake: 1, leftModifier: 1 }],
    ["Deck Grab", { brake: 1 }],
    ["Superman", { pumpGrind: 1 }],
    ["Can Can", { leftModifier: 1 }],
    ["One-footer", { rightModifier: 1 }],
    ["No Foot", { leftModifier: 1, rightModifier: 1 }],
  ] as const) {
    t.startAir(false);
    const f = emptyInput();
    f.held.body = 1;
    Object.assign(f.held, modifiers);
    run(t, 0.3, f);
    assert.ok(t.body.has(name));
  }
});
