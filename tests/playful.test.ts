import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PlayfulRules, lobVelocity, shoveStrength, type PlayfulHit, type PlayfulTarget } from "../src/social/playful";

const target = (id: string, kind: PlayfulTarget["kind"] = "npc"): PlayfulTarget => ({ id, kind, position: new THREE.Vector3(), radius: 0.4, height: 1.75, receive: () => true });
const hit = (source: string, kind: PlayfulHit["kind"], strength: PlayfulHit["strength"]): PlayfulHit => ({ kind, source, strength, from: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0) });

test("anti-grief: shove cooldown, recovery immunity after a stumble, spawn grace", () => {
  const rules = new PlayfulRules(), npc = target("npc-1");
  assert.equal(rules.allow(npc, hit("local", "shove", "stumble")), "stumble");
  rules.landed(npc, "stumble");
  assert.equal(rules.allow(npc, hit("local", "shove", "push")), null, "the same shove again straight away");
  rules.update(PlayfulRules.SHOVE_COOLDOWN + 0.1);
  assert.equal(rules.allow(npc, hit("local", "shove", "push")), "cosmetic", "still recovering from the stumble");
  rules.update(PlayfulRules.RECOVERY);
  assert.equal(rules.allow(npc, hit("local", "shove", "push")), "push");
  rules.spawned("npc-1");
  assert.equal(rules.allow(npc, hit("local", "throw", "flinch")), "cosmetic", "just respawned");
  assert.equal(rules.allow(npc, hit("npc-1", "throw", "flinch")), null, "nobody hits themselves");
});

test("PLAYFUL CONTACT: off or friends-only softens hits on the local player to cosmetic", () => {
  const rules = new PlayfulRules(), me = target("local", "local");
  assert.equal(rules.allow(me, hit("npc-2", "throw", "flinch")), "flinch");
  rules.contact = "off";
  assert.equal(rules.allow(me, hit("npc-2", "throw", "flinch")), "cosmetic");
  rules.contact = "friends";
  assert.equal(rules.allow(me, hit("npc-2", "throw", "flinch"), false), "cosmetic");
  assert.equal(rules.allow(me, hit("npc-2", "throw", "flinch"), true), "flinch");
  // Contact settings are about what reaches you; your own throws at others still land.
  rules.contact = "off";
  assert.equal(rules.allow(target("npc-3"), hit("local", "throw", "flinch")), "flinch");
});

test("a lob reaches its target in the time asked; shoves stay playful", () => {
  const from = new THREE.Vector3(0, 1.45, 0), to = new THREE.Vector3(8, 1.1, -6), time = 0.8, g = 9.81;
  const v = lobVelocity(from, to, time, g);
  const at = from.clone().addScaledVector(v, time).add(new THREE.Vector3(0, -0.5 * g * time * time, 0));
  assert.ok(at.distanceTo(to) < 1e-9);
  assert.equal(shoveStrength(0.5), "push");
  assert.equal(shoveStrength(5), "stumble");
});
