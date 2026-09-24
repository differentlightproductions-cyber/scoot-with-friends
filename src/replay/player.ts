import * as THREE from "three";
import { RiderModel } from "../scooter/model";
import { ChaseCamera } from "../camera/chase";
import { blendPose } from "../network/pose-blend";
import { emptyInput } from "../input/input";
import type { Simulation } from "../physics/simulation";
import type { LocalProfile } from "../data/loadout";
import { frameAt, type ReplayClip, type ReplayView } from "./buffer";

/**
 * Plays a captured clip back (#41): a second rider model placed from the
 * recorded poses, and its own chase camera, first or third person, whichever way
 * the line was ridden. The live Simulation is only read for the world it lives
 * in (camera collision rays); nothing is stepped, so playback never touches
 * physics or the live rider.
 */
export class ReplayPlayer {
  readonly model: RiderModel;
  readonly camera = new ChaseCamera();
  readonly start: number;
  readonly end: number;
  private poses: any[];
  private view: ReplayView | null = null;
  private lastTime = NaN;
  private idle = emptyInput();

  constructor(scene: THREE.Scene, readonly clip: ReplayClip, profile: LocalProfile, private live: () => Simulation, main: ChaseCamera) {
    this.poses = clip.frames.map((f) => JSON.parse(f.pose));
    this.start = clip.frames[0]?.t ?? 0;
    this.end = clip.frames.at(-1)?.t ?? 0;
    this.model = new RiderModel(scene);
    const look = (clip.appearance ?? {}) as Partial<LocalProfile> & { rideable?: "scooter" | "longboard" };
    this.model.applyProfile({ ...structuredClone(profile), ...look, activeRideable: look.rideable ?? clip.rideable, longboard: look.longboard ?? structuredClone(profile.longboard) } as LocalProfile);
    this.model.root.visible = false;
    // The player's own camera settings: field of view, motion comfort, first-person framing.
    Object.assign(this.camera, { thirdPersonFov: main.thirdPersonFov, firstPersonFov: main.firstPersonFov, motion: main.motion, fpTune: { ...main.fpTune }, mountFlourish: false });
    this.camera.camera.aspect = main.camera.aspect;
    this.camera.rider = this.model;
  }
  get duration() { return Math.max(0, this.end - this.start); }
  /** The recorded camera at clip time `t` (seconds from the start of the clip). */
  recordedView(t: number): ReplayView { return frameAt(this.clip.frames, this.start + t)?.a.view ?? "third"; }

  /** The rider's render state at clip time `t`, readable by RiderModel and ChaseCamera like the live Simulation. */
  state(t: number): Simulation | null {
    const frames = this.clip.frames, at = frameAt(frames, this.start + t);
    if (!at) return null;
    const i = at.index, j = Math.min(frames.length - 1, i + 1);
    const p: any = blendPose(this.poses[i], this.poses[at.k > 0 ? j : i], at.k);
    // Travel between neighbouring samples: the camera leads and follows it.
    const i0 = Math.max(0, i - 1), i1 = Math.min(frames.length - 1, i + 2), span = frames[i1].t - frames[i0].t;
    p.velocity = span > 1e-4 ? new THREE.Vector3().fromArray(this.poses[i1].position).sub(new THREE.Vector3().fromArray(this.poses[i0].position)).divideScalar(span) : new THREE.Vector3();
    p.grind = p.grinding ? {} : null;
    if (p.crash) p.crash.rider.angvel = () => ({ x: 0, y: 0, z: 0 });
    const live = this.live();
    p.world = live.world; p.body = live.body; p.park = live.park;
    return p as Simulation;
  }
  /**
   * Places the rider and the camera for clip time `t`, seen from `view`. A cut
   * (a new view, or a jump along the timeline) starts the camera fresh instead
   * of sweeping it across the park.
   */
  pose(t: number, view: ReplayView, dt: number) {
    const s = this.state(t);
    if (!s) return null;
    const jumped = !Number.isFinite(this.lastTime) || Math.abs(t - this.lastTime) > 0.35;
    if (view !== this.view || jumped) { this.camera.reset(); this.camera.view = view; this.view = view; }
    this.lastTime = t;
    this.model.root.visible = true;
    this.model.update(s, dt, 1);
    this.camera.update(s, this.idle, jumped ? 1 : Math.max(dt, 1 / 240), 1);
    // As live: the head is hidden only while the view really is from the eyes (a heavy crash cuts to third person).
    this.model.hideHead = view === "first" && this.camera.firstPersonActive;
    this.model.avatar.setFirstPerson(this.model.hideHead);
    return s;
  }
  resize(aspect: number) { this.camera.camera.aspect = aspect; this.camera.camera.updateProjectionMatrix(); }
  dispose() { this.model.dispose(); }
}
