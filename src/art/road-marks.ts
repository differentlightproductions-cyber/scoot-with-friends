// Cracks and oil stains on the roads, laid here and there as marks of their own.
// They used to be painted into the tiling asphalt texture, which repeated the
// same crack every few metres; now the asphalt is clean and each road gets a
// sparse, varied scatter of these instead.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry, Noise2 } from "./noise";

export type RoadMarkKind = "crack" | "oil";
export interface RoadMark {
  x: number; z: number;
  /** Heading of the mark's long side, like a rider's yaw (0 = +z). */
  yaw: number;
  kind: RoadMarkKind;
  /** Crack: 0 hairline, 1 sealed with tar, 2 alligator patch, 3 transverse. Oil: 0 drip, 1 splotch, 2 drip line, 3 old stain. */
  variant: number;
  /** Along the heading, metres; the width follows from the mark's own proportions (markWidth). */
  length: number;
}

// The atlas: long cells (4:1) for the cracks that run and the drip line, square
// ones for the patch and the stains, so a mark is never stretched one way.
const W = 1024, H = 512;
const CELLS: Record<string, { x: number; y: number; w: number; h: number }> = {
  crack0: { x: 0, y: 0, w: 512, h: 128 }, crack1: { x: 512, y: 0, w: 512, h: 128 },
  crack3: { x: 0, y: 128, w: 512, h: 128 }, oil2: { x: 512, y: 128, w: 512, h: 128 },
  crack2: { x: 0, y: 256, w: 256, h: 256 }, oil0: { x: 256, y: 256, w: 256, h: 256 },
  oil1: { x: 512, y: 256, w: 256, h: 256 }, oil3: { x: 768, y: 256, w: 256, h: 256 },
};
const cellOf = (kind: RoadMarkKind, variant: number) => CELLS[kind + (variant & 3)];
/** A mark's width for its length, in the proportions it was drawn at. */
export const markWidth = (kind: RoadMarkKind, variant: number, length: number) => { const c = cellOf(kind, variant); return (length * c.h) / c.w; };

let atlas: THREE.Texture | null = null;
/** One canvas of every mark. Only what is drawn is opaque; the rest is cut away. */
function markAtlas() {
  if (atlas) return atlas;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!, random = mulberry(8801), noise = new Noise2(8802);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  /** A crack's path along a long cell: it wanders but stays inside it. */
  const run = (w: number, h: number, step: number, wander: number) => {
    let x = 10, y = h / 2 + (random() - 0.5) * h * 0.3, angle = (random() - 0.5) * 0.3;
    const points: [number, number][] = [[x, y]];
    while (x < w - 12) {
      angle += (random() - 0.5) * wander - ((y - h / 2) / (h / 2)) * 0.18;
      angle = THREE.MathUtils.clamp(angle, -0.9, 0.9);
      x += Math.cos(angle) * step; y += Math.sin(angle) * step;
      points.push([x, y]);
    }
    return points;
  };
  const branch = (x: number, y: number, angle: number, steps: number, step: number) => {
    const points: [number, number][] = [[x, y]];
    for (let s = 0; s < steps; s++) { angle += (random() - 0.5) * 0.8; x += Math.cos(angle) * step; y += Math.sin(angle) * step; points.push([x, y]); }
    return points;
  };
  const stroke = (points: [number, number][], width: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.stroke();
  };
  /** Draws in a cell's own coordinates, kept 4 px inside its edge so neighbours never bleed. */
  const inCell = (name: string, draw: (w: number, h: number) => void) => {
    const cell = CELLS[name];
    ctx.save(); ctx.beginPath(); ctx.rect(cell.x + 4, cell.y + 4, cell.w - 8, cell.h - 8); ctx.clip();
    ctx.translate(cell.x, cell.y); draw(cell.w, cell.h); ctx.restore();
  };
  inCell("crack0", (w, h) => { // A hairline crack with a few short branches.
    const main = run(w, h, 11, 0.55);
    stroke(main, 2.4, "rgb(30,30,30)");
    for (let b = 0; b < 4; b++) {
      const [x, y] = main[3 + Math.floor(random() * (main.length - 6))];
      stroke(branch(x, y, (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.8), 3 + Math.floor(random() * 5), 8), 1.6, "rgb(36,36,36)");
    }
  });
  inCell("crack1", (w, h) => { // A crack sealed with a meandering band of tar.
    const main = run(w, h, 12, 0.35);
    stroke(main, 8, "rgb(24,24,26)");
    stroke(main, 2, "rgb(14,14,15)");
  });
  inCell("crack3", (w, h) => { // A transverse crack, spalled a little along its edge.
    const main = run(w, h, 10, 0.8);
    stroke(main, 5, "rgb(50,50,49)");
    stroke(main, 2.2, "rgb(26,26,26)");
  });
  inCell("crack2", (w, h) => { // Alligator cracking: a patch of small polygons.
    const sites: [number, number][] = [];
    for (let i = 0; i < 26; i++) { const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 0.36; sites.push([w / 2 + Math.cos(a) * r * w * 1.1, h / 2 + Math.sin(a) * r * h * 0.85]); }
    for (const [x, y] of sites) {
      const near = sites.map((p) => [p, Math.hypot(p[0] - x, p[1] - y)] as const).sort((a, b) => a[1] - b[1]).slice(1, 4);
      for (const [[px, py]] of near) { const mx = (x + px) / 2 + (random() - 0.5) * 8, my = (y + py) / 2 + (random() - 0.5) * 8; stroke([[x, y], [mx, my], [px, py]], 2.2, "rgb(32,32,32)"); }
    }
  });
  // Oil: dark, grainy stains with ragged edges, lighter toward the rim.
  const blob = (name: string, x: number, y: number, r: number, stretch: number, rgb: [number, number, number]) => {
    const cell = CELLS[name], img = ctx.getImageData(cell.x, cell.y, cell.w, cell.h), d = img.data;
    const ox = (random() - 0.5) * 50, oy = (random() - 0.5) * 50;
    for (let py = 4; py < cell.h - 4; py++) for (let px = 4; px < cell.w - 4; px++) {
      const dist = Math.hypot((px - x) / stretch, py - y) / r;
      const edge = 1 + noise.fbm(px * 0.035 + ox, py * 0.035 + oy, 3) * 0.55;
      if (dist > edge) continue;
      const i = (py * cell.w + px) * 4, grain = 0.82 + random() * 0.36, rim = 1 - Math.min(1, dist / edge) * 0.35;
      d[i] = (rgb[0] * grain) / rim; d[i + 1] = (rgb[1] * grain) / rim; d[i + 2] = (rgb[2] * grain) / rim; d[i + 3] = 255;
    }
    ctx.putImageData(img, cell.x, cell.y);
  };
  blob("oil0", 128, 128, 62, 1, [34, 31, 28]);
  blob("oil1", 116, 128, 70, 1.25, [30, 28, 26]);
  for (let i = 0; i < 4; i++) blob("oil1", 40 + random() * 176, 40 + random() * 176, 8 + random() * 10, 1, [36, 33, 30]);
  for (let i = 0; i < 11; i++) blob("oil2", 24 + i * 43 + (random() - 0.5) * 14, 64 + (random() - 0.5) * 16, 8 + random() * 14, 1, [38, 35, 31]);
  blob("oil3", 128, 128, 80, 1.15, [66, 64, 60]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return (atlas = t);
}

let material: THREE.MeshStandardMaterial | null = null;
/**
 * Cut out, not blended, so the weather's snow and wet looks reach the marks
 * like the road under them. Far off, thin cracks mip away to nothing.
 */
function markMaterial() {
  return (material ??= new THREE.MeshStandardMaterial({
    map: markAtlas(), alphaTest: 0.5, roughness: 0.9, name: "Road cracks and oil",
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  }));
}

/**
 * The marks as one mesh, each a small grid draped over `height` so it follows
 * the road's crown and grade, a few millimetres above it.
 */
export function roadMarksMesh(marks: RoadMark[], height: (x: number, z: number) => number, name = "Road cracks and oil") {
  if (!marks.length) return null;
  const parts = marks.map((m) => {
    const cell = cellOf(m.kind, m.variant), width = markWidth(m.kind, m.variant, m.length);
    const g = new THREE.PlaneGeometry(1, 1, Math.max(2, Math.round(m.length / 0.8)), Math.max(1, Math.round(width / 0.8)));
    const p = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
    const ux = Math.sin(m.yaw), uz = Math.cos(m.yaw), vx = Math.cos(m.yaw), vz = -Math.sin(m.yaw);
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) * m.length, v = p.getY(i) * width;
      const x = m.x + ux * u + vx * v, z = m.z + uz * u + vz * v;
      p.setXYZ(i, x, height(x, z) + 0.006, z);
      // The mark's atlas cell (canvas y runs down; the texture's v runs up).
      uv.setXY(i, (cell.x + uv.getX(i) * cell.w) / W, 1 - (cell.y + (1 - uv.getY(i)) * cell.h) / H);
    }
    // Laid flat this way (length along the heading, width to its right) the plane's winding faces up.
    g.computeVertexNormals();
    return g;
  });
  const geometry = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geometry, markMaterial());
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A sparse scatter along a road: a crack every 14-60 m (now and then two close
 * together), an oil stain every 35-125 m, mostly where tyres run. `at(s)` gives
 * the road's centre and heading `s` metres along; `halfWidth` its half width.
 */
export function scatterAlongRoad(length: number, at: (s: number) => { x: number; z: number; yaw: number }, halfWidth: number, seed: number) {
  const random = mulberry(seed), marks: RoadMark[] = [];
  const place = (s: number, offset: number, kind: RoadMarkKind, variant: number, size: number, turn: number) => {
    const p = at(s), yaw = p.yaw + turn, width = markWidth(kind, variant, size);
    // Keep the whole mark on the pavement.
    const reach = (Math.abs(Math.sin(turn)) * size) / 2 + (Math.abs(Math.cos(turn)) * width) / 2;
    offset = THREE.MathUtils.clamp(offset, -halfWidth + 0.3 + reach, halfWidth - 0.3 - reach);
    marks.push({ x: p.x + Math.cos(p.yaw) * offset, z: p.z - Math.sin(p.yaw) * offset, yaw, kind, variant, length: size });
  };
  const crack = (s: number) => {
    const r = random(), variant = r < 0.35 ? 0 : r < 0.65 ? 1 : r < 0.8 ? 2 : 3;
    const offset = (random() * 2 - 1) * halfWidth;
    if (variant === 2) place(s, offset, "crack", 2, 1.2 + random() * 1.3, random() * Math.PI);
    else if (variant === 3) place(s, offset, "crack", 3, 2 + random() * 3, Math.PI / 2 + (random() - 0.5) * 0.4);
    else place(s, offset, "crack", variant, 2.6 + random() * 3.6, (random() - 0.5) * 0.35 + (random() < 0.5 ? 0 : Math.PI));
  };
  for (let s = 8 + random() * 30; s < length - 8; s += 14 + random() * 46) {
    crack(s);
    if (random() < 0.25) crack(s + 1.5 + random() * 3);
  }
  for (let s = 15 + random() * 60; s < length - 8; s += 35 + random() * 90) {
    const r = random(), variant = r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3;
    // Tyre lines and the middle of a lane, where cars drip.
    const lane = (random() < 0.5 ? -1 : 1) * halfWidth * 0.5, offset = lane + (random() - 0.5) * halfWidth * 0.5;
    const size = variant === 2 ? 2 + random() * 2 : variant === 3 ? 1.2 + random() * 0.8 : 0.55 + random() * 0.7;
    place(s, offset, "oil", variant, size, variant === 2 ? (random() - 0.5) * 0.2 : random() * Math.PI * 2);
  }
  return marks;
}

/** A sparse scatter over flat rectangles of street (x0..x1, z0..z1): about one mark per `area` square metres. */
export function scatterInRects(rects: { x0: number; x1: number; z0: number; z1: number }[], area: number, seed: number) {
  const random = mulberry(seed), marks: RoadMark[] = [];
  for (const r of rects) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (w < 3 || d < 3) continue;
    const along = w > d ? Math.PI / 2 : 0;
    for (let n = Math.floor((w * d) / area + random()); n > 0; n--) {
      const kind: RoadMarkKind = random() < 0.35 ? "oil" : "crack", variant = Math.floor(random() * 4);
      const length = kind === "oil" ? (variant === 2 ? 1.8 + random() * 1.5 : 0.6 + random() * 0.9) : variant === 2 ? 1.2 + random() : 2.2 + random() * 3;
      const m = 0.4 + Math.max(length, markWidth(kind, variant, length)) / 2;
      if (w < 2 * m || d < 2 * m) continue;
      const yaw = kind === "oil" && variant !== 2 ? random() * Math.PI * 2 : along + (kind === "crack" && variant === 3 ? Math.PI / 2 : 0) + (random() - 0.5) * 0.4;
      marks.push({ x: r.x0 + m + random() * (w - 2 * m), z: r.z0 + m + random() * (d - 2 * m), yaw, kind, variant, length });
    }
  }
  return marks;
}
