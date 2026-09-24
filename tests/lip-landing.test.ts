import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { TUNE, wrap } from "../src/core/config.ts";
import { classifyLanding, crookedLandingAngle, surfaceAxis } from "../src/player/landing.ts";

const deg = (radians: number) => (radians * 180) / Math.PI;
const heading = (yaw: number) => new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
// Back-quarter wall normal where a rider's centre sits 0.26 m inside the lip
// (quarter profile at 4.0 m of its 4.25 m run): a 68 degree wall.
const quarterWall = new Vector3(0, 0.372, -0.928).normalize();
const upWall = new Vector3(0, 1, 0).projectOnPlane(quarterWall).normalize();

test("the deck axis on flat ground and straight up a ramp is the heading", () => {
  for (const yaw of [0, 0.4, 1.7, -2.5, Math.PI]) {
    const flat = surfaceAxis(yaw, new Vector3(0, 1, 0));
    assert.ok(flat.distanceTo(heading(yaw)) < 1e-9, `flat yaw ${yaw}`);
  }
  // Heading straight at the wall: projecting and pitching agree.
  const straight = surfaceAxis(0, quarterWall);
  assert.ok(straight.distanceTo(heading(0).projectOnPlane(quarterWall).normalize()) < 1e-9);
});

test("across a steep wall the deck points near the fall line, not along the projected heading", () => {
  // Ridden 20 degrees off straight: the pitched deck stays near the fall line,
  // the projected heading swings most of the way to horizontal. The old landing
  // absorbed travel onto that projected line.
  const yaw = 0.349;
  const deck = surfaceAxis(yaw, quarterWall);
  const projected = heading(yaw).projectOnPlane(quarterWall).normalize();
  assert.ok(Math.abs(deck.dot(quarterWall)) < 1e-9, "deck lies on the wall");
  assert.ok(deg(deck.angleTo(upWall)) < 10, `deck ${deg(deck.angleTo(upWall)).toFixed(1)} deg off the fall line`);
  assert.ok(deg(projected.angleTo(upWall)) > 40, `projection ${deg(projected.angleTo(upWall)).toFixed(1)} deg off`);
  // The deck stays in the vertical plane of the heading, so its yaw is the rider's.
  assert.ok(Math.abs(wrap(Math.atan2(deck.x, deck.z) - yaw)) < 1e-9);
});

test("crooked angle equals the old flat measure on flat ground", () => {
  for (const [yaw, travelYaw, speed] of [[0, 0.5, 6], [1, 2.9, 4], [-2, 1.2, 9], [0.3, 0.3 + Math.PI, 5]]) {
    const velocity = heading(travelYaw).multiplyScalar(speed).setY(-4);
    const old = Math.min(Math.abs(wrap(yaw - travelYaw)), Math.abs(wrap(yaw - travelYaw + Math.PI)));
    assert.ok(Math.abs(crookedLandingAngle(velocity, new Vector3(0, 1, 0), yaw) - old) < 1e-9);
  }
  assert.equal(crookedLandingAngle(new Vector3(0.2, -8, 0.3), new Vector3(0, 1, 0), 1), 0);
});

test("an angled quarter air landing below the coping is judged against the deck and comes down", () => {
  // Measured: 11 m/s, 20 degrees, no air steering. Lateral 4.35 m/s along the
  // coping, falling 4.3 m/s, heading still 20 degrees off the wall.
  const velocity = new Vector3(4.35, -4.3, 0), yaw = 0.349;
  const angle = crookedLandingAngle(velocity, quarterWall, yaw);
  assert.ok(angle < TUNE.failAngle && angle > TUNE.goodAngle, `angle ${deg(angle).toFixed(1)}`);
  // The end of the deck the travel runs along points DOWN the wall, so the
  // landing turn can never send a descending rider back up over the coping.
  const along = velocity.clone().projectOnPlane(quarterWall);
  const axis = surfaceAxis(yaw, quarterWall);
  const end = axis.multiplyScalar(Math.sign(along.dot(axis)));
  assert.ok(end.y < -0.8, `travel end y ${end.y.toFixed(2)}`);
  // Sideways along the top of the wall with the deck up the wall is a slam.
  assert.ok(crookedLandingAngle(new Vector3(5.74, -0.62, 0), quarterWall, 0.698) > TUNE.failAngle);
  // Turned in the air to face along the coping (acceptance fixture Q03): clean.
  assert.ok(crookedLandingAngle(new Vector3(5.93, -3.44, 0), quarterWall, 1.706) < TUNE.cleanAngle);
});

test("the grade uses the surface crooked angle when it is given", () => {
  const f = { yaw: 0, velocityYaw: 0, speed: 7, impact: 6, deckAngle: 0, barAngle: 0, pitchError: 0, spinSpeed: 0 };
  assert.equal(classifyLanding({ ...f, crookedAngle: 1.4 }), "failed");
  assert.equal(classifyLanding({ ...f, crookedAngle: 0.65 }), "sketchy");
  assert.equal(classifyLanding({ ...f, yaw: 1.5, crookedAngle: 0 }), "clean");
  assert.equal(classifyLanding({ ...f, yaw: 1.5 }), "failed");
});
