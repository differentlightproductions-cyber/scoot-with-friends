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
  const base = { riderId: "", bodyBuild: "regular", outfit: {} as Record<string, string>, scooter: defaultScooter() as Record<string, unknown> };
  const riders = readFileSync("src/data/riders.ts", "utf8");
  const riderId = /id:\s*["']([^"']+)["']/.exec(riders)?.[1];
  const profile = loadProfile();
  const value = { ...base, riderId: profile.riderId ?? riderId, bodyBuild: profile.bodyBuild, outfit: profile.outfit, scooter: { ...profile.scooter } as Record<string, unknown> };
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
