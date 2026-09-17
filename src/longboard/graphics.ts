import * as THREE from "three";
// Sometimes Summer surface artwork, painted procedurally so every texture is
// reproducible from source. The identity is original: a script wordmark and a
// half sun rising over three road lines. No reference logo or product mark is
// copied, and no founding date or place name is printed.

const W = 256,
  H = 1024;

function canvas(width = W, height = H) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}

function texture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let seed = 1;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/** Half sun over three horizontal road lines: the brand mark. */
export function brandMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, Math.PI, 0);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i + 1) * (Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * size * 0.52, cy + Math.sin(a) * size * 0.52);
    ctx.lineTo(cx + Math.cos(a) * size * 0.64, cy + Math.sin(a) * size * 0.64);
    ctx.stroke();
  }
  for (const [y, w] of [
    [0.1, 1],
    [0.22, 0.72],
    [0.34, 0.44],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.6 * w, cy + size * y);
    ctx.lineTo(cx + size * 0.6 * w, cy + size * y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Two-line script wordmark, drawn along the deck's long axis. */
export function wordmark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  vertical = true,
) {
  ctx.save();
  ctx.translate(cx, cy);
  if (vertical) ctx.rotate(-Math.PI / 2);
  ctx.rotate(-0.12);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
  ctx.fillText("Sometimes", -size * 0.35, -size * 0.45);
  ctx.fillText("Summer", size * 0.45, size * 0.5);
  ctx.lineWidth = size * 0.06;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, size * 1.08);
  ctx.quadraticCurveTo(size * 0.6, size * 0.98, size * 1.5, size * 0.9);
  ctx.stroke();
  ctx.restore();
}

function woodGrain(ctx: CanvasRenderingContext2D, base: string, dark: string, width = W, height = H) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  seed = 91;
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = dark;
  for (let i = 0; i < 70; i++) {
    const x = random() * width;
    ctx.lineWidth = 0.6 + random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= height; y += 32)
      ctx.lineTo(x + Math.sin(y * 0.011 + i) * 4 + (random() - 0.5) * 2, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Winding road rising up the deck toward the horizon. */
function road(ctx: CanvasRenderingContext2D, fill: string, edge: string, top: number, bottom: number) {
  const span = bottom - top;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(W * 0.46, bottom);
    ctx.bezierCurveTo(W * 0.92, bottom - span * 0.3, W * 0.08, bottom - span * 0.6, W * 0.56, top + span * 0.28);
    ctx.bezierCurveTo(W * 0.74, top + span * 0.14, W * 0.5, top + span * 0.05, W * 0.52, top);
  };
  // Drawn in bands that narrow toward the horizon for a sense of distance.
  ctx.lineCap = "round";
  for (const [color, width] of [
    [edge, 50],
    [fill, 40],
  ] as const) {
    ctx.strokeStyle = color;
    for (let band = 0; band < 3; band++) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top + (span * band) / 3, W, span / 3 + 2);
      ctx.clip();
      ctx.lineWidth = width * (0.45 + band * 0.28);
      path();
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.setLineDash([14, 16]);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 3;
  path();
  ctx.stroke();
  ctx.setLineDash([]);
}

function stripedSun(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, background: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = background;
  for (let i = 0; i < 4; i++) ctx.fillRect(cx - r, cy + r * (0.15 + i * 0.22), r * 2, r * (0.05 + i * 0.02));
}

function ridge(ctx: CanvasRenderingContext2D, base: number, color: string, peaks: number[][]) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, base);
  for (const [x, y] of peaks) ctx.lineTo(x * W, y);
  ctx.lineTo(W, base);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
}

function pines(ctx: CanvasRenderingContext2D, y: number, color: string, count: number) {
  ctx.fillStyle = color;
  seed = 7;
  for (let i = 0; i < count; i++) {
    const x = (i + random() * 0.6) * (W / count),
      h = 40 + random() * 55;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x - h * 0.22, y);
    ctx.lineTo(x + h * 0.22, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(0, y, W, 40);
}

function palm(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, lean: number, color: string) {
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = height * 0.035;
  const top = { x: x + lean, y: y - height };
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean * 0.2, y - height * 0.6, top.x, top.y);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 1.1;
    const len = height * (0.34 + (i % 2) * 0.08);
    ctx.lineWidth = height * 0.018;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(
      top.x + Math.cos(a) * len * 0.55,
      top.y + Math.sin(a) * len * 0.55 - height * 0.05,
      top.x + Math.cos(a) * len,
      top.y + Math.sin(a) * len + height * 0.12,
    );
    ctx.stroke();
  }
}

/**
 * Underside graphic for a deck variant. Canvas u runs across the deck width
 * (rail to rail) and v runs nose (top) to tail (bottom).
 */
export function deckGraphic(variant: string) {
  const { c, ctx } = canvas();
  if (variant === "horizon") {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#27414f");
    g.addColorStop(1, "#162630");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    stripedSun(ctx, W * 0.5, 250, 78, "#9dc5cf", "#27414f");
    ridge(ctx, 420, "#304e5c", [[0, 360], [0.22, 290], [0.4, 350], [0.62, 250], [0.86, 330], [1, 300]]);
    ridge(ctx, 470, "#1f3541", [[0, 430], [0.3, 380], [0.55, 440], [0.8, 370], [1, 420]]);
    road(ctx, "#e9dcc0", "#162630", 420, 610);
    pines(ctx, 540, "#13232c", 9);
    wordmark(ctx, W * 0.5, 715, 38, "#efe4c9");
  } else if (variant === "palms") {
    ctx.fillStyle = "#15191b";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#3f9a95";
    ctx.beginPath();
    ctx.arc(W * 0.62, 330, 92, 0, Math.PI * 2);
    ctx.fill();
    palm(ctx, W * 0.26, 590, 420, 40, "#eadfc6");
    palm(ctx, W * 0.72, 570, 290, -30, "#d9ceb4");
    ctx.fillStyle = "#eadfc6";
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 12; i++) ctx.fillRect(0, 575 + i * 5, W * (0.4 + (i % 5) * 0.12), 2);
    ctx.globalAlpha = 1;
    wordmark(ctx, W * 0.5, 715, 38, "#efe4c9");
  } else if (variant === "ridgeline") {
    woodGrain(ctx, "#d6a66b", "#7a5230");
    stripedSun(ctx, W * 0.52, 240, 82, "#d85a38", "#d6a66b");
    ridge(ctx, 460, "#6c4430", [[0, 420], [0.2, 330], [0.36, 380], [0.58, 300], [0.78, 370], [1, 340]]);
    road(ctx, "#ecdcbd", "#4b2f22", 440, 610);
    wordmark(ctx, W * 0.5, 715, 38, "#ecdcbd");
  } else {
    // Classic: natural bamboo underside with a restrained mark.
    woodGrain(ctx, "#c99b63", "#8a6038");
    brandMark(ctx, W * 0.5, 420, 90, "#6e4a2a");
    wordmark(ctx, W * 0.5, 610, 44, "#5b3c22");
  }
  return texture(c);
}

/** Black coarse grip; Classic carries its wordmark in the grip itself. */
export function gripTexture(variant: string, color = 0x1b1d1e) {
  const { c, ctx } = canvas(256, 1024);
  ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
  ctx.fillRect(0, 0, 256, 1024);
  seed = 314;
  for (let i = 0; i < 9000; i++) {
    // Grit: lighter and darker specks around the sheet's own colour.
    const v = random() < 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.08 + random() * 0.12})`;
    ctx.fillRect(random() * 256, random() * 1024, 1.4, 1.4);
  }
  if (variant === "classic") {
    ctx.globalAlpha = 0.85;
    brandMark(ctx, 128, 470, 70, "#d8c49b");
    wordmark(ctx, 128, 600, 38, "#d8c49b");
    ctx.globalAlpha = 1;
  }
  return texture(c);
}

/** Height map for the grip's grit, shared by every variant. */
export function gripBump() {
  const { c, ctx } = canvas(128, 128);
  seed = 55;
  const data = ctx.createImageData(128, 128);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 90 + random() * 165;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const t = texture(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 16);
  return t;
}

/** Nine visible plies for the laminated deck edge. */
export function laminateTexture() {
  const { c, ctx } = canvas(8, 64);
  const plies = ["#b98a55", "#d7b184", "#a8784a", "#d9b688", "#b28150", "#dcb98c", "#a9794b", "#d4ae80", "#b88955"];
  plies.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * (64 / plies.length), 8, 64 / plies.length);
  });
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}
