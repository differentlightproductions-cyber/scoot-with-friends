export const CATALOG = {
  Ramps: [
    "Quarter Pipe",
    "Bank",
    "Spine",
    "Box Jump",
    "Launch Ramp",
    "Landing Ramp",
    "Half Pipe",
    "Mini Ramp",
  ],
  Grinding: [
    "Flat Rail",
    "Down Rail",
    "Round Rail",
    "Square Rail",
    "Ledge",
    "Grind Box",
    "Coping Edge",
  ],
  Objects: ["Stairs", "Bench", "Picnic Table", "Barrier", "Platform"],
  Environment: [
    "Tree",
    "Bush",
    "Rock",
    "Light Pole",
    "Trash Can",
    "Sign",
    "Fence",
    "Path",
  ],
} as const;
export const TYPES = Object.values(CATALOG).flat() as readonly string[];
export interface ParkObject {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  width: number;
  height: number;
  length: number;
  radius: number;
  deck: number;
  coping: boolean;
  grindable: boolean;
  material: string;
  points?: [number, number][];
  /** The build catalog piece it was placed from (data/builds.ts), in build mode. */
  asset?: string;
  /** A visible remote room piece excluded from local height support. */
  nonSolid?: boolean;
}
export interface Brush {
  x: number;
  z: number;
  radius: number;
  strength: number;
  mode: "raise" | "lower" | "smooth" | "flatten";
  target: number;
}
export interface ParkLayout {
  version: 1;
  title: string;
  creator: string;
  base: "outdoor";
  objects: ParkObject[];
  terrain: Brush[];
  baseEdits: Record<
    string,
    {
      x: number;
      y: number;
      z: number;
      rotation: number;
      hidden: boolean;
      scale?: [number, number, number];
      color?: string;
    }
  >;
}
export const LIMIT = 300,
  STORAGE = "swf-parks-v1";
export const blankLayout = (): ParkLayout => ({
  version: 1,
  title: "My Memorial Park",
  creator: "Local rider",
  base: "outdoor",
  objects: [],
  terrain: [],
  baseEdits: {},
});
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
let serial = 0;
export function makeObject(type: string, x = 30, z = 0): ParkObject {
  const ramp = CATALOG.Ramps.some((t) => t === type),
    rail = /Rail|Coping/.test(type);
  return {
    id: "o-" + Date.now().toString(36) + "-" + serial++,
    type,
    x,
    y: 0,
    z,
    rotation: 0,
    width: rail ? 0.1 : type === "Tree" ? 4 : 5,
    height:
      type === "Tree"
        ? 5
        : ramp
          ? 2
          : rail
            ? 0.65
            : type === "Bench"
              ? 0.55
              : 1,
    length: rail ? 5 : ramp ? 7 : 3,
    radius: 3,
    deck: type === "Spine" ? 0.25 : 1,
    coping: ramp,
    grindable: true,
    material: ramp ? "wood" : rail ? "metal" : "concrete",
    ...(type === "Path"
      ? {
          points: [
            [-2, 0],
            [2, 0],
          ] as [number, number][],
        }
      : {}),
  };
}
export function validateLayout(data: unknown): ParkLayout {
  const d = data as ParkLayout;
  if (
    !d ||
    d.version !== 1 ||
    d.base !== "outdoor" ||
    !Array.isArray(d.objects) ||
    d.objects.length > LIMIT ||
    !Array.isArray(d.terrain) ||
    d.terrain.length > 1000
  )
    throw new Error("Unsupported or oversized park file.");
  const result = blankLayout();
  result.title = String(d.title || "Imported park").slice(0, 64);
  result.creator = String(d.creator || "Local rider").slice(0, 64);
  const ids = new Set<string>();
  result.objects = d.objects.map((o) => {
    if (
      !TYPES.includes(o.type) ||
      ids.has(o.id) ||
      typeof o.id !== "string" ||
      !/^o-[a-z0-9-]{1,90}$/i.test(o.id)
    )
      throw new Error("Invalid object.");
    ids.add(o.id);
    const n = makeObject(o.type);
    n.id = o.id;
    for (const key of [
      "x",
      "y",
      "z",
      "rotation",
      "width",
      "height",
      "length",
      "radius",
      "deck",
    ] as const) {
      if (!Number.isFinite(o[key])) throw new Error("Invalid dimensions.");
      n[key] = o[key];
    }
    if (
      Math.abs(n.x) > 110 ||
      n.z < -160 ||
      n.z > 70 ||
      n.y < -3 ||
      n.y > 20 ||
      [n.width, n.height, n.length, n.radius].some((v) => v < 0.05 || v > 40) ||
      n.deck < 0 ||
      n.deck > 15
    )
      throw new Error("Object is outside park limits.");
    if (o.type === "Path") {
      if (
        !Array.isArray(o.points) ||
        o.points.length < 2 ||
        o.points.length > 80 ||
        o.points.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 2 ||
            p.some((v) => !Number.isFinite(v) || Math.abs(v) > 150),
        )
      )
        throw new Error("Invalid path points.");
      n.points = o.points.map((p) => [p[0], p[1]]);
    }
    n.coping = !!o.coping;
    n.grindable = !!o.grindable;
    if (typeof o.asset === "string" && /^[a-z0-9-]{1,40}$/.test(o.asset)) n.asset = o.asset;
    n.material = [
      "wood",
      "metal",
      "concrete",
      "grass",
      "dirt",
      "gravel",
      "asphalt",
    ].includes(o.material)
      ? o.material
      : "concrete";
    return n;
  });
  result.terrain = d.terrain.map((b) => {
    if (
      !["raise", "lower", "smooth", "flatten"].includes(b.mode) ||
      ![b.x, b.z, b.radius, b.strength, b.target].every(Number.isFinite) ||
      b.radius < 0.5 ||
      b.radius > 20 ||
      Math.abs(b.strength) > 3 ||
      Math.abs(b.target) > 5 ||
      Math.abs(b.x) > 110 ||
      b.z < -160 ||
      b.z > 70
    )
      throw new Error("Invalid terrain brush.");
    return { ...b };
  });
  if (d.baseEdits && typeof d.baseEdits === "object")
    for (const [key, v] of Object.entries(d.baseEdits).slice(0, 5000)) {
      if (
        !/^base-[a-z0-9_-]{1,100}$/i.test(key) ||
        ![v.x, v.y, v.z, v.rotation].every(Number.isFinite) ||
        Math.abs(v.x) > 220 ||
        Math.abs(v.y) > 20 ||
        Math.abs(v.z) > 320
      )
        throw new Error("Invalid base edit.");
      if (
        v.scale &&
        (!Array.isArray(v.scale) ||
          v.scale.length !== 3 ||
          v.scale.some((n) => !Number.isFinite(n) || n < 0.1 || n > 5))
      )
        throw new Error("Invalid asset scale.");
      if (v.color && !/^#[0-9a-f]{6}$/i.test(v.color))
        throw new Error("Invalid asset color.");
      result.baseEdits[key] = {
        x: v.x,
        y: v.y,
        z: v.z,
        rotation: v.rotation,
        hidden: !!v.hidden,
        ...(v.scale ? { scale: v.scale } : {}),
        ...(v.color ? { color: v.color } : {}),
      };
    }
  return result;
}
export let activeLayout: ParkLayout | null = null;
export function setActiveLayout(l: ParkLayout | null) {
  activeLayout = l;
}
export function brushHeight(x: number, z: number, base: number) {
  let h = base;
  // Preserve the existing wooden riding surfaces in normal overlay mode.
  if (Math.abs(x) < 24 && Math.abs(z) < 33) return h;
  for (const b of activeLayout?.terrain ?? []) {
    const t = Math.max(0, 1 - Math.hypot(x - b.x, z - b.z) / b.radius);
    const w = t * t * (3 - 2 * t);
    if (b.mode === "raise" || b.mode === "lower")
      h += w * b.strength * (b.mode === "lower" ? -1 : 1);
    else h += (b.target - h) * w * Math.min(1, b.strength);
  }
  return Math.max(-3, Math.min(5, h));
}
export function localXZ(o: ParkObject, x: number, z: number) {
  const c = Math.cos(o.rotation),
    s = Math.sin(o.rotation);
  return { x: (x - o.x) * c - (z - o.z) * s, z: (x - o.x) * s + (z - o.z) * c };
}
export function surface(o: ParkObject, x: number, z: number): number | null {
  if (Math.abs(x) > o.width / 2 || Math.abs(z) > o.length / 2) return null;
  const t = (z + o.length / 2) / o.length,
    q = (v: number) => o.height * (1 - Math.sqrt(Math.max(0, 1 - v * v)));
  if (["Quarter Pipe", "Launch Ramp"].includes(o.type)) {
    const run = Math.min(o.length, Math.max(0.2, o.radius));
    return q(Math.min(1, Math.max(0, (z + o.length / 2) / run)));
  }
  if (["Half Pipe", "Mini Ramp"].includes(o.type)) {
    const run = Math.min(o.length / 2, o.radius);
    return q(Math.max(0, (Math.abs(z) - (o.length / 2 - run)) / run));
  }
  if (o.type === "Spine") {
    const a = Math.max(
      0,
      (Math.abs(z) - o.deck / 2) / Math.max(0.1, o.length / 2 - o.deck / 2),
    );
    return q(Math.max(0, 1 - a));
  }
  if (o.type === "Bank" || o.type === "Landing Ramp") return o.height * t;
  if (o.type === "Box Jump") {
    const run = Math.max(
      0.1,
      (o.length - Math.min(o.deck, o.length - 0.2)) / 2,
    );
    return (
      o.height * Math.min(1, (z + o.length / 2) / run, (o.length / 2 - z) / run)
    );
  }
  if (o.type === "Stairs")
    return (
      (Math.ceil(t * Math.max(2, Math.round(o.height / 0.25))) /
        Math.max(2, Math.round(o.height / 0.25))) *
      o.height
    );
  if (["Ledge", "Grind Box", "Platform", "Barrier"].includes(o.type))
    return o.height;
  return null;
}
export function objectHeight(x: number, z: number, base: number) {
  let h = base;
  for (const o of activeLayout?.objects ?? []) {
    if (o.nonSolid) continue;
    const p = localXZ(o, x, z),
      v = surface(o, p.x, p.z);
    if (v !== null) h = Math.max(h, o.y + v);
  }
  return h;
}
export class LayoutHistory {
  past: ParkLayout[] = [];
  future: ParkLayout[] = [];
  constructor(public layout = blankLayout()) {}
  commit(change: (l: ParkLayout) => void) {
    const next = clone(this.layout);
    change(next);
    const valid = validateLayout(next);
    this.past.push(clone(this.layout));
    if (this.past.length > 60) this.past.shift();
    this.layout = valid;
    this.future = [];
  }
  undo() {
    if (!this.past.length) return;
    this.future.push(clone(this.layout));
    this.layout = this.past.pop()!;
  }
  redo() {
    if (!this.future.length) return;
    this.past.push(clone(this.layout));
    this.layout = this.future.pop()!;
  }
}

export let editedHeightQuery: ((x: number, z: number) => number) | null = null;
export function setEditedHeightQuery(fn: typeof editedHeightQuery) {
  editedHeightQuery = fn;
}
