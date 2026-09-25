import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUPS } from '../physics/groups';
import { registerMap, type Park } from './park';
import { blankLayout, makeObject, setActiveLayout } from '../editor/layout';
import { buildObject } from '../editor/assets';
import { surfaceTexture, lawnTexture } from './art';
import { buildDesert, scatterDesert } from '../art/desert';
import { SkyDome } from '../art/sky';
import { aleppoPine, boulder, bursage, creosote, fanPalm, grassTuft, plant as plantFlora, yucca, type Placement, type PlantModel } from '../art/flora';
import { ScooterAssembly } from '../scooter/assembly';

/*
 * The Church: a converted desert church with a skate spot around it, laid out
 * from the owner's reference pack and modelled on a single-storey stucco church
 * block in Boulder City, NV (no real names or signage are reproduced).
 *
 *   z -44 .. -8   front parking lot (ground, y 0) with DIY features
 *   z -12 .. -8   the main stair: eleven 0.17 m risers on 0.36 m treads, a
 *                 centre handrail and a hubba ledge either side
 *   z  -8 ..  0   front plaza (y 1.87) under a steel canopy; glass front with
 *                 the glowing cross in the lobby behind it
 *   x  18 .. 32   side courtyard (y 1.87): turf, the fallen cross, the GOOD
 *                 PEOPLE BETTER DAYS wall, a mini quarter; banks down to the rear
 *   z   0 .. 30   the building (floor y 1.87): lobby / hangout, sanctuary park
 *                 with a stage, hallway, youth room, prayer room and workshop
 *   z  30 .. 44   rear service lot (ground): loading dock with the FAITH door,
 *                 dock bank, graffiti quarter, kicker, rail and pad
 *   x -32 ..-18   west drive joining the front and rear lots
 *
 * Riding surfaces are analytic (churchHeight, read by the physics like every
 * other map) and backed by colliders; walls and furniture are colliders only.
 * Scenery is merged per material so the whole map is a few dozen draw calls.
 */
export const CHURCH = { plaza: 1.87, rise: 0.17, run: 0.36, steps: 11, stairHalf: 4.4, bottom: -12, hubbaLift: 0.5 } as const;
const P = CHURCH.plaza, TOP = CHURCH.bottom + CHURCH.steps * CHURCH.run; // -8.04
const inRect = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
/** The stage bank: floor to stage top (0.6 m) up the middle of the stage front. */
const STAGE_BANK = { x0: 4.5, x1: 9.5, z0: 23.9 };
/** Raised planters: rideable wall tops (grind the edges), soil and plants inside. */
const PLANTERS = [
  { x0: -16.6, x1: -7.2, z0: -7.6, z1: -3.8, y: P, h: 0.55 },
  { x0: 7.2, x1: 15.4, z0: -7.6, z1: -4.2, y: P, h: 0.55 },
  { x0: -12.6, x1: -5.4, z0: -9.7, z1: TOP, y: 0, h: 0.6 },
  { x0: 5.4, x1: 17.4, z0: -9.7, z1: TOP, y: 0, h: 0.6 },
  { x0: 25, x1: 31.6, z0: -7.7, z1: -1.4, y: P, h: 0.45 },
  { x0: -6, x1: 6, z0: -43.4, z1: -41.2, y: 0, h: 0.5 },
];

/** Ground height the riding physics, walking and props use. */
export function churchHeight(x: number, z: number): number {
  const ax = Math.abs(x);
  if (ax <= CHURCH.stairHalf && z >= CHURCH.bottom && z < TOP)
    return Math.min(CHURCH.steps, Math.floor((z - CHURCH.bottom) / CHURCH.run) + 1) * CHURCH.rise;
  // Hubba ledges: parallel to the stair nosing, 0.5 m proud, then flat at the top.
  if (ax > CHURCH.stairHalf && ax <= CHURCH.stairHalf + 0.8 && z >= CHURCH.bottom - 0.2 && z <= TOP + 0.84)
    return z < TOP ? CHURCH.hubbaLift + (P * (z - CHURCH.bottom + 0.2)) / (TOP - CHURCH.bottom + 0.2) : P + CHURCH.hubbaLift;
  // The accessible ramp up the west side of the stair (about 1 in 8.5).
  if (inRect(x, z, -17.6, -14.6, -24, TOP)) return (P * (z + 24)) / (TOP + 24);
  // Sanctuary stage: a bank up its middle, three shallow steps either side.
  if (inRect(x, z, STAGE_BANK.x0, STAGE_BANK.x1, STAGE_BANK.z0, 25.7)) return P + (0.6 * (z - STAGE_BANK.z0)) / (25.7 - STAGE_BANK.z0);
  if (inRect(x, z, 0, 14, 25.1, 29.7)) return P + (z < 25.4 ? 0.2 : z < 25.7 ? 0.4 : 0.6);
  for (const p of PLANTERS) if (inRect(x, z, p.x0, p.x1, p.z0, p.z1)) return p.y + p.h;
  if (inRect(x, z, -18, 18, TOP, 30) || inRect(x, z, 18, 32, TOP, 22) || inRect(x, z, -17.7, 6, 30, 33.6)) return P;
  // Loading dock bank (down to the east) and the courtyard bank (down to the rear lot).
  if (inRect(x, z, 6, 14, 30, 33.6)) return (P * (14 - x)) / 8;
  if (inRect(x, z, 18, 32, 22, 30)) return (P * (30 - z)) / 8;
  return 0;
}

export const CHURCH_SPAWNS = [
  { name: 'CHURCH / FRONT LOT', x: 0, z: -30, yaw: 0 },
  { name: 'MAIN STAIR / TOP', x: 0, z: -5.2, yaw: Math.PI },
  { name: 'SIDE COURTYARD', x: 22.5, z: -3, yaw: 0 },
  { name: 'SANCTUARY', x: 7, z: 11, yaw: 0 },
  { name: 'REAR DIY', x: 0, z: 37, yaw: -Math.PI / 2 },
];

/** The rideable DIY features, as layout objects (the editor's own ramps, rails and boxes). */
export const churchLayout = blankLayout();
churchLayout.title = 'Church spot';
const feature = (id: string, type: string, x: number, z: number, y: number, props: Record<string, unknown>) => {
  const o = makeObject(type, x, z);
  Object.assign(o, { id: 'church-' + id, y, rotation: 0, coping: /Quarter|Launch/.test(type), grindable: true }, props);
  churchLayout.objects.push(o);
};
// Sanctuary park: quarters either side of the stage, a rail and a box between.
feature('qp-west', 'Quarter Pipe', -3.2, 23.4, P, { width: 4.6, length: 4.2, height: 1.6, radius: 2.8, material: 'metal' });
feature('qp-east', 'Quarter Pipe', 16, 23.4, P, { width: 3.2, length: 4.2, height: 1.6, radius: 2.8, material: 'metal' });
feature('flat-rail', 'Flat Rail', 4.2, 15, P, { length: 6, height: 0.48 });
feature('better-days-box', 'Grind Box', 10.5, 15, P, { width: 1.2, height: 0.5, length: 6, material: 'metal' });
// Courtyard: a mini quarter against the east wall, a flat bar and two concrete benches.
feature('court-qp', 'Quarter Pipe', 29.9, 12, P, { rotation: Math.PI / 2, width: 6, length: 3.4, height: 1.3, radius: 2.2, material: 'wood' });
feature('court-rail', 'Flat Rail', 21.4, 4, P, { length: 5, height: 0.42 });
feature('court-bench-a', 'Grind Box', 25.2, 6.5, P, { width: 0.8, height: 0.45, length: 3.2, material: 'concrete' });
feature('court-bench-b', 'Grind Box', 24.5, 18, P, { rotation: Math.PI / 2, width: 0.8, height: 0.45, length: 3.2, material: 'concrete' });
// Rear lot DIY.
feature('rear-qp', 'Quarter Pipe', -29, 37.5, 0, { rotation: -Math.PI / 2, width: 6, length: 4, height: 1.6, radius: 2.6, material: 'wood' });
feature('rear-kicker', 'Launch Ramp', -16, 39.5, 0, { rotation: Math.PI / 2, width: 1.8, length: 2.4, height: 0.7, radius: 2.4, material: 'wood' });
feature('rear-rail', 'Flat Rail', -4, 40.6, 0, { rotation: Math.PI / 2, length: 7, height: 0.4 });
feature('rear-pad', 'Grind Box', 5, 39, 0, { rotation: Math.PI / 2, width: 1.3, height: 0.42, length: 5, material: 'concrete' });
feature('rear-kicker-b', 'Launch Ramp', 21, 38.5, 0, { rotation: -Math.PI / 2, width: 1.8, length: 2.4, height: 0.6, radius: 2.4, material: 'wood' });
// West drive and front lot.
feature('west-qp', 'Quarter Pipe', -30, 10, 0, { rotation: -Math.PI / 2, width: 5, length: 3.4, height: 1.2, radius: 2, material: 'wood' });
feature('west-rail', 'Flat Rail', -24.5, 18, 0, { length: 6, height: 0.4 });
feature('lot-kicker', 'Launch Ramp', 19, -30, 0, { rotation: Math.PI / 2, width: 1.8, length: 2.4, height: 0.7, radius: 2.4, material: 'wood' });
feature('lot-rail', 'Flat Rail', 10, -19, 0, { rotation: Math.PI / 2, length: 8, height: 0.45 });
feature('lot-pad', 'Grind Box', -11, -21, 0, { rotation: Math.PI / 2, width: 1.2, height: 0.35, length: 6, material: 'concrete' });
feature('truck-ramp', 'Launch Ramp', -24, -31.4, 0, { rotation: Math.PI, width: 1.4, length: 2.2, height: 0.9, radius: 2.2, material: 'wood' });
// Youth workshop: a small quarter they built, a practice pad and a low rail.
feature('shop-qp', 'Quarter Pipe', -13.9, 28.2, P, { width: 4, length: 2.4, height: 0.9, radius: 1.6, material: 'wood' });
feature('shop-pad', 'Grind Box', -15.1, 21.5, P, { width: 0.9, height: 0.3, length: 3.5, material: 'wood' });
feature('shop-rail', 'Flat Rail', -12, 22, P, { length: 4, height: 0.35 });
// Hallway: a narrow manual pad along one wall; lobby: a low pad by the couches.
feature('hall-pad', 'Grind Box', -6.85, 12, P, { width: 0.55, height: 0.25, length: 3.4, material: 'wood' });
feature('lobby-pad', 'Grind Box', 6.2, 1.9, P, { rotation: Math.PI / 2, width: 0.9, height: 0.3, length: 3.2, material: 'wood' });
// Plaza and courtyard kickers.
feature('plaza-kicker', 'Launch Ramp', 16.3, -2.4, P, { rotation: -Math.PI / 2, width: 1.6, length: 2, height: 0.5, radius: 2, material: 'wood' });
feature('court-kicker', 'Launch Ramp', 20.5, 14, P, { width: 1.8, length: 2.2, height: 0.55, radius: 2.2, material: 'wood' });

export function installChurch() { registerMap('church', { build: buildChurch, height: churchHeight, spawns: CHURCH_SPAWNS }); }

// ---------------------------------------------------------------------------
// Geometry helpers: world-scaled UVs (one texture tile per `tile` metres) and a
// per-material batch merged at the end.

type Geo = THREE.BufferGeometry;
function scaledBox(w: number, h: number, l: number, tile: number) {
  const g = new THREE.BoxGeometry(w, h, l), uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[l, h], [l, h], [w, l], [w, l], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile); }
  return g;
}
/** Planar UVs from world coordinates, for extrusions and hulls. */
function worldUV(g: Geo, tile: number) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [u, v] = ay > 0.7 ? [p.getX(i), p.getZ(i)] : ax > 0.7 ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
class Batch {
  private parts = new Map<THREE.Material, Geo[]>();
  add(g: Geo, m: THREE.Material, matrix?: THREE.Matrix4) {
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) worldUV(g, 1);
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    let list = this.parts.get(m);
    if (!list) this.parts.set(m, (list = []));
    list.push(flat);
  }
  flush(scene: THREE.Scene, name: string, noShadow = new Set<THREE.Material>()) {
    for (const [m, list] of this.parts) {
      const merged = mergeGeometries(list);
      list.forEach(g => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.name = `${name} / ${m.name || 'material'}`;
      mesh.castShadow = !noShadow.has(m) && !(m as THREE.MeshStandardMaterial).transparent;
      mesh.receiveShadow = !noShadow.has(m);
      scene.add(mesh);
    }
    this.parts.clear();
  }
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A painted crown tag, the spot's recurring mark. */
function crown(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.save(); g.strokeStyle = color; g.lineWidth = s * 0.09; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x - s / 2, y + s * 0.3); g.lineTo(x - s / 2, y - s * 0.25); g.lineTo(x - s / 4, y + s * 0.05); g.lineTo(x, y - s * 0.35); g.lineTo(x + s / 4, y + s * 0.05); g.lineTo(x + s / 2, y - s * 0.25); g.lineTo(x + s / 2, y + s * 0.3); g.closePath(); g.stroke();
  g.restore();
}
function paintText(g: CanvasRenderingContext2D, lines: string[], x: number, y: number, size: number, opts: { color: string; font?: string; stroke?: string; lineGap?: number; align?: CanvasTextAlign; tilt?: number }) {
  g.save(); g.translate(x, y); if (opts.tilt) g.rotate(opts.tilt);
  g.textAlign = opts.align ?? 'center'; g.textBaseline = 'middle';
  g.font = opts.font ?? `900 ${size}px Impact, "Arial Narrow", sans-serif`;
  lines.forEach((line, i) => {
    const ly = (i - (lines.length - 1) / 2) * size * (opts.lineGap ?? 1.05);
    if (opts.stroke) { g.lineWidth = size * 0.12; g.strokeStyle = opts.stroke; g.lineJoin = 'round'; g.strokeText(line, 0, ly); }
    g.fillStyle = opts.color; g.fillText(line, 0, ly);
  });
  g.restore();
}

// ---------------------------------------------------------------------------

function buildChurch(park: Park) {
  const scene = park.scene, world = park.world;
  setActiveLayout(churchLayout);
  // Late-afternoon desert light (reference pack): warm sun low in the west, a
  // hazy sky and a soft bounce from the pale ground.
  // Boulder City, like Veterans Memorial Park: the same sky, and a haze far
  // enough out that the River Mountains and Eldorado range stay on the horizon.
  scene.background = new THREE.Color(0xb9cbd6);
  new SkyDome(scene);
  scene.fog = new THREE.Fog(0xdccdb4, 140, 900);
  scene.add(new THREE.HemisphereLight(0xfbeedb, 0x8a7a66, 1.55));
  const sun = new THREE.DirectionalLight(0xffdcb0, 2.9);
  sun.position.set(-34, 38, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, far: 160 });
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const concreteMap = surfaceTexture('concrete'), woodMap = surfaceTexture('wood');
  const std = (name: string, color: number, extra: THREE.MeshStandardMaterialParameters = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra }); m.name = name; return m; };
  const M = {
    asphalt: std('asphalt', 0x565553, { map: concreteMap, bumpMap: concreteMap, bumpScale: 0.002, roughness: 0.97 }),
    paint: std('paint', 0xe9e3d2, { roughness: 0.75 }),
    paintYellow: std('paint yellow', 0xd8b04a, { roughness: 0.75 }),
    paintBlue: std('paint blue', 0x3c6fb4, { roughness: 0.75 }),
    concrete: std('concrete', 0xd2c7b3, { map: concreteMap, bumpMap: concreteMap, bumpScale: 0.0012 }),
    concreteWorn: std('concrete worn', 0xbcae98, { map: concreteMap, bumpMap: concreteMap, bumpScale: 0.0016 }),
    paver: std('plaza pavers', 0xe0d4be, { map: concreteMap, roughness: 0.88 }),
    stucco: std('stucco', 0xded0b5, { map: concreteMap, bumpMap: concreteMap, bumpScale: 0.003, roughness: 0.95 }),
    stuccoShade: std('stucco trim', 0xc9b99c, { map: concreteMap, roughness: 0.95 }),
    floor: std('polished floor', 0xa39a8b, { map: concreteMap, roughness: 0.34, metalness: 0.05 }),
    interiorWall: std('interior wall', 0xece2cf, { map: concreteMap, roughness: 0.92 }),
    ceiling: std('ceiling', 0xe6e1d6, { roughness: 1 }),
    steel: std('steel', 0x2e2c2a, { metalness: 0.6, roughness: 0.45 }),
    rust: std('weathered steel', 0x6e3f25, { metalness: 0.35, roughness: 0.72, map: concreteMap }),
    galvanized: std('galvanized', 0x9ea3a3, { metalness: 0.7, roughness: 0.4 }),
    glass: std('glass', 0x6f8f92, { transparent: true, opacity: 0.32, roughness: 0.06, metalness: 0.2, depthWrite: false }),
    wood: std('wood', 0xa98158, { map: woodMap, roughness: 0.82 }),
    woodDark: std('dark wood', 0x5b3920, { map: woodMap, roughness: 0.86 }),
    woodPale: std('plywood', 0xc9a574, { map: woodMap, roughness: 0.84 }),
    soil: std('soil', 0x75593c, { map: concreteMap, roughness: 1 }),
    gravel: std('gravel', 0xb49c80, { map: concreteMap, roughness: 1 }),
    rock: std('rock', 0x9d8b77, { roughness: 0.95, flatShading: true }),
    leaf: std('shrub', 0x5f7b3d, { roughness: 0.9, flatShading: true }),
    leafSilver: std('desert shrub', 0x8b9868, { roughness: 0.9, flatShading: true }),
    agave: std('agave', 0x6f9175, { roughness: 0.7, side: THREE.DoubleSide }),
    cactus: std('cactus', 0x4d7738, { roughness: 0.8 }),
    trunk: std('trunk', 0x7b654b, { roughness: 1 }),
    frond: std('palm frond', 0x6a7f3b, { roughness: 0.9, side: THREE.DoubleSide }),
    sail: std('shade sail', 0xd8c39b, { roughness: 1, side: THREE.DoubleSide }),
    dumpster: std('dumpster', 0x2f5b3d, { metalness: 0.45, roughness: 0.6 }),
    black: std('rubber', 0x1f2022, { roughness: 0.85 }),
    maroon: std('chair fabric', 0x6c3240, { roughness: 0.95 }),
    couch: std('couch fabric', 0x4c5d6b, { roughness: 0.95 }),
    cushion: std('cushion', 0xb7864f, { roughness: 0.95 }),
    rug: std('rug', 0x8a4b38, { roughness: 1 }),
    red: std('red paint', 0xa8322b, { metalness: 0.2, roughness: 0.55 }),
    orange: std('traffic orange', 0xe8651f, { roughness: 0.6 }),
    white: std('white', 0xf2efe8, { roughness: 0.6 }),
    truck: std('truck paint', 0x2d3238, { metalness: 0.5, roughness: 0.5 }),
    turf: std('turf', 0xffffff, { map: (() => { const t = lawnTexture(1, 1); t.repeat.set(1, 1); return t; })(), roughness: 1 }),
    glow: std('glowing cross', 0xfff2cf, { emissive: 0xffd48a, emissiveIntensity: 2.4, roughness: 0.4 }),
    panel: std('light panel', 0xfff8ea, { emissive: 0xfff1d6, emissiveIntensity: 1.3 }),
    screen: std('screen', 0x10151a, { emissive: 0x2a5d8a, emissiveIntensity: 0.9, roughness: 0.3 }),
    window: std('window', 0x3f5157, { metalness: 0.4, roughness: 0.15 }),
    mountain: std('distant range', 0x9c7c68, { roughness: 1, flatShading: true }),
    desert: std('desert floor', 0xc8ad86, { map: concreteMap, roughness: 1 }),
  };
  const B = new Batch();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V(1, 1, 1));
  const collider = (desc: RAPIER.ColliderDesc, group = GROUPS.surface) => world.createCollider(desc.setFriction(0.1).setCollisionGroups(group)).handle;
  /** A box from its minimum corner to its maximum corner (world axes). */
  const block = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material, solid = true, tile = 2.4) => {
    const w = x1 - x0, h = y1 - y0, l = z1 - z0;
    B.add(scaledBox(w, h, l, tile), m, at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    if (solid) collider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, l / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  };
  /** A box about its centre, turned about y. */
  const boxAt = (x: number, y: number, z: number, w: number, h: number, l: number, m: THREE.Material, ry = 0, solid = false, tile = 2.4, rx = 0, rz = 0) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    B.add(scaledBox(w, h, l, tile), m, new THREE.Matrix4().compose(V(x, y, z), q, V(1, 1, 1)));
    if (solid) collider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, l / 2).setTranslation(x, y, z).setRotation(q));
  };
  const cylinder = (x: number, y0: number, z: number, r: number, h: number, m: THREE.Material, segments = 12, solid = false, r2 = r) => {
    B.add(worldUV(new THREE.CylinderGeometry(r2, r, h, segments), 1), m, at(x, y0 + h / 2, z));
    if (solid) collider(RAPIER.ColliderDesc.cylinder(h / 2, Math.max(r, r2)).setTranslation(x, y0 + h / 2, z));
  };
  /** A wedge or other convex solid from its corner points (a ramp surface, a hubba). */
  const hull = (points: THREE.Vector3[], m: THREE.Material, tile = 2.4) => {
    const g = new ConvexGeometryLite(points);
    B.add(worldUV(g, tile), m);
    collider(RAPIER.ColliderDesc.convexHull(new Float32Array(points.flatMap(p => [p.x, p.y, p.z])))!);
  };
  const camOnly = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    // Stops the chase camera (ray casts) without touching the rider.
    world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).setCollisionGroups((64 << 16) | 0));
  const decals: THREE.Object3D[] = [];
  /** A painted/printed flat surface: signage, graffiti, banners. */
  const decal = (tex: THREE.Texture, x: number, y: number, z: number, w: number, h: number, ry: number, opts: { transparent?: boolean; emissive?: number; rx?: number } = {}) => {
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: opts.transparent ?? true, roughness: 0.9, alphaTest: opts.transparent === false ? 0 : 0.02, depthWrite: !(opts.transparent ?? true), polygonOffset: true, polygonOffsetFactor: -2, emissive: opts.emissive ?? 0x000000, emissiveMap: opts.emissive ? tex : null });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(x, y, z); mesh.rotation.set(opts.rx ?? 0, ry, 0, 'YXZ');
    mesh.receiveShadow = true;
    scene.add(mesh); decals.push(mesh);
    return mesh;
  };
  let seed = 4127;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const lumpy = (g: Geo, amount: number) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (rnd() - 0.5) * amount; p.setXYZ(i, p.getX(i) * k, p.getY(i) * (1 + (rnd() - 0.5) * amount), p.getZ(i) * k); } g.computeVertexNormals(); return g; };
  const shrub = (x: number, y: number, z: number, r: number, m = M.leaf) => { B.add(worldUV(lumpy(new THREE.IcosahedronGeometry(r, 1), 0.35), 1), m, new THREE.Matrix4().compose(V(x, y + r * 0.55, z), new THREE.Quaternion(), V(1, 0.75, 1))); };
  const rock = (x: number, y: number, z: number, r: number) => { B.add(worldUV(lumpy(new THREE.DodecahedronGeometry(r, 0), 0.4), 1), M.rock, new THREE.Matrix4().compose(V(x, y + r * 0.35, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd())), V(1, 0.65, 1))); };
  const agave = (x: number, y: number, z: number, s: number) => { for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, g = new THREE.ConeGeometry(0.07 * s, 0.7 * s, 4); g.translate(0, 0.35 * s, 0); B.add(worldUV(g, 1), M.agave, at(x, y, z, a, 0.55 + (i % 3) * 0.2)); } };
  const cactus = (x: number, y: number, z: number, h: number) => {
    cylinder(x, y, z, 0.19, h, M.cactus, 10, false, 0.16);
    for (const [side, at0, len] of [[1, 0.45, 0.7], [-1, 0.6, 0.55]] as const) {
      const ay = y + h * at0;
      B.add(worldUV(new THREE.CylinderGeometry(0.11, 0.11, 0.35, 8), 1), M.cactus, new THREE.Matrix4().compose(V(x + side * 0.26, ay, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), V(1, 1, 1)));
      cylinder(x + side * 0.42, ay - 0.05, z, 0.11, len, M.cactus, 8, false, 0.09);
    }
  };

  // Shared desert planting (art/flora.ts, the same models as Veterans and B Hill),
  // collected here and instanced once at the end.
  const flora: Record<string, { models: PlantModel[]; lists: Placement[][]; thin: boolean }> = {};
  const sow = (kind: string, models: () => PlantModel[], x: number, y: number, z: number, scale: number, thin = true) => {
    const f = (flora[kind] ??= { models: models(), lists: [], thin });
    const k = Math.floor(rnd() * f.models.length);
    (f.lists[k] ??= []).push({ x, y, z, scale, yaw: rnd() * Math.PI * 2 });
  };
  const PALMS = () => [1, 2, 3].map(fanPalm), PINES = () => [1, 2, 3, 4].map(aleppoPine), BURSAGE = () => [4, 5, 6].map(bursage),
    CREOSOTE = () => [1, 2, 3].map(creosote), GRASS = () => [1, 2, 3].map(grassTuft), BOULDER = () => [11, 12, 13].map(boulder), YUCCA = () => [5, 6].map(yucca);

  // ---- Ground: asphalt everywhere, a street and the Mojave beyond the walls,
  // running out to the same ranges as the rest of Boulder City.
  block(-32, -0.3, -44, 32, 0, 44, M.asphalt, true, 4);
  const town = (x: number, z: number) => Math.hypot(Math.max(0, Math.abs(x) - 95), Math.max(0, z - 72, -62 - z));
  const desert = buildDesert(scene, { center: new THREE.Vector2(0, 0), base: -0.06, keepOut: town, rangeStart: 640, seed: 5151 });
  scatterDesert(scene, { keepOut: town, ground: desert.surface, center: new THREE.Vector2(0, 0), near: 2.5, far: 190, count: 1500, seed: 207 });
  // The vacant lots around the site: dirt, creosote and bursage between the neighbours.
  for (let i = 0; i < 160; i++) {
    const x = (rnd() - 0.5) * 180, z = -44 + rnd() * 112;
    if (Math.abs(x) < 34.5 && z < 46) continue;
    if ([[-60, 10, 10, 14], [58, -6, 11, 16], [0, 66, 26, 9], [-50, 60, 13, 10], [60, 55, 12, 11]].some(([hx, hz, w, l]) => Math.abs(x - hx) < w && Math.abs(z - hz) < l)) continue;
    const k = rnd();
    if (k < 0.45) sow('bursage', BURSAGE, x, -0.06, z, 0.7 + rnd() * 0.5);
    else if (k < 0.8) sow('creosote', CREOSOTE, x, -0.06, z, 0.7 + rnd() * 0.6);
    else if (k < 0.93) sow('grass', GRASS, x, -0.06, z, 0.9 + rnd() * 0.5);
    else sow('boulder', BOULDER, x, -0.2, z, 0.4 + rnd() * 0.6, false);
  }
  block(-120, -0.05, -60, 120, -0.01, -46.5, M.asphalt, false, 4);
  for (let x = -110; x < 110; x += 6) block(x, -0.012, -53.4, x + 3, 0, -53.1, M.paintYellow, false);
  block(-40, -0.06, -46.5, 40, 0.1, -44, M.concrete, false); // sidewalk
  // Parking stalls: two rows each side of the lot aisle, a handicap bay by the stair.
  for (const [z0, z1] of [[-40.5, -34.5], [-26, -20.5]] as const)
    for (let x = -29.5; x <= 30; x += 2.8) if (Math.abs(x) > 7 || z0 < -30) block(x - 0.06, 0, z0, x + 0.06, 0.006, z1, M.paint, false);
  block(-8.6, 0, -20.5, -5.8, 0.006, -14.2, M.paintBlue, false);
  const hc = canvasTexture(256, 256, (g, w) => { g.fillStyle = '#3c6fb4'; g.fillRect(0, 0, w, w); g.strokeStyle = '#f2efe6'; g.lineWidth = 14; g.beginPath(); g.arc(128, 150, 60, 0.6, Math.PI * 1.9); g.stroke(); g.beginPath(); g.arc(128, 62, 16, 0, Math.PI * 2); g.fillStyle = '#f2efe6'; g.fill(); g.fillRect(118, 80, 20, 80); g.fillRect(118, 150, 70, 18); });
  decal(hc, -7.2, 0.012, -17.3, 2.2, 2.2, 0, { rx: -Math.PI / 2 });
  // Wheel stops (manual-pad height) along the stall rows.
  for (const x of [-20.7, -12.3, 12.3, 20.7]) { block(x - 0.9, 0, -34.8, x + 0.9, 0.14, -34.5, M.concreteWorn, true); park.rail(`church wheel stop ${x}`, V(x - 0.88, 0.145, -34.65), V(x + 0.88, 0.145, -34.65), 'ledge'); }
  // Oil stains and patched cracks on the lot.
  const stains = canvasTexture(512, 512, (g) => { for (let i = 0; i < 9; i++) { const x = rnd() * 512, y = rnd() * 512, r = 30 + rnd() * 70; const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(20,18,16,.35)'); grd.addColorStop(1, 'rgba(20,18,16,0)'); g.fillStyle = grd; g.fillRect(0, 0, 512, 512); } g.strokeStyle = 'rgba(25,22,20,.55)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { let x = rnd() * 512, y = rnd() * 512; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 18; s++) { x += (rnd() - 0.5) * 40; y += rnd() * 22; g.lineTo(x, y); } g.stroke(); } });
  for (const [x, z] of [[-18, -30], [8, -27], [22, -38], [-6, 36], [18, 41], [-26, 20]] as const) decal(stains, x, 0.008, z, 9, 9, rnd() * 6, { rx: -Math.PI / 2 });

  // ---- Raised levels: plaza + building floor, courtyard, loading dock.
  block(-18, 0, TOP, 18, P, 30, M.concrete);
  block(18, 0, TOP, 32, P, 22, M.concrete);
  block(-17.7, 0, 30, 6, P, 33.6, M.concreteWorn);
  // Top finishes: pavers on the plaza, broom-finished courtyard, polished inside.
  block(-18, P - 0.004, TOP, 18, P + 0.002, 0, M.paver, false, 1.2);
  for (let x = -17.5; x < 18; x += 1.5) block(x - 0.012, P + 0.002, TOP, x + 0.012, P + 0.004, 0, M.concreteWorn, false);
  block(18, P - 0.004, TOP, 32, P + 0.002, 22, M.concrete, false, 2);
  block(-18, P - 0.004, 0, 18, P + 0.002, 30, M.floor, false, 3);
  // Dock edge: rubber bumpers and a steel lip (grind it).
  block(-17.7, P - 0.08, 33.52, 6, P + 0.01, 33.66, M.steel, false);
  park.rail('church dock lip', V(-17.6, P + 0.02, 33.6), V(5.9, P + 0.02, 33.6), 'ledge', false, V(0, 0, -1));
  for (let x = -15; x < 6; x += 4) block(x, P - 0.55, 33.6, x + 0.35, P - 0.2, 33.78, M.black, false);

  // ---- Main stair: treads, steel nosings, a centre handrail and two hubbas.
  for (let i = 0; i < CHURCH.steps; i++) {
    const z0 = CHURCH.bottom + i * CHURCH.run, top = (i + 1) * CHURCH.rise;
    block(-CHURCH.stairHalf, 0, z0, CHURCH.stairHalf, top, z0 + CHURCH.run, i % 2 ? M.concrete : M.concreteWorn, true, 1.6);
    block(-CHURCH.stairHalf, top - 0.03, z0, CHURCH.stairHalf, top + 0.003, z0 + 0.05, M.galvanized, false);
  }
  const nosing = (z: number) => (Math.min(CHURCH.steps, Math.max(0, (z - CHURCH.bottom) / CHURCH.run)) * CHURCH.rise);
  // The handrail follows the nosing line 0.86 m up, with posts at its ends and middle.
  const railA = V(0, nosing(-11.85) + 0.17 + 0.86, -11.85), railB = V(0, P + 0.86, -8.25);
  park.rail('church eleven-stair handrail', railA, railB, 'rail');
  cylinder(0, nosing(-10) + 0.17, -10, 0.035, railA.clone().lerp(railB, 0.5).y - nosing(-10) - 0.17, M.steel, 10);
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -CHURCH.stairHalf - 0.8 : CHURCH.stairHalf, x1 = x0 + 0.8, zb = CHURCH.bottom - 0.2, zt = TOP + 0.84;
    const pts: THREE.Vector3[] = [];
    for (const x of [x0, x1]) pts.push(V(x, 0, zb), V(x, CHURCH.hubbaLift, zb), V(x, P + CHURCH.hubbaLift, TOP), V(x, 0, TOP));
    hull(pts, M.concreteWorn);
    block(x0, P, TOP, x1, P + CHURCH.hubbaLift, zt, M.concreteWorn);
    for (const x of [x0 + 0.02, x1 - 0.02]) {
      const edge = x0 + 0.4 + (x < x0 + 0.4 ? -1 : 1) * 0.38;
      park.rail(`church hubba ${side} ${x < x0 + 0.4 ? 'west' : 'east'}`, V(edge, CHURCH.hubbaLift + 0.02, zb + 0.05), V(edge, P + CHURCH.hubbaLift + 0.02, TOP), 'ledge', false, V(x0 + 0.4 - edge, 0, 0));
      park.rail(`church hubba ${side} top ${x < x0 + 0.4 ? 'west' : 'east'}`, V(edge, P + CHURCH.hubbaLift + 0.02, TOP), V(edge, P + CHURCH.hubbaLift + 0.02, zt - 0.05), 'ledge', false, V(x0 + 0.4 - edge, 0, 0));
    }
  }
  // Tags on the hubba faces.
  const tag = canvasTexture(512, 256, (g) => { paintText(g, ['B.D.A.'], 256, 128, 120, { color: 'rgba(30,30,34,.85)', font: 'italic 900 120px Impact, sans-serif', tilt: -0.08 }); crown(g, 420, 70, 70, 'rgba(30,30,34,.85)'); });
  decal(tag, CHURCH.stairHalf + 0.81, 0.9, -10.4, 1.6, 0.8, Math.PI / 2);

  // ---- West accessible ramp, with a steel guard on its open side.
  hull([V(-17.6, 0, -24), V(-14.6, 0, -24), V(-17.6, P, TOP), V(-14.6, P, TOP), V(-17.6, 0, TOP), V(-14.6, 0, TOP)], M.concrete);
  for (let z = -22; z <= TOP; z += 3.5) cylinder(-14.55, (P * (z + 24)) / (TOP + 24), z, 0.03, 0.95, M.steel, 8);
  park.rail('church ramp guard', V(-14.55, 0.95 + (P * 2) / (TOP + 24), -22), V(-14.55, 0.95 + P, TOP - 0.1), 'rail');

  // ---- Planters: board-formed concrete walls, soil, desert planting.
  for (const p of PLANTERS) {
    const t = 0.25, top = p.y + p.h;
    block(p.x0, p.y, p.z0, p.x1, top, p.z0 + t, M.concreteWorn);
    block(p.x0, p.y, p.z1 - t, p.x1, top, p.z1, M.concreteWorn);
    block(p.x0, p.y, p.z0 + t, p.x0 + t, top, p.z1 - t, M.concreteWorn);
    block(p.x1 - t, p.y, p.z0 + t, p.x1, top, p.z1 - t, M.concreteWorn);
    block(p.x0 + t, p.y, p.z0 + t, p.x1 - t, top - 0.1, p.z1 - t, M.soil, false, 1.5);
    park.rail(`church planter ${p.x0} ${p.z0}`, V(p.x0 + 0.02, top + 0.01, p.z0 + 0.03), V(p.x1 - 0.02, top + 0.01, p.z0 + 0.03), 'ledge', false, V(0, 0, 1));
    const area = (p.x1 - p.x0) * (p.z1 - p.z0);
    for (let i = 0; i < area / 2.2; i++) {
      const x = p.x0 + 0.5 + rnd() * (p.x1 - p.x0 - 1), z = p.z0 + 0.5 + rnd() * (p.z1 - p.z0 - 1), k = rnd();
      if (k < 0.22) sow('bursage', BURSAGE, x, top - 0.12, z, 0.5 + rnd() * 0.3);
      else if (k < 0.34) sow('creosote', CREOSOTE, x, top - 0.12, z, 0.45 + rnd() * 0.25);
      else if (k < 0.5) sow('grass', GRASS, x, top - 0.1, z, 0.7 + rnd() * 0.4);
      else if (k < 0.62) sow('yucca', YUCCA, x, top - 0.12, z, 0.45 + rnd() * 0.25, false);
      else if (k < 0.8) agave(x, top - 0.1, z, 0.8 + rnd() * 0.5);
      else sow('boulder', BOULDER, x, top - 0.18, z, 0.22 + rnd() * 0.2, false);
    }
  }
  // Trees in the big planters and the lot island's saguaros.
  // Aleppo pines, Boulder City's shade tree, in the two big plaza planters.
  for (const [x, z, h] of [[-11.5, -5.7, 7.5], [11.3, -5.9, 6.8]] as const) {
    const models = (flora.pine ??= { models: PINES(), lists: [], thin: false }).models, k = Math.floor(rnd() * models.length);
    (flora.pine.lists[k] ??= []).push({ x, y: P + 0.4, z, scale: h / models[k].height, yaw: rnd() * Math.PI * 2 });
  }
  for (const x of [-4.2, 0.5, 3.8]) cactus(x, 0.4, -42.3, 2 + rnd() * 1.2);

  // ---- The building shell: stucco walls with a parapet, glass front, roof.
  const H = P + 6.2; // interior ceiling
  const wall = (x0: number, z0: number, x1: number, z1: number, m = M.stucco, y0 = P, y1 = H + 0.6) => block(x0, y0, z0, x1, y1, z1, m);
  // Front (z 0): stucco returns either side of a mullioned glass wall with doors.
  wall(-18, 0, -9.2, 0.3); wall(9.2, 0, 18, 0.3);
  block(-9.2, P + 4.6, 0, 9.2, H + 0.6, 0.3, M.stucco);
  for (const [x0, x1] of [[-9.2, -1.6], [1.6, 4.6], [7.2, 9.2]] as const) { block(x0, P, 0.1, x1, P + 4.6, 0.16, M.glass, true); }
  for (let x = -9.2; x <= 9.2; x += 1.53) cylinder(x, P, 0.13, 0.04, 4.6, M.steel, 6);
  block(-9.2, P + 2.5, 0.08, 9.2, P + 2.56, 0.2, M.steel, false);
  // Sides and back.
  wall(-18, 0.3, -17.7, 30); wall(17.7, 0.3, 18, 12); wall(17.7, 15, 18, 30);
  block(17.7, P + 3.2, 12, 18, H + 0.6, 15, M.stucco); // courtyard door head
  wall(-17.7, 29.7, -9.6, 30); wall(-6.2, 29.7, 18, 30);
  block(-9.6, P + 3, 29.7, -6.2, H + 0.6, 30, M.stucco); // rear door head
  // Weather (#85): no rain, snow or leaves inside the building or under the plaza canopy.
  scene.userData.shelters = [{ x0: -18, z0: 0, x1: 18, z1: 30, top: H + 0.1 }, { x0: -12.3, z0: -6.7, x1: 12.3, z1: 0.1, top: P + 4.35 }];
  // Roof: slab, parapet cap, rooftop units; camera-only lid so the view stays inside.
  block(-18, H, 0, 18, H + 0.3, 30, M.stuccoShade, false);
  camOnly(-18, H, 0, 18, H + 0.3, 30);
  for (const [x0, z0, x1, z1] of [[-18.1, -0.1, 18.1, 0.35], [-18.1, 29.65, 18.1, 30.1], [-18.1, -0.1, -17.65, 30.1], [17.65, -0.1, 18.1, 30.1]] as const) block(x0, H + 0.6, z0, x1, H + 0.7, z1, M.stuccoShade, false);
  for (const [x, z, w, l] of [[-10, 6, 2.4, 1.6], [4, 5, 3, 2], [12, 18, 2.2, 1.6], [-6, 22, 3.2, 2.2], [9, 26, 1.8, 1.4]] as const) {
    block(x - w / 2, H + 0.3, z - l / 2, x + w / 2, H + 1.5, z + l / 2, M.galvanized, false, 1);
    for (let i = 0; i < 2; i++) cylinder(x - w / 4 + (i * w) / 2, H + 1.5, z, Math.min(w, l) * 0.2, 0.08, M.black, 16);
  }
  // Front cross on the west return, a steel canopy over the plaza.
  boxAt(-14, P + 3.6, -0.06, 0.22, 3.2, 0.12, M.rust);
  boxAt(-14, P + 4.4, -0.06, 1.6, 0.22, 0.12, M.rust);
  for (const x of [-12, -4, 4, 12]) { cylinder(x, P, -6.5, 0.1, 4.4, M.rust, 10, true); block(x - 0.22, P, -6.72, x + 0.22, P + 0.06, -6.28, M.steel, false); }
  block(-12.3, P + 4.4, -6.7, 12.3, P + 4.7, -6.3, M.rust, false);
  block(-12.3, P + 4.4, -0.2, 12.3, P + 4.7, 0.1, M.rust, false);
  for (const x of [-12, -4, 4, 12]) block(x - 0.12, P + 4.4, -6.7, x + 0.12, P + 4.7, 0, M.rust, false);
  for (let z = -6.2; z < 0; z += 0.55) block(-12.3, P + 4.72, z, 12.3, P + 4.8, z + 0.12, M.rust, false);
  // Wall lights by the doors (emissive).
  for (const x of [-10.4, 10.4]) boxAt(x, P + 3.4, -0.06, 0.18, 0.34, 0.12, M.glow);
  // Wall text on the courtyard side, the loading-dock sign and the rear cross.
  const welcome = canvasTexture(512, 768, (g) => { paintText(g, ['PEOPLE', 'PURPOSE', 'PRACTICE', 'PROGRESS'], 256, 300, 78, { color: '#3a3833', font: '500 78px "Arial Narrow", Arial, sans-serif', lineGap: 1.2 }); g.fillStyle = '#3a3833'; g.fillRect(96, 520, 120, 5); paintText(g, ['ALL ARE WELCOME'], 256, 610, 44, { color: '#3a3833', font: '500 44px "Arial Narrow", Arial, sans-serif' }); });
  decal(welcome, 18.02, P + 2.6, 4.2, 1.9, 2.85, Math.PI / 2);
  boxAt(4, P + 3.6, 30.07, 0.22, 3.6, 0.12, M.rust); boxAt(4, P + 4.5, 30.07, 1.7, 0.22, 0.12, M.rust);
  const deliveries = canvasTexture(512, 384, (g) => { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 512, 384); g.strokeStyle = '#222'; g.lineWidth = 10; g.strokeRect(10, 10, 492, 364); paintText(g, ['CHURCH', 'DELIVERIES', 'ONLY'], 256, 150, 62, { color: '#1f1f1f', font: '800 62px Arial, sans-serif', lineGap: 1.1 }); g.fillStyle = '#1f1f1f'; g.beginPath(); g.moveTo(150, 320); g.lineTo(200, 290); g.lineTo(200, 350); g.fill(); g.fillRect(195, 310, 170, 20); });
  decal(deliveries, 12.5, P + 1.4, 30.08, 1.1, 0.83, 0, { transparent: false });
  // Roll-up service door (closed) with the FAITH piece, a man door and lights.
  block(-15, P, 30, -11, P + 3.1, 30.12, M.galvanized, true, 1);
  for (let y = P + 0.1; y < P + 3.1; y += 0.14) block(-15, y, 30.12, -11, y + 0.03, 30.15, M.steel, false);
  block(-15.3, P + 3.1, 30, -10.7, P + 3.6, 30.3, M.galvanized, false);
  const faith = canvasTexture(512, 384, (g) => { paintText(g, ['FAITH'], 256, 205, 150, { color: 'rgba(28,28,30,.92)', font: 'italic 900 150px Impact, sans-serif', stroke: 'rgba(230,230,230,.35)', tilt: -0.06 }); crown(g, 255, 80, 90, 'rgba(28,28,30,.9)'); });
  decal(faith, -13, P + 1.5, 30.17, 3.6, 2.7, 0);
  for (const x of [-16, -10, -5, 1]) boxAt(x, P + 3.3, 30.1, 0.25, 0.18, 0.2, M.glow);
  // Service clutter along the dock: pallets, blocks, a ladder, a pallet jack, dumpster.
  const pallet = (x: number, y: number, z: number, ry: number, count = 1) => { for (let n = 0; n < count; n++) { const yy = y + n * 0.15; for (let i = 0; i < 5; i++) boxAt(x + Math.cos(ry) * (i * 0.27 - 0.54), yy + 0.13, z - Math.sin(ry) * (i * 0.27 - 0.54), 0.1, 0.02, 1.2, M.woodPale, ry); for (const s of [-0.5, 0, 0.5]) boxAt(x + Math.sin(ry) * s, yy + 0.06, z + Math.cos(ry) * s, 1.2, 0.1, 0.1, M.wood, ry); } };
  pallet(-8.5, P, 32.6, 0, 3); pallet(2.8, P, 32.5, 0.1, 2); pallet(-24, 0, 42.5, 0.3, 4); pallet(-20.5, 0, -2, 1.3, 2); pallet(26, 0, 42, -0.2, 3);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4 - i; j++) boxAt(4 + j * 0.42 + i * 0.2, P + 0.1 + i * 0.2, 31.2, 0.4, 0.2, 0.2, M.concreteWorn, 0, false, 0.6);
  const ladder = (x: number, y: number, z: number, ry: number, lean: number, h = 2.6) => { const m = at(x, y, z, ry, -lean); for (const s of [-0.22, 0.22]) B.add(scaledBox(0.05, h, 0.05, 1), M.galvanized, m.clone().multiply(at(s, h / 2, 0))); for (let r = 0.3; r < h; r += 0.3) B.add(scaledBox(0.44, 0.03, 0.03, 1), M.galvanized, m.clone().multiply(at(0, r, 0))); };
  ladder(0.4, P, 29.75, Math.PI, 0.18); ladder(-17.55, 0, -3, Math.PI / 2, 0.2); ladder(31.45, 0, 40, -Math.PI / 2, 0.22, 2.2);
  const dumpster = (x: number, z: number, ry: number, label?: THREE.Texture) => {
    boxAt(x, 0.75, z, 1.9, 1.3, 1.2, M.dumpster, ry, true, 1);
    boxAt(x, 1.47, z - Math.cos(ry) * 0.05, 1.96, 0.08, 1.28, M.dumpster, ry, false, 1, -0.08);
    for (const s of [-0.75, 0.75]) cylinder(x + Math.cos(ry) * s, 0, z - Math.sin(ry) * s, 0.08, 0.12, M.black, 10);
    if (label) decal(label, x - Math.sin(ry) * 0.61, 0.8, z - Math.cos(ry) * 0.61, 1.3, 0.65, ry + Math.PI);
  };
  const goodDays = canvasTexture(512, 256, (g) => { paintText(g, ['GOOD', 'DAYS'], 256, 128, 96, { color: 'rgba(235,235,230,.9)', font: 'italic 900 96px Impact, sans-serif', lineGap: 0.95, tilt: -0.05 }); });
  dumpster(13.5, 35.2, 0, goodDays); dumpster(-21, -6.2, Math.PI / 2);
  // Cones, barrels, a toolbox by the kicker.
  const cone = (x: number, y: number, z: number) => { B.add(worldUV(new THREE.ConeGeometry(0.16, 0.7, 12).translate(0, 0.35, 0), 1), M.orange, at(x, y, z)); B.add(worldUV(new THREE.CylinderGeometry(0.11, 0.125, 0.1, 12).translate(0, 0.42, 0), 1), M.white, at(x, y, z)); boxAt(x, y + 0.02, z, 0.42, 0.04, 0.42, M.orange); };
  for (const [x, y, z] of [[-26, 0, -33], [-9.2, P, 33], [14, 0, 43], [-14.4, 0, 41.2], [30.3, 0, 36]] as const) cone(x, y, z);
  for (const [x, z] of [[-30.8, 43], [29.8, 31.2], [-26.5, -1]] as const) cylinder(x, 0, z, 0.3, 0.9, M.rust, 14, true);
  boxAt(-14.2, 0.18, 38.2, 0.6, 0.36, 0.34, M.black, 0.4);

  // ---- Interior walls: lobby / hallway / rooms / sanctuary partitions (doorways left open).
  const iw = (x0: number, z0: number, x1: number, z1: number) => block(x0, P, z0, x1, H, z1, M.interiorWall, true, 2);
  iw(-6.15, 0.3, -5.85, 1); iw(-6.15, 7, -5.85, 8.15); // lobby / hallway (opening z 1..7)
  iw(-6.15, 8, -5.85, 18); iw(-6.15, 21, -5.85, 29.7); // hallway / sanctuary (door z 18..21)
  iw(-5.85, 7.85, 3.6, 8.15); iw(12.4, 7.85, 17.7, 8.15); // lobby / sanctuary (opening x 3.6..12.4)
  iw(-9.85, 0.3, -9.55, 3.8); iw(-9.85, 6, -9.55, 12.3); iw(-9.85, 14.6, -9.55, 20.8); iw(-9.85, 24, -9.55, 29.7); // west rooms / hallway
  iw(-17.7, 9.85, -9.85, 10.15); iw(-17.7, 16.85, -9.85, 17.15); // between the west rooms
  for (const [x0, z0, x1, z1] of [[-9.85, 3.8, -9.55, 6], [-9.85, 12.3, -9.55, 14.6], [-6.15, 18, -5.85, 21], [-9.85, 20.8, -9.55, 24], [-9.6, 29.6, -6.2, 30]] as const)
    block(x0, P + 2.6, z0, x1, H, z1, M.interiorWall, false); // door heads
  block(-18, H - 0.02, 0, 18, H, 30, M.ceiling, false);
  // Ceiling light panels.
  for (let x = -3; x <= 15; x += 6) for (let z = 11; z <= 24; z += 6.5) block(x - 1, H - 0.06, z - 0.4, x + 1, H - 0.02, z + 0.4, M.panel, false);
  for (const [x, z] of [[-7.9, 4], [-7.9, 14], [-7.9, 24], [-13.7, 5], [-13.7, 13.5], [-13.7, 23], [5, 4], [12, 4]] as const) block(x - 0.6, H - 0.06, z - 0.3, x + 0.6, H - 0.02, z + 0.3, M.panel, false);
  const lobbyLight = new THREE.PointLight(0xffd9a0, 22, 16, 1.5); lobbyLight.position.set(-1, P + 3.2, 5.5); scene.add(lobbyLight);
  const sanctuaryLight = new THREE.PointLight(0xfff0d8, 45, 30, 1.3); sanctuaryLight.position.set(7, H - 1, 18); scene.add(sanctuaryLight);

  // ---- LOBBY / HANGOUT: the glowing cross, coffee bar, couches, tables and a rug.
  boxAt(-1, P + 2.7, 7.78, 0.26, 2.5, 0.1, M.glow); boxAt(-1, P + 3.2, 7.78, 1.25, 0.26, 0.1, M.glow);
  block(-5.6, P, 4.6, -2.8, P + 1.05, 5.4, M.woodDark); block(-5.7, P + 1.05, 4.5, -2.7, P + 1.12, 5.5, M.concrete, false);
  for (const x of [-5.1, -4.3, -3.5]) { cylinder(x, P, 4.1, 0.02, 0.72, M.steel, 6); cylinder(x, P + 0.72, 4.1, 0.19, 0.06, M.woodDark, 14); }
  block(-2.6, P, 0.9, 2.6, P + 0.01, 3.4, M.rug, false);
  const couch = (x: number, z: number, ry: number, w = 2.2) => { boxAt(x, P + 0.22, z, w, 0.44, 0.9, M.couch, ry, true, 1); boxAt(x - Math.sin(ry) * 0.38, P + 0.62, z - Math.cos(ry) * 0.38, w, 0.5, 0.18, M.couch, ry, false, 1); for (const s of [-1, 1]) boxAt(x + Math.cos(ry) * s * (w / 2 - 0.09), P + 0.42, z - Math.sin(ry) * s * (w / 2 - 0.09), 0.18, 0.42, 0.9, M.couch, ry, false, 1); for (const s of [-0.5, 0.5]) boxAt(x + Math.cos(ry) * s * (w / 2), P + 0.47, z - Math.sin(ry) * s * (w / 2), w / 2 - 0.1, 0.1, 0.7, M.cushion, ry, false, 1); };
  couch(10, 2.2, 0); couch(14.6, 3.6, -Math.PI / 2); couch(10, 6.6, Math.PI);
  boxAt(10, P + 0.2, 4.4, 1.3, 0.4, 0.7, M.woodDark, 0, true, 1);
  for (const [x, z] of [[4.5, 3.5], [6.5, 6]] as const) { cylinder(x, P, z, 0.04, 0.74, M.steel, 8); cylinder(x, P + 0.74, z, 0.45, 0.05, M.wood, 20); for (let i = 0; i < 3; i++) { const a = i * 2.1; boxAt(x + Math.cos(a) * 0.75, P + 0.23, z + Math.sin(a) * 0.75, 0.42, 0.46, 0.42, M.maroon, -a, true, 1); } }
  boxAt(15.2, P + 2.1, 0.45, 2.2, 1.25, 0.08, M.screen); // welcome screen
  const plant = (x: number, z: number) => { cylinder(x, P, z, 0.28, 0.5, M.stuccoShade, 14, true, 0.32); shrub(x, P + 0.5, z, 0.45); };
  plant(-5.2, 1); plant(8.6, 1); plant(17, 7.3);

  // ---- SANCTUARY: stage, cross, banners, sound gear; the skate features are layout objects.
  block(0, P, 25.7, 14, P + 0.6, 29.7, M.woodDark, true, 1.5);
  for (const [x0, x1] of [[0, STAGE_BANK.x0], [STAGE_BANK.x1, 14]] as const) {
    block(x0, P, 25.1, x1, P + 0.2, 25.4, M.wood, true, 1.5);
    block(x0, P, 25.4, x1, P + 0.4, 25.7, M.wood, true, 1.5);
    block(x0, P + 0.6, 25.62, x1, P + 0.64, 25.72, M.galvanized, false);
    park.rail(`church stage edge ${x0}`, V(x0 + 0.1, P + 0.62, 25.7), V(x1 - 0.1, P + 0.62, 25.7), 'ledge', false, V(0, 0, 1));
  }
  hull([V(STAGE_BANK.x0, P, STAGE_BANK.z0), V(STAGE_BANK.x1, P, STAGE_BANK.z0), V(STAGE_BANK.x0, P + 0.6, 25.7), V(STAGE_BANK.x1, P + 0.6, 25.7), V(STAGE_BANK.x0, P, 25.7), V(STAGE_BANK.x1, P, 25.7)], M.woodPale, 1.2);
  // Handrails beside the stage steps and a wooden rail along the stage back.
  for (const x of [0.15, 13.85]) { cylinder(x, P + 0.6, 26.2, 0.03, 1, M.woodDark, 8); cylinder(x, P + 0.6, 29.2, 0.03, 1, M.woodDark, 8); block(x - 0.04, P + 1.56, 26.2, x + 0.04, P + 1.64, 29.2, M.woodDark, false); }
  // Double wood cross on the back wall.
  boxAt(7, P + 3.9, 29.6, 0.36, 4.2, 0.16, M.woodDark); boxAt(6.2, P + 4.4, 29.6, 2.3, 0.3, 0.16, M.woodDark); boxAt(7.8, P + 3.7, 29.52, 0.3, 3.2, 0.16, M.wood); boxAt(7.8, P + 4.6, 29.52, 1.8, 0.26, 0.16, M.wood);
  block(5.6, P + 0.6, 27.4, 8.4, P + 1.7, 28.2, M.woodDark); // pulpit / altar table
  for (const [x, z] of [[1.4, 28.6], [12.6, 28.6], [3.2, 27], [10.8, 27]] as const) block(x - 0.4, P + 0.6, z - 0.3, x + 0.4, P + 1.5, z + 0.3, M.black, true, 1); // amps / speakers
  for (const x of [2.2, 11.8]) { cylinder(x, P + 0.6, 26.4, 0.015, 1.4, M.steel, 6); boxAt(x, P + 2.1, 26.4, 0.1, 0.18, 0.1, M.steel); }
  boxAt(9.6, P + 1.45, 27.1, 1.2, 0.08, 0.35, M.black); cylinder(9.6, P + 0.6, 27.1, 0.02, 0.84, M.steel, 6);
  for (const x of [-4.5, 17.2]) { boxAt(x, H - 1.3, 27.5, 0.6, 0.9, 0.5, M.black); }
  const banner = (lines: string[], sub: string[], x: number, z: number, ry: number, sun = true) => {
    const t = canvasTexture(256, 640, (g) => { const grd = g.createLinearGradient(0, 0, 0, 640); grd.addColorStop(0, '#d9e8f4'); grd.addColorStop(1, '#9fc3e3'); g.fillStyle = grd; g.fillRect(0, 0, 256, 640); if (sun) { g.fillStyle = '#f2b43c'; g.beginPath(); g.arc(128, 110, 38, 0, Math.PI * 2); g.fill(); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(128 + Math.cos(a) * 50 - 3, 110 + Math.sin(a) * 50 - 3, 6, 6); } } paintText(g, lines, 128, 300, 58, { color: '#23508a', font: '900 58px Georgia, serif', lineGap: 1.1 }); paintText(g, sub, 128, 480, 30, { color: '#23508a', font: '700 30px Arial, sans-serif', lineGap: 1.3 }); });
    decal(t, x, P + 3.6, z, 1.25, 3.1, ry, { transparent: false });
  };
  banner(['Sun', 'days'], ['WORSHIP', '9:30 AM'], 3, 29.64, Math.PI);
  banner(['ALL', 'ARE', 'WELCOME'], [], 11, 29.64, Math.PI);
  const faithRolls = canvasTexture(512, 640, (g) => { crown(g, 256, 110, 130, '#2d4f93'); paintText(g, ['FAITH', 'ROLLS', 'TOO'], 256, 380, 120, { color: '#2d4f93', font: 'italic 900 120px Impact, sans-serif', lineGap: 1.02, tilt: -0.04 }); });
  decal(faithRolls, 17.66, P + 3.8, 19, 2.6, 3.25, -Math.PI / 2);
  const betterDays = canvasTexture(512, 256, (g) => { paintText(g, ['BETTER', 'DAYS AHEAD'], 230, 128, 76, { color: 'rgba(30,30,32,.9)', font: 'italic 900 76px Impact, sans-serif', lineGap: 1 }); g.strokeStyle = 'rgba(30,30,32,.9)'; g.lineWidth = 8; g.beginPath(); g.arc(450, 128, 40, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(450, 135, 22, 0.2, Math.PI - 0.2); g.stroke(); });
  decal(betterDays, 11.12, P + 0.26, 15, 2.4, 0.9, Math.PI / 2);
  decal(faithRolls, 17.75, P + 0.95, 23.4, 1.2, 1.5, -Math.PI / 2);
  // Stacked chairs, windows with daylight, a scooter on a stand.
  for (const [x, z] of [[-4.8, 10.5], [-4.8, 12], [16.8, 10.2]] as const) for (let i = 0; i < 6; i++) boxAt(x, P + 0.25 + i * 0.1, z, 0.5, 0.09, 0.5, M.maroon, 0, i === 0);
  for (const z of [10, 17]) { block(17.64, P + 2.2, z, 17.7, P + 5, z + 2.2, M.panel, false); }

  // ---- HALLWAY: bulletin board, trophy case, posters.
  const board = canvasTexture(512, 256, (g) => { g.fillStyle = '#a97b4f'; g.fillRect(0, 0, 512, 256); const colors = ['#f6f1e2', '#f3d36a', '#9cc5e8', '#f0a58f']; for (let i = 0; i < 9; i++) { g.fillStyle = colors[i % 4]; g.save(); g.translate(40 + (i % 5) * 95, 50 + Math.floor(i / 5) * 110); g.rotate((rnd() - 0.5) * 0.2); g.fillRect(0, 0, 80, 90); g.fillStyle = '#555'; for (let l = 0; l < 5; l++) g.fillRect(8, 14 + l * 14, 60 - (l % 2) * 18, 5); g.restore(); } });
  decal(board, -9.52, P + 1.6, 16.5, 2.6, 1.3, Math.PI / 2, { transparent: false });
  block(-9.55, P, 26, -9.1, P + 1.9, 28.5, M.woodDark); block(-9.54, P + 0.9, 26.05, -9.12, P + 1.85, 28.45, M.glass, false);
  for (let i = 0; i < 4; i++) cylinder(-9.32, P + 1, 26.4 + i * 0.6, 0.08, 0.25, M.paintYellow, 10);
  const youthPoster = canvasTexture(256, 384, (g) => { g.fillStyle = '#233c3c'; g.fillRect(0, 0, 256, 384); crown(g, 128, 90, 90, '#f3c24b'); paintText(g, ['YOUTH', 'NIGHT'], 128, 210, 56, { color: '#f4ecd8', font: '900 56px Impact, sans-serif' }); paintText(g, ['FRIDAYS 7PM', 'BRING YOUR RIDE'], 128, 320, 22, { color: '#f4ecd8', font: '700 22px Arial, sans-serif', lineGap: 1.4 }); });
  decal(youthPoster, -6.18, P + 1.7, 12, 0.8, 1.2, -Math.PI / 2, { transparent: false });

  // ---- WEST ROOMS: youth room (front), prayer room (middle), workshop (back).
  const roomSign = (text: string, z: number) => { const t = canvasTexture(512, 128, (g) => { g.fillStyle = '#2b3a3f'; g.fillRect(0, 0, 512, 128); paintText(g, [text], 256, 66, 58, { color: '#f1e4c6', font: '800 58px "Arial Narrow", Arial, sans-serif' }); }); decal(t, -9.52, P + 2.9, z, 1.6, 0.4, Math.PI / 2, { transparent: false }); };
  roomSign('YOUTH ROOM', 4.9); roomSign('PRAYER ROOM', 13.45); roomSign('YOUTH WORKSHOP', 22.4);
  couch(-14.5, 1.6, 0, 2.6); couch(-16.6, 5.4, Math.PI / 2, 2.2);
  boxAt(-14.5, P + 1.6, 9.78, 2.2, 1.25, 0.08, M.screen); boxAt(-14.5, P + 0.35, 9.5, 2.4, 0.7, 0.45, M.woodDark, 0, true);
  boxAt(-11, P + 0.9, 9.3, 0.8, 1.8, 0.75, M.red, 0, true, 1); boxAt(-11, P + 1.35, 8.9, 0.62, 0.45, 0.04, M.screen); // arcade cabinet
  for (const [x, z] of [[-13, 5], [-12, 6.6]] as const) B.add(worldUV(new THREE.SphereGeometry(0.45, 16, 10), 1), M.cushion, new THREE.Matrix4().compose(V(x, P + 0.3, z), new THREE.Quaternion(), V(1, 0.6, 1)));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) boxAt(-16 + c * 1.1, P + 0.23, 11.8 + r * 1.3, 0.5, 0.46, 0.5, M.maroon, Math.PI, true, 1);
  boxAt(-13.7, P + 2.2, 16.78, 0.14, 1.4, 0.08, M.woodDark); boxAt(-13.7, P + 2.45, 16.78, 0.8, 0.14, 0.08, M.woodDark);
  // Workshop: benches, pegboard and tools, tyres, stands, a build on the bench.
  for (const [x0, z0, x1, z1] of [[-17.6, 17.4, -16.6, 25.5], [-11.6, 25.4, -10.05, 29.6]] as const) { block(x0, P + 0.86, z0, x1, P + 0.92, z1, M.wood, false, 1); block(x0 + 0.05, P, z0 + 0.05, x1 - 0.05, P + 0.86, z1 - 0.05, M.steel, true, 1); }
  const pegboard = canvasTexture(512, 256, (g) => { g.fillStyle = '#b08a5c'; g.fillRect(0, 0, 512, 256); g.fillStyle = 'rgba(60,40,20,.55)'; for (let y = 10; y < 256; y += 18) for (let x = 10; x < 512; x += 18) g.fillRect(x, y, 3, 3); const tool = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); }; for (let i = 0; i < 10; i++) tool(24 + i * 48, 30 + (i % 3) * 8, 10, 90 + (i % 4) * 20, ['#b33b2e', '#2d3a44', '#c9a034', '#777'][i % 4]); for (let i = 0; i < 6; i++) { g.strokeStyle = '#2d3a44'; g.lineWidth = 8; g.beginPath(); g.arc(60 + i * 75, 190, 22, 0, Math.PI * 2); g.stroke(); } });
  decal(pegboard, -17.64, P + 1.9, 21.4, 7, 1.6, Math.PI / 2, { transparent: false });
  for (let i = 0; i < 4; i++) B.add(worldUV(new THREE.TorusGeometry(0.3, 0.07, 8, 20), 1), M.black, at(-11.2, P + 0.08 + i * 0.13, 18.4, 0, Math.PI / 2));
  boxAt(-12.6, P + 0.45, 18.2, 0.7, 0.9, 0.45, M.red, 0, true, 1); // tool chest
  const wsSign = canvasTexture(512, 160, (g) => { g.fillStyle = '#233c3c'; g.fillRect(0, 0, 512, 160); paintText(g, ['BUILD • RIDE • REPAIR'], 256, 82, 50, { color: '#f3c24b', font: '900 50px Impact, sans-serif' }); });
  decal(wsSign, -13.7, P + 3.4, 29.64, 3.2, 1, Math.PI, { transparent: false });
  for (const [x, z, ry] of [[-17.1, 19, Math.PI / 2], [-10.8, 27.5, Math.PI / 2]] as const) { const bike = new THREE.Group(); new ScooterAssembly(bike); bike.position.set(x, P + 0.92, z); bike.rotation.y = ry; bike.traverse(o => { o.castShadow = true; }); scene.add(bike); decals.push(bike); }

  // ---- SIDE COURTYARD: turf, the fallen cross, the graffiti wall, shade sail.
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(6, 15).rotateX(-Math.PI / 2), M.turf);
  { const uv = turf.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 5); }
  turf.position.set(25, P + 0.006, 11); turf.receiveShadow = true; scene.add(turf); decals.push(turf);
  block(21.9, P, 3.4, 22, P + 0.03, 18.6, M.concreteWorn, false); block(28, P, 3.4, 28.1, P + 0.03, 18.6, M.concreteWorn, false);
  // The fallen cross: two weathered beams lying across the rock bed.
  const crossAt = new THREE.Matrix4().compose(V(28.2, P + 0.75, -4.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.2, 0.5, 0.25, 'YXZ')), V(1, 1, 1));
  B.add(scaledBox(0.42, 4.4, 0.3, 1.2), M.woodDark, crossAt.clone().multiply(at(0, 0, 0)));
  B.add(scaledBox(2.6, 0.38, 0.3, 1.2), M.woodDark, crossAt.clone().multiply(at(0, 0.9, 0.02)));
  for (const [x, z, r] of [[26.6, -3, 0.45], [29.8, -6, 0.55], [27.4, -6.4, 0.38], [30.4, -2.6, 0.4], [26, -5.4, 0.3]] as const) rock(x, P + 0.35, z, r);
  // Perimeter/graffiti wall on the east edge.
  block(31.7, 0, -44, 32.3, 3.2, 44, M.stucco, true, 2.4);
  block(31.6, P, -8, 31.7, P + 3.3, 22, M.stuccoShade, false);
  const goodPeople = canvasTexture(768, 768, (g) => { crown(g, 384, 130, 150, '#1d1d20'); paintText(g, ['GOOD', 'PEOPLE', 'BETTER', 'DAYS'], 384, 470, 132, { color: '#1d1d20', font: 'italic 900 132px Impact, sans-serif', lineGap: 1.0, tilt: -0.03 }); });
  decal(goodPeople, 31.58, P + 1.75, 5, 2.9, 2.9, -Math.PI / 2);
  const sailPoles = [[20.5, 9.5], [31.2, 9], [31, 21.2], [20.8, 21.5]] as const;
  for (const [x, z] of sailPoles) cylinder(x, P, z, 0.07, 4.8, M.steel, 10, true);
  { const g = new THREE.BufferGeometry(); const p = sailPoles.map(([x, z], i) => V(x, P + 4.5 - (i % 2) * 0.6, z)); const c = p.reduce((a, b) => a.add(b), V(0, 0, 0)).multiplyScalar(0.25).add(V(0, -0.35, 0)); const pos: number[] = []; for (let i = 0; i < 4; i++) { const a = p[i], b = p[(i + 1) % 4]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); } g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); B.add(worldUV(g, 2), M.sail); }
  // Scooters parked against the planter, a picnic table, helmet and bag.
  boxAt(20.8, P + 0.72, -0.8, 0.9, 0.06, 1.8, M.woodPale, 0, true, 1); for (const s of [-0.7, 0.7]) boxAt(20.8 + s, P + 0.42, -0.8, 0.3, 0.05, 1.8, M.woodPale, 0, false, 1);
  for (const [x, z, ry] of [[19.6, 6.2, 0.2], [19.4, 7.2, 0.3]] as const) { const s = new THREE.Group(); new ScooterAssembly(s); s.position.set(x, P, z); s.rotation.set(0, ry, 0.18); s.traverse(o => { o.castShadow = true; }); scene.add(s); decals.push(s); }

  // ---- Perimeter: block walls, a chain-link back fence, and a low front wall.
  block(-32.3, 0, -44, -31.7, 3.2, 44, M.stucco, true, 2.4);
  block(-31.7, 0, 43.7, 31.7, 0.25, 44, M.concreteWorn);
  const chain = canvasTexture(128, 128, (g) => { g.clearRect(0, 0, 128, 128); g.strokeStyle = '#b7bbbb'; g.lineWidth = 4; for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke(); } });
  chain.wrapS = chain.wrapT = THREE.RepeatWrapping; chain.repeat.set(64 / 0.45, 3 / 0.45);
  const fence = new THREE.Mesh(new THREE.PlaneGeometry(63.4, 2.8), new THREE.MeshStandardMaterial({ map: chain, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 }));
  fence.position.set(0, 1.65, 43.85); fence.rotation.y = Math.PI; scene.add(fence); decals.push(fence);
  collider(RAPIER.ColliderDesc.cuboid(31.7, 1.6, 0.1).setTranslation(0, 1.6, 43.9));
  for (let x = -31; x <= 31; x += 3) cylinder(x, 0.25, 43.85, 0.04, 2.8, M.galvanized, 8);
  block(-31.7, 3, 43.8, 31.7, 3.06, 43.9, M.galvanized, false);
  block(-32, 0, -44.2, 32, 0.7, -43.8, M.concreteWorn);
  collider(RAPIER.ColliderDesc.cuboid(32, 1.5, 0.2).setTranslation(0, 2.2, -44)); // keeps riders on the lot
  // Vines on the west wall; graffiti by the rear quarter.
  for (let z = -40; z < 40; z += 7) for (let i = 0; i < 4; i++) shrub(-31.6, 0.3 + i * 0.7, z + rnd() * 3, 0.35 + rnd() * 0.25);
  const sk8 = canvasTexture(768, 256, (g) => { const grd = g.createLinearGradient(0, 0, 768, 0); grd.addColorStop(0, '#6aa7d8'); grd.addColorStop(1, '#e9e3d4'); paintText(g, ['SCOOT'], 384, 140, 190, { color: '#e9ecef', font: 'italic 900 190px Impact, sans-serif', stroke: '#26303a' }); crown(g, 690, 60, 80, '#26303a'); });
  decal(sk8, -31.68, 1.8, 37.5, 6, 2, Math.PI / 2);

  // ---- Front lot: pickup truck with its ramp, light poles, the street trees.
  { const x = -24, z = -36.2; block(x - 0.95, 0.45, z - 2.6, x + 0.95, 1.1, z + 2.6, M.truck, true, 1); block(x - 0.95, 1.1, z - 2.6, x + 0.95, 1.75, z - 0.6, M.truck, false, 1); block(x - 0.9, 1.15, z - 2.4, x + 0.9, 1.7, z - 0.7, M.window, false, 1); block(x - 0.9, 1.1, z - 0.4, x + 0.9, 1.45, z + 2.5, M.black, false, 1); for (const [dx, dz] of [[-0.9, -1.7], [0.9, -1.7], [-0.9, 1.6], [0.9, 1.6]] as const) B.add(worldUV(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 18), 1), M.black, at(x + dx, 0.38, z + dz, 0, 0, Math.PI / 2)); block(x - 0.95, 0.35, z + 2.55, x + 0.95, 0.55, z + 2.7, M.galvanized, false); }
  const lightPole = (x: number, z: number, ry: number) => { const y = churchHeight(x, z); cylinder(x, y, z, 0.09, 7.2, M.steel, 10, true, 0.07); boxAt(x + Math.cos(ry) * 0.7, y + 7.15, z - Math.sin(ry) * 0.7, 1.4, 0.08, 0.12, M.steel, ry); boxAt(x + Math.cos(ry) * 1.2, y + 7.08, z - Math.sin(ry) * 1.2, 0.6, 0.12, 0.3, M.panel, ry); };
  lightPole(-16, -30, 0); lightPole(16, -30, Math.PI); lightPole(-28, 8, 0); lightPole(26, 36, Math.PI); lightPole(-6, 40, 0);
  // Fan palms along the street and in the neighbours' yards (the B Hill palms).
  for (const [x, z] of [[-40, -50], [-22, -49], [12, -50], [34, -49], [-38, 10], [38, -10], [36, 30], [-37, 38], [10, 50], [-14, 51]] as const) {
    const models = (flora.palm ??= { models: PALMS(), lists: [], thin: false }).models, k = Math.floor(rnd() * models.length);
    (flora.palm.lists[k] ??= []).push({ x, y: churchHeight(x, z) - 0.03, z, scale: (9 + rnd() * 5) / models[k].height, yaw: rnd() * Math.PI * 2 });
  }
  // Neighbouring roofs (the ranges beyond are the shared desert above).
  for (const [x, z, w, l, h] of [[-60, 10, 18, 26, 5], [58, -6, 20, 30, 4.5], [0, 66, 50, 16, 6], [-50, 60, 24, 18, 4], [60, 55, 22, 20, 5]] as const) block(x - w / 2, 0, z - l / 2, x + w / 2, h, z + l / 2, M.stuccoShade, false, 4);

  // ---- Rider clutter: helmets, backpacks, Bibles on chairs, plywood, crates, a work table.
  const helmet = (x: number, y: number, z: number, m = M.black) => B.add(worldUV(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 1), m, at(x, y, z, rnd() * 6, 0.2));
  const backpack = (x: number, y: number, z: number, ry: number, m: THREE.Material) => { boxAt(x, y + 0.24, z, 0.34, 0.46, 0.2, m, ry, false, 1); boxAt(x - Math.sin(ry) * 0.12, y + 0.14, z - Math.cos(ry) * 0.12, 0.28, 0.22, 0.08, m, ry, false, 1); };
  const book = (x: number, y: number, z: number, ry: number) => { boxAt(x, y + 0.025, z, 0.17, 0.05, 0.24, M.black, ry, false, 1); boxAt(x + 0.004, y + 0.025, z, 0.16, 0.035, 0.235, M.white, ry, false, 1); };
  helmet(8.6, P + 0.45, 6.4); helmet(-5.3, P + 1.12, 5.2, M.red); helmet(21.2, P + 0.75, -0.4); helmet(-17.1, P + 0.92, 23.5, M.orange);
  backpack(12.4, P, 1.3, 0.3, M.couch); backpack(-8.7, P, 9.3, Math.PI / 2, M.red); backpack(22.4, P, -0.2, -0.4, M.dumpster);
  for (const [x, z] of [[-4.8, 10.5], [16.8, 10.2]] as const) book(x, P + 0.86, z, 0.3);
  for (let c = 0; c < 4; c++) book(-16 + c * 1.1, P + 0.47, 11.8, rnd());
  // Hallway bench (a ledge) and a noticeboard in the lobby.
  park.bench('church-hall-bench', -9.05, P, 8.9, 0.5, 2.4);
  decal(board, 17.62, P + 1.6, 6.4, 2.2, 1.1, -Math.PI / 2, { transparent: false });
  // Rear lot: plywood sheets leaning on the wall, crates, a work table, spare 2x4s.
  for (let i = 0; i < 4; i++) boxAt(17.6 + i * 0.07, 1.2, 31.5 + i * 0.35, 0.02, 2.4, 1.2, M.woodPale, 0, false, 1, 0, -0.22);
  for (const [x, z, s] of [[23.8, 33, 1], [24.7, 33.1, 0.8], [24.2, 33, 0.7]] as const) boxAt(x, 0.3 * s + (s < 0.75 ? 0.6 : 0), z, 0.6 * s, 0.6 * s, 0.6 * s, M.wood, rnd(), s === 1, 1);
  block(-22, 0, 33, -19.6, 0.9, 34.2, M.woodDark); block(-22.1, 0.9, 32.9, -19.5, 0.96, 34.3, M.woodPale, false, 1);
  for (let i = 0; i < 6; i++) boxAt(-20.8 + (i % 3) * 0.12, 0.99 + Math.floor(i / 3) * 0.09, 33.6, 0.09, 0.09, 2.4, M.woodPale, 0.05, false, 1);
  boxAt(-21.5, 1.04, 33.3, 0.4, 0.14, 0.22, M.red); // tool case
  // Workshop: plywood stack, a half-built ramp frame, paint cans.
  for (let i = 0; i < 5; i++) boxAt(-16.9, P + 0.05 + i * 0.025, 27.8, 1.2, 0.02, 2.4, M.woodPale, 0, false, 1);
  for (let i = 0; i < 4; i++) { const g = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.4, 0), new THREE.Vector2(1.4, 0.7), new THREE.Vector2(0.9, 0.62), new THREE.Vector2(0.4, 0.38)]); const e = new THREE.ExtrudeGeometry(g, { depth: 0.04, bevelEnabled: false }); B.add(worldUV(e, 1), M.wood, at(-12.2, P, 18.1 + i * 0.4, Math.PI / 2)); }
  for (let i = 0; i < 5; i++) cylinder(-11.3 + (i % 3) * 0.2, P + 0.92, 26 + Math.floor(i / 3) * 0.25, 0.08, 0.16, [M.red, M.paintBlue, M.paintYellow, M.white][i % 4], 12);

  for (const [kind, f] of Object.entries(flora)) f.models.forEach((model, k) => { if (f.lists[k]?.length) plantFlora(scene, model, f.lists[k], 'church ' + kind, f.thin); });
  B.flush(scene, 'Church', new Set([M.panel, M.glow, M.screen, M.mountain, M.desert]));
  // Rideable features: the editor's own ramps, rails and boxes.
  for (const o of churchLayout.objects) buildObject(park, o);
  // Benches (the park's own seat + ledges) in the lot and on the plaza.
  park.bench('church-plaza-bench-west', -4.5, P, -2.2, 0.6, 2.8);
  park.bench('church-plaza-bench-east', 6.5, P, -2.2, 0.6, 2.8);
  scene.userData.churchDecals = decals.length;
}

/**
 * Minimal convex hull geometry for the handful of wedges and hubbas (points are
 * already the corners, so a gift-wrap over at most a dozen points is plenty).
 */
class ConvexGeometryLite extends THREE.BufferGeometry {
  constructor(points: THREE.Vector3[]) {
    super();
    const faces: [number, number, number][] = [];
    const n = points.length, eps = 1e-6;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      const a = points[i], b = points[j], c = points[k];
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.lengthSq() < eps) continue;
      let pos = 0, neg = 0;
      for (let m = 0; m < n; m++) { if (m === i || m === j || m === k) continue; const d = points[m].clone().sub(a).dot(normal); if (d > eps) pos++; else if (d < -eps) neg++; }
      if (pos && neg) continue;
      faces.push(pos ? [i, k, j] : [i, j, k]);
    }
    // Coplanar quads produce overlapping triangles; keep one fan per plane.
    const planes = new Map<string, [number, number, number][]>();
    for (const f of faces) {
      const [a, b, c] = f.map(i => points[i]);
      const nrm = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const key = [nrm.x, nrm.y, nrm.z, nrm.dot(a)].map(v => v.toFixed(3)).join(',');
      (planes.get(key) ?? planes.set(key, []).get(key)!).push(f);
    }
    const pos: number[] = [];
    for (const list of planes.values()) {
      const ids = [...new Set(list.flat())];
      const [a, b, c] = list[0].map(i => points[i]);
      const nrm = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const centre = ids.reduce((s, i) => s.add(points[i]), new THREE.Vector3()).multiplyScalar(1 / ids.length);
      const u = points[ids[0]].clone().sub(centre).normalize(), v = nrm.clone().cross(u);
      ids.sort((p, q) => Math.atan2(points[p].clone().sub(centre).dot(v), points[p].clone().sub(centre).dot(u)) - Math.atan2(points[q].clone().sub(centre).dot(v), points[q].clone().sub(centre).dot(u)));
      for (let t = 1; t < ids.length - 1; t++) for (const i of [ids[0], ids[t], ids[t + 1]]) pos.push(points[i].x, points[i].y, points[i].z);
    }
    this.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.computeVertexNormals();
  }
}
