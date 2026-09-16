import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  LONGBOARD_DIMENSIONS as D,
  LONGBOARD_PARTS,
  defaultLongboard,
  validLongboard,
} from "../src/data/longboardParts.ts";
import { deckHalfWidth, deckTop, deckUnderside } from "../src/longboard/assembly.ts";
import { LongboardMotion } from "../src/longboard/motion.ts";
import { TUNE } from "../src/core/config.ts";

const variants = (id: string) => LONGBOARD_PARTS.find((p) => p.id === id)!.variants.map((v) => v.id);

// --- Catalog --------------------------------------------------------------

test("the authored Sometimes Summer colourways are all present with stable ids", () => {
  assert.deepEqual(variants("ss-drop-through-deck"), ["classic", "horizon", "palms", "ridgeline"]);
  assert.deepEqual(variants("ss-rkp-trucks"), ["matte-black", "gunmetal", "silver", "olive"]);
  assert.deepEqual(variants("ss-cruiser-wheels"), ["blue", "purple", "lime", "red", "white", "black"]);
  for (const part of LONGBOARD_PARTS) {
    assert.equal(part.brandId, "sometimes_summer");
    assert.ok(part.name.startsWith("Sometimes Summer"));
  }
});

test("trucks sell as a pair and wheels as a set of four", () => {
  assert.equal(LONGBOARD_PARTS.find((p) => p.category === "trucks")!.set, "pair");
  assert.equal(LONGBOARD_PARTS.find((p) => p.category === "wheels")!.set, "set-of-4");
  assert.equal(LONGBOARD_PARTS.find((p) => p.category === "bearings")!.set, "set-of-8");
});

test("a saved board keeps valid slots and replaces anything unknown", () => {
  const saved = {
    ...defaultLongboard(),
    deck: { partId: "ss-drop-through-deck", variantId: "palms" },
    wheels: { partId: "ss-cruiser-wheels", variantId: "chrome" }, // no such colour
    trucks: { partId: "lazer-bars", variantId: "silver" }, // a scooter part
  };
  const loaded = validLongboard(saved);
  assert.equal(loaded.deck.variantId, "palms");
  assert.deepEqual(loaded.wheels, defaultLongboard().wheels);
  assert.deepEqual(loaded.trucks, defaultLongboard().trucks);
  assert.deepEqual(validLongboard(null), defaultLongboard());
});

// --- Geometry --------------------------------------------------------------

test("drop-through cutouts and their bolt pattern fit inside the deck outline", () => {
  const station = D.wheelbase / 2;
  for (const z of [station - 0.04, station, station + 0.04])
    assert.ok(deckHalfWidth(z) > 0.036 + 0.009, `bolts need deck material at z=${z}`);
  assert.ok(deckHalfWidth(0) === D.width / 2);
  assert.equal(deckHalfWidth(D.length / 2), 0);
});

test("wheels clear the deck at rest and through a hard carve", () => {
  const station = D.wheelbase / 2,
    wheelTop = D.wheelDiameter,
    innerFace = 0.1145 - D.wheelWidth / 2;
  const underside = deckUnderside(innerFace, station);
  assert.ok(underside - wheelTop > 0.018, `rest clearance ${underside - wheelTop}`);
  // A full carve rolls the deck by the configured lean; the rail over the
  // wheel drops by roughly its distance from the centreline times that angle.
  const drop = deckHalfWidth(station) * TUNE.boardLeanRoll;
  assert.ok(underside - drop - wheelTop > 0, "no wheelbite at full lean");
});

test("the standing platform sits low between the trucks", () => {
  assert.ok(deckTop(0, 0) < deckTop(0, D.wheelbase / 2), "rocker lowers the centre");
  assert.ok(deckTop(0.12, 0) > deckTop(0, 0), "concave lifts the rails");
  assert.ok(deckTop(0, 0) < 0.11, "a drop-through deck rides close to the road");
});

// --- Handling --------------------------------------------------------------

const flat = new THREE.Vector3(0, 1, 0);
const input = (overrides: Partial<Parameters<LongboardMotion["ride"]>[1]> = {}) => ({
  steer: 0,
  push: false,
  pushHeld: false,
  brake: 0,
  tuck: 0,
  slide: 0,
  ...overrides,
});
function run(seconds: number, speed: number, make: (t: number) => ReturnType<typeof input>) {
  const board = new LongboardMotion(),
    velocity = new THREE.Vector3(0, 0, speed);
  let yaw = 0;
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    const step = board.ride(dt, make(t), velocity, yaw, flat, 0);
    yaw = step.yaw;
  }
  return { board, velocity, yaw };
}

test("a full lean draws a tight arc slowly and a long steady one at speed", () => {
  const slow = run(1, 3, () => input({ steer: 1 }));
  const fast = run(1, 11, () => input({ steer: 1 }));
  const radius = (r: ReturnType<typeof run>, v: number) => v / Math.max(1e-6, Math.abs(r.yaw) / 1);
  assert.ok(radius(slow, 3) < 4, `slow radius ${radius(slow, 3)}`);
  assert.ok(radius(fast, 11) > 8, `fast radius ${radius(fast, 11)}`);
});

test("carving turns momentum instead of deleting it", () => {
  const coast = run(2, 7, () => input()),
    carve = run(2, 7, () => input({ steer: 1 }));
  const lost = coast.velocity.length() - carve.velocity.length();
  assert.ok(Math.abs(carve.yaw) > 1, "the board actually turned");
  assert.ok(lost < 0.5, `a two second carve should cost little extra speed, lost ${lost}`);
});

test("a tuck only lowers drag and never accelerates on flat ground", () => {
  const standing = run(3, 12, () => input()),
    tucked = run(3, 12, () => input({ tuck: 1 }));
  assert.ok(tucked.velocity.length() > standing.velocity.length());
  assert.ok(tucked.velocity.length() < 12);
});

test("pushing can never exceed its ceiling", () => {
  const pushed = run(60, 0, () => input({ pushHeld: true }));
  assert.ok(pushed.velocity.length() <= TUNE.boardPushMaxSpeed);
  assert.ok(pushed.velocity.length() > 4, `pushing should reach a cruising pace, got ${pushed.velocity.length()}`);
});

test("the foot brake stops the board predictably", () => {
  const braked = run(4, 8, () => input({ brake: 1 }));
  assert.ok(braked.velocity.length() < 0.2, `speed after braking ${braked.velocity.length()}`);
});

test("a slide swings the board across its travel and scrubs speed", () => {
  const slid = run(0.6, 10, () => input({ steer: 1, slide: 1 }));
  const travelYaw = Math.atan2(slid.velocity.x, slid.velocity.z);
  const across = Math.abs(Math.sin(slid.yaw - travelYaw));
  assert.ok(across > 0.6, `board should be well across its travel, got ${across}`);
  const coast = run(0.6, 10, () => input());
  assert.ok(slid.velocity.length() < coast.velocity.length() - 1.5);
  // RB alone, or a slide below its minimum speed, does nothing.
  assert.equal(run(0.6, 10, () => input({ slide: 1 })).board.slideSide, 0);
  assert.equal(run(0.6, 2, () => input({ steer: 1, slide: 1 })).board.slideSide, 0);
});
