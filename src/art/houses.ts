// Boulder City hillside houses (#89, after the owner's aerial photos of B Hill):
// stucco ranch homes under terracotta, concrete-tile or standing-seam roofs,
// two-storeys, and white flat-roofed pueblo houses with parapets and vigas.
// Solar arrays on the roofs, AC units, a garage wing and a concrete driveway
// that climbs from the street into it, cars and RVs parked out front. Each
// sits on a gravel lot on a block retaining pad; behind, a block-walled
// backyard with a covered patio and often a pool, turf, a shed or a
// trampoline. The lots are walkable: the pad, the driveway and the pool floor
// are solid, the walls can be climbed.
//
// A street's houses merge into one mesh per material per chunk of road, so the
// camera and the sun's shadow only draw the chunks they can see; windows, cars
// and pool gear are a chunk's distance detail.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry, Noise2 } from "./noise";
import { gravelTexture } from "./textures";
import { lawnTexture } from "../park/art";
import { buildVehicle, VEHICLE_SIZE, type VehicleKind } from "./vehicles";

export type HouseStyle = "ranch" | "twoStorey" | "pueblo";
export type RoofKind = "barrel" | "tile" | "metal" | "flat";
/** A rectangle in the lot's frame: centre and full size (x across, z toward the street). */
export interface LotRect { x: number; z: number; w: number; l: number }

/**
 * A house's plan from its seed, in the lot's own frame: x across the lot,
 * +z toward the street, the lot centred on the origin.
 */
export interface HousePlan {
  seed: number; style: HouseStyle; roof: RoofKind; paint: number; gravel: number;
  /** House body: size and centre. */
  w: number; d: number; h: number; hx: number; hz: number;
  /** Garage wing: size, which side, centre. */
  gw: number; gd: number; gside: number; gx: number; gz: number;
  /** Lot size. */
  LW: number; LD: number;
  /** The house's front wall and the garage door face (the driveway's top end). */
  front: number; door: number;
  /** Half the driveway's width. */
  drive: number;
  pool: LotRect | null; patio: LotRect;
  /** Where the front door is (x). */
  doorX: number;
  solar: boolean; turf: boolean; shed: boolean; trampoline: boolean; pergola: boolean; table: boolean;
  car: VehicleKind | null; rv: VehicleKind | null;
}
/** A sited lot: the plan placed in the world. */
export interface HouseLot {
  plan: HousePlan;
  /** Lot centre and heading: the lot's +z (the house front) faces `yaw`. */
  x: number; z: number; yaw: number;
  /** Yard level, and the lowest natural ground under the lot (the retaining pad's foot). */
  pad: number; ground: number;
  /**
   * The driveway runs from the garage door down to `foot` at `reach` metres in
   * front of the lot, twisting to fall `tilt` per metre across at its foot so it
   * meets a street that runs downhill across it.
   */
  foot: number; reach: number; tilt: number;
  /** The ground's height at a world point, for the apron and mailbox beyond the lot. */
  groundAt?: (x: number, z: number) => number;
  /** Which chunk of the street this lot draws in. */
  chunk: number;
}
/** A solid box in world space (for colliders). */
export interface HouseSolid { center: THREE.Vector3; quaternion: THREE.Quaternion; half: THREE.Vector3 }
/** A spot in a yard for a palm or shrub. */
export interface YardSpot { x: number; y: number; z: number; kind: "palm" | "tree" | "yucca" | "shrub" }
/** Distance detail for one chunk of the street. */
export interface DetailChunk { center: THREE.Vector3; radius: number; meshes: THREE.Object3D[] }

export const POOL_DEPTH = 1.45;

// ---- Textures ------------------------------------------------------------------
const cache = new Map<string, THREE.Texture>();
function paint(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, random: () => number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!, mulberry(key.length * 131 + w));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}
/** Sand-finish stucco: near white, so each house's paint colour comes from its vertices. */
const stuccoTexture = () => paint("stucco", 256, 256, (ctx, random) => {
  const img = ctx.createImageData(256, 256), noise = new Noise2(51);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const a = (x / 256) * Math.PI * 2, b = (y / 256) * Math.PI * 2;
    const n = noise.fbm(Math.cos(a) * 2 + Math.sin(b), Math.sin(a) * 2 + Math.cos(b) * 2, 4);
    const v = 232 * (1 + n * 0.05 + (random() - 0.5) * 0.08), i = (y * 256 + x) * 4;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 0.98; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
});
/** Barrel (S) tile in mixed terracotta, or flat concrete tile in grey-brown. */
const roofTexture = (kind: "barrel" | "tile") => paint("roof-" + kind, 256, 256, (ctx, random) => {
  const rows = 8, cols = kind === "barrel" ? 8 : 6, rh = 256 / rows, cw = 256 / cols;
  ctx.fillStyle = kind === "barrel" ? "#6e3a24" : "#4c4640"; ctx.fillRect(0, 0, 256, 256);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = k * cw + (kind === "tile" && r % 2 ? cw / 2 : 0), y = r * rh;
    const tone = kind === "barrel"
      ? [[178, 92, 58], [160, 80, 50], [190, 110, 70], [146, 74, 48], [170, 100, 72]][Math.floor(random() * 5)]
      : [[128, 120, 112], [112, 104, 98], [138, 128, 116], [120, 110, 100]][Math.floor(random() * 4)];
    const light = 0.9 + random() * 0.2;
    for (const dx of [0, 256]) {
      const g = ctx.createLinearGradient(x - dx, 0, x - dx + cw, 0);
      const c = (f: number) => `rgb(${tone[0] * light * f},${tone[1] * light * f},${tone[2] * light * f})`;
      if (kind === "barrel") { g.addColorStop(0, c(0.55)); g.addColorStop(0.45, c(1.12)); g.addColorStop(1, c(0.5)); }
      else { g.addColorStop(0, c(1.05)); g.addColorStop(0.9, c(0.95)); g.addColorStop(1, c(0.6)); }
      ctx.fillStyle = g;
      ctx.fillRect(x - dx + 1, y + 1, cw - 2, rh - 1);
    }
    // The lower edge of each course shadows the one below it.
    ctx.fillStyle = "rgba(20,10,5,.45)"; ctx.fillRect(0, y + rh - 3, 256, 3);
  }
});
/** Standing-seam steel in pale grey, a raised seam every half metre (the photos' light metal roofs). */
const metalTexture = () => paint("roof-metal", 256, 256, (ctx, random) => {
  ctx.fillStyle = "#b7bbbd"; ctx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 8; k++) {
    const x = k * 32, t = 0.94 + random() * 0.1;
    ctx.fillStyle = `rgb(${183 * t},${187 * t},${189 * t})`; ctx.fillRect(x + 3, 0, 27, 256);
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(x, 0, 2, 256);
    ctx.fillStyle = "rgba(40,45,50,.35)"; ctx.fillRect(x + 2, 0, 2, 256);
  }
  for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(90,80,70,${random() * 0.06})`; ctx.fillRect(random() * 256, random() * 256, 6, 3); }
});
/** Split-face concrete block in running bond: the retaining and yard walls. */
const blockTexture = () => paint("block", 256, 256, (ctx, random) => {
  ctx.fillStyle = "#9d9080"; ctx.fillRect(0, 0, 256, 256);
  const bw = 64, bh = 32;
  for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) {
    const x = k * bw + (r % 2 ? bw / 2 : 0), y = r * bh, t = 0.88 + random() * 0.2;
    ctx.fillStyle = `rgb(${200 * t},${184 * t},${160 * t})`; ctx.fillRect(x + 2, y + 2, bw - 3, bh - 3);
    for (let s = 0; s < 60; s++) {
      ctx.fillStyle = random() < 0.5 ? "rgba(255,250,240,.25)" : "rgba(80,70,60,.22)";
      ctx.fillRect(x + 2 + random() * (bw - 5), y + 2 + random() * (bh - 5), 2 + random() * 3, 2);
    }
  }
});
/**
 * One atlas for the small facade parts, so they share a material: windows, the
 * garage door, the front door, a sliding patio door, a solar panel and an AC
 * unit's fan grille. Regions are in canvas pixels of the 512 x 512 atlas.
 */
const ATLAS = {
  window: [0, 0, 256, 256], garage: [256, 0, 256, 128], door: [256, 128, 64, 128],
  solar: [320, 128, 64, 128], grille: [384, 128, 128, 128], slider: [0, 256, 256, 256],
} as const;
type AtlasPart = keyof typeof ATLAS;
const facadeTexture = () => paint("facade", 512, 512, (ctx, random) => {
  const at = (part: AtlasPart, w: number, h: number, draw: () => void) => {
    const [x, y, pw, ph] = ATLAS[part];
    ctx.save(); ctx.translate(x, y); ctx.scale(pw / w, ph / h); draw(); ctx.restore();
  };
  // Bronze-anodised window: frame, a centre mullion, glass reflecting the sky.
  const glass = (x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#9fb6c8"); g.addColorStop(0.45, "#4f6776"); g.addColorStop(1, "#1e2a32");
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.beginPath(); ctx.moveTo(x, y + h * 0.55); ctx.lineTo(x + w * 0.6, y); ctx.lineTo(x + w * 0.8, y); ctx.lineTo(x, y + h * 0.75); ctx.fill();
  };
  at("window", 128, 128, () => { ctx.fillStyle = "#4a3a2c"; ctx.fillRect(0, 0, 128, 128); glass(8, 8, 54, 112); glass(66, 8, 54, 112); });
  at("slider", 128, 128, () => { ctx.fillStyle = "#5a4a3a"; ctx.fillRect(0, 0, 128, 128); glass(6, 6, 56, 118); glass(66, 6, 56, 118); ctx.fillStyle = "#3a2d22"; ctx.fillRect(60, 60, 4, 16); });
  // Sectional steel garage door, raised panels.
  at("garage", 256, 128, () => {
    ctx.fillStyle = "#e7e1d4"; ctx.fillRect(0, 0, 256, 128);
    for (let r = 0; r < 4; r++) {
      ctx.fillStyle = "rgba(60,50,40,.35)"; ctx.fillRect(0, r * 32, 256, 2);
      for (let k = 0; k < 8; k++) {
        const x = k * 32 + 4, y = r * 32 + 6;
        ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(x, y, 24, 2); ctx.fillRect(x, y, 2, 20);
        ctx.fillStyle = "rgba(70,60,50,.3)"; ctx.fillRect(x, y + 20, 24, 2); ctx.fillRect(x + 22, y, 2, 22);
      }
    }
  });
  // Front door: stained wood, six panels, a brass handle.
  at("door", 64, 128, () => {
    ctx.fillStyle = "#6a4128"; ctx.fillRect(0, 0, 64, 128);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) {
      const x = 8 + k * 26, y = 8 + r * 38;
      ctx.fillStyle = "#57331f"; ctx.fillRect(x, y, 22, 32);
      ctx.fillStyle = "rgba(255,220,180,.18)"; ctx.fillRect(x, y, 22, 2); ctx.fillRect(x, y, 2, 32);
    }
    ctx.fillStyle = "#c9a45a"; ctx.fillRect(52, 64, 5, 8);
  });
  // Solar panel: 6 x 10 blue-black cells in a silver frame.
  at("solar", 64, 128, () => {
    ctx.fillStyle = "#c9ced3"; ctx.fillRect(0, 0, 64, 128);
    for (let r = 0; r < 10; r++) for (let k = 0; k < 6; k++) {
      const t = 0.9 + random() * 0.2;
      ctx.fillStyle = `rgb(${24 * t},${36 * t},${72 * t})`; ctx.fillRect(3 + k * 9.7, 3 + r * 12.2, 9, 11.5);
    }
    const sheen = ctx.createLinearGradient(0, 0, 64, 128); sheen.addColorStop(0, "rgba(160,190,230,.25)"); sheen.addColorStop(0.5, "rgba(0,0,0,0)");
    ctx.fillStyle = sheen; ctx.fillRect(2, 2, 60, 124);
  });
  // AC unit: louvred grey casing round a black fan grille.
  at("grille", 128, 128, () => {
    ctx.fillStyle = "#b9bab5"; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#26282a"; ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#8d8f8c"; ctx.lineWidth = 2;
    for (let r = 12; r < 52; r += 8) { ctx.beginPath(); ctx.arc(64, 64, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(12, 64); ctx.lineTo(116, 64); ctx.moveTo(64, 12); ctx.lineTo(64, 116); ctx.stroke();
  });
});

const materials = () => {
  const turf = lawnTexture(1, 1);
  turf.repeat.set(1 / 2.5, 1 / 2.5);
  return {
    stucco: new THREE.MeshStandardMaterial({ map: stuccoTexture(), vertexColors: true, roughness: 0.95, name: "House stucco" }),
    barrel: new THREE.MeshStandardMaterial({ map: roofTexture("barrel"), roughness: 0.8, name: "Barrel tile roof" }),
    tile: new THREE.MeshStandardMaterial({ map: roofTexture("tile"), roughness: 0.85, name: "Concrete tile roof" }),
    metal: new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.45, metalness: 0.55, name: "Metal roof" }),
    block: new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.95, name: "Block walls" }),
    gravel: new THREE.MeshStandardMaterial({ map: gravelTexture(), vertexColors: true, roughness: 1, name: "Yard gravel" }),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, name: "House trim and paving" }),
    facade: new THREE.MeshStandardMaterial({ map: facadeTexture(), roughness: 0.35, metalness: 0.2, name: "Windows and doors" }),
    turf: new THREE.MeshStandardMaterial({ map: turf, color: 0xa8d890, roughness: 0.95, name: "Yard turf" }),
    water: new THREE.MeshStandardMaterial({ color: 0x2fa7c9, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.78, depthWrite: false, name: "Pool water" }),
    // Clear-coated paint and glass mirror the sky (the graphics presets keep this strength).
    gloss: Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.3, envMapIntensity: 1.1, name: "Car paint and chrome" }), { userData: { envMapIntensity: 1.1 } }),
  };
};
type Kit = ReturnType<typeof materials>;
type Part = keyof Kit;
/** Drawn only near the rider. */
const DETAIL: Part[] = ["facade", "turf", "water", "gloss"];

// ---- Geometry --------------------------------------------------------------------
/** A box with its UVs in metres / `tile`, so textures keep their scale on any size. */
function box(w: number, h: number, d: number, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.getAttribute("uv");
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}
/**
 * A driveway slab `w` wide from z=0 (level with the garage floor at y=0) to
 * z=run: its centre falls `fall` and its foot twists to rise `tilt` per metre
 * toward +x, as drivewayAt() has it; the sides go down `thick`. UVs in metres / `tile`.
 */
function driveSlab(w: number, run: number, fall: number, tilt: number, thick: number, tile: number) {
  const p: number[] = [], n: number[] = [], uv: number[] = [];
  const y = (x: number, z: number) => (-fall + tilt * x) * (z / run);
  const up = (x: number, z: number) => new THREE.Vector3(-tilt * (z / run), 1, -(-fall + tilt * x) / run).normalize();
  const corner = (v: THREE.Vector3, normal: THREE.Vector3, u: number, t: number) => { p.push(v.x, v.y, v.z); n.push(normal.x, normal.y, normal.z); uv.push(u / tile, t / tile); };
  /** Two triangles a-b-c, a-c-d (counter-clockwise from outside). */
  const quad = (q: THREE.Vector3[], normals: THREE.Vector3[], uvs: number[][]) => {
    for (const i of [0, 1, 2, 0, 2, 3]) corner(q[i], normals[i], uvs[i][0], uvs[i][1]);
  };
  const V = (x: number, yy: number, z: number) => new THREE.Vector3(x, yy, z);
  const nx = 2, nz = Math.max(2, Math.ceil(run / 1.5));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = -w / 2 + (w * i) / nx, x1 = -w / 2 + (w * (i + 1)) / nx, z0 = (run * j) / nz, z1 = (run * (j + 1)) / nz;
    const q = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
    quad(q.map(([x, z]) => V(x, y(x, z), z)), q.map(([x, z]) => up(x, z)), q.map(([x, z]) => [x, z]));
  }
  const flatNormal = (q: THREE.Vector3[]) => { const nn = q[1].clone().sub(q[0]).cross(q[2].clone().sub(q[0])).normalize(); return [nn, nn, nn, nn]; };
  for (let j = 0; j < nz; j++) {
    const z0 = (run * j) / nz, z1 = (run * (j + 1)) / nz;
    for (const side of [1, -1]) {
      const x = (side * w) / 2, T0 = V(x, y(x, z0), z0), T1 = V(x, y(x, z1), z1), B1 = V(x, y(x, z1) - thick, z1), B0 = V(x, y(x, z0) - thick, z0);
      const q = side > 0 ? [T0, T1, B1, B0] : [T0, B0, B1, T1];
      quad(q, flatNormal(q), q.map((v) => [v.z, v.y]));
    }
  }
  for (const [z, out] of [[run, 1], [0, -1]]) {
    const L = V(-w / 2, y(-w / 2, z), z), R = V(w / 2, y(w / 2, z), z);
    const BL = L.clone().setY(L.y - thick), BR = R.clone().setY(R.y - thick);
    const q = out > 0 ? [BL, BR, R, L] : [BR, BL, L, R];
    quad(q, flatNormal(q), q.map((v) => [v.x, v.y]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/** A thin sheet over the lot-frame rectangle, draped `lift` above `heightAt(x, z)`. */
function drape(x0: number, x1: number, z0: number, z1: number, heightAt: (x: number, z: number) => number, lift: number, tile: number) {
  const nx = Math.max(1, Math.ceil((x1 - x0) / 1.2)), nz = Math.max(1, Math.ceil((z1 - z0) / 0.8));
  const g = new THREE.PlaneGeometry(1, 1, nx, nz), pos = g.getAttribute("position"), uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    const x = x0 + (pos.getX(i) + 0.5) * (x1 - x0), z = z0 + (0.5 - pos.getY(i)) * (z1 - z0);
    pos.setXYZ(i, x, heightAt(x, z) + lift, z);
    uv.setXY(i, x / tile, z / tile);
  }
  g.computeVertexNormals();
  return g;
}
/** A hip roof over a W x D rectangle (eaves at y=0) rising `rise`, tile UVs in metres / `tile`. */
function hipRoof(W: number, D: number, rise: number, tile: number) {
  const swap = D > W, w = swap ? D : W, d = swap ? W : D, r = (w - d) / 2;
  const p: number[] = [], uv: number[] = [];
  const slope = Math.hypot(d / 2, rise);
  const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => { p.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  for (const s of [1, -1]) {
    const A = [-w / 2 * s, 0, d / 2 * s], B = [w / 2 * s, 0, d / 2 * s], C = [r * s, rise, 0], E = [-r * s, rise, 0];
    const u = (x: number) => (x * s + w / 2) / tile;
    tri(A, B, C, [u(A[0]), 0], [u(B[0]), 0], [u(C[0]), slope / tile]);
    tri(A, C, E, [u(A[0]), 0], [u(C[0]), slope / tile], [u(E[0]), slope / tile]);
    const F = [w / 2 * s, 0, d / 2 * s], G = [w / 2 * s, 0, -d / 2 * s], H = [r * s, rise, 0];
    tri(F, G, H, [d / tile, 0], [0, 0], [d / 2 / tile, Math.hypot(w / 2 - r, rise) / tile]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (swap) g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
/** A quad (facing +z) showing one region of the facade atlas. */
function atlasQuad(w: number, h: number, part: AtlasPart) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.getAttribute("uv"), [x, y, pw, ph] = ATLAS[part];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * pw) / 512, 1 - (y + (1 - uv.getY(i)) * ph) / 512);
  return g;
}
/** A rounded rectangle outline (w across x, l along z) as a 2D shape path in (x, -z). */
function roundedRect(w: number, l: number, r: number): THREE.Shape;
function roundedRect(w: number, l: number, r: number, into: THREE.Path): THREE.Path;
function roundedRect(w: number, l: number, r: number, into: THREE.Path = new THREE.Shape()) {
  const x = w / 2, y = l / 2;
  into.moveTo(-x + r, -y);
  into.lineTo(x - r, -y); into.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  into.lineTo(x, y - r); into.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  into.lineTo(-x + r, y); into.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  into.lineTo(-x, -y + r); into.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  return into;
}
/** A flat shape laid on the ground (y = 0), UVs in metres / `tile`. */
function flat(shape: THREE.Shape, tile = 1) {
  const g = new THREE.ShapeGeometry(shape, 6);
  const pos = g.getAttribute("position"), uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
  return g.rotateX(-Math.PI / 2);
}
function colored(g: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color), n = g.getAttribute("position").count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
/**
 * Splits a lot rectangle round rectangular holes into a few boxes (for the
 * retaining pad and its colliders): a grid on every edge, merged into strips.
 */
export function cellsAround(W: number, D: number, holes: LotRect[]) {
  const xs = new Set([-W / 2, W / 2]), zs = new Set([-D / 2, D / 2]);
  for (const h of holes) {
    for (const x of [h.x - h.w / 2, h.x + h.w / 2]) if (x > -W / 2 && x < W / 2) xs.add(x);
    for (const z of [h.z - h.l / 2, h.z + h.l / 2]) if (z > -D / 2 && z < D / 2) zs.add(z);
  }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const inHole = (x: number, z: number) => holes.some((h) => Math.abs(x - h.x) < h.w / 2 && Math.abs(z - h.z) < h.l / 2);
  // Strips along x in each z band, then stacked where a band's strips repeat.
  let open: { x0: number; x1: number; z0: number; z1: number }[] = [];
  const done: typeof open = [];
  for (let j = 0; j < Z.length - 1; j++) {
    const z0 = Z[j], z1 = Z[j + 1], strips: [number, number][] = [];
    for (let i = 0; i < X.length - 1; i++) {
      if (inHole((X[i] + X[i + 1]) / 2, (z0 + z1) / 2)) continue;
      const last = strips[strips.length - 1];
      if (last && Math.abs(last[1] - X[i]) < 1e-6) last[1] = X[i + 1]; else strips.push([X[i], X[i + 1]]);
    }
    const next: typeof open = [];
    for (const [x0, x1] of strips) {
      const k = open.findIndex((o) => Math.abs(o.x0 - x0) < 1e-6 && Math.abs(o.x1 - x1) < 1e-6);
      if (k >= 0) { const o = open.splice(k, 1)[0]; o.z1 = z1; next.push(o); } else next.push({ x0, x1, z0, z1 });
    }
    done.push(...open);
    open = next;
  }
  done.push(...open);
  return done.map((c) => ({ x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, w: c.x1 - c.x0, l: c.z1 - c.z0 }));
}

const STUCCO = [0xefe3cc, 0xe6d5b5, 0xdcc6a2, 0xf1ebdd, 0xd8c2a8, 0xe9d9c0, 0xcfb99a, 0xe3cfb4];
const PUEBLO = [0xf4f1ea, 0xefe9dc, 0xf6f3ee, 0xe8dcc6, 0xd9c2a0];
// Decomposed granite in the photos' tans, salmon pinks and creams.
const GRAVEL = [0xe6d4bc, 0xe3bda9, 0xd4a58f, 0xeee4d2, 0xcfc6b8, 0xe0c8a8];
const TRIM = 0xeee6d6, CONCRETE = 0xcdc6b8, COPING = 0xe6dccb, PLASTER = 0x9fd8e0, WOOD = 0x7a5638, MEMBRANE = 0xdedbd3;

/**
 * A house's plan from its seed. `garageSide` overrides the garage wing's side
 * (the siting code picks the side that keeps the driveway rideable).
 */
export function planHouse(seed: number, garageSide?: 1 | -1): HousePlan {
  const random = mulberry(seed);
  const roll = random(), style: HouseStyle = roll < 0.3 ? "pueblo" : roll < 0.52 ? "twoStorey" : "ranch";
  const w = style === "pueblo" ? 10 + random() * 3.5 : 9 + random() * 3.5, d = 8 + random() * 3;
  const h = style === "twoStorey" ? 5.8 : style === "pueblo" ? 3.4 : 3.0;
  const roofRoll = random(), roof: RoofKind = style === "pueblo" ? "flat" : roofRoll < 0.55 ? "barrel" : roofRoll < 0.82 ? "tile" : "metal";
  const paint = style === "pueblo" ? PUEBLO[Math.floor(random() * PUEBLO.length)] : STUCCO[Math.floor(random() * STUCCO.length)];
  const gravel = GRAVEL[Math.floor(random() * GRAVEL.length)];
  const gw = 6.6, gd = 7.0, rolledSide = random() < 0.5 ? -1 : 1, gside = garageSide ?? rolledSide;
  const FY = 5.6 + random() * 2.4, BY = 8.6 + random() * 3.6;
  // An RV or trailer gets its own pad beside the garage, so the lot is wider there.
  const rv: VehicleKind | null = random() < 0.16 ? (random() < 0.5 ? "rv" : "trailer") : null, extra = rv ? 3.4 : 0;
  const T = w + gw - 0.2, LW = T + 3.2 + extra, LD = FY + d + BY, shift = -gside * extra / 2;
  const front = LD / 2 - FY, hz = front - d / 2;
  const hx = shift - gside * (gw - 0.2) / 2, gx = shift + gside * (T - gw) / 2, door = front + 1.2, gz = door - gd / 2;
  const doorX = hx - gside * w * 0.2;
  // The backyard: a patio against the house, a pool beyond it when there is room.
  const back = hz - d / 2, yard = back - -LD / 2;
  const patio = { x: hx, z: back - 1.6, w: Math.min(w * 0.75, 8), l: 3.2 };
  let pool: LotRect | null = null;
  const pl = 7 + random() * 2.5, pw = 3.8 + random() * 1.2;
  if (random() < 0.58 && yard >= pw + 4.4) {
    const px = THREE.MathUtils.clamp(hx + (random() - 0.5) * 3, -LW / 2 + 1.4 + pl / 2, LW / 2 - 1.4 - pl / 2);
    pool = { x: px, z: -LD / 2 + 1.5 + pw / 2 + (yard - pw - 4.4) * 0.3, w: pl, l: pw };
  }
  const car = random() < 0.62 ? (["sedan", "suv", "pickup", "suv", "sedan", "pickup"] as VehicleKind[])[Math.floor(random() * 6)] : null;
  return {
    seed, style, roof, paint, gravel, w, d, h, hx, hz, gw, gd, gside, gx, gz, LW, LD, front, door, drive: 2.8,
    pool, patio, doorX,
    solar: random() < 0.45, turf: random() < 0.4, shed: random() < 0.35, trampoline: !pool && random() < 0.3,
    pergola: random() < 0.6, table: random() < 0.45, car, rv,
  };
}

/** Where the driveway surface is at a point in the lot frame, or null off it (for the ground and the surface). */
export function drivewayAt(plan: HousePlan, lot: Pick<HouseLot, "pad" | "foot" | "reach" | "tilt">, lx: number, lz: number, margin = 0) {
  if (Math.abs(lx - plan.gx) > plan.drive + margin || lz < plan.door - 0.05 || lz > plan.LD / 2 + lot.reach + margin) return null;
  const t = THREE.MathUtils.clamp((lz - plan.door) / (plan.LD / 2 + lot.reach - plan.door), 0, 1);
  return lot.pad + (lot.foot - lot.pad + lot.tilt * (lx - plan.gx)) * t;
}

/**
 * Builds a street of houses. Returns the solid boxes for colliders, yard spots
 * for plants and each chunk's distance detail.
 */
export function buildHouses(scene: THREE.Scene, lots: HouseLot[]) {
  const kit = materials();
  const chunks = new Map<number, Map<Part, THREE.BufferGeometry[]>>();
  const bounds = new Map<number, THREE.Box3>();
  const solids: HouseSolid[] = [], yard: YardSpot[] = [], perches: THREE.Vector3[] = [];
  const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
  for (const lot of lots) {
    const plan = lot.plan, random = mulberry(plan.seed * 31 + 7);
    const { style, roof, w, d, h, hx, hz, gw, gd, gside, gx, gz, LW, LD, front, door, pool, patio, doorX } = plan;
    const turn = new THREE.Quaternion().setFromAxisAngle(Y, lot.yaw);
    const world = new THREE.Matrix4().compose(new THREE.Vector3(lot.x, lot.pad, lot.z), turn, new THREE.Vector3(1, 1, 1));
    const parts = chunks.get(lot.chunk) ?? chunks.set(lot.chunk, new Map()).get(lot.chunk)!;
    const box3 = bounds.get(lot.chunk) ?? bounds.set(lot.chunk, new THREE.Box3()).get(lot.chunk)!;
    box3.expandByPoint(new THREE.Vector3(lot.x, lot.pad, lot.z)).expandByScalar(0);
    const local = new THREE.Matrix4();
    /** Adds a part in the lot frame (y from the yard level), rotated `ry` about y, optionally tilted `rx` about x first. */
    const add = (key: Part, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, color?: THREE.ColorRepresentation, rx = 0) => {
      if (rx) g.rotateX(rx);
      g.applyMatrix4(local.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, ry), new THREE.Vector3(1, 1, 1)));
      g.applyMatrix4(world);
      if (key === "stucco" || key === "plain" || key === "gloss" || key === "gravel") { if (!g.getAttribute("color")) colored(g, color ?? 0xffffff); }
      else if (g.getAttribute("color")) g.deleteAttribute("color");
      (parts.get(key) ?? parts.set(key, []).get(key)!).push(g.index ? g.toNonIndexed() : g);
    };
    /** A solid box in the lot frame (y0..y1 from the yard level), turned `ry` and tilted `rx`. */
    const solid = (x: number, y0: number, y1: number, z: number, hw: number, hd: number, ry = 0, rx = 0) => {
      const q = turn.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, ry)).multiply(new THREE.Quaternion().setFromAxisAngle(X, rx));
      solids.push({ center: new THREE.Vector3(x, (y0 + y1) / 2, z).applyMatrix4(world), quaternion: q, half: new THREE.Vector3(hw, (y1 - y0) / 2, hd) });
    };
    /** Somewhere a bird can sit (a roof ridge, a wall cap), in the lot frame. */
    const perch = (x: number, y: number, z: number) => perches.push(new THREE.Vector3(x, y, z).applyMatrix4(world));
    const spot = (x: number, z: number, kind: YardSpot["kind"]) => {
      // Never in the pool or on its coping.
      if (pool && Math.abs(x - pool.x) < pool.w / 2 + 1.1 && Math.abs(z - pool.z) < pool.l / 2 + 1.1) return;
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(world);
      yard.push({ x: p.x, y: lot.pad, z: p.z, kind });
    };

    // ---- The lot: a block retaining pad cut for the driveway and the pool, gravel on top.
    const low = lot.ground - lot.pad - 0.5;
    const notch: LotRect = { x: gx, z: (door + LD / 2) / 2 + 0.01, w: plan.drive * 2, l: LD / 2 - door + 0.02 };
    const holes = pool ? [notch, pool] : [notch];
    for (const c of cellsAround(LW, LD, holes)) {
      add("block", box(c.w, -low, c.l, 1.6), c.x, low / 2, c.z);
      solid(c.x, low, 0, c.z, c.w / 2, c.l / 2);
    }
    {
      // Shape coordinates are (x, -z): the street edge is y = -LD/2, cut back to the garage door for the drive.
      const n0 = gx - plan.drive, n1 = gx + plan.drive, ground = new THREE.Shape();
      ground.moveTo(-LW / 2, -LD / 2); ground.lineTo(n0, -LD / 2); ground.lineTo(n0, -door); ground.lineTo(n1, -door); ground.lineTo(n1, -LD / 2);
      ground.lineTo(LW / 2, -LD / 2); ground.lineTo(LW / 2, LD / 2); ground.lineTo(-LW / 2, LD / 2); ground.lineTo(-LW / 2, -LD / 2);
      if (pool) ground.holes.push(offsetPath(roundedRect(pool.w + 1.0, pool.l + 1.0, 1.4, new THREE.Path()), pool.x, -pool.z));
      add("gravel", flat(ground, 2.2), 0, 0.01, 0, 0, plan.gravel);
    }
    // Yard walls: block, 1.8 m, from the house front back round the backyard; a gate on the house side.
    const wallH = 1.8, gate = -gside;
    for (const s of [-1, 1]) {
      const x = s * (LW / 2 - 0.1), z0 = -LD / 2, z1 = front;
      if (s === gate) {
        const g0 = hz - 0.6, g1 = g0 + 1.3;
        for (const [a, b] of [[z0, g0], [g1, z1]] as const) { add("block", box(0.2, wallH, b - a, 1.6), x, wallH / 2, (a + b) / 2); solid(x, 0, wallH, (a + b) / 2, 0.1, (b - a) / 2); }
        // An iron gate hung in the gap.
        add("plain", box(0.05, 1.5, 1.2), x, 0.85, g0 + 0.65, 0, 0x2b2b2a);
      } else { add("block", box(0.2, wallH, z1 - z0, 1.6), x, wallH / 2, (z0 + z1) / 2); solid(x, 0, wallH, (z0 + z1) / 2, 0.1, (z1 - z0) / 2); }
      add("plain", box(0.26, 0.06, z1 - z0), x, wallH + 0.03, (z0 + z1) / 2, 0, 0xd7cdbb);
    }
    add("block", box(LW, wallH, 0.2, 1.6), 0, wallH / 2, -LD / 2 + 0.1);
    add("plain", box(LW, 0.06, 0.26), 0, wallH + 0.03, -LD / 2 + 0.1, 0, 0xd7cdbb);
    solid(0, 0, wallH, -LD / 2 + 0.1, LW / 2, 0.1);
    perch(LW * 0.3, wallH + 0.06, -LD / 2 + 0.1);

    // ---- The house.
    const paintColor = new THREE.Color(plan.paint).offsetHSL(0, 0, (random() - 0.5) * 0.03);
    const pueblo = style === "pueblo", parapet = pueblo ? 0.55 : 0, gh = pueblo ? 3.1 : 3.0;
    add("stucco", box(w, h + parapet, d, 3), hx, (h + parapet) / 2, hz, 0, paintColor);
    add("stucco", box(gw, gh + parapet, gd, 3), gx, (gh + parapet) / 2, gz, 0, paintColor);
    solid(hx, 0, h + parapet, hz, w / 2, d / 2);
    solid(gx, 0, gh + parapet, gz, gw / 2, gd / 2);
    const over = 0.6;
    if (pueblo) {
      // Flat roofs behind parapets: membrane decks, a stepped parapet over the
      // door, vigas out the front, canales on the sides.
      for (const [x, z, rw, rd, y] of [[hx, hz, w, d, h], [gx, gz, gw, gd, gh]] as const) {
        add("plain", box(rw - 0.4, 0.04, rd - 0.4), x, y + 0.02, z, 0, MEMBRANE);
        add("plain", box(rw + 0.04, 0.07, rd + 0.04), x, y + parapet + 0.035, z, 0, new THREE.Color(plan.paint).multiplyScalar(0.97));
        perch(x - rw / 2 + 0.3, y + parapet + 0.07, z + rd / 2 - 0.02);
      }
      add("stucco", box(w * 0.36, 0.5, 0.3, 3), doorX, h + parapet + 0.25, front - 0.15, 0, paintColor);
      for (let k = 0; k < 7; k++) add("plain", new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8).rotateX(Math.PI / 2), hx - w / 2 + 0.7 + k * (w - 1.4) / 6, h - 0.28, front + 0.22, 0, WOOD);
      for (const s of [-1, 1]) add("plain", box(0.22, 0.14, 0.7), hx + s * (w / 2 + 0.3), h + 0.08, hz - d * 0.2, Math.PI / 2, WOOD);
      // A portal over the front door: two posts and a beam.
      for (const s of [-1, 1]) add("plain", box(0.18, 2.5, 0.18), doorX + s * 1.1, 1.25, front + 1.4, 0, WOOD);
      add("plain", box(2.7, 0.24, 1.6), doorX, 2.6, front + 0.75, 0, WOOD);
      // The AC unit on the roof.
      add("plain", box(1.1, 0.8, 1.0), hx + w * 0.2, h + 0.44, hz - d * 0.15, 0, 0xb9bab5);
      add("facade", atlasQuad(0.9, 0.9, "grille").rotateX(-Math.PI / 2), hx + w * 0.2, h + 0.85, hz - d * 0.15);
    } else {
      // Hip roofs with a tile overhang, trim fascia and soffit.
      const roofKey: Part = roof === "barrel" ? "barrel" : roof === "tile" ? "tile" : "metal";
      const two = style === "twoStorey", rise = two ? 2.2 : 1.9;
      for (const [rx, rz, rw, rd, ry, rs] of [[hx, hz, w, d, h, rise], [gx, gz, gw, gd, gh, 1.5]] as const) {
        add(roofKey, hipRoof(rw + over * 2, rd + over * 2, rs, 2), rx, ry + 0.02, rz);
        // The ridge: its middle and both ends.
        const r = Math.abs(rw - rd) / 2;
        for (const k of [-1, 0, 1]) perch(rx + (rw >= rd ? k * r : 0), ry + 0.02 + rs + 0.03, rz + (rw >= rd ? 0 : k * r));
        add("plain", box(rw + over * 2, 0.22, rd + over * 2), rx, ry - 0.09, rz, 0, TRIM);
      }
      // The AC unit in the side yard.
      add("plain", box(0.9, 0.85, 0.9), hx - gside * (w / 2 + 0.75), 0.43, hz - d * 0.2, 0, 0xb9bab5);
      add("facade", atlasQuad(0.8, 0.8, "grille").rotateX(-Math.PI / 2), hx - gside * (w / 2 + 0.75), 0.87, hz - d * 0.2);
      // Solar: rows of panels flush on the back slope (or the front, as in the photos).
      if (plan.solar) {
        const W2 = w + over * 2, D2 = d + over * 2, face = random() < 0.35 ? 1 : -1;
        const slope = Math.hypot(D2 / 2, rise), tilt = Math.atan2(rise, D2 / 2);
        const cols = Math.floor(random() * 4) + 4;
        for (let t = 0.5; t + 1.7 < slope - 0.4; t += 1.74) {
          const reach = (W2 / 2) - ((t + 1.7) / slope) * (D2 / 2) - 0.5, n = Math.min(cols, Math.floor((reach * 2) / 1.04));
          for (let k = 0; k < n; k++) {
            const px = hx + (k - (n - 1) / 2) * 1.04, tc = t + 0.85;
            add("facade", atlasQuad(1.0, 1.7, "solar").rotateX(-Math.PI / 2 + face * tilt), px, h + 0.02 + (tc / slope) * rise + 0.07, hz + face * (D2 / 2 - (tc / slope) * (D2 / 2)), 0);
          }
        }
      }
    }
    if (pueblo && plan.solar) {
      // Racked panels on the flat roof, tilted to the sun.
      const rows = 2, n = Math.max(3, Math.floor((w - 1.6) / 1.04));
      for (let r = 0; r < rows; r++) for (let k = 0; k < n; k++)
        add("facade", atlasQuad(1.0, 1.7, "solar").rotateX(-Math.PI / 2 - 0.3), hx + (k - (n - 1) / 2) * 1.04, h + 0.5, hz + d / 2 - 1.4 - r * 2.2, 0);
    }
    // Front: door, windows (both floors on a two-storey), garage door.
    const fz = front + 0.02;
    add("facade", atlasQuad(1.0, 2.15, "door"), doorX, 1.08, fz);
    add("plain", box(1.3, 0.12, 0.25), doorX, 2.25, fz, 0, TRIM);
    const windowsAt = (y: number, xs: number[], z: number, ry: number) => {
      for (const wx of xs) {
        add("facade", atlasQuad(1.7, 1.3, "window"), wx, y, z, ry);
        add("plain", box(1.9, 0.08, 0.14), wx, y - 0.7, z + (ry ? -0.06 : 0.06), 0, TRIM);
      }
    };
    const frontXs = [hx + gside * w * 0.18, hx - gside * w * 0.4, hx + gside * w * 0.38].filter((x) => Math.abs(x - doorX) > 1.6 && Math.abs(x - hx) < w / 2 - 0.9);
    windowsAt(1.6, frontXs.slice(0, 2), fz, 0);
    if (style === "twoStorey") windowsAt(4.4, [hx - w * 0.3, hx, hx + w * 0.3], fz, 0);
    // Back: windows either side of a sliding door onto the patio.
    const bz = hz - d / 2 - 0.02;
    add("facade", atlasQuad(2.4, 2.1, "slider"), patio.x, 1.05, bz, Math.PI);
    windowsAt(1.6, [hx - w * 0.36, hx + w * 0.36], bz, Math.PI);
    if (style === "twoStorey") windowsAt(4.4, [hx - w * 0.28, hx + w * 0.28], bz, Math.PI);
    // Side windows (the side away from the garage).
    add("facade", atlasQuad(1.7, 1.3, "window"), hx - gside * (w / 2 + 0.02), 1.6, hz + d * 0.15, -gside * Math.PI / 2);
    // Garage door and its header.
    add("facade", atlasQuad(4.9, 2.25, "garage"), gx, 1.13, door + 0.02);
    add("plain", box(5.3, 0.2, 0.18), gx, 2.36, door + 0.05, 0, TRIM);

    // ---- Driveway: a concrete slab from the garage down to the shoulder's edge,
    // its top the ground the physics reads there, and a flush apron across the shoulder.
    const run = LD / 2 + lot.reach - door, fall = lot.pad - lot.foot, pitch = Math.atan2(fall, run);
    add("plain", driveSlab(plan.drive * 2, run, fall, lot.tilt, 0.22, 2), gx, 0.012, door, 0, CONCRETE);
    {
      // The collider runs just under the slab's low edge (the ground carries the rider on the slab itself).
      const low = fall + Math.abs(lot.tilt) * plan.drive;
      solid(gx, -low / 2 - 0.22, -low / 2, door + run / 2, plan.drive, Math.hypot(run, low) / 2, 0, Math.atan2(low, run));
    }
    /** The ground in the lot frame, from yard level. */
    const groundLocal = (lx: number, lz: number) => {
      const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(world);
      return lot.groundAt ? lot.groundAt(p.x, p.z) - lot.pad : -fall + lot.tilt * (lx - gx);
    };
    const footZ = LD / 2 + lot.reach;
    add("plain", drape(gx - plan.drive - 0.6, gx + plan.drive + 0.6, footZ, footZ + 1.6, groundLocal, 0.015, 2), 0, 0, 0, 0, CONCRETE);
    // The front walk: from the door out to the driveway.
    const walkZ = front + 1.6, walkEnd = gx - gside * plan.drive;
    add("plain", box(1.2, 0.05, walkZ - front + 0.6), doorX, 0.025, (front + walkZ + 0.6) / 2, 0, CONCRETE);
    add("plain", box(Math.abs(walkEnd - doorX), 0.05, 1.2), (walkEnd + doorX) / 2, 0.026, walkZ, 0, CONCRETE);
    // A mailbox by the foot of the drive.
    {
      const mx = gx + gside * (plan.drive + 0.6), mz = LD / 2 + lot.reach - 0.6, my = groundLocal(mx, mz);
      add("plain", box(0.1, 1.05, 0.1), mx, my + 0.52, mz, 0, 0x3a3a38);
      add("plain", box(0.25, 0.25, 0.5), mx, my + 1.15, mz, 0, 0x2c2c2a);
    }

    // ---- Vehicles: a car on the drive, an RV or trailer on a pad beside it.
    const vehicle = (kind: VehicleKind, x: number, y: number, z: number, ry: number, rx: number, rz = 0) => {
      const pieces: THREE.BufferGeometry[] = [], finishes: ("plain" | "gloss")[] = [];
      buildVehicle(kind, plan.seed + (kind === "rv" || kind === "trailer" ? 17 : 0), (finish, g, color) => { colored(g, color); if (rz) g.rotateZ(rz); pieces.push(g); finishes.push(finish); });
      pieces.forEach((g, i) => add(finishes[i], g, x, y, z, ry, undefined, rx));
      const s = VEHICLE_SIZE[kind];
      solid(x, y, y + s.height, z, s.width / 2, s.length / 2, ry, rx);
    };
    if (plan.car) {
      const s = VEHICLE_SIZE[plan.car], along = Math.min(run - s.length / 2 - 0.3, 0.8 + s.length / 2);
      const t = along / run, cx = (random() - 0.5) * 0.4, y = (-fall + lot.tilt * cx) * t;
      const noseIn = random() < 0.7, roll = Math.atan(lot.tilt * t);
      vehicle(plan.car, gx + cx, y + 0.02, door + along, noseIn ? Math.PI : 0, noseIn ? -pitch : pitch, noseIn ? -roll : roll);
    }
    if (plan.rv) {
      // A concrete pad in the front yard beside the drive.
      const s = VEHICLE_SIZE[plan.rv], px = gside * (LW / 2 - 0.5 - s.width / 2 - 0.3), pz = LD / 2 - s.length / 2 - 0.5;
      add("plain", box(s.width + 0.7, 0.05, s.length + 0.6), px, 0.025, pz, 0, CONCRETE);
      vehicle(plan.rv, px, 0.05, pz, Math.PI, 0);
    }

    // ---- The backyard.
    add("plain", box(patio.w, 0.06, patio.l), patio.x, 0.03, patio.z, 0, CONCRETE);
    if (plan.pergola) {
      const px = patio.x, pz = patio.z;
      for (const sx of [-1, 1]) add("plain", box(0.16, 2.55, 0.16), px + sx * (patio.w / 2 - 0.2), 1.28, pz - patio.l / 2 + 0.2, 0, TRIM);
      add("plain", box(patio.w + 0.3, 0.22, 0.14), px, 2.6, pz - patio.l / 2 + 0.2, 0, TRIM);
      for (let k = 0; k < Math.floor(patio.w / 0.6); k++) add("plain", box(0.07, 0.16, patio.l + 0.3), px - patio.w / 2 + 0.3 + k * 0.6, 2.75, pz, 0, TRIM);
    }
    if (plan.table) {
      const tx = patio.x + patio.w * 0.25, tz = patio.z;
      add("plain", new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), tx, 0.74, tz, 0, 0x3b3b39);
      add("plain", new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), tx, 1.1, tz, 0, 0x777777);
      if (!plan.pergola) add("plain", new THREE.ConeGeometry(1.4, 0.4, 8, 1, true), tx, 2.2, tz, 0, [0xb33a2b, 0x2e4a6b, 0xd9cfb5][Math.floor(random() * 3)]);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; add("plain", box(0.45, 0.45, 0.45), tx + Math.cos(a) * 0.85, 0.23, tz + Math.sin(a) * 0.85, a, 0x2f2f2d); }
    }
    if (pool) {
      const outline = roundedRect(pool.w, pool.l, 1.0);
      const pts = outline.getPoints(6);
      // Coping round the edge, the plaster shell, the water.
      const coping = roundedRect(pool.w + 1.0, pool.l + 1.0, 1.4); coping.holes.push(roundedRect(pool.w, pool.l, 1.0, new THREE.Path()));
      add("plain", flat(coping), pool.x, 0.03, pool.z, 0, COPING);
      const wall: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        wall.push(a.x, 0, -a.y, b.x, 0, -b.y, b.x, -POOL_DEPTH, -b.y, a.x, 0, -a.y, b.x, -POOL_DEPTH, -b.y, a.x, -POOL_DEPTH, -a.y);
      }
      const shell = new THREE.BufferGeometry();
      shell.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
      shell.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((wall.length / 3) * 2).fill(0), 2));
      shell.computeVertexNormals();
      add("plain", doubleSided(shell), pool.x, 0, pool.z, 0, PLASTER);
      add("plain", flat(roundedRect(pool.w, pool.l, 1.0)), pool.x, -POOL_DEPTH, pool.z, 0, 0x7cc4d0);
      add("water", flat(roundedRect(pool.w, pool.l, 1.0)), pool.x, -0.2, pool.z);
      solid(pool.x, -POOL_DEPTH - 0.3, -POOL_DEPTH, pool.z, pool.w / 2, pool.l / 2);
      // A ladder's handrails at the deep end.
      for (const s of [-0.3, 0.3]) add("gloss", new THREE.TorusGeometry(0.35, 0.025, 6, 10, Math.PI).rotateY(Math.PI / 2), pool.x + pool.w / 2 - 0.9 + s, 0.3, pool.z - pool.l / 2 + 0.05, 0, 0xc9ccd0);
    }
    const bx = gside, freeX = (LW / 2 - 2.2) * bx;
    if (plan.turf) {
      // Artificial turf between the pool and the patio, or across the back.
      const z0 = pool ? pool.z + pool.l / 2 + 0.6 : -LD / 2 + 1.2, z1 = patio.z - patio.l / 2 - 0.3, tw = Math.min(LW - 3.2, 7 + random() * 3);
      if (z1 - z0 > 1.8) add("turf", flat(roundedRect(tw, z1 - z0, 0.6), 1), hx - bx * 0.5, 0.035, (z0 + z1) / 2);
    }
    if (plan.shed && (!pool || Math.abs(freeX - pool.x) > pool.w / 2 + 1.7)) {
      const sx = freeX, sz = -LD / 2 + 1.5;
      add("plain", box(2.4, 2.1, 2.0), sx, 1.05, sz, 0, 0xd8cfbd);
      add("metal", hipRoof(2.7, 2.3, 0.5, 2), sx, 2.1, sz);
      add("plain", box(1.1, 1.8, 0.04), sx, 0.95, sz + 1.01, 0, 0xb0a690);
      solid(sx, 0, 2.6, sz, 1.2, 1.0);
    }
    if (plan.trampoline) {
      const tx = -freeX * 0.6, tz = -LD / 2 + 3.2;
      add("plain", new THREE.TorusGeometry(1.8, 0.05, 6, 28).rotateX(Math.PI / 2), tx, 0.9, tz, 0, 0x2a2d30);
      add("plain", new THREE.CircleGeometry(1.7, 24).rotateX(-Math.PI / 2), tx, 0.88, tz, 0, 0x151515);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; add("plain", box(0.05, 0.9, 0.05), tx + Math.cos(a) * 1.8, 0.45, tz + Math.sin(a) * 1.8, 0, 0x2a2d30); }
    }

    // ---- Planting: palms and desert shrubs out front, a palm or two behind.
    const yardFront = (front + LD / 2) / 2, houseSide = -gside;
    // As in the photos: a palm in some yards, a dark shade tree in others, desert shrubs in most.
    const frontTree = random();
    if (frontTree < 0.35) spot(hx + houseSide * (w / 2 - 0.8), yardFront, "palm");
    else if (frontTree < 0.7) spot(hx + houseSide * (w / 2 - 1.6), yardFront, "tree");
    if (random() < 0.15) spot(hx + houseSide * (w / 2 - 3.4), yardFront + 1.2, "palm");
    spot(doorX + houseSide * 1.6, front + 1.2, "yucca");
    for (let k = 0; k < 3; k++) spot(hx + houseSide * (0.5 + random() * (w / 2 - 1)), LD / 2 - 1 - random() * 1.5, "shrub");
    const backTree = random();
    if (backTree < 0.25) spot(-gside * (LW / 2 - 1.2), -LD / 2 + 1.2, "palm");
    else if (backTree < 0.6) spot(-gside * (LW / 2 - 2.2), -LD / 2 + 2.2, "tree");
    if (random() < 0.5) spot(gside * (LW / 2 - 1.2), (hz - d / 2 + -LD / 2) / 2, "shrub");
  }

  // ---- One mesh per material per chunk.
  const detail: DetailChunk[] = [];
  for (const [chunk, parts] of chunks) {
    const b = bounds.get(chunk)!, center = b.getCenter(new THREE.Vector3()), radius = b.getSize(new THREE.Vector3()).length() / 2 + 30;
    const near: THREE.Object3D[] = [];
    for (const [key, list] of parts) {
      const g = mergeGeometries(list)!;
      list.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(g, kit[key]);
      mesh.name = `Houses ${chunk}: ${kit[key].name}`;
      mesh.castShadow = key !== "gravel" && key !== "facade" && key !== "water" && key !== "turf";
      mesh.receiveShadow = key !== "water";
      if (key === "water") mesh.renderOrder = 1;
      // Already one mesh per material per chunk; the static batcher leaves them be.
      mesh.userData.noBatch = true;
      scene.add(mesh);
      if (DETAIL.includes(key)) near.push(mesh);
    }
    detail.push({ center, radius, meshes: near });
  }
  return { solids, yard, detail, perches };
}

function offsetPath(p: THREE.Path, x: number, y: number) {
  const out = new THREE.Path();
  const pts = p.getPoints(6);
  out.moveTo(pts[0].x + x, pts[0].y + y);
  for (const q of pts.slice(1)) out.lineTo(q.x + x, q.y + y);
  return out;
}
/** Both faces of a thin strip (the pool's wall), so it shows from inside whichever way it wound. */
function doubleSided(g: THREE.BufferGeometry) {
  const pos = g.getAttribute("position") as THREE.BufferAttribute, n = pos.count, p: number[] = [];
  for (let i = 0; i < n; i++) p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  for (let i = 0; i < n; i += 3) for (const k of [0, 2, 1]) p.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((p.length / 3) * 2).fill(0), 2));
  out.computeVertexNormals();
  g.dispose();
  return out;
}
