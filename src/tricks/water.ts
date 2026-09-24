/**
 * Water tricks: what an on-foot jump into the lake is called and scores. Pure:
 * the simulation hands over how far the body turned about each axis and how it
 * was holding itself when it hit the water, and the entry attitude decides the
 * rest. Feet first or head first is a clean entry; anything flat is a flop.
 *
 * Rotation is counted in halves: a half front is a head-first Front Dive, a
 * whole one is a Front Flip, one and a half enters head first again, and so on.
 * Twists (about the body's long axis) are counted in completed 180s and named
 * like spins: Front Flip 360, 540 Twist.
 */
export interface WaterAir {
  /** Radians about the side axis, positive forward (front), negative backward. */
  flip: number;
  /** Radians about the forward axis (a side flip / cartwheel). */
  side: number;
  /** Radians about the body's own long axis. */
  twist: number;
  /** X held: tucked (knees to chest). */
  tuck: boolean;
  /** B held: arms spread (swan / star). */
  spread: boolean;
  /** Metres from the jump's peak down to where it met the water (or ground). */
  height: number;
  /** A backward rotation thrown off a forward run: a gainer. */
  gainer: boolean;
  /** Launched off the springboard. */
  board: boolean;
}
export type Entry = "feet" | "head" | "flat";
export interface WaterTrick {
  name: string;
  clean: boolean;
  /** Whole turns of the main rotation, for missions (a flip is 1). */
  rotations: number;
  points: number;
  entry: Entry;
  /** Half rotations counted for the name. */
  halves: number;
  /** Completed 180s of twist. */
  twists: number;
}

/** How close (in turns) to feet-first or head-first still counts as that entry. */
export const ENTRY_WINDOW = 0.18;

/** Feet first, head first or flat for a body rotated `angle` radians from upright. */
export function entryOf(angle: number): Entry {
  const turns = Math.abs(angle) / (Math.PI * 2), frac = turns - Math.floor(turns);
  if (frac < ENTRY_WINDOW || frac > 1 - ENTRY_WINDOW) return "feet";
  if (Math.abs(frac - 0.5) < ENTRY_WINDOW) return "head";
  return "flat";
}

const FRONT = ["", "Front Dive", "Front Flip", "Front 1½", "Double Front", "Front 2½", "Triple Front"];
const SIDE = ["", "Cartwheel Dive", "Side Flip", "Side 1½", "Double Side Flip", "Side 2½", "Triple Side Flip"];
function rotationName(halves: number, kind: "front" | "back" | "gainer" | "side") {
  if (kind === "side") return SIDE[halves] ?? `${halves / 2}x Side Flip`;
  if (kind === "front") return FRONT[halves] ?? `${halves / 2}x Front`;
  const base = kind === "gainer" ? "Gainer" : "Back";
  const names = ["", `${base} Dive`, kind === "gainer" ? "Gainer Flip" : "Back Flip", `${base} 1½`, `Double ${base}`, `${base} 2½`, `Triple ${base}`];
  return names[halves] ?? `${halves / 2}x ${base}`;
}

/** Points per half rotation by kind, per completed 180 of twist, and the plain jumps. */
export const WATER_POINTS = { front: 140, back: 160, gainer: 200, side: 150, twist: 110, cannonball: 80, star: 70, pencil: 40, swan: 250, flop: 15 } as const;

/**
 * Names and scores an entry. `ground` judges a landing on foot instead: only
 * feet first stands it up (the caller bails anything else).
 */
export function judgeWater(air: WaterAir, ground = false): WaterTrick {
  const useSide = Math.abs(air.side) > Math.abs(air.flip);
  const angle = useSide ? air.side : air.flip;
  const kind = useSide ? "side" : air.flip >= 0 ? "front" : air.gainer ? "gainer" : "back";
  const rotating = Math.abs(angle) > 0.35;
  const entry = rotating ? entryOf(angle) : "feet";
  const halves = rotating ? Math.round(Math.abs(angle) / Math.PI) : 0;
  const twists = Math.floor(Math.abs(air.twist) / Math.PI + 0.25);
  const rotations = +(Math.abs(angle) / (Math.PI * 2)).toFixed(2);
  const clean = ground ? entry === "feet" : entry !== "flat";
  const height = 1 + Math.min(6, Math.max(0, air.height - 1.2)) * 0.3;
  if (!clean) {
    const name = entry === "head" ? "Face Plant" : useSide ? "Side Smack" : kind === "front" ? "Belly Flop" : "Back Smack";
    return { name, clean, rotations, points: WATER_POINTS.flop, entry, halves, twists };
  }
  let name: string, points: number;
  if (halves > 0) {
    name = kind === "front" && halves === 1 && air.spread ? "Swan Dive" : rotationName(halves, kind);
    points = halves * WATER_POINTS[kind] + (name === "Swan Dive" ? WATER_POINTS.swan : 0);
  } else {
    name = air.tuck ? "Cannonball" : air.spread ? "Star Jump" : "Pencil Jump";
    points = air.tuck ? WATER_POINTS.cannonball : air.spread ? WATER_POINTS.star : WATER_POINTS.pencil;
  }
  if (twists > 0) {
    const degrees = twists * 180;
    name = halves > 0 ? `${name} ${degrees}` : `${degrees} Twist`;
    points = (halves > 0 ? points : 0) + twists * WATER_POINTS.twist;
    if (halves > 0) points *= 1.2;
  }
  // Head first and clean is a rip entry; height and the springboard multiply it all.
  points *= height * (entry === "head" ? 1.15 : 1) * (air.board ? 1.1 : 1);
  return { name, clean, rotations, points: Math.round(points / 10) * 10, entry, halves, twists };
}

/** Where the next clean attitude is, for a rotation that has been let go: the next whole half turn. */
export function settleTarget(angle: number, direction: number) {
  const halves = Math.abs(angle) / Math.PI;
  const next = Math.ceil(halves - 0.02);
  return Math.sign(direction || angle || 1) * next * Math.PI;
}
