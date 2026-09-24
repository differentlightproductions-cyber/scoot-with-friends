import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
});

const { CATEGORIES, PARTS, defaultScooter } = await import("../src/data/scooterParts.ts");
const { loadProfile, PROFILE_KEY } = await import("../src/data/loadout.ts");
const { appearance } = await import("../src/network/protocol.ts");
const { LONGBOARD_PARTS, validLongboard, defaultLongboard } = await import("../src/data/longboardParts.ts");

test("scooters have a griptape slot with a free default and several designs", () => {
  assert(CATEGORIES.includes("griptape"));
  const tapes = PARTS.filter((p) => p.category === "griptape");
  assert(tapes.length >= 4);
  const standard = defaultScooter().griptape;
  const part = tapes.find((p) => p.id === standard.partId)!;
  assert.equal(part.unlockType, "free");
  assert(tapes.some((p) => p.unlockType === "credit"), "at least one grip tape is sold for Credit");
  for (const p of tapes) assert(["plain", "stripe", "logo", "crown"].includes(p.shape));
});

test("an old save without griptape loads with the default sheet and keeps its other parts", () => {
  const old = defaultScooter() as Record<string, unknown>;
  delete old.griptape;
  old.deck = { partId: "street-deck", variantId: "blue" };
  store.set(PROFILE_KEY, JSON.stringify({ version: 3, scooter: old }));
  const profile = loadProfile();
  assert.deepEqual(profile.scooter.griptape, defaultScooter().griptape);
  assert.deepEqual(profile.scooter.deck, { partId: "street-deck", variantId: "blue" });
});

test("a saved griptape choice persists and an invalid one falls back", () => {
  const chosen = defaultScooter();
  chosen.griptape = { partId: "stripe-griptape", variantId: "black-blue" };
  store.set(PROFILE_KEY, JSON.stringify({ version: 3, scooter: chosen }));
  assert.deepEqual(loadProfile().scooter.griptape, chosen.griptape);
  chosen.griptape = { partId: "stripe-griptape", variantId: "no-such-colour" };
  store.set(PROFILE_KEY, JSON.stringify({ version: 3, scooter: chosen }));
  assert.deepEqual(loadProfile().scooter.griptape, defaultScooter().griptape);
});

test("network appearance from a client without griptape is accepted with the default", () => {
  const profile = loadProfile();
  const value = { avatar: profile.avatar, scooter: { ...profile.scooter } as Record<string, unknown> };
  delete value.scooter.griptape;
  const accepted = appearance(value);
  assert(accepted, "appearance without griptape must still be accepted");
  assert.deepEqual(accepted!.scooter.griptape, defaultScooter().griptape);
  value.scooter.griptape = { partId: "logo-griptape", variantId: "smoke-red" };
  assert.deepEqual(appearance(value)!.scooter.griptape, value.scooter.griptape);
});

test("longboard grip comes in several colours and validates", () => {
  const grip = LONGBOARD_PARTS.find((p) => p.category === "grip")!;
  assert(grip.variants.length >= 4);
  const board = defaultLongboard();
  board.grip = { partId: grip.id, variantId: "sand" };
  assert.deepEqual(validLongboard(board).grip, board.grip);
});

test("griptape is cosmetic: physics never reads it", () => {
  for (const file of ["src/physics/simulation.ts", "src/longboard/motion.ts", "src/grind/grind.ts", "src/core/config.ts"])
    assert(!/griptape|\.grip\b/i.test(readFileSync(file, "utf8")), `${file} must not depend on grip tape`);
});

test("appearance tells other players which rideable and board to show", async () => {
  const { pose } = await import("../src/network/protocol.ts");
  const profile = { ...loadProfile() } as Record<string, any>;
  const board = defaultLongboard();
  board.deck = { partId: board.deck.partId, variantId: "palms" };
  const shared = appearance({ ...profile, activeRideable: "longboard", longboard: board })!;
  assert.equal(shared.rideable, "longboard");
  assert.deepEqual(shared.longboard.deck, board.deck);
  // An older client sends neither: others see the scooter and a default board.
  const legacy = appearance({ ...profile, activeRideable: undefined, longboard: undefined })!;
  assert.equal(legacy.rideable, "scooter");
  assert.deepEqual(legacy.longboard, defaultLongboard());
  // A pose carries the rideable and the board's lean/slide state through the server filter.
  const channel = { angle: 0, velocity: 0, mismatch: 0 };
  const full = {
    position: [0, 0, 0], state: "Grounded", yaw: 0, pitch: 0, roll: 0, speed: 0, elapsed: 0, charge: 0, compression: 0, getUpTimer: 0, landTimer: 0,
    landingCompression: 0, popTimer: 0, pushTimer: 0, rampLean: 0, steer: 0, bodyFlip: { angle: 0, velocity: 0 }, airWeight: { shift: 0 },
    manual: { pitch: 0 }, dropIn: {}, tricks: { stance: "regular", naturalDirection: 1, poseBlend: 0, poseSide: 1, fingerTime: 0, fingerHand: 1, deck: channel, bars: channel, bri: channel, kickless: channel },
  };
  assert.equal(pose({ ...full, rideable: "hoverboard" }), null, "only real rideables pass");
  const filtered = pose({ ...full, rideable: "longboard", board: { lean: 0.4, slide: 0.2, surfaceRoll: 0.1, travel: 1 }, wallet: 99 })!;
  assert.equal(filtered.rideable, "longboard");
  assert.equal(filtered.board.lean, 0.4);
  assert.equal((filtered as Record<string, unknown>).wallet, undefined);
});
