// The real moon (#74): phase and place from art/moon.ts against known dates.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { moonAt, moonSky, sunForPhase } from "../src/art/moon";

test("new moon of the April 8, 2024 total solar eclipse: dark, and in front of the sun", () => {
  const at = new Date("2024-04-08T18:21:00Z"), m = moonAt(at);
  assert.ok(m.illumination < 0.01, `illumination ${m.illumination}`);
  assert.equal(m.name, "New moon");
  // From Texas, totality: the moon covered the sun.
  const sky = moonSky(new Date("2024-04-08T18:40:00Z"), 32.9, -97.0);
  assert.ok(sky.moon.angleTo(sky.sun) < THREE.MathUtils.degToRad(1), `apart ${THREE.MathUtils.radToDeg(sky.moon.angleTo(sky.sun))} deg`);
  assert.ok(sky.moon.y > 0.5, "high in the sky at midday");
});

test("full moon of April 23, 2024 and first quarter of April 15", () => {
  const full = moonAt(new Date("2024-04-23T23:49:00Z"));
  assert.ok(full.illumination > 0.99, `full ${full.illumination}`);
  assert.equal(full.name, "Full moon");
  const quarter = moonAt(new Date("2024-04-15T19:13:00Z"));
  assert.ok(Math.abs(quarter.illumination - 0.5) < 0.04, `quarter ${quarter.illumination}`);
  assert.ok(quarter.waxing);
  assert.equal(quarter.name, "First quarter");
  const waning = moonAt(new Date("2024-05-01T11:27:00Z"));
  assert.ok(!waning.waxing && Math.abs(waning.illumination - 0.5) < 0.04, `last quarter ${waning.illumination}`);
  // A synodic month later it is full again.
  assert.ok(moonAt(new Date("2024-05-23T13:53:00Z")).illumination > 0.99);
});

test("the full moon rises in the east at sunset in Boulder City", () => {
  // Sept 17, 2024 full moon; moonrise about 6:45 pm PDT (01:45 UTC on the 18th), sunset about 6:45 pm.
  const sky = moonSky(new Date("2024-09-18T02:30:00Z"), 35.978, -114.832);
  assert.ok(sky.moon.y > 0 && sky.moon.y < 0.35, `low: ${sky.moon.y}`);
  assert.ok(sky.moon.x > 0.8, `east (+x): ${sky.moon.x}`);
  assert.ok(sky.sun.y < 0 && sky.sun.x < -0.5, "sun down in the west");
});

test("sunForPhase puts the sun at the phase's angle on the right side", () => {
  const moon = new THREE.Vector3(0.35, 0.72, -0.6).normalize();
  for (const [elongation, waxing] of [[90, true], [30, false], [170, true]] as const) {
    const sun = sunForPhase(moon, { elongation, waxing });
    assert.ok(Math.abs(THREE.MathUtils.radToDeg(moon.angleTo(sun)) - elongation) < 0.5);
    assert.ok(waxing ? sun.x < moon.x : sun.x > moon.x, "west of a waxing moon, east of a waning one");
  }
});
