// Riding diagnostics: a bounded replay of the last few seconds of simulation
// ticks, a small log of every launch assist applied (with its size), and a
// last-resort extreme-state guard. The guard exists to catch and record a rare
// failure (for example an intermittent coping launch) with the ticks that led
// to it. Any activation during a normal automated test is treated as a failed
// repair by the acceptance harness, not as a passing workaround.
import * as THREE from "three";

export interface ReplayRow {
  tick: number;
  t: number;
  state: string;
  grounded: boolean;
  grind: string | null;
  position: [number, number, number];
  velocity: [number, number, number];
  normalY: number;
  launch: string | null;
  orientation: [number, number, number];
  equipment: { deck: number; bars: number; bri: number; briTarget: number; briMismatch: number };
  input: { steer: number; lean: number; rx: number; ry: number; held: string[]; pressed: string[]; released: string[]; brake: number; pump: number };
}
/** Captured before landing response changes velocity or resets trick state. */
export interface LandingEntry {
  t: number;
  position: [number, number, number];
  velocity: [number, number, number];
  normal: [number, number, number];
  impact: number;
  pitchError: number;
  quality: string;
  launch: string | null;
  quarter: string | null;
  deck: number;
  bars: number;
  bri: number;
  briMismatch: number;
}
export interface AssistEntry { t: number; kind: string; detail: Record<string, number> }
export interface Incident { t: number; reason: string; before: [number, number, number]; after: [number, number, number]; replay: ReplayRow[]; assists: AssistEntry[] }

/** Seconds of history kept, at the fixed 1/120 tick. */
const REPLAY_TICKS = 360;
/** Largest plausible speed change inside one tick outside a bail (m/s). A pop
 * adds at most ~6 m/s and a lip redirect conserves speed. */
export const GUARD_SPEED_STEP = 14;
/** Largest plausible riding speed anywhere (m/s); B Hill peaks near 20. */
export const GUARD_SPEED = 45;

export class RidingDiagnostics {
  readonly replay: ReplayRow[] = [];
  readonly assists: AssistEntry[] = [];
  readonly incidents: Incident[] = [];
  readonly landings: LandingEntry[] = [];
  private tick = 0;

  record(row: Omit<ReplayRow, "tick">) {
    this.replay.push({ tick: this.tick++, ...row });
    if (this.replay.length > REPLAY_TICKS) this.replay.shift();
  }

  assist(t: number, kind: string, detail: Record<string, number>) {
    this.assists.push({ t, kind, detail });
    if (this.assists.length > 60) this.assists.shift();
  }

  landing(entry: LandingEntry) {
    this.landings.push(entry);
    if (this.landings.length > 30) this.landings.shift();
  }

  /**
   * Checks one tick. Returns a reason when the state is non-finite or its speed
   * changed or grew beyond what riding can produce; the caller restores the
   * previous velocity and the incident is kept with its replay.
   */
  check(t: number, before: THREE.Vector3, after: THREE.Vector3, position: THREE.Vector3, bailing: boolean) {
    let reason = "";
    if (!Number.isFinite(after.lengthSq() + position.lengthSq())) reason = "non-finite state";
    else if (!bailing && Math.abs(after.length() - before.length()) > GUARD_SPEED_STEP) reason = `speed changed ${before.length().toFixed(1)} -> ${after.length().toFixed(1)} m/s in one tick`;
    else if (after.length() > GUARD_SPEED) reason = `speed ${after.length().toFixed(1)} m/s above the ${GUARD_SPEED} m/s guard`;
    if (!reason) return null;
    const incident: Incident = { t, reason, before: before.toArray() as [number, number, number], after: after.toArray() as [number, number, number], replay: this.replay.slice(-240), assists: this.assists.slice(-20) };
    this.incidents.push(incident);
    if (this.incidents.length > 5) this.incidents.shift();
    if (typeof console !== "undefined") console.warn("[riding guard]", reason, "- replay kept in sim.diagnostics.incidents");
    return reason;
  }
}
