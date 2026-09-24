import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  AVATAR_CHOICES, AVATAR_PRESETS, AVATAR_RANGES, BODY_TYPES, BOTTOMS, BROW_STYLES, EAR_STYLES, EYE_STYLES, FACIAL_HAIR, HAIR_COLORS, HAIR_STYLES,
  HEAD_SHAPES, HEADWEAR, EYEWEAR, WRISTBANDS, LASH_STYLES, MOUTH_STYLES, NOSE_STYLES, SHOES, SKIN_TONES, TALL_HAIR, TOPS, defaultAvatar, randomAvatar, sanitizeAvatar,
} from '../src/avatar/config';
import { ARM_REACH, BODY_SHAPES, LEG_REACH, RIG, solveLimb } from '../src/avatar/rig';

test('catalogues meet the owner brief starter targets', () => {
  assert.equal(HEAD_SHAPES.length, 6);
  assert.equal(EYE_STYLES.length, 10);
  assert.equal(LASH_STYLES.length, 6);
  assert.equal(BROW_STYLES.length, 10);
  assert.equal(NOSE_STYLES.length, 6);
  assert.equal(MOUTH_STYLES.length, 10);
  assert.equal(HAIR_STYLES.length, 14);
  assert.ok(HAIR_COLORS.length >= 12 && HAIR_COLORS.length <= 14);
  assert.equal(BODY_TYPES.length, 3);
  assert.ok(TOPS.length >= 5 && TOPS.length <= 6);
  assert.ok(BOTTOMS.length >= 4 && BOTTOMS.length <= 5);
  assert.ok(SHOES.length >= 3 && SHOES.length <= 4);
  const accessories = [...HEADWEAR, ...EYEWEAR, ...WRISTBANDS].filter(item => item.id !== 'none');
  assert.ok(accessories.length >= 5 && accessories.length <= 6);
  assert.equal(SKIN_TONES.length, 12);
  assert.equal(FACIAL_HAIR.length, 6);
  assert.equal(EAR_STYLES.length, 3);
  // Every item has the brief's fields and a unique id per list.
  for (const list of Object.values(AVATAR_CHOICES)) {
    const ids = list.map(item => item.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const item of list) assert.ok(item.id && item.name);
  }
});

test('the five brief presets and the boy and girl are valid, distinct riders', () => {
  const names = AVATAR_PRESETS.map(p => p.name);
  for (const name of ['Classic Skater', 'Punk Rider', 'Clean Street Rider', 'Retro Scooter Kid', 'Casual Rider', 'Rider Boy', 'Rider Girl']) assert.ok(names.includes(name as never), name);
  for (const preset of AVATAR_PRESETS) assert.deepEqual(sanitizeAvatar(preset.config), preset.config, preset.name);
  assert.equal(new Set(AVATAR_PRESETS.map(p => JSON.stringify(p.config))).size, AVATAR_PRESETS.length);
  assert.deepEqual(defaultAvatar(), AVATAR_PRESETS[0].config);
});

test('sanitize clamps ranges and falls back per field', () => {
  const clean = sanitizeAvatar({ hairStyle: 'afro', eyeY: 40, mouthSize: -9, top: '<script>', bodyType: 'giant', hairColor: 'pink' });
  assert.equal(clean.hairStyle, 'afro');
  assert.equal(clean.eyeY, AVATAR_RANGES.eyeY[1]);
  assert.equal(clean.mouthSize, AVATAR_RANGES.mouthSize[0]);
  assert.equal(clean.top, defaultAvatar().top);
  assert.equal(clean.bodyType, 'standard');
  // Brows follow the hair when a save names only the hair colour.
  assert.equal(clean.browColor, 'pink');
  assert.deepEqual(sanitizeAvatar(null), defaultAvatar());
  assert.deepEqual(sanitizeAvatar('nonsense'), defaultAvatar());
});

test('randomize always makes a valid rider with matched brows and no hair poking through headwear', () => {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 400; i++) {
    const rider = randomAvatar(random);
    assert.deepEqual(sanitizeAvatar(rider), rider);
    assert.equal(rider.browColor, rider.hairColor);
    if (rider.headwear !== 'none') assert.ok(!TALL_HAIR.has(rider.hairStyle), `${rider.hairStyle} under ${rider.headwear}`);
  }
});

test('one skeleton: body types change girth only, never lengths', () => {
  assert.ok(Math.abs(ARM_REACH - (RIG.upperArm + RIG.forearm)) < 1e-9);
  assert.ok(Math.abs(LEG_REACH - (RIG.thigh + RIG.shin)) < 1e-9);
  const shapes = Object.values(BODY_SHAPES);
  assert.equal(shapes.length, 3);
  for (const shape of shapes) assert.ok(shape.shoulderX > 0.1 && shape.shoulderX < 0.2 && shape.hipX > 0.07 && shape.hipX < 0.11);
});

test('limb IK never stretches a segment and bends toward the pole', () => {
  const root = new THREE.Vector3(0, 1, 0), pole = new THREE.Vector3(0, 0.8, 1);
  for (const distance of [0.05, 0.2, 0.4, RIG.upperArm + RIG.forearm, 0.9]) {
    const r = solveLimb(root, new THREE.Vector3(0, 1 - distance, 0), pole, RIG.upperArm, RIG.forearm);
    const upper = r.root.distanceTo(r.mid), lower = r.mid.distanceTo(r.end);
    assert.ok(upper <= RIG.upperArm * (1 + RIG.limbSlack) + 1e-9 && upper >= RIG.upperArm - 1e-9, `upper ${upper}`);
    assert.ok(lower <= RIG.forearm * (1 + RIG.limbSlack) + 1e-9 && lower >= RIG.forearm - 1e-9, `lower ${lower}`);
    if (distance < ARM_REACH * 0.99) assert.ok(r.mid.z > 0, 'the joint bends toward the pole');
    if (distance > ARM_REACH * (1 + RIG.limbSlack)) assert.ok(r.short > 0);
  }
});
