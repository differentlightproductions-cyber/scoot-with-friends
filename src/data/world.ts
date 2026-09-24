import type { MapId } from "./maps";

/**
 * Boulder City as one world (#43). This is the coordinate plan and the first
 * slice of it: every district gets a place in shared world coordinates, and
 * the phone's SPOTS app fast travels between named spots. The districts are
 * still built and simulated one at a time (each map keeps its own local
 * layout, physics and colliders); riding continuously between them needs the
 * streaming cells below and is planned, not built.
 *
 * World coordinates are metres with the compass the game uses everywhere:
 * north is -z, east is +x. Veterans Memorial Park is the origin, so its local
 * coordinates are already world coordinates. Every other district keeps its
 * authored local layout and is translated as a unit to its origin.
 *
 * Real places are the basis, with the boring stretches compressed (about 0.7x)
 * so the ride between them lands on the travel-time targets at the ~9 m/s a
 * rolling scooter holds on the flat:
 *   - Veterans Memorial Park, 1650 Buchanan Blvd, and the Church, 1136 Buchanan
 *     Blvd, share Buchanan Blvd, the spine of the world. House numbers fall
 *     going north, so the Church sits north of the park along it.
 *   - B Hill's bottom (1401 Pueblo Dr) is placed west of Buchanan between the
 *     two. That bearing is an estimate: the geocoder was unreachable when this
 *     was written, so it is flagged for the owner to confirm against a map.
 */
export type DistrictId = "veterans" | "church" | "b_hill";

export interface District {
  id: DistrictId;
  name: string;
  /** The map that builds this district today. */
  map: MapId;
  address: string;
  /** Where the district's local origin sits in world metres. */
  origin: { x: number; z: number };
  /** Footprint in world metres (east-west, north-south), for the city view. */
  size: [number, number];
  /** Whether the real-world placement is confirmed or still an estimate. */
  placement: "real" | "estimate";
}

export const DISTRICTS: District[] = [
  { id: "veterans", name: "Veterans Memorial Park", map: "outdoor", address: "1650 Buchanan Blvd", origin: { x: 0, z: 0 }, size: [232, 250], placement: "real" },
  { id: "church", name: "The Church", map: "church", address: "1136 Buchanan Blvd", origin: { x: 0, z: -560 }, size: [90, 110], placement: "real" },
  { id: "b_hill", name: "B Hill", map: "b_hill", address: "1401 Pueblo Dr (bottom)", origin: { x: -560, z: -460 }, size: [260, 420], placement: "estimate" },
];

/** Buchanan Blvd through the world, south to north (world metres). */
export const BUCHANAN: [number, number][] = [[18, 140], [18, -120], [22, -380], [18, -640], [14, -760]];
/** The connector streets from Buchanan to Pueblo Dr and the bottom of B Hill. */
export const PUEBLO: [number, number][] = [[18, -420], [-200, -430], [-400, -445], [-560, -460]];

/** Rolling speed on the flat the travel targets are planned at (m/s). */
export const RIDE_SPEED = 9;
/** Length of a polyline in world metres. */
export const pathLength = (pts: [number, number][]) => pts.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - pts[i][0], z - pts[i][1]), 0);
/**
 * The street route between two districts: along Buchanan, and Pueblo Dr for
 * B Hill (world metres). The ride-time targets are checked against these.
 */
export function routeBetween(a: DistrictId, b: DistrictId): [number, number][] {
  const origin = (id: DistrictId) => { const o = DISTRICTS.find((d) => d.id === id)!.origin; return [o.x, o.z] as [number, number]; };
  const junction = PUEBLO[0];
  const toJunction = (id: DistrictId): [number, number][] => id === "b_hill" ? [...PUEBLO].reverse() : [origin(id), [junction[0], origin(id)[1]], junction];
  if (a === b) return [origin(a)];
  if (a !== "b_hill" && b !== "b_hill") return [origin(a), [BUCHANAN[0][0], origin(a)[1]], [BUCHANAN[0][0], origin(b)[1]], origin(b)];
  const from = toJunction(a), to = toJunction(b).reverse();
  return [...from, ...to.slice(1)];
}

/** Target ride times between districts (seconds), from the owner's spec. */
export const TRAVEL_TARGETS = {
  "veterans-church": [45, 75],
  "church-b_hill": [45, 90],
  "b_hill-veterans": [60, 120],
  loop: [180, 300],
} as const;

/**
 * Streaming cells for the continuous world, north-west to south-east. Only the
 * cells near the rider would be built in full (detail, colliders); the rest
 * would be cheap distant stand-ins. Planned: the engine builds one map at a
 * time today, and how far to take streaming is an owner decision (it touches
 * every map's terrain, colliders and the ACTIVE_MAP branches in park.ts).
 */
export const CELLS = ["B Hill Upper", "B Hill Mid", "Pueblo / B Hill Bottom", "Connector Streets", "Church District", "Buchanan Connector", "Veterans District"] as const;

/** A named place to fast travel to: a district's map and one of its spawns. */
export interface Spot {
  id: string;
  label: string;
  district: DistrictId;
  map: MapId;
  /** Index into that map's spawn list. */
  spawn: number;
  detail: string;
}

export const SPOTS: Spot[] = [
  { id: "veterans", label: "VETERANS MEMORIAL PARK", district: "veterans", map: "outdoor", spawn: 0, detail: "Wood and metal park, trails, lake" },
  { id: "church-front", label: "CHURCH — FRONT", district: "church", map: "church", spawn: 0, detail: "Front lot, 11-stair and hubbas" },
  { id: "church-interior", label: "CHURCH — INTERIOR", district: "church", map: "church", spawn: 3, detail: "Sanctuary park inside" },
  { id: "b_hill-summit", label: "B HILL — SUMMIT", district: "b_hill", map: "b_hill", spawn: 0, detail: "Top of the downhill" },
  { id: "b_hill-bottom", label: "B HILL — PUEBLO / BOTTOM", district: "b_hill", map: "b_hill", spawn: 4, detail: "Runout at the bottom of the hill" },
];

export const districtOf = (map: string) => DISTRICTS.find((d) => d.map === map) ?? null;
/** A district-local position in world metres. */
export function toWorld(district: DistrictId, x: number, z: number) {
  const d = DISTRICTS.find((c) => c.id === district)!;
  return { x: d.origin.x + x, z: d.origin.z + z };
}
/** Straight-line distance between two districts' origins (metres). */
export function districtDistance(a: DistrictId, b: DistrictId) {
  const p = DISTRICTS.find((d) => d.id === a)!.origin, q = DISTRICTS.find((d) => d.id === b)!.origin;
  return Math.hypot(p.x - q.x, p.z - q.z);
}
