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

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_LABEL: Record<Rarity, string> = { common: "COMMON", rare: "RARE", epic: "EPIC", legendary: "LEGENDARY" };
export const RARITY_COLOR: Record<Rarity, string> = { common: "#b9c2c7", rare: "#35b6ff", epic: "#b36bff", legendary: "#ffb938" };

export type CrateTier = "street" | "pro" | "signature" | "legend";
export const CRATE_TIERS: CrateTier[] = ["street", "pro", "signature", "legend"];
export const CRATE_NAME: Record<CrateTier, string> = { street: "Street Crate", pro: "Pro Crate", signature: "Signature Crate", legend: "Legend Crate" };
export const CRATE_COLOR: Record<CrateTier, string> = { street: "#35b6ff", pro: "#b36bff", signature: "#ff7a2f", legend: "#ffb938" };
export interface Crate { id: string; tier: CrateTier; source: string }

/** Lifetime counters and bests. Daily missions keep their own copy for the day. */
export const STATS = ["tricks", "perfect", "grinds", "flips", "spins", "whips", "bestLine", "bestLinePoints", "points", "bhillRuns", "bhillTop", "maps", "purchases", "cratesOpened"] as const;
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
}

const zeroStats = () => Object.fromEntries(STATS.map((s) => [s, 0])) as Record<Stat, number>;
export const emptyProgress = (): Progress => ({ xp: 0, stats: zeroStats(), career: Object.fromEntries(CAREER.map((c) => [c.id, 0])), daily: { day: "", ids: [], stats: zeroStats(), done: [], bonus: false }, crates: [], visited: [] });

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
    .filter((c: any) => c && typeof c.id === "string" && /^[a-z0-9-]{6,64}$/.test(c.id) && CRATE_TIERS.includes(c.tier))
    .slice(0, 99).map((c: any) => ({ id: c.id, tier: c.tier, source: typeof c.source === "string" ? c.source.slice(0, 60) : "" }));
  p.visited = strings(value.visited, 20);
  return p;
}

// ---- Levels -------------------------------------------------------------------
/** XP to go from `level` to the next: each level asks a little more. */
export const levelNeed = (level: number) => 200 + 75 * (level - 1);
export function levelFor(xp: number) {
  let level = 1, into = Math.max(0, Math.floor(xp));
  while (into >= levelNeed(level) && level < 999) { into -= levelNeed(level); level++; }
  return { level, into, need: levelNeed(level) };
}
/** The crate a level-up grants: bigger every fifth and tenth level. */
export const levelCrate = (level: number): CrateTier => (level % 10 === 0 ? "legend" : level % 5 === 0 ? "signature" : level % 2 === 0 ? "pro" : "street");
export const levelCredit = (level: number) => 20 + level * 5;
/** Riding XP from banked trick points. */
export const trickXp = (points: number) => Math.max(1, Math.round(points / 40));

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
  { id: "flips", stat: "flips", goals: [1, 10, 30, 80], title: (n) => (n === 1 ? "Land a flip" : `Land ${n} flips`), detail: "Backflips and frontflips" },
  { id: "spins", stat: "spins", goals: [3, 15, 50, 150], title: (n) => `${n} spins of 360+`, detail: "Full rotations, off anything" },
  { id: "bhill", stat: "bhillRuns", goals: [1, 3, 10, 25], title: (n) => (n === 1 ? "Bomb B Hill top to bottom" : `Finish ${n} B Hill runs`), detail: "Start at the top banner, finish at the bottom" },
  { id: "velocity", stat: "bhillTop", goals: [18, 22, 26, 28], title: (n) => `Hit ${Math.round(n * 3.6)} km/h on B Hill`, detail: "Tuck, hold your line, trust it" },
  { id: "explorer", stat: "maps", goals: [2, 4, 6], title: (n) => `Ride ${n} different spots`, detail: "Every map counts once" },
  { id: "collector", stat: "purchases", goals: [1, 5, 15, 30], title: (n) => (n === 1 ? "Buy your first part" : `Buy ${n} parts`), detail: "Any shop, any colourway" },
];
export const careerTitle = (chain: CareerChain, stage: number) => `${chain.title(chain.goals[Math.min(stage, chain.goals.length - 1)])} ${ROMAN[stage] ?? ""}`.trim();
export function careerReward(stage: number): Reward {
  const credit = [30, 60, 100, 160, 250][stage] ?? 250, xp = [150, 300, 500, 800, 1200][stage] ?? 1200;
  return { credit, xp, crate: stage === 1 ? "street" : stage === 2 ? "pro" : stage >= 3 ? "signature" : undefined };
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
export const DAILY_REWARD: Reward = { credit: 40, xp: 250 };
export const DAILY_BONUS: Reward = { credit: 60, xp: 400, crate: "pro" };

export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
/** Three different dailies for a date, the same for everyone that day. */
export function dailyFor(day: string) {
  const random = seeded(hash("daily:" + day)), pool = DAILY.slice(), ids: string[] = [];
  while (ids.length < 3) ids.push(pool.splice(Math.floor(random() * pool.length), 1)[0].id);
  return ids;
}

// ---- Applying events --------------------------------------------------------------
export interface Gains { credit: number; xp: number; crates: Crate[]; completed: { title: string; reward: Reward }[]; levelsUp: number[] }
const noGains = (): Gains => ({ credit: 0, xp: 0, crates: [], completed: [], levelsUp: [] });

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
export function record(p: Progress, changes: Partial<Record<Stat, number>>, newId: () => string, day = dayKey()): Gains {
  const gains = noGains();
  rollDaily(p, day);
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
  // Level-ups from everything earned above.
  const before = levelFor(p.xp).level;
  p.xp += gains.xp;
  const after = levelFor(p.xp).level;
  for (let level = before + 1; level <= after; level++) {
    gains.levelsUp.push(level);
    gains.credit += levelCredit(level);
    gains.crates.push({ id: newId(), tier: levelCrate(level), source: "Level " + level });
  }
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
  return { daily, career, bonus: copy.daily.bonus, bonusReward: DAILY_BONUS };
}

// ---- Crates -----------------------------------------------------------------------
export interface Collectible { partId: string; variantId: string; name: string; variantName: string; brand: string; category: string; rarity: Rarity; color: number; accent?: number; exclusive: boolean; rideable: "scooter" | "longboard"; price: number }

/** Rarity: crate-exclusive colourways carry their own; shop parts go by price. */
export function priceRarity(price: number): Rarity { return price >= 150 ? "legendary" : price >= 70 ? "epic" : price >= 35 ? "rare" : "common"; }

/** Everything a crate can hold: every paid colourway and every crate exclusive. */
export function collectibles(): Collectible[] {
  const list: Collectible[] = [];
  for (const p of PARTS) for (const v of p.variants) {
    if (p.unlockType === "free" && !v.exclusive) continue;
    list.push({ partId: p.id, variantId: v.id, name: p.name, variantName: v.name, brand: p.brand, category: p.category, rarity: v.exclusive ?? priceRarity(p.creditPrice ?? 0), color: v.color, accent: v.accent, exclusive: !!v.exclusive, rideable: "scooter", price: p.creditPrice ?? 0 });
  }
  for (const p of LONGBOARD_PARTS) for (const v of p.variants)
    list.push({ partId: p.id, variantId: v.id, name: p.name, variantName: v.name, brand: p.brand, category: p.category, rarity: priceRarity(p.creditPrice), color: v.color, accent: v.accent, exclusive: false, rideable: "longboard", price: p.creditPrice });
  return list;
}

const ODDS: Record<CrateTier, Record<Rarity, number>> = {
  street: { common: 68, rare: 26, epic: 5.5, legendary: 0.5 },
  pro: { common: 30, rare: 48, epic: 18, legendary: 4 },
  signature: { common: 0, rare: 40, epic: 45, legendary: 15 },
  legend: { common: 0, rare: 0, epic: 50, legendary: 50 },
};
export const crateOdds = (tier: CrateTier) => ODDS[tier];
const BONUS: Record<CrateTier, [number, number]> = { street: [15, 30], pro: [40, 70], signature: [90, 140], legend: [200, 300] };

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
