import * as THREE from 'three';
import type { AvatarDetail } from '../avatar/avatar';
import { randomAvatar } from '../avatar/config';
import { standingAvatar } from '../avatar/standing';

/** Deterministic random numbers, so each visitor looks the same every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standing park visitor: the same avatar and drivers as a rider, in a relaxed idle pose. */
function visitor(seed: number, detail: AvatarDetail) {
  return standingAvatar(randomAvatar(seeded(seed)), detail, (seeded(seed * 7)() - 0.5) * 0.6).rider;
}

export function addParkPeople(scene: THREE.Scene) {
  for (const [i, x, z] of [[0, 31, -37], [1, 34, -37], [2, -26, 32], [3, 88, 29], [4, 28, -109], [5, -36, -65]]) {
    const lod = new THREE.LOD();
    lod.position.set(x, 0, z);
    lod.rotation.y = i * 1.7;
    lod.name = 'Park visitor / avatar';
    lod.addLevel(visitor(101 + i * 13, 'high'), 0);
    lod.addLevel(visitor(101 + i * 13, 'low'), 24);
    lod.addLevel(new THREE.Group(), 80);
    scene.add(lod);
  }
}
