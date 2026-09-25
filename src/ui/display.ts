/**
 * DISPLAY setting (#60): Windowed, Borderless Windowed or Fullscreen, as a
 * browser can offer them.
 *  - Windowed: the normal browser tab.
 *  - Borderless Windowed: the page fills the screen with no browser frame;
 *    Esc leaves it (the browser's own rule), like alt-tabbing out of a game.
 *  - Fullscreen: the same, plus the keyboard is locked where the browser
 *    allows it (Chrome, Edge), so Esc reaches the game's pause menu and
 *    holding Esc is what leaves fullscreen.
 * Browsers only enter fullscreen from a click, tap or key press (a gamepad
 * press does not count), so a mode that cannot start right away waits for the
 * next one. Leaving fullscreen through the browser sets the setting back to
 * Windowed, so it never snaps back unasked.
 */
export type DisplayMode = "windowed" | "borderless" | "fullscreen";
export const DISPLAY_MODES: DisplayMode[] = ["windowed", "borderless", "fullscreen"];
export const DISPLAY_LABEL: Record<DisplayMode, string> = { windowed: "WINDOWED", borderless: "BORDERLESS WINDOWED", fullscreen: "FULLSCREEN" };

type KeyboardLock = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };
const keyboard = () => (typeof navigator !== "undefined" ? (navigator as any).keyboard as KeyboardLock | undefined : undefined);
export const fullscreenSupported = () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;

export class DisplayController {
  private wanted: DisplayMode = "windowed";
  private waiting = false;
  private ours = false;
  /** Called when the browser left fullscreen on its own (Esc, F11, a tab switch). */
  onLeft: () => void = () => {};
  /** Called when a mode is waiting for a click or key press. */
  onWaiting: (waiting: boolean) => void = () => {};
  constructor() {
    if (typeof document === "undefined") return;
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) return;
      keyboard()?.unlock?.();
      if (this.ours && this.wanted !== "windowed") { this.wanted = "windowed"; this.onLeft(); }
      this.ours = false;
    });
    const retry = () => { if (this.waiting) void this.enter(); };
    for (const type of ["pointerup", "keydown", "touchend"]) document.addEventListener(type, retry, { capture: true });
  }
  get mode() { return this.wanted; }
  get pending() { return this.waiting; }
  /** Applies a mode now if the browser allows it, else on the next click, tap or key. */
  async apply(mode: DisplayMode) {
    this.wanted = mode;
    if (mode === "windowed") {
      this.setWaiting(false);
      keyboard()?.unlock?.();
      if (typeof document !== "undefined" && document.fullscreenElement) { this.ours = false; await document.exitFullscreen().catch(() => {}); }
      return true;
    }
    return this.enter();
  }
  private setWaiting(v: boolean) { if (this.waiting !== v) { this.waiting = v; this.onWaiting(v); } }
  private async enter() {
    if (!fullscreenSupported()) { this.setWaiting(false); return false; }
    const mode = this.wanted;
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      this.ours = true;
      this.setWaiting(false);
    } catch {
      this.setWaiting(true);
      return false;
    }
    const lock = keyboard();
    if (mode === "fullscreen") await lock?.lock?.(["Escape"]).catch(() => {});
    else lock?.unlock?.();
    return true;
  }
}

/** The one display controller for the page. */
export const display = new DisplayController();
