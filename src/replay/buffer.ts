/**
 * The replay history (#41): a rolling record of the last 15-60 s of play, as
 * the rider's render state (the same pose the multiplayer code sends, see
 * network/client.ts capture) sampled 30 times a second. It is state, not video:
 * a first-person line can be watched in third person and back, and playback
 * only places the recorded rider, it never steps physics.
 *
 * Each sample is one compact JSON string with numbers rounded to what the eye
 * can see; a 60 s history is about 1,800 of them. Once a second a sample holds
 * the whole pose (a key frame); in between, only the parts of the pose that
 * changed since the sample before. Most of a pose (stance, rideable, the trick
 * states between tricks) holds still for seconds, so this keeps a 60 s history
 * to a few megabytes. Old samples fall off the front as new ones arrive, so
 * memory stays flat however long the session runs.
 */
export const REPLAY_HISTORY = [15, 30, 45, 60] as const;
export type ReplayHistory = (typeof REPLAY_HISTORY)[number];
export const REPLAY_RATE = 30;
export type ReplayView = "first" | "third";

export interface ReplayFrame {
  /** Seconds on the simulation clock (paused time does not count). */
  t: number;
  /** The rider's pose as compact JSON (see capture in network/client.ts). */
  pose: string;
  /** The camera the player was using then. */
  view: ReplayView;
  /** A key frame holds the whole pose; any other frame only what changed since the one before. */
  key?: true;
}
/** A captured replay: everything needed to watch it again later on the same map. */
export interface ReplayClip {
  version: 1;
  map: string;
  /** Build-mode layout revision the clip was ridden on (Warehouse), when known. */
  layout: string | null;
  rideable: "scooter" | "longboard";
  /** The rider's look: avatar, scooter and board (the multiplayer appearance). */
  appearance: unknown;
  frames: ReplayFrame[];
}

/** Rounds every number to 4 decimals: millimetres and hundredths of a degree. */
const compact = (_key: string, value: unknown) => (typeof value === "number" ? Math.round(value * 1e4) / 1e4 : value);
export const packPose = (pose: unknown) => JSON.stringify(pose, compact);
/** Key frames per second of history. */
const KEY_EVERY = REPLAY_RATE;

/**
 * The full poses of a run of frames, oldest first. The first frame is read
 * whole; each later one is the pose before it with that frame's changes laid
 * over. Clips saved before key frames existed hold whole poses in every frame,
 * which reads the same way.
 */
export function decodePoses(frames: ReplayFrame[]): any[] {
  const out: any[] = [];
  let prev: any = {};
  for (const f of frames) {
    const part = JSON.parse(f.pose);
    prev = f.key ? part : { ...prev, ...part };
    out.push(prev);
  }
  return out;
}

export class ReplayBuffer {
  history: ReplayHistory = 30;
  private frames: ReplayFrame[] = [];
  private start = 0;
  private last = -Infinity;
  /** The last sample's pose, part by part, as packed JSON: what the next sample is compared with. */
  private parts: Record<string, string> = {};
  private sinceKey = KEY_EVERY;

  /** Offers the current pose; kept when a 30 Hz slot has passed. `pose` is only built when kept. */
  record(t: number, pose: () => unknown, view: ReplayView) {
    // A new session (the clock went backwards) starts a new history.
    if (t < this.last - 1e-6) this.clear();
    if (t - this.last < 1 / REPLAY_RATE - 1e-4) return false;
    this.last = t;
    const full = pose() as Record<string, unknown>, parts: Record<string, string> = {};
    for (const k of Object.keys(full)) parts[k] = packPose(full[k]);
    const key = this.sinceKey >= KEY_EVERY;
    const changed = key ? Object.keys(parts) : Object.keys(parts).filter((k) => parts[k] !== this.parts[k]);
    const packed = "{" + changed.map((k) => JSON.stringify(k) + ":" + parts[k]).join(",") + "}";
    this.frames.push(key ? { t, pose: packed, view, key: true } : { t, pose: packed, view });
    this.parts = parts;
    this.sinceKey = key ? 1 : this.sinceKey + 1;
    // Drop what has aged out, in chunks so the array is not shifted every sample.
    // Whole seconds at a time: a key frame and the changes after it go together.
    for (;;) {
      let next = this.start + 1;
      while (next < this.frames.length && !this.frames[next].key) next++;
      if (next >= this.frames.length || this.frames[next].t >= t - this.history - 0.5) break;
      this.start = next;
    }
    if (this.start > 256) { this.frames = this.frames.slice(this.start); this.start = 0; }
    return true;
  }
  /**
   * The recorded history, oldest first (at most the configured seconds). The
   * first sample is always a key frame: the window rarely starts on one, so the
   * sample it starts on is rebuilt whole from the key frame before it.
   */
  get samples(): ReplayFrame[] {
    const end = this.frames.at(-1)?.t ?? 0, all = this.frames.slice(this.start);
    const first = all.findIndex((f) => f.t >= end - this.history - 1e-6);
    if (first < 0) return [];
    let key = first;
    while (key > 0 && !all[key].key) key--;
    const out = all.slice(first).map((f) => ({ ...f }));
    if (!out[0].key) out[0] = { ...out[0], pose: packPose(decodePoses(all.slice(key, first + 1)).at(-1)), key: true };
    return out;
  }
  get duration() {
    const s = this.samples;
    return s.length > 1 ? s[s.length - 1].t - s[0].t : 0;
  }
  /** A copy of the current history as a clip; recording carries on untouched. */
  snapshot(meta: Omit<ReplayClip, "version" | "frames">): ReplayClip {
    return { version: 1, ...meta, frames: this.samples };
  }
  /** Approximate memory held by the history, in bytes (UTF-16 strings plus per-sample overhead). */
  get bytes() {
    let n = 0;
    for (let i = this.start; i < this.frames.length; i++) n += this.frames[i].pose.length * 2 + 48;
    return n;
  }
  clear() { this.frames = []; this.start = 0; this.last = -Infinity; this.parts = {}; this.sinceKey = KEY_EVERY; }
}

/** The pair of frames around time `t` and how far between them it is (0..1). */
export function frameAt(frames: ReplayFrame[], t: number) {
  if (!frames.length) return null;
  if (t <= frames[0].t) return { a: frames[0], b: frames[0], k: 0, index: 0 };
  const lastIndex = frames.length - 1;
  if (t >= frames[lastIndex].t) return { a: frames[lastIndex], b: frames[lastIndex], k: 0, index: lastIndex };
  let lo = 0, hi = lastIndex;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid; }
  const a = frames[lo], b = frames[hi];
  return { a, b, k: (t - a.t) / Math.max(1e-6, b.t - a.t), index: lo };
}
