// Sesh Music panel: a compact phone-style view of the music service.
// Three pages (Now Playing, Tracks, Settings). While open it owns controller
// input: D-pad/LS navigate, A choose, B back/close, LB/RB previous/next track,
// X play/pause, left/right adjust a focused slider. Closing never destroys the
// playing audio; the service keeps playing while riding.
import { music, type MusicTrack } from "../audio/music";
import { type InputFrame } from "../input/input";

type Page = "now" | "tracks" | "settings";
const PAGES: { id: Page; label: string }[] = [
  { id: "now", label: "Now Playing" },
  { id: "tracks", label: "Tracks" },
  { id: "settings", label: "Settings" },
];
const time = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export class MusicPlayer {
  open = false;
  onClose = () => {};
  private root = el("div", "music-phone");
  private toast = el("div", "music-toast");
  private page: Page = "now";
  private focus = 0;
  private navHeld = false;
  private sideHeld = 0;
  private ticker = 0;
  private toastTimer = 0;
  private dragging = false;

  constructor() {
    this.root.id = "sesh-music";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "Sesh Music");
    this.toast.hidden = true;
    this.toast.setAttribute("role", "status");
    document.body.append(this.root, this.toast);
    music.subscribe(() => this.open && !this.dragging && this.render());
    // Rebuilding the page mid-drag would drop the slider under the pointer.
    this.root.addEventListener("pointerdown", (event) => { if ((event.target as HTMLElement).matches("input[type=range]")) this.dragging = true; });
    window.addEventListener("pointerup", () => { if (this.dragging) { this.dragging = false; if (this.open) this.render(); } });
    music.onNowPlaying = (track) => this.notify(track);
    // Mouse and touch: click a control directly.
    this.root.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-music]");
      if (!target) return;
      const items = this.focusables();
      const index = items.indexOf(target);
      if (index >= 0) this.focus = index;
      this.activate(target, event);
    });
    this.root.addEventListener("input", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.dataset.music === "volume") music.setVolume(Number(target.value) / 100);
      if (target.dataset.music === "seek") music.seek((Number(target.value) / 1000) * music.duration);
    });
  }

  show(page: Page = "now") {
    this.open = true;
    this.page = page;
    this.focus = 0;
    this.navHeld = true;
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add("open"));
    this.toast.hidden = true;
    this.render();
    // Start on Play (or the first tab when the library is empty).
    const items = this.focusables();
    const play = items.findIndex((i) => i.dataset.music === "play");
    this.focus = play >= 0 ? play : Math.max(0, items.findIndex((i) => i.dataset.page === page));
    this.render();
    clearInterval(this.ticker);
    // Progress refresh at a modest UI rate, only while the panel is open.
    this.ticker = window.setInterval(() => this.updateProgress(), 250);
  }
  close() {
    if (!this.open) return;
    this.open = false;
    clearInterval(this.ticker);
    this.root.classList.remove("open");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => { if (!this.open) this.root.hidden = true; }, reduce ? 0 : 200);
    this.onClose();
  }

  private notify(track: MusicTrack) {
    if (this.open || !music.settings.notifications) return;
    this.toast.replaceChildren(el("span", "music-toast-label", "Now playing"), el("strong", "", track.title), el("span", "", track.artist));
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 3500);
  }

  // ---- Controller -------------------------------------------------------------
  /** Consumes the frame while open. Returns nothing for gameplay to use. */
  update(frame: InputFrame) {
    if (!this.open) return;
    if (frame.pressed.brakeBars || frame.pressed.pause) {
      if (this.page !== "now" && frame.pressed.brakeBars) this.setPage("now");
      else this.close();
      return;
    }
    if (frame.pressed.leftModifier) music.previous();
    if (frame.pressed.rightModifier) music.next();
    if (frame.pressed.pushDeck) void music.togglePlay();
    const vertical = frame.held.marker > 0.5 ? -1 : frame.held.menuDown > 0.5 ? 1 : Math.abs(frame.lean) > 0.5 ? Math.sign(frame.lean) : 0;
    const items = this.focusables();
    // Up/down moves between rows of controls; controls side by side (tabs,
    // transport, shuffle/repeat) are reached with left/right below.
    if (vertical && !this.navHeld && items.length) {
      this.focus = this.step(items, vertical, 0);
      this.render();
      this.reveal(this.focusables()[this.focus]);
    }
    this.navHeld = !!vertical;
    const side = frame.held.menuLeft > 0.5 ? -1 : frame.held.menuRight > 0.5 ? 1 : Math.abs(frame.steer) > 0.5 ? Math.sign(frame.steer) : 0;
    const focused = items[this.focus];
    if (side && focused) {
      const kind = focused.dataset.music;
      // Sliders repeat while held; everything else moves once per press.
      const now = performance.now();
      if (kind === "volume" || kind === "seek") {
        if (now - this.sideHeld > 120) {
          this.sideHeld = now;
          if (kind === "volume") music.setVolume(music.settings.volume + side * 0.05);
          else music.seek(music.position + side * 5);
        }
      } else if (!this.sideHeld && focused.dataset.page) {
        const index = PAGES.findIndex((p) => p.id === this.page);
        this.setPage(PAGES[(index + side + PAGES.length) % PAGES.length].id);
        this.sideHeld = now;
      } else if (!this.sideHeld) {
        this.focus = this.step(items, 0, side);
        this.sideHeld = now;
        this.render();
      }
    } else this.sideHeld = 0;
    if (frame.pressed.hop && focused) this.activate(focused);
  }

  /** Rows of controls by on-screen position, top to bottom, each left to right. */
  private rows(items: HTMLElement[]) {
    const placed = items.map((item, index) => ({ index, rect: item.getBoundingClientRect() }));
    if (placed.every((p) => !p.rect.height)) return items.map((_, index) => [index]);
    placed.sort((a, b) => a.rect.top + a.rect.height / 2 - (b.rect.top + b.rect.height / 2));
    const rows: { y: number; members: typeof placed }[] = [];
    for (const p of placed) {
      const y = p.rect.top + p.rect.height / 2, row = rows.at(-1);
      if (row && Math.abs(row.y - y) < 14) row.members.push(p);
      else rows.push({ y, members: [p] });
    }
    return rows.map((r) => r.members.sort((a, b) => a.rect.left - b.rect.left).map((m) => m.index));
  }
  /** Spatial focus step: vertical changes row (keeping the nearest column), horizontal stays in the row. */
  private step(items: HTMLElement[], vertical: number, horizontal: number) {
    const rows = this.rows(items);
    const r = Math.max(0, rows.findIndex((row) => row.includes(this.focus)));
    const row = rows[r], at = row.indexOf(this.focus);
    if (horizontal) return row[Math.min(row.length - 1, Math.max(0, at + horizontal))] ?? this.focus;
    const next = rows[(r + vertical + rows.length) % rows.length];
    const x = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return b.left + b.width / 2; };
    const from = x(items[this.focus]);
    return next.reduce((best, i) => (Math.abs(x(items[i]) - from) < Math.abs(x(items[best]) - from) ? i : best), next[0]);
  }
  /** Scrolls only the player's own page, never the game behind it. */
  private reveal(target?: HTMLElement) {
    const box = this.root.querySelector<HTMLElement>(".music-page");
    if (!target || !box) return;
    const t = target.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (t.top < b.top) box.scrollTop -= b.top - t.top + 6;
    else if (t.bottom > b.bottom) box.scrollTop += t.bottom - b.bottom + 6;
  }
  private setPage(page: Page) {
    this.page = page;
    this.render();
    this.focus = Math.max(0, this.focusables().findIndex((i) => i.dataset.page === page));
    this.render();
  }
  private focusables() {
    return [...this.root.querySelectorAll<HTMLElement>("[data-music]")];
  }
  private activate(target: HTMLElement, event?: Event) {
    const kind = target.dataset.music;
    if (target.dataset.page) this.setPage(target.dataset.page as Page);
    else if (kind === "enable") void music.play();
    else if (kind === "play") void music.togglePlay();
    else if (kind === "prev") music.previous();
    else if (kind === "next") music.next();
    else if (kind === "mute") music.toggleMute();
    else if (kind === "shuffle") music.setSetting("shuffle", !music.settings.shuffle);
    else if (kind === "repeat") music.cycleRepeat();
    else if (kind === "track" && target.dataset.id) music.select(target.dataset.id);
    else if (kind === "setting" && target.dataset.key) {
      const key = target.dataset.key as "enabled" | "resumeOnEnter" | "pauseWhenHidden" | "notifications";
      music.setSetting(key, !music.settings[key]);
    } else if (kind === "close") this.close();
    else if ((kind === "volume" || kind === "seek") && !event) return;
    this.render();
  }

  // ---- Rendering (textContent only; titles are never HTML) --------------------------
  private render() {
    const focusedKey = this.focusables()[this.focus]?.dataset.key;
    const r = this.root;
    r.replaceChildren();
    const frame = el("div", "music-screen");
    const header = el("div", "music-header");
    const title = el("div", "music-app", "Sesh Music");
    const close = el("button", "music-close", "✕");
    close.dataset.music = "close";
    close.setAttribute("aria-label", "Close music");
    header.append(title, close);
    const tabs = el("div", "music-tabs");
    for (const p of PAGES) {
      const tab = el("button", p.id === this.page ? "active" : "", p.label);
      tab.dataset.music = "tab";
      tab.dataset.page = p.id;
      tabs.append(tab);
    }
    frame.append(header, tabs);
    const body = el("div", "music-page");
    if (!music.tracks.length) {
      body.append(el("p", "music-empty", music.catalogLoaded ? "No music added yet." : "Loading music…"));
      if (this.page === "settings") this.settingsPage(body);
    } else if (this.page === "now") this.nowPage(body);
    else if (this.page === "tracks") this.tracksPage(body);
    else this.settingsPage(body);
    frame.append(body);
    frame.append(el("div", "music-hints", "A select · B back · X play/pause · LB/RB skip"));
    r.append(frame);
    const items = this.focusables();
    if (focusedKey) {
      const same = items.findIndex((i) => i.dataset.key === focusedKey);
      if (same >= 0) this.focus = same;
    }
    this.focus = Math.min(this.focus, Math.max(0, items.length - 1));
    items.forEach((item, i) => item.classList.toggle("focused", i === this.focus));
  }
  private control(kind: string, label: string, text: string, key = kind) {
    const b = el("button", "music-control", text);
    b.dataset.music = kind;
    b.dataset.key = key;
    b.setAttribute("aria-label", label);
    return b;
  }
  private nowPage(body: HTMLElement) {
    const track = music.current;
    const cover = el("div", "music-cover");
    if (track?.cover) {
      const img = el("img");
      img.loading = "lazy";
      img.alt = "";
      img.src = track.cover;
      img.onerror = () => img.remove();
      cover.append(img);
    } else cover.append(el("span", "music-cover-mark", "♪"));
    const status = music.status;
    const statusText =
      status === "loading" ? "Loading…" : status === "playing" ? "Playing" : status === "paused" ? "Paused"
        : status === "blocked" ? "Audio is blocked by the browser" : status === "error" ? music.errorMessage || "Track unavailable" : "Ready";
    body.append(cover, el("strong", "music-title", track?.title ?? ""), el("span", "music-artist", track?.artist ?? ""));
    if (track?.credit) body.append(el("span", "music-credit", track.credit));
    body.append(el("span", `music-status ${status}`, statusText));
    if (status === "blocked") body.append(this.control("enable", "Enable audio", "Click / tap to enable audio"));
    const seek = el("input", "music-seek") as HTMLInputElement;
    seek.type = "range";
    seek.min = "0";
    seek.max = "1000";
    seek.dataset.music = "seek";
    seek.dataset.key = "seek";
    seek.setAttribute("aria-label", "Seek");
    const times = el("div", "music-times");
    times.append(el("span", "music-elapsed"), el("span", "music-duration"));
    body.append(seek, times);
    const transport = el("div", "music-transport");
    transport.append(
      this.control("prev", "Previous", "⏮"),
      this.control("play", status === "playing" || status === "loading" ? "Pause" : "Play", status === "playing" || status === "loading" ? "⏸" : "▶"),
      this.control("next", "Next", "⏭"),
    );
    body.append(transport);
    body.append(this.volumeRow());
    const modes = el("div", "music-modes");
    const shuffle = this.control("shuffle", "Shuffle", `Shuffle ${music.settings.shuffle ? "On" : "Off"}`);
    const repeat = this.control("repeat", "Repeat", `Repeat ${music.settings.repeat === "one" ? "One" : music.settings.repeat === "all" ? "All" : "Off"}`);
    shuffle.classList.toggle("on", music.settings.shuffle);
    repeat.classList.toggle("on", music.settings.repeat !== "off");
    modes.append(shuffle, repeat);
    body.append(modes);
    this.updateProgress(body);
  }
  private volumeRow() {
    const row = el("div", "music-volume");
    row.append(this.control("mute", music.settings.muted ? "Unmute" : "Mute", music.settings.muted ? "🔇" : "🔊"));
    const volume = el("input", "") as HTMLInputElement;
    volume.type = "range";
    volume.min = "0";
    volume.max = "100";
    volume.value = String(Math.round(music.settings.volume * 100));
    volume.dataset.music = "volume";
    volume.dataset.key = "volume";
    volume.setAttribute("aria-label", "Music volume");
    row.append(volume, el("span", "music-volume-value", `${Math.round(music.settings.volume * 100)}`));
    return row;
  }
  private tracksPage(body: HTMLElement) {
    const list = el("ol", "music-list");
    for (const track of music.tracks) {
      const item = el("li");
      const row = el("button", "music-row");
      row.dataset.music = "track";
      row.dataset.id = track.id;
      row.dataset.key = "track:" + track.id;
      const playing = music.current?.id === track.id;
      row.classList.toggle("playing", playing);
      row.classList.toggle("unavailable", music.unavailable.has(track.id));
      row.append(
        el("span", "music-row-mark", playing ? (music.status === "playing" ? "▶" : "❚❚") : ""),
        el("span", "music-row-title", track.title),
        el("span", "music-row-artist", music.unavailable.has(track.id) ? "Unavailable" : track.artist),
      );
      item.append(row);
      list.append(item);
    }
    body.append(list);
  }
  private settingsPage(body: HTMLElement) {
    const toggle = (key: "enabled" | "resumeOnEnter" | "pauseWhenHidden" | "notifications", label: string) => {
      const b = this.control("setting", label, `${label}: ${music.settings[key] ? "On" : "Off"}`, key);
      b.classList.add("music-setting");
      b.classList.toggle("on", music.settings[key]);
      return b;
    };
    body.append(
      toggle("enabled", "Music"),
      el("span", "music-label", "Music volume"),
      this.volumeRow(),
      toggle("resumeOnEnter", "Resume when entering the game"),
      toggle("pauseWhenHidden", "Pause when the tab is inactive"),
      toggle("notifications", "Now Playing notifications"),
    );
  }
  private updateProgress(scope: HTMLElement = this.root) {
    const seek = scope.querySelector<HTMLInputElement>(".music-seek");
    if (!seek) return;
    const duration = music.duration, position = music.position;
    if (document.activeElement !== seek) seek.value = String(duration ? Math.round((position / duration) * 1000) : 0);
    seek.disabled = !duration;
    scope.querySelector(".music-elapsed")!.textContent = time(position);
    scope.querySelector(".music-duration")!.textContent = duration ? time(duration) : "--:--";
  }
}
