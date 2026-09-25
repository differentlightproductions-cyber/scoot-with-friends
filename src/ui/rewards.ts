// Rewards on screen: mission-complete stickers, compact level notices, the level
// chip with its XP bar, and the crate opening (tap to shake, burst, reveal).
// The MissionTracker turns riding events into mission stats; the economy
// (data/credit.ts) settles them. Sounds are synthesised, nothing is loaded.
import { uiBus } from "../audio/audio";
import type { Events } from "../core/events";
import type { InputFrame } from "../input/input";
import type { CreditEconomy } from "../data/credit";
import { completedDegrees } from "../tricks/resolver";
import { CRATE_COLOR, CRATE_NAME, FIRST_COUNT, FIRST_TRICKS, tallyPart, RARITY_COLOR, RARITY_LABEL, levelFor, type Crate, type CrateResult, type Gains, type Stat } from "../data/progress";
import type { Progress } from "../data/progress";
import "./rewards.css";

// ---- Riding events -> mission stats ------------------------------------------
/** What the tracker reads from the simulation each frame (physics/simulation.ts). */
interface RiderState { walking: boolean; speed: number; state: string; grind: unknown; tricks: { quarterAir: boolean } }
/** Starter mission thresholds (data/progress.ts STARTER). */
const FIRST_SPEED = 20 / 3.6, FIRST_DISTANCE = 150, FIRST_GRIND = 3;
export class MissionTracker {
  private pending: Partial<Record<Stat, number>> = {};
  private linePoints = 0;
  private flushIn = 0;
  private hill = { started: false, top: 0 };
  /** Starter steps seen since the last flush: one-time steps once a session, counted ones every time. */
  private firsts: string[] = [];
  /** Tricks landed since the last flush (the trick tracker): each part, and multi-part tricks by name. */
  private tally: Record<string, number> = {};
  private comboTricks: Record<string, number> = {};
  private reported = new Set<string>();
  private ridden = 0;
  private grindRun = 0;
  private quarterAir = false;
  private inQuarterAir = false;
  private longGrind = false;
  dispose: () => void;
  constructor(events: Events, private economy: CreditEconomy) {
    this.dispose = events.on((e) => {
      if (e.type === "push") this.first("push");
      if (e.type === "grindCatch") this.first("grind");
      if (e.type === "landing") { if (this.quarterAir && e.quality !== "failed") this.first("quarterLand"); this.quarterAir = false; }
      if (e.type === "trick" && e.record?.landing !== "failed") {
        const raw = e.record?.raw, name = e.name;
        for (const [first, pattern] of FIRST_TRICKS) if (pattern.test(name)) this.first(first);
        if (raw && completedDegrees(raw.bodyYaw) >= 180) this.first("spin:180");
        if (raw && completedDegrees(raw.bodyYaw) >= 360) this.first("spin:360");
        this.add("tricks", 1);
        // Named tricks (Flair, Truck Driver) count as themselves; the rest by their parts.
        const parts = (e.record?.recognized ? name.split(" + ") : e.record?.components?.length ? e.record.components : [name]).map(tallyPart).filter(Boolean);
        for (const part of parts) this.tally[part] = (this.tally[part] ?? 0) + 1;
        if (parts.length > 1) this.comboTricks[name] = (this.comboTricks[name] ?? 0) + 1;
        if (e.record?.landing === "clean") this.add("perfect", 1);
        if (/Frontflip|Backflip|Flair/.test(name)) this.add("flips", 1);
        if (raw && completedDegrees(raw.bodyYaw) >= 360) this.add("spins", 1);
        if ((raw && (Math.abs(raw.deckTurns) >= 1 || Math.abs(raw.barTurns) >= 1 || (raw.fingerTurns ?? 0) >= 1)) || /whip|Barspin|Bri|Kickless|Buttercup/i.test(name)) this.add("whips", 1);
      }
      if (e.type === "grindCatch") { this.add("grinds", 1); if (e.name) this.tally[e.name] = (this.tally[e.name] ?? 0) + 1; }
      if (e.type === "banked") { this.add("points", e.points); this.linePoints += e.points; this.best("bestLinePoints", this.linePoints); }
      if (e.type === "line") { this.best("bestLine", e.names.length); if (e.ended) { this.linePoints = 0; this.flushIn = 0; if (e.names.length >= 2) this.add("combos", 1); } }
      if (e.type === "bail" || e.type === "reset") { this.linePoints = 0; this.hill.started = false; }
    });
  }
  private add(stat: Stat, amount: number) { this.pending[stat] = (this.pending[stat] ?? 0) + amount; if (!this.flushIn) this.flushIn = 0.6; }
  /** A Starter mission step (push, trick:Tailwhip, phone...). Counted steps (5 Tailwhips) report every time. */
  first(key: string) {
    if (this.reported.has(key)) return;
    if (!FIRST_COUNT.has(key)) this.reported.add(key);
    this.firsts.push(key); if (!this.flushIn) this.flushIn = 0.6;
  }
  /** Riding firsts read from the simulation: speed, distance, quarter-pipe air, a long grind. */
  sample(sim: RiderState, dt: number) {
    if (sim.walking || sim.state === "Bail") { this.grindRun = 0; this.longGrind = false; this.inQuarterAir = false; return; }
    if (sim.speed >= FIRST_SPEED) this.first("speed");
    this.ridden += sim.speed * dt;
    if (this.ridden >= FIRST_DISTANCE) this.first("distance");
    // Counted steps: once per air and once per grind, not once per frame.
    if (sim.tricks.quarterAir && !this.inQuarterAir) { this.quarterAir = true; this.first("quarterAir"); }
    this.inQuarterAir = sim.tricks.quarterAir;
    this.grindRun = sim.grind ? this.grindRun + sim.speed * dt : 0;
    if (this.grindRun >= FIRST_GRIND && !this.longGrind) { this.longGrind = true; this.first("grindLong"); }
    if (!this.grindRun) this.longGrind = false;
  }
  private best(stat: Stat, value: number) { this.pending[stat] = Math.max(this.pending[stat] ?? 0, value); if (!this.flushIn) this.flushIn = 0.6; }
  /** Someone else's litter went in a trash can (Clean-Up Crew, #58). */
  litter() { this.add("litter", 1); }
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
    const changes = this.pending, firsts = this.firsts, landed = { tally: this.tally, combos: this.comboTricks };
    this.pending = {}; this.firsts = []; this.tally = {}; this.comboTricks = {};
    if (Object.keys(changes).length || firsts.length || Object.keys(landed.tally).length) void this.economy.track(changes, undefined, firsts, landed);
  }
}

// ---- Sound ----------------------------------------------------------------------
// Jingles play on the game's UI bus (#71), so the UI and master levels and the Sound switch apply.
function tone(freq: number, at: number, length: number, type: OscillatorType = "triangle", volume = 0.18, slide = 0) {
  try {
    const bus = uiBus();
    if (!bus) return;
    const c = bus.context, t = c.currentTime + at, osc = c.createOscillator(), gain = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + length);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(bus.node); osc.start(t); osc.stop(t + length + 0.05);
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
  private openedResults: { crate: Crate; result: CrateResult }[] = [];
  private openedIndex = 0;
  private openingAll = false;
  /** Equip a revealed part; returns an error message or ''. */
  equip: (partId: string, variantId: string) => Promise<string> = async () => "";
  /** Render the existing part preview into a revealed crate card. */
  preview: (partId: string, variantId: string, container: HTMLElement) => void = () => {};
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
   * Compact notices for missions, stored crates and levels; never interrupt riding.
   */
  private stickers: (() => void)[] = [];
  celebrate(gains: Gains) {
    for (const c of gains.completed) this.stickers.push(() => this.toast(c.title, c.reward.credit, c.reward.xp, c.reward.crate ? CRATE_NAME[c.reward.crate] : ""));
    for (const crate of gains.crates) this.stickers.push(() => this.crateAdded(crate));
    for (const level of gains.levelsUp) {
      // Exactly one reward per level (#55): a crate, or a novelty or snack straight into the pockets.
      const crates = [...gains.crates.filter((c) => c.source === "Level " + level).map((c) => CRATE_NAME[c.tier]), ...gains.items.filter((i) => i.source === "Level " + level).map((i) => i.kind)];
      this.stickers.push(() => this.levelUp(level, crates));
    }
    void this.pumpStickers();
  }
  private pumping = false;
  private async pumpStickers() {
    if (this.pumping) return;
    this.pumping = true;
    while (this.stickers.length) {
      while (this.overlay || this.toasts.children.length >= 2) await wait(250);
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
    setTimeout(() => el.classList.add("out"), 2800);
    setTimeout(() => el.remove(), 3300);
  }
  private crateAdded(crate: Crate) {
    const el = document.createElement('div');
    el.className = 'reward-toast crate-added';
    el.innerHTML = `<span class="rt-label">CRATE ADDED</span><strong>${CRATE_NAME[crate.tier]}</strong><span class="rt-gain">Open it later from CRATES or your phone</span>`;
    this.toasts.append(el); sfx.coin();
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3300);
  }
  /** A phone-shop package arriving: a sticker in the same kit as missions. */
  delivered(name: string) {
    this.stickers.push(() => {
      const el = document.createElement("div");
      el.className = "reward-toast delivered";
      el.innerHTML = `<span class="rt-label">PACKAGE DELIVERED</span><strong>${esc(name)}</strong><span class="rt-gain">In your parts · equip it from <b>RIDES</b></span>`;
      this.toasts.append(el); sfx.coin();
      setTimeout(() => el.classList.add("out"), 2800);
      setTimeout(() => el.remove(), 3300);
    });
    this.pumpStickers();
  }
  /** The first time in the lake: a splashy sticker (the rider throws both arms up in the water too). */
  firstSwim() {
    this.stickers.push(() => {
      const el = document.createElement("div");
      el.className = "reward-toast first-swim";
      el.innerHTML = `<span class="rt-label">FIRST SWIM</span><strong>Cannonball season is open</strong><span class="rt-gain">Swim with LS · Click LS to swim faster · Hold B to dive, A to come up · Stop stroking and you sink · Swim to the edge to climb out</span>`;
      this.toasts.append(el); sfx.coin();
      confetti(el, ["#1ecbe1", "#86c3d5", "#ffffff", "#c6ff00"], 40);
      setTimeout(() => el.classList.add("out"), 3400);
      setTimeout(() => el.remove(), 3900);
    });
    this.pumpStickers();
  }
  levelUp(level: number, crates: string[]) {
    const el = document.createElement("div");
    el.className = "reward-toast level-reward";
    el.innerHTML = `<span class="rt-label">LEVEL UP</span><strong>LEVEL ${level}</strong>${crates.length ? `<span class="rt-gain">+ ${esc(crates.join(" + ")).toUpperCase()}</span>` : ''}`;
    this.toasts.append(el);
    sfx.level();
    setTimeout(() => el.classList.add("out"), 2800);
    setTimeout(() => el.remove(), 3300);
  }

  /** A purchase: ka-ching, and a burst in the item's colour and rarity. */
  purchase(item: { rarity: keyof typeof RARITY_COLOR; color: number }) {
    tone(988, 0, 0.09, "square", 0.07); tone(1319, 0.08, 0.09, "square", 0.07); tone(1976, 0.16, 0.35, "triangle", 0.1);
    input_vibrate(90);
    confetti(this.root, [hex(item.color), RARITY_COLOR[item.rarity], "#ffd23f", "#ffffff"], 70);
  }

  /** Opens a crate on screen: A shakes it (three times), the third bursts it open. */
  openCrate(crate: Crate, queue: Crate[] = []) {
    if (this.openingAll || this.crateState?.busy) return;
    this.openedResults = [];
    this.queue = queue.filter((c) => c.id !== crate.id);
    this.showCrate(crate);
  }
  /** Open every saved crate once, then review the already-granted results. */
  async openAll(crates: Crate[]): Promise<void> {
    if (this.overlay || this.openingAll || !crates.length) return;
    const pending = [...new Map(crates.map(crate => [crate.id, crate])).values()];
    this.queue = []; this.openedResults = []; this.openedIndex = 0;
    this.showCrate(pending[0]);
    this.openingAll = true;
    this.crateState!.busy = true;
    let error = '';
    for (const [index, crate] of pending.entries()) {
      this.overlay!.querySelector('.crate-hint')!.textContent = `OPENING ${index + 1} / ${pending.length}`;
      try {
        const result = await this.economy.openCrate(crate.id);
        if (typeof result === 'string') { error = result; break; }
        this.openedResults.push({ crate, result });
      } catch (failure) { error = failure instanceof Error ? failure.message : 'Could not open that crate.'; break; }
    }
    this.openingAll = false;
    if (this.openedResults.length) this.showOpened(0);
    else {
      this.crateState!.busy = false;
      this.crateState!.taps = 1;
      this.overlay!.querySelector('.crate-hint')!.textContent = `${error || 'No crates opened.'} / TAP TO RETRY OR BACK`;
    }
    if (error && this.openedResults.length) this.overlay!.querySelector('.crate-actions')!.insertAdjacentHTML('afterbegin', `<p class="crate-batch-error">${esc(error)}. Unopened crates remain in your inventory.</p>`);
  }
  private showCrate(crate: Crate) {
    this.overlay?.remove();
    this.crateState = { crate, taps: 0, result: null, busy: false };
    const el = document.createElement("div");
    el.className = `crate-overlay tier-${crate.tier}`;
    el.style.setProperty("--tier", CRATE_COLOR[crate.tier]);
    el.innerHTML = `<div class="crate-rays"></div><div class="crate-title"><small>${esc(crate.source).toUpperCase()}</small><h2>${CRATE_NAME[crate.tier].toUpperCase()}</h2></div>
      <div class="crate-stage"><div class="crate-box"><div class="crate-lid"></div><div class="crate-body"><span class="crate-sticker">SCOOT<br>WITH<br>FRIENDS</span><i class="crate-strap"></i><i class="crate-strap"></i></div></div><div class="crate-card" hidden></div></div>
      <p class="crate-hint">A / TAP TO OPEN</p><button class="crate-cancel" type="button">BACK</button><div class="crate-actions" hidden></div>`;
    el.addEventListener("pointerdown", (e) => { if (!(e.target as HTMLElement).closest("button")) void this.tap(); });
    el.querySelector<HTMLButtonElement>('.crate-cancel')!.onclick = () => this.closeOverlay();
    this.root.append(el);
    this.overlay = el;
  }
  private showOpened(index: number) {
    this.openedIndex = index;
    const { crate, result } = this.openedResults[index];
    this.showCrate(crate);
    this.reveal(result);
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
      let result: CrateResult | string;
      try { result = await this.economy.openCrate(s.crate.id); }
      catch (failure) { result = failure instanceof Error ? failure.message : 'Could not open that crate.'; }
      finally { s.busy = false; }
      if (this.crateState !== s || this.overlay !== el) return;
      if (typeof result === "string") {
        s.taps = 1; el.style.setProperty('--charge', '0.333');
        el.querySelector(".crate-hint")!.textContent = `${result} / TAP TO RETRY`;
        return;
      }
      s.result = null;
      el.style.setProperty("--rarity", RARITY_COLOR[result.rarity]);
      el.classList.add("hint-" + result.rarity);
      (el as HTMLElement & { pending?: CrateResult }).pending = result;
    }
    if (s.taps >= 3) {
      const pending = (el as HTMLElement & { pending?: CrateResult }).pending;
      if (pending) this.reveal(pending);
      else s.taps = 1;
    }
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
         <div class="cc-preview"><div class="cc-swatch" style="--c:${hex(item.color)};--a:${hex(item.accent ?? item.color)}"></div></div>
         <small>${esc(item.brand).toUpperCase()} · ${esc(item.category).toUpperCase()}</small>
         <strong>${esc(item.name.replace(item.brand + " ", ""))}</strong><em>${esc(item.variantName)}</em>
         <span class="cc-credit">+${result.credit} CREDIT</span>`
      : `<span class="cc-rarity">COLLECTION COMPLETE</span><div class="cc-swatch coin"></div><strong>You own everything</strong><em>Paid out in Credit instead</em><span class="cc-credit">+${result.credit} CREDIT</span>`;
    card.hidden = false;
    el.querySelector<HTMLElement>('.crate-cancel')!.hidden = true;
    if (item) try { this.preview(item.partId, item.variantId, card.querySelector<HTMLElement>('.cc-preview')!); } catch { /* Keep the colour swatch if preview rendering fails. */ }
    el.querySelector<HTMLElement>(".crate-hint")!.hidden = true;
    const actions = el.querySelector<HTMLElement>(".crate-actions")!;
    const button = (label: string, action: () => void, primary = false) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (primary) b.className = "primary"; b.onclick = action; actions.append(b); return b; };
    const nextOpened = this.openedResults[this.openedIndex + 1];
    const advance = () => { if (this.overlay !== el || this.crateState !== s || s.busy) return; if (nextOpened) this.showOpened(this.openedIndex + 1); else this.closeOverlay(); };
    if (item?.rideable === "scooter") button("EQUIP NOW", async () => {
      if (s.busy || this.overlay !== el) return;
      s.busy = true;
      const buttons = [...actions.querySelectorAll<HTMLButtonElement>('button')];
      buttons.forEach(b => b.disabled = true);
      let error = '';
      try { error = await this.equip(item.partId, item.variantId); }
      catch (failure) { error = failure instanceof Error ? failure.message : 'Could not equip that part.'; }
      s.busy = false;
      if (this.overlay !== el || this.crateState !== s) return;
      if (error) { el.querySelector<HTMLElement>(".crate-card small")!.textContent = error; buttons.forEach(b => b.disabled = false); }
      else advance();
    });
    const next = this.queue[0];
    if (nextOpened) button(`NEXT RESULT (${this.openedResults.length - this.openedIndex - 1})`, advance, true);
    else if (next) button(`OPEN NEXT (${this.queue.length})`, () => this.openCrate(next, this.queue), true);
    button("NICE!", () => this.closeOverlay(), !nextOpened && !next);
    actions.hidden = false;
    setTimeout(() => actions.querySelector<HTMLButtonElement>("button.primary, button")?.focus(), 400);
  }
  closeOverlay() {
    if (!this.overlay || this.openingAll || this.crateState?.busy) return;
    const pending = (this.overlay as HTMLElement & { pending?: CrateResult }).pending;
    if (pending && !this.crateState?.result) { this.reveal(pending); return; }
    this.overlay.remove(); this.overlay = null; this.crateState = null;
    this.openedResults = []; this.queue = [];
    this.onClose();
  }
  /** Controller: A taps / confirms, LS moves between buttons, B closes once revealed. */
  private cooldown = 0;
  update(input: InputFrame, dt: number) {
    if (!this.overlay) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const revealed = !!this.crateState?.result;
    if (!revealed) { if (input.pressed.brakeBars || input.pressed.pause) this.closeOverlay(); else if (input.pressed.hop) void this.tap(); return; }
    const buttons = [...this.overlay.querySelectorAll<HTMLButtonElement>(".crate-actions button")];
    const dir = Math.abs(input.lean) > 0.5 ? Math.sign(input.lean) : 0;
    if (dir && !this.cooldown && buttons.length) { const i = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[(i + dir + buttons.length) % buttons.length].focus(); this.cooldown = 0.22; }
    if (input.pressed.hop) (buttons.includes(document.activeElement as HTMLButtonElement) ? (document.activeElement as HTMLButtonElement) : buttons.at(-1))?.click();
    if (input.pressed.brakeBars || input.pressed.pause) this.closeOverlay();
  }
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function input_vibrate(ms: number) { try { for (const pad of navigator.getGamepads?.() ?? []) (pad as Gamepad & { vibrationActuator?: { playEffect: (t: string, p: object) => void } })?.vibrationActuator?.playEffect("dual-rumble", { duration: ms, strongMagnitude: 0.5, weakMagnitude: 0.4 }); } catch { /* no rumble */ } }
