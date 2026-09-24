import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOULDER_CITY, siderealHours, starDirection, StarField } from '../src/art/stars';

// The night sky (#44) is the real one over Boulder City: the game's compass puts
// north at -z and east at +x (phone/map.ts), and altitudes follow the latitude.
const deg = (v: number) => THREE.MathUtils.radToDeg(Math.asin(v));

test('sidereal time matches the J2000 epoch and the longitude', () => {
  const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
  assert.ok(Math.abs(siderealHours(j2000, 0) - 18.697) < 0.01);
  assert.ok(Math.abs(((siderealHours(j2000, BOULDER_CITY.lon) - (18.697 - 114.832 / 15)) % 24 + 24) % 24) < 0.01);
});

test('Polaris hangs due north at the latitude, whatever the hour', () => {
  for (const lst of [0, 6, 13.5, 21]) {
    const p = starDirection(2.53, 89.264, lst, BOULDER_CITY.lat);
    assert.ok(Math.abs(deg(p.y) - BOULDER_CITY.lat) < 1, `altitude ${deg(p.y)}`);
    assert.ok(p.z < -0.75 && Math.abs(p.x) < 0.02, `direction ${p.toArray()}`);
  }
});

test('Sirius culminates due south at 90 - latitude + declination; it rises in the east', () => {
  const s = starDirection(6.752, -16.716, 6.752, BOULDER_CITY.lat);
  assert.ok(Math.abs(deg(s.y) - (90 - BOULDER_CITY.lat - 16.716)) < 0.1, `altitude ${deg(s.y)}`);
  assert.ok(s.z > 0.7 && Math.abs(s.x) < 1e-6);
  const rising = starDirection(6.752, -16.716, 6.752 - 4, BOULDER_CITY.lat);
  assert.ok(rising.x > 0.5, 'four hours before it culminates, Sirius is in the east');
  const setting = starDirection(6.752, -16.716, 6.752 + 4, BOULDER_CITY.lat);
  assert.ok(setting.x < -0.5, 'and four hours after, in the west');
});

test('the star field holds the catalogue and a Milky Way, as unit directions', () => {
  const stars = new StarField();
  const pos = stars.points.geometry.getAttribute('position');
  assert.ok(pos.count > 1500, `${pos.count} stars`);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 97) assert.ok(Math.abs(v.fromBufferAttribute(pos, i).length() - 1) < 1e-5);
  stars.setVisibility(0);
  assert.equal(stars.points.visible, false);
  stars.dispose();
});
