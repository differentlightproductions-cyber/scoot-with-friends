import test from 'node:test';
import assert from 'node:assert/strict';
import { HoldButton, PHONE_HOLD } from '../src/phone/hold';

test('phone hold: fires once between 450 and 650 ms, never for a tap, never repeats', () => {
  assert.ok(PHONE_HOLD >= 0.45 && PHONE_HOLD <= 0.65);
  const hold = new HoldButton(), dt = 1 / 60;
  // A tap: 0.2 s down, released.
  let fired = 0;
  for (let t = 0; t < 0.2; t += dt) fired += +hold.update(true, dt);
  hold.update(false, dt);
  assert.equal(fired, 0, 'a tap does not open the phone');
  // A long hold: exactly one fire, at the threshold.
  let at = -1;
  for (let i = 0; i < 180; i++) if (hold.update(true, dt)) { assert.equal(at, -1, 'fires once per press'); at = (i + 1) * dt; }
  assert.ok(at >= PHONE_HOLD - dt && at <= PHONE_HOLD + dt, 'fires at the threshold, got ' + at);
  // Released and held again: a fresh gesture.
  hold.update(false, dt);
  let again = 0;
  for (let i = 0; i < 60; i++) again += +hold.update(true, dt);
  assert.equal(again, 1);
});
