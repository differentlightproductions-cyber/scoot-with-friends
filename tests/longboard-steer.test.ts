import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LongboardMotion } from '../src/longboard/motion';

// LS right must turn the direction of TRAVEL to the right (the chase camera
// looks along travel), riding normal or fakie, slow or fast. A right turn
// rotates the velocity clockwise seen from above: its heading angle
// atan2(x, z) goes down.
const up = new THREE.Vector3(0, 1, 0);
const travelAngle = (v: THREE.Vector3) => Math.atan2(v.x, v.z);
function carve(steer: number, speed: number, fakie: boolean, seconds = 1.2) {
  const board = new LongboardMotion();
  let yaw = 0.3;
  const heading = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const velocity = heading.clone().multiplyScalar(fakie ? -speed : speed);
  const start = travelAngle(velocity);
  let roll = 0;
  for (let t = 0; t < seconds; t += 1 / 120) {
    const ride = board.ride(1 / 120, { steer, push: false, pushHeld: false, brake: 0, tuck: 0, slide: 0 }, velocity, yaw, up, 0);
    yaw = ride.yaw; roll = ride.roll;
  }
  const turned = Math.atan2(Math.sin(travelAngle(velocity) - start), Math.cos(travelAngle(velocity) - start));
  return { turned, travel: board.travel, roll, edge: board.edge };
}

test('longboard: LS left/right turn the travel left/right, normal and fakie, at every speed', () => {
  for (const speed of [1.2, 5, 14]) for (const fakie of [false, true]) {
    const right = carve(1, speed, fakie), left = carve(-1, speed, fakie);
    const label = `${fakie ? 'fakie' : 'normal'} at ${speed} m/s`;
    assert.equal(right.travel, fakie ? -1 : 1, label + ' travel');
    assert.ok(right.turned < -0.02, `${label}: LS right turned ${right.turned.toFixed(3)} (should turn right)`);
    assert.ok(left.turned > 0.02, `${label}: LS left turned ${left.turned.toFixed(3)} (should turn left)`);
    // The deck leans on the edge that is inside the turn: the other edge when fakie.
    assert.equal(Math.sign(right.edge), fakie ? -1 : 1, label + ' edge');
    assert.equal(Math.sign(right.roll), Math.sign(right.edge), label + ' roll follows the edge');
  }
});
