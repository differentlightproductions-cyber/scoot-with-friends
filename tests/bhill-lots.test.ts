// B Hill's houses (#89): lots on both sides of the photo's road, clear of the
// road, the side streets and each other, every driveway rideable.
import test from "node:test";
import assert from "node:assert/strict";
import { B_HILL_LENGTH, B_HILL_STREETS, bHillHeight, bHillLots, bHillSurface, routePose } from "../src/park/bhill";
import { cellsAround, planHouse } from "../src/art/houses";

const lots = bHillLots();
const frame = (l: (typeof lots)[number]) => {
  const ax = Math.cos(l.yaw), az = -Math.sin(l.yaw), fx = Math.sin(l.yaw), fz = Math.cos(l.yaw);
  return { ax, az, fx, fz, at: (u: number, v: number) => [l.x + ax * u + fx * v, l.z + az * u + fz * v] as const };
};

test("houses line both sides of the whole road", () => {
  assert.ok(lots.length >= 80, `${lots.length} lots`);
  for (const side of [-1, 1]) {
    const s = lots.filter((l) => l.side === side).map((l) => l.s).sort((a, b) => a - b);
    assert.ok(s.length >= 35, `side ${side}: ${s.length}`);
    assert.ok(s[0] < 90 && s[s.length - 1] > B_HILL_LENGTH - 120, `side ${side} spans ${s[0].toFixed(0)}-${s[s.length - 1].toFixed(0)}`);
    // Gaps only where a side street or the hangout needs the room.
    for (let i = 1; i < s.length; i++) assert.ok(s[i] - s[i - 1] < 70, `gap ${s[i - 1].toFixed(0)}-${s[i].toFixed(0)} on side ${side}`);
  }
});

test("lots never overlap one another and stay off the road and side streets", () => {
  for (const l of lots) {
    const { at } = frame(l);
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1]]) {
      const [x, z] = at((u * l.LW) / 2, (v * l.LD) / 2);
      assert.notEqual(bHillSurface(x, z), "shoulder", `lot at ${l.s.toFixed(0)} reaches the shoulder`);
      for (const st of B_HILL_STREETS) {
        const t = (x - st.x) * st.dx + (z - st.z) * st.dz, u2 = (x - st.x) * -st.dz + (z - st.z) * st.dx;
        assert.ok(!(t > 0 && t < st.length && Math.abs(u2) < 4), `lot at ${l.s.toFixed(0)} is on the ${st.id} street`);
      }
    }
  }
  // Separating axes between every nearby pair.
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) {
    const a = lots[i], b = lots[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 60) continue;
    const A = frame(a), B = frame(b), dx = b.x - a.x, dz = b.z - a.z;
    const separated = [[A.ax, A.az], [A.fx, A.fz], [B.ax, B.az], [B.fx, B.fz]].some(([ux, uz]) => {
      const ra = (a.LW / 2) * Math.abs(A.ax * ux + A.az * uz) + (a.LD / 2) * Math.abs(A.fx * ux + A.fz * uz);
      const rb = (b.LW / 2) * Math.abs(B.ax * ux + B.az * uz) + (b.LD / 2) * Math.abs(B.fx * ux + B.fz * uz);
      return Math.abs(dx * ux + dz * uz) > ra + rb;
    });
    assert.ok(separated, `lots at ${a.s.toFixed(0)} and ${b.s.toFixed(0)} overlap`);
  }
});

test("driveways climb smoothly from the shoulder's edge to the garage, under 22%", () => {
  for (const l of lots) {
    const { at } = frame(l);
    const run = l.LD / 2 + l.reach - l.door, rise = Math.abs(l.tilt) * l.drive;
    assert.ok((l.pad - l.foot + rise) / run < 0.22 && l.pad >= l.foot + rise, `lot at ${l.s.toFixed(0)}: ${(l.pad - l.foot + rise).toFixed(2)} m over ${run.toFixed(1)} m`);
    // Its foot twists to the street's fall across it, so both corners meet the shoulder.
    for (const u of [-1, 1]) {
      const corner = bHillHeight(...at(l.gx + u * (l.drive - 0.05), l.LD / 2 + l.reach - 0.05));
      const [cx, cz] = at(l.gx + u * (l.drive - 0.05), l.LD / 2 + l.reach + 0.3);
      assert.ok(Math.abs(corner - bHillHeight(cx, cz)) < 0.08, `drive corner at ${l.s.toFixed(0)}: ${(corner - bHillHeight(cx, cz)).toFixed(3)}`);
    }
    // The ground follows the slab: level with the garage floor at the top, the street at the foot.
    const top = bHillHeight(...at(l.gx, l.door + 0.3)), foot = bHillHeight(...at(l.gx, l.LD / 2 + l.reach - 0.1));
    assert.ok(Math.abs(top - (l.pad - (l.pad - l.foot) * (0.3 / run))) < 0.02, `drive top at ${l.s.toFixed(0)}`);
    assert.ok(Math.abs(foot - l.foot) < 0.03, `drive foot at ${l.s.toFixed(0)}`);
    assert.equal(bHillSurface(...at(l.gx, l.LD / 2 + 0.5)), "road");
    // Along the shoulder past a driveway the ground is one flush surface: no step onto the apron.
    const road = routePose(l.s), across = l.side * (4.6 + 1.9), ax = Math.cos(road.yaw), az = -Math.sin(road.yaw), tx = Math.sin(road.yaw), tz = Math.cos(road.yaw);
    let prev = null as number | null;
    for (let d = -10; d <= 10; d += 0.5) {
      const y = bHillHeight(road.x + ax * across + tx * d, road.z + az * across + tz * d);
      if (prev !== null) assert.ok(Math.abs(y - prev) < 0.12, `shoulder step by the lot at ${l.s.toFixed(0)}: ${(y - prev).toFixed(3)}`);
      prev = y;
    }
  }
});

test("the ground stays under every yard (the pad carries the rider); pools go down to their floor", () => {
  for (const l of lots.slice(0, 40)) {
    const { at } = frame(l);
    const yard = bHillHeight(...at(-Math.sign(l.gx || 1) * (l.LW / 2 - 1), 0));
    assert.ok(yard <= l.pad - 0.1, `yard at ${l.s.toFixed(0)}: ${(yard - l.pad).toFixed(2)}`);
    if (l.pool) assert.ok(bHillHeight(...at(l.pool.x, l.pool.z)) < l.pad - 1.3);
  }
});

test("the retaining pad splits round the driveway notch and the pool", () => {
  const plan = planHouse(1234);
  const notch = { x: plan.gx, z: (plan.door + plan.LD / 2) / 2, w: plan.drive * 2, l: plan.LD / 2 - plan.door };
  const pool = { x: 0, z: -plan.LD / 2 + 4, w: 6, l: 3 };
  const cells = cellsAround(plan.LW, plan.LD, [notch, pool]);
  const area = cells.reduce((sum, c) => sum + c.w * c.l, 0);
  assert.ok(Math.abs(area - (plan.LW * plan.LD - notch.w * notch.l - pool.w * pool.l)) < 1e-6);
  const inside = (c: (typeof cells)[number], h: typeof pool) => Math.abs(c.x - h.x) < (c.w + h.w) / 2 - 1e-6 && Math.abs(c.z - h.z) < (c.l + h.l) / 2 - 1e-6;
  assert.ok(cells.every((c) => !inside(c, notch) && !inside(c, pool)));
  assert.ok(cells.length <= 10, `${cells.length} cells`);
});

test("the side streets leave from the road on the riders' left", () => {
  for (const st of B_HILL_STREETS) {
    const p = routePose(st.s), left = [Math.cos(p.yaw), -Math.sin(p.yaw)];
    assert.ok(st.dx * left[0] + st.dz * left[1] > 0.9, `${st.id} leaves on the left`);
    assert.equal(bHillSurface(st.x + st.dx * 25, st.z + st.dz * 25), "road");
  }
});
