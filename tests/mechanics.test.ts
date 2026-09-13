import { test } from "node:test";
import assert from "node:assert/strict";
import { RotationChannel, trickName, Tricks } from "../src/tricks/tricks.ts";
import { classifyLanding } from "../src/player/landing.ts";
import { ManualBalance } from "../src/player/manual.ts";
import { Events } from "../src/core/events.ts";
import { findGrind } from "../src/grind/grind.ts";
import { Vector3 } from "three";
import { TUNE } from "../src/core/config.ts";
import { ScoreSystem } from "../src/tricks/score.ts";
import { AirSpinControl } from "../src/player/air-spin.ts";
import { resolveTrick } from "../src/tricks/resolver.ts";
import { AirWeightControl } from "../src/player/air-weight.ts";
test("counterweight reverses smoothly, is pitch limited, and cannot accumulate unlimited air speed", () => {
  const weight = new AirWeightControl(),
    velocity = new Vector3(0, 2, 5);
  for (let i = 0; i < 90; i++) weight.step(1 / 120, -1, 0, velocity);
  assert(weight.shift > 0.9 && weight.pitchBias > 0.3);
  const before = weight.pitchBias;
  weight.step(1 / 120, 1, 0, velocity);
  assert(Math.abs(weight.pitchBias - before) < 0.03);
  for (let i = 0; i < 600; i++) weight.step(1 / 120, 1, 0, velocity);
  assert(
    weight.shift < -0.9 &&
      weight.pitchBias < -0.3 &&
      Math.abs(weight.pitchBias) <= TUNE.airPitchBiasMax,
  );
  assert(Math.abs(velocity.z - 5) <= TUNE.airTrajectoryBudget + 0.0001);
  assert.equal(velocity.y, 2);
});
test("matched weight can land cleanly while backward weight on a descent is sketchy", () => {
  const landing = {
    yaw: 0,
    velocityYaw: 0,
    speed: 7,
    impact: 7,
    deckAngle: 0,
    barAngle: 0,
    pitchError: -0.1,
    spinSpeed: 0,
    surfacePitch: 0.6,
  };
  assert.equal(
    classifyLanding({ ...landing, weightBias: 0.6, riderPitch: 0.6 }),
    "clean",
  );
  assert.equal(
    classifyLanding({ ...landing, weightBias: -0.9, riderPitch: 0.35 }),
    "sketchy",
  );
});
test("holding spins continuously while taps finish one rotation and permit a separate caught sequence", () => {
  const channel = new RotationChannel(TUNE.barAcceleration, TUNE.barMaxSpeed);
  for (let i = 0; i < 100; i++) {
    channel.input(1 / 120, i === 0, true, 1);
    channel.step(1 / 120);
  }
  assert(
    channel.turns >= 3 && channel.velocity > 10 && channel.catches.length === 0,
  );
  for (let i = 0; i < 100; i++) {
    channel.input(1 / 120, false, false, 1);
    channel.step(1 / 120);
  }
  assert(channel.mismatch < 0.02 && channel.velocity === 0);
  channel.reset();
  channel.kick(1);
  for (let i = 0; i < 100; i++) channel.step(1 / 120);
  assert.equal(channel.turns, 1);
  channel.kick(1);
  assert.deepEqual(channel.catches, [1]);
});
test("analog air authority separates soft, medium and full input without completing rotations", () => {
  const spins = [0.25, 0.55, 1].map((stick) => {
    const control = new AirSpinControl();
    let spin = 0;
    for (let i = 0; i < 60; i++)
      spin = control.step(1 / 120, spin, stick, 3, 2, 0.3);
    return Math.abs(spin);
  });
  assert(spins[0] < spins[1] * 0.8 && spins[1] < spins[2] * 0.8);
  const low = new AirSpinControl(),
    high = new AirSpinControl();
  for (let i = 0; i < 120; i++) {
    low.step(1 / 120, 0, 1, -1, 0.05, 0.05);
    high.step(1 / 120, 0, 1, 7, 4, 0.3);
  }
  assert(high.authority > low.authority + 0.1);
});
test("opposing whip/body directions resolve symmetrically and raw data is retained", () => {
  for (const sign of [-1, 1]) {
    const raw = {
      bodyYaw: Math.PI * sign,
      flipPitch: 0,
      deckAngle: -sign * Math.PI * 2,
      barAngle: 0,
      deckTurns: -sign,
      barTurns: 0,
      states: [],
      out: false,
      direction: { body: sign, deck: -sign, bars: 0 },
    };
    const result = resolveTrick(raw);
    assert(result.name.includes("Downside"));
    assert.equal(result.raw.bodyYaw, raw.bodyYaw);
    assert.equal(result.raw.deckTurns, -sign);
    raw.states.push("mutated" as never);
    assert.equal(result.raw.states.length, 0);
  }
});
test("held fakie scoring banks once, discards bails, and clears on session restart", () => {
  const e = new Events(),
    s = new ScoreSystem(e),
    t = new Tricks(e);
  for (let i = 0; i < 240; i++) {
    t.holdFakie(1 / 120);
    if (t.fakieRecord) s.holdFakie(1 / 120);
    t.tick(1 / 120, true);
  }
  assert.equal(t.line.filter((n) => n === "Fakie").length, 1);
  assert(s.line >= 100);
  const amount = s.line;
  t.endFakie();
  t.tick(2, false);
  assert.equal(s.total, amount);
  assert.equal(s.line, 0);
  t.tick(2, false);
  assert.equal(s.total, amount);
  t.add("Manual");
  e.emit({ type: "bail", reason: "test" });
  assert.equal(s.line, 0);
  assert.equal(s.total, amount);
  s.restart();
  assert.equal(s.total, 0);
});
test("independent rotation channels accelerate, finish catches, and allow triple rotations", () => {
  const deck = new RotationChannel(TUNE.deckAcceleration, TUNE.deckMaxSpeed),
    bars = new RotationChannel(TUNE.barAcceleration, TUNE.barMaxSpeed);
  deck.kick(1);
  bars.kick(-1);
  deck.step(1 / 120);
  assert(deck.angle > 0 && deck.angle < 0.02);
  assert(deck.mismatch > 0.001);
  for (let i = 0; i < 80; i++) {
    deck.step(1 / 120);
    bars.step(1 / 120);
  }
  assert.equal(deck.turns, 1);
  assert.equal(bars.turns, -1);
  assert(deck.mismatch < 0.04);
  deck.kick(1);
  deck.kick(1);
  for (let i = 0; i < 150; i++) deck.step(1 / 120);
  assert.equal(deck.turns, 3);
  assert(deck.mismatch < 0.04);
});
test("names derive from actual movement and support composed tricks", () => {
  assert.equal(trickName(Math.PI * 2, 1, 1, []), "Truck Driver + Tailwhip");
  assert.equal(
    trickName(Math.PI * 4, -2, 2, ["One-footer"]),
    "720° Double Downside Heelwhip + Double Barspin + One-footer",
  );
  assert.equal(trickName(Math.PI, 0, 0, []), "180°");
  assert.equal(trickName(Math.PI * 3, 0, 0, []), "540°");
  assert.equal(trickName(0, 0, 0, []), "");
  assert.equal(trickName(0, 0, 1, [], true), "Barspin Out");
});
test("landing distinguishes clean, recoverable, failed and accepts fakie", () => {
  const f = {
    yaw: 0,
    velocityYaw: 0,
    speed: 7,
    impact: 6,
    deckAngle: 0,
    barAngle: 0,
    pitchError: 0,
    spinSpeed: 0,
  };
  assert.equal(classifyLanding(f), "clean");
  assert.equal(classifyLanding({ ...f, yaw: Math.PI }), "clean");
  assert.equal(classifyLanding({ ...f, yaw: 0.65 }), "sketchy");
  assert.equal(classifyLanding({ ...f, yaw: 1.5 }), "failed");
  assert.equal(classifyLanding({ ...f, deckAngle: 2 }), "failed");
  assert.equal(classifyLanding({ ...f, impact: 17 }), "failed");
});
test("manual balances deterministically and both overbalance directions end correctly", () => {
  const m = new ManualBalance();
  m.enter(false);
  for (let i = 0; i < 120; i++) m.step(1 / 120, 0, 0);
  assert(m.active);
  let result = "active";
  for (let i = 0; i < 300 && result === "active"; i++)
    result = m.step(1 / 120, 1, 0);
  assert.equal(result, "loop");
  m.enter(true);
  result = "active";
  for (let i = 0; i < 300 && result === "active"; i++)
    result = m.step(1 / 120, 1, 0);
  assert.equal(result, "drop");
});
test("combo survives linked states, expires on ordinary riding, and resets after bail", () => {
  const e = new Events(),
    t = new Tricks(e);
  t.add("Tailwhip");
  for (let i = 0; i < 500; i++) t.tick(1 / 120, true);
  assert.equal(t.line.length, 1);
  t.add("Manual");
  t.startAir(true);
  t.bars.angle = Math.PI * 2;
  t.finish("clean");
  assert.equal(t.line.at(-1), "Barspin Out");
  t.tick(2, false);
  assert.equal(t.line.length, 0);
  assert(e.history.some((e) => e.type === "line" && e.ended));
  t.reset();
  assert.equal(t.last, "");
});
test("grind requires close aligned descending trajectory and assist toggle changes capture width", () => {
  const rail = {
    id: "test",
    a: new Vector3(0, 0.6, 0),
    b: new Vector3(0, 0.6, 8),
    kind: "rail" as const,
  };
  const p = new Vector3(0.3, 0.8, 3),
    vel = new Vector3(0, -1, 5);
  assert(findGrind([rail], p, vel, 0, 0, true));
  assert.equal(findGrind([rail], p, vel, 0, 0, false), null);
  assert.equal(
    findGrind([rail], new Vector3(2, 0.8, 3), vel, 0, 0, true),
    null,
  );
  assert.equal(findGrind([rail], p, new Vector3(5, -1, 0), 0, 0, true), null);
  assert.equal(findGrind([rail], p, vel, 0, -0.2, true)?.name, "Feeble");
  assert.equal(findGrind([rail], p, vel, 0, 0.2, true)?.name, "Smith");
  assert.equal(
    findGrind([rail], p, vel, Math.PI / 2, 0, true)?.name,
    "Deck Slide",
  );
});
