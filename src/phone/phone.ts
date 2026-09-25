import { uiSound } from '../audio/audio';
import * as THREE from 'three';
import type { InputFrame } from '../input/input';
import { PhoneScreen, SCREEN_H, SCREEN_W, type IconName, type Page } from './canvas-ui';
import './phone.css';
import { locale, onLocale, t } from '../i18n';

/**
 * The rider's phone (docs/briefs/PHONE-SYSTEM.md): one state machine, one app
 * registry and one screen. The screen canvas is shown in a hand-held bezel in
 * third person and is the texture of the 3D phone in first person, so both
 * views always show the same UI.
 *
 * States: hidden → drawing (reach, raise) → open → putting away (lower,
 * return) → hidden. `raise` (0..1) drives the rider's arm and head pose.
 */
export type PhoneState = 'hidden' | 'drawing' | 'open' | 'away';
export interface View {
  /** Status-bar title. */
  title: string;
  page: () => Page;
  /** Consumes controller input before generic navigation; return true when handled. */
  input?: (f: InputFrame, dt: number) => boolean;
  /** Redraw on a timer (progress bars, clocks, the map). */
  live?: boolean;
  /** B on this view puts the phone away (a world interaction opened it). */
  closesOnBack?: boolean;
}
export interface PhoneApp {
  id: string;
  label: string;
  icon: IconName;
  color: string;
  /** The app's first view. */
  open: () => View;
  badge?: () => string | undefined;
}
export interface SheetOption { label: string; detail?: string; action: () => void; disabled?: boolean }

const DRAW_TIME = 0.34, AWAY_TIME = 0.26;
const REPEAT_FIRST = 0.36, REPEAT_NEXT = 0.11;
/**
 * The home screen (#86): a 4 x 4 grid of apps fills the space under the clock
 * widget. LS turns the page at the grid's edge (and a swipe does); there are
 * no page buttons. X rearranges: A picks an app up, LS carries it, A puts it
 * down, X is done. On touch a long press starts rearranging and taps move apps.
 */
export const HOME_COLS = 4, HOME_ROWS = 4;
const HOME_SIZE = HOME_COLS * HOME_ROWS, HOME_ORDER_KEY = 'swf-phone-app-order-v1', LONG_PRESS = 0.55;

export class Phone {
  state: PhoneState = 'hidden';
  /** 0 in the pocket, 1 held up to read. */
  raise = 0;
  readonly screen = new PhoneScreen();
  readonly texture = new THREE.CanvasTexture(this.screen.canvas);
  readonly apps: PhoneApp[] = [];
  homePageIndex = 0;
  homeEditing = false;
  editingAppId = '';
  private savedOrder: string[] = [];
  /** The overlay shown in third person: the screen in a hand-held bezel. */
  readonly overlay = document.createElement('div');
  readonly toasts = document.createElement('div');
  /** First person uses the 3D phone; third person also shows the overlay. */
  firstPerson = false;
  notificationsEnabled = true;
  /** The home screen (set by the game once the apps are installed). */
  homePage: () => Page = () => ({ blocks: [] });
  /** Called after the phone is put away (clears held buttons in the game). */
  onClose = () => {};
  /** Called when it starts coming out. */
  onOpen = () => {};
  private stack: View[] = [];
  private repeat = 0;
  private heldDir = '';
  private dirty = true;
  private liveTimer = 0;
  private clock = '';
  private uploadTimer = 0;
  private pendingUpload = true;
  private pointer: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean; swipe: boolean } | null = null;
  private afterAway: (() => void) | null = null;

  constructor() {
    try { const order = JSON.parse(localStorage.getItem(HOME_ORDER_KEY) || '[]'); if (Array.isArray(order)) this.savedOrder = order.filter((id): id is string => typeof id === 'string').slice(0, 100); } catch {}
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.overlay.className = 'phone-overlay';
    this.overlay.hidden = true;
    const bezel = document.createElement('div');
    bezel.className = 'phone-bezel';
    const speaker = document.createElement('i');
    speaker.className = 'phone-speaker';
    const sticker = document.createElement('b');
    sticker.className = 'phone-sticker';
    sticker.textContent = 'SWF';
    const away = document.createElement('button');
    away.className = 'phone-away';
    away.type = 'button';
    away.setAttribute('aria-label', 'Put the phone away');
    away.textContent = '▼';
    away.addEventListener('click', () => this.close());
    this.screen.canvas.className = 'phone-screen';
    bezel.append(speaker, this.screen.canvas, sticker, away);
    this.overlay.append(bezel);
    this.toasts.className = 'phone-toasts';
    document.body.append(this.overlay, this.toasts);
    this.screen.onBack = () => this.back();
    this.screen.onHome = () => this.home();
    onLocale(() => this.refresh());
    window.addEventListener('swf-palette-change', () => this.refresh());
    const canvas = this.screen.canvas;
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, swipe: false };
      canvas.setPointerCapture(e.pointerId);
      // A long press on an app starts rearranging with that app picked up.
      const pointer = this.pointer, r = canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * SCREEN_W, py = ((e.clientY - r.top) / r.height) * SCREEN_H;
      window.setTimeout(() => {
        if (this.pointer !== pointer || pointer.moved || this.view || this.homeEditing) return;
        const t = this.screen.hit(px, py);
        if (!t?.id.startsWith('app-')) return;
        this.homeEditing = true; this.editingAppId = t.id.slice(4); this.screen.focusId = t.id;
        pointer.moved = true; uiSound('select'); this.refresh();
      }, LONG_PRESS * 1000);
    });
    canvas.addEventListener('pointermove', e => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.startX, dy = e.clientY - p.y, scale = SCREEN_H / canvas.getBoundingClientRect().height;
      if (!this.view && (p.swipe || Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(e.clientY - p.startY) * 1.2)) { p.swipe = p.moved = true; return; }
      if (Math.abs(dy) > 6 || p.moved) {
        p.moved = true;
        this.screen.scrollBy(-dy * scale);
        p.y = e.clientY;
        this.dirty = true;
      }
    });
    canvas.addEventListener('pointerup', e => {
      const p = this.pointer;
      this.pointer = null;
      if (!p || p.id !== e.pointerId) return;
      if (p.swipe) { const dx = e.clientX - p.startX; if (Math.abs(dx) > 50) this.shiftHomePage(dx < 0 ? 1 : -1); return; }
      if (p.moved) return;
      const r = canvas.getBoundingClientRect();
      this.tap(((e.clientX - r.left) / r.width) * SCREEN_W, ((e.clientY - r.top) / r.height) * SCREEN_H);
    });
    canvas.addEventListener('pointercancel', () => (this.pointer = null));
    // The screen is drawn with the sticker fonts; redraw once they have loaded.
    void document.fonts?.load('26px Bungee').then(() => this.refresh(), () => {});
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.screen.scrollBy(e.deltaY * 0.6); this.dirty = true; }, { passive: false });
  }

  register(app: PhoneApp) { this.apps.push(app); this.apps.sort((a,b) => { const ai=this.savedOrder.indexOf(a.id),bi=this.savedOrder.indexOf(b.id); return (ai<0?Infinity:ai)-(bi<0?Infinity:bi); }); }
  get homePageCount() { return Math.max(1, Math.ceil(this.apps.length / HOME_SIZE)); }
  get homeApps() { return this.apps.slice(this.homePageIndex * HOME_SIZE, (this.homePageIndex + 1) * HOME_SIZE); }
  setHomePage(index: number) { const next=Math.max(0,Math.min(this.homePageCount-1,index));if(next===this.homePageIndex)return;this.homePageIndex=next;if(this.homeEditing&&!this.homeApps.some(a=>a.id===this.editingAppId))this.editingAppId='';this.screen.focusId='';this.screen.resetScroll();this.dirty=true; }
  shiftHomePage(step: number) { this.setHomePage(this.homePageIndex+step); }
  /** Moves an app `step` places along the home order (a row is HOME_COLS), saving the order. */
  moveApp(id: string, step: number) { const from=this.apps.findIndex(a=>a.id===id);return from>=0&&this.moveAppTo(id,from+step); }
  moveAppTo(id: string, index: number) {
    const from=this.apps.findIndex(a=>a.id===id),to=Math.max(0,Math.min(this.apps.length-1,index));
    if(from<0||to===from)return false;
    const [app]=this.apps.splice(from,1);this.apps.splice(to,0,app);
    this.savedOrder=this.apps.map(a=>a.id);try{localStorage.setItem(HOME_ORDER_KEY,JSON.stringify(this.savedOrder));}catch{}
    this.setHomePage(Math.floor(to/HOME_SIZE));this.screen.focusId='app-'+id;this.refresh();return true;
  }
  /** Rearranging on or off (X on the home screen). */
  setHomeEditing(on: boolean) { if(this.view)return;this.homeEditing=on;this.editingAppId='';this.refresh(); }
  get active() { return this.state !== 'hidden'; }
  /** Accepting input: fully out. */
  get ready() { return this.state === 'open'; }
  get view(): View | null { return this.stack.at(-1) ?? null; }

  /** Takes the phone out, on the home screen or straight into an app or view. */
  open(target?: string | View) {
    this.stack = [];
    this.homePageIndex = 0; this.homeEditing = false; this.editingAppId = '';
    if (typeof target === 'string') { const app = this.apps.find(a => a.id === target); if (app) this.stack.push(app.open()); }
    else if (target) this.stack.push(target);
    this.screen.focusId = '';
    this.screen.resetScroll();
    this.dirty = true;
    this.afterAway = null;
    if (this.state === 'hidden' || this.state === 'away') {
      this.state = 'drawing';
      this.onOpen();
    }
  }
  /** Puts the phone away (animated). `then` runs once it is back in the pocket. */
  close(then?: () => void) {
    if (then) this.afterAway = then;
    if (this.state === 'hidden') { this.finishAway(); return; }
    if (this.state !== 'away') this.state = 'away';
  }
  /** Straight back into the pocket: pause, crashes, map changes. */
  stow() {
    if (this.state === 'hidden') return;
    this.raise = 0;
    this.finishAway();
  }
  private finishAway() {
    const wasOut = this.state !== 'hidden';
    this.state = 'hidden';
    this.raise = 0;
    this.stack = [];
    this.overlay.hidden = true;
    this.overlay.style.removeProperty('--raise');
    const then = this.afterAway;
    this.afterAway = null;
    if (wasOut) this.onClose();
    then?.();
  }

  push(view: View) {
    this.stack.push(view);
    this.screen.focusId = '';
    this.screen.resetScroll();
    this.dirty = true;
  }
  /** Replaces the current view (a refreshed sheet, a sub-page swap). */
  replace(view: View) {
    this.stack.pop();
    this.push(view);
  }
  back() {
    const view = this.view;
    if (!view) { this.close(); return; }
    if (view.closesOnBack && this.stack.length === 1) { this.close(); return; }
    this.stack.pop();
    this.screen.focusId = '';
    this.screen.resetScroll();
    this.dirty = true;
  }
  home() {
    this.stack = [];
    this.homePageIndex = 0; this.homeEditing = false; this.editingAppId = '';
    this.screen.focusId = '';
    this.screen.resetScroll();
    this.dirty = true;
  }
  /** Redraw on the next update (state an app shows has changed). */
  refresh() { this.dirty = true; }

  /**
   * A list of choices, as a phone page. World interactions (vending machines)
   * open the phone straight into one; choosing an option runs it and puts the
   * phone away unless the option opened another sheet.
   */
  sheet(title: string, options: SheetOption[], sub?: string) {
    const fromWorld = !this.active;
    const view: View = {
      title,
      closesOnBack: fromWorld,
      page: () => ({
        blocks: [
          { type: 'title', text: title, sub },
          {
            type: 'list',
            rows: options.map((o, i) => ({
              id: 'sheet-' + i,
              label: o.label,
              detail: o.detail,
              disabled: o.disabled,
              action: () => {
                const depth = this.stack.length, top = this.view;
                o.action();
                // An option that pushed a follow-up sheet keeps the phone out; one
                // that already put it away (placing a ramp) is left alone.
                if (this.view !== top || this.stack.length !== depth || this.state !== 'open') return;
                if (fromWorld) this.close();
                else this.back();
              },
            })),
          },
        ],
      }),
    };
    if (fromWorld) this.open(view);
    else this.push(view);
  }

  /**
   * The wallet while the phone is held flat to a card reader (#88), drawn
   * straight onto the screen without taking the phone out: the amount, then a
   * tick or a cross. null hands the screen back to whatever it showed.
   */
  payScreen(state: 'pay' | 'approved' | 'declined' | null, price = 0, label = '') {
    if (!state) { this.dirty = true; return; }
    const clock = new Date().toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
    this.screen.chrome = { title: 'WALLET', time: clock, battery: 0.72, canBack: false };
    const ok = state === 'approved', bad = state === 'declined';
    this.screen.draw({ blocks: [
      { type: 'title', text: ok ? 'Paid' : bad ? 'Declined' : 'Hold near reader', sub: label },
      { type: 'image', height: 380, frame: false, draw: (g, x, y, w) => {
        // The card, then the waves or the result under it.
        const cw = w - 20, ch = cw * 0.62, cx = x + 10, cy = y + 10;
        const grad = g.createLinearGradient(cx, cy, cx + cw, cy + ch); grad.addColorStop(0, '#19bcd6'); grad.addColorStop(1, '#0b5f7a');
        g.fillStyle = grad; g.beginPath(); g.roundRect(cx, cy, cw, ch, 18); g.fill();
        g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '900 26px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText('SWF PAY', cx + 20, cy + 42);
        g.font = '800 34px sans-serif'; g.fillText(price + ' Coins', cx + 20, cy + ch - 26);
        g.fillStyle = '#e8c64a'; g.beginPath(); g.roundRect(cx + cw - 70, cy + 22, 48, 36, 6); g.fill();
        const my = cy + ch + 100, mx = x + w / 2;
        if (ok || bad) {
          g.fillStyle = ok ? '#2fbf5a' : '#e0402e'; g.beginPath(); g.arc(mx, my, 56, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#ffffff'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath();
          if (ok) { g.moveTo(mx - 26, my + 2); g.lineTo(mx - 6, my + 22); g.lineTo(mx + 28, my - 20); }
          else { g.moveTo(mx - 22, my - 22); g.lineTo(mx + 22, my + 22); g.moveTo(mx + 22, my - 22); g.lineTo(mx - 22, my + 22); }
          g.stroke();
        } else {
          g.strokeStyle = '#19bcd6'; g.lineWidth = 8; g.lineCap = 'round';
          for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(mx - 40, my, 20 + i * 18, -0.75, 0.75); g.stroke(); }
        }
      } },
    ] });
    this.texture.needsUpdate = true;
  }

  /** Small, non-blocking notification. Never opens the phone. */
  notify(title: string, body: string, icon: IconName | '' = '') {
    if (!this.notificationsEnabled) return;
    const toast = document.createElement('div');
    toast.className = 'phone-toast' + (icon ? ' phone-toast-' + icon : '');
    const t = document.createElement('strong');
    t.textContent = title;
    const b = document.createElement('span');
    b.textContent = body;
    toast.append(t, b);
    this.toasts.append(toast);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    requestAnimationFrame(() => toast.classList.add('in'));
    window.setTimeout(() => { toast.classList.remove('in'); window.setTimeout(() => toast.remove(), 320); }, 3600);
  }

  /** Controller input while the phone is out. Gameplay receives nothing meanwhile. */
  update(f: InputFrame, dt: number) {
    if (this.state !== 'open') return;
    // Only the left stick moves the focus. The D-pad is left out entirely: its
    // Down button is held to take the phone out and put it away (HoldButton),
    // and a D-pad step riding on that hold jumped the focus as the phone opened.
    const view = this.view;
    if (view?.input?.(f, dt)) { this.dirty = true; return; }
    if (f.pressed.brakeBars) { uiSound('back'); this.back(); return; }
    if (f.pressed.body) { uiSound('back'); this.home(); return; }
    if (f.pressed.hop) { uiSound('select'); this.screen.activate(); this.dirty = true; return; }
    if (f.pressed.pushDeck && !view) { uiSound('select'); this.setHomeEditing(!this.homeEditing); return; }
    const x = f.steer, y = f.lean;
    const dir = Math.abs(x) > 0.5 && Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : Math.abs(y) > 0.5 ? (y > 0 ? 'down' : 'up') : '';
    if (!dir) { this.heldDir = ''; return; }
    if (dir === this.heldDir) {
      this.repeat -= dt;
      if (this.repeat > 0) return;
      this.repeat = REPEAT_NEXT;
    } else { this.heldDir = dir; this.repeat = REPEAT_FIRST; }
    const focused = this.screen.focusId;
    // Rearranging with an app picked up: LS carries it through the grid.
    if (!view && this.homeEditing && this.editingAppId) {
      if (this.moveApp(this.editingAppId, dir === 'left' ? -1 : dir === 'right' ? 1 : dir === 'up' ? -HOME_COLS : HOME_COLS)) uiSound('move');
      this.dirty = true;
      return;
    }
    if (dir === 'left' || dir === 'right') {
      if (!this.screen.adjust(dir === 'left' ? -1 : 1)) { const before=this.screen.focusId;this.screen.move(dir === 'left' ? -1 : 1, 0);if(!this.view&&before===this.screen.focusId)this.shiftHomePage(dir==='left'?-1:1); }
      else uiSound('move');
    } else this.screen.move(0, dir === 'up' ? -1 : 1);
    if (this.screen.focusId !== focused) uiSound('move');
    this.dirty = true;
  }

  /** Chooses the control with this id on the current page, as A would (tests, accessibility). */
  select(id: string) {
    if (this.state === 'hidden') return false;
    if (!this.view && id.startsWith('app-')) { const index=this.apps.findIndex(a=>'app-'+a.id===id);if(index>=0)this.setHomePage(Math.floor(index/HOME_SIZE)); }
    this.screen.draw(this.view ? this.view.page() : this.homePage());
    if (!this.screen.has(id)) return false;
    this.screen.focusId = id;
    this.screen.activate();
    this.dirty = true;
    return true;
  }
  /** A tap in screen pixels, from the overlay or the 3D screen. */
  tap(x: number, y: number) {
    if (this.state !== 'open') return;
    this.screen.tap(x, y);
    this.dirty = true;
  }

  /** Animation, redraws and the overlay. Call every frame. */
  tick(dt: number) {
    if (this.state === 'drawing') {
      this.raise = Math.min(1, this.raise + dt / DRAW_TIME);
      if (this.raise >= 1) this.state = 'open';
    } else if (this.state === 'away') {
      this.raise = Math.max(0, this.raise - dt / AWAY_TIME);
      if (this.raise <= 0) this.finishAway();
    }
    if (this.state === 'hidden') return;
    const now = new Date();
    const clock = now.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
    if (clock !== this.clock) { this.clock = clock; this.dirty = true; }
    const view = this.view;
    this.liveTimer -= dt;
    if ((view ? view.live : true) && this.liveTimer <= 0) { this.dirty = true; this.liveTimer = 0.25; }
    if (this.dirty) {
      this.dirty = false;
      const titleKey = view?.title === 'SESH MUSIC' ? 'phone.music' : view?.title === 'PIECE' ? 'phone.ui.piece' : view?.title === 'PLACED' ? 'phone.ui.placed' : this.apps.find(a => a.label === view?.title)?.id;
      this.screen.chrome = { title: titleKey ? t(titleKey.startsWith('phone.') ? titleKey : 'phone.'+titleKey) : view?.title ?? '', time: clock, battery: 0.72, canBack: true };
      this.screen.draw(view ? view.page() : this.homePage());
      this.pendingUpload = true;
    }
    // The 3D screen is a texture: uploaded on change, at most twice a second in
    // third person where it is only a few pixels tall.
    this.uploadTimer -= dt;
    if (this.pendingUpload && (this.firstPerson || this.uploadTimer <= 0)) {
      this.texture.needsUpdate = true;
      this.pendingUpload = false;
      this.uploadTimer = 0.5;
    }
    const eased = this.raise * this.raise * (3 - 2 * this.raise);
    this.overlay.hidden = this.firstPerson;
    this.overlay.style.setProperty('--raise', eased.toFixed(3));
    this.overlay.classList.toggle('ready', this.state === 'open');
  }
}
