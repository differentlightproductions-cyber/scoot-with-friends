import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { AudioEngine } from "../audio/audio";
import { litterModel } from "../art/litter";

/**
 * Mourning doves (#71): a handful live in the park. Most of the time they sit
 * in the pines or on the pavilion roofs and coo; now and then a pair comes
 * down to walk the lawn, bobbing and pecking. They clatter off when someone
 * comes too close, go for food left out (crumbs, an open bag of chips on a
 * picnic table) and pick through litter on the ground, and once in a while a
 * perched one lets go: a small white splat that fades after a few seconds.
 * They roost at night and sit tight in the rain. Every coo and wing clap is
 * placed in the world, so a dove across the park is faint and off to one side.
 * Local to each player, like the park's locals.
 */
export interface DoveWorld {
  ground(x: number, z: number): number;
  /** Where a dove can sit: branches in the pines, pavilion roofs. */
  perches: THREE.Vector3[];
  /** Where a dove may land on the ground (lawns), near `near`. */
  landing(near: THREE.Vector3): THREE.Vector3 | null;
  /** Litter lying on the ground right now, to pick through. */
  litter(): THREE.Object3D[];
  /** Top of whatever is below (x, y, z): a roof, a bench, a ramp, or the ground. */
  below(x: number, y: number, z: number): number;
}
export interface DoveContext {
  rider: THREE.Vector3;
  /** Rider speed, m/s; riding past fast startles them farther off. */
  speed: number;
  /** 0 day .. 1 night. */
  night: number;
  /** 0..1 rain. */
  rain: number;
}
type State = "perch" | "ground" | "fly" | "feed";
interface Food { kind: "crumb" | "chip"; object: THREE.Object3D; position: THREE.Vector3; taken: boolean; claimed?: Dove; snack?: Snack }
interface Snack { bag: THREE.Object3D; chips: Food[]; empty: number }
interface Splat { mesh: THREE.Mesh; age: number; life: number }
interface Dove {
  root: THREE.Group; head: THREE.Mesh; wingL: THREE.Mesh; wingR: THREE.Mesh; folded: THREE.Mesh; carry: THREE.Object3D | null;
  state: State; timer: number; position: THREE.Vector3; yaw: number;
  flight?: { from: THREE.Vector3; via: THREE.Vector3; to: THREE.Vector3; t: number; duration: number; then: State; food?: Food };
  walk?: THREE.Vector3; step: number; peck: number; coo: number; poop: number; perch?: THREE.Vector3; food?: Food; flap: number;
}

const COUNT = 6;
const SPEED = 8.5;
const FLEE_ON_FOOT = 2.6, FLEE_RIDING = 6;
const base = typeof import.meta !== "undefined" ? import.meta.env?.BASE_URL ?? "/" : "/";
const SOUNDS = { coo: base + "audio/birds/dove-coo.mp3", flaps: [base + "audio/birds/dove-flap-1.mp3", base + "audio/birds/dove-flap-2.mp3"] };

// ---- the bird -------------------------------------------------------------------------
const hash = (a: number, b: number, c: number) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
const C = (hex: number) => new THREE.Color(hex);
const smooth = THREE.MathUtils.smoothstep;
interface Section { w: number; h: number; y: number; x?: number; low?: number }
/**
 * A smooth closed body along Z from `rear` to `front`: at each station `t`
 * (0 rear .. 1 front) an elliptical section `w` wide and `h` tall centred at
 * (`x`, `y`), `low` scaling the lower half. `color` paints each vertex from its
 * station and its direction around the section (nx, ny).
 */
function shell(rear: number, front: number, section: (t: number) => Section, color: (t: number, nx: number, ny: number) => THREE.Color, segments = 22, rings = 26) {
  const g = new THREE.SphereGeometry(1, segments, rings);
  g.rotateX(Math.PI / 2);
  g.deleteAttribute("uv"); g.deleteAttribute("normal");
  const m = mergeVertices(g), p = m.attributes.position as THREE.BufferAttribute, colors: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = THREE.MathUtils.clamp(p.getZ(i), -1, 1), r = Math.hypot(x, y);
    const t = 1 - Math.acos(z) / Math.PI, nx = r > 1e-6 ? x / r : 0, ny = r > 1e-6 ? y / r : 0, s = section(t);
    p.setXYZ(i, (s.x ?? 0) + nx * s.w, s.y + ny * s.h * (ny < 0 ? s.low ?? 1 : 1), rear + t * (front - rear));
    const c = color(t, nx, ny); colors.push(c.r, c.g, c.b);
  }
  m.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  m.computeVertexNormals();
  return m;
}
/** Paints a primitive one colour (or per vertex), keeping only what the merged bird needs. */
function solid(g: THREE.BufferGeometry, color: THREE.Color | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color)) {
  g.deleteAttribute("uv");
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, v = new THREE.Vector3(), w = new THREE.Vector3(), out: number[] = [];
  for (let i = 0; i < p.count; i++) { const c = typeof color === "function" ? color(v.fromBufferAttribute(p, i), w.fromBufferAttribute(n, i)) : color; out.push(c.r, c.g, c.b); }
  g.setAttribute("color", new THREE.Float32BufferAttribute(out, 3));
  return g.index ? g : g;
}
const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));

// Proportions, metres: body 17 cm, tail 15 cm, feet at the origin, facing +Z.
const BODY = { rear: -0.095, front: 0.075, width: 0.038, height: 0.039, centre: 0.064 };
const INCLINE = 0.24;
const bodyProfile = (t: number) => Math.pow(Math.sin(Math.PI * Math.pow(t, 1.15)), 0.62);
const bodySection = (t: number): Section => ({ w: BODY.width * bodyProfile(t), h: BODY.height * bodyProfile(t), y: BODY.centre + 0.019 * smooth(t, 0.6, 1) - 0.004 * (1 - t), low: 1 + 0.14 * smooth(t, 0.4, 0.8) });
const bodyAt = (z: number) => bodySection(THREE.MathUtils.clamp((z - BODY.rear) / (BODY.front - BODY.rear), 0, 1));
/** The standing bird leans head-up; the flying one levels out by undoing this. */
const lean = (g: THREE.BufferGeometry) => { g.translate(0, -BODY.centre, 0); g.rotateX(-INCLINE); g.translate(0, BODY.centre, 0); return g; };

const PALETTE = { back: C(0x857461), side: C(0xae9679), breast: C(0xc19f8c), belly: C(0xd3c3a9), sheen: C(0xa0818e), crown: C(0x87939c), face: C(0xc4a88c), dark: C(0x1d1a18), primaries: C(0x4b4540), leg: C(0xc0605d), white: C(0xf1eee6), ring: C(0x9cc2d6), bill: C(0x2a2626), under: C(0xb3aea7) };
const grain = (c: THREE.Color, a: number, b: number) => c.multiplyScalar(0.95 + hash(Math.round(a * 60), Math.round(b * 30), 3) * 0.09);

let parts: { body: THREE.BufferGeometry; folded: THREE.BufferGeometry; head: THREE.BufferGeometry; wing: THREE.BufferGeometry; material: THREE.Material } | null = null;
/**
 * A mourning dove, about 30 cm from bill to tail tip: a plump buff body with a
 * pinkish breast and a faint lilac sheen on the neck, grey-brown back; a small
 * round head with a blue-grey crown, dark eye in a pale blue ring and the black
 * cheek spot; folded wings with the black spots on the coverts and dark
 * primaries crossing over a long pointed tail edged black and white; short
 * pink legs. Spread wings (for flight) are separate so they can beat.
 */
function doveParts() {
  if (parts) return parts;
  const P = PALETTE;
  const body = shell(BODY.rear, BODY.front, bodySection, (t, nx, ny) => {
    let c = P.side.clone();
    if (ny > 0.15) c.lerp(P.back, smooth(ny, 0.15, 0.7));
    else if (t > 0.45) c.lerp(P.breast, smooth(-ny, -0.1, 0.5) * smooth(t, 0.45, 0.75));
    if (ny < -0.2 && t < 0.55) c.lerp(P.belly, smooth(-ny, 0.2, 0.7) * smooth(0.55 - t, 0, 0.25));
    if (t > 0.82 && Math.abs(nx) > 0.55 && ny > -0.3) c.lerp(P.sheen, 0.45 * smooth(t, 0.82, 0.92));
    if (t > 0.9 && ny > 0.3) c.lerp(P.face, 0.5);
    return grain(c, t, Math.atan2(ny, nx));
  }, 24, 30);
  // The tail: a long wedge from under the wings, grey-brown down the middle,
  // the outer feathers banded black and tipped white; paler underneath.
  const tail = shell(-0.235, -0.07, (t) => { const w = 0.0145 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.86)), 0.75); return { w, h: 0.0032 + 0.002 * t, y: 0.058 + 0.004 * t }; }, (t, nx, ny) => {
    const edge = Math.abs(nx);
    if (edge > 0.6 && t < 0.2) return P.white.clone();
    if (edge > 0.55 && t < 0.3) return P.dark.clone();
    return (ny < 0 ? P.under.clone() : P.back.clone().lerp(P.dark, (1 - t) * 0.3));
  }, 14, 18);
  // Tail angled a little less steeply than the body, so its tip clears the ground.
  tail.translate(0, -0.058, 0.07); tail.rotateX(0.1); tail.translate(0, 0.058, -0.07);
  const legs: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const shank = new THREE.CylinderGeometry(0.0024, 0.0028, 0.03, 6); shank.rotateX(0.18); shank.translate(s * 0.012, 0.015, 0.006); legs.push(solid(shank, P.leg));
    for (const a of [-0.45, 0, 0.45, Math.PI]) {
      const toe = new THREE.CylinderGeometry(0.0013, 0.0016, a === Math.PI ? 0.011 : 0.017, 5); toe.rotateX(Math.PI / 2); toe.translate(0, 0.0014, a === Math.PI ? 0.0055 : 0.0085); toe.rotateY(a); toe.translate(s * 0.012, 0, 0.008);
      legs.push(solid(toe, P.leg));
    }
  }
  const bodyGeometry = merge([lean(body), lean(tail), ...legs]);
  // Folded wings: long, pointed, lying along the upper flanks with the tips
  // crossing over the base of the tail.
  const folded: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const spots = [[0.66, 0.32], [0.55, -0.12], [0.47, 0.4], [0.38, 0.02], [0.62, -0.5]];
    const wing = shell(-0.14, 0.052, (t) => {
      const z = -0.14 + t * 0.192, b = bodyAt(z), shape = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.02)), 0.55) * Math.min(1, t * 3.2);
      return { w: 0.0065 * shape + 0.0008, h: 0.024 * shape, x: side * Math.max(0.009, b.w * 0.86), y: Math.max(0.061, b.y + b.h * 0.42) };
    }, (t, nx, ny) => {
      let c = P.back.clone().lerp(P.side, 0.2);
      if (t < 0.34) c.lerp(P.primaries, smooth(0.34 - t, 0, 0.12));
      // Soft-edged oval spots (hard thresholds step along the vertex grid).
      if (nx * side > 0.1) for (const [st, sy] of spots) c.lerp(P.dark, smooth(0.15 - Math.hypot((t - st) * 3.4, ny - sy), -0.03, 0.03) * smooth(nx * side, 0.1, 0.35));
      if (ny > 0.7 && t > 0.6) c.lerp(P.side, 0.35);
      return grain(c, t, ny);
    }, 28, 56);
    folded.push(lean(wing));
  }
  const foldedGeometry = merge(folded);
  // Head, pivoting at the base of the neck (its origin): neck, skull, face, eye, bill.
  const skull = new THREE.SphereGeometry(0.0182, 22, 16); skull.scale(1, 0.94, 1.12); skull.translate(0, 0.019, 0.012);
  const head = [solid(skull, (p) => {
    const up = smooth(p.y, 0.022, 0.034) * smooth(0.032 - p.z, 0, 0.02);
    return P.face.clone().lerp(P.crown, up * 0.85);
  })];
  // The neck runs down into the body so no seam shows as the head bobs and pecks.
  const neck = new THREE.CylinderGeometry(0.0142, 0.021, 0.05, 18, 4, true); neck.translate(0, -0.006, -0.004); neck.rotateX(0.35);
  head.push(solid(neck, (p) => P.face.clone().lerp(P.side, smooth(-p.y, 0, 0.025)).lerp(P.sheen, 0.3 * smooth(Math.abs(p.x), 0.011, 0.018) * smooth(p.y, -0.02, 0)).lerp(P.breast, 0.4 * smooth(p.z, 0.008, 0.02) * smooth(-p.y, -0.01, 0.02))));
  for (const s of [-1, 1]) {
    const ring = new THREE.SphereGeometry(0.0037, 12, 8); ring.scale(0.45, 1, 1); ring.translate(s * 0.0161, 0.023, 0.02); head.push(solid(ring, P.ring));
    const eye = new THREE.SphereGeometry(0.0026, 12, 8); eye.translate(s * 0.0171, 0.023, 0.0205); head.push(solid(eye, P.dark));
    const spot = new THREE.SphereGeometry(0.0034, 10, 6); spot.scale(0.35, 1.2, 0.9); spot.translate(s * 0.0168, 0.0115, 0.0135); head.push(solid(spot, P.dark));
  }
  const bill = new THREE.ConeGeometry(0.0027, 0.014, 8); bill.rotateX(Math.PI / 2 + 0.12); bill.translate(0, 0.0165, 0.038); head.push(solid(bill, P.bill));
  const headGeometry = merge(head);
  // A right wing spread for flight, from the shoulder along +X: broad at the
  // arm, a long pointed hand; grey-brown above with dark primaries, pale grey below.
  const wing = new THREE.BoxGeometry(0.22, 0.004, 1, 16, 1, 5);
  const wp = wing.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < wp.count; i++) {
    const u = (wp.getX(i) + 0.11) / 0.22, v = wp.getZ(i) + 0.5;
    const chord = 0.078 * Math.pow(1 - Math.pow(u, 2.2), 0.7) + 0.006, leading = 0.022 - 0.035 * u * u;
    wp.setXYZ(i, u * 0.22, wp.getY(i) + Math.sin(u * Math.PI) * 0.008 - v * 0.004, leading - (1 - v) * chord);
  }
  wing.computeVertexNormals();
  const wingGeometry = solid(wing, (p, n) => {
    const u = p.x / 0.22;
    if (n.y < 0) return P.under.clone().lerp(P.primaries, smooth(u, 0.7, 1) * 0.5);
    const c = P.back.clone().lerp(P.primaries, smooth(u, 0.45, 0.62));
    if (u > 0.15 && u < 0.42 && hash(Math.round(p.x * 90), Math.round(p.z * 90), 7) > 0.82) c.copy(P.dark);
    return c;
  });
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, name: "Mourning dove" });
  parts = { body: bodyGeometry, folded: foldedGeometry, head: headGeometry, wing: wingGeometry, material };
  return parts;
}
/** Where the head pivots and the wings hinge, in the standing (leaning) body. */
const NECK = new THREE.Vector3(0, 0.089, 0.062).sub(new THREE.Vector3(0, BODY.centre, 0)).applyAxisAngle(new THREE.Vector3(1, 0, 0), -INCLINE).add(new THREE.Vector3(0, BODY.centre, 0));
const SHOULDER = new THREE.Vector3(0.028, 0.086, 0.035).sub(new THREE.Vector3(0, BODY.centre, 0)).applyAxisAngle(new THREE.Vector3(1, 0, 0), -INCLINE).add(new THREE.Vector3(0, BODY.centre, 0));

function makeDove(scene: THREE.Scene): Pick<Dove, "root" | "head" | "wingL" | "wingR" | "folded"> {
  const p = doveParts(), root = new THREE.Group();
  root.name = "Mourning dove";
  // They fly about: no snow or wet shading hooked onto them (weather.ts).
  root.userData.weatherDynamic = true;
  const body = new THREE.Mesh(p.body, p.material), folded = new THREE.Mesh(p.folded, p.material), head = new THREE.Mesh(p.head, p.material);
  const wingR = new THREE.Mesh(p.wing, p.material), wingL = new THREE.Mesh(p.wing, p.material);
  wingL.scale.x = -1;
  head.position.copy(NECK);
  for (const [w, s] of [[wingL, -1], [wingR, 1]] as const) { w.position.set(s * SHOULDER.x, SHOULDER.y, SHOULDER.z); w.visible = false; }
  for (const m of [body, folded, head, wingL, wingR]) { m.castShadow = true; root.add(m); }
  scene.add(root);
  return { root, head, wingL, wingR, folded };
}

// ---- the flock ---------------------------------------------------------------------------
export class Doves {
  private doves: Dove[] = [];
  private food: Food[] = [];
  private snacks: Snack[] = [];
  private splats: Splat[] = [];
  private cooCooldown = 6;
  private snackIn = 90 + Math.random() * 120;
  private splatMaterial = new THREE.MeshStandardMaterial({ color: 0xf1f0ea, roughness: 0.55, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  private splatGeometry: THREE.BufferGeometry;
  /** A splat landed on the rider (`at` is where). */
  onPoopHit: (at: THREE.Vector3) => void = () => {};
  /** A snack was picked clean: its empty bag is litter now, at `at`. */
  onSnackEmpty: (at: THREE.Vector3) => void = () => {};
  /** Picnic tables a snack can be left on (table top positions). */
  tables: THREE.Vector3[] = [];

  constructor(private scene: THREE.Scene, private audio: AudioEngine, private world: DoveWorld) {
    // A splat: an irregular white blot with a grey centre.
    const shape = new THREE.CircleGeometry(0.035, 14), p = shape.attributes.position as THREE.BufferAttribute, colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y), k = r > 0 ? 0.75 + hash(i, 3, 9) * 0.55 : 1;
      p.setXY(i, x * k, y * k * 0.85);
      const c = r < 0.012 ? C(0x9a968c) : C(0xf4f2ec); colors.push(c.r, c.g, c.b);
    }
    shape.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    shape.rotateX(-Math.PI / 2);
    this.splatGeometry = shape;
    this.splatMaterial.vertexColors = true;
    const perches = world.perches;
    for (let i = 0; i < COUNT && perches.length; i++) {
      const perch = perches[(i * 7 + 3) % perches.length].clone();
      const d: Dove = { ...makeDove(scene), carry: null, state: "perch", timer: 10 + Math.random() * 40, position: perch.clone(), yaw: Math.random() * Math.PI * 2, step: 0, peck: 0, coo: 8 + Math.random() * 30, poop: 40 + Math.random() * 90, perch, flap: 0 };
      this.doves.push(d);
      // A couple start on the lawn.
      if (i >= COUNT - 2) { const spot = world.landing(perch); if (spot) { d.state = "ground"; d.position.copy(spot); d.timer = 12 + Math.random() * 20; } }
      this.pose(d, 0);
    }
  }

  /** Crumbs dropped where someone ate chips (or shaken out of a tossed chip bag: fewer, closer). */
  addCrumbs(at: THREE.Vector3, count = 5, near = 0.25, spread = 0.45) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = near + Math.random() * spread, x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      const crumb = this.chipPiece(0.35 + Math.random() * 0.3);
      crumb.position.set(x, this.world.ground(x, z) + 0.004, z);
      this.scene.add(crumb);
      this.food.push({ kind: "crumb", object: crumb, position: crumb.position.clone(), taken: false });
    }
  }
  /** An open bag of chips left on a picnic table, a few chips spilled beside it. */
  leaveSnack(at: THREE.Vector3) {
    const bag = litterModel("wrapper").object;
    bag.position.copy(at).setY(at.y + 0.008); bag.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(bag);
    const snack: Snack = { bag, chips: [], empty: 0 };
    for (let i = 0; i < 6; i++) {
      const chip = this.chipPiece(1), a = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.16;
      chip.position.set(at.x + Math.cos(a) * r, at.y + 0.006, at.z + Math.sin(a) * r);
      this.scene.add(chip);
      const food: Food = { kind: "chip", object: chip, position: chip.position.clone(), taken: false, snack };
      snack.chips.push(food); this.food.push(food);
    }
    this.snacks.push(snack);
  }
  private chipGeometry: THREE.BufferGeometry | null = null;
  private chipMaterial = new THREE.MeshStandardMaterial({ color: 0xe8c56a, roughness: 0.7 });
  /** A potato chip: a thin, curled oval. */
  private chipPiece(size: number) {
    if (!this.chipGeometry) {
      const g = new THREE.SphereGeometry(0.02, 10, 4, 0, Math.PI * 2, 0, 0.5), p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setY(i, (p.getY(i) - 0.0175) * 0.8 + Math.sin(p.getX(i) * 120) * 0.0015);
      g.scale(1, 1, 0.75); g.computeVertexNormals();
      this.chipGeometry = g;
    }
    const m = new THREE.Mesh(this.chipGeometry, this.chipMaterial);
    m.scale.setScalar(size); m.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 6.3, (Math.random() - 0.5) * 0.4);
    m.castShadow = true;
    return m;
  }

  update(dt: number, ctx: DoveContext) {
    const roost = ctx.night > 0.6 || ctx.rain > 0.5;
    this.cooCooldown -= dt;
    this.snackIn -= dt;
    if (this.snackIn <= 0) {
      this.snackIn = 150 + Math.random() * 150;
      if (!this.snacks.length && this.tables.length && !roost) this.leaveSnack(this.tables[Math.floor(Math.random() * this.tables.length)]);
    }
    for (const d of this.doves) {
      d.timer -= dt;
      const near = Math.hypot(d.position.x - ctx.rider.x, d.position.z - ctx.rider.z), flee = ctx.speed > 3 ? FLEE_RIDING : FLEE_ON_FOOT;
      const low = d.position.y - this.world.ground(d.position.x, d.position.z) < 1.6;
      // Too close: a clatter of wings and off to a tree.
      if ((d.state === "ground" || d.state === "feed" || (d.state === "perch" && low)) && near < flee && Math.abs(d.position.y - ctx.rider.y) < 2.5) { this.release(d); this.flyTo(d, this.perchAwayFrom(ctx.rider), "perch"); continue; }
      if (d.state === "fly") { this.stepFlight(d, dt); continue; }
      if (roost && d.state !== "perch") { this.release(d); this.flyTo(d, this.randomPerch(d.position), "perch"); continue; }
      if (d.state === "perch") {
        d.coo -= dt; d.poop -= dt;
        // Mourning doves call most in the morning and evening, never at night.
        if (d.coo <= 0) { d.coo = 18 + Math.random() * 40; if (!roost && this.cooCooldown <= 0 && near < 90) { this.cooCooldown = 7; this.play(SOUNDS.coo, d.position, 0.9, 0.96 + Math.random() * 0.08, 6, 85); } }
        // Only where someone is about to see it (and see it fade); a dove right over the rider now and then scores.
        if (d.poop <= 0) { if (near > 30) d.poop = 15 + Math.random() * 25; else { d.poop = 70 + Math.random() * 120; if (Math.random() < 0.6) this.poop(d, ctx); } }
        else if (near < 1.2 && ctx.rider.y < d.position.y - 1 && Math.random() < dt * 0.03) { d.poop = 60 + Math.random() * 60; this.onPoopHit(ctx.rider.clone()); }
        if (d.timer <= 0 && !roost) this.decide(d, ctx);
      } else if (d.state === "ground") {
        this.stroll(d, dt);
        if (d.timer <= 0) { this.release(d); this.flyTo(d, this.randomPerch(d.position), "perch"); }
        else { const f = this.nearestFood(d.position, 14); if (f) this.approachFood(d, f); }
      } else if (d.state === "feed") this.feed(d, dt, ctx);
      this.pose(d, dt);
    }
    this.stepSplats(dt);
  }

  private decide(d: Dove, ctx: DoveContext) {
    const food = this.nearestFood(d.position, 45);
    const r = Math.random();
    if (food && r < 0.75) { this.approachFood(d, food); return; }
    const onGround = this.doves.filter((o) => o.state === "ground" || o.state === "feed" || (o.state === "fly" && o.flight?.then !== "perch")).length;
    if (r < 0.4 && onGround < 3) {
      const spot = this.world.landing(d.position);
      if (spot && Math.hypot(spot.x - ctx.rider.x, spot.z - ctx.rider.z) > 7) { this.flyTo(d, spot, "ground"); return; }
    }
    if (r < 0.75) this.flyTo(d, this.randomPerch(d.position), "perch");
    else d.timer = 15 + Math.random() * 40;
  }
  private approachFood(d: Dove, f: Food | THREE.Object3D) {
    if (f instanceof THREE.Object3D) {
      // Litter: land beside it and pick through it.
      const at = f.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
      at.y = this.world.ground(at.x, at.z);
      d.food = { kind: "crumb", object: f, position: f.position.clone(), taken: false };
      this.flyTo(d, at, "feed");
      return;
    }
    f.claimed = d; d.food = f;
    const at = f.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.35, 0, (Math.random() - 0.5) * 0.35));
    at.y = f.kind === "chip" ? f.position.y - 0.006 : this.world.ground(at.x, at.z);
    if (d.state === "ground" && d.position.distanceTo(at) < 3) { d.state = "feed"; d.walk = at; d.timer = 8; }
    else this.flyTo(d, at, "feed", f);
  }
  private nearestFood(from: THREE.Vector3, reach: number): Food | THREE.Object3D | null {
    let best: Food | THREE.Object3D | null = null, bestD = reach;
    for (const f of this.food) if (!f.taken && !f.claimed) { const dd = f.position.distanceTo(from); if (dd < bestD) { bestD = dd; best = f; } }
    if (best) return best;
    for (const l of this.world.litter()) { const dd = l.position.distanceTo(from); if (dd < bestD * 0.6 && !this.doves.some((o) => o.food?.object === l)) { bestD = dd; best = l; } }
    return best;
  }
  private release(d: Dove) { if (d.food && d.food.claimed === d) d.food.claimed = undefined; d.food = undefined; d.walk = undefined; }

  /** Walks the lawn in short runs, head bobbing, stopping to peck. */
  private stroll(d: Dove, dt: number) {
    if (!d.walk || d.position.distanceTo(d.walk) < 0.05) {
      if (Math.random() < dt * 0.8) { const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 1.2; d.walk = d.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
      else if (Math.random() < dt * 0.9) d.peck = 0.45;
    }
    this.walkTowards(d, dt, 0.32);
  }
  private walkTowards(d: Dove, dt: number, speed: number) {
    if (!d.walk || d.peck > 0) { d.peck = Math.max(0, d.peck - dt); return; }
    const to = d.walk.clone().sub(d.position).setY(0), dist = to.length();
    if (dist < 0.03) return;
    d.yaw += wrap(Math.atan2(to.x, to.z) - d.yaw) * Math.min(1, dt * 8);
    d.position.addScaledVector(to.normalize(), Math.min(dist, speed * dt));
    d.position.y = this.world.ground(d.position.x, d.position.z);
    d.step += dt * speed * 22;
  }
  /** At the food: walk up, peck; crumbs and chips are taken, litter is picked through. */
  private feed(d: Dove, dt: number, ctx: DoveContext) {
    const f = d.food;
    if (!f || f.taken) { this.release(d); d.state = "ground"; d.timer = 6 + Math.random() * 10; return; }
    const beside = f.position.clone().add(new THREE.Vector3(Math.sin(d.yaw + Math.PI) * 0.09, 0, Math.cos(d.yaw + Math.PI) * 0.09));
    d.walk = beside.setY(d.position.y);
    if (d.position.distanceTo(d.walk) > 0.06) { this.walkTowards(d, dt, 0.35); if (d.position.distanceTo(f.position) > 0.3) return; }
    d.yaw += wrap(Math.atan2(f.position.x - d.position.x, f.position.z - d.position.z) - d.yaw) * Math.min(1, dt * 6);
    if (d.peck <= 0) {
      d.peck = 0.4;
      if (f.kind === "chip" || (f.kind === "crumb" && this.food.includes(f))) {
        if (Math.random() < 0.34) {
          f.taken = true;
          this.food = this.food.filter((o) => o !== f);
          if (f.kind === "chip") {
            // Stolen: off it goes with the chip in its beak.
            d.carry = f.object; d.head.add(f.object); f.object.position.set(0, 0.014, 0.05); f.object.rotation.set(0, 0, 0); f.object.scale.setScalar(0.55);
            const snack = f.snack!;
            snack.empty++;
            if (snack.empty >= snack.chips.length) this.emptySnack(snack);
            d.food = undefined;
            this.flyTo(d, this.perchAwayFrom(ctx.rider), "perch");
          } else { f.object.removeFromParent(); d.food = undefined; }
        }
      } else {
        // Picking through litter: it shifts under the beak.
        f.object.rotation.y += (Math.random() - 0.5) * 0.4;
        f.object.position.x += (Math.random() - 0.5) * 0.015; f.object.position.z += (Math.random() - 0.5) * 0.015;
        if (Math.random() < 0.12) { d.food = undefined; d.state = "ground"; d.timer = 5 + Math.random() * 10; }
      }
    } else d.peck = Math.max(0, d.peck - dt);
    d.timer -= dt;
    if (d.timer < -30) { this.release(d); d.state = "ground"; d.timer = 5; }
  }
  private emptySnack(snack: Snack) {
    this.snacks = this.snacks.filter((s) => s !== snack);
    const at = snack.bag.position.clone();
    snack.bag.removeFromParent();
    this.onSnackEmpty(at);
  }

  private flyTo(d: Dove, to: THREE.Vector3, then: State, food?: Food) {
    const from = d.position.clone(), dist = from.distanceTo(to);
    const via = from.clone().lerp(to, 0.5);
    via.y = Math.max(from.y, to.y) + THREE.MathUtils.clamp(dist * 0.18, 1.2, 9);
    d.flight = { from, via, to: to.clone(), t: 0, duration: Math.max(0.8, dist / SPEED + 0.6), then, food };
    d.state = "fly"; d.flap = 0;
    d.perch = then === "perch" ? to.clone() : undefined;
    this.play(SOUNDS.flaps[Math.floor(Math.random() * SOUNDS.flaps.length)], from, 0.8, 0.95 + Math.random() * 0.1, 3, 45);
  }
  private stepFlight(d: Dove, dt: number) {
    const f = d.flight!;
    f.t = Math.min(1, f.t + dt / f.duration);
    // Quick climb out, a straight run, then a glide down and a flare to land.
    const u = f.t < 0.5 ? 0.5 * Math.pow(f.t * 2, 0.85) : 1 - 0.5 * Math.pow((1 - f.t) * 2, 1.35);
    const a = f.from.clone().lerp(f.via, u), b = f.via.clone().lerp(f.to, u), p = a.lerp(b, u);
    const move = p.clone().sub(d.position);
    if (move.lengthSq() > 1e-8) d.yaw += wrap(Math.atan2(move.x, move.z) - d.yaw) * Math.min(1, dt * 10);
    d.position.copy(p);
    d.flap += dt;
    if (f.t >= 1) {
      d.flight = undefined;
      d.state = f.then;
      d.timer = f.then === "perch" ? 25 + Math.random() * 60 : 15 + Math.random() * 25;
      if (d.carry) { d.carry.removeFromParent(); d.carry = null; }
      if (f.then === "feed") { d.food = f.food ?? d.food; d.timer = 8; }
    }
    this.pose(d, dt, move.y / Math.max(dt, 1e-3));
  }
  private randomPerch(from: THREE.Vector3) {
    const near = this.world.perches.filter((p) => p.distanceTo(from) < 60);
    const list = near.length ? near : this.world.perches;
    return list[Math.floor(Math.random() * list.length)];
  }
  private perchAwayFrom(rider: THREE.Vector3) {
    const choices = this.world.perches.filter((p) => { const d = Math.hypot(p.x - rider.x, p.z - rider.z); return d > 8 && d < 45; });
    const list = choices.length ? choices : this.world.perches;
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Lets go from a perch: it drops straight down and leaves a splat where it lands. */
  private poop(d: Dove, ctx: DoveContext) {
    const x = d.position.x + (Math.random() - 0.5) * 0.05, z = d.position.z + (Math.random() - 0.5) * 0.05;
    if (Math.hypot(x - ctx.rider.x, z - ctx.rider.z) < 0.3 && ctx.rider.y < d.position.y) { this.onPoopHit(ctx.rider.clone()); return; }
    const y = this.world.below(x, d.position.y - 0.05, z);
    if (this.splats.length >= 6) { const old = this.splats.shift()!; old.mesh.removeFromParent(); (old.mesh.material as THREE.Material).dispose(); }
    const mesh = new THREE.Mesh(this.splatGeometry, this.splatMaterial.clone());
    mesh.position.set(x, y + 0.004, z); mesh.rotation.y = Math.random() * Math.PI * 2; mesh.scale.setScalar(0.8 + Math.random() * 0.5);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.splats.push({ mesh, age: 0, life: 7 + Math.random() * 3 });
  }
  private stepSplats(dt: number) {
    for (const s of this.splats) {
      s.age += dt;
      (s.mesh.material as THREE.MeshStandardMaterial).opacity = THREE.MathUtils.clamp((s.life - s.age) / 2.5, 0, 0.95);
    }
    for (const s of this.splats.filter((s) => s.age >= s.life)) { s.mesh.removeFromParent(); (s.mesh.material as THREE.Material).dispose(); }
    this.splats = this.splats.filter((s) => s.age < s.life);
  }

  /** The body, head and wings for this moment. `climb` is vertical speed in flight. */
  private pose(d: Dove, dt: number, climb = 0) {
    const r = d.root;
    r.position.copy(d.position);
    r.rotation.set(0, d.yaw, 0, "YXZ");
    const flying = d.state === "fly";
    d.folded.visible = !flying; d.wingL.visible = d.wingR.visible = flying;
    if (flying) {
      // Level out and pitch with the climb; wings beat hard on the way up, glide on the way down.
      const f = d.flight!, climbing = f.t < 0.4 || climb > 0.5, landing = f.t > 0.85;
      r.rotation.x = INCLINE + THREE.MathUtils.clamp(-climb * 0.06, -0.45, 0.45);
      const rate = climbing ? 9 : landing ? 8 : 6.5, beat = Math.sin(d.flap * rate * Math.PI * 2);
      const glide = !climbing && !landing && Math.sin(d.flap * 1.3) > 0.2;
      const lift = glide ? 0.1 : landing ? 0.45 + beat * 0.55 : 0.15 + beat * 0.8;
      // Flaring to land: tail down, wings cupped forward.
      if (landing) r.rotation.x = INCLINE - 0.75 * (f.t - 0.85) / 0.15;
      d.wingL.rotation.set(-INCLINE, 0, -lift); d.wingR.rotation.set(-INCLINE, 0, lift);
      d.head.position.copy(NECK);
      d.head.rotation.set(-INCLINE * 0.8, 0, 0);
      return;
    }
    const walking = d.walk && d.position.distanceTo(d.walk) > 0.04 && d.peck <= 0;
    // Pigeon-family head bob: thrust forward, then held still while the body catches up.
    const bob = walking ? (d.step % 1) : 0;
    const peck = d.peck > 0 ? Math.sin((1 - d.peck / 0.45) * Math.PI) : 0;
    d.head.position.set(0, NECK.y - peck * 0.035, NECK.z + (walking ? (bob < 0.35 ? bob / 0.35 : 1 - (bob - 0.35) / 0.65) * 0.016 : 0) + peck * 0.012);
    const look = d.state === "perch" ? Math.sin(performance.now() * 0.0007 + d.coo) * 0.5 : 0;
    d.head.rotation.set(peck * 1.15, look, 0);
    r.rotation.x = peck * 0.32 + (walking ? 0.1 : 0);
    r.rotation.z = walking ? Math.sin(d.step * Math.PI * 2) * 0.04 : 0;
  }

  private play(url: string, at: THREE.Vector3, gain: number, rate: number, near: number, far: number) {
    void this.audio.sample(url).then((buffer) => { if (buffer) this.audio.playAt(buffer, at, gain, rate, near, far); });
  }

  /** Where each dove is and what it is doing (tests). */
  get state() { return this.doves.map((d) => ({ state: d.state, position: d.position.clone(), carrying: !!d.carry })); }
  get splatCount() { return this.splats.length; }
  get foodLeft() { return this.food.filter((f) => !f.taken).length; }

  dispose() {
    for (const d of this.doves) d.root.removeFromParent();
    for (const f of this.food) f.object.removeFromParent();
    for (const s of this.snacks) s.bag.removeFromParent();
    for (const s of this.splats) { s.mesh.removeFromParent(); (s.mesh.material as THREE.Material).dispose(); }
    this.splatGeometry.dispose(); this.splatMaterial.dispose(); this.chipMaterial.dispose(); this.chipGeometry?.dispose();
  }
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
