import * as THREE from 'three';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES, swatchHex, type AvatarConfig } from './config';

/**
 * Paints a rider's face features onto a transparent canvas that is laid over
 * the front of the head (docs/AVATAR-DESIGN.md §6). The canvas covers a square
 * FACE_SPAN metres across, centred on the head centre, projected straight
 * along +z. New styles are drawing functions, not meshes.
 */
export const FACE_SIZE = 512;
/** Metres of head the canvas spans (at the standard head size). */
export const FACE_SPAN = 0.41;
const PX = FACE_SIZE / FACE_SPAN;
/** Metres to canvas pixels, from the head centre (canvas y grows downward). */
export const faceX = (x: number) => FACE_SIZE / 2 + x * PX;
export const faceY = (y: number) => FACE_SIZE / 2 - y * PX;

const css = (hex: number, alpha = 1) => `rgba(${hex >> 16 & 255},${hex >> 8 & 255},${hex & 255},${alpha})`;
const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();

/** Face feature layout in metres from the head centre (+y up), shared with 3D parts such as glasses and the nose. */
export function faceLayout(c: AvatarConfig) {
  return {
    eyeX: 0.066 + c.eyeSpacing * 0.0055,
    eyeY: 0.006 + c.eyeY * 0.0065,
    eyeScale: 1.2 + c.eyeSize * 0.1,
    browX: 0.069 + c.eyeSpacing * 0.0055 + c.browSpacing * 0.005,
    browY: 0.07 + c.eyeY * 0.0065 + c.browY * 0.006,
    noseY: -0.03 + c.noseY * 0.006,
    mouthY: -0.078 + c.mouthY * 0.006,
    mouthScale: 1.12 + c.mouthSize * 0.13,
  };
}

type Ctx = CanvasRenderingContext2D;

function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, rotation = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rotation, 0, Math.PI * 2);
}

/** One eye, `side` -1 for the rider's right (canvas left), +1 for their left. */
function drawEye(g: Ctx, c: AvatarConfig, x: number, y: number, s: number, side: number, closed: boolean) {
  const ink = '#1f1715', iris = swatchHex(EYE_COLORS, c.eyeColor), outward = -side; // canvas: outward from the face centre
  g.save();
  g.translate(x, y);
  g.scale(outward, 1); // draw as if for the canvas-right eye; mirrored for the other
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (closed) {
    // A soft closed lid; cheerful and sleepy styles close the same way.
    g.strokeStyle = ink;
    g.lineWidth = 5 * s;
    g.beginPath();
    g.moveTo(-20 * s, 0);
    g.quadraticCurveTo(0, 9 * s, 20 * s, 0);
    g.stroke();
    drawLashes(g, c.lashStyle, s, true);
    g.restore();
    return;
  }
  const style = c.eyeStyle;
  if (style === 'dot') {
    g.fillStyle = ink;
    ellipse(g, 0, 0, 9 * s, 13 * s);
    g.fill();
    g.fillStyle = '#ffffff';
    ellipse(g, -3 * s, -5 * s, 3 * s, 3.4 * s);
    g.fill();
    drawLashes(g, c.lashStyle, s * 0.7, false);
    g.restore();
    return;
  }
  // White of the eye: each style is a shape.
  const w = { round: 21, relaxed: 22, narrow: 24, cheerful: 22, sleepy: 22, wide: 25, angled: 23, oval: 17, sparkle: 23 }[style] ?? 21;
  const h = { round: 24, relaxed: 18, narrow: 12, cheerful: 20, sleepy: 20, wide: 29, angled: 16, oval: 26, sparkle: 26 }[style] ?? 24;
  const tilt = style === 'angled' ? -0.28 : 0;
  g.save();
  g.beginPath();
  if (style === 'cheerful') {
    // Lower lid pushed up into a smile.
    g.moveTo(-w * s, 2 * s);
    g.bezierCurveTo(-w * s, -h * 1.3 * s, w * s, -h * 1.3 * s, w * s, 2 * s);
    g.quadraticCurveTo(0, -h * 0.45 * s, -w * s, 2 * s);
  } else g.ellipse(0, 0, w * s, h * s, tilt, 0, Math.PI * 2);
  g.closePath();
  g.fillStyle = '#fbfaf6';
  g.fill();
  g.clip();
  // Iris, pupil and highlights, looking very slightly inward (friendly focus).
  const ir = Math.min(w, h) * (style === 'oval' || style === 'sparkle' ? 0.95 : 0.78) * s, ix = 2.5 * s, iy = style === 'cheerful' ? -h * 0.35 * s : 1 * s;
  g.fillStyle = css(iris);
  ellipse(g, ix, iy, ir, ir * 1.06);
  g.fill();
  g.fillStyle = css(shade(iris, 0.55));
  ellipse(g, ix, iy + ir * 0.35, ir * 0.9, ir * 0.55);
  g.globalAlpha = 0.35;
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#120d0c';
  ellipse(g, ix, iy, ir * 0.48, ir * 0.52);
  g.fill();
  g.fillStyle = '#ffffff';
  ellipse(g, ix - ir * 0.38, iy - ir * 0.42, ir * 0.24, ir * 0.24);
  g.fill();
  if (style === 'sparkle') {
    ellipse(g, ix + ir * 0.35, iy + ir * 0.35, ir * 0.12, ir * 0.12);
    g.fill();
  }
  // Upper lid for relaxed and sleepy styles.
  if (style === 'relaxed' || style === 'sleepy') {
    const skin = swatchHex(SKIN_TONES, c.skinTone);
    g.fillStyle = css(shade(skin, 0.97));
    g.fillRect(-w * s - 2, -h * s - 2, w * 2 * s + 4, (style === 'sleepy' ? h * 0.95 : h * 0.5) * s + 2);
  }
  g.restore();
  // Lash line: a thick, readable upper outline.
  g.strokeStyle = ink;
  g.lineWidth = 4.5 * s;
  g.beginPath();
  if (style === 'cheerful') {
    g.moveTo(-w * s, 2 * s);
    g.bezierCurveTo(-w * s, -h * 1.3 * s, w * s, -h * 1.3 * s, w * s, 2 * s);
  } else if (style === 'relaxed' || style === 'sleepy') {
    const top = style === 'sleepy' ? -h * 0.05 : -h * 0.5;
    g.moveTo(-w * s, top * s + 2 * s);
    g.quadraticCurveTo(0, top * s - 2 * s, w * s, top * s + 2 * s);
  } else g.ellipse(0, 0, w * s, h * s, tilt, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
  g.lineWidth = 1.6 * s;
  g.strokeStyle = 'rgba(40,28,24,.35)';
  g.beginPath();
  if (style !== 'cheerful') g.ellipse(0, 0, w * s, h * s, tilt, Math.PI * 0.1, Math.PI * 0.9);
  g.stroke();
  g.translate(0, style === 'relaxed' ? -h * 0.5 * s + h * s : style === 'sleepy' ? -h * 0.05 * s + h * s : 0);
  drawLashes(g, c.lashStyle, s, false, w, h);
  g.restore();
}

function drawLashes(g: Ctx, style: string, s: number, closed: boolean, w = 21, h = 24) {
  if (style === 'none') return;
  const count = { short: 2, medium: 3, long: 3, outer: 2, thick: 3 }[style] ?? 2;
  const length = { short: 6, medium: 9, long: 13, outer: 11, thick: 10 }[style] ?? 8;
  g.strokeStyle = '#1f1715';
  g.lineWidth = (style === 'thick' ? 4.5 : 3) * s;
  for (let i = 0; i < count; i++) {
    // Along the outer part of the upper lid (canvas +x is outward here).
    const t = style === 'outer' ? 0.82 + i * 0.1 : 0.55 + i * 0.18;
    const a = Math.PI * (1 + t * 0.5 + 0.5);
    const px = closed ? (0.4 + i * 0.3) * 20 * s : Math.cos(a) * w * s, py = closed ? (i * 1.5) * s : Math.sin(a) * h * s;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + length * 0.7 * s, py - length * s * (closed ? 0.25 : 0.75));
    g.stroke();
  }
}

function drawBrow(g: Ctx, c: AvatarConfig, x: number, y: number, side: number) {
  const outward = -side, color = css(swatchHex(HAIR_COLORS, c.browColor)), style = c.browStyle;
  g.save();
  g.translate(x, y);
  g.scale(outward, 1);
  g.rotate(c.browAngle * -0.07);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = 'round';
  const band = (pts: [number, number][], thickness: number[]) => {
    // A tapered stroke: top edge forward, bottom edge back.
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py - thickness[i] / 2) : g.moveTo(px, py - thickness[i] / 2)));
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1] + thickness[i] / 2);
    g.closePath();
    g.fill();
  };
  switch (style) {
    case 'straight': band([[-24, 0], [0, -1], [24, 0]], [9, 10, 8]); break;
    case 'curved': band([[-24, 3], [-4, -5], [24, 1]], [8, 10, 6]); break;
    case 'thick': band([[-26, 1], [0, -2], [26, 1]], [15, 17, 12]); break;
    case 'thin': band([[-24, 2], [0, -4], [24, 1]], [4, 5, 3]); break;
    case 'raised': band([[-22, 2], [-2, -10], [22, -2]], [8, 9, 6]); break;
    case 'angled': band([[-24, 6], [0, -1], [24, -6]], [9, 10, 8]); break;
    case 'soft': g.globalAlpha = 0.85; band([[-20, 1], [0, -3], [20, 0]], [11, 12, 10]); break;
    case 'dramatic': band([[-26, 6], [6, -8], [26, 0]], [10, 14, 6]); break;
    case 'arched': band([[-24, 4], [4, -9], [24, 3]], [7, 9, 5]); break;
    default: band([[-14, 0], [0, -1], [14, 0]], [10, 11, 10]);
  }
  g.restore();
}

function drawNose(g: Ctx, c: AvatarConfig, x: number, y: number) {
  const skin = swatchHex(SKIN_TONES, c.skinTone), ink = css(shade(skin, 0.62)), soft = css(shade(skin, 0.8), 0.9);
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  g.strokeStyle = ink;
  g.fillStyle = soft;
  g.lineWidth = 3.4;
  switch (c.noseStyle) {
    case 'tiny': ellipse(g, 0, 4, 7, 5); g.fill(); break;
    case 'line': g.beginPath(); g.moveTo(1, -12); g.quadraticCurveTo(7, 3, -3, 7); g.stroke(); break;
    case 'triangle': g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(12, 8, 0, 9); g.quadraticCurveTo(-12, 8, 0, -10); g.fill(); break;
    case 'button': g.fillStyle = ink; ellipse(g, -5, 5, 2.8, 2.2); g.fill(); ellipse(g, 5, 5, 2.8, 2.2); g.fill(); break;
    case 'bridge': g.beginPath(); g.moveTo(-2, -26); g.quadraticCurveTo(4, -4, 7, 4); g.quadraticCurveTo(0, 10, -6, 5); g.stroke(); break;
    default: g.beginPath(); g.moveTo(-1, -24); g.lineTo(6, 6); g.quadraticCurveTo(0, 12, -7, 6); g.stroke();
  }
  g.restore();
}

function drawMouth(g: Ctx, c: AvatarConfig, x: number, y: number, s: number) {
  const ink = '#4a2320', inside = '#6b2428', tongue = '#e0707a';
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = ink;
  g.lineWidth = 4.2;
  const open = (top: number, bottom: number, width: number, teeth = false, tongueOut = false) => {
    g.beginPath();
    g.moveTo(-width, top);
    g.quadraticCurveTo(0, top + 3, width, top);
    g.quadraticCurveTo(width * 0.6, bottom, 0, bottom);
    g.quadraticCurveTo(-width * 0.6, bottom, -width, top);
    g.closePath();
    g.fillStyle = inside;
    g.fill();
    g.save();
    g.clip();
    if (teeth) {
      g.fillStyle = '#fffdf6';
      g.fillRect(-width, top - 2, width * 2, 8);
    }
    g.fillStyle = tongue;
    ellipse(g, 0, bottom + 2, width * 0.55, (bottom - top) * 0.45);
    g.fill();
    g.restore();
    g.stroke();
    if (tongueOut) {
      g.fillStyle = tongue;
      g.beginPath();
      g.moveTo(-9, bottom - 4);
      g.quadraticCurveTo(-10, bottom + 14, 0, bottom + 15);
      g.quadraticCurveTo(10, bottom + 14, 9, bottom - 4);
      g.fill();
      g.strokeStyle = css(0xb04a55);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, bottom + 1);
      g.lineTo(0, bottom + 9);
      g.stroke();
    }
  };
  switch (c.mouthStyle) {
    case 'smile': g.beginPath(); g.moveTo(-22, -4); g.quadraticCurveTo(0, 14, 22, -4); g.stroke(); break;
    case 'neutral': g.beginPath(); g.moveTo(-15, 1); g.quadraticCurveTo(0, 4, 15, 1); g.stroke(); break;
    case 'smirk': g.beginPath(); g.moveTo(-16, 3); g.quadraticCurveTo(4, 6, 20, -6); g.stroke(); break;
    case 'open-smile': open(-4, 16, 22); break;
    case 'frown': g.beginPath(); g.moveTo(-17, 6); g.quadraticCurveTo(0, -6, 17, 6); g.stroke(); break;
    case 'grin': open(-3, 12, 27, true); break;
    case 'flat': g.beginPath(); g.moveTo(-16, 0); g.lineTo(16, 0); g.stroke(); break;
    case 'surprised': g.fillStyle = inside; ellipse(g, 0, 2, 9, 11); g.fill(); g.stroke(); break;
    case 'tongue': open(-3, 9, 19, false, true); break;
    default: open(-4, 15, 24, true);
  }
  g.restore();
}

function drawFacialHair(g: Ctx, c: AvatarConfig, L: ReturnType<typeof faceLayout>) {
  if (c.facialHair === 'none') return;
  const hair = swatchHex(HAIR_COLORS, c.hairColor), color = css(hair), mouthY = faceY(L.mouthY), noseY = faceY(L.noseY);
  g.save();
  g.fillStyle = color;
  const mustache = () => {
    g.beginPath();
    g.moveTo(0, noseY + 14);
    g.bezierCurveTo(14, noseY + 8, 34, noseY + 14, 38, mouthY - 2);
    g.bezierCurveTo(24, mouthY - 10, 10, mouthY - 10, 0, mouthY - 8);
    g.bezierCurveTo(-10, mouthY - 10, -24, mouthY - 10, -38, mouthY - 2);
    g.bezierCurveTo(-34, noseY + 14, -14, noseY + 8, 0, noseY + 14);
  };
  const chin = (top: number, width: number, depth: number) => {
    g.beginPath();
    g.moveTo(-width, top);
    g.quadraticCurveTo(-width, top + depth, 0, top + depth * 1.05);
    g.quadraticCurveTo(width, top + depth, width, top);
    g.quadraticCurveTo(0, top + depth * 0.35, -width, top);
    g.fill();
  };
  const jaw = (inner: number) => {
    // From the sideburns round the jaw; the mouth area stays clear.
    g.beginPath();
    g.moveTo(-112, faceY(0.02));
    g.lineTo(-100, faceY(0.02));
    g.quadraticCurveTo(-96, mouthY - inner, -44, mouthY + 14);
    g.quadraticCurveTo(0, mouthY + 26, 44, mouthY + 14);
    g.quadraticCurveTo(96, mouthY - inner, 100, faceY(0.02));
    g.lineTo(112, faceY(0.02));
    g.quadraticCurveTo(116, faceY(-0.13), 0, faceY(-0.16));
    g.quadraticCurveTo(-116, faceY(-0.13), -112, faceY(0.02));
    g.fill();
  };
  g.translate(FACE_SIZE / 2, 0);
  switch (c.facialHair) {
    case 'mustache': mustache(); g.fill(); break;
    case 'goatee': chin(mouthY + 12, 20, 30); mustache(); g.fill(); break;
    case 'stubble': g.globalAlpha = 0.28; jaw(0); mustache(); g.fill(); break;
    case 'short-beard': g.globalAlpha = 0.92; jaw(-8); break;
    default: jaw(-8); mustache(); g.fill(); chin(mouthY + 8, 30, 40);
  }
  g.restore();
}

export type FacePart = 'eyes' | 'brows' | 'nose' | 'mouth' | 'beard';
/** Draws every feature for one configuration; `closed` draws the blink frame, `only` one feature (creator thumbnails). */
export function paintFace(canvas: HTMLCanvasElement | OffscreenCanvas, c: AvatarConfig, closed = false, only?: FacePart) {
  const g = canvas.getContext('2d') as Ctx;
  const L = faceLayout(c);
  g.clearRect(0, 0, FACE_SIZE, FACE_SIZE);
  if (only) {
    for (const side of [-1, 1]) {
      if (only === 'eyes') drawEye(g, c, faceX(side * L.eyeX), faceY(L.eyeY), L.eyeScale, side, closed);
      if (only === 'brows') drawBrow(g, c, faceX(side * L.browX), faceY(L.browY), side);
    }
    if (only === 'nose') drawNose(g, c, faceX(0), faceY(L.noseY));
    if (only === 'mouth') drawMouth(g, c, faceX(0), faceY(L.mouthY), L.mouthScale);
    if (only === 'beard') {
      drawFacialHair(g, c, L);
      drawMouth(g, c.facialHair === 'full-beard' ? { ...c, mouthStyle: c.mouthStyle === 'tongue' ? 'open-smile' : c.mouthStyle } : c, faceX(0), faceY(L.mouthY), L.mouthScale);
    }
    return;
  }
  // Soft cheeks give the face its warmth without drawn lines.
  const skin = swatchHex(SKIN_TONES, c.skinTone);
  for (const side of [-1, 1]) {
    const x = faceX(side * (L.eyeX + 0.018)), y = faceY(L.eyeY - 0.05), gradient = g.createRadialGradient(x, y, 0, x, y, 30);
    gradient.addColorStop(0, css(0xf06a6a, skin > 0x9f0000 ? 0.22 : 0.14));
    gradient.addColorStop(1, css(0xf06a6a, 0));
    g.fillStyle = gradient;
    g.fillRect(x - 32, y - 32, 64, 64);
  }
  drawFacialHair(g, c, L);
  for (const side of [-1, 1]) {
    drawEye(g, c, faceX(side * L.eyeX), faceY(L.eyeY), L.eyeScale, side, closed);
    drawBrow(g, c, faceX(side * L.browX), faceY(L.browY), side);
  }
  drawNose(g, c, faceX(0), faceY(L.noseY));
  if (c.facialHair !== 'full-beard') drawMouth(g, c, faceX(0), faceY(L.mouthY), L.mouthScale);
  else drawMouth(g, { ...c, mouthStyle: c.mouthStyle === 'tongue' ? 'open-smile' : c.mouthStyle }, faceX(0), faceY(L.mouthY + 0.004), L.mouthScale * 0.9);
}

function canvas() {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = FACE_SIZE;
    return c;
  }
  return new OffscreenCanvas(FACE_SIZE, FACE_SIZE);
}

/** Open and blink face textures for one rider. */
export function faceTextures(c: AvatarConfig) {
  const make = (closed: boolean) => {
    const surface = canvas();
    paintFace(surface, c, closed);
    const texture = new THREE.CanvasTexture(surface as HTMLCanvasElement);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  return { open: make(false), closed: make(true) };
}
