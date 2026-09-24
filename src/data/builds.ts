/**
 * Warehouse build mode data: the build catalog (the layout editor's own object
 * types at build-friendly sizes, grouped the way the phone's BUILD app lists
 * them), the data-driven budget, and the compact form a build is saved in on
 * the profile: which catalog piece, where, and which way it faces. Never meshes.
 */
export type BuildGroup = "RAMPS" | "BOXES" | "RAILS" | "MISC";
export const BUILD_GROUPS: readonly BuildGroup[] = ["RAMPS", "BOXES", "RAILS", "MISC"];

export interface BuildAsset {
  id: string;
  label: string;
  group: BuildGroup;
  /** A layout object type (editor/layout.ts CATALOG) the asset factory builds. */
  type: string;
  width: number;
  height: number;
  length: number;
  radius?: number;
  deck?: number;
  material?: "wood" | "metal" | "concrete";
  /** Budget points: bigger, heavier pieces cost more (BUILD_LIMITS.budget). */
  cost: number;
}

/**
 * Heights line up so modular pieces meet flush: a 1.5 m quarter, platform and
 * bank make one run; the ledge, box and rails sit at street heights.
 */
export const BUILD_CATALOG: readonly BuildAsset[] = [
  { id: "quarter-small", label: "Quarter Pipe 1.5 m", group: "RAMPS", type: "Quarter Pipe", width: 3, height: 1.5, length: 4, radius: 3, cost: 4 },
  { id: "quarter-medium", label: "Quarter Pipe 2.6 m", group: "RAMPS", type: "Quarter Pipe", width: 5, height: 2.6, length: 6, radius: 5, cost: 6 },
  { id: "bank", label: "Bank 1.5 m", group: "RAMPS", type: "Bank", width: 4, height: 1.5, length: 4, cost: 3 },
  { id: "kicker", label: "Kicker", group: "RAMPS", type: "Launch Ramp", width: 2.4, height: 0.9, length: 2.4, radius: 2.4, cost: 2 },
  { id: "launch", label: "Launch Ramp", group: "RAMPS", type: "Launch Ramp", width: 3, height: 1.4, length: 3, radius: 2, cost: 3 },
  { id: "wedge", label: "Wedge", group: "RAMPS", type: "Landing Ramp", width: 3, height: 0.6, length: 2.4, cost: 2 },
  { id: "spine", label: "Spine", group: "RAMPS", type: "Spine", width: 4, height: 1.8, length: 5, radius: 2, deck: 0.2, cost: 5 },
  { id: "mini-ramp", label: "Mini Ramp (transition)", group: "RAMPS", type: "Mini Ramp", width: 5, height: 1.3, length: 9, radius: 2.5, cost: 8 },
  { id: "manual-pad", label: "Manual Pad", group: "BOXES", type: "Grind Box", width: 2.4, height: 0.3, length: 5, material: "concrete", cost: 2 },
  { id: "grind-box", label: "Grind Box", group: "BOXES", type: "Grind Box", width: 1.3, height: 0.5, length: 3, material: "concrete", cost: 2 },
  { id: "funbox", label: "Funbox", group: "BOXES", type: "Box Jump", width: 4, height: 1.3, length: 6, deck: 2, cost: 5 },
  { id: "box-jump", label: "Box Jump (large)", group: "BOXES", type: "Box Jump", width: 5, height: 1.6, length: 8, deck: 3, cost: 6 },
  { id: "ledge", label: "Ledge", group: "BOXES", type: "Ledge", width: 0.6, height: 0.6, length: 4, material: "concrete", cost: 2 },
  { id: "platform", label: "Platform 1.5 m", group: "BOXES", type: "Platform", width: 3, height: 1.5, length: 3, cost: 3 },
  { id: "flat-bar", label: "Flat Bar (low)", group: "RAILS", type: "Flat Rail", width: 0.12, height: 0.4, length: 5, cost: 1 },
  { id: "flat-rail", label: "Flat Rail", group: "RAILS", type: "Flat Rail", width: 0.12, height: 0.65, length: 5, cost: 1 },
  { id: "down-rail", label: "Down Rail", group: "RAILS", type: "Down Rail", width: 0.12, height: 1.1, length: 5, cost: 1 },
  { id: "round-rail", label: "Round Rail", group: "RAILS", type: "Round Rail", width: 0.12, height: 0.5, length: 6, cost: 1 },
  { id: "square-rail", label: "Square Rail", group: "RAILS", type: "Square Rail", width: 0.12, height: 0.45, length: 5, cost: 1 },
  { id: "stairs", label: "Stairs (4)", group: "MISC", type: "Stairs", width: 3, height: 1, length: 3, material: "concrete", cost: 3 },
  { id: "barrier", label: "Barrier", group: "MISC", type: "Barrier", width: 0.6, height: 0.8, length: 3, material: "concrete", cost: 2 },
  { id: "bench", label: "Bench", group: "MISC", type: "Bench", width: 0.65, height: 0.5, length: 2.4, cost: 1 },
  { id: "picnic-table", label: "Picnic Table", group: "MISC", type: "Picnic Table", width: 2, height: 1, length: 2.4, cost: 2 },
];
export const buildAsset = (id: string) => BUILD_CATALOG.find((a) => a.id === id);

/** Data-driven limits: a piece count and a complexity budget (sum of costs). */
export const BUILD_LIMITS = { pieces: 120, budget: 260, history: 40 } as const;
/** Inside the warehouse walls, with a little clearance. */
export const BUILD_BOUNDS = { x: 31.6, z: 43.6 } as const;

/** One placed piece: catalog id, x, z (metres), rotation (radians). */
export type SavedPiece = [asset: string, x: number, z: number, rotation: number];
export interface SavedBuild { version: 1; pieces: SavedPiece[] }

export const buildCost = (assets: readonly string[]) => assets.reduce((sum, id) => sum + (buildAsset(id)?.cost ?? 0), 0);

/** A saved build from the profile, or undefined when missing or not a valid build. */
export function validBuild(data: unknown): SavedBuild | undefined {
  const d = data as SavedBuild | null;
  if (!d || d.version !== 1 || !Array.isArray(d.pieces) || d.pieces.length > BUILD_LIMITS.pieces) return undefined;
  const pieces: SavedPiece[] = [];
  for (const p of d.pieces) {
    if (!Array.isArray(p) || p.length !== 4 || typeof p[0] !== "string" || !buildAsset(p[0])) continue;
    const [asset, x, z, rotation] = p;
    if (![x, z, rotation].every(Number.isFinite) || Math.abs(x) > BUILD_BOUNDS.x || Math.abs(z) > BUILD_BOUNDS.z) continue;
    pieces.push([asset, x, z, rotation]);
  }
  return { version: 1, pieces };
}
/** Rounded so a full build stays a few kilobytes inside the profile save. */
export const savedPiece = (asset: string, x: number, z: number, rotation: number): SavedPiece =>
  [asset, Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(rotation * 1000) / 1000];

/** The warehouse's structural pillars (built in park.ts); pieces must clear them. */
export const WAREHOUSE_PILLARS: readonly (readonly [number, number])[] = [[-10, -8], [10, -8], [-10, 12], [10, 12]];
export const PILLAR_HALF = 0.4;
/** Other fixed warehouse furniture pieces must clear: [x, z, half width, half length] (the two benches). */
export const WAREHOUSE_FIXTURES: readonly (readonly [number, number, number, number])[] = [[-29, -18, 0.5, 2], [-29, -12, 0.5, 2]];
