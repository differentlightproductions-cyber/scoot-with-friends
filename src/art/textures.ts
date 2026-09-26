// Procedural texture painting for the outdoor art kit. Everything is drawn on
// canvases at load (no downloaded images), cached per kind, and shared by
// every map that uses it.
import * as THREE from "three";
import { mulberry, Noise2 } from "./noise";

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, ctx: c.getContext("2d")! };
}
function finish(c: HTMLCanvasElement, color = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** Tiling fill: draws a shape at x/y and its wrapped copies so the tile seams vanish. */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    const px = x + dx, py = y + dy;
    if (px + r < 0 || py + r < 0 || px - r > size || py - r > size) continue;
    draw(px, py);
  }
}

/**
 * Mojave desert pavement: fine tan sand packed with pebbles of desert-varnished
 * basalt, rust and pale quartz, each with a soft contact shadow. Returns the
 * colour map and a matching height map (pebbles raised) for bump shading.
 */
export function desertGround() {
  const hit = cache.get("desert");
  if (hit) return { map: hit, bump: cache.get("desert-bump")! };
  const size = 512, { c, ctx } = canvas(size), bump = canvas(size);
  const random = mulberry(611), noise = new Noise2(612);
  const img = ctx.createImageData(size, size), hImg = bump.ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Periodic noise (sampled on a torus) so the tile repeats without seams.
      const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
      const n = noise.fbm(Math.cos(a) * 1.3 + Math.sin(b) * 0.4, Math.sin(a) * 1.3 + Math.cos(b) * 1.3, 4) * 0.5 + noise.simplex(Math.cos(a) * 9, Math.sin(b) * 9) * 0.25;
      const grain = (random() - 0.5) * 0.16;
      const i = (y * size + x) * 4;
      const t = 1 + n * 0.12 + grain;
      img.data[i] = 196 * t; img.data[i + 1] = 166 * t; img.data[i + 2] = 124 * t; img.data[i + 3] = 255;
      const hh = 90 + grain * 180;
      hImg.data[i] = hImg.data[i + 1] = hImg.data[i + 2] = hh; hImg.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  bump.ctx.putImageData(hImg, 0, 0);
  const tones = [[124, 102, 84], [138, 112, 90], [150, 118, 90], [160, 130, 100], [176, 158, 134], [192, 178, 158], [140, 130, 118], [120, 110, 100]];
  for (let k = 0; k < 4200; k++) {
    const x = random() * size, y = random() * size;
    const r = 0.6 + Math.pow(random(), 3.5) * 4.2, stretch = 0.55 + random() * 0.45, angle = random() * Math.PI;
    const tone = tones[Math.floor(random() * tones.length)], light = 0.85 + random() * 0.3;
    wrapped(size, x, y, r + 2, (px, py) => {
      ctx.fillStyle = "rgba(60,44,30,.2)";
      ctx.beginPath(); ctx.ellipse(px + r * 0.25, py + r * 0.3, r * 1.05, r * stretch * 1.05, angle, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.35, r * 0.1, px, py, r);
      g.addColorStop(0, `rgb(${tone[0] * light * 1.25},${tone[1] * light * 1.25},${tone[2] * light * 1.25})`);
      g.addColorStop(1, `rgb(${tone[0] * light * 0.8},${tone[1] * light * 0.8},${tone[2] * light * 0.8})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(px, py, r, r * stretch, angle, 0, Math.PI * 2); ctx.fill();
      const hg = bump.ctx.createRadialGradient(px, py, 0, px, py, r);
      hg.addColorStop(0, "rgb(235,235,235)"); hg.addColorStop(1, "rgb(120,120,120)");
      bump.ctx.fillStyle = hg;
      bump.ctx.beginPath(); bump.ctx.ellipse(px, py, r, r * stretch, angle, 0, Math.PI * 2); bump.ctx.fill();
    });
  }
  const map = finish(c), height = finish(bump.c, false);
  cache.set("desert", map); cache.set("desert-bump", height);
  return { map, bump: height };
}

/**
 * Distant scrub: the dark dots of creosote and bursage (with their shadows)
 * and pale wash lines that make far desert read as ground from a distance.
 * Tiles every 96 m in world space.
 */
export function scrubTexture() {
  const hit = cache.get("scrub");
  if (hit) return hit;
  const size = 512, { c, ctx } = canvas(size), random = mulberry(913);
  ctx.fillStyle = "rgb(255,255,255)"; ctx.fillRect(0, 0, size, size);
  // Pale braided washes.
  ctx.strokeStyle = "rgba(255,248,236,.9)"; ctx.lineCap = "round";
  for (let k = 0; k < 6; k++) {
    let x = random() * size, y = 0, w = 3 + random() * 6;
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y);
    while (y < size) { x += (random() - 0.5) * 30; y += 20 + random() * 20; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let k = 0; k < 2400; k++) {
    const x = random() * size, y = random() * size, r = 0.8 + random() * 2.4;
    const dark = random() < 0.8;
    wrapped(size, x, y, r + 2, (px, py) => {
      ctx.fillStyle = "rgba(70,62,50,.5)";
      ctx.beginPath(); ctx.ellipse(px + r * 0.5, py + r * 0.4, r * 1.2, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark ? "rgba(88,96,58,.95)" : "rgba(150,150,125,.9)";
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    });
  }
  const t = finish(c);
  cache.set("scrub", t);
  return t;
}

/**
 * Landscape rock: the crushed granite and river rock laid around Boulder City
 * lawns instead of grass, grey, rust and pale stones packed edge to edge.
 * Averages mid grey, so it modulates the ground colour as detail (x2).
 */
export function gravelTexture() {
  const hit = cache.get("gravel");
  if (hit) return hit;
  const size = 512, { c, ctx } = canvas(size), random = mulberry(1207);
  ctx.fillStyle = "rgb(112,106,98)"; ctx.fillRect(0, 0, size, size);
  const tones = [[150, 140, 128], [128, 118, 108], [170, 160, 148], [118, 92, 74], [96, 90, 86], [190, 184, 174], [140, 112, 88]];
  for (let k = 0; k < 2600; k++) {
    const x = random() * size, y = random() * size, r = 3 + Math.pow(random(), 2) * 9, stretch = 0.6 + random() * 0.4, angle = random() * Math.PI;
    const tone = tones[Math.floor(random() * tones.length)], light = 0.85 + random() * 0.3;
    wrapped(size, x, y, r + 3, (px, py) => {
      ctx.fillStyle = "rgba(40,34,28,.45)";
      ctx.beginPath(); ctx.ellipse(px + r * 0.3, py + r * 0.35, r * 1.08, r * stretch * 1.08, angle, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(px - r * 0.35, py - r * 0.4, r * 0.1, px, py, r);
      g.addColorStop(0, `rgb(${tone[0] * light * 1.2},${tone[1] * light * 1.2},${tone[2] * light * 1.2})`);
      g.addColorStop(1, `rgb(${tone[0] * light * 0.75},${tone[1] * light * 0.75},${tone[2] * light * 0.75})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(px, py, r, r * stretch, angle, 0, Math.PI * 2); ctx.fill();
    });
  }
  const t = finish(c);
  cache.set("gravel", t);
  return t;
}

/**
 * Sun-bleached residential asphalt: grey binder packed with pale and dark
 * aggregate, gently faded. Tiles every few metres, so it carries no cracks or
 * stains (any one would repeat with the tile): those are laid sparsely on each
 * road as marks of their own (road-marks.ts).
 */
export function asphaltTexture() {
  const hit = cache.get("asphalt");
  if (hit) return hit;
  const size = 512, { c, ctx } = canvas(size), random = mulberry(4401), noise = new Noise2(4402);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
      const n = noise.fbm(Math.cos(a) * 1.5 + Math.sin(b) * 0.3, Math.sin(a) * 1.5 + Math.cos(b) * 1.5, 4);
      const grain = random();
      // Aggregate: most pixels binder, some pale quartz, some dark basalt.
      const t = grain > 0.93 ? 1.45 + random() * 0.3 : grain < 0.08 ? 0.62 : 1 + (random() - 0.5) * 0.12;
      const shade = (1 + n * 0.1) * t;
      const i = (y * size + x) * 4;
      img.data[i] = 96 * shade; img.data[i + 1] = 96 * shade; img.data[i + 2] = 94 * shade; img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = finish(c);
  cache.set("asphalt", t);
  return t;
}

/** Weathered volcanic rock: dark varnish over rust and tan, cracked and speckled. */
export function rockTexture() {
  const hit = cache.get("rock");
  if (hit) return hit;
  const size = 256, { c, ctx } = canvas(size), noise = new Noise2(77), random = mulberry(78);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
      const n = noise.fbm(Math.cos(a) * 2 + Math.sin(b), Math.sin(a) * 2 + Math.cos(b) * 2, 5);
      const vein = Math.abs(noise.simplex(Math.cos(a) * 5 + 3, Math.sin(b) * 5)) < 0.05 ? 0.7 : 1;
      const t = (0.9 + n * 0.25 + (random() - 0.5) * 0.12) * vein;
      const i = (y * size + x) * 4;
      img.data[i] = 236 * t; img.data[i + 1] = 230 * t; img.data[i + 2] = 222 * t; img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = finish(c);
  cache.set("rock", t);
  return t;
}

/** Leaf-cluster card with alpha: many small leaves around a twig, for shrubs. */
export function leafCard(kind: "creosote" | "bursage" | "pine" | "palm" | "palmDead" | "yucca" | "grass") {
  const hit = cache.get("leaf-" + kind);
  if (hit) return hit;
  const size = 256, { c, ctx } = canvas(size), random = mulberry(kind.length * 97 + 5);
  ctx.clearRect(0, 0, size, size);
  const leaf = (x: number, y: number, len: number, wid: number, angle: number, fill: string) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(0, -len / 2, wid, len / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  if (kind === "creosote" || kind === "bursage") {
    // Twiggy branchlets carrying tiny paired leaflets (creosote) or grey felted leaves (bursage).
    const greens = kind === "creosote" ? ["#4f5a26", "#5d6a2c", "#6b7834", "#434d20", "#77833c"] : ["#8f937a", "#a3a78b", "#7c806a", "#b1b397"];
    ctx.strokeStyle = kind === "creosote" ? "#4a3d30" : "#7a7060"; ctx.lineCap = "round";
    for (let b = 0; b < 9; b++) {
      let x = size / 2 + (random() - 0.5) * 40, y = size - 6, angle = (random() - 0.5) * 1.6;
      ctx.lineWidth = 3;
      for (let s = 0; s < 14; s++) {
        const nx = x + Math.sin(angle) * 14, ny = y - Math.cos(angle) * 14;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        x = nx; y = ny; angle += (random() - 0.5) * 0.5; ctx.lineWidth = Math.max(0.8, ctx.lineWidth * 0.88);
        if (s > 3) for (let k = 0; k < 3; k++) leaf(x + (random() - 0.5) * 12, y + (random() - 0.5) * 12, kind === "creosote" ? 7 + random() * 5 : 10 + random() * 6, kind === "creosote" ? 3 : 4.5, random() * Math.PI * 2, greens[Math.floor(random() * greens.length)]);
        if (y < 20) break;
      }
    }
  } else if (kind === "pine") {
    // A tuft of long needles fanning from a twig: Aleppo/Afghan pine.
    for (let t = 0; t < 16; t++) {
      const cx = 34 + random() * (size - 68), cy = 34 + random() * (size - 68);
      for (let k = 0; k < 90; k++) {
        const angle = random() * Math.PI * 2, len = 16 + random() * 26;
        const g = 92 + random() * 60;
        ctx.strokeStyle = `rgb(${g * 0.8},${g * 0.96},${g * 0.52})`; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len); ctx.stroke();
      }
      ctx.fillStyle = "#4e3a28"; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === "palm" || kind === "palmDead") {
    const dead = kind === "palmDead";
    // A fan palm leaf: pleated segments radiating from the hastula, split tips.
    const cx = size / 2, cy = size - 10;
    for (let k = 0; k < 44; k++) {
      const angle = -Math.PI * 0.92 + (k / 43) * Math.PI * 0.84 + (random() - 0.5) * 0.02;
      const len = 180 + random() * 50, g = 90 + (k % 2) * 25 + random() * 20;
      ctx.strokeStyle = dead ? `rgb(${g * 1.55},${g * 1.25},${g * 0.8})` : `rgb(${g * 0.62},${g},${g * 0.48})`; ctx.lineWidth = 7 - (k % 2) * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * len * 0.8, cy + Math.sin(angle) * len * 0.8); ctx.stroke();
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * len * 0.78, cy + Math.sin(angle) * len * 0.78);
      ctx.lineTo(cx + Math.cos(angle + 0.03) * len, cy + Math.sin(angle + 0.03) * len + 12); ctx.stroke();
    }
  } else if (kind === "yucca") {
    for (let k = 0; k < 40; k++) {
      const angle = -Math.PI / 2 + (random() - 0.5) * 2.6, len = 90 + random() * 110;
      leaf(size / 2, size - 8, len, 5, angle + Math.PI / 2, `rgb(${70 + random() * 30},${100 + random() * 30},${70 + random() * 20})`);
    }
  } else {
    // Bunch grass (big galleta / three-awn): straw blades, a little green at the base.
    for (let k = 0; k < 120; k++) {
      const x = size / 2 + (random() - 0.5) * 90, lean = (random() - 0.5) * 1.2, len = 120 + random() * 120;
      const dry = random();
      ctx.strokeStyle = dry > 0.3 ? `rgb(${190 + random() * 40},${165 + random() * 30},${110 + random() * 30})` : `rgb(${120},${140},${80})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, size); ctx.quadraticCurveTo(x + lean * len * 0.3, size - len * 0.6, x + lean * len * 0.8, size - len); ctx.stroke();
    }
  }
  const t = finish(c, true, false);
  cache.set("leaf-" + kind, t);
  return t;
}

/** Bark: pine plates (deep fissures between grey-brown plates) or a palm's ringed trunk. */
export function barkTexture(kind: "pine" | "palm" | "twig") {
  const hit = cache.get("bark-" + kind);
  if (hit) return hit;
  const w = 128, h = 256, { c, ctx } = canvas(w, h), random = mulberry(kind.length * 31 + 2);
  if (kind === "palm") {
    ctx.fillStyle = "#7a6a58"; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 9 + random() * 5) {
      ctx.fillStyle = `rgba(${60 + random() * 30},${48 + random() * 20},${38 + random() * 15},.8)`;
      ctx.fillRect(0, y, w, 3 + random() * 2);
      ctx.fillStyle = "rgba(200,185,160,.25)"; ctx.fillRect(0, y + 4, w, 1);
    }
    for (let k = 0; k < 400; k++) { ctx.fillStyle = `rgba(${random() < 0.5 ? "40,30,20" : "190,175,150"},.15)`; ctx.fillRect(random() * w, random() * h, 1 + random() * 3, 1); }
  } else {
    ctx.fillStyle = kind === "pine" ? "#5a4a3e" : "#6b5a4a"; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 170; k++) {
      const x = random() * w, y = random() * h, pw = 7 + random() * 14, ph = 14 + random() * 30;
      const v = 90 + random() * 50;
      wrapped(w, x, y, ph, (px, py) => {
        ctx.fillStyle = `rgb(${v * 1.08},${v * 0.82},${v * 0.66})`;
        ctx.beginPath(); ctx.roundRect(px - pw / 2, py - ph / 2, pw, ph, 4); ctx.fill();
        ctx.strokeStyle = "rgba(30,22,16,.55)"; ctx.lineWidth = 2; ctx.stroke();
      });
    }
  }
  const t = finish(c);
  cache.set("bark-" + kind, t);
  return t;
}
