// Mobile-only virtual Xbox-style controller. It is an input SOURCE, not a
// control scheme: it presents the same standard-mapped buttons and axes a
// physical pad would, and Input.poll resolves it exactly once through the
// normal pipeline (presets, contexts, gestures). It never synthesises keyboard
// events or patches navigator.getGamepads.

export type TouchMode = "auto" | "on" | "off";

/** Standard-mapping button indices. */
const BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export interface VirtualPadState {
  id: string;
  index: number;
  mapping: "standard";
  connected: true;
  timestamp: number;
  axes: number[];
  buttons: { value: number; pressed: boolean; touched: boolean }[];
}

/** True on phones and tablets: a coarse primary pointer AND real touch points. */
export const touchDevice = () =>
  typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && (navigator.maxTouchPoints ?? 0) > 0;

export class TouchPad {
  mode: TouchMode = "auto";
  size = 1;
  opacity = 0.5;
  readonly device = touchDevice();
  /** Whether the overlay is currently shown and feeding input. */
  visible = false;
  private readonly root = document.createElement("div");
  private readonly buttons = Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false }));
  private readonly axes = [0, 0, 0, 0];
  private readonly owners = new Map<number, (e: PointerEvent) => void>();
  private readonly releases = new Map<number, () => void>();
  /** Set by the game: a physical controller was used recently (Auto hides the pad). */
  physicalActive = false;
  /** Set by the game: a menu, radial or preview owns input and the pad should step aside. */
  suspended = false;
  /** When true (test view), the overlay is shown even if not otherwise needed. */
  preview = false;

  constructor() {
    this.root.id = "touch-pad";
    this.root.hidden = true;
    this.root.setAttribute("aria-hidden", "true");
    this.root.innerHTML = `
      <div class="tp-stick tp-ls" data-stick="0"><i></i></div>
      <button class="tp-click tp-l3" data-button="${BUTTON.L3}">L3</button>
      <div class="tp-dpad">
        <button data-button="${BUTTON.UP}" class="tp-up">▲</button><button data-button="${BUTTON.LEFT}" class="tp-left">◀</button>
        <button data-button="${BUTTON.RIGHT}" class="tp-right">▶</button><button data-button="${BUTTON.DOWN}" class="tp-down">▼</button>
      </div>
      <div class="tp-shoulder tp-left-shoulder"><button data-button="${BUTTON.LT}">LT</button><button data-button="${BUTTON.LB}">LB</button></div>
      <div class="tp-shoulder tp-right-shoulder"><button data-button="${BUTTON.RT}">RT</button><button data-button="${BUTTON.RB}">RB</button></div>
      <div class="tp-face">
        <button data-button="${BUTTON.Y}" class="tp-y">Y</button><button data-button="${BUTTON.X}" class="tp-x">X</button>
        <button data-button="${BUTTON.B}" class="tp-b">B</button><button data-button="${BUTTON.A}" class="tp-a">A</button>
      </div>
      <div class="tp-stick tp-rs" data-stick="2"><i></i></div>
      <button class="tp-click tp-r3" data-button="${BUTTON.R3}">R3</button>
      <button class="tp-menu" data-button="${BUTTON.MENU}" aria-label="Sesh menu">☰</button>`;
    document.body.append(this.root);
    for (const el of this.root.querySelectorAll<HTMLElement>("[data-button]")) this.bindButton(el, Number(el.dataset.button));
    for (const el of this.root.querySelectorAll<HTMLElement>("[data-stick]")) this.bindStick(el, Number(el.dataset.stick));
    // Losing focus, backgrounding or rotating clears every source without a
    // fabricated press or release gesture.
    const clear = () => this.clear();
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
    window.addEventListener("orientationchange", clear);
  }

  private bindButton(el: HTMLElement, index: number) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.set(index, 1);
      el.classList.add("down");
      this.releases.set(e.pointerId, () => { this.set(index, 0); el.classList.remove("down"); });
    });
    const up = (e: PointerEvent) => { this.releases.get(e.pointerId)?.(); this.releases.delete(e.pointerId); };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
    // A pointer tap must not also fire a synthesised click on the page.
    el.addEventListener("click", (e) => e.preventDefault());
  }

  private bindStick(el: HTMLElement, axis: number) {
    const knob = el.querySelector("i") as HTMLElement;
    const move = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const radius = rect.width / 2;
      let x = (e.clientX - (rect.left + radius)) / (radius * 0.72);
      let y = (e.clientY - (rect.top + radius)) / (radius * 0.72);
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      // Full analog range: gentle manual depths and deep preload both come through.
      this.axes[axis] = x;
      this.axes[axis + 1] = y;
      knob.style.transform = `translate(${x * radius * 0.72}px, ${y * radius * 0.72}px)`;
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if ([...this.owners.keys()].some((id) => this.owners.get(id) === move)) return;
      el.setPointerCapture(e.pointerId);
      this.owners.set(e.pointerId, move);
      el.classList.add("down");
      move(e);
    });
    el.addEventListener("pointermove", (e) => { if (this.owners.get(e.pointerId) === move) move(e); });
    const end = (e: PointerEvent) => {
      if (this.owners.get(e.pointerId) !== move) return;
      this.owners.delete(e.pointerId);
      this.axes[axis] = this.axes[axis + 1] = 0;
      knob.style.transform = "";
      el.classList.remove("down");
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("lostpointercapture", end);
  }

  private set(index: number, value: number) {
    const b = this.buttons[index];
    b.value = value;
    b.pressed = b.touched = value > 0.5;
  }

  /** Neutral everything: no stuck push, trigger chord or stick. */
  clear() {
    for (let i = 0; i < this.buttons.length; i++) this.set(i, 0);
    this.axes.fill(0);
    this.owners.clear();
    this.releases.clear();
    this.root.querySelectorAll(".down").forEach((el) => el.classList.remove("down"));
    this.root.querySelectorAll<HTMLElement>(".tp-stick i").forEach((k) => (k.style.transform = ""));
  }

  get anyInput() {
    return this.owners.size > 0 || this.releases.size > 0;
  }

  /** Shows or hides the overlay for this frame and applies size/opacity. */
  update() {
    const wanted = this.preview || (this.device && this.mode !== "off" && !this.suspended && (this.mode === "on" || !this.physicalActive));
    if (wanted !== this.visible) {
      this.visible = wanted;
      this.root.hidden = !wanted;
      if (!wanted) this.clear();
    }
    document.body.classList.toggle("touch-controls", this.visible);
    // Clamp to what the screen height allows so larger sizes never overlap the stacks.
    const fits = Math.max(0.8, Math.min(1.3, (innerHeight - 30) / 330));
    this.root.style.setProperty("--tp-scale", String(Math.min(fits, Math.min(1.3, Math.max(0.8, this.size)))));
    this.root.style.setProperty("--tp-opacity", String(Math.min(0.85, Math.max(0.2, this.opacity))));
  }

  /** The pad as a standard-mapped source, or null when hidden. */
  state(): VirtualPadState | null {
    if (!this.visible) return null;
    return { id: "Touch controls (virtual standard pad)", index: -2, mapping: "standard", connected: true, timestamp: performance.now(), axes: [...this.axes], buttons: this.buttons.map((b) => ({ ...b })) };
  }
}
