import test from "node:test";
import assert from "node:assert/strict";
import { DISTRICTS, HIDDEN_SPOTS, RIDE_SPEED, SPOTS, TRAVEL_TARGETS, districtOf, pathLength, routeBetween, toWorld } from "../src/data/world";
import { MAPS } from "../src/data/maps";
import { CHURCH_SPAWNS } from "../src/park/church";
import { B_HILL_SPAWNS } from "../src/park/bhill";
import { outdoorSpawns } from "../src/park/outdoor";

const seconds = (a: Parameters<typeof routeBetween>[0], b: Parameters<typeof routeBetween>[1]) => pathLength(routeBetween(a, b)) / RIDE_SPEED;
const within = (t: number, [lo, hi]: readonly [number, number]) => t >= lo && t <= hi;

test("the streets between districts land on the owner's ride-time targets", () => {
  const vc = seconds("veterans", "church"), cb = seconds("church", "b_hill"), bv = seconds("b_hill", "veterans");
  assert.ok(within(vc, TRAVEL_TARGETS["veterans-church"]), `Veterans to Church ${vc.toFixed(0)} s`);
  assert.ok(within(cb, TRAVEL_TARGETS["church-b_hill"]), `Church to B Hill ${cb.toFixed(0)} s`);
  assert.ok(within(bv, TRAVEL_TARGETS["b_hill-veterans"]), `B Hill to Veterans ${bv.toFixed(0)} s`);
  assert.ok(within(vc + cb + bv, TRAVEL_TARGETS.loop), `loop ${(vc + cb + bv).toFixed(0)} s`);
  // Routes are the same either way round.
  assert.ok(Math.abs(seconds("church", "veterans") - vc) < 1e-9 && Math.abs(seconds("veterans", "b_hill") - bv) < 1e-9);
});

test("the Church sits north of Veterans on Buchanan; Veterans is the world origin", () => {
  const v = DISTRICTS.find((d) => d.id === "veterans")!, c = DISTRICTS.find((d) => d.id === "church")!;
  assert.deepEqual(v.origin, { x: 0, z: 0 });
  assert.ok(c.origin.z < v.origin.z, "north is -z");
  assert.deepEqual(toWorld("church", 3, 4), { x: 3, z: c.origin.z + 4 });
});

test("every fast-travel spot names a real map and spawn; the list is Boulder City's", () => {
  const spawns: Record<string, unknown[]> = { church: CHURCH_SPAWNS, b_hill: B_HILL_SPAWNS, outdoor: outdoorSpawns };
  for (const s of [...SPOTS, ...HIDDEN_SPOTS]) {
    assert.ok(MAPS.some((m) => m.id === s.map), s.id);
    if (spawns[s.map]) assert.ok(s.spawn >= 0 && s.spawn < spawns[s.map].length, s.id);
    assert.equal(districtOf(s.map)?.id, s.district);
  }
  // #100: only Boulder City, NV (Veterans and its east grounds) is on the list.
  assert.deepEqual(SPOTS.map((s) => s.label), ["VETERANS MEMORIAL PARK", "BMX TRACK", "LAKESIDE DRIVE / FIELD", "LAKE / DIVE DOCK"]);
  for (const s of SPOTS) assert.equal(outdoorSpawns[s.spawn].name.split(" ")[0], s.label.split(" ")[0] === "VETERANS" ? "WOOD" : s.label.split(" ")[0], s.id);
  assert.equal(CHURCH_SPAWNS[HIDDEN_SPOTS.find((s) => s.id === "church-interior")!.spawn].name, "SANCTUARY");
  assert.equal(B_HILL_SPAWNS[HIDDEN_SPOTS.find((s) => s.id === "b_hill-bottom")!.spawn].name, "B HILL / RUNOUT");
});
