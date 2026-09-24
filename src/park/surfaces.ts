/**
 * What the wheels roll on at ground level, for maps that register it (#46).
 * A map's builder adds zones as it lays its ground out: its lawns as grass,
 * a ballfield infield as sand, and every hard pad, path and lot it rides on as
 * road, on top. Where zones overlap, the highest priority wins (road over sand
 * over grass), so a path across a lawn stays a path. Anywhere unregistered is
 * road, as every map was before surfaces existed.
 */
export type Surface = "road" | "shoulder" | "dirt" | "grass" | "sand";
type Shape =
  | { kind: "rect"; x0: number; x1: number; z0: number; z1: number }
  | { kind: "ellipse"; x: number; z: number; rx: number; rz: number }
  | { kind: "segment"; a: [number, number]; b: [number, number]; width: number };
interface Zone { surface: Surface; shape: Shape; priority: number }

const PRIORITY: Record<Surface, number> = { grass: 0, dirt: 1, sand: 1, shoulder: 1, road: 2 };
let zones: Zone[] = [];

/** Forgets every zone: a new map is being built. */
export function clearSurfaces() { zones = []; }
export function addSurface(surface: Surface, shape: Shape) { zones.push({ surface, shape, priority: PRIORITY[surface] }); }
export const surfaceRect = (surface: Surface, x0: number, x1: number, z0: number, z1: number) => addSurface(surface, { kind: "rect", x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) });
export const surfaceDisk = (surface: Surface, x: number, z: number, r: number) => addSurface(surface, { kind: "ellipse", x, z, rx: r, rz: r });

function inside(s: Shape, x: number, z: number) {
  if (s.kind === "rect") return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
  if (s.kind === "ellipse") return ((x - s.x) / s.rx) ** 2 + ((z - s.z) / s.rz) ** 2 <= 1;
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], len = dx * dx + dz * dz;
  const t = len > 0 ? Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / len)) : 0;
  return Math.hypot(x - (s.a[0] + dx * t), z - (s.a[1] + dz * t)) <= s.width / 2;
}

/** The registered surface at (x, z), or null where the map registered none. */
export function surfaceAt(x: number, z: number): Surface | null {
  let best: Zone | null = null;
  for (const zone of zones) if ((!best || zone.priority >= best.priority) && inside(zone.shape, x, z)) best = zone;
  return best?.surface ?? null;
}
