import {
  AVATAR_PRESETS, AVATAR_RANGES, BODY_TYPES, BOTTOMS, BROW_STYLES, CLOTH_COLORS, EAR_STYLES, EYE_COLORS, EYE_STYLES, EYEWEAR, FACIAL_HAIR,
  HAIR_COLORS, HAIR_STYLES, HEAD_SHAPES, HEADWEAR, LASH_STYLES, MOUTH_STYLES, NOSE_STYLES, SHOES, SKIN_TONES, TOPS, WRISTBANDS,
  randomAvatar, sanitizeAvatar, type AvatarConfig, type CatalogItem, type Swatch,
} from '../avatar/config';
import { ThumbnailStudio, type ThumbView } from '../avatar/thumbnails';
import type { InputFrame } from '../input/input';
import './creator.css';

/**
 * The rider creator (docs/AVATAR-DESIGN.md §11, owner brief "Avatar Part 2").
 * Controller first: LB/RB change category, the D-pad or left stick moves
 * between tiles, A picks, X randomizes, Y saves, B backs out, the right stick
 * turns the rider and the triggers zoom. Every tile is also a big touch/mouse
 * target. It edits a draft; nothing is saved until SAVE RIDER.
 */
type Field = keyof AvatarConfig;
export type Framing = 'face' | 'body' | 'feet';
type Row =
  | { kind: 'items'; field: Field; label: string; items: readonly CatalogItem[]; view?: ThumbView; framing?: Framing; when?: (c: AvatarConfig) => boolean }
  | { kind: 'swatches'; field: Field; label: string; swatches: readonly Swatch[]; framing?: Framing; when?: (c: AvatarConfig) => boolean }
  | { kind: 'slider'; field: keyof typeof AVATAR_RANGES; label: string; ends: [string, string]; framing?: Framing }
  | { kind: 'presets'; label: string; framing?: Framing };
interface Tab { id: string; label: string; framing: Framing; rows: Row[] }

const TABS: Tab[] = [
  { id: 'presets', label: 'PRESETS', framing: 'body', rows: [{ kind: 'presets', label: 'Sample riders' }] },
  { id: 'face', label: 'FACE', framing: 'face', rows: [
    { kind: 'items', field: 'headShape', label: 'Head shape', items: HEAD_SHAPES, view: 'head' },
    { kind: 'swatches', field: 'skinTone', label: 'Skin tone', swatches: SKIN_TONES },
    { kind: 'slider', field: 'headSize', label: 'Head size', ends: ['SMALL', 'LARGE'] },
    { kind: 'items', field: 'earStyle', label: 'Ears', items: EAR_STYLES, view: 'head' },
    { kind: 'items', field: 'facialHair', label: 'Facial hair', items: FACIAL_HAIR, view: 'beard' },
  ] },
  { id: 'hair', label: 'HAIR', framing: 'face', rows: [
    { kind: 'items', field: 'hairStyle', label: 'Hair style', items: HAIR_STYLES, view: 'hair' },
    { kind: 'swatches', field: 'hairColor', label: 'Hair color', swatches: HAIR_COLORS },
  ] },
  { id: 'eyes', label: 'EYES', framing: 'face', rows: [
    { kind: 'items', field: 'eyeStyle', label: 'Eyes', items: EYE_STYLES, view: 'eyes' },
    { kind: 'swatches', field: 'eyeColor', label: 'Eye color', swatches: EYE_COLORS },
    { kind: 'items', field: 'lashStyle', label: 'Lashes', items: LASH_STYLES, view: 'eyes' },
    { kind: 'slider', field: 'eyeY', label: 'Height', ends: ['LOWER', 'HIGHER'] },
    { kind: 'slider', field: 'eyeSpacing', label: 'Spacing', ends: ['CLOSER', 'WIDER'] },
    { kind: 'slider', field: 'eyeSize', label: 'Size', ends: ['SMALLER', 'BIGGER'] },
  ] },
  { id: 'brows', label: 'BROWS', framing: 'face', rows: [
    { kind: 'items', field: 'browStyle', label: 'Brows', items: BROW_STYLES, view: 'brows' },
    { kind: 'swatches', field: 'browColor', label: 'Brow color', swatches: HAIR_COLORS },
    { kind: 'slider', field: 'browY', label: 'Height', ends: ['LOWER', 'HIGHER'] },
    { kind: 'slider', field: 'browAngle', label: 'Angle', ends: ['SOFT', 'FIERCE'] },
    { kind: 'slider', field: 'browSpacing', label: 'Spacing', ends: ['CLOSER', 'WIDER'] },
  ] },
  { id: 'nose', label: 'NOSE', framing: 'face', rows: [
    { kind: 'items', field: 'noseStyle', label: 'Nose', items: NOSE_STYLES, view: 'nose' },
    { kind: 'slider', field: 'noseY', label: 'Height', ends: ['LOWER', 'HIGHER'] },
  ] },
  { id: 'mouth', label: 'MOUTH', framing: 'face', rows: [
    { kind: 'items', field: 'mouthStyle', label: 'Mouth', items: MOUTH_STYLES, view: 'mouth' },
    { kind: 'slider', field: 'mouthSize', label: 'Size', ends: ['SMALLER', 'BIGGER'] },
    { kind: 'slider', field: 'mouthY', label: 'Height', ends: ['LOWER', 'HIGHER'] },
  ] },
  { id: 'body', label: 'BODY', framing: 'body', rows: [
    { kind: 'items', field: 'bodyType', label: 'Body type', items: BODY_TYPES, view: 'body' },
  ] },
  { id: 'outfit', label: 'OUTFIT', framing: 'body', rows: [
    { kind: 'items', field: 'top', label: 'Top', items: TOPS, view: 'torso' },
    { kind: 'swatches', field: 'topColor', label: 'Top color', swatches: CLOTH_COLORS },
    { kind: 'items', field: 'bottom', label: 'Bottoms', items: BOTTOMS, view: 'legs' },
    { kind: 'swatches', field: 'bottomColor', label: 'Bottoms color', swatches: CLOTH_COLORS },
    { kind: 'items', field: 'shoes', label: 'Shoes', items: SHOES, view: 'feet', framing: 'feet' },
    { kind: 'swatches', field: 'shoeColor', label: 'Shoe color', swatches: CLOTH_COLORS, framing: 'feet' },
  ] },
  { id: 'accessories', label: 'ACCESSORIES', framing: 'face', rows: [
    { kind: 'items', field: 'headwear', label: 'Headwear', items: HEADWEAR, view: 'head' },
    { kind: 'swatches', field: 'headwearColor', label: 'Headwear color', swatches: CLOTH_COLORS, when: c => c.headwear !== 'none' },
    { kind: 'items', field: 'eyewear', label: 'Eyewear', items: EYEWEAR, view: 'head' },
    { kind: 'swatches', field: 'eyewearColor', label: 'Frame color', swatches: CLOTH_COLORS, when: c => c.eyewear !== 'none' },
    { kind: 'items', field: 'wristband', label: 'Wristband', items: WRISTBANDS, view: 'torso', framing: 'body' },
    { kind: 'swatches', field: 'wristbandColor', label: 'Wristband color', swatches: CLOTH_COLORS, framing: 'body', when: c => c.wristband !== 'none' },
  ] },
];
export const CREATOR_TABS = TABS.map(t => t.id);

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const escape = (text: string) => text.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const same = (a: AvatarConfig, b: AvatarConfig) => JSON.stringify(a) === JSON.stringify(b);

export interface CreatorHost {
  /** Show this draft on the preview rider. */
  preview(config: AvatarConfig): void;
  /** Keep this rider; returns an error message, or '' when saved. */
  save(config: AvatarConfig): string;
  /** Leave the creator (the draft is dropped unless it was saved). */
  close(): void;
  /** Rotate/zoom reset for the preview camera. */
  resetView(): void;
}

export class RiderCreator {
  draft: AvatarConfig = sanitizeAvatar(null);
  private saved: AvatarConfig = sanitizeAvatar(null);
  tab = 1;
  private row = 0;
  private col = 0;
  private confirm: null | { index: number } = null;
  private toastTimer = 0;
  private repeatKey = '';
  private repeatTimer = 0;
  private studio = new ThumbnailStudio();
  private root: HTMLElement | null = null;
  private timecode = 0;
  private startedAt = 0;

  constructor(private host: CreatorHost) {}

  get open() { return !!this.root; }

  /** What the preview camera should frame for the focused row. */
  get framing(): Framing {
    const tab = TABS[this.tab], row = this.rows()[this.row];
    return row?.framing ?? tab.framing;
  }

  start(root: HTMLElement, config: AvatarConfig) {
    this.draft = sanitizeAvatar(config);
    this.saved = structuredClone(this.draft);
    this.root = root;
    this.confirm = null;
    this.startedAt = performance.now();
    this.focusCurrent();
    this.render();
  }

  stop() {
    this.root = null;
    this.studio.release();
  }

  get dirty() { return !same(this.draft, this.saved); }

  /** Rows the current tab shows for this draft (colour rows hide with their item). */
  private rows(tab = this.tab) {
    return TABS[tab].rows.filter(r => !('when' in r) || !r.when || r.when(this.draft));
  }

  private cells(row: Row) {
    switch (row.kind) {
      case 'items': return row.items.length;
      case 'swatches': return row.swatches.length;
      case 'presets': return AVATAR_PRESETS.length + 1;
      default: return 1;
    }
  }

  /** Put the cursor on the chosen value of the first row. */
  private focusCurrent() {
    this.row = 0;
    const row = this.rows()[0];
    this.col = row ? Math.max(0, this.currentIndex(row)) : 0;
  }

  private currentIndex(row: Row) {
    if (row.kind === 'items') return row.items.findIndex(i => i.id === this.draft[row.field]);
    if (row.kind === 'swatches') return row.swatches.findIndex(s => s.id === this.draft[row.field]);
    if (row.kind === 'presets') return AVATAR_PRESETS.findIndex(p => same(p.config, this.draft));
    return 0;
  }

  private set(field: Field, value: unknown) {
    const next = { ...this.draft, [field]: value } as AvatarConfig;
    // Brows follow the hair colour until the brows are given their own.
    if (field === 'hairColor' && this.draft.browColor === this.draft.hairColor) next.browColor = value as string;
    this.apply(next);
  }

  private apply(next: AvatarConfig) {
    this.draft = sanitizeAvatar(next);
    this.host.preview(this.draft);
    this.render();
  }

  // ---- Actions -----------------------------------------------------------------

  switchTab(step: number) {
    this.tab = (this.tab + step + TABS.length) % TABS.length;
    this.studio.cancel();
    this.focusCurrent();
    this.render();
  }

  private choose(rowIndex = this.row, col = this.col) {
    const row = this.rows()[rowIndex];
    if (!row) return;
    if (row.kind === 'items') { const item = row.items[col]; if (item?.unlocked) this.set(row.field, item.id); }
    else if (row.kind === 'swatches') { const swatch = row.swatches[col]; if (swatch) this.set(row.field, swatch.id); }
    else if (row.kind === 'presets') {
      if (col === AVATAR_PRESETS.length) this.randomize();
      else if (AVATAR_PRESETS[col]) this.apply(structuredClone(AVATAR_PRESETS[col].config));
    }
  }

  private nudge(row: Row & { kind: 'slider' }, step: number) {
    const [min, max] = AVATAR_RANGES[row.field];
    const value = Math.max(min, Math.min(max, (this.draft[row.field] as number) + step));
    if (value !== this.draft[row.field]) this.set(row.field, value);
  }

  randomize() { this.apply(randomAvatar()); }

  saveRider() {
    const error = this.host.save(this.draft);
    if (error) { this.flash(error, 'error'); return false; }
    this.saved = structuredClone(this.draft);
    this.render();
    this.flash('RIDER SAVED!', 'saved');
    return true;
  }

  back() {
    if (this.confirm) { this.confirm = null; this.render(); return; }
    if (this.dirty) { this.confirm = { index: 0 }; this.render(); return; }
    this.host.close();
  }

  private confirmChoice(index: number) {
    this.confirm = null;
    if (index === 0) { if (this.saveRider()) this.host.close(); }
    else if (index === 1) { this.draft = structuredClone(this.saved); this.host.preview(this.draft); this.host.close(); }
    else this.render();
  }

  private flash(text: string, kind: 'saved' | 'error') {
    const toast = this.root?.querySelector<HTMLElement>('.cr-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.dataset.kind = kind;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1700);
  }

  // ---- Input ------------------------------------------------------------------

  update(input: InputFrame, dt: number) {
    if (!this.root) return;
    this.tickTimecode();
    const vertical = input.held.marker > 0.5 ? -1 : input.held.menuDown > 0.5 ? 1 : Math.abs(input.lean) > 0.5 ? Math.sign(input.lean) : 0;
    const horizontal = vertical ? 0 : input.held.menuLeft > 0.5 ? -1 : input.held.menuRight > 0.5 ? 1 : Math.abs(input.steer) > 0.6 ? Math.sign(input.steer) : 0;
    const key = vertical ? 'v' + vertical : horizontal ? 'h' + horizontal : '';
    if (!key) { this.repeatKey = ''; this.repeatTimer = 0; }
    else if (key !== this.repeatKey) { this.repeatKey = key; this.repeatTimer = 0.38; this.move(vertical, horizontal); }
    else if ((this.repeatTimer -= dt) <= 0) { this.repeatTimer = 0.1; this.move(vertical, horizontal); }
    if (input.pressed.hop) this.select();
    else if (input.pressed.brakeBars || input.pressed.pause) this.back();
    else if (this.confirm) return;
    else if (input.pressed.leftModifier) this.switchTab(-1);
    else if (input.pressed.rightModifier) this.switchTab(1);
    else if (input.pressed.pushDeck) this.randomize();
    else if (input.pressed.body) this.saveRider();
    else if (input.pressed.recenter) this.host.resetView();
  }

  select() {
    if (this.confirm) { this.confirmChoice(this.confirm.index); return; }
    const row = this.rows()[this.row];
    if (row?.kind === 'slider') return;
    this.choose();
  }

  private move(vertical: number, horizontal: number) {
    if (this.confirm) {
      this.confirm.index = (this.confirm.index + (vertical || horizontal) + 3) % 3;
      this.render();
      return;
    }
    const rows = this.rows(), row = rows[this.row];
    if (!row) return;
    if (horizontal) {
      if (row.kind === 'slider') { this.nudge(row, horizontal); return; }
      this.col = Math.max(0, Math.min(this.cells(row) - 1, this.col + horizontal));
      this.render();
      return;
    }
    // Up/down walk the lines of a wrapped grid first, then the rows.
    const columns = this.columns(this.row), line = Math.floor(this.col / columns), lines = Math.ceil(this.cells(row) / columns);
    if (row.kind !== 'slider' && line + vertical >= 0 && line + vertical < lines) {
      this.col = Math.min(this.cells(row) - 1, this.col + vertical * columns);
    } else {
      const next = this.row + vertical;
      if (next < 0 || next >= rows.length) return;
      const x = this.col % columns;
      this.row = next;
      const target = rows[next], targetColumns = this.columns(next), targetLines = Math.ceil(this.cells(target) / targetColumns);
      this.col = target.kind === 'slider' ? 0 : Math.min(this.cells(target) - 1, (vertical > 0 ? 0 : targetLines - 1) * targetColumns + Math.min(x, targetColumns - 1));
    }
    this.render();
  }

  /** Tiles per line in a row's grid, as laid out on screen. */
  private columns(rowIndex: number) {
    const grid = this.root?.querySelector(`[data-grid="${rowIndex}"]`);
    if (!grid) return 1;
    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
  }

  // ---- View -------------------------------------------------------------------

  private tickTimecode() {
    const el = this.root?.querySelector('.cr-tc');
    if (!el) return;
    const t = Math.floor((performance.now() - this.startedAt) / 1000 * 30);
    if (t === this.timecode) return;
    this.timecode = t;
    const f = t % 30, s = Math.floor(t / 30) % 60, m = Math.floor(t / 1800) % 60, h = Math.floor(t / 108000);
    el.textContent = `SP ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }

  private thumb(row: Row & { kind: 'items' }, item: CatalogItem) {
    if (!row.view) return '';
    const config = { ...this.draft, [row.field]: item.id } as AvatarConfig, key = row.field + ':' + item.id;
    const url = this.studio.get(sanitizeAvatar(config), row.view, done => {
      this.root?.querySelectorAll<HTMLImageElement>(`img[data-thumb="${CSS.escape(key)}"]`).forEach(img => { img.src = done; img.classList.add('ready'); });
    });
    return url ? `<img data-thumb="${escape(key)}" class="ready" src="${url}" alt="">` : `<img data-thumb="${escape(key)}" alt="">`;
  }

  render() {
    const root = this.root;
    if (!root) return;
    const tab = TABS[this.tab], rows = this.rows();
    this.row = Math.min(this.row, rows.length - 1);
    const scroll = root.querySelector('.cr-panel')?.scrollTop ?? 0;
    // The toast outlives re-renders (saving can re-render the menu mid-animation).
    const toast = root.querySelector('.cr-toast');
    const body = rows.map((row, r) => {
      const focusedRow = r === this.row;
      const cell = (c: number, cls: string, inner: string, label: string, chosen: boolean) =>
        `<button class="${cls}${focusedRow && c === this.col ? ' focused' : ''}${chosen ? ' chosen' : ''}" data-row="${r}" data-col="${c}" aria-label="${escape(label)}"${chosen ? ' aria-pressed="true"' : ''}>${inner}</button>`;
      let value = '', content = '';
      if (row.kind === 'items') {
        const current = row.items.find(i => i.id === this.draft[row.field]);
        value = current?.name ?? '';
        content = `<div class="cr-grid${row.view ? '' : ' words'}" data-grid="${r}">` + row.items.map((item, c) =>
          cell(c, 'cr-tile', `${this.thumb(row, item)}<span>${escape(item.name)}</span>${item.unlocked ? '' : '<i class="cr-lock">LOCKED</i>'}`, item.name, item.id === this.draft[row.field])).join('') + '</div>';
      } else if (row.kind === 'swatches') {
        const current = row.swatches.find(s => s.id === this.draft[row.field]);
        value = current?.name ?? '';
        content = `<div class="cr-swatches" data-grid="${r}">` + row.swatches.map((s, c) =>
          cell(c, 'cr-swatch', `<i style="--swatch:${hex(s.hex)}"></i>`, s.name, s.id === this.draft[row.field])).join('') + '</div>';
      } else if (row.kind === 'slider') {
        const [min, max] = AVATAR_RANGES[row.field], v = this.draft[row.field] as number, steps = max - min;
        value = (v > 0 ? '+' : '') + v;
        const ticks = Array.from({ length: steps + 1 }, (_, i) => `<b class="${i === v - min ? 'on' : ''}" data-row="${r}" data-step="${i + min}"></b>`).join('');
        content = `<div class="cr-fader${focusedRow ? ' focused' : ''}" data-row="${r}" style="--at:${(v - min) / steps}"><span class="cr-end">${row.ends[0]}</span><div class="cr-track">${ticks}<i class="cr-knob"></i></div><span class="cr-end">${row.ends[1]}</span></div>`;
      } else {
        value = AVATAR_PRESETS.find(p => same(p.config, this.draft))?.name ?? 'Custom rider';
        content = `<div class="cr-grid presets" data-grid="${r}">` + AVATAR_PRESETS.map((p, c) =>
          cell(c, 'cr-tile preset', `${this.presetThumb(p.config, c)}<span>${escape(p.name)}</span>`, p.name, same(p.config, this.draft))).join('')
          + cell(AVATAR_PRESETS.length, 'cr-tile preset shuffle', '<i class="cr-dice" aria-hidden="true"></i><span>Randomize</span>', 'Randomize rider', false) + '</div>';
      }
      return `<section class="cr-row${focusedRow ? ' focused' : ''} ${row.kind}"><h3 class="cr-label"><span>${escape(row.label)}</span><em>${escape(value)}</em></h3>${content}</section>`;
    }).join('');
    const tabs = TABS.map((t, i) => `<button role="tab" class="cr-tab${i === this.tab ? ' selected' : ''}" data-tab="${i}" aria-selected="${i === this.tab}">${t.label}</button>`).join('');
    const confirm = this.confirm ? `<div class="cr-confirm" role="alertdialog" aria-label="Unsaved rider"><div class="cr-confirm-card"><h2>SAVE YOUR RIDER?</h2><p>You changed this rider since the last save.</p>${['SAVE &amp; EXIT', 'DISCARD CHANGES', 'KEEP EDITING'].map((l, i) => `<button class="${i === this.confirm!.index ? 'focused' : ''}" data-confirm="${i}">${l}</button>`).join('')}</div></div>` : '';
    root.innerHTML = `
<section class="creator" data-framing="${this.framing}">
  <div class="cr-head">
    <div class="cr-kicker">RIDER CREATOR <span>/ SAME PHYSICS. YOUR STYLE.</span></div>
    <h1 class="cr-title">CUSTOMIZE RIDER</h1>
    <nav class="cr-tabs" role="tablist"><kbd class="pad bumper">LB</kbd><div class="cr-tab-strip">${tabs}</div><kbd class="pad bumper">RB</kbd></nav>
  </div>
  <div class="cr-panel" role="tabpanel" aria-label="${tab.label}">${body}</div>
  <div class="cr-actions">
    <button data-act="randomize"><kbd class="pad x">X</kbd>RANDOMIZE</button>
    <button data-act="save" class="${this.dirty ? 'hot' : ''}"><kbd class="pad y">Y</kbd>SAVE RIDER</button>
    <button data-act="back"><kbd class="pad b">B</kbd>BACK</button>
  </div>
</section>
<aside class="cr-stage" aria-hidden="true">
  <i class="cr-corner tl"></i><i class="cr-corner tr"></i><i class="cr-corner bl"></i><i class="cr-corner br"></i>
  <div class="cr-rec"><b></b>REC</div><div class="cr-tc">SP 0:00:00:00</div>
  <div class="cr-mode">${this.framing === 'face' ? 'FACE CAM' : this.framing === 'feet' ? 'KICKS CAM' : 'FULL BODY'}</div>
  <div class="cr-battery"><i></i><i></i><i></i></div>
  <div class="cr-hint"><kbd class="pad stick">RS</kbd>TURN · <kbd class="pad bumper">LT</kbd><kbd class="pad bumper">RT</kbd>ZOOM · <kbd class="pad stick">R3</kbd>RESET · DRAG / WHEEL</div>
</aside>
<div class="cr-toast" role="status"></div>${confirm}`;
    if (toast) root.querySelector('.cr-toast')!.replaceWith(toast);
    const panel = root.querySelector<HTMLElement>('.cr-panel')!;
    panel.scrollTop = scroll;
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => { b.onclick = () => { this.tab = +b.dataset.tab!; this.studio.cancel(); this.focusCurrent(); this.render(); }; });
    root.querySelectorAll<HTMLButtonElement>('[data-row][data-col]').forEach(b => {
      b.onclick = () => { this.row = +b.dataset.row!; this.col = +b.dataset.col!; this.choose(); };
    });
    root.querySelectorAll<HTMLElement>('.cr-fader b[data-step]').forEach(b => {
      b.onclick = () => { const row = this.rows()[+b.dataset.row!]; this.row = +b.dataset.row!; if (row?.kind === 'slider') this.set(row.field, +b.dataset.step!); };
    });
    root.querySelectorAll<HTMLButtonElement>('[data-confirm]').forEach(b => { b.onclick = () => this.confirmChoice(+b.dataset.confirm!); });
    root.querySelector<HTMLButtonElement>('[data-act=randomize]')!.onclick = () => this.randomize();
    root.querySelector<HTMLButtonElement>('[data-act=save]')!.onclick = () => this.saveRider();
    root.querySelector<HTMLButtonElement>('[data-act=back]')!.onclick = () => this.back();
    const focused = root.querySelector<HTMLElement>('.cr-row.focused .focused, .cr-row.focused .cr-fader');
    if (focused) this.reveal(focused, panel);
    root.querySelector('.cr-tab.selected')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  private presetThumb(config: AvatarConfig, index: number) {
    const url = this.studio.get(config, 'head', done => {
      this.root?.querySelectorAll<HTMLImageElement>(`img[data-preset="${index}"]`).forEach(img => { img.src = done; img.classList.add('ready'); });
    });
    return url ? `<img data-preset="${index}" class="ready" src="${url}" alt="">` : `<img data-preset="${index}" alt="">`;
  }

  /** Keep the focused tile inside the scrolling panel (never scrolls the page). */
  private reveal(el: HTMLElement, box: HTMLElement) {
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect(), margin = 14;
    const row = el.closest('.cr-row')?.getBoundingClientRect() ?? r;
    if (row.top < b.top + margin && row.height < b.height) box.scrollTop -= b.top + margin - row.top;
    else if (r.top < b.top + margin) box.scrollTop -= b.top + margin - r.top;
    else if (r.bottom > b.bottom - margin) box.scrollTop += r.bottom - (b.bottom - margin);
  }
}
