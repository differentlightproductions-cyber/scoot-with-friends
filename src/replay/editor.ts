import * as THREE from "three";
import "./replay.css";
import type { ChaseCamera } from "../camera/chase";
import type { InputFrame } from "../input/input";
import type { LocalProfile } from "../data/loadout";
import type { Simulation } from "../physics/simulation";
import { REPLAY_RATE, type ReplayClip, type ReplayView } from "./buffer";
import { ReplayPlayer } from "./player";
import { newReplayId, ReplayStore, type ReplayMeta, type SavedReplay } from "./store";

/** What the editor needs from the game (main.ts). */
export interface ReplayHost {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  profile: () => LocalProfile;
  sim: () => Simulation;
  camera: ChaseCamera;
  mapId: () => string;
  mapName: (id: string) => string;
  /** Loads another map (a saved replay remembers its own). */
  loadMap: (id: string) => Promise<void>;
  /** One frame of the world (sky, weather) drawn through `camera`, with the live rider hidden. */
  draw: (dt: number, camera: THREE.PerspectiveCamera, focus: THREE.Vector3, yaw: number) => void;
  /** The live rider and HUD step aside while a replay is open, and come back after. */
  setLiveHidden: (hidden: boolean) => void;
}

const SPEEDS = [0.25, 0.5, 1] as const;
const clock = (s: number) => { const v = Math.max(0, s); return `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, "0")}`; };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
type Button = { id: string; label: () => string; act: () => void; show?: () => boolean; disabled?: () => boolean; primary?: boolean };

/**
 * Instant replay and the Replay Editor (#41). A controller-first overlay over a
 * full-screen preview: timeline with trim handles, play, scrub, speed, first or
 * third person, save, rename and export. It owns input while open; gameplay is
 * frozen underneath and the live history keeps what it had.
 */
export class ReplayEditor {
  open = false;
  readonly store = new ReplayStore();
  private root = document.createElement("div");
  private player: ReplayPlayer | null = null;
  private clip: ReplayClip | null = null;
  private meta: ReplayMeta | null = null;
  private mode: "edit" | "watch" | "library" = "edit";
  private t = 0;
  private playing = true;
  private speed = 1;
  private view: ReplayView = "third";
  private trimIn = 0;
  private trimOut = 0;
  private focus = 2;
  private notice = "";
  private noticeAge = 0;
  private dirty = false;
  private library: ReplayMeta[] = [];
  private row = 0;
  private column = 0;
  private dialog: null | { kind: "rename"; target: ReplayMeta | null } | { kind: "delete"; target: ReplayMeta } = null;
  private exporting: null | { recorder: MediaRecorder; chunks: Blob[]; cancelled: boolean } = null;
  private drag: null | "in" | "out" | "head" = null;
  private buttons: Button[] = [
    { id: "restart", label: () => "RESTART", act: () => this.seek(this.trimIn) },
    { id: "back1", label: () => "◀ 1S", act: () => this.step(-1), show: () => this.mode === "edit" },
    { id: "play", label: () => (this.playing ? "PAUSE" : "PLAY"), act: () => (this.playing = !this.playing), primary: true },
    { id: "fwd1", label: () => "1S ▶", act: () => this.step(1), show: () => this.mode === "edit" },
    { id: "speed", label: () => `SPEED ${this.speed.toFixed(this.speed < 1 ? 2 : 1)}×`, act: () => { this.speed = SPEEDS[(SPEEDS.indexOf(this.speed as never) + 1) % SPEEDS.length]; } },
    { id: "camera", label: () => (this.view === "first" ? "FIRST PERSON" : "THIRD PERSON"), act: () => this.toggleView() },
    { id: "in", label: () => "SET IN", act: () => this.setIn(), show: () => this.mode === "edit" },
    { id: "out", label: () => "SET OUT", act: () => this.setOut(), show: () => this.mode === "edit" },
    { id: "save", label: () => (this.meta && !this.dirty ? "SAVED ✓" : "SAVE"), act: () => void this.save(), show: () => this.mode === "edit", primary: true },
    { id: "rename", label: () => "RENAME", act: () => this.openRename(this.meta), show: () => this.mode === "edit" && !!this.meta },
    { id: "export", label: () => "EXPORT VIDEO", act: () => this.startExport(), disabled: () => !ReplayEditor.canExport(this.host.renderer.domElement) },
    { id: "edit", label: () => "EDIT", act: () => { this.mode = "edit"; this.render(); }, show: () => this.mode === "watch" },
    { id: "close", label: () => "BACK", act: () => this.back() },
  ];

  constructor(private host: ReplayHost) {
    this.root.id = "replay-editor";
    this.root.className = "replay-editor";
    this.root.hidden = true;
    document.body.append(this.root);
    this.root.addEventListener("click", (e) => this.click(e));
    this.root.addEventListener("pointerdown", (e) => this.pointer(e, "down"));
    window.addEventListener("pointermove", (e) => this.pointer(e, "move"));
    window.addEventListener("pointerup", () => (this.drag = null));
  }

  /** Browsers that can record the canvas to a video file (WebM through MediaRecorder). */
  static canExport(canvas: HTMLCanvasElement) {
    return typeof MediaRecorder !== "undefined" && typeof canvas.captureStream === "function" && !!ReplayEditor.mime();
  }
  private static mime() {
    if (typeof MediaRecorder === "undefined") return "";
    return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  }

  // ---- Opening --------------------------------------------------------------
  /** Opens a fresh capture (the live history, copied) in the editor. */
  openCapture(clip: ReplayClip) {
    this.load(clip, null, "edit");
    this.trimIn = 0; this.trimOut = this.player!.duration;
    this.view = clip.frames.at(-1)?.view ?? "third";
    this.seek(0); this.playing = true;
    this.say(`CAPTURED ${this.player!.duration.toFixed(1)} S`);
  }
  /** Opens a saved replay to watch or edit; loads its map first when it was ridden elsewhere. */
  async openSaved(id: string, mode: "watch" | "edit") {
    const saved = await this.store.get(id);
    if (!saved) { this.say("THAT REPLAY COULD NOT BE READ"); return; }
    if (saved.clip.map !== this.host.mapId()) {
      this.say(`LOADING ${this.host.mapName(saved.clip.map).toUpperCase()}...`);
      await this.host.loadMap(saved.clip.map);
    }
    this.load(saved.clip, saved.meta, mode);
    this.trimIn = saved.meta.trimIn; this.trimOut = Math.min(saved.meta.trimOut, this.player!.duration);
    this.view = saved.meta.camera;
    this.seek(this.trimIn); this.playing = true;
  }
  /** The saved replays: watch, edit, rename, delete, export. */
  async openLibrary() {
    this.dispose();
    this.mode = "library"; this.open = true; this.root.hidden = false; this.dialog = null;
    this.host.setLiveHidden(false);
    this.library = await this.store.list();
    this.row = Math.min(this.row, Math.max(0, this.library.length - 1)); this.column = 0;
    this.render();
  }
  private load(clip: ReplayClip, meta: ReplayMeta | null, mode: "edit" | "watch") {
    this.dispose();
    this.clip = clip; this.meta = meta; this.mode = mode; this.dirty = false; this.dialog = null;
    this.player = new ReplayPlayer(this.host.scene, clip, this.host.profile(), this.host.sim, this.host.camera);
    this.player.resize(this.host.camera.camera.aspect);
    this.open = true; this.root.hidden = false; this.speed = 1;
    this.focus = this.visibleButtons().findIndex((b) => b.id === "play");
    this.host.setLiveHidden(true);
    this.render();
  }
  close() {
    this.cancelExport();
    this.dispose();
    this.open = false; this.root.hidden = true; this.dialog = null;
    this.host.setLiveHidden(false);
  }
  private dispose() { this.player?.dispose(); this.player = null; }

  // ---- Timeline -------------------------------------------------------------
  get duration() { return this.player?.duration ?? 0; }
  get time() { return this.t; }
  get trim() { return { in: this.trimIn, out: this.trimOut, length: this.trimOut - this.trimIn }; }
  get camera(): ReplayView { return this.view; }
  seek(t: number) { this.t = THREE.MathUtils.clamp(t, 0, this.duration); }
  private step(seconds: number) { this.playing = false; this.seek(this.t + seconds); }
  setIn() { this.trimIn = Math.min(this.t, this.trimOut - 0.5); this.dirty = true; this.say(`IN ${clock(this.trimIn)}`); }
  setOut() { this.trimOut = Math.max(this.t, this.trimIn + 0.5); this.dirty = true; this.say(`OUT ${clock(this.trimOut)}`); }
  /** Sets both ends at once (tests, and dragging on the timeline). */
  setTrim(a: number, b: number) { this.trimIn = THREE.MathUtils.clamp(a, 0, this.duration); this.trimOut = THREE.MathUtils.clamp(b, this.trimIn + 0.5, this.duration); this.dirty = true; this.seek(THREE.MathUtils.clamp(this.t, this.trimIn, this.trimOut)); }
  toggleView() { this.view = this.view === "first" ? "third" : "first"; if (this.meta) this.dirty = true; this.say(this.view === "first" ? "FIRST PERSON" : "THIRD PERSON"); }
  setView(view: ReplayView) { if (view !== this.view) this.toggleView(); }

  // ---- Frame ----------------------------------------------------------------
  /** Controller and keyboard, while the editor owns input. */
  update(f: InputFrame, dt: number) {
    if (!this.open) return;
    // The overlay is rebuilt only when something on it changed (a rename field keeps its text).
    const before = this.stateKey();
    this.handle(f, dt);
    if (this.open && this.stateKey() !== before) this.render();
  }
  private stateKey() {
    return [this.mode, this.focus, this.playing, this.speed, this.view, this.trimIn, this.trimOut, this.dirty, this.meta?.name, this.row, this.column, this.dialog?.kind, this.notice, this.noticeAge < 3, !!this.exporting, this.library.length].join("|");
  }
  private handle(f: InputFrame, dt: number) {
    if (this.exporting) { if (f.pressed.brakeBars || f.pressed.pause) this.cancelExport(); return; }
    if (this.dialog) {
      if (f.pressed.brakeBars || f.pressed.pause) { this.dialog = null; this.render(); }
      else if (f.pressed.hop) this.confirmDialog();
      return;
    }
    if (this.mode === "library") return this.libraryInput(f);
    const shown = this.visibleButtons();
    if (f.pressed.menuLeft) this.focus = (this.focus + shown.length - 1) % shown.length;
    if (f.pressed.menuRight) this.focus = (this.focus + 1) % shown.length;
    if (f.pressed.hop) { const b = shown[this.focus]; if (b && !b.disabled?.()) b.act(); }
    if (f.pressed.brakeBars || f.pressed.pause) this.back();
    if (this.mode === "edit") {
      if (f.pressed.pushDeck) this.setIn();
      if (f.pressed.body) this.setOut();
      if (f.pressed.leftModifier) this.step(-1);
      if (f.pressed.rightModifier) this.step(1);
      if (f.pressed.brake) this.step(-1 / REPLAY_RATE);
      if (f.pressed.pumpGrind) this.step(1 / REPLAY_RATE);
      // The left stick scrubs: further for a harder push.
      if (Math.abs(f.steer) > 0.2) { this.playing = false; this.seek(this.t + f.steer * Math.abs(f.steer) * 6 * dt); }
    }
    if (f.pressed.reset) this.toggleView();
  }
  /** Advances playback and draws the frame. */
  draw(dt: number) {
    if (!this.open) return;
    this.noticeAge += dt;
    if (this.mode === "library" || !this.player) { this.host.draw(dt, this.host.camera.camera, this.host.sim().position, this.host.sim().yaw); this.renderClock(); return; }
    if (this.playing) {
      this.t += dt * (this.exporting ? 1 : this.speed);
      if (this.t >= this.trimOut) {
        if (this.exporting) { this.finishExport(); return; }
        this.t = this.trimIn;
      }
      if (this.t < this.trimIn - 1e-6) this.t = this.trimIn;
    }
    const s = this.player.pose(this.t, this.view, dt * (this.exporting ? 1 : this.speed));
    this.host.draw(dt, this.player.camera.camera, s?.position ?? this.host.sim().position, s?.yaw ?? 0);
    this.renderClock();
  }
  resize(aspect: number) { this.player?.resize(aspect); }

  // ---- Save, rename, delete ----------------------------------------------------
  /** Saves the current edit (a new replay, or the changes to this one). Returns its id. */
  async save(name?: string) {
    if (!this.clip || !this.player) return null;
    const now = Date.now(), mapName = this.host.mapName(this.clip.map);
    const meta: ReplayMeta = this.meta
      ? { ...this.meta, trimIn: this.trimIn, trimOut: this.trimOut, camera: this.view, name: name ?? this.meta.name }
      : { id: newReplayId(), name: name ?? (await this.store.defaultName(mapName)), createdAt: now, map: this.clip.map, mapName, rideable: this.clip.rideable, trimIn: this.trimIn, trimOut: this.trimOut, camera: this.view, thumbnail: this.thumbnail() };
    try {
      if (this.meta) await this.store.update(meta); else await this.store.put({ meta, clip: this.clip });
    } catch { this.say("COULD NOT SAVE: STORAGE IS FULL OR BLOCKED"); return null; }
    this.meta = meta; this.dirty = false;
    this.say(`SAVED · ${meta.name.toUpperCase()}`);
    this.render();
    return meta.id;
  }
  async rename(id: string, name: string) {
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 48);
    if (!clean) return;
    const saved = (await this.store.list()).find((m) => m.id === id);
    if (!saved) return;
    const meta = { ...saved, name: clean };
    await this.store.update(meta);
    if (this.meta?.id === id) this.meta = meta;
    if (this.mode === "library") this.library = await this.store.list();
    this.say(`RENAMED · ${clean.toUpperCase()}`);
    this.render();
  }
  async remove(id: string) {
    await this.store.remove(id);
    this.library = await this.store.list();
    this.row = Math.min(this.row, Math.max(0, this.library.length - 1));
    this.say("REPLAY DELETED");
    this.render();
  }
  /** A small picture of the clip's first kept frame for the library. */
  private thumbnail() {
    try {
      const t = this.t, v = this.view;
      this.player!.pose(this.trimIn, this.view, 1 / 30);
      const first = this.player!.state(this.trimIn)!;
      this.host.draw(0, this.player!.camera.camera, first.position, first.yaw);
      const src = this.host.renderer.domElement, c = document.createElement("canvas");
      c.width = 240; c.height = 135;
      const g = c.getContext("2d")!, aspect = src.width / src.height, w = aspect > 16 / 9 ? src.height * 16 / 9 : src.width, h = w * 9 / 16;
      g.drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, 240, 135);
      this.t = t; this.view = v;
      return c.toDataURL("image/jpeg", 0.7);
    } catch { return null; }
  }
  private openRename(target: ReplayMeta | null) {
    if (!target) { this.say("SAVE IT FIRST, THEN NAME IT"); return; }
    this.dialog = { kind: "rename", target };
    this.render();
    const field = this.root.querySelector<HTMLInputElement>(".re-dialog input");
    // Typing belongs to the field, not the game (Space would otherwise be A).
    field?.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); this.confirmDialog(); } if (e.key === "Escape") { e.preventDefault(); this.dialog = null; this.render(); } });
    field?.focus(); field?.select();
  }
  private confirmDialog() {
    const d = this.dialog;
    if (!d) return;
    if (d.kind === "rename" && d.target) { const v = this.root.querySelector<HTMLInputElement>(".re-dialog input")?.value ?? ""; this.dialog = null; void this.rename(d.target.id, v); }
    else if (d.kind === "delete") { this.dialog = null; void this.remove(d.target.id); }
    this.render();
  }

  // ---- Export -------------------------------------------------------------------
  /** Records the trimmed range from the chosen camera, in real time, to a WebM file. */
  startExport() {
    const canvas = this.host.renderer.domElement, mime = ReplayEditor.mime();
    if (!this.player || !ReplayEditor.canExport(canvas)) { this.say("VIDEO EXPORT IS NOT SUPPORTED IN THIS BROWSER"); return false; }
    const stream = canvas.captureStream(REPLAY_RATE), recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const job = { recorder, chunks: [] as Blob[], cancelled: false };
    recorder.ondataavailable = (e) => { if (e.data.size) job.chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (job.cancelled) return;
      const blob = new Blob(job.chunks, { type: mime.split(";")[0] }), url = URL.createObjectURL(blob), a = document.createElement("a");
      const name = (this.meta?.name ?? "Scoot replay").replace(/[^\w\- ]+/g, "").trim() || "Scoot replay";
      a.href = url; a.download = `${name}.${mime.includes("mp4") ? "mp4" : "webm"}`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      (window as unknown as { __replayExport?: { bytes: number; type: string } }).__replayExport = { bytes: blob.size, type: blob.type };
      this.say(`EXPORTED ${(blob.size / 1e6).toFixed(1)} MB`);
      this.render();
    };
    this.exporting = job;
    this.seek(this.trimIn); this.playing = true;
    recorder.start(250);
    this.render();
    return true;
  }
  private finishExport() { const job = this.exporting; this.exporting = null; job?.recorder.stop(); this.t = this.trimIn; this.render(); }
  private cancelExport() { const job = this.exporting; if (!job) return; job.cancelled = true; this.exporting = null; job.recorder.stop(); this.say("EXPORT CANCELLED"); this.render(); }

  // ---- Library ------------------------------------------------------------------
  private static ACTIONS = ["WATCH", "EDIT", "RENAME", "DELETE"] as const;
  private libraryInput(f: InputFrame) {
    const n = this.library.length, stickY = f.lean; // LS up/down (lean) and D-pad down
    if (f.pressed.brakeBars || f.pressed.pause) { this.close(); return; }
    if (n) {
      if (f.pressed.menuDown || (stickY > 0.6 && this.noticeAge > 0.18)) { this.row = (this.row + 1) % n; this.noticeAge = 0; }
      if (f.pressed.marker || (stickY < -0.6 && this.noticeAge > 0.18)) { this.row = (this.row + n - 1) % n; this.noticeAge = 0; }
      if (f.pressed.menuLeft) this.column = (this.column + 3) % 4;
      if (f.pressed.menuRight) this.column = (this.column + 1) % 4;
      if (f.pressed.hop) this.libraryAction(this.library[this.row], ReplayEditor.ACTIONS[this.column]);
    }
  }
  private libraryAction(m: ReplayMeta, action: (typeof ReplayEditor.ACTIONS)[number]) {
    if (action === "WATCH") void this.openSaved(m.id, "watch");
    if (action === "EDIT") void this.openSaved(m.id, "edit");
    if (action === "RENAME") this.openRename(m);
    if (action === "DELETE") { this.dialog = { kind: "delete", target: m }; this.render(); }
  }
  private back() {
    if (this.mode === "watch" || (this.mode === "edit" && this.meta)) { void this.openLibrary(); return; }
    this.close();
  }

  // ---- DOM ----------------------------------------------------------------------
  private visibleButtons() { return this.buttons.filter((b) => !b.show || b.show()); }
  private say(text: string) { this.notice = text; this.noticeAge = 0; this.render(); }
  private render() {
    if (!this.open) return;
    this.root.dataset.mode = this.mode;
    if (this.mode === "library") { this.root.innerHTML = this.libraryHtml() + this.dialogHtml(); return; }
    const shown = this.visibleButtons(); this.focus = Math.min(this.focus, shown.length - 1);
    const d = this.duration || 1, pct = (v: number) => `${(v / d) * 100}%`;
    const name = this.meta?.name ?? "NEW CAPTURE", map = this.clip ? this.host.mapName(this.clip.map) : "";
    this.root.innerHTML = `
      <div class="re-head"><span class="re-eyebrow">${this.mode === "watch" ? "REPLAY" : "REPLAY EDITOR"}</span><h2>${esc(name)}</h2><small>${esc(map.toUpperCase())} · ${this.clip?.rideable === "longboard" ? "LONGBOARD" : "SCOOTER"} · CAPTURED ${this.duration.toFixed(1)} S${this.dirty ? " · UNSAVED" : ""}</small></div>
      <div class="re-badge"><i></i>${this.view === "first" ? "FIRST PERSON" : "THIRD PERSON"}${this.speed !== 1 ? ` · ${this.speed}×` : ""}</div>
      ${this.exporting ? `<div class="re-export"><b>RENDERING REPLAY...</b><u><s style="width:0%"></s></u><small>B CANCELS</small></div>` : ""}
      <div class="re-dock">
        <div class="re-timeline" data-track>
          <div class="re-cut" style="left:0;width:${pct(this.trimIn)}"></div>
          <div class="re-keep" style="left:${pct(this.trimIn)};width:${pct(this.trimOut - this.trimIn)}"></div>
          <div class="re-cut" style="left:${pct(this.trimOut)};right:0"></div>
          <div class="re-handle re-in" data-handle="in" style="left:${pct(this.trimIn)}"><span>IN</span></div>
          <div class="re-handle re-out" data-handle="out" style="left:${pct(this.trimOut)}"><span>OUT</span></div>
          <div class="re-head-line" style="left:${pct(this.t)}"></div>
        </div>
        <div class="re-times"><span class="re-now">${clock(this.t)}</span><span class="re-clip">CLIP ${clock(this.trimIn)} – ${clock(this.trimOut)} · <b>${(this.trimOut - this.trimIn).toFixed(1)} S</b></span><span>${clock(this.duration)}</span></div>
        <div class="re-buttons">${shown.map((b, i) => `<button data-button="${b.id}" class="${i === this.focus ? "focus " : ""}${b.primary ? "primary" : ""}" ${b.disabled?.() ? "disabled" : ""}>${esc(b.label())}</button>`).join("")}</div>
        <p class="re-legend">${this.mode === "edit" ? "A SELECT · D-PAD ◀▶ BUTTONS · LS SCRUB · LB/RB 1 S · LT/RT 1 FRAME · X SET IN · Y SET OUT · VIEW CAMERA · B BACK" : "A SELECT · D-PAD ◀▶ BUTTONS · VIEW CAMERA · B BACK"}</p>
        <div class="re-notice${this.notice && this.noticeAge < 3 ? " on" : ""}">${esc(this.notice)}</div>
      </div>${this.dialogHtml()}`;
  }
  /** The parts that change every frame, without rebuilding the overlay. */
  private renderClock() {
    if (this.mode === "library") return;
    const d = this.duration || 1;
    const head = this.root.querySelector<HTMLElement>(".re-head-line"), now = this.root.querySelector<HTMLElement>(".re-now");
    if (head) head.style.left = `${(this.t / d) * 100}%`;
    if (now) now.textContent = clock(this.t);
    const bar = this.root.querySelector<HTMLElement>(".re-export s");
    if (bar) bar.style.width = `${THREE.MathUtils.clamp((this.t - this.trimIn) / Math.max(0.01, this.trimOut - this.trimIn), 0, 1) * 100}%`;
    const notice = this.root.querySelector<HTMLElement>(".re-notice");
    notice?.classList.toggle("on", !!this.notice && this.noticeAge < 3);
    const play = this.root.querySelector<HTMLElement>('[data-button="play"]');
    if (play) play.textContent = this.playing ? "PAUSE" : "PLAY";
  }
  private libraryHtml() {
    const date = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const rows = this.library.map((m, i) => `
      <li class="${i === this.row ? "focus" : ""}" data-row="${i}">
        <div class="re-thumb">${m.thumbnail ? `<img alt="" src="${m.thumbnail}">` : "<span>▶</span>"}</div>
        <div class="re-info"><b>${esc(m.name)}</b><small>${esc(m.mapName.toUpperCase())} · ${(m.trimOut - m.trimIn).toFixed(1)} S · ${m.camera === "first" ? "FIRST PERSON" : "THIRD PERSON"} · ${esc(date(m.createdAt))}</small></div>
        <div class="re-actions">${ReplayEditor.ACTIONS.map((a, c) => `<button data-library="${a}" data-row="${i}" class="${i === this.row && c === this.column ? "focus" : ""}">${a}</button>`).join("")}</div>
      </li>`).join("");
    return `<div class="re-library"><div class="re-head"><span class="re-eyebrow">REPLAYS</span><h2>SAVED REPLAYS</h2><small>${this.library.length} SAVED · WATCH, EDIT, RENAME OR DELETE</small></div>
      <button class="re-library-back" data-library-back>◀ BACK</button>
      ${this.library.length ? `<ul>${rows}</ul>` : `<p class="re-empty">No replays yet. Ride a line, then CAPTURE REPLAY from the phone's REPLAYS app or the Sesh menu.</p>`}
      <p class="re-legend">LS / D-PAD PICK · A SELECT · B BACK</p><div class="re-notice${this.notice && this.noticeAge < 3 ? " on" : ""}">${esc(this.notice)}</div></div>`;
  }
  private dialogHtml() {
    const d = this.dialog;
    if (!d) return "";
    if (d.kind === "rename") return `<div class="re-dialog"><section><b>NAME THIS REPLAY</b><input maxlength="48" value="${esc(d.target?.name ?? "")}" aria-label="Replay name"><div><button data-dialog="ok" class="primary">OK</button><button data-dialog="cancel">CANCEL</button></div><small>A / ENTER SAVES · B CANCELS</small></section></div>`;
    return `<div class="re-dialog"><section><b>DELETE "${esc(d.target.name)}"?</b><p>This cannot be undone.</p><div><button data-dialog="ok" class="primary">DELETE</button><button data-dialog="cancel">KEEP IT</button></div><small>A DELETES · B KEEPS</small></section></div>`;
  }
  private click(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-button],[data-library],[data-dialog],[data-library-back]");
    if (!el) return;
    if (el.dataset.libraryBack !== undefined) { this.back(); return; }
    if (el.dataset.dialog) { if (el.dataset.dialog === "ok") this.confirmDialog(); else { this.dialog = null; this.render(); } return; }
    if (el.dataset.library) { this.row = Number(el.dataset.row); this.libraryAction(this.library[this.row], el.dataset.library as never); return; }
    const shown = this.visibleButtons(), i = shown.findIndex((b) => b.id === el.dataset.button);
    if (i >= 0 && !shown[i].disabled?.()) { this.focus = i; shown[i].act(); this.render(); }
  }
  private pointer(e: PointerEvent, phase: "down" | "move") {
    if (!this.open || this.mode === "library") return;
    const track = this.root.querySelector<HTMLElement>("[data-track]");
    if (!track) return;
    if (phase === "down") {
      const handle = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
      if (handle) this.drag = handle.dataset.handle as "in" | "out";
      else if ((e.target as HTMLElement).closest("[data-track]")) { this.drag = "head"; this.playing = false; }
      else return;
    }
    if (!this.drag) return;
    const r = track.getBoundingClientRect(), t = THREE.MathUtils.clamp((e.clientX - r.left) / r.width, 0, 1) * this.duration;
    if (this.drag === "in") { this.trimIn = Math.min(t, this.trimOut - 0.5); this.dirty = true; this.seek(this.trimIn); }
    else if (this.drag === "out") { this.trimOut = Math.max(t, this.trimIn + 0.5); this.dirty = true; this.seek(this.trimOut); }
    else this.seek(t);
    this.render();
  }
}
export type { SavedReplay };
