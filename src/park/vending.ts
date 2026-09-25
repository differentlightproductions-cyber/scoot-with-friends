import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Park } from "./park";
import type { ItemKind } from "../data/items";
import { Kit, V, canvasTexture, galvanized, mat, paint, rubber, solid, turn } from "./props";

/**
 * The glass-front snack and drinks machine (#88), after the owner's photo: a
 * black cabinet, a lit glass door over six shelves of spiral coils holding the
 * park's own products, and a control column with a yellow tap-to-pay reader,
 * a green display, a note acceptor, a keypad, a lock and a coin return. Below
 * the door a steel PUSH flap covers the pickup bin.
 *
 * Buying is done on the machine: key a two-digit code, hold the phone to the
 * reader (a beep when it goes through), and the coil turns the product off the
 * shelf into the bin. The shelves never run out.
 *
 * Machine space: the front faces +z, x runs across, y is up from the floor.
 */

/** One coil on the shelves: its code (row, then column), what it holds and what it costs in Coins. */
export interface VendSlot { code: string; row: number; col: number; kind: ItemKind; brand: string; flavor: string; price: number; form: "bag" | "can" | "bottle"; art: Art }
interface Art { base: string; accent: string; ink: string; liquid?: string; cap?: string }

const CHIPS: [string, Art][] = [
  ["Classic", { base: "#f2c230", accent: "#c8201e", ink: "#2a1a08" }],
  ["BBQ", { base: "#7c2f16", accent: "#f7b733", ink: "#fff3d6" }],
  ["Sour Cream", { base: "#2f8f5a", accent: "#f4f1e4", ink: "#ffffff" }],
  ["Salt & Vinegar", { base: "#2d6fb8", accent: "#e9f0f6", ink: "#ffffff" }],
  ["Chili Heat", { base: "#d62f22", accent: "#ffd23f", ink: "#ffffff" }],
  ["Cheddar", { base: "#f08a1c", accent: "#fff0b3", ink: "#3a1a00" }],
  ["Jalapeño", { base: "#3d8c2a", accent: "#d7f25c", ink: "#ffffff" }],
  ["Ranch", { base: "#e9e3cf", accent: "#2d5fa8", ink: "#1f3a66" }],
  ["Honey BBQ", { base: "#c8702a", accent: "#ffe08a", ink: "#ffffff" }],
  ["Lime", { base: "#9fd13a", accent: "#1f6a2a", ink: "#153b16" }],
];
const WATER: [string, Art][] = [
  ["Still", { base: "#d8eef8", accent: "#1f7fc8", ink: "#0f4a80", liquid: "#cfe9f5", cap: "#1f7fc8" }],
  ["Still", { base: "#d8eef8", accent: "#1f7fc8", ink: "#0f4a80", liquid: "#cfe9f5", cap: "#1f7fc8" }],
  ["Still", { base: "#d8eef8", accent: "#1f7fc8", ink: "#0f4a80", liquid: "#cfe9f5", cap: "#1f7fc8" }],
  ["Sparkling Lime", { base: "#e2f5d0", accent: "#3aa83a", ink: "#1d5e1d", liquid: "#dcf2d0", cap: "#3aa83a" }],
  ["Sparkling Berry", { base: "#f5dbe8", accent: "#c0306e", ink: "#6e1238", liquid: "#f2d8e6", cap: "#c0306e" }],
];
const SPORTS: [string, Art][] = [
  ["Glacier", { base: "#1d2a3a", accent: "#2a8fe0", ink: "#ffffff", liquid: "#3aa0f0", cap: "#e8eef2" }],
  ["Orange Rush", { base: "#1d2a3a", accent: "#ff8a1a", ink: "#ffffff", liquid: "#ff9a2a", cap: "#e8eef2" }],
  ["Fruit Punch", { base: "#1d2a3a", accent: "#e0243a", ink: "#ffffff", liquid: "#e8344a", cap: "#e8eef2" }],
  ["Lemon-Lime", { base: "#1d2a3a", accent: "#b8e02a", ink: "#ffffff", liquid: "#c8ec4a", cap: "#e8eef2" }],
  ["Grape", { base: "#1d2a3a", accent: "#7a3fc0", ink: "#ffffff", liquid: "#8a4fd0", cap: "#e8eef2" }],
];
const SODA: [string, Art][] = [
  ["Cola", { base: "#b01e23", accent: "#ffffff", ink: "#ffffff" }],
  ["Lemon-Lime", { base: "#2ea84a", accent: "#f4f94a", ink: "#ffffff" }],
  ["Orange", { base: "#ff7a00", accent: "#ffffff", ink: "#ffffff" }],
  ["Root Beer", { base: "#5b3019", accent: "#e8c07a", ink: "#fff4de" }],
  ["Grape", { base: "#6c2da0", accent: "#e2c6ff", ink: "#ffffff" }],
  ["Cherry", { base: "#8e1234", accent: "#ff9ab8", ink: "#ffffff" }],
  ["Cream", { base: "#e9d8a6", accent: "#8a5a2a", ink: "#4a2a0a" }],
  ["Ginger Ale", { base: "#1e6b3a", accent: "#e8c64a", ink: "#ffffff" }],
  ["Zero Cola", { base: "#20242a", accent: "#e0243a", ink: "#ffffff" }],
  ["Blue Razz", { base: "#1f6bd6", accent: "#9fe8ff", ink: "#ffffff" }],
];

/** The planogram: rows 1 (top) to 6, five coils each. Codes are row then column, as keyed. */
export const VEND_SLOTS: VendSlot[] = (() => {
  const rows: [ItemKind, string, VendSlot["form"], number, [string, Art][]][] = [
    ["Chips", "Crunch Ridge", "bag", 3, CHIPS.slice(0, 5)],
    ["Chips", "Crunch Ridge", "bag", 3, CHIPS.slice(5)],
    ["Water", "Clear Mesa", "bottle", 2, WATER],
    ["Sports drink", "Voltade", "bottle", 4, SPORTS],
    ["Soda", "Fizz Pop", "can", 3, SODA.slice(0, 5)],
    ["Soda", "Fizz Pop", "can", 3, SODA.slice(5)],
  ];
  return rows.flatMap(([kind, brand, form, price, flavors], r) => flavors.map(([flavor, art], c) => ({ code: `${r + 1}${c + 1}`, row: r + 1, col: c + 1, kind, brand, flavor, price, form, art })));
})();
export const vendSlot = (code: string) => VEND_SLOTS.find((s) => s.code === code) ?? null;

// ---- Layout (machine space, metres) ------------------------------------------
const W = 1.0, D = 0.8, TOP = 1.86;
/** The glass door's window, and the lit cabinet behind it. */
const WIN = { x0: -0.44, x1: 0.22, y0: 0.66, y1: 1.78 };
const WIN_X = (WIN.x0 + WIN.x1) / 2;
const FRONT = D / 2 - 0.01;
/** The control column's centre line. */
const COL_X = 0.36;
const SHELF_PITCH = (WIN.y1 - WIN.y0) / 6;
/** Top of a row's tray (row 1 is the top shelf). */
const trayTop = (row: number) => WIN.y1 - SHELF_PITCH * row + 0.018;
const slotX = (col: number) => WIN_X + (col - 3) * 0.128;
const COIL = { r: 0.05, pitch: 0.1, z0: -0.31, z1: 0.31 };
/** Where the front product of every coil stands. */
const FRONT_Z = 0.26;
export const KEYS = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["C", "0", "OK"]] as const;
const KEYPAD = { x: COL_X, y: 0.9, pitchX: 0.03, pitchY: 0.027 };
const keyAt = (r: number, c: number) => V(KEYPAD.x + (c - 1) * KEYPAD.pitchX, KEYPAD.y + 0.04 - r * KEYPAD.pitchY, FRONT + 0.012);
const READER = V(COL_X, 1.33, FRONT + 0.03);
const DISPLAY = V(COL_X, 1.175, FRONT + 0.006);
const FLAP = { x: WIN_X, top: 0.46, height: 0.2, width: 0.5 };
/** Within this distance (m) the shelves show every product in its coil. */
const LOD_NEAR = 26;

// ---- Materials and textures ------------------------------------------------------
const CELL = { w: 128, h: 256, cols: 8, rows: 4 };
/** Every product's printed art in one atlas, so all the goods on the shelves are one draw. */
const goods = () => mat("vending goods", () => {
  const t = canvasTexture(CELL.w * CELL.cols, CELL.h * CELL.rows, (g) => VEND_SLOTS.forEach((slot, i) => {
    const cell = artCell(i);
    g.save(); g.translate(cell.cx * CELL.w, cell.cy * CELL.h);
    g.beginPath(); g.rect(0, 0, CELL.w, CELL.h); g.clip();
    paintProduct(g, slot);
    g.restore();
  }));
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.38, metalness: 0.18 });
});
const artCell = (i: number) => ({ cx: i % CELL.cols, cy: Math.floor(i / CELL.cols) });

function paintProduct(g: CanvasRenderingContext2D, s: VendSlot) {
  const { w, h } = CELL, a = s.art;
  const center = (text: string, y: number, size: number, color: string, weight = "900", font = "sans-serif", maxW = w - 14) => {
    g.fillStyle = color; g.font = `${weight} ${size}px ${font}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, w / 2, y, maxW);
  };
  if (s.form === "bag") {
    // Foil bag: a crimped seal top and bottom, the brand banner, a chip and the flavour.
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, shade(a.base, -0.25)); grad.addColorStop(0.45, shade(a.base, 0.12)); grad.addColorStop(1, shade(a.base, -0.3));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (const [y0, y1] of [[0, 20], [h - 16, h]]) {
      g.fillStyle = shade(a.base, -0.1); g.fillRect(0, y0, w, y1 - y0);
      g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1.5;
      for (let x = 3; x < w; x += 5) { g.beginPath(); g.moveTo(x, y0 + 2); g.lineTo(x, y1 - 2); g.stroke(); }
    }
    g.fillStyle = a.accent; g.beginPath(); g.moveTo(0, 34); g.lineTo(w, 26); g.lineTo(w, 70); g.lineTo(0, 78); g.fill();
    center("CRUNCH", 44, 20, a.base === "#e9e3cf" ? "#1f3a66" : shade(a.base, -0.45));
    center("RIDGE", 63, 17, a.base === "#e9e3cf" ? "#1f3a66" : shade(a.base, -0.45));
    // A few chips, golden and ridged.
    for (const [x, y, r, t] of [[48, 128, 30, -0.3], [82, 138, 26, 0.5], [64, 160, 24, 0.1]] as const) {
      g.save(); g.translate(x, y); g.rotate(t);
      const cg = g.createRadialGradient(-6, -6, 2, 0, 0, r); cg.addColorStop(0, "#ffe9a0"); cg.addColorStop(1, "#d9a53a");
      g.fillStyle = cg; g.beginPath(); g.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(150,95,20,.45)"; g.lineWidth = 1.5;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-r * 0.8, k * 6); g.quadraticCurveTo(0, k * 6 - 4, r * 0.8, k * 6); g.stroke(); }
      g.restore();
    }
    g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(8, 188, w - 16, 34);
    center(s.flavor.toUpperCase(), 205, 15, a.ink, "800");
    center("NET WT 1 OZ", 232, 9, a.ink, "600");
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(w * 0.18, 20, 7, h - 36);
    return;
  }
  if (s.form === "can") {
    // Wrapped round the can: its seam is at the cell edges, the front in the middle.
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, shade(a.base, -0.35)); grad.addColorStop(0.42, shade(a.base, 0.1)); grad.addColorStop(0.55, shade(a.base, 0.28)); grad.addColorStop(1, shade(a.base, -0.35));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // Aluminium necks top and bottom.
    for (const [y0, y1] of [[0, 18], [h - 12, h]]) {
      const m = g.createLinearGradient(0, 0, w, 0); m.addColorStop(0, "#8d9499"); m.addColorStop(0.5, "#eef2f4"); m.addColorStop(1, "#8d9499");
      g.fillStyle = m; g.fillRect(0, y0, w, y1 - y0);
    }
    g.strokeStyle = a.accent; g.lineWidth = 5;
    g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, 150 + Math.sin(x * 0.06) * 10); g.stroke();
    g.save(); g.translate(w / 2, 92); g.rotate(-Math.PI / 2);
    g.fillStyle = a.ink; g.font = "italic 900 30px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("FIZZ POP", 0, 0, 120);
    g.restore();
    center(s.flavor.toUpperCase(), 196, 13, a.ink, "800");
    center("12 FL OZ", 222, 9, a.ink, "600");
    return;
  }
  // Bottles: the cap at the top of the cell, clear plastic showing the drink, a wrapped label.
  const capH = h * 0.1, shoulder = h * 0.28;
  g.fillStyle = a.cap ?? "#ffffff"; g.fillRect(0, 0, w, capH);
  g.fillStyle = "rgba(0,0,0,.2)"; for (let x = 2; x < w; x += 6) g.fillRect(x, 2, 2, capH - 4);
  const liquid = a.liquid ?? a.base;
  const lg = g.createLinearGradient(0, 0, w, 0); lg.addColorStop(0, shade(liquid, -0.25)); lg.addColorStop(0.5, shade(liquid, 0.25)); lg.addColorStop(1, shade(liquid, -0.25));
  g.fillStyle = lg; g.fillRect(0, capH, w, h - capH);
  g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(0, capH, w, shoulder - capH);
  const y0 = h * 0.4, y1 = h * 0.78;
  g.fillStyle = a.base; g.fillRect(0, y0, w, y1 - y0);
  g.fillStyle = a.accent; g.fillRect(0, y0 + 4, w, 12); g.fillRect(0, y1 - 16, w, 12);
  if (s.brand === "Voltade") {
    g.fillStyle = a.accent; g.beginPath(); g.moveTo(w / 2 + 6, y0 + 20); g.lineTo(w / 2 - 12, y0 + 52); g.lineTo(w / 2, y0 + 52); g.lineTo(w / 2 - 8, y0 + 80); g.lineTo(w / 2 + 14, y0 + 44); g.lineTo(w / 2 + 2, y0 + 44); g.closePath(); g.fill();
    center("VOLTADE", y0 + 32, 17, a.ink);
    center(s.flavor.toUpperCase(), y1 - 26, 11, a.ink, "800");
  } else {
    // Mountains over water for Clear Mesa.
    g.fillStyle = a.accent; g.beginPath(); g.moveTo(24, y0 + 62); g.lineTo(50, y0 + 30); g.lineTo(66, y0 + 48); g.lineTo(80, y0 + 34); g.lineTo(104, y0 + 62); g.fill();
    center("CLEAR MESA", y0 + 24, 13, a.ink);
    center(s.flavor.toUpperCase(), y1 - 26, 11, a.ink, "800");
  }
}
/** Lightens (+) or darkens (-) a hex colour. */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Price rails: a strip per shelf with each coil's code and price. */
const rails = () => mat("vending rails", () => {
  const t = canvasTexture(512, 192, (g) => {
    for (let r = 0; r < 6; r++) {
      const y = r * 32;
      g.fillStyle = "#15181b"; g.fillRect(0, y, 512, 32);
      for (let c = 0; c < 5; c++) {
        const slot = VEND_SLOTS[r * 5 + c], x = c * 102.4 + 12;
        g.fillStyle = "#f4f4ee"; g.fillRect(x, y + 4, 78, 24);
        g.fillStyle = "#15181b"; g.font = "bold 17px monospace"; g.textBaseline = "middle"; g.textAlign = "left"; g.fillText(slot.code, x + 5, y + 17);
        g.fillStyle = "#b8141c"; g.textAlign = "right"; g.font = "bold 14px sans-serif"; g.fillText(slot.price + "c", x + 73, y + 17);
      }
    }
  });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 });
});
/** Engraved key legends over the steel keys (transparent between them). */
const keyLegends = () => mat("vending key legends", () => {
  const t = canvasTexture(200, 260, (g) => {
    g.clearRect(0, 0, 200, 260);
    KEYS.forEach((row, r) => row.forEach((label, c) => {
      const x = 100 + (c - 1) * 60, y = 50 + r * 54;
      g.fillStyle = label === "C" ? "#b8141c" : label === "OK" ? "#157a2e" : "#1b1f22";
      g.font = `bold ${label.length > 1 ? 22 : 30}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, x, y);
    }));
  });
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, roughness: 0.4, metalness: 0.4, depthWrite: false });
});
const pushPlate = () => mat("vending push flap", () => {
  const t = canvasTexture(512, 200, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 200); grad.addColorStop(0, "#c9ced1"); grad.addColorStop(1, "#9ea5aa");
    g.fillStyle = grad; g.fillRect(0, 0, 512, 200);
    for (let y = 0; y < 200; y += 2) { g.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.08})`; g.fillRect(0, y, 512, 1); }
    g.font = "600 76px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(255,255,255,.55)"; g.fillText("PUSH", 258, 104);
    g.fillStyle = "rgba(60,66,70,.7)"; g.fillText("PUSH", 256, 102);
  });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.32, metalness: 0.75 });
});
const cabinet = () => paint(0x101112, 0.42, 0.35);
const trim = () => paint(0x1d2023, 0.5, 0.45);
const interior = () => mat("vending interior", () => new THREE.MeshStandardMaterial({ color: 0xe9eef0, emissive: 0xdfe8ec, emissiveIntensity: 0.55, roughness: 0.7 }));
const led = () => mat("vending led", () => new THREE.MeshBasicMaterial({ color: 0xf4fbff }));
const glass = () => mat("vending door glass", () => new THREE.MeshPhysicalMaterial({ color: 0xdbe9ee, transparent: true, opacity: 0.12, roughness: 0.03, metalness: 0, clearcoat: 1, depthWrite: false }));
const yellow = () => paint(0xf2cf1c, 0.35, 0.1);
const bin = () => paint(0x08090a, 0.9, 0);
/** The coils' own steel, so the far view can leave them out (lod). */
const coilWire = () => mat("vending coil", () => (galvanized() as THREE.MeshStandardMaterial).clone());
/** From afar the shelves are a painted card: each coil's colours in rows. */
const farShelves = () => mat("vending far shelves", () => {
  const t = canvasTexture(128, 192, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 192); grad.addColorStop(0, "#eef4f6"); grad.addColorStop(1, "#d6e2e6");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 192);
    for (const slot of VEND_SLOTS) {
      const x = (slot.col - 1) * 25.6 + 3, y = (slot.row - 1) * 32, a = slot.art;
      g.fillStyle = slot.form === "bottle" ? a.liquid ?? a.base : a.base;
      g.fillRect(x + (slot.form === "bag" ? 0 : 4), y + 6, slot.form === "bag" ? 20 : 12, 22);
      g.fillStyle = a.accent; g.fillRect(x + (slot.form === "bag" ? 0 : 4), y + 13, slot.form === "bag" ? 20 : 12, 5);
      g.fillStyle = "#555c60"; g.fillRect(0, y + 28, 128, 4);
    }
  });
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.45, roughness: 0.6 });
});

// ---- Product geometry ------------------------------------------------------------
const P = (x: number, y: number) => new THREE.Vector2(x, y);
/** Puts a geometry's 0..1 UVs into its slot's atlas cell (with a hair of margin). */
function toCell(g: THREE.BufferGeometry, slot: VendSlot) {
  const { cx, cy } = artCell(VEND_SLOTS.indexOf(slot)), uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1), v = THREE.MathUtils.clamp(uv.getY(i), 0, 1);
    uv.setXY(i, (cx + 0.01 + u * 0.98) / CELL.cols, (CELL.rows - 1 - cy + 0.005 + v * 0.99) / CELL.rows);
  }
  return g;
}
/** One product standing on the origin, its front toward +z. */
export function productGeometry(slot: VendSlot) {
  if (slot.form === "bag") {
    // A pillow of foil: front and back sheets bulging apart, flat at the crimped seals.
    const w = 0.11, h = 0.16, sheets: THREE.BufferGeometry[] = [];
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(w, h, 6, 8), p = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / w * 2, v = p.getY(i) / h * 2;
        const across = Math.pow(Math.max(0, 1 - u * u), 0.6), up = THREE.MathUtils.smoothstep(1 - Math.abs(v), 0.02, 0.3);
        p.setZ(i, side * (0.002 + 0.022 * across * up));
        p.setX(i, p.getX(i) * (1 - 0.06 * up * (1 - across)));
        if (side < 0) uv.setX(i, 1 - uv.getX(i));
      }
      g.translate(0, h / 2, 0);
      g.computeVertexNormals();
      if (side < 0) { const idx = g.getIndex()!; for (let k = 0; k < idx.count; k += 3) { const a = idx.getX(k); idx.setX(k, idx.getX(k + 1)); idx.setX(k + 1, a); } g.computeVertexNormals(); }
      sheets.push(toCell(g, slot));
    }
    return mergeGeometries(sheets)!;
  }
  if (slot.form === "can") {
    const r = 0.033, h = 0.122;
    const body = new THREE.CylinderGeometry(r, r, h, 16, 1, true).rotateY(Math.PI).translate(0, h / 2, 0);
    // Tapered necks top and bottom, and the lid, drawn from the aluminium band of the art.
    const neck = new THREE.LatheGeometry([P(r, h), P(r * 0.86, h + 0.008), P(r * 0.84, h + 0.009), P(0, h + 0.006)], 16);
    const foot = new THREE.LatheGeometry([P(0, 0.004), P(r * 0.8, 0), P(r, 0.008)].reverse(), 16);
    for (const g of [neck, foot]) { const uv = g.getAttribute("uv") as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, g === neck ? 0.97 : 0.02); }
    return mergeGeometries([toCell(body, slot), toCell(neck, slot), toCell(foot, slot)].map((g) => g.index ? g.toNonIndexed() : g))!;
  }
  // A bottle turned on a lathe, its UVs by height so the art's bands land true.
  const pts = [P(0, 0), P(0.028, 0), P(0.033, 0.008), P(0.033, 0.1), P(0.03, 0.118), P(0.02, 0.135), P(0.0145, 0.142), P(0.0155, 0.146), P(0.0155, 0.162), P(0, 0.163)];
  const g = new THREE.LatheGeometry(pts, 16).rotateY(Math.PI);
  const p = g.getAttribute("position") as THREE.BufferAttribute, uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setY(i, p.getY(i) / 0.163);
  g.computeVertexNormals();
  return toCell(g, slot);
}

/** A spiral coil along z, `turns` round, as a wire tube. */
function coilGeometry() {
  const turns = (COIL.z1 - COIL.z0) / COIL.pitch, n = Math.round(turns * 8);
  const pts = Array.from({ length: n + 1 }, (_, i) => { const t = i / n, a = t * turns * Math.PI * 2; return V(Math.sin(a) * COIL.r, Math.cos(a) * COIL.r, COIL.z0 + t * (COIL.z1 - COIL.z0)); });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, 0.0026, 4, false);
}

// ---- Dynamic faces ----------------------------------------------------------------
class Face {
  readonly canvas = document.createElement("canvas");
  readonly g: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private last = "";
  constructor(w: number, h: number) {
    this.canvas.width = w; this.canvas.height = h;
    this.g = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }
  /** Redraws only when what it shows has changed. */
  draw(key: string, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    if (key === this.last) return;
    this.last = key;
    paint(this.g, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }
  dispose() { this.texture.dispose(); }
}
export type ReaderState = "idle" | "ready" | "reading" | "approved" | "declined";

/**
 * One machine in the world: its static model (merged per material), and the
 * parts that move or change while someone uses it.
 */
export class VendingMachine {
  readonly group: THREE.Group;
  private readonly display = new Face(256, 64);
  private readonly reader = new Face(128, 160);
  private readonly highlight: THREE.Mesh;
  private readonly flap = new THREE.Group();
  private drop: { mesh: THREE.Mesh; slot: VendSlot; t: number; landed: boolean } | null = null;
  private readonly owned: (THREE.BufferGeometry | THREE.Material)[] = [];
  private flash = 0;
  private readonly near: THREE.Object3D[] = [];
  private readonly far: THREE.Object3D[] = [];
  private detailed: boolean | null = null;

  constructor(park: Park, readonly base: THREE.Vector3, readonly yaw = 0) {
    const k = new Kit(base, yaw), inside = new Kit(base, yaw);
    const shell = cabinet(), dark = trim(), chrome = galvanized();
    // Levelling feet, plinth, sides, top and back.
    for (const x of [-0.44, 0.44]) for (const z of [-0.32, 0.32]) {
      k.add(new THREE.CylinderGeometry(0.03, 0.034, 0.022, 12), rubber(), V(x, 0.011, z));
      k.add(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), chrome, V(x, 0.045, z));
    }
    k.box(V(W - 0.04, 0.05, D - 0.06), dark, V(0, 0.08, -0.01), 0.01);
    for (const s of [-1, 1]) k.box(V(0.03, TOP - 0.1, D), shell, V(s * (W / 2 - 0.015), 0.1 + (TOP - 0.1) / 2, 0), 0.008);
    k.box(V(W, 0.04, D), shell, V(0, TOP - 0.02, 0), 0.012);
    k.box(V(W - 0.06, TOP - 0.14, 0.03), shell, V(0, 0.1 + (TOP - 0.14) / 2, -D / 2 + 0.015), 0.005);
    // The control column and the door's lower panel.
    k.box(V(0.24, TOP - 0.14, D - 0.05), shell, V(COL_X, 0.1 + (TOP - 0.14) / 2, -0.015), 0.01);
    k.box(V(0.02, TOP - 0.16, 0.012), dark, V(0.236, 0.1 + (TOP - 0.16) / 2, FRONT + 0.004), 0.004);
    k.box(V(0.72, 0.13, 0.7), shell, V(WIN_X, 0.165, -0.02), 0.01);
    k.box(V(0.72, 0.15, 0.7), shell, V(WIN_X, 0.555, -0.02), 0.01);
    for (const x of [WIN.x0 - 0.005, 0.2]) k.box(V(0.08, 0.22, 0.7), shell, V(x + (x < 0 ? 0.04 : -0.0), 0.34, -0.02), 0.006);
    // Door frame round the glass, with the gasket.
    for (const [x, y, w, h] of [[WIN_X, WIN.y1 + 0.025, WIN.x1 - WIN.x0 + 0.06, 0.05], [WIN_X, WIN.y0 - 0.025, WIN.x1 - WIN.x0 + 0.06, 0.05], [WIN.x0 - 0.015, (WIN.y0 + WIN.y1) / 2, 0.03, WIN.y1 - WIN.y0], [WIN.x1 + 0.015, (WIN.y0 + WIN.y1) / 2, 0.03, WIN.y1 - WIN.y0]] as const)
      k.box(V(w, h, 0.05), shell, V(x, y, FRONT - 0.015), 0.01);
    k.add(new THREE.PlaneGeometry(WIN.x1 - WIN.x0 + 0.004, WIN.y1 - WIN.y0 + 0.004), glass(), V(WIN_X, (WIN.y0 + WIN.y1) / 2, FRONT - 0.012));
    // The lit cabinet: back wall, walls, LED strips down the door.
    const deep = FRONT - 0.03 - (-D / 2 + 0.03);
    inside.add(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), interior(), V(WIN_X, (WIN.y0 + WIN.y1) / 2, -D / 2 + 0.031));
    for (const s of [-1, 1]) inside.add(new THREE.PlaneGeometry(deep, WIN.y1 - WIN.y0), dark, V(s < 0 ? WIN.x0 : WIN.x1, (WIN.y0 + WIN.y1) / 2, (FRONT - 0.03 - D / 2 + 0.03) / 2), new THREE.Euler(0, s * -Math.PI / 2, 0));
    inside.add(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, deep), dark, V(WIN_X, WIN.y1, (FRONT - 0.03 - D / 2 + 0.03) / 2), new THREE.Euler(Math.PI / 2, 0, 0));
    for (const x of [WIN.x0 + 0.012, WIN.x1 - 0.012]) inside.box(V(0.012, WIN.y1 - WIN.y0 - 0.04, 0.01), led(), V(x, (WIN.y0 + WIN.y1) / 2, FRONT - 0.045), 0.004);
    inside.box(V(WIN.x1 - WIN.x0 - 0.04, 0.01, 0.012), led(), V(WIN_X, WIN.y1 - 0.012, FRONT - 0.05), 0.004);
    // Six shelves: a steel tray, a price rail, five coils and the goods in them.
    const coil = coilGeometry();
    for (let row = 1; row <= 6; row++) {
      const y = trayTop(row);
      inside.box(V(WIN.x1 - WIN.x0 - 0.01, 0.012, 0.64), chrome, V(WIN_X, y - 0.006, -0.01), 0.003);
      inside.box(V(WIN.x1 - WIN.x0 - 0.01, 0.03, 0.012), dark, V(WIN_X, y - 0.012, 0.325), 0.003);
      const rail = new THREE.PlaneGeometry(WIN.x1 - WIN.x0 - 0.02, 0.026), uv = rail.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (6 - row + uv.getY(i)) / 6);
      inside.add(rail, rails(), V(WIN_X, y - 0.012, 0.3315));
      for (let col = 1; col <= 5; col++) {
        const slot = VEND_SLOTS[(row - 1) * 5 + col - 1], x = slotX(col);
        inside.add(coil.clone(), coilWire(), V(x, y + COIL.r + 0.003, 0));
        for (let n = 0; n < 3; n++) inside.add(productGeometry(slot), goods(), V(x, y, FRONT_Z - n * COIL.pitch), new THREE.Euler(slot.form === "bag" ? -0.06 : 0, 0, 0));
      }
    }
    coil.dispose();
    // The far card sits just behind the front row, shown instead of the goods and coils.
    inside.add(new THREE.PlaneGeometry(WIN.x1 - WIN.x0 - 0.02, WIN.y1 - WIN.y0 - 0.02), farShelves(), V(WIN_X, (WIN.y0 + WIN.y1) / 2, FRONT_Z - 0.02));
    // The column: yellow tap-to-pay reader, display, note acceptor, keypad, lock, coin return.
    k.box(V(0.1, 0.13, 0.03), yellow(), V(READER.x, READER.y, FRONT + 0.012), 0.012);
    k.box(V(0.17, 0.055, 0.012), dark, V(DISPLAY.x, DISPLAY.y, FRONT + 0.002), 0.004);
    k.box(V(0.1, 0.1, 0.035), dark, V(COL_X, 1.04, FRONT + 0.012), 0.012);
    k.box(V(0.075, 0.006, 0.01), chrome, V(COL_X, 1.07, FRONT + 0.03), 0.002);
    k.box(V(0.11, 0.14, 0.006), chrome, V(KEYPAD.x, KEYPAD.y, FRONT + 0.003), 0.006);
    KEYS.forEach((row, r) => row.forEach((_, c) => k.box(V(0.024, 0.021, 0.008), chrome, keyAt(r, c).setZ(FRONT + 0.008), 0.004)));
    k.add(new THREE.PlaneGeometry(0.1, 0.13), keyLegends(), V(KEYPAD.x, KEYPAD.y, FRONT + 0.0125));
    k.add(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 16), chrome, V(COL_X, 0.78, FRONT + 0.006), new THREE.Euler(Math.PI / 2, 0, 0));
    k.add(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 16), chrome, V(COL_X, 0.5, FRONT + 0.005), new THREE.Euler(Math.PI / 2, 0, 0));
    k.box(V(0.07, 0.05, 0.012), bin(), V(COL_X, 0.43, FRONT + 0.001), 0.006);
    // The pickup bin: a dark cavity behind the flap and its chrome surround.
    k.box(V(FLAP.width + 0.04, 0.012, 0.05), chrome, V(FLAP.x, FLAP.top + 0.012, FRONT + 0.012), 0.004);
    k.box(V(FLAP.width + 0.04, 0.012, 0.05), chrome, V(FLAP.x, FLAP.top - FLAP.height - 0.012, FRONT + 0.012), 0.004);
    k.box(V(FLAP.width, FLAP.height, 0.3), bin(), V(FLAP.x, FLAP.top - FLAP.height / 2, FRONT - 0.17), 0.004);
    // Side vents and the kick plate.
    for (const s of [-1, 1]) for (let i = 0; i < 8; i++) k.box(V(0.006, 0.012, 0.36), dark, V(s * (W / 2 + 0.001), 1.55 - i * 0.03, -0.1), 0.003);
    for (let i = 0; i < 4; i++) k.box(V(0.6, 0.01, 0.008), dark, V(WIN_X, 0.13 + i * 0.022, FRONT + 0.004), 0.003);
    const group = k.build(park.scene, "Refresh vending machine");
    const lit = inside.build(group, "vending shelves", false);
    lit.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = false;
      const name = (mesh.material as THREE.Material).name;
      if (name === "vending goods" || name === "vending coil") this.near.push(mesh);
      if (name === "vending far shelves") this.far.push(mesh);
    });
    this.lod(V(1e6, 0, 0));
    this.group = group;
    solid(park, turn(base, yaw, V(0, TOP / 2, 0)), V(W + 0.04, TOP, D + 0.02), yaw);

    // Moving and changing parts, in machine space under one pivot.
    const pivot = new THREE.Group();
    pivot.position.copy(base); pivot.rotation.y = yaw;
    group.add(pivot);
    group.userData.pivot = pivot;
    const face = (face: Face, w: number, h: number, at: THREE.Vector3, basic = true) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = basic ? new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: face.texture, roughness: 0.4 });
      this.owned.push(g, m);
      const mesh = new THREE.Mesh(g, m); mesh.position.copy(at); pivot.add(mesh); return mesh;
    };
    face(this.display, 0.15, 0.0375, DISPLAY.clone().setZ(FRONT + 0.0085));
    face(this.reader, 0.085, 0.106, V(READER.x, READER.y, FRONT + 0.0275));
    const hg = new THREE.PlaneGeometry(0.03, 0.027), hm = new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.owned.push(hg, hm);
    this.highlight = new THREE.Mesh(hg, hm); pivot.add(this.highlight);
    const fg = new THREE.PlaneGeometry(FLAP.width, FLAP.height).translate(0, -FLAP.height / 2, 0);
    this.owned.push(fg);
    const flapMesh = new THREE.Mesh(fg, pushPlate()); flapMesh.castShadow = true;
    this.flap.add(flapMesh); this.flap.position.set(FLAP.x, FLAP.top, FRONT + 0.006); pivot.add(this.flap);
    this.setDisplay("REFRESH", "ICE COLD DRINKS & SNACKS");
    this.setReader("idle");
  }
  /** Level of detail: the goods and coils only within LOD_NEAR of `viewer`, a painted card beyond. */
  lod(viewer: THREE.Vector3) {
    const near = viewer.distanceToSquared(this.base) < LOD_NEAR * LOD_NEAR;
    if (near === this.detailed) return;
    this.detailed = near;
    for (const o of this.near) o.visible = near;
    for (const o of this.far) o.visible = !near;
  }
  private get pivot() { return this.group.userData.pivot as THREE.Group; }
  /** A point given in machine space, in the world. */
  world(local: THREE.Vector3) { return turn(this.base, this.yaw, local); }
  keyPoint(r: number, c: number) { return this.world(keyAt(r, c)); }
  readerPoint() { return this.world(READER.clone().setZ(FRONT + 0.03)); }
  flapPoint() { return this.world(V(FLAP.x, FLAP.top - FLAP.height / 2, FRONT)); }
  /** The way the front faces, in the world. */
  get facing() { return V(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  /** The green display: one line, or two. */
  setDisplay(top: string, bottom = "") {
    this.display.draw(top + "|" + bottom, (g, w, h) => {
      g.fillStyle = "#031a0a"; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(60,255,120,.08)"; for (let x = 0; x < w; x += 4) for (let y = 0; y < h; y += 4) g.fillRect(x, y, 3, 3);
      g.shadowColor = "#3dff7a"; g.shadowBlur = 6; g.fillStyle = "#7dffa6"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `bold ${bottom ? 24 : 30}px monospace`; g.fillText(top, w / 2, bottom ? 20 : h / 2, w - 10);
      if (bottom) { g.font = "bold 17px monospace"; g.fillText(bottom, w / 2, 47, w - 10); }
      g.shadowBlur = 0;
    });
  }
  /** The tap-to-pay reader's face: the contactless mark, its screen and four lights. */
  setReader(state: ReaderState, lights = 0, price = 0) {
    this.reader.draw(`${state}|${lights}|${price}`, (g, w, h) => {
      g.fillStyle = "#f2cf1c"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        const on = state === "approved" || (state === "reading" && i < lights), bad = state === "declined";
        g.fillStyle = bad ? (i % 2 ? "#ff3a2a" : "#5a1410") : on ? "#3dff7a" : "#2c3a2e";
        g.beginPath(); g.arc(28 + i * 24, 14, 6, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = "#0b1410"; g.beginPath(); g.roundRect(14, 28, w - 28, 70, 6); g.fill();
      const say = (text: string, y: number, size: number, color: string) => { g.fillStyle = color; g.font = `bold ${size}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, y, w - 34); };
      if (state === "approved") { say("✓", 52, 30, "#5dff8a"); say("APPROVED", 84, 13, "#5dff8a"); }
      else if (state === "declined") { say("✕", 52, 30, "#ff5a4a"); say("DECLINED", 84, 13, "#ff5a4a"); }
      else if (state === "reading") { say("READING", 52, 15, "#e8f2ee"); say("HOLD STILL", 78, 11, "#9fb2aa"); }
      else if (state === "ready") { say(price + " COINS", 50, 16, "#e8f2ee"); say("TAP PHONE", 78, 12, "#7dffa6"); }
      else { say("TAP", 52, 17, "#e8f2ee"); say("TO PAY", 76, 12, "#9fb2aa"); }
      // The contactless waves.
      g.strokeStyle = "#1b1f22"; g.lineWidth = 4; g.lineCap = "round";
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(w / 2 - 16, 130, 8 + i * 7, -0.7, 0.7); g.stroke(); }
    });
  }
  /** Lights a key (r, c), briefly brighter while pressed; null clears it. */
  highlightKey(key: [number, number] | null, pressed = false) {
    const m = this.highlight.material as THREE.MeshBasicMaterial;
    if (!key) { m.opacity = 0; return; }
    if (pressed) this.flash = 0.18;
    this.highlight.position.copy(keyAt(key[0], key[1])).setZ(FRONT + 0.0135);
    m.opacity = this.flash > 0 ? 0.95 : 0.45;
  }
  /** Swings the PUSH flap in (0 shut .. 1 pushed right in). */
  setFlap(open: number) { this.flap.rotation.x = 1.05 * THREE.MathUtils.clamp(open, 0, 1); }
  /** A product comes off its coil: it walks forward on the turning coil, tips off the shelf and falls to the bin. */
  vend(slot: VendSlot) {
    this.clearDrop();
    const g = productGeometry(slot), mesh = new THREE.Mesh(g, goods());
    this.owned.push(g);
    mesh.position.set(slotX(slot.col), trayTop(slot.row), FRONT_Z);
    this.pivot.add(mesh);
    this.drop = { mesh, slot, t: 0, landed: false };
  }
  /** The product's dropping state: 'turning' on the coil, 'falling', then 'landed' in the bin. */
  get dropState() { const d = this.drop; return !d ? null : d.landed ? "landed" : d.t < 1.1 ? "turning" : "falling"; }
  /** Hands the landed product over (it leaves the bin) and returns it. */
  takeDrop() { const d = this.drop; this.clearDrop(); return d?.slot ?? null; }
  private clearDrop() {
    if (!this.drop) return;
    this.drop.mesh.removeFromParent();
    this.drop.mesh.geometry.dispose();
    this.owned.splice(this.owned.indexOf(this.drop.mesh.geometry), 1);
    this.drop = null;
  }
  /** Moves the drop along; returns true on the frame it lands in the bin. */
  step(dt: number) {
    this.flash = Math.max(0, this.flash - dt);
    const m = this.highlight.material as THREE.MeshBasicMaterial;
    if (m.opacity > 0) m.opacity = this.flash > 0 ? 0.95 : 0.45;
    const d = this.drop;
    if (!d || d.landed) return false;
    d.t += dt;
    const shelf = trayTop(d.slot.row), m0 = d.mesh;
    if (d.t < 1.1) {
      // One turn of the coil carries it a pitch forward to the edge.
      m0.position.z = FRONT_Z + 0.07 * THREE.MathUtils.smoothstep(d.t, 0, 1.1);
      return false;
    }
    const fall = d.t - 1.1, tip = Math.min(1, fall / 0.22);
    m0.rotation.x = tip * 1.3 + fall * 5;
    m0.position.z = FRONT_Z + 0.07 + 0.012 * tip;
    m0.position.y = shelf - 4.9 * fall * fall;
    // Behind the door's lower panel it falls out of sight into the bin.
    if (m0.position.y < WIN.y0 - 0.02) {
      d.landed = true;
      m0.rotation.set(-Math.PI / 2, 0, 0.4);
      m0.position.set(FLAP.x + 0.04, FLAP.top - FLAP.height + 0.02 + (d.slot.form === "bag" ? 0.02 : 0.034), FRONT - 0.13);
      return true;
    }
    return false;
  }
  dispose() {
    this.clearDrop();
    this.display.dispose(); this.reader.dispose();
    for (const o of this.owned) o.dispose();
  }
}

// ---- Using a machine ------------------------------------------------------------------
export type VendSound = "key" | "error" | "approved" | "declined" | "motor" | "drop" | "flap";
export type PayScreen = "pay" | "approved" | "declined";
/** What a session needs from the game: the wallet, sounds, the pockets and the phone. */
export interface VendHooks {
  /** Charges the price in Coins: "ok", or why it was declined. */
  pay(price: number): Promise<string>;
  sound(kind: VendSound, at: THREE.Vector3): void;
  canReceive(): boolean;
  receive(slot: VendSlot): void;
  /** The phone asks "add funds?" after a decline. */
  declined(slot: VendSlot, reason: string): void;
  /** What the phone's screen shows while it is held to the reader (null: back to normal). */
  phoneScreen(state: PayScreen | null, slot: VendSlot | null): void;
}
type Phase = "keypad" | "paying" | "result" | "vending" | "collect" | "taking";
const STICK_FIRST = 0.32, STICK_NEXT = 0.14;
/** A left hand hanging at the side: fingers down, back of the hand out (hand frame: x across, y back, z fingers). */
const RELAXED = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, -1), V(1, 0, 0), V(0, -1, 0)));
/** Fingertip from the wrist in the hand's frame (fingers along +z). */
const FINGERTIP = V(0, -0.01, 0.165);

/**
 * One rider at one machine: the keypad under the left stick, the phone to the
 * reader, the product into the bin, the flap and into the hand. The machine's
 * stock never goes down: what drops is a copy of the front product.
 */
export class VendingSession {
  phase: Phase = "keypad";
  code = "";
  cursor: [number, number] = [0, 1];
  slot: VendSlot | null = null;
  /** 0..1: the phone out and held flat to the reader. */
  tapRaise = 0;
  /** 0..1: the pressing hand out at the keypad. */
  reach = 0;
  private time = 0;
  private press = 0;
  private stick = "";
  private repeat = 0;
  private notice = 0;
  private result: string | null = null;
  private asked = false;
  private finished = false;
  private readonly view = { pos: V(), look: V(), ready: false };

  constructor(readonly machine: VendingMachine, private readonly hooks: VendHooks) {
    this.idle();
  }
  /** Where the rider stands to use it (in front of the column) and the way they face. */
  get stand() { return { at: this.machine.world(V(COL_X - 0.08, 0, FRONT + 0.45)), yaw: this.machine.yaw + Math.PI }; }
  get done() { return this.finished; }
  private idle(top = "SELECT ITEM", bottom = "KEY THE CODE") {
    this.machine.setDisplay(top, bottom);
    this.machine.setReader("idle");
    this.machine.highlightKey(this.cursor);
  }
  private say(top: string, bottom = "", seconds = 1.2) { this.machine.setDisplay(top, bottom); this.notice = seconds; }
  private at() { return this.machine.keyPoint(this.cursor[0], this.cursor[1]); }

  /** What the prompt line says for the current step. */
  hint() {
    if (this.phase === "keypad") return this.slot
      ? `${this.slot.code} · ${this.slot.brand} ${this.slot.flavor} · ${this.slot.price} Coins · X / Hold phone to reader · B / Leave`
      : "LS / Move · A / Press key · Key a code from the shelf tags · B / Leave";
    if (this.phase === "paying" || this.phase === "result") return "Holding your phone to the reader…";
    if (this.phase === "collect") return "A / Push the flap and take it";
    return "Vending…";
  }

  /** Runs the machine for a frame of input. Returns false once the rider has walked away. */
  update(f: { steer: number; lean: number; pressed: Record<string, boolean> }, dt: number) {
    this.time += dt;
    this.press = Math.max(0, this.press - dt);
    this.machine.step(dt);
    if (this.notice > 0 && (this.notice -= dt) <= 0) this.slot ? this.showSlot() : this.idle();
    const ease = (v: number, target: number, rate: number) => v + Math.sign(target - v) * Math.min(Math.abs(target - v), rate * dt);
    this.reach = ease(this.reach, this.phase === "keypad" ? 1 : 0, 3.5);
    this.tapRaise = ease(this.tapRaise, this.phase === "paying" || (this.phase === "result" && this.time < (this.result === "ok" ? 0.7 : 0.9)) ? 1 : 0, 2.2);
    switch (this.phase) {
      case "keypad": this.keypad(f, dt); break;
      case "paying": this.paying(); break;
      case "result": this.showResult(); break;
      case "vending":
        if (this.machine.dropState === "landed") {
          this.hooks.sound("drop", this.machine.flapPoint());
          this.machine.setDisplay("TAKE YOUR ITEM", "PUSH THE FLAP");
          this.to("collect");
        }
        break;
      case "collect":
        if (f.pressed.hop || f.pressed.brakeBars) { this.hooks.sound("flap", this.machine.flapPoint()); this.to("taking"); this.leaving = !!f.pressed.brakeBars; }
        break;
      case "taking": this.taking(); break;
    }
    return !this.finished;
  }
  private leaving = false;
  private to(phase: Phase) { this.phase = phase; this.time = 0; }
  private showSlot() {
    const s = this.slot!;
    this.machine.setDisplay(`${s.code} ${s.flavor.toUpperCase()}`, `${s.price} COINS · TAP PHONE`);
    this.machine.setReader("ready", 0, s.price);
  }
  private keypad(f: { steer: number; lean: number; pressed: Record<string, boolean> }, dt: number) {
    if (f.pressed.brakeBars) { this.end(); return; }
    if (f.pressed.pushDeck && this.slot) { this.startPaying(); return; }
    // The left stick steps between keys, repeating while held.
    const x = f.steer, y = f.lean;
    const dir = Math.abs(x) > 0.5 && Math.abs(x) >= Math.abs(y) ? (x > 0 ? "r" : "l") : Math.abs(y) > 0.5 ? (y > 0 ? "d" : "u") : "";
    if (!dir) this.stick = "";
    else if (dir !== this.stick || (this.repeat -= dt) <= 0) {
      this.repeat = dir === this.stick ? STICK_NEXT : STICK_FIRST;
      this.stick = dir;
      const [r, c] = this.cursor;
      this.cursor = [THREE.MathUtils.clamp(r + (dir === "d" ? 1 : dir === "u" ? -1 : 0), 0, 3), THREE.MathUtils.clamp(c + (dir === "r" ? 1 : dir === "l" ? -1 : 0), 0, 2)];
      this.machine.highlightKey(this.cursor);
    }
    if (f.pressed.hop) this.pressKey(KEYS[this.cursor[0]][this.cursor[1]]);
  }
  /** A key on the machine: digits build the code, C clears, OK pays for what is chosen. */
  pressKey(label: string) {
    const at = this.machine.keyPoint(...this.cursor);
    this.press = 0.2;
    this.machine.highlightKey(this.cursor, true);
    this.hooks.sound("key", at);
    if (label === "C") { this.code = ""; this.slot = null; this.idle("SELECT ITEM", "CLEARED"); return; }
    if (label === "OK") {
      if (this.slot) this.startPaying();
      else { this.hooks.sound("error", at); this.say("KEY A CODE", "E.G. 23"); }
      return;
    }
    this.code = (this.slot ? "" : this.code) + label;
    this.slot = null;
    if (this.code.length < 2) { this.machine.setDisplay("CODE " + this.code + "_", ""); this.machine.setReader("idle"); return; }
    const slot = vendSlot(this.code);
    this.code = "";
    if (!slot) { this.hooks.sound("error", at); this.machine.setReader("idle"); this.say("INVALID CODE", "TRY AGAIN"); return; }
    this.slot = slot;
    this.notice = 0;
    this.showSlot();
  }
  private startPaying() {
    if (!this.slot) return;
    if (!this.hooks.canReceive()) { this.hooks.sound("error", this.machine.readerPoint()); this.say("POCKETS FULL", "MAKE SOME ROOM"); return; }
    this.result = null;
    this.asked = false;
    this.machine.highlightKey(null);
    this.hooks.phoneScreen("pay", this.slot);
    this.to("paying");
  }
  private paying() {
    // Out to the reader, then its four lights come on in turn while the payment goes through.
    if (this.tapRaise < 1) return;
    if (!this.asked) {
      this.asked = true;
      this.time = 0;
      void this.hooks.pay(this.slot!.price).then((r) => { this.result = r; }, () => { this.result = "The payment could not be completed."; });
    }
    const lights = Math.min(4, Math.floor(this.time / 0.15) + 1);
    this.machine.setReader("reading", lights);
    if (this.time >= 0.6 && this.result !== null) {
      const ok = this.result === "ok";
      this.machine.setReader(ok ? "approved" : "declined");
      this.machine.setDisplay(ok ? "APPROVED" : "TRANSACTION", ok ? "THANK YOU" : "DECLINED");
      this.hooks.sound(ok ? "approved" : "declined", this.machine.readerPoint());
      this.hooks.phoneScreen(ok ? "approved" : "declined", this.slot);
      this.to("result");
    }
  }
  private showResult() {
    const ok = this.result === "ok";
    if (this.time < (ok ? 1.0 : 1.3) || this.tapRaise > 0) return;
    this.hooks.phoneScreen(null, null);
    const slot = this.slot!;
    if (!ok) {
      this.slot = null;
      this.to("keypad");
      this.idle("SELECT ITEM", "ADD FUNDS?");
      this.hooks.declined(slot, this.result ?? "");
      return;
    }
    this.machine.setDisplay("VENDING", `${slot.code} ${slot.flavor.toUpperCase()}`);
    this.machine.setReader("idle");
    this.machine.vend(slot);
    this.hooks.sound("motor", this.machine.world(V(slotX(slot.col), trayTop(slot.row), 0)));
    this.to("vending");
  }
  private taking() {
    // The flap swings in, the product comes out to the hand, the flap falls shut.
    this.machine.setFlap(Math.min(1, this.time / 0.2) * (1 - THREE.MathUtils.smoothstep(this.time, 0.55, 0.8)));
    if (this.time >= 0.3) { const slot = this.machine.takeDrop(); if (slot) this.hooks.receive(slot); }
    if (this.time < 0.85) return;
    this.machine.setFlap(0);
    this.slot = null;
    if (this.leaving) { this.end(); return; }
    this.to("keypad");
    this.idle("ENJOY!", "SELECT ANOTHER");
    this.notice = 1.5;
  }
  /** Walks away: the machine goes back to its idle display. */
  end() {
    if (this.finished) return;
    this.finished = true;
    this.machine.highlightKey(null);
    this.machine.setFlap(0);
    const slot = this.machine.takeDrop();
    if (slot) this.hooks.receive(slot);
    this.machine.setDisplay("REFRESH", "ICE COLD DRINKS & SNACKS");
    this.machine.setReader("idle");
    this.hooks.phoneScreen(null, null);
  }

  /**
   * The camera over the rider's left shoulder, the glass and column in view,
   * dropping to the bin while the product is taken.
   */
  frame(cam: THREE.PerspectiveCamera, dt: number) {
    const low = this.phase === "collect" || this.phase === "taking" || (this.phase === "vending" && this.machine.dropState === "falling");
    const pos = this.machine.world(low ? V(-0.55, 1.2, 1.55) : V(-0.72, 1.52, 1.62));
    const look = this.machine.world(low ? V(0.02, 0.62, 0.3) : V(0.04, 1.1, 0.3));
    if (!this.view.ready) { this.view.pos.copy(cam.position); this.view.look.copy(cam.getWorldDirection(V()).multiplyScalar(2).add(cam.position)); this.view.ready = true; }
    const k = 1 - Math.exp(-5 * dt);
    this.view.pos.lerp(pos, k);
    this.view.look.lerp(look, k);
    cam.position.copy(this.view.pos);
    cam.lookAt(this.view.look);
  }

  /**
   * The rider's arms: the right hand at the keypad (pressing in on a key), the
   * phone flat to the reader in the phone hand. Returns the phone's hold for
   * PhoneRig.pose, in rider space, while it is out.
   */
  pose(rider: { rider: THREE.Object3D }, arm: (hand: 0 | 1, wrist: THREE.Vector3, rotation: THREE.Quaternion, weight: number) => void) {
    const group = rider.rider;
    group.updateWorldMatrix(true, false);
    const local = (p: THREE.Vector3) => group.worldToLocal(p.clone());
    if (this.reach > 0) {
      // Hovering just off the key, pressed in while a key goes down.
      const tip = local(this.at()), inward = this.press > 0 ? Math.sin((this.press / 0.2) * Math.PI) : 0;
      tip.z -= 0.05 * (1 - inward) - 0.004;
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.25, 0));
      const wrist = tip.sub(FINGERTIP.clone().applyQuaternion(rotation));
      arm(0, wrist, rotation, THREE.MathUtils.smoothstep(this.reach, 0, 1));
    }
    // The other hand hangs relaxed at the side.
    arm(1, V(0.2, 0.84, 0.05), RELAXED, 1);
    if (this.tapRaise <= 0) return null;
    // Back of the phone to the reader, screen toward the rider, upright.
    const at = local(this.machine.readerPoint().addScaledVector(this.machine.facing, 0.012));
    return { at, rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI) };
  }
}
