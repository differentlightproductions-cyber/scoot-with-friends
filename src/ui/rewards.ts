// Rewards on screen: mission-complete stickers, the level-up slam, the level
// chip with its XP bar, and the crate opening (tap to shake, burst, reveal).
// The MissionTracker turns riding events into mission stats; the economy
// (data/credit.ts) settles them. Sounds are synthesised, nothing is loaded.
import type { Events } from "../core/events";
import type { InputFrame } from "../input/input";
import type { CreditEconomy } from "../data/credit";
import { completedDegrees } from "../tricks/resolver";
import { CRATE_COLOR, CRATE_NAME, RARITY_COLOR, RARITY_LABEL, levelFor, type Crate, type CrateResult, type Gains, type Stat } from "../data/progress";
import type { Progress } from "../data/progress";
import "./rewards.css";

// ---- Riding events -> mission stats ------------------------------------------
export class MissionTracker {
  private pending: Partial<Record<Stat, number>> = {};
  private linePoints = 0;
  private flushIn = 0;
  private hill = { started: false, top: 0 };
  dispose: () => void;
  constructor(events: Events, private economy: CreditEconomy) {
    this.dispose = events.on((e) => {
      if (e.type === "trick" && e.record?.landing !== "failed") {
        const raw = e.record?.raw, name = e.name;
        this.add("tricks", 1);
        if (e.record?.landing === "clean") this.add("perfect", 1);
        if (/Frontflip|Backflip|Flair/.test(name)) this.add("flips", 1);
        if (raw && completedDegrees(raw.bodyYaw) >= 360) this.add("spins", 1);
        if ((raw && (Math.abs(raw.deckTurns) >= 1 || Math.abs(raw.barTurns) >= 1 || (raw.fingerTurns ?? 0) >= 1)) || /whip|Barspin|Bri|Kickless|Buttercup/i.test(name)) this.add("whips", 1);
      }
      if (e.type === "grindCatch") this.add("grinds", 1);
      if (e.type === "banked") { this.add("points", e.points); this.linePoints += e.points; this.best("bestLinePoints", this.linePoints); }
      if (e.type === "line") { this.best("bestLine", e.names.length); if (e.ended) { this.linePoints = 0; this.flushIn = 0; } }
      if (e.type === "bail" || e.type === "reset") { this.linePoints = 0; this.hill.started = false; }
    });
  }
  private add(stat: Stat, amount: number) { this.pending[stat] = (this.pending[stat] ?? 0) + amount; if (!this.flushIn) this.flushIn = 0.6; }
  private best(stat: Stat, value: number) { this.pending[stat] = Math.max(this.pending[stat] ?? 0, value); if (!this.flushIn) this.flushIn = 0.6; }
  /** A map was ridden. */
  visit(count: number) { this.best("maps", count); }
  /**
   * B Hill: a run counts from the top banner to the finish without a bail or
   * reset; the top speed counts wherever it happens on the hill.
   */
  hillUpdate(station: number, length: number, speed: number, riding: boolean) {
    if (station < 110 && riding) this.hill.started = true;
    if (riding && speed > this.hill.top + 0.5) { this.hill.top = speed; this.best("bhillTop", Math.floor(speed)); }
    if (this.hill.started && station > length - 65) { this.hill.started = false; this.add("bhillRuns", 1); }
  }
  update(dt: number) {
    if (!this.flushIn) return;
    this.flushIn = Math.max(0, this.flushIn - dt);
    if (this.flushIn === 0) this.flush();
  }
  flush() {
    const changes = this.pending; this.pending = {};
    if (Object.keys(changes).length) void this.economy.track(changes);
  }
}

// ---- Sound ----------------------------------------------------------------------
let context: AudioContext | null = null;
function tone(freq: number, at: number, length: number, type: OscillatorType = "triangle", volume = 0.18, slide = 0) {
  try {
    context ??= new AudioContext();
    const c = context, t = c.currentTime + at, osc = c.createOscillator(), gain = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + length);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(c.destination); osc.start(t); osc.stop(t + length + 0.05);
  } catch { /* audio unavailable */ }
}
const sfx = {
  mission: () => { tone(660, 0, 0.12); tone(880, 0.09, 0.12); tone(1320, 0.18, 0.28, "sine", 0.14); },
  level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.35, "square", 0.08)); tone(1568, 0.34, 0.6, "sine", 0.12); },
  shake: (n: number) => { tone(140 + n * 60, 0, 0.1, "sawtooth", 0.06, 1.6); tone(90, 0, 0.14, "sine", 0.18, 0.5); },
  burst: (rank: number) => { tone(80, 0, 0.5, "sine", 0.3, 0.3); [784, 988, 1175, 1568, 1976].slice(0, 2 + rank).forEach((f, i) => tone(f, 0.05 + i * 0.07, 0.5, "triangle", 0.12)); },
  coin: () => { tone(1480, 0, 0.08, "square", 0.06); tone(1976, 0.07, 0.2, "square", 0.06); },
};

// ---- Confetti ---------------------------------------------------------------------
function confetti(host: HTMLElement, colors: string[], count = 140) {
  const canvas = document.createElement("canvas");
  canvas.className = "reward-confetti";
  canvas.width = innerWidth; canvas.height = innerHeight;
  host.append(canvas);
  const g = canvas.getContext("2d")!, cx = innerWidth / 2, cy = innerHeight * 0.45;
  const bits = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 14;
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 8, h: 3 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)] };
  });
  let frames = 0;
  const step = () => {
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.vy += 0.42; b.vx *= 0.985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2))); g.restore();
    }
    if (++frames < 150) requestAnimationFrame(step); else canvas.remove();
  };
  requestAnimationFrame(step);
}

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---- On-screen rewards --------------------------------------------------------------
export class RewardFx {
  readonly root = document.createElement("div");
  private toasts = document.createElement("div");
  private chip = document.createElement("div");
  private overlay: HTMLElement | null = null;
  private crateState: { crate: Crate; taps: number; result: CrateResult | null; busy: boolean } | null = null;
  /** Crates waiting after the one on screen (Open next). */
  private queue: Crate[] = [];
  /** Equip a revealed part; returns an error message or ''. */
  equip: (partId: string, variantId: string) => Promise<string> = async () => "";
  onClose = () => {};
  constructor(private economy: CreditEconomy, private progress: () => Progress) {
    this.root.className = "rewards-layer";
    this.toasts.className = "reward-toasts";
    this.chip.className = "level-chip";
    this.chip.hidden = true;
    this.root.append(this.toasts, this.chip);
    document.body.append(this.root);
  }
  get open() { return !!this.overlay; }

  /** The level chip in the HUD. */
  showChip(visible: boolean) {
    this.chip.hidden = !visible;
    if (!visible) return;
    const { level, into, need } = levelFor(this.progress().xp), crates = this.progress().crates.length;
    const key = `${level}:${into}:${crates}`;
    if (this.chip.dataset.key === key) return;
    this.chip.dataset.key = key;
    this.chip.innerHTML = `<b>LV ${level}</b><i><s style="width:${Math.round((into / need) * 100)}%"></s></i>${crates ? `<em>${crates} CRATE${crates > 1 ? "S" : ""}</em>` : ""}`;
  }

  /**
   * Stickers for completed missions (three on screen at most, the rest
   * following), then each level-up slam in turn, never over an open crate.
   */
  private stickers: (() => void)[] = [];
  private moments = Promise.resolve();
  celebrate(gains: Gains) {
    for (const c of gains.completed) this.stickers.push(() => this.toast(c.title, c.reward.credit, c.reward.xp, c.reward.crate ? CRATE_NAME[c.reward.crate] : ""));
    this.pumpStickers();
    for (const level of gains.levelsUp) {
      const crates = gains.crates.filter((c) => c.source === "Level " + level).map((c) => CRATE_NAME[c.tier]);
      this.moments = this.moments.then(async () => {
        while (this.overlay || this.stickers.length) await wait(300);
        this.levelUp(level, crates);
        await wait(2900);
      });
    }
  }
  private pumping = false;
  private async pumpStickers() {
    if (this.pumping) return;
    this.pumping = true;
    while (this.stickers.length) {
      while (this.overlay || this.toasts.children.length >= 3) await wait(250);
      this.stickers.shift()!();
      await wait(650);
    }
    this.pumping = false;
  }
  toast(title: string, credit: number, xp: number, crate = "") {
    const el = document.createElement("div");
    el.className = "reward-toast";
    el.innerHTML = `<span class="rt-label">MISSION COMPLETE</span><strong>${esc(title)}</strong><span class="rt-gain">+${credit} CREDIT · +${xp} XP${crate ? ` · <b>${esc(crate).toUpperCase()}</b>` : ""}</span>`;
    this.toasts.append(el);
    sfx.mission();
    setTimeout(() => el.classList.add("out"), 3600);
    setTimeout(() => el.remove(), 4200);
  }
  levelUp(level: number, crates: string[]) {
    const el = document.createElement("div");
    el.className = "level-up";
    el.innerHTML = `<div class="lu-rays"></div><div class="lu-card"><span>LEVEL UP</span><b>${level}</b>${crates.length ? `<em>+ ${esc(crates.join(" + ")).toUpperCase()}</em>` : ""}</div>`;
    this.root.append(el);
    sfx.level();
    confetti(el, ["#c6ff00", "#ff5a1f", "#1ecbe1", "#ffd23f", "#ffffff"], 90);
    setTimeout(() => el.classList.add("out"), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  /** A purchase: ka-ching, and a burst in the item's colour and rarity. */
  purchase(item: { rarity: keyof typeof RARITY_COLOR; color: number }) {
    tone(988, 0, 0.09, "square", 0.07); tone(1319, 0.08, 0.09, "square", 0.07); tone(1976, 0.16, 0.35, "triangle", 0.1);
    input_vibrate(90);
    confetti(this.root, [hex(item.color), RARITY_COLOR[item.rarity], "#ffd23f", "#ffffff"], 70);
  }

  /** Opens a crate on screen: A shakes it (three times), the third bursts it open. */
  openCrate(crate: Crate, queue: Crate[] = []) {
    this.closeOverlay();
    this.queue = queue.filter((c) => c.id !== crate.id);
    this.crateState = { crate, taps: 0, result: null, busy: false };
    const el = document.createElement("div");
    el.className = `crate-overlay tier-${crate.tier}`;
    el.style.setProperty("--tier", CRATE_COLOR[crate.tier]);
    el.innerHTML = `<div class="crate-rays"></div><div class="crate-title"><small>${esc(crate.source).toUpperCase()}</small><h2>${CRATE_NAME[crate.tier].toUpperCase()}</h2></div>
      <div class="crate-stage"><div class="crate-box"><div class="crate-lid"></div><div class="crate-body"><span class="crate-sticker">SCOOT<br>WITH<br>FRIENDS</span><i class="crate-strap"></i><i class="crate-strap"></i></div></div><div class="crate-card" hidden></div></div>
      <p class="crate-hint">A / TAP TO OPEN</p><div class="crate-actions" hidden></div>`;
    el.addEventListener("pointerdown", (e) => { if (!(e.target as HTMLElement).closest("button")) this.tap(); });
    this.root.append(el);
    this.overlay = el;
  }
  private async tap() {
    const s = this.crateState, el = this.overlay;
    if (!s || !el || s.busy || s.result) return;
    s.taps++;
    const box = el.querySelector<HTMLElement>(".crate-box")!;
    box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
    el.style.setProperty("--charge", String(s.taps / 3));
    sfx.shake(s.taps);
    input_vibrate(40 + s.taps * 30);
    if (s.taps === 2) {
      // The second shake already knows: the glow hints the rarity.
      s.busy = true;
      const result = await this.economy.openCrate(s.crate.id);
      s.busy = false;
      if (typeof result === "string") { el.querySelector(".crate-hint")!.textContent = result; return; }
      s.result = null;
      el.style.setProperty("--rarity", RARITY_COLOR[result.rarity]);
      el.classList.add("hint-" + result.rarity);
      (el as HTMLElement & { pending?: CrateResult }).pending = result;
    }
    if (s.taps >= 3) this.reveal((el as HTMLElement & { pending?: CrateResult }).pending!);
  }
  private reveal(result: CrateResult) {
    const s = this.crateState!, el = this.overlay!;
    s.result = result;
    const rank = ["common", "rare", "epic", "legendary"].indexOf(result.rarity);
    el.classList.add("open", "rarity-" + result.rarity);
    el.style.setProperty("--rarity", RARITY_COLOR[result.rarity]);
    sfx.burst(rank);
    setTimeout(() => sfx.coin(), 700);
    input_vibrate(120 + rank * 80);
    confetti(el, [RARITY_COLOR[result.rarity], "#ffffff", CRATE_COLOR[s.crate.tier], "#c6ff00"], 90 + rank * 50);
    const card = el.querySelector<HTMLElement>(".crate-card")!;
    const item = result.item;
    card.innerHTML = item
      ? `<span class="cc-rarity">${RARITY_LABEL[result.rarity]}${item.exclusive ? " · CRATE EXCLUSIVE" : ""}</span>
         <div class="cc-swatch" style="--c:${hex(item.color)};--a:${hex(item.accent ?? item.color)}"></div>
         <small>${esc(item.brand).toUpperCase()} · ${esc(item.category).toUpperCase()}</small>
         <strong>${esc(item.name.replace(item.brand + " ", ""))}</strong><em>${esc(item.variantName)}</em>
         <span class="cc-credit">+${result.credit} CREDIT</span>`
      : `<span class="cc-rarity">COLLECTION COMPLETE</span><div class="cc-swatch coin"></div><strong>You own everything</strong><em>Paid out in Credit instead</em><span class="cc-credit">+${result.credit} CREDIT</span>`;
    card.hidden = false;
    el.querySelector<HTMLElement>(".crate-hint")!.hidden = true;
    const actions = el.querySelector<HTMLElement>(".crate-actions")!;
    const button = (label: string, action: () => void, primary = false) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (primary) b.className = "primary"; b.onclick = action; actions.append(b); return b; };
    if (item?.rideable === "scooter") button("EQUIP NOW", async () => { const error = await this.equip(item.partId, item.variantId); if (error) el.querySelector<HTMLElement>(".crate-card small")!.textContent = error; else this.closeOverlay(); });
    const next = this.queue[0];
    if (next) button(`OPEN NEXT (${this.queue.length})`, () => this.openCrate(next, this.queue), true);
    button("NICE!", () => this.closeOverlay(), !next);
    actions.hidden = false;
    setTimeout(() => actions.querySelector<HTMLButtonElement>("button.primary, button")?.focus(), 400);
  }
  closeOverlay() {
    if (!this.overlay) return;
    this.overlay.remove(); this.overlay = null; this.crateState = null;
    this.onClose();
  }
  /** Controller: A taps / confirms, LS moves between buttons, B closes once revealed. */
  private cooldown = 0;
  update(input: InputFrame, dt: number) {
    if (!this.overlay) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const revealed = !!this.crateState?.result;
    if (!revealed) { if (input.pressed.hop) void this.tap(); return; }
    const buttons = [...this.overlay.querySelectorAll<HTMLButtonElement>(".crate-actions button")];
    const dir = Math.abs(input.lean) > 0.5 ? Math.sign(input.lean) : 0;
    if (dir && !this.cooldown && buttons.length) { const i = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(i + dir + buttons.length) % buttons.length].focus(); this.cooldown = 0.22; }
    if (input.pressed.hop) (buttons.includes(document.activeElement as HTMLButtonElement) ? (document.activeElement as HTMLButtonElement) : buttons.at(-1))?.click();
    if (input.pressed.brakeBars || input.pressed.pause) this.closeOverlay();
  }
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function input_vibrate(ms: number) { try { for (const pad of navigator.getGamepads?.() ?? []) (pad as Gamepad & { vibrationActuator?: { playEffect: (t: string, p: object) => void } })?.vibrationActuator?.playEffect("dual-rumble", { duration: ms, strongMagnitude: 0.5, weakMagnitude: 0.4 }); } catch { /* no rumble */ } }
