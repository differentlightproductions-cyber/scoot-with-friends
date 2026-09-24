/**
 * The replay history (#41): a rolling record of the last 15-60 s of play, as
 * the rider's render state (the same pose the multiplayer code sends, see
 * network/client.ts capture) sampled 30 times a second. It is state, not video:
 * a first-person line can be watched in third person and back, and playback
 * only places the recorded rider, it never steps physics.
 *
 * Each sample is one compact JSON string with numbers rounded to what the eye
 * can see; a 60 s history is about 1,800 of them. Old samples fall off the
 * front as new ones arrive, so memory stays flat however long the session runs.
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

export class ReplayBuffer {
  history: ReplayHistory = 30;
  private frames: ReplayFrame[] = [];
  private start = 0;
  private last = -Infinity;

  /** Offers the current pose; kept when a 30 Hz slot has passed. `pose` is only built when kept. */
  record(t: number, pose: () => unknown, view: ReplayView) {
    // A new session (the clock went backwards) starts a new history.
    if (t < this.last - 1e-6) this.clear();
    if (t - this.last < 1 / REPLAY_RATE - 1e-4) return false;
    this.last = t;
    this.frames.push({ t, pose: packPose(pose()), view });
    // Drop what has aged out, in chunks so the array is not shifted every sample.
    while (this.start < this.frames.length && this.frames[this.start].t < t - this.history - 0.5) this.start++;
    if (this.start > 256) { this.frames = this.frames.slice(this.start); this.start = 0; }
    return true;
  }
  /** The recorded history, oldest first (at most the configured seconds). */
  get samples() {
    const end = this.frames.at(-1)?.t ?? 0;
    return this.frames.slice(this.start).filter((f) => f.t >= end - this.history - 1e-6);
  }
  get duration() {
    const s = this.samples;
    return s.length > 1 ? s[s.length - 1].t - s[0].t : 0;
  }
  /** A copy of the current history as a clip; recording carries on untouched. */
  snapshot(meta: Omit<ReplayClip, "version" | "frames">): ReplayClip {
    return { version: 1, ...meta, frames: this.samples.map((f) => ({ ...f })) };
  }
  /** Approximate memory held by the history, in bytes (UTF-16 strings plus per-sample overhead). */
  get bytes() {
    let n = 0;
    for (let i = this.start; i < this.frames.length; i++) n += this.frames[i].pose.length * 2 + 48;
    return n;
  }
  clear() { this.frames = []; this.start = 0; this.last = -Infinity; }
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
