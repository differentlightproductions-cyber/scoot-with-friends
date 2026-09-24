import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayBuffer, REPLAY_HISTORY, frameAt, packPose } from '../src/replay/buffer';

// The replay history (#41): 15/30/45/60 s of rider state at 30 Hz, flat memory.
const pose = (t: number) => ({ position: [t * 3.123456789, 0.5, -t], yaw: t * 0.1, tricks: { bri: { angle: t } } });

test('each history length keeps that many seconds at 30 samples a second', () => {
  for (const history of REPLAY_HISTORY) {
    const b = new ReplayBuffer(); b.history = history;
    for (let i = 0; i <= 90 * 120; i++) { const t = i / 120; b.record(t, () => pose(t), 'third'); }
    assert.ok(Math.abs(b.duration - history) < 0.05, `${history}: ${b.duration}`);
    assert.ok(Math.abs(b.samples.length - history * 30) <= 2, `${history}: ${b.samples.length} samples`);
  }
});

test('memory stays flat over a long session and a 60 s history is small', () => {
  const b = new ReplayBuffer(); b.history = 60;
  let at60 = 0;
  for (let i = 0; i <= 600 * 60; i++) { const t = i / 60; b.record(t, () => pose(t), 'first'); if (i === 120 * 60) at60 = b.bytes; }
  assert.ok(b.bytes < at60 * 1.2, `${b.bytes} vs ${at60}`);
  assert.ok(b.bytes < 1_000_000);
});

test('a capture is a copy; recording goes on; a new session restarts the history', () => {
  const b = new ReplayBuffer(); b.history = 15;
  for (let i = 0; i <= 20 * 60; i++) b.record(i / 60, () => pose(i / 60), 'third');
  const clip = b.snapshot({ map: 'outdoor', layout: null, rideable: 'scooter', appearance: {} });
  const before = clip.frames.length;
  for (let i = 1; i <= 60; i++) b.record(20 + i / 60, () => pose(20 + i / 60), 'third');
  assert.equal(clip.frames.length, before, 'the clip did not grow');
  assert.ok(clip.frames[0].t >= 5 - 0.05 && clip.frames.at(-1)!.t <= 20 + 1e-9);
  b.record(0.5, () => pose(0.5), 'third');
  assert.equal(b.samples.length, 1, 'the clock went back: a new history');
});

test('numbers are packed to 4 decimals; frames interpolate by time', () => {
  assert.equal(packPose({ x: 1.23456789 }), '{"x":1.2346}');
  const frames = [0, 1, 2].map((t) => ({ t, pose: '{}', view: 'third' as const }));
  const at = frameAt(frames, 1.25)!;
  assert.equal(at.a.t, 1); assert.equal(at.b.t, 2); assert.ok(Math.abs(at.k - 0.25) < 1e-9);
  assert.equal(frameAt(frames, -1)!.a.t, 0); assert.equal(frameAt(frames, 9)!.a.t, 2);
});
