import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { blendPose } from '../src/network/pose-blend';

// Remote riders and replays render from captured poses. A body flip needs the
// Simulation's flip frame: a snapshot has no methods, so blendPose rebuilds them.
const channel = (angle = 0) => ({ angle, velocity: 0, mismatch: 0, reversals: [], reversalAge: 1 });
const pose = (over: Record<string, unknown> = {}) => ({
  position: [0, 1, 0], yaw: 0.3, pitch: 0, roll: 0, elapsed: 1,
  bodyFlip: { active: true, angle: 1.2, velocity: 4, basePitch: -0.4 }, flipYaw0: 0.25, flipRoll0: 0.05,
  tricks: { yaw: 0, deck: channel(), bars: channel(), bri: channel(), kickless: channel(), decade: channel() },
  manual: { active: false, pitch: 0, nose: false }, dropIn: { phase: null, lean: 0 }, ...over,
});

test('a flipping rider gets the same orientation the Simulation computes', () => {
  const p = blendPose(pose(), pose(), 0) as any;
  const frame = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0.25, 0.05, 'YXZ'));
  const expected = frame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.2)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3 - 0.25));
  assert.ok(p.flipFrame().angleTo(frame) < 1e-6);
  assert.ok(p.flipOrientation(0.3).angleTo(expected) < 1e-6);
});

test('a snapshot from an older peer (no flip frame) still renders level', () => {
  const old = pose({ bodyFlip: { active: true, angle: 0.5, velocity: 1 }, flipYaw0: undefined, flipRoll0: undefined });
  const p = blendPose(old, old, 0) as any;
  assert.ok(Number.isFinite(p.flipOrientation().x));
  assert.equal(p.bodyFlip.basePitch, 0);
});

test('angles take the short way round; position and channels interpolate', () => {
  const a = pose({ yaw: Math.PI - 0.1 }), b = pose({ yaw: -Math.PI + 0.1, position: [2, 1, 0] });
  b.tricks.bri = channel(2);
  const p = blendPose(a, b, 0.5) as any;
  assert.ok(Math.abs(Math.abs(p.yaw) - Math.PI) < 1e-9, `${p.yaw}`);
  assert.ok(Math.abs(p.position.x - 1) < 1e-9);
  assert.ok(Math.abs(p.tricks.bri.angle - 1) < 1e-9);
});

test('swim, traversal and dive motion interpolate for remote riders', () => {
  const extra = (time: number) => ({
    swim: { time, stroke: time * 2, speed: 1, out: null },
    mantle: { kind: 'vault', time, duration: 1, edge: [1, 2, 3], forward: [0, 0, 1] },
    diveFlip: { angle: time, side: time * 2, twist: time * 3, dir: 1, sideDir: 1, twistDir: 1 },
  });
  const p = blendPose(pose(extra(0)), pose(extra(1)), .5) as any;
  assert.equal(p.swim.time,.5);assert.equal(p.swim.stroke,1);assert.equal(p.mantle.time,.5);
  assert.equal(p.diveFlip.angle,.5);assert.equal(p.diveFlip.side,1);assert.equal(p.diveFlip.twist,1.5);
  assert(p.mantle.edge instanceof THREE.Vector3);
});
