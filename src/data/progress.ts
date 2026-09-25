// Progression: XP and levels, missions (career chains that climb in stages,
// plus three daily missions) and parts crates. Everything here is pure data
// and rules; CreditEconomy applies them to the saved profile in one
// transaction, so Credit, XP, crates and ownership can never disagree.
//
// Monetisation hook (not active): crates are the only source of the
// crate-exclusive colourways. A future paid crate must be granted by the
// server into its own entitlement table, never by editing this save.
import { PARTS } from "./scooterParts";
import { LONGBOARD_PARTS } from "./longboardParts";
import { ownershipKey } from "./catalog";
import { NOVELTY_KINDS, VENDING_KINDS, type ItemKind } from "./items";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_LABEL: Record<Rarity, string> = { common: "COMMON", rare: "RARE", epic: "EPIC", legendary: "LEGENDARY" };
export const RARITY_COLOR: Record<Rarity, string> = { common: "#b9c2c7", rare: "#35b6ff", epic: "#b36bff", legendary: "#ffb938" };

/**
 * Two crates (#76; there were four): the Street Crate, mostly everyday parts,
 * and the rare Legend Crate, the only real shot at Mafioso. Unopened Pro and
 * Signature crates from older saves become Street and Legend crates.
 */
export type CrateTier = "street" | "legend";
export const CRATE_TIERS: CrateTier[] = ["street", "legend"];
const OLD_TIERS: Record<string, CrateTier> = { pro: "street", signature: "legend" };
export const CRATE_NAME: Record<CrateTier, string> = { street: "Street Crate", legend: "Legend Crate" };
export const CRATE_COLOR: Record<CrateTier, string> = { street: "#35b6ff", legend: "#ffb938" };
export interface Crate { id: string; tier: CrateTier; source: string }

/** Lifetime counters and bests. Daily missions keep their own copy for the day. */
export const STATS = ["tricks", "perfect", "grinds", "flips", "spins", "whips", "bestLine", "bestLinePoints", "points", "bhillRuns", "bhillTop", "maps", "purchases", "cratesOpened", "combos", "litter"] as const;
export type Stat = (typeof STATS)[number];
/** Stats that keep the best value instead of adding up. */
const BEST: Stat[] = ["bestLine", "bestLinePoints", "bhillTop", "maps"];

export interface Progress {
  xp: number;
  stats: Record<Stat, number>;
  /** Career chain id -> stages completed. */
  career: Record<string, number>;
  daily: { day: string; ids: string[]; stats: Record<Stat, number>; done: string[]; bonus: boolean };
  crates: Crate[];
  /** Maps ridden (for the Explorer chain). */
  visited: string[];
  /** One-time "firsts" seen while riding (STARTER missions): push, trick:Tailwhip, phone... */
  firsts: string[];
  /** How many times each counted STARTER step was done so far (5 Tailwhips...). */
  counts: Record<string, number>;
  /** Trick tracker (#59): landings per trick part (Tailwhip, Barspin, 360...). */
  tally: Record<string, number>;
  /** Trick tracker: multi-part tricks by their full name (360° Tailwhip + Barspin). */
  comboTricks: Record<string, number>;
  /** STARTER missions completed (and paid). */
  starter: string[];
  /** Highest level whose Coins and crate were granted, so a level never pays twice. */
  topLevel: number;
  /** Highest level whose Bucks were paid (#76); older saves start at 0 and are paid for levels already reached. */
  bucksLevel: number;
}

const zeroStats = () => Object.fromEntries(STATS.map((s) => [s, 0])) as Record<Stat, number>;
export const emptyProgress = (): Progress => ({ xp: 0, stats: zeroStats(), career: Object.fromEntries(CAREER.map((c) => [c.id, 0])), daily: { day: "", ids: [], stats: zeroStats(), done: [], bonus: false }, crates: [], visited: [], firsts: [], counts: {}, tally: {}, comboTricks: {}, starter: [], topLevel: 1, bucksLevel: 1 });

const int = (v: unknown, max = 1e9) => (Number.isSafeInteger(v) && (v as number) >= 0 ? Math.min(v as number, max) : 0);
const strings = (v: unknown, max = 200) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && s.length <= 80))].slice(0, max) : []);
export function validProgress(value: any): Progress {
  const p = emptyProgress();
  if (!value || typeof value !== "object") return p;
  p.xp = int(value.xp);
  for (const s of STATS) { p.stats[s] = int(value.stats?.[s]); p.daily.stats[s] = int(value.daily?.stats?.[s]); }
  for (const chain of CAREER) p.career[chain.id] = Math.min(chain.goals.length, int(value.career?.[chain.id]));
  if (typeof value.daily?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.daily.day)) {
    p.daily.day = value.daily.day;
    p.daily.ids = strings(value.daily.ids, 3).filter((id) => DAILY.some((d) => d.id === id));
    p.daily.done = strings(value.daily.done, 3).filter((id) => p.daily.ids.includes(id));
    p.daily.bonus = value.daily.bonus === true;
  }
  p.crates = (Array.isArray(value.crates) ? value.crates : [])
    .map((c: any) => (c && OLD_TIERS[c.tier] ? { ...c, tier: OLD_TIERS[c.tier] } : c))
    .filter((c: any) => c && typeof c.id === "string" && /^[a-z0-9-]{6,64}$/.test(c.id) && CRATE_TIERS.includes(c.tier))
    .slice(0, 99).map((c: any) => ({ id: c.id, tier: c.tier, source: typeof c.source === "string" ? c.source.slice(0, 60) : "" }));
  p.visited = strings(value.visited, 20);
  p.firsts = strings(value.firsts, 100).filter((f) => FIRSTS.has(f));
  p.tally = validTable(value.tally);
  p.comboTricks = validTable(value.comboTricks);
  for (const m of STARTER) if ((m.count ?? 1) > 1 && !p.firsts.includes(m.first)) { const n = int(value.counts?.[m.first], m.count! - 1); if (n) p.counts[m.first] = n; }
  p.starter = strings(value.starter, 100).filter((id) => STARTER.some((m) => m.id === id));
  // Saves from before the level curve changed keep every level they were paid
  // for (on the old curve), so passing those levels again pays nothing twice.
  p.topLevel = Math.max(levelFor(p.xp).level, Number.isSafeInteger(value.topLevel) ? Math.min(999, Math.max(1, value.topLevel)) : legacyLevel(p.xp));
  p.bucksLevel = Number.isSafeInteger(value.bucksLevel) ? Math.min(p.topLevel, Math.max(0, value.bucksLevel)) : 0;
  return p;
}

// ---- Trick tracker (#59) --------------------------------------------------------
/** At most this many different tricks (and combos) are kept; the least-landed make room. */
export const LANDED_MAX = 300;
const validTrickName = (name: string) => name.length > 0 && name.length <= 80 && /^[\p{L}\p{N} +\-'&./°×]+$/u.test(name);
/** One trick part as the tally names it: "360°" is a 360, "2× Backflip" a Double Backflip. */
export function tallyPart(part: string) {
  return part.trim().replace(/°$/, "").replace(/^2× /, "Double ").replace(/^3× /, "Triple ").replace(/^4× /, "Quad ");
}
/** The tally's plural label: Tailwhips, 360s, Kickless stays Kickless. */
export function tallyLabel(name: string) {
  if (/^\d+$/.test(name)) return name + "s";
  if (/(ss|less|s)$/i.test(name)) return name;
  return name + "s";
}
export const TALLY_GROUPS = ["FLIPS", "SPINS", "WHIPS & BARSPINS", "GRINDS & MANUALS", "GRABS & MORE"] as const;
export function tallyGroup(name: string): (typeof TALLY_GROUPS)[number] {
  if (/^\d+$/.test(name)) return "SPINS";
  if (/flip|flair|truck driver/i.test(name)) return "FLIPS";
  if (/whip|barspin|bri\b|inward|kickless|decade|buttercup|bar twist|finger/i.test(name)) return "WHIPS & BARSPINS";
  if (/grind|manual|stall|feeble|smith|crooked|50-50|lipslide|boardslide|nose ?slide/i.test(name)) return "GRINDS & MANUALS";
  return "GRABS & MORE";
}
function bump(table: Record<string, number>, adds: Record<string, number>) {
  for (const [name, n] of Object.entries(adds)) {
    if (!validTrickName(name) || !Number.isSafeInteger(n) || n <= 0) continue;
    table[name] = Math.min(1e9, (table[name] ?? 0) + n);
  }
  const keys = Object.keys(table);
  if (keys.length > LANDED_MAX) for (const k of keys.sort((a, b) => table[a] - table[b]).slice(0, keys.length - LANDED_MAX)) delete table[k];
}
function validTable(value: unknown) {
  const out: Record<string, number> = {};
  if (value && typeof value === "object") for (const [name, n] of Object.entries(value).slice(0, LANDED_MAX)) if (validTrickName(name) && int(n)) out[name] = int(n);
  return out;
}
export interface Landed { tally?: Record<string, number>; combos?: Record<string, number> }
/** Adds landed tricks: each part to the tally, and multi-part tricks to the combo list. */
export function addLanded(p: Progress, landed: Landed) {
  if (landed.tally) bump(p.tally, landed.tally);
  if (landed.combos) bump(p.comboTricks, landed.combos);
}
/** Everything the TRICKS app shows: totals, the tally by kind, and combo tricks. */
export function trickBook(p: Progress) {
  const byCount = (table: Record<string, number>) => Object.entries(table).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const tally = byCount(p.tally);
  const groups = TALLY_GROUPS.map((title) => ({ title, rows: tally.filter((t) => tallyGroup(t.name) === title).map((t) => ({ label: tallyLabel(t.name), count: t.count })) })).filter((g) => g.rows.length);
  const combos = byCount(p.comboTricks);
  return {
    totals: { tricks: p.stats.tricks, combos: p.stats.combos, comboTricks: combos.reduce((n, t) => n + t.count, 0), different: tally.length, perfect: p.stats.perfect, grinds: p.stats.grinds, bestLine: p.stats.bestLine, bestLinePoints: p.stats.bestLinePoints, points: p.stats.points },
    groups, combos,
  };
}

// ---- Levels -------------------------------------------------------------------
/**
 * XP to go from `level` to the next: each level asks more. Levels come mostly
 * from missions (bigger missions pay more XP); ordinary riding adds a trickle.
 */
export const levelNeed = (level: number) => 600 + 300 * (level - 1);
/** The level a save had on the first curve (200 + 75 per level), for migration only. */
function legacyLevel(xp: number) {
  let level = 1, into = Math.max(0, Math.floor(xp));
  while (into >= 200 + 75 * (level - 1) && level < 999) { into -= 200 + 75 * (level - 1); level++; }
  return level;
}
export function levelFor(xp: number) {
  let level = 1, into = Math.max(0, Math.floor(xp));
  while (into >= levelNeed(level) && level < 999) { into -= levelNeed(level); level++; }
  return { level, into, need: levelNeed(level) };
}
/**
 * What a level-up gives (#55): exactly one thing. Every fifth level pays
 * BUCKS_PER_FIVE_LEVELS Bucks (#76: the only free source of the premium
 * currency, so it comes very slowly); any other level rolls a Street Crate now
 * and then (rarer than before), and otherwise a novelty (a rubber duck, a
 * kazoo...) or a snack. Seeded by the level, so a reload can never re-roll it.
 */
export const BUCKS_PER_FIVE_LEVELS = 5;
export type LevelReward = { kind: "crate"; tier: CrateTier } | { kind: "item"; item: ItemKind } | { kind: "bucks"; amount: number };
export function levelReward(level: number): LevelReward {
  if (level % 5 === 0) return { kind: "bucks", amount: BUCKS_PER_FIVE_LEVELS };
  const random = seeded(hash("level:" + level)), roll = random();
  if (roll < 0.12) return { kind: "crate", tier: "street" };
  const pool: readonly ItemKind[] = roll < 0.7 ? NOVELTY_KINDS : VENDING_KINDS;
  return { kind: "item", item: pool[Math.floor(random() * pool.length)] };
}
export const levelRewardLabel = (r: LevelReward) => (r.kind === "crate" ? CRATE_NAME[r.tier] : r.kind === "bucks" ? r.amount + " Bucks" : r.item);
/** Riding XP from one banked line: a trickle, capped, so levels come from missions. */
export const trickXp = (points: number) => Math.min(15, Math.max(1, Math.round(points / 400)));

// ---- Missions -------------------------------------------------------------------
export interface Reward { credit: number; xp: number; crate?: CrateTier }
export interface CareerChain { id: string; stat: Stat; goals: number[]; title: (goal: number) => string; detail: string }
const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
export const CAREER: CareerChain[] = [
  { id: "landings", stat: "tricks", goals: [10, 50, 150, 400, 1000], title: (n) => `Land ${n} tricks`, detail: "Any trick you ride away from" },
  { id: "perfect", stat: "perfect", goals: [5, 25, 75, 200, 500], title: (n) => `${n} PERFECT landings`, detail: "Bolt it: land square and centred" },
  { id: "rails", stat: "grinds", goals: [5, 25, 75, 200, 500], title: (n) => `Lock ${n} grinds`, detail: "Rails, ledges, benches and coping" },
  { id: "combo", stat: "bestLine", goals: [3, 5, 8, 12, 16], title: (n) => `${n}-trick line`, detail: "Link tricks without a bail" },
  { id: "bigline", stat: "bestLinePoints", goals: [1500, 5000, 15000, 40000, 100000], title: (n) => `Bank ${n.toLocaleString("en-US")} in one line`, detail: "Points from a single unbroken line" },
  { id: "whips", stat: "whips", goals: [5, 25, 75, 200], title: (n) => `${n} whips and barspins`, detail: "Tailwhips, barspins, bris and friends" },
  { id: "flips", stat: "flips", goals: [3, 10, 30, 80], title: (n) => `Land ${n} flips`, detail: "Backflips and frontflips (the first one is a Starter mission)" },
  { id: "spins", stat: "spins", goals: [5, 15, 50, 150], title: (n) => `${n} spins of 360+`, detail: "Full rotations, off anything" },
  { id: "bhill", stat: "bhillRuns", goals: [1, 3, 10, 25], title: (n) => (n === 1 ? "Bomb B Hill top to bottom" : `Finish ${n} B Hill runs`), detail: "Start at the top banner, finish at the bottom" },
  { id: "velocity", stat: "bhillTop", goals: [18, 22, 26, 28], title: (n) => `Hit ${Math.round(n * 3.6)} km/h on B Hill`, detail: "Tuck, hold your line, trust it" },
  { id: "explorer", stat: "maps", goals: [2, 4, 6], title: (n) => `Ride ${n} different spots`, detail: "Every map counts once" },
  { id: "cleanup", stat: "litter", goals: [10, 50, 100, 250, 500], title: (n) => `Bin ${n} pieces of litter`, detail: "Pick up other people's trash and throw it away" },
  { id: "collector", stat: "purchases", goals: [1, 5, 15, 30], title: (n) => (n === 1 ? "Buy your first part" : `Buy ${n} parts`), detail: "Any shop, any colourway" },
];
export const careerTitle = (chain: CareerChain, stage: number) => `${chain.title(chain.goals[Math.min(stage, chain.goals.length - 1)])} ${ROMAN[stage] ?? ""}`.trim();
/** Career stages (#76): fewer Coins than before, a Street Crate at stage III and a Legend Crate only at stage V. */
export function careerReward(stage: number): Reward {
  const credit = [20, 40, 60, 100, 150][stage] ?? 150, xp = [80, 200, 450, 800, 1300][stage] ?? 1300;
  return { credit, xp, crate: stage === 2 ? "street" : stage === 4 ? "legend" : undefined };
}

export interface DailyMission { id: string; stat: Stat; goal: number; title: string }
export const DAILY: DailyMission[] = [
  { id: "d-tricks", stat: "tricks", goal: 25, title: "Land 25 tricks" },
  { id: "d-perfect", stat: "perfect", goal: 8, title: "8 PERFECT landings" },
  { id: "d-grinds", stat: "grinds", goal: 10, title: "Lock 10 grinds" },
  { id: "d-line", stat: "bestLine", goal: 5, title: "Land a 5-trick line" },
  { id: "d-points", stat: "bestLinePoints", goal: 4000, title: "Bank 4,000 in one line" },
  { id: "d-whips", stat: "whips", goal: 8, title: "8 whips or barspins" },
  { id: "d-flips", stat: "flips", goal: 3, title: "Land 3 flips" },
  { id: "d-spins", stat: "spins", goal: 6, title: "6 spins of 360+" },
  { id: "d-bhill", stat: "bhillRuns", goal: 1, title: "Finish a B Hill run" },
  { id: "d-banked", stat: "points", goal: 20000, title: "Bank 20,000 points" },
];
export const DAILY_REWARD: Reward = { credit: 25, xp: 120 };
export const DAILY_BONUS: Reward = { credit: 40, xp: 250 };

// ---- Starter missions -------------------------------------------------------------
/**
 * One-time missions that teach the game, each paid once. `first` names the
 * thing to do once (MissionTracker reports it); rewards come from the tier so
 * the economy can be tuned in one place. Only tricks the resolver really
 * names are used (tricks/resolver.ts).
 */
export type StarterTier = "intro" | "basic" | "skill" | "big";
export const STARTER_REWARD: Record<StarterTier, Reward> = {
  intro: { credit: 10, xp: 40 },
  basic: { credit: 15, xp: 70 },
  skill: { credit: 25, xp: 120 },
  big: { credit: 50, xp: 220 },
};
/**
 * `count`: how many times it must be done (default once). Simple tricks ask
 * for 5 and skill tricks for 3, so a mission is a small goal, not a pop-up
 * for every first try; big tricks and one-time steps stay at one.
 */
export interface StarterMission { id: string; group: string; title: string; how: string; tier: StarterTier; first: string; count?: number }
export const STARTER: StarterMission[] = [
  { id: "s-push", group: "RIDING", title: "Push off", how: "Push to pick up speed", tier: "intro", first: "push" },
  { id: "s-speed", group: "RIDING", title: "Hit 20 km/h", how: "Push hard or roll downhill", tier: "intro", first: "speed" },
  { id: "s-distance", group: "RIDING", title: "Ride 150 metres", how: "Cruise around without bailing", tier: "intro", first: "distance" },
  { id: "s-tailwhip", group: "TRICKS", title: "Land 5 Tailwhips", how: "Pop and whip the deck around", tier: "basic", first: "trick:Tailwhip", count: 5 },
  { id: "s-barspin", group: "TRICKS", title: "Land 5 Barspins", how: "Pop and spin the bars round", tier: "basic", first: "trick:Barspin", count: 5 },
  { id: "s-180", group: "TRICKS", title: "Land 5 180s", how: "Pop and turn half way round", tier: "basic", first: "spin:180", count: 5 },
  { id: "s-360", group: "TRICKS", title: "Land 3 360s", how: "Off a ramp, turn all the way round", tier: "skill", first: "spin:360", count: 3 },
  { id: "s-manual", group: "TRICKS", title: "Hold 5 Manuals", how: "RS gently down, then balance", tier: "basic", first: "trick:Manual", count: 5 },
  { id: "s-nose-manual", group: "TRICKS", title: "Hold 5 Nose Manuals", how: "RS gently up, then balance", tier: "basic", first: "trick:Nose Manual", count: 5 },
  { id: "s-quarter", group: "RAMPS", title: "Air a quarter pipe 5 times", how: "Ride up a quarter, fly off the lip", tier: "basic", first: "quarterAir", count: 5 },
  { id: "s-reentry", group: "RAMPS", title: "Land back into a quarter 3 times", how: "Air a quarter, land back in it", tier: "skill", first: "quarterLand", count: 3 },
  { id: "s-grind", group: "GRINDS", title: "Lock 5 grinds", how: "Pop onto a rail or ledge (RT helps)", tier: "basic", first: "grind", count: 5 },
  { id: "s-long-grind", group: "GRINDS", title: "Grind 3 metres, 3 times", how: "Hold one grind for 3 metres", tier: "skill", first: "grindLong", count: 3 },
  { id: "s-backflip", group: "BIG TRICKS", title: "Land a Backflip", how: "In the air: LT + RT, LS back", tier: "big", first: "trick:Backflip" },
  { id: "s-frontflip", group: "BIG TRICKS", title: "Land a Frontflip", how: "In the air: LT + RT, LS forward", tier: "big", first: "trick:Frontflip" },
  { id: "s-bri", group: "BIG TRICKS", title: "Land a Bri Flip", how: "RS down, round and out to the side", tier: "big", first: "trick:Bri" },
  { id: "s-decade", group: "BIG TRICKS", title: "Land a Decade", how: "In the air: tap LB", tier: "big", first: "trick:Decade" },
  { id: "s-clamp", group: "BIG TRICKS", title: "Land 3 Clamp Grabs", how: "In the air: hold RT + RB", tier: "skill", first: "trick:Clamp Grab", count: 3 },
  { id: "s-phone", group: "GETTING AROUND", title: "Check your phone", how: "Hold D-pad Down to take it out", tier: "intro", first: "phone" },
  { id: "s-crate", group: "GETTING AROUND", title: "Open a crate", how: "Open one from MISSIONS", tier: "intro", first: "crate" },
  { id: "s-customize", group: "GETTING AROUND", title: "Customize your ride", how: "Equip a new part from RIDES", tier: "intro", first: "customize" },
  { id: "s-swim", group: "GETTING AROUND", title: "Take a swim", how: "Walk or ride into the lake at Veterans", tier: "intro", first: "swim" },
  { id: "s-water-flip", group: "TRICKS", title: "Flip into the lake 3 times", how: "Jump in on foot, LT+RT and LS up or down", tier: "skill", first: "water-flip", count: 3 },
  { id: "w-cannonball", group: "WATER", title: "3 Cannonballs!", how: "Off the dive dock, hold X to tuck", tier: "intro", first: "water:cannonball", count: 3 },
  { id: "w-dive", group: "WATER", title: "5 head-first dives", how: "LT+RT + LS up, let go head down", tier: "basic", first: "water:dive", count: 5 },
  { id: "w-tower", group: "WATER", title: "Jump off the tower", how: "Climb the dive dock stairs, jump", tier: "basic", first: "water:tower" },
  { id: "w-board", group: "WATER", title: "3 springboard flips", how: "Jump off the springboard, flip in", tier: "skill", first: "water:board", count: 3 },
  { id: "w-twist", group: "WATER", title: "3 flips with a twist", how: "Add LB or RB to a flip", tier: "skill", first: "water:twist", count: 3 },
  { id: "w-swan", group: "WATER", title: "3 Swan Dives", how: "Front Dive holding B, arms out", tier: "skill", first: "water:swan", count: 3 },
  { id: "w-double", group: "WATER", title: "Double into the lake", how: "Hold LT+RT through two flips", tier: "big", first: "water:double" },
];
const FIRSTS = new Set(STARTER.map((m) => m.first));
/** Steps that must be done several times, and how many. */
export const FIRST_COUNT = new Map(STARTER.filter((m) => (m.count ?? 1) > 1).map((m) => [m.first, m.count!]));
/** Tricks that count as a "first", matched against a landed trick's name. */
export const FIRST_TRICKS: [string, RegExp][] = [
  ["trick:Tailwhip", /\bTailwhip\b/], ["trick:Barspin", /\bBarspin\b/], ["trick:Manual", /^Manual$/], ["trick:Nose Manual", /^Nose Manual$/],
  ["trick:Backflip", /\bBackflip\b|^Flair\b/], ["trick:Frontflip", /\bFrontflip\b|^Front Flair\b/], ["trick:Bri", /\bBri\b/],
  ["trick:Decade", /\bDecade\b/], ["trick:Clamp Grab", /\bClamp Grab\b/],
];

export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
/** Three different dailies for a date, the same for everyone that day. */
export function dailyFor(day: string) {
  const random = seeded(hash("daily:" + day)), pool = DAILY.slice(), ids: string[] = [];
  while (ids.length < 3) ids.push(pool.splice(Math.floor(random() * pool.length), 1)[0].id);
  return ids;
}

// ---- Applying events --------------------------------------------------------------
export interface Gains { credit: number; xp: number; crates: Crate[]; completed: { title: string; reward: Reward }[]; levelsUp: number[]; items: { kind: ItemKind; source: string }[]; /** Premium currency earned (#76): every fifth level. */ bucks: number }
const noGains = (): Gains => ({ credit: 0, xp: 0, crates: [], completed: [], levelsUp: [], items: [], bucks: 0 });

/** Starts a new day's dailies when the date changes. */
export function rollDaily(p: Progress, day = dayKey()) {
  if (p.daily.day === day) return false;
  p.daily = { day, ids: dailyFor(day), stats: zeroStats(), done: [], bonus: false };
  return true;
}

/**
 * Adds to a stat (or raises a best), then settles every mission it completes
 * and any level-ups, returning what was earned. `newId` names granted crates.
 */
export function record(p: Progress, changes: Partial<Record<Stat, number>>, newId: () => string, day = dayKey(), firsts: string[] = [], landed: Landed = {}): Gains {
  const gains = noGains();
  rollDaily(p, day);
  addLanded(p, landed);
  for (const [key, amount] of Object.entries(changes) as [Stat, number][]) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (BEST.includes(key)) { p.stats[key] = Math.max(p.stats[key], amount); p.daily.stats[key] = Math.max(p.daily.stats[key], amount); }
    else { p.stats[key] += amount; p.daily.stats[key] += amount; }
    if (key === "points") gains.xp += trickXp(amount);
  }
  const grant = (title: string, reward: Reward) => {
    gains.completed.push({ title, reward });
    gains.credit += reward.credit; gains.xp += reward.xp;
    if (reward.crate) gains.crates.push({ id: newId(), tier: reward.crate, source: title });
  };
  for (const first of firsts) {
    if (!FIRSTS.has(first) || p.firsts.includes(first)) continue;
    const need = FIRST_COUNT.get(first) ?? 1, done = Math.min(need, (p.counts[first] ?? 0) + 1);
    if (done >= need) { p.firsts.push(first); delete p.counts[first]; } else p.counts[first] = done;
  }
  if (changes.cratesOpened && !p.firsts.includes("crate")) p.firsts.push("crate");
  for (const mission of STARTER)
    if (!p.starter.includes(mission.id) && p.firsts.includes(mission.first)) { p.starter.push(mission.id); grant(mission.title, STARTER_REWARD[mission.tier]); }
  for (const chain of CAREER) {
    let stage = p.career[chain.id] ?? 0;
    while (stage < chain.goals.length && p.stats[chain.stat] >= chain.goals[stage]) {
      grant(careerTitle(chain, stage), careerReward(stage));
      stage++;
    }
    p.career[chain.id] = stage;
  }
  for (const id of p.daily.ids) {
    const mission = DAILY.find((d) => d.id === id)!;
    if (!p.daily.done.includes(id) && p.daily.stats[mission.stat] >= mission.goal) { p.daily.done.push(id); grant("Daily: " + mission.title, DAILY_REWARD); }
  }
  if (!p.daily.bonus && p.daily.ids.length === 3 && p.daily.done.length === 3) { p.daily.bonus = true; grant("All three dailies", DAILY_BONUS); }
  // Level-ups from everything earned above; each level pays once, ever.
  p.xp += gains.xp;
  const after = levelFor(p.xp).level;
  // Bucks for levels reached before Bucks existed (older saves), once.
  for (let level = p.bucksLevel + 1; level <= p.topLevel; level++) if (level % 5 === 0) gains.bucks += BUCKS_PER_FIVE_LEVELS;
  for (let level = p.topLevel + 1; level <= after; level++) {
    gains.levelsUp.push(level);
    const reward = levelReward(level);
    if (reward.kind === "crate") gains.crates.push({ id: newId(), tier: reward.tier, source: "Level " + level });
    else if (reward.kind === "bucks") gains.bucks += reward.amount;
    else gains.items.push({ kind: reward.item, source: "Level " + level });
  }
  p.topLevel = Math.max(p.topLevel, after);
  p.bucksLevel = p.topLevel;
  p.crates.push(...gains.crates);
  return gains;
}

/** Where each mission stands, for the Missions app. */
export function missionBoard(p: Progress, day = dayKey()) {
  const copy = structuredClone(p);
  rollDaily(copy, day);
  const daily = copy.daily.ids.map((id) => {
    const m = DAILY.find((d) => d.id === id)!;
    return { id, title: m.title, value: Math.min(m.goal, copy.daily.stats[m.stat]), goal: m.goal, done: copy.daily.done.includes(id), reward: DAILY_REWARD };
  });
  const career = CAREER.map((chain) => {
    const stage = copy.career[chain.id] ?? 0, complete = stage >= chain.goals.length, goal = chain.goals[Math.min(stage, chain.goals.length - 1)];
    return { id: chain.id, title: complete ? careerTitle(chain, chain.goals.length - 1) : careerTitle(chain, stage), detail: chain.detail, value: Math.min(goal, copy.stats[chain.stat]), goal, stage, stages: chain.goals.length, complete, reward: careerReward(stage) };
  });
  const starter = STARTER.map((m) => {
    const goal = m.count ?? 1, done = copy.starter.includes(m.id);
    return { id: m.id, group: m.group, title: m.title, how: m.how, done, value: done || copy.firsts.includes(m.first) ? goal : copy.counts[m.first] ?? 0, goal, reward: STARTER_REWARD[m.tier] };
  });
  return { daily, career, starter, bonus: copy.daily.bonus, bonusReward: DAILY_BONUS };
}

// ---- Crates -----------------------------------------------------------------------
export interface Collectible { partId: string; variantId: string; name: string; variantName: string; brand: string; category: string; rarity: Rarity; color: number; accent?: number; exclusive: boolean; rideable: "scooter" | "longboard"; price: number }

/** Rarity: crate-exclusive colourways carry their own; shop parts go by their Coin price; Bucks (Mafioso) parts are legendary. */
export function priceRarity(price: number): Rarity { return price >= 375 ? "legendary" : price >= 175 ? "epic" : price >= 85 ? "rare" : "common"; }
export const partRarity = (p: { unlockType: string; creditPrice?: number }): Rarity => (p.unlockType === "bucks" ? "legendary" : priceRarity(p.creditPrice ?? 0));

/** Everything a crate can hold: every paid colourway and every crate exclusive. */
export function collectibles(): Collectible[] {
  const list: Collectible[] = [];
  for (const p of PARTS) for (const v of p.variants) {
    if (p.unlockType === "free" && !v.exclusive) continue;
    list.push({ partId: p.id, variantId: v.id, name: p.name, variantName: v.name, brand: p.brand, category: p.category, rarity: v.exclusive ?? partRarity(p), color: v.color, accent: v.accent, exclusive: !!v.exclusive, rideable: "scooter", price: p.creditPrice ?? 0 });
  }
  for (const p of LONGBOARD_PARTS) for (const v of p.variants)
    list.push({ partId: p.id, variantId: v.id, name: p.name, variantName: v.name, brand: p.brand, category: p.category, rarity: priceRarity(p.creditPrice), color: v.color, accent: v.accent, exclusive: false, rideable: "longboard", price: p.creditPrice });
  return list;
}

/**
 * Crate odds (shown to players). Legendary is where Mafioso lives (with the
 * gold crate exclusives), so a Mafioso part is a really lucky pull: about 1 in
 * 250 Street Crates and 1 in 16 Legend Crates.
 */
const ODDS: Record<CrateTier, Record<Rarity, number>> = {
  street: { common: 75, rare: 21, epic: 3.5, legendary: 0.5 },
  legend: { common: 0, rare: 55, epic: 36, legendary: 9 },
};
export const crateOdds = (tier: CrateTier) => ODDS[tier];
const BONUS: Record<CrateTier, [number, number]> = { street: [8, 16], legend: [60, 100] };

export interface CrateResult { item: Collectible | null; credit: number; rarity: Rarity }
/**
 * What a crate holds. Seeded by the crate's id, so reopening the game cannot
 * re-roll it. Never a duplicate: the item is always one the rider lacks, and a
 * rider who owns everything gets extra Credit instead.
 */
export function openCrate(crate: Crate, owned: string[]): CrateResult {
  const random = seeded(hash(crate.id)), odds = ODDS[crate.tier];
  let roll = random() * 100, rarity: Rarity = "common";
  for (const r of RARITIES) { if (roll < odds[r]) { rarity = r; break; } roll -= odds[r]; rarity = r; }
  const have = new Set(owned), missing = collectibles().filter((c) => !have.has(ownershipKey(c)));
  const [low, high] = BONUS[crate.tier];
  let credit = Math.round(low + random() * (high - low));
  // The rolled rarity, else the nearest rarity with anything left (higher first).
  const order = [rarity, ...RARITIES.slice(RARITIES.indexOf(rarity) + 1), ...RARITIES.slice(0, RARITIES.indexOf(rarity)).reverse()];
  for (const r of order) {
    const pool = missing.filter((c) => c.rarity === r);
    if (pool.length) { const item = pool[Math.floor(random() * pool.length)]; return { item, credit, rarity: r }; }
  }
  credit += high * 2;
  return { item: null, credit, rarity };
}

/** Collection progress per brand, for the shop and the Missions app. */
export function collection(owned: string[]) {
  const have = new Set(owned), all = collectibles();
  const brands = new Map<string, { brand: string; have: number; total: number }>();
  for (const c of all) {
    const b = brands.get(c.brand) ?? { brand: c.brand, have: 0, total: 0 };
    b.total++; if (have.has(ownershipKey(c))) b.have++;
    brands.set(c.brand, b);
  }
  return { have: all.filter((c) => have.has(ownershipKey(c))).length, total: all.length, brands: [...brands.values()] };
}

// ---- Helpers ----------------------------------------------------------------------
function hash(text: string) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
