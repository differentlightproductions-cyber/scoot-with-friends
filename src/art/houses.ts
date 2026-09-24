// Boulder City houses: ranch homes (and the odd two-storey) in pale stucco
// under terracotta or concrete tile hip roofs, bronze-framed windows, a
// two-car garage wing, and a gravel yard on a block retaining wall cut into
// the hillside. Every house on a map is merged into one mesh per material, so
// a street costs a handful of draw calls.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry, Noise2 } from "./noise";
import { gravelTexture } from "./textures";

export interface HouseLot {
  /** Lot centre and heading: the house front (local +z) faces `yaw`. */
  x: number; z: number; yaw: number;
  /** Lowest ground under the lot (the retaining wall's foot) and the yard level on top. */
  ground: number; pad: number;
  /** The driveway runs from the yard's front edge down `drop` metres over `reach` metres. */
  reach: number; drop: number;
  /** Ground height at the foot of the yard's front wall, in front of the garage. */
  front: number;
  seed: number;
}
/** A solid box in world space (for colliders). */
export interface HouseSolid { center: THREE.Vector3; quaternion: THREE.Quaternion; half: THREE.Vector3 }
/** A spot in a front yard for a palm or shrub. */
export interface YardSpot { x: number; y: number; z: number; kind: "palm" | "yucca" | "shrub" }

// ---- Textures ------------------------------------------------------------------
const cache = new Map<string, THREE.Texture>();
function paint(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, random: () => number) => void, color = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!, mulberry(key.length * 131 + w));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
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
const roofTexture = (kind: "barrel" | "flat") => paint("roof-" + kind, 256, 256, (ctx, random) => {
  const rows = 8, cols = kind === "barrel" ? 8 : 6, rh = 256 / rows, cw = 256 / cols;
  ctx.fillStyle = kind === "barrel" ? "#6e3a24" : "#4c4640"; ctx.fillRect(0, 0, 256, 256);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = k * cw + (kind === "flat" && r % 2 ? cw / 2 : 0), y = r * rh;
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
/** Bronze-anodised window: frame, a centre mullion, and glass reflecting the sky. */
const windowTexture = () => paint("window", 128, 128, (ctx) => {
  ctx.fillStyle = "#4a3a2c"; ctx.fillRect(0, 0, 128, 128);
  const glass = ctx.createLinearGradient(0, 8, 0, 120);
  glass.addColorStop(0, "#9fb6c8"); glass.addColorStop(0.45, "#4f6776"); glass.addColorStop(1, "#1e2a32");
  ctx.fillStyle = glass; ctx.fillRect(8, 8, 54, 112); ctx.fillRect(66, 8, 54, 112);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.beginPath(); ctx.moveTo(8, 70); ctx.lineTo(40, 8); ctx.lineTo(52, 8); ctx.lineTo(8, 92); ctx.fill();
  ctx.beginPath(); ctx.moveTo(66, 60); ctx.lineTo(96, 8); ctx.lineTo(104, 8); ctx.lineTo(66, 76); ctx.fill();
}, true);
/** Sectional steel garage door, raised panels, painted to match the trim. */
const garageTexture = () => paint("garage", 256, 128, (ctx) => {
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
/** Front door: stained wood, six panels, a brass handle. */
const doorTexture = () => paint("door", 64, 128, (ctx) => {
  ctx.fillStyle = "#6a4128"; ctx.fillRect(0, 0, 64, 128);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) {
    const x = 8 + k * 26, y = 8 + r * 38;
    ctx.fillStyle = "#57331f"; ctx.fillRect(x, y, 22, 32);
    ctx.fillStyle = "rgba(255,220,180,.18)"; ctx.fillRect(x, y, 22, 2); ctx.fillRect(x, y, 2, 32);
  }
  ctx.fillStyle = "#c9a45a"; ctx.fillRect(52, 64, 5, 8);
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

const materials = () => ({
  stucco: new THREE.MeshStandardMaterial({ map: stuccoTexture(), vertexColors: true, roughness: 0.95, name: "House stucco" }),
  barrel: new THREE.MeshStandardMaterial({ map: roofTexture("barrel"), roughness: 0.8, name: "Barrel tile roof" }),
  flat: new THREE.MeshStandardMaterial({ map: roofTexture("flat"), roughness: 0.85, name: "Concrete tile roof" }),
  trim: new THREE.MeshStandardMaterial({ color: 0xeee6d6, roughness: 0.8, name: "House trim" }),
  window: new THREE.MeshStandardMaterial({ map: windowTexture(), roughness: 0.2, metalness: 0.3, name: "Windows" }),
  garage: new THREE.MeshStandardMaterial({ map: garageTexture(), roughness: 0.6, name: "Garage doors" }),
  door: new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.7, name: "Front doors" }),
  block: new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.95, name: "Block walls" }),
  gravel: new THREE.MeshStandardMaterial({ map: gravelTexture(), color: 0xe6d4bc, roughness: 1, name: "Yard gravel" }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xc4bdb0, roughness: 0.9, name: "Driveways" }),
});
type Kit = ReturnType<typeof materials>;

// ---- Geometry --------------------------------------------------------------------
/** A box with its UVs in metres / `tile`, so textures keep their scale on any size. */
function box(w: number, h: number, d: number, tile: number) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.getAttribute("uv");
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}
/** A hip roof over a W x D rectangle (eaves at y=0) rising `rise`, tile UVs in metres / `tile`. */
function hipRoof(W: number, D: number, rise: number, tile: number) {
  const swap = D > W, w = swap ? D : W, d = swap ? W : D, r = (w - d) / 2;
  const p: number[] = [], uv: number[] = [];
  const slope = Math.hypot(d / 2, rise);
  const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => { p.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  for (const s of [1, -1]) {
    // Long faces (trapezoids): eave along x, up the slope toward the ridge.
    const A = [-w / 2 * s, 0, d / 2 * s], B = [w / 2 * s, 0, d / 2 * s], C = [r * s, rise, 0], E = [-r * s, rise, 0];
    const u = (x: number) => (x * s + w / 2) / tile;
    tri(A, B, C, [u(A[0]), 0], [u(B[0]), 0], [u(C[0]), slope / tile]);
    tri(A, C, E, [u(A[0]), 0], [u(C[0]), slope / tile], [u(E[0]), slope / tile]);
    // End faces (triangles).
    const F = [w / 2 * s, 0, d / 2 * s], G = [w / 2 * s, 0, -d / 2 * s], H = [r * s, rise, 0];
    tri(G, F, H, [0, 0], [d / tile, 0], [d / 2 / tile, Math.hypot(w / 2 - r, rise) / tile]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (swap) g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
function quad(w: number, h: number) { return new THREE.PlaneGeometry(w, h); }
function colored(g: THREE.BufferGeometry, color: THREE.Color) {
  const n = g.getAttribute("position").count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}

const STUCCO = [0xefe3cc, 0xe6d5b5, 0xdcc6a2, 0xf1ebdd, 0xd8c2a8, 0xe9d9c0, 0xcfb99a];

/**
 * A house's plan from its seed: body, garage wing (which side) and the lot
 * (yard) size, so a map can site the lot before building it.
 */
export function planHouse(seed: number) {
  const random = mulberry(seed);
  const w = 10 + random() * 4, d = 8 + random() * 3, two = random() < 0.28, h = two ? 5.8 : 3.1;
  const gw = 6.6, gd = 7.2, gside = random() < 0.5 ? -1 : 1, gx = gside * (w / 2 + gw / 2 - 0.2), gz = (gd - d) / 2 + 1.4;
  const LW = w + gw + 7, LD = d + 9, lotX = gside * gw / 2 * 0.9;
  return { random, w, d, two, h, gw, gd, gside, gx, gz, LW, LD, lotX };
}

/**
 * Builds a street of houses. Returns the solid boxes (retaining pads and
 * buildings) for colliders, and front-yard spots for plants.
 */
export function buildHouses(scene: THREE.Scene, lots: HouseLot[]) {
  const kit = materials();
  const parts = new Map<keyof Kit, THREE.BufferGeometry[]>();
  const solids: HouseSolid[] = [], yard: YardSpot[] = [];
  for (const lot of lots) {
    const { random, w, d, two, h, gw, gd, gside, gx, gz, LW, LD, lotX } = planHouse(lot.seed);
    const world = new THREE.Matrix4().compose(new THREE.Vector3(lot.x, lot.pad, lot.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lot.yaw), new THREE.Vector3(1, 1, 1));
    const add = (key: keyof Kit, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)));
      g.applyMatrix4(world);
      if (key !== "stucco" && g.getAttribute("color")) g.deleteAttribute("color");
      (parts.get(key) ?? parts.set(key, []).get(key)!).push(g.index ? g.toNonIndexed() : g);
    };
    const solid = (x: number, y0: number, y1: number, z: number, hx: number, hz: number) => {
      const center = new THREE.Vector3(x, (y0 + y1) / 2, z).applyMatrix4(world);
      solids.push({ center, quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lot.yaw), half: new THREE.Vector3(hx, (y1 - y0) / 2, hz) });
    };
    const low = lot.ground - lot.pad - 0.4;
    const paintColor = new THREE.Color(STUCCO[Math.floor(random() * STUCCO.length)]);
    const roofKey: keyof Kit = random() < 0.7 ? "barrel" : "flat";
    // The yard: a retaining pad of block, gravel on top, low block walls on three sides.
    add("block", box(LW, -low, LD, 1.6), lotX, low / 2, 0);
    add("gravel", quad(LW, LD).rotateX(-Math.PI / 2), lotX, 0.02, 0);
    solid(lotX, low, 0, 0, LW / 2, LD / 2);
    for (const s of [-1, 1]) add("block", box(0.2, 1.6, LD - 3, 1.6), lotX + s * (LW / 2 - 0.1), 0.8, -1.5);
    add("block", box(LW, 1.6, 0.2, 1.6), lotX, 0.8, -LD / 2 + 0.1);
    // The house body and its garage wing.
    add("stucco", colored(box(w, h, d, 3), paintColor), 0, h / 2, 0);
    // A high lot (a steep drive) puts the garage under the yard at street
    // level, in the retaining wall, the way hillside homes are built.
    const under = lot.drop > 2.7 && lot.pad - lot.front > 2.7;
    if (!under) { add("stucco", colored(box(gw, 3.0, gd, 3), paintColor), gx, 1.5, gz); solid(gx, 0, 3, gz, gw / 2, gd / 2); }
    solid(0, 0, h, 0, w / 2, d / 2);
    // Roofs with a tile overhang, trim fascia and soffit.
    const over = 0.6;
    const roofs: number[][] = [[0, 0, w, d, h, two ? 2.2 : 1.9]];
    if (!under) roofs.push([gx, gz, gw, gd, 3.0, 1.5]);
    for (const [rx, rz, rw, rd, ry, rise] of roofs) {
      add(roofKey, hipRoof(rw + over * 2, rd + over * 2, rise, 2), rx, ry + 0.02, rz);
      add("trim", box(rw + over * 2, 0.22, rd + over * 2, 3), rx, ry - 0.09, rz);
    }
    // Front: door, windows (both floors on a two-storey), garage door.
    const front = d / 2 + 0.02, doorX = -gside * (w * 0.18);
    add("door", quad(1.0, 2.15), doorX, 1.08, front);
    add("trim", box(1.3, 0.12, 0.25, 3), doorX, 2.25, front);
    const windowsAt = (y: number, xs: number[], z: number, ry: number) => {
      for (const wx of xs) {
        add("window", quad(1.7, 1.3), wx, y, z, ry);
        const sill = box(1.9, 0.08, 0.14, 3);
        add("trim", sill, ry ? z + Math.sign(z) * 0.05 : wx, y - 0.7, ry ? wx : z + 0.05, ry);
      }
    };
    const frontXs = [-gside * w * 0.38, gside * w * 0.12].filter((x) => Math.abs(x - doorX) > 1.6);
    windowsAt(1.6, frontXs, front, 0);
    if (two) windowsAt(4.4, [-w * 0.3, 0, w * 0.3], front, 0);
    add("window", quad(1.7, 1.3), -gside * (w / 2 + 0.02), 1.6, 0, -gside * Math.PI / 2);
    if (under) {
      // Garage door and header in the wall's face, a flat apron out to the road.
      const foot = lot.front - lot.pad;
      add("garage", quad(4.9, 2.25), gx, foot + 1.16, LD / 2 + 0.02);
      add("trim", box(5.4, 0.3, 0.3, 3), gx, foot + 2.45, LD / 2 + 0.1);
      const apronDrop = lot.front - (lot.pad - lot.drop), len = Math.hypot(lot.reach, apronDrop);
      add("concrete", box(5.4, 0.25, len + 0.4, 3).rotateX(Math.atan2(apronDrop, lot.reach)), gx, foot - apronDrop / 2 - 0.1, LD / 2 + lot.reach / 2);
    } else add("garage", quad(4.9, 2.25), gx, 1.13, gz + gd / 2 + 0.02);
    // Driveway from the garage down to the road.
    if (!under && lot.reach > 0.5) {
      const len = Math.hypot(lot.reach, lot.drop), tilt = Math.atan2(lot.drop, lot.reach);
      const drive = box(5.2, 0.25, len + 0.6, 3).rotateX(tilt);
      add("concrete", drive, gx, -lot.drop / 2 - 0.12, LD / 2 + lot.reach / 2);
    }
    // Front-yard planting spots: a palm or two, yucca and shrubs by the walls.
    const spot = (x: number, z: number, kind: YardSpot["kind"]) => {
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(world);
      yard.push({ x: p.x, y: lot.pad, z: p.z, kind });
    };
    const yardFront = d / 2 + (LD / 2 - d / 2) * 0.55;
    spot(-gside * (w / 2 - 0.5), yardFront, "palm");
    if (random() < 0.5) spot(-gside * (w / 2 - 3.2), yardFront + 0.8, "palm");
    spot(-gside * 1.2, yardFront + 1.2, "yucca");
    for (let k = 0; k < 3; k++) spot(-gside * (0.8 + random() * (w / 2)), yardFront + (random() - 0.2) * 2, "shrub");
  }
  for (const [key, list] of parts) {
    const g = mergeGeometries(list)!;
    list.forEach((x) => x.dispose());
    const mesh = new THREE.Mesh(g, kit[key]);
    mesh.name = "Houses: " + kit[key].name;
    mesh.castShadow = key !== "gravel" && key !== "window" && key !== "door" && key !== "garage";
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { solids, yard };
}
