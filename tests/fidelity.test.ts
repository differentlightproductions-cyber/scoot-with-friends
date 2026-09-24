import test from 'node:test';
import assert from 'node:assert/strict';
import { fidelityPixelRatio } from '../src/render/fidelity';

test('graphics presets render at three different resolutions on 1x, 2x and 3x screens', () => {
  for (const device of [1, 2, 3]) {
    const [low, medium, high] = (['low', 'medium', 'high'] as const).map(q => fidelityPixelRatio(q, device));
    assert.ok(low < medium && medium < high, `${device}x: ${low} < ${medium} < ${high}`);
    assert.ok(high <= 2);
  }
  assert.equal(fidelityPixelRatio('medium', 1), 1);
});
