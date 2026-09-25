import test from "node:test";
import assert from "node:assert/strict";
import { StreetPlan, CURB, FACE, GUTTER } from "../src/park/streets";
import { VETERANS_STREETS, VETERANS_BOUNDS } from "../src/park/memorial";

// #87: streets lie a curb below the park, with gutter pans, curbs traced round
// them (and round islands in them), and ramps cut into the walks.
const plan = new StreetPlan(
  [{ x0: 0, x1: 10, z0: 0, z1: 20 }],
  [{ x0: 4, x1: 6, z0: 8, z1: 12 }],
  [{ axis: "z", at: 0, from: 14, to: 16, dir: -1, run: 1.5 }],
);

test("streets sit a curb below the park, falling to each curb across the gutter", () => {
  assert.equal(plan.offset(-3, 5), 0);
  assert.equal(plan.offset(2, 5), -CURB);
  assert.ok(Math.abs(plan.offset(0.01, 5) + FACE) < 0.002, "flowline at the face");
  assert.ok(Math.abs(plan.offset(GUTTER / 2, 5) + CURB + (FACE - CURB) / 2) < 0.002, "halfway down the pan");
  assert.equal(plan.offset(5, 10), 0, "the island is at the park's level");
});

test("curbs are traced round the street and its island, facing the high side", () => {
  const find = (axis: string, at: number) => plan.curbs.filter((c) => c.axis === axis && c.at === at);
  assert.deepEqual(find("z", 0).map((c) => [c.from, c.to, c.dir]), [[0, 20, -1]]);
  assert.deepEqual(find("z", 10).map((c) => [c.from, c.to, c.dir]), [[0, 20, 1]]);
  assert.deepEqual(find("x", 8).map((c) => [c.from, c.to, c.dir]), [[4, 6, 1]], "island's near side, high side into the island");
  assert.equal(plan.curbs.length, 8);
});

test("a ramp runs from the gutter up to the walk, and its flares fade out", () => {
  assert.ok(Math.abs(plan.offset(-0.01, 15) + FACE) < 0.01, "foot of the ramp");
  assert.ok(Math.abs(plan.offset(-0.75, 15) + FACE / 2) < 0.01, "halfway up");
  assert.equal(plan.offset(-1.6, 15), 0, "the walk behind it");
  const flare = plan.offset(-0.01, 16.3);
  assert.ok(flare < 0 && flare > -FACE, "the flare is part way down");
  assert.equal(plan.offset(-0.01, 17), 0, "past the flare");
});

test("riding up into a curb crosses its full face; a ramp crosses none; riding off crosses nothing", () => {
  assert.ok(Math.abs(plan.curbCrossed(0.3, 5, -0.3, 5) - FACE) < 1e-6);
  assert.ok(plan.curbCrossed(0.3, 15, -0.3, 15) < 0.01);
  assert.equal(plan.curbCrossed(-0.3, 5, 0.3, 5), 0);
  assert.equal(plan.curbCrossed(2, 5, 3, 5), 0);
});

test("the ground splits into flat pieces that cover the bounds exactly once", () => {
  const bounds = { x0: -5, x1: 15, z0: -5, z1: 25 };
  const pieces = plan.pieces(bounds);
  const area = pieces.reduce((a, p) => a + (p.rect.x1 - p.rect.x0) * (p.rect.z1 - p.rect.z0), 0);
  assert.ok(Math.abs(area - 20 * 30) < 1e-6);
  for (const p of pieces) {
    const cx = (p.rect.x0 + p.rect.x1) / 2, cz = (p.rect.z0 + p.rect.z1) / 2;
    assert.ok(p.top <= plan.offset(cx, cz) + 1e-9, "never above the ground it carries");
  }
});

test("Veterans: the lot and both streets are sunk, with the lot's curbs and island curbs", () => {
  assert.equal(VETERANS_STREETS.offset(103, 0), -CURB);
  assert.equal(VETERANS_STREETS.offset(20, -70), -CURB);
  assert.equal(VETERANS_STREETS.offset(97.5, 0), 0);
  assert.equal(VETERANS_STREETS.offset(24, -77), 0, "a planted island");
  assert.ok(VETERANS_STREETS.curbs.some((c) => c.axis === "x" && c.at === -49 && c.from === -38 && c.to === 92));
  assert.ok(VETERANS_STREETS.pieces(VETERANS_BOUNDS).length < 200, "a modest number of colliders");
  const lines = VETERANS_STREETS.gutterLines({ catchment: () => 4.5 });
  assert.ok(lines.length >= 8 && lines.every((l) => l.inlets.length >= 1 && l.points.length === l.across.length));
});
