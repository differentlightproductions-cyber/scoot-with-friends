/**
 * The phone's screen is drawn on one canvas (docs/briefs/PHONE-SYSTEM.md
 * "Screen implementation"): the same canvas is the on-screen phone in third
 * person and the 3D phone's screen texture in first person, so there is one UI
 * state and one renderer. Apps describe a page as blocks; this lays them out,
 * draws them in the 2000s sticker style of the rider creator, moves focus with
 * the left stick (spatially, so grids and lists both work) and hit-tests taps.
 */
export const SCREEN_W = 360;
export const SCREEN_H = 720;
export const STATUS_H = 30;
export const NAV_H = 58;
const PAD = 16;

import {uiColors} from '../ui/palette';
export let INK = uiColors().ink;
export let PAPER = uiColors().paper;
export let LIME = uiColors().lime;
export let ORANGE = uiColors().orange;
export let TEAL = uiColors().teal;
if(typeof window!=='undefined')window.addEventListener('swf-palette-change',()=>{const c=uiColors();INK=c.ink;PAPER=c.paper;LIME=c.lime;ORANGE=c.orange;TEAL=c.teal;});
import { direction } from '../i18n';
import { t } from '../i18n';
export const DISPLAY = 'Bungee, ParkDisplay, Impact, "Arial Black", "Segoe UI", "Noto Sans Arabic", "Noto Sans Devanagari", "Microsoft YaHei", sans-serif';
export const BODY = 'system-ui, "Segoe UI", Roboto, "Noto Sans Arabic", "Noto Sans Devanagari", "Microsoft YaHei", sans-serif';

export type Action = () => void;
export type IconName = 'music' | 'emote' | 'ride' | 'rider' | 'map' | 'items' | 'build' | 'messages' | 'play' | 'pause' | 'prev' | 'next' | 'dice' | 'lock'
  | 'wave' | 'nod' | 'shake' | 'point' | 'clap' | 'star' | 'bench' | 'laugh' | 'facepalm' | 'cheer' | 'shrug' | 'board' | 'can' | 'chips' | 'pencil' | 'trophy' | 'crate' | 'chart';
export interface Tile { id: string; label: string; icon: IconName; color: string; action?: Action; disabled?: boolean; badge?: string }
export interface Row { id: string; label: string; detail?: string; value?: string; action?: Action; disabled?: boolean; chosen?: boolean; adjust?: (step: -1 | 1) => void }
export type Block =
  | { type: 'title'; text: string; sub?: string }
  | { type: 'grid'; cols: number; tiles: Tile[] }
  | { type: 'list'; rows: Row[] }
  | { type: 'slider'; id: string; label: string; value: number; text: string; adjust: (step: -1 | 1) => void; set?: (value: number) => void }
  | { type: 'buttons'; buttons: { id: string; icon: IconName; label: string; action: Action; big?: boolean }[] }
  | { type: 'progress'; value: number; left: string; right: string }
  | { type: 'text'; text: string; muted?: boolean }
  | { type: 'card'; title: string; lines: string[]; art?: string; icon?: IconName; picture?: CanvasImageSource | null }
  | { type: 'image'; height: number; frame?: boolean; draw: (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void }
  | { type: 'bubbles'; items: { from: string; text: string; mine: boolean }[]; empty?: string };
export interface Page { blocks: Block[]; wallpaper?: 'dusk' | 'grip'; initial?: string }

interface Target { id: string; x: number; y: number; w: number; h: number; action?: Action; adjust?: (step: -1 | 1) => void; set?: (value: number) => void; disabled?: boolean }

type Ctx = CanvasRenderingContext2D;

function rounded(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
/** A sticker: hard offset shadow, colour fill, ink outline. */
export function sticker(g: Ctx, x: number, y: number, w: number, h: number, fill: string, r = 14, shadow = INK, lift = 4) {
  rounded(g, x + lift, y + lift, w, h, r);
  g.fillStyle = shadow;
  g.fill();
  rounded(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = INK;
  g.stroke();
}
function wrap(g: Ctx, text: string, width: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (g.measureText(test).width > width && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
  }
  return lines;
}
function ellipsize(g: Ctx, text: string, width: number) {
  if (g.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > width) t = t.slice(0, -1);
  return t + '…';
}

/** Simple bold vector icons, drawn centred at (x, y) in a box of `s`. */
export function icon(g: Ctx, name: IconName, x: number, y: number, s: number, color = INK) {
  g.save();
  g.translate(x, y);
  g.scale(s / 48, s / 48);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const circle = (cx: number, cy: number, r: number, fill = true) => { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); fill ? g.fill() : g.stroke(); };
  switch (name) {
    case 'music':
      g.beginPath(); g.moveTo(-6, 12); g.lineTo(-6, -16); g.lineTo(14, -20); g.lineTo(14, 8); g.stroke();
      circle(-11, 13, 7); circle(9, 9, 7); break;
    case 'emote':
      circle(0, 0, 18, false); circle(-7, -5, 3); circle(7, -5, 3);
      g.beginPath(); g.arc(0, 2, 10, 0.2, Math.PI - 0.2); g.stroke(); break;
    case 'ride':
      g.beginPath(); g.moveTo(-16, 12); g.lineTo(14, 12); g.moveTo(10, 12); g.lineTo(6, -16); g.moveTo(-2, -16); g.lineTo(12, -16); g.stroke();
      circle(-15, 15, 5); circle(13, 15, 5); break;
    case 'rider':
      circle(0, -9, 10); g.beginPath(); g.moveTo(-15, 20); g.quadraticCurveTo(0, -2, 15, 20); g.closePath(); g.fill(); break;
    case 'map':
      g.beginPath(); g.moveTo(-18, -12); g.lineTo(-6, -17); g.lineTo(6, -12); g.lineTo(18, -17); g.lineTo(18, 14); g.lineTo(6, 19); g.lineTo(-6, 14); g.lineTo(-18, 19); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(-6, -17); g.lineTo(-6, 14); g.moveTo(6, -12); g.lineTo(6, 19); g.stroke(); break;
    case 'items':
      rounded(g, -16, -10, 32, 28, 6); g.stroke(); g.beginPath(); g.moveTo(-7, -10); g.lineTo(-7, -17); g.lineTo(7, -17); g.lineTo(7, -10); g.stroke();
      g.beginPath(); g.moveTo(-16, 2); g.lineTo(16, 2); g.stroke(); break;
    case 'build':
      // A quarter pipe with its coping, and a wrench.
      g.beginPath(); g.moveTo(-22, 18); g.lineTo(8, 18); g.lineTo(8, -10); g.quadraticCurveTo(-10, -10, -18, 18); g.closePath(); g.fill();
      g.lineWidth = 4; g.beginPath(); g.moveTo(3, -12); g.lineTo(13, -12); g.stroke();
      g.save(); g.translate(15, 2); g.rotate(-0.8); g.fillRect(-2.5, -4, 5, 20); g.beginPath(); g.arc(0, -7, 6, 0, Math.PI * 2); g.fill(); g.restore(); break;
    case 'messages':
      rounded(g, -19, -16, 38, 26, 8); g.fill(); g.beginPath(); g.moveTo(-8, 8); g.lineTo(-12, 20); g.lineTo(4, 9); g.fill();
      g.fillStyle = PAPER; circle(-9, -3, 3); circle(0, -3, 3); circle(9, -3, 3); break;
    case 'play':
      g.beginPath(); g.moveTo(-10, -16); g.lineTo(16, 0); g.lineTo(-10, 16); g.closePath(); g.fill(); break;
    case 'pause':
      g.fillRect(-13, -15, 9, 30); g.fillRect(4, -15, 9, 30); break;
    case 'prev':
      g.fillRect(-16, -14, 5, 28); g.beginPath(); g.moveTo(14, -14); g.lineTo(-8, 0); g.lineTo(14, 14); g.closePath(); g.fill(); break;
    case 'next':
      g.fillRect(11, -14, 5, 28); g.beginPath(); g.moveTo(-14, -14); g.lineTo(8, 0); g.lineTo(-14, 14); g.closePath(); g.fill(); break;
    case 'dice':
      rounded(g, -16, -16, 32, 32, 7); g.stroke(); circle(-7, -7, 3.5); circle(0, 0, 3.5); circle(7, 7, 3.5); break;
    case 'lock':
      rounded(g, -12, -2, 24, 20, 4); g.fill(); g.beginPath(); g.arc(0, -4, 8, Math.PI, 0); g.stroke(); break;
    case 'wave': case 'cheer': {
      // An open hand (wave) or a raised fist (cheer), with motion ticks.
      if (name === 'wave') { rounded(g, -9, -6, 20, 24, 7); g.fill(); for (let i = 0; i < 4; i++) { rounded(g, -9 + i * 5.2, -20 + Math.abs(i - 1.5) * 2, 4.4, 18, 2.2); g.fill(); } g.save(); g.rotate(-0.6); rounded(g, -16, 2, 5, 13, 2.5); g.fill(); g.restore(); }
      else { rounded(g, -10, -14, 22, 20, 7); g.fill(); g.fillRect(-6, 4, 14, 16); }
      g.lineWidth = 3.5; g.beginPath(); g.moveTo(-20, -18); g.lineTo(-15, -13); g.moveTo(20, -18); g.lineTo(15, -13); g.moveTo(-22, -6); g.lineTo(-17, -6); g.stroke(); break;
    }
    case 'nod': case 'shake': {
      circle(0, 0, 11, false);
      const a = name === 'nod' ? [[0, -22], [0, 22]] : [[-22, 0], [22, 0]];
      for (const [x, y] of a) { g.beginPath(); g.moveTo(x * 0.62, y * 0.62); g.lineTo(x, y); g.stroke(); g.beginPath(); const nx = Math.sign(x), ny = Math.sign(y); g.moveTo(x + (ny ? -5 : -nx * 5), y + (nx ? -5 : -ny * 5)); g.lineTo(x, y); g.lineTo(x + (ny ? 5 : -nx * 5), y + (nx ? 5 : -ny * 5)); g.stroke(); }
      break;
    }
    case 'point':
      rounded(g, -16, -4, 20, 20, 6); g.fill(); rounded(g, 0, -4, 20, 7, 3.5); g.fill(); g.lineWidth = 3; g.beginPath(); g.moveTo(-10, -12); g.lineTo(-4, -8); g.stroke(); break;
    case 'clap':
      g.save(); g.rotate(-0.35); rounded(g, -14, -12, 13, 26, 6); g.fill(); g.restore(); g.save(); g.rotate(0.35); rounded(g, 1, -12, 13, 26, 6); g.fill(); g.restore();
      g.lineWidth = 3; g.beginPath(); g.moveTo(-6, -22); g.lineTo(-4, -17); g.moveTo(6, -22); g.lineTo(4, -17); g.moveTo(0, -24); g.lineTo(0, -18); g.stroke(); break;
    case 'star': {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 21, a = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); break;
    }
    case 'trophy':
      g.beginPath(); g.moveTo(-13, -18); g.lineTo(13, -18); g.lineTo(11, -2); g.quadraticCurveTo(0, 8, -11, -2); g.closePath(); g.fill();
      g.lineWidth = 3.5; g.beginPath(); g.arc(-13, -10, 6, Math.PI * 0.5, Math.PI * 1.5); g.moveTo(13, -16); g.arc(13, -10, 6, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
      g.fillRect(-3, 4, 6, 8); rounded(g, -11, 12, 22, 7, 2); g.fill(); break;
    case 'chart':
      // Three climbing bars over a baseline, with a tick for the best.
      rounded(g, -18, 2, 9, 16, 2); g.fill(); rounded(g, -5, -7, 9, 25, 2); g.fill(); rounded(g, 8, -16, 9, 34, 2); g.fill();
      g.lineWidth = 3; g.beginPath(); g.moveTo(-21, 20); g.lineTo(21, 20); g.stroke(); break;
    case 'crate':
      rounded(g, -19, -10, 38, 28, 4); g.fill(); rounded(g, -21, -18, 42, 10, 3); g.fill();
      g.fillStyle = '#00000066'; g.fillRect(-10, -6, 5, 22); g.fillRect(5, -6, 5, 22); break;
    case 'bench':
      g.fillRect(-20, -8, 40, 6); g.fillRect(-20, 2, 40, 6); g.fillRect(-16, 8, 5, 12); g.fillRect(11, 8, 5, 12); g.fillRect(-16, -18, 4, 10); g.fillRect(12, -18, 4, 10); break;
    case 'laugh':
      circle(0, 0, 19, false); g.lineWidth = 3.5; g.beginPath(); g.moveTo(-11, -7); g.lineTo(-5, -4); g.lineTo(-11, -1); g.moveTo(11, -7); g.lineTo(5, -4); g.lineTo(11, -1); g.stroke();
      g.beginPath(); g.moveTo(-10, 4); g.quadraticCurveTo(0, 18, 10, 4); g.closePath(); g.fill(); break;
    case 'facepalm':
      circle(0, 2, 17, false); g.save(); g.rotate(-0.5); rounded(g, -9, -24, 18, 26, 7); g.fill(); g.restore(); break;
    case 'shrug':
      circle(0, -12, 7); g.beginPath(); g.moveTo(-10, 18); g.lineTo(-6, 0); g.lineTo(6, 0); g.lineTo(10, 18); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-6, 2); g.lineTo(-18, 4); g.lineTo(-22, -6); g.moveTo(6, 2); g.lineTo(18, 4); g.lineTo(22, -6); g.stroke(); break;
    case 'board':
      rounded(g, -22, -6, 44, 9, 4.5); g.fill(); circle(-13, 9, 4.5); circle(13, 9, 4.5); break;
    case 'can':
      rounded(g, -10, -18, 20, 36, 5); g.fill(); g.fillStyle = PAPER; g.fillRect(-10, -4, 20, 8); break;
    case 'chips':
      g.beginPath(); g.moveTo(-14, -18); g.lineTo(14, -18); g.lineTo(11, 18); g.lineTo(-11, 18); g.closePath(); g.fill(); g.fillStyle = PAPER; circle(0, 0, 6); break;
    case 'pencil':
      g.save(); g.rotate(-Math.PI / 4); g.fillRect(-4, -18, 8, 28); g.beginPath(); g.moveTo(-4, 10); g.lineTo(0, 18); g.lineTo(4, 10); g.closePath(); g.fill(); g.restore(); break;
  }
  g.restore();
}

export class PhoneScreen {
  readonly canvas = document.createElement('canvas');
  readonly g: Ctx;
  private targets: Target[] = [];
  focusId = '';
  private scroll = 0;
  private manualScroll = false;
  private contentH = 0;
  private scale = 2;
  /** Drawn behind every page; set by the phone (status bar, nav, wallpaper). */
  chrome: { title: string; time: string; battery: number; canBack: boolean } = { title: '', time: '', battery: 0.8, canBack: false };
  onBack: Action = () => {};
  onHome: Action = () => {};

  constructor() {
    this.canvas.width = SCREEN_W * this.scale;
    this.canvas.height = SCREEN_H * this.scale;
    this.g = this.canvas.getContext('2d')!;
    window.addEventListener('swf-palette-change',()=>this.wallpapers.clear());
  }

  /** Lays out and draws a page. Keeps focus on the same id when it still exists. */
  draw(page: Page) {
    const g = this.g;
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.direction = direction();
    this.drawWallpaper(page.wallpaper ?? 'grip');
    this.targets = [];
    // Layout pass (measure) then draw inside the scrolled content area.
    const top = STATUS_H + 8, bottom = SCREEN_H - NAV_H, view = bottom - top;
    const heights = page.blocks.map(b => this.measure(b));
    this.contentH = heights.reduce((a, b) => a + b, 0) + PAD;
    if (!this.focusId || !this.findFocusable(page, this.focusId)) this.focusId = page.initial && this.findFocusable(page, page.initial) ? page.initial : this.firstFocusable(page);
    g.save();
    g.beginPath();
    g.rect(0, top, SCREEN_W, view);
    g.clip();
    // Scroll so the focused target stays visible (computed from the unscrolled layout).
    const focusY = this.locate(page, heights, this.focusId);
    if (focusY && !this.manualScroll) {
      if (focusY.y - this.scroll < 6) this.scroll = Math.max(0, focusY.y - 6);
      if (focusY.y + focusY.h - this.scroll > view - 6) this.scroll = focusY.y + focusY.h - view + 6;
    }
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, this.contentH - view)));
    let y = top - this.scroll;
    page.blocks.forEach((b, i) => { this.drawBlock(b, y); y += heights[i]; });
    g.restore();
    if (this.contentH > view) {
      // A slim scroll thumb on the right edge.
      const h = Math.max(30, view * view / this.contentH), t = top + (view - h) * (this.scroll / (this.contentH - view));
      g.fillStyle = '#ffffff55';
      rounded(g, SCREEN_W - 6, t, 3, h, 2); g.fill();
    }
    this.drawChrome();
  }

  private wallpapers = new Map<string, HTMLCanvasElement>();
  private drawWallpaper(kind: 'dusk' | 'grip') {
    let paper = this.wallpapers.get(kind);
    if (!paper) {
      paper = document.createElement('canvas');
      paper.width = SCREEN_W * this.scale;
      paper.height = SCREEN_H * this.scale;
      const pg = paper.getContext('2d')!;
      pg.scale(this.scale, this.scale);
      this.paintWallpaper(pg, kind);
      this.wallpapers.set(kind, paper);
    }
    this.g.drawImage(paper, 0, 0, SCREEN_W, SCREEN_H);
  }
  private paintWallpaper(g: Ctx, kind: 'dusk' | 'grip') {
    const themed=document.documentElement.dataset.uiPalette&&document.documentElement.dataset.uiPalette!=='default';
    if (kind === 'dusk') {
      const sky = g.createLinearGradient(0, 0, 0, SCREEN_H);
      sky.addColorStop(0, themed?INK:'#1d2350'); sky.addColorStop(0.45, themed?TEAL:'#6a3f80'); sky.addColorStop(0.75, themed?ORANGE:'#e0697a'); sky.addColorStop(1, themed?uiColors().sun:'#f7a35c');
      g.fillStyle = sky; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      // Striped sun and a ridge, like the creator's set.
      g.save(); g.beginPath(); g.arc(SCREEN_W * 0.66, SCREEN_H * 0.8, 70, 0, Math.PI * 2); g.clip();
      g.fillStyle = themed?uiColors().sun:'#ffc070'; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      g.fillStyle = themed?ORANGE:'#e0697a'; for (let i = 0; i < 6; i++) g.fillRect(0, SCREEN_H * 0.8 + 10 + i * 11, SCREEN_W, 2 + i);
      g.restore();
      g.fillStyle = themed?INK:'#4a3560'; g.beginPath(); g.moveTo(0, SCREEN_H);
      for (let x = 0; x <= SCREEN_W; x += 6) g.lineTo(x, SCREEN_H * 0.86 - 22 * Math.sin(x / 41 + 1) - 9 * Math.sin(x / 13));
      g.lineTo(SCREEN_W, SCREEN_H); g.fill();
    } else {
      g.fillStyle = themed?INK:'#17191c'; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      // Grip-tape speckle (deterministic).
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      g.fillStyle = '#ffffff0e';
      for (let i = 0; i < 900; i++) g.fillRect(rnd() * SCREEN_W, rnd() * SCREEN_H, 1.2, 1.2);
    }
  }

  private drawChrome() {
    const g = this.g, c = this.chrome;
    // Status bar.
    g.fillStyle = '#000000aa'; g.fillRect(0, 0, SCREEN_W, STATUS_H);
    g.fillStyle = '#fff'; g.font = `700 13px ${BODY}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(c.time, 14, STATUS_H / 2 + 1);
    g.textAlign = 'center'; g.font = `11px ${DISPLAY}`; g.fillStyle = LIME;
    g.fillText(c.title || 'SCOOT MOBILE', SCREEN_W / 2, STATUS_H / 2 + 1);
    // Signal bars and battery.
    g.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) g.fillRect(SCREEN_W - 84 + i * 6, STATUS_H / 2 + 5 - (i + 1) * 3, 4, (i + 1) * 3);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; rounded(g, SCREEN_W - 50, STATUS_H / 2 - 6, 28, 12, 3); g.stroke();
    g.fillRect(SCREEN_W - 21, STATUS_H / 2 - 3, 2.5, 6);
    g.fillStyle = c.battery > 0.2 ? LIME : ORANGE; g.fillRect(SCREEN_W - 48, STATUS_H / 2 - 4, 24 * c.battery, 8);
    // Bottom navigation: BACK and HOME.
    g.fillStyle = '#000000cc'; g.fillRect(0, SCREEN_H - NAV_H, SCREEN_W, NAV_H);
    const navY = SCREEN_H - NAV_H / 2;
    g.fillStyle = c.canBack ? '#fff' : '#ffffff44'; g.font = `12px ${DISPLAY}`; g.textAlign = 'center';
    g.beginPath(); g.moveTo(SCREEN_W * 0.25 - 26, navY); g.lineTo(SCREEN_W * 0.25 - 16, navY - 8); g.lineTo(SCREEN_W * 0.25 - 16, navY + 8); g.closePath(); g.fill();
    g.fillText(t('common.back'), SCREEN_W * 0.25 + 10, navY + 1);
    g.fillStyle = '#fff';
    g.lineWidth = 2.5; g.strokeStyle = '#fff'; g.beginPath(); g.arc(SCREEN_W * 0.75 - 30, navY, 8, 0, Math.PI * 2); g.stroke();
    g.fillText(t('phone.home'), SCREEN_W * 0.75 + 4, navY + 1);
    this.targets.push({ id: '__back', x: 0, y: SCREEN_H - NAV_H, w: SCREEN_W / 2, h: NAV_H, action: () => this.onBack() });
    this.targets.push({ id: '__home', x: SCREEN_W / 2, y: SCREEN_H - NAV_H, w: SCREEN_W / 2, h: NAV_H, action: () => this.onHome() });
  }

  private measure(b: Block): number {
    const g = this.g, inner = SCREEN_W - PAD * 2;
    switch (b.type) {
      case 'title': return b.sub ? 76 : 56;
      case 'grid': { const cell = (inner - (b.cols - 1) * 14) / b.cols; return Math.ceil(b.tiles.length / b.cols) * (cell + 34) + 6; }
      case 'list': return b.rows.reduce((h, r) => h + (r.detail ? 66 : 52) + 8, 4);
      case 'slider': return 70;
      case 'buttons': return 86;
      case 'progress': return 40;
      case 'text': g.font = `500 15px ${BODY}`; return wrap(g, b.text, inner).length * 21 + 12;
      case 'card': return 118 + Math.max(0, b.lines.length - 2) * 18;
      case 'image': return b.height + 12;
      case 'bubbles': {
        g.font = `500 14px ${BODY}`;
        if (!b.items.length) return 40;
        return b.items.reduce((h, m) => h + wrap(g, m.text, inner * 0.72 - 20).length * 19 + (m.mine ? 26 : 42), 6);
      }
    }
  }

  private drawBlock(b: Block, y: number) {
    const g = this.g, inner = SCREEN_W - PAD * 2, x0 = PAD, rtl = direction() === 'rtl';
    g.textBaseline = 'alphabetic';
    switch (b.type) {
      case 'title': {
        g.textAlign = rtl ? 'right' : 'left'; g.font = `26px ${DISPLAY}`;
        g.lineWidth = 5; g.strokeStyle = INK; g.strokeText(b.text, rtl ? x0 + inner : x0, y + 38);
        g.fillStyle = PAPER; g.fillText(b.text, rtl ? x0 + inner : x0, y + 38);
        if (b.sub) { g.font = `700 13px ${BODY}`; g.fillStyle = '#c9d2dc'; g.fillText(ellipsize(g, b.sub.toUpperCase(), SCREEN_W - PAD * 2), rtl ? x0 + inner : x0, y + 62); }
        break;
      }
      case 'grid': {
        const cell = (inner - (b.cols - 1) * 14) / b.cols;
        b.tiles.forEach((t, i) => {
          const cx = x0 + (rtl ? b.cols - 1 - i % b.cols : i % b.cols) * (cell + 14), cy = y + 4 + Math.floor(i / b.cols) * (cell + 34), focused = t.id === this.focusId;
          const lift = focused ? -3 : 0;
          sticker(g, cx + lift, cy + lift, cell, cell, t.disabled ? '#5a5f66' : t.color, 16, focused ? ORANGE : INK, focused ? 6 : 4);
          icon(g, t.icon, cx + lift + cell / 2, cy + lift + cell / 2, cell * 0.52, t.disabled ? '#2a2d31' : INK);
          if (focused) { g.lineWidth = 3; g.strokeStyle = LIME; rounded(g, cx + lift - 4, cy + lift - 4, cell + 8, cell + 8, 19); g.stroke(); }
          if (t.badge) { g.fillStyle = ORANGE; g.beginPath(); g.arc(cx + cell - 4, cy + 4, 11, 0, Math.PI * 2); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke(); g.fillStyle = '#fff'; g.font = `700 11px ${BODY}`; g.textAlign = 'center'; g.fillText(t.badge, cx + cell - 4, cy + 8); }
          g.textAlign = 'center'; g.font = `${Math.min(13, Math.round(cell * 0.16))}px ${DISPLAY}`; g.fillStyle = focused ? LIME : '#fff'; g.lineWidth = 4; g.strokeStyle = INK;
          g.strokeText(t.label, cx + cell / 2, cy + cell + 23); g.fillText(t.label, cx + cell / 2, cy + cell + 23);
          this.targets.push({ id: t.id, x: cx, y: cy, w: cell, h: cell + 28, action: t.action, disabled: t.disabled });
        });
        break;
      }
      case 'list': {
        let ry = y + 4;
        for (const r of b.rows) {
          const h = r.detail ? 66 : 52, focused = r.id === this.focusId;
          sticker(g, x0, ry, inner, h, focused ? LIME : r.disabled ? '#3a3e44' : PAPER, 12, focused ? ORANGE : INK, focused ? 5 : 3);
          g.textAlign = rtl ? 'right' : 'left'; g.fillStyle = r.disabled ? '#9aa1a8' : INK; g.font = `15px ${DISPLAY}`;
          g.fillText(ellipsize(g, r.label, inner - (r.value ? 120 : r.chosen ? 52 : 28)), rtl ? x0 + inner - 14 : x0 + 14, ry + (r.detail ? 28 : 33));
          if (r.detail) { g.font = `600 13px ${BODY}`; g.fillStyle = r.disabled ? '#8a9198' : '#3b4148'; g.fillText(ellipsize(g, r.detail, inner - (r.chosen ? 52 : 28)), rtl ? x0 + inner - 14 : x0 + 14, ry + 50); }
          if (r.value) { g.textAlign = rtl ? 'left' : 'right'; g.font = `800 14px ${BODY}`; g.fillStyle = INK; g.fillText(r.adjust ? `◀ ${r.value} ▶` : r.value, rtl ? x0 + 14 : x0 + inner - 14, ry + (r.detail ? 28 : 33)); }
          if (r.chosen) { const checkX = rtl ? x0 + 20 : x0 + inner - 20; g.fillStyle = INK; g.beginPath(); g.arc(checkX, ry + h / 2, 9, 0, Math.PI * 2); g.fill(); g.strokeStyle = LIME; g.lineWidth = 3; g.beginPath(); g.moveTo(checkX - 5, ry + h / 2); g.lineTo(checkX - 1, ry + h / 2 + 4); g.lineTo(checkX + 6, ry + h / 2 - 4); g.stroke(); }
          this.targets.push({ id: r.id, x: x0, y: ry, w: inner, h, action: r.action, adjust: r.adjust, disabled: r.disabled });
          ry += h + 8;
        }
        break;
      }
      case 'slider': {
        const focused = b.id === this.focusId;
        g.textAlign = 'left'; g.font = `13px ${DISPLAY}`; g.fillStyle = focused ? LIME : PAPER; g.fillText(b.label, x0, y + 18);
        g.textAlign = 'right'; g.font = `800 14px ${BODY}`; g.fillText(b.text, x0 + inner, y + 18);
        const ty = y + 44;
        rounded(g, x0, ty - 5, inner, 10, 5); g.fillStyle = '#000'; g.fill(); g.strokeStyle = focused ? LIME : '#3b4048'; g.lineWidth = 2; g.stroke();
        rounded(g, x0, ty - 5, inner * b.value, 10, 5); g.fillStyle = focused ? LIME : TEAL; g.fill();
        const kx = x0 + inner * b.value;
        const knob = g.createLinearGradient(0, ty - 14, 0, ty + 14); knob.addColorStop(0, '#fff'); knob.addColorStop(0.5, '#8a96a3'); knob.addColorStop(1, '#eef2f6');
        rounded(g, kx - 10, ty - 15, 20, 30, 5); g.fillStyle = knob; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
        this.targets.push({ id: b.id, x: x0, y: y + 22, w: inner, h: 42, adjust: b.adjust, set: b.set });
        break;
      }
      case 'buttons': {
        const n = b.buttons.length, gap = 12, w = (inner - gap * (n - 1)) / n;
        b.buttons.forEach((btn, i) => {
          const bx = x0 + i * (w + gap), focused = btn.id === this.focusId, size = btn.big ? 64 : 54, by = y + (70 - size) / 2;
          sticker(g, bx + (w - size) / 2, by, size, size, focused ? LIME : btn.big ? ORANGE : PAPER, size / 2, focused ? ORANGE : INK, focused ? 5 : 3);
          icon(g, btn.icon, bx + w / 2, by + size / 2, size * 0.5);
          this.targets.push({ id: btn.id, x: bx, y: by, w, h: size, action: btn.action });
        });
        break;
      }
      case 'progress': {
        rounded(g, x0, y + 8, inner, 8, 4); g.fillStyle = '#000'; g.fill();
        rounded(g, x0, y + 8, Math.max(8, inner * b.value), 8, 4); g.fillStyle = ORANGE; g.fill();
        g.font = `700 12px ${BODY}`; g.fillStyle = '#d5dce3'; g.textAlign = 'left'; g.fillText(b.left, x0, y + 34); g.textAlign = 'right'; g.fillText(b.right, x0 + inner, y + 34);
        break;
      }
      case 'text': {
        g.font = `500 15px ${BODY}`; g.fillStyle = b.muted ? '#a9b3bd' : PAPER; g.textAlign = 'left';
        wrap(g, b.text, inner).forEach((line, i) => g.fillText(line, x0, y + 18 + i * 21));
        break;
      }
      case 'card': {
        const h = 106 + Math.max(0, b.lines.length - 2) * 18;
        sticker(g, x0, y + 4, inner, h, PAPER, 16);
        const art = g.createLinearGradient(x0 + 12, y + 16, x0 + 92, y + 96);
        art.addColorStop(0, b.art ?? ORANGE); art.addColorStop(1, '#4a3560');
        rounded(g, x0 + 12, y + 16, 80, 80, 10); g.fillStyle = art; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
        if (b.picture) g.drawImage(b.picture, x0 + 12, y + 16, 80, 80);
        else icon(g, b.icon ?? 'music', x0 + 52, y + 56, 44, '#fff');
        g.textAlign = 'left'; g.fillStyle = INK; g.font = `16px ${DISPLAY}`;
        wrap(g, b.title, inner - 120).slice(0, 2).forEach((l, i) => g.fillText(l, x0 + 106, y + 38 + i * 20));
        g.font = `600 13px ${BODY}`; g.fillStyle = '#3b4148';
        b.lines.forEach((l, i) => g.fillText(ellipsize(g, l, inner - 120), x0 + 106, y + 78 + i * 18));
        break;
      }
      case 'image': {
        if (b.frame === false) { b.draw(g, x0, y + 4, inner, b.height); break; }
        g.save(); rounded(g, x0, y + 4, inner, b.height, 14); g.clip();
        b.draw(g, x0, y + 4, inner, b.height);
        g.restore();
        rounded(g, x0, y + 4, inner, b.height, 14); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
        break;
      }
      case 'bubbles': {
        g.font = `500 14px ${BODY}`;
        if (!b.items.length) { g.fillStyle = '#a9b3bd'; g.textAlign = 'left'; g.fillText(b.empty ?? 'No messages yet.', x0, y + 24); break; }
        let by = y + 6;
        for (const m of b.items) {
          const lines = wrap(g, m.text, inner * 0.72 - 20), tw = Math.max(...lines.map(l => g.measureText(l).width));
          if (!m.mine) { g.font = `700 11px ${BODY}`; g.fillStyle = LIME; g.textAlign = 'left'; g.fillText(m.from.toUpperCase(), x0 + 4, by + 12); by += 16; g.font = `500 14px ${BODY}`; }
          const bw = tw + 22, bh = lines.length * 19 + 14, bx = m.mine ? x0 + inner - bw : x0;
          sticker(g, bx, by, bw, bh, m.mine ? LIME : PAPER, 12, INK, 3);
          g.fillStyle = INK; g.textAlign = 'left';
          lines.forEach((l, i) => g.fillText(l, bx + 11, by + 22 + i * 19));
          by += bh + 12;
        }
        break;
      }
    }
  }

  // ---- Focus -------------------------------------------------------------------

  private focusables(page: Page) {
    const ids: string[] = [];
    for (const b of page.blocks) {
      if (b.type === 'grid') ids.push(...b.tiles.map(t => t.id));
      if (b.type === 'list') ids.push(...b.rows.map(r => r.id));
      if (b.type === 'slider') ids.push(b.id);
      if (b.type === 'buttons') ids.push(...b.buttons.map(x => x.id));
    }
    return ids;
  }
  private findFocusable(page: Page, id: string) { return this.focusables(page).includes(id); }
  private firstFocusable(page: Page) { return this.focusables(page)[0] ?? ''; }
  /** Content-space rectangle of a focusable (before scrolling). */
  private locate(page: Page, heights: number[], id: string) {
    let y = 0;
    for (let i = 0; i < page.blocks.length; i++) {
      const b = page.blocks[i];
      if (b.type === 'grid') {
        const cell = (SCREEN_W - PAD * 2 - (b.cols - 1) * 14) / b.cols, k = b.tiles.findIndex(t => t.id === id);
        if (k >= 0) return { y: y + 4 + Math.floor(k / b.cols) * (cell + 34), h: cell + 30 };
      }
      if (b.type === 'list') {
        let ry = y + 4;
        for (const r of b.rows) { const h = r.detail ? 66 : 52; if (r.id === id) return { y: ry, h }; ry += h + 8; }
      }
      if ((b.type === 'slider' && b.id === id) || (b.type === 'buttons' && b.buttons.some(x => x.id === id))) return { y, h: heights[i] };
      y += heights[i];
    }
    return null;
  }

  /** Whether the last drawn page has a control with this id. */
  has(id: string) { return this.targets.some(t => t.id === id); }
  /** Moves focus to the nearest target in a direction (spatial navigation). */
  move(dx: number, dy: number) {
    const from = this.targets.find(t => t.id === this.focusId);
    const content = this.targets.filter(t => !t.id.startsWith('__'));
    if (!from) { if (content[0]) this.focusId = content[0].id; return; }
    const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
    let best: Target | null = null, bestScore = Infinity;
    for (const t of content) {
      if (t.id === from.id) continue;
      const tx = t.x + t.w / 2, ty = t.y + t.h / 2, ax = tx - fx, ay = ty - fy;
      const along = dx ? ax * dx : ay * dy, across = dx ? Math.abs(ay) : Math.abs(ax);
      if (along <= 4) continue;
      const score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (best) { this.focusId = best.id; this.manualScroll = false; }
  }
  /** Left/right on a slider or adjustable row changes it; returns false when nothing adjusts. */
  adjust(step: -1 | 1) {
    const t = this.targets.find(x => x.id === this.focusId);
    if (!t?.adjust) return false;
    t.adjust(step);
    return true;
  }
  activate() {
    const t = this.targets.find(x => x.id === this.focusId);
    if (t && !t.disabled) t.action?.();
  }
  /** A tap or click in screen pixels (0..SCREEN_W, 0..SCREEN_H). */
  /** The control under a point in screen pixels, if any. */
  hit(x: number, y: number) { return [...this.targets].reverse().find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); }
  tap(x: number, y: number) {
    const t = this.hit(x, y);
    if (!t) return;
    if (t.set && t.w > 0) { t.set(Math.max(0, Math.min(1, (x - t.x) / t.w))); return; }
    if (!t.id.startsWith('__')) { this.focusId = t.id; this.manualScroll = false; }
    if (!t.disabled) t.action?.();
  }
  /** Scroll by a drag or wheel (content pixels). */
  scrollBy(dy: number) { this.manualScroll = true; this.scroll = Math.max(0, this.scroll + dy); }
  resetScroll() { this.scroll = 0; this.manualScroll = false; }
}
