import * as THREE from "three";
import { RiderModel } from "../scooter/model";
import { blendPose } from "../network/pose-blend";
import { AVATAR_PRESETS } from "../avatar/config";
import { EMOTES } from "../ui/social";
import type { LocalProfile } from "../data/loadout";
import type { PlayfulHit, PlayfulTarget, Strength, ThrowableKind } from "./playful";

/**
 * Park locals (#47): a few people hanging out around the park, and the first
 * PlayfulTarget. They stand, turn, wander a couple of metres from their spot,
 * and react to what friends do to them: a laugh at a paper ball, a head shake
 * at an acorn, a stumble from a shove. Hit one with something and they may
 * well throw it back.
 *
 * An NPC is drawn exactly like a remote rider: a RiderModel posed from the
 * multiplayer pose (network/client.ts capture) through blendPose, standing on
 * foot with no ride. They have no physics body: riders pass through them, and
 * only playful hits move them (a bounded slide along the ground).
 */
export interface NpcSpot { x: number; z: number; yaw: number }
/** Where Veterans Memorial Park's locals hang out. */
export const VETERANS_LOCALS: NpcSpot[] = [
  { x: -30, z: 3, yaw: Math.PI / 2 }, // beside the wood park
  { x: -84, z: 8, yaw: -Math.PI / 2 }, // on the lake shore
  { x: -46, z: -121, yaw: -Math.PI / 2 }, // at the ballfield DIY lot
  { x: 31, z: -40, yaw: Math.PI }, // by the monument path
  { x: -23.5, z: -36.5, yaw: 0 }, // at the pavilion
];

const emoteLength = (id: string) => EMOTES.find((e) => e.id === id)?.duration ?? 2;
/** Seconds between an NPC deciding to throw back and the throw. */
export const RETALIATE_DELAY = 0.9;

export class Npc implements PlayfulTarget {
  readonly kind = "npc" as const;
  readonly radius = 0.35;
  readonly height = 1.75;
  readonly position: THREE.Vector3;
  readonly model: RiderModel;
  yaw: number;
  /** Where they like to stand. */
  readonly home: THREE.Vector3;
  private state: any;
  private speed = 0;
  private walkTo: THREE.Vector3 | null = null;
  private idle = 2 + Math.random() * 4;
  private slide = new THREE.Vector3();
  private slideTime = 0;
  private turnTo: number | null = null;
  emote: { id: string; time: number; duration: number } | null = null;
  /** Who annoyed them last, and until when they remember (seconds on their clock). */
  grudge: { source: string; until: number } | null = null;
  retaliate: { at: number; source: string; item: ThrowableKind } | null = null;
  private clock = 0;
  /** Reactions shown (tests, and the report). */
  readonly log: { strength: Strength; emote: string | null; source: string }[] = [];

  constructor(scene: THREE.Scene, readonly id: string, spot: NpcSpot, look: number, template: any, profile: LocalProfile, private ground: (x: number, z: number) => number) {
    this.position = new THREE.Vector3(spot.x, ground(spot.x, spot.z), spot.z);
    this.home = this.position.clone();
    this.yaw = spot.yaw;
    this.model = new RiderModel(scene);
    const preset = AVATAR_PRESETS[look % AVATAR_PRESETS.length];
    this.model.applyProfile({ ...structuredClone(profile), avatar: structuredClone(preset.config) } as LocalProfile);
    this.model.root.name = "NPC " + id;
    // Standing on foot, no ride, nothing in hand: the rest of the pose is the template's.
    this.state = { ...structuredClone(template), walking: true, running: false, sitting: null, state: "Walking", grounded: true, speed: 0, heldItem: null, crash: null, swim: null, mantle: null, fastplant: null, jumpOn: false, grinding: false, getUpTimer: 0, emote: null, rideable: "scooter", pushTimer: 0, popTimer: 0, landTimer: 0, charge: 0 };
  }

  /** Shows a playful hit. Called only once PlayfulRules has let it land. */
  receive(hit: PlayfulHit) {
    const annoyed = hit.strength !== "cosmetic";
    const reaction = hit.strength === "cosmetic" ? pick(["laugh", "shrug", "clap"]) : hit.strength === "flinch" ? pick(["shake", "facepalm", "shrug"]) : pick(["facepalm", "point", "shake"]);
    this.play(reaction);
    // Face whoever did it.
    this.turnTo = Math.atan2(hit.from.x - this.position.x, hit.from.z - this.position.z);
    if (hit.strength === "push" || hit.strength === "stumble" || hit.strength === "wobble") {
      this.slide.copy(hit.direction).setY(0).normalize().multiplyScalar(hit.strength === "stumble" ? 2.6 : hit.strength === "push" ? 1.6 : 0.6);
      this.slideTime = hit.strength === "stumble" ? 0.55 : 0.4;
      this.walkTo = null;
    }
    if (annoyed) this.grudge = { source: hit.source, until: this.clock + 10 };
    // A thrown thing may come straight back.
    if (hit.kind === "throw" && annoyed && !this.retaliate && Math.random() < 0.6) this.retaliate = { at: this.clock + RETALIATE_DELAY, source: hit.source, item: hit.item === "paper" ? "paper" : "acorn" };
    this.log.push({ strength: hit.strength, emote: reaction, source: hit.source });
    return true;
  }
  play(id: string) { this.emote = { id, time: 0, duration: emoteLength(id) }; }

  /**
   * One step: slide from a shove, finish an emote, idle about, and hand back
   * a retaliation throw when it is due (the crowd throws it).
   */
  update(dt: number): { source: string; item: ThrowableKind } | null {
    this.clock += dt;
    let due: { source: string; item: ThrowableKind } | null = null;
    if (this.slideTime > 0) {
      this.slideTime -= dt;
      this.position.addScaledVector(this.slide, dt);
      this.slide.multiplyScalar(Math.exp(-dt * 3));
      this.speed = this.slide.length();
    } else if (this.emote) {
      this.speed = 0;
    } else if (this.walkTo) {
      const to = this.walkTo.clone().sub(this.position).setY(0), d = to.length();
      if (d < 0.1) { this.walkTo = null; this.speed = 0; }
      else { this.speed = Math.min(1.1, d * 2); this.position.addScaledVector(to.normalize(), this.speed * dt); this.turnTo = Math.atan2(to.x, to.z); }
    } else {
      this.speed = 0;
      this.idle -= dt;
      if (this.idle <= 0) {
        this.idle = 4 + Math.random() * 6;
        if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5; this.walkTo = this.home.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r)); }
        else this.turnTo = this.yaw + (Math.random() - 0.5) * 2;
      }
    }
    if (this.turnTo !== null) {
      const delta = Math.atan2(Math.sin(this.turnTo - this.yaw), Math.cos(this.turnTo - this.yaw));
      this.yaw += delta * Math.min(1, dt * 6);
      if (Math.abs(delta) < 0.02) this.turnTo = null;
    }
    if (this.emote) { this.emote.time += dt; if (this.emote.time >= this.emote.duration) this.emote = null; }
    if (this.retaliate && this.clock >= this.retaliate.at) { due = { source: this.retaliate.source, item: this.retaliate.item }; this.retaliate = null; }
    if (this.grudge && this.clock > this.grudge.until) this.grudge = null;
    this.position.y = this.ground(this.position.x, this.position.z);
    return due;
  }

  /**
   * Distance detail (#85): past NPC_DETAIL.near the smallest parts (laces,
   * eyelets, strands, bolts) and every shadow drop out, a few draw calls each
   * that no one can see at that range; past NPC_DETAIL.far the local is not
   * drawn or posed at all. Only parts that were showing are put back.
   */
  private level = 2;
  private coarse = false;
  private fine: THREE.Mesh[] = [];
  private shadows: THREE.Mesh[] = [];
  private detail(eye: THREE.Vector3 | undefined) {
    const d = eye ? eye.distanceTo(this.position) : 0, level = d > NPC_DETAIL.far ? 0 : d > NPC_DETAIL.near ? 1 : 2;
    if (level === this.level) return level;
    this.level = level;
    const root = this.model.root, coarse = level < 2;
    root.visible = level > 0;
    if (coarse && !this.coarse) {
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible || NPC_DETAIL.keep.test(mesh.name) || NPC_DETAIL.keep.test(mesh.parent?.name ?? "")) return;
        if (mesh.castShadow) { mesh.castShadow = false; this.shadows.push(mesh); }
        const g = mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        if (g.boundingSphere!.radius * mesh.matrixWorld.getMaxScaleOnAxis() < NPC_DETAIL.fine) { mesh.visible = false; this.fine.push(mesh); }
      });
    } else if (!coarse && this.coarse) {
      for (const mesh of this.fine) mesh.visible = true;
      for (const mesh of this.shadows) mesh.castShadow = true;
      this.fine = []; this.shadows = [];
    }
    this.coarse = coarse;
    return level;
  }
  /** Poses the model for this frame; `eye` is the camera, for distance detail. */
  render(dt: number, elapsed: number, eye?: THREE.Vector3) {
    if (this.detail(eye) === 0) return;
    const s = this.state;
    s.position = this.position.toArray(); s.yaw = this.yaw; s.speed = this.speed; s.elapsed = elapsed;
    s.emote = this.emote ? { ...this.emote, hand: 0 } : null;
    const p: any = blendPose(s, s, 0);
    p.velocity = new THREE.Vector3(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);
    this.model.update(p, dt, 1);
    this.model.scooter.visible = false;
    this.model.board.visible = false;
  }
  /** Where a throw leaves their hand. */
  hand() { return this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 0.3, 1.5, Math.cos(this.yaw) * 0.3)); }
  dispose() { this.model.dispose(); }
}

/** Distance detail for the locals (metres): fine parts under `fine` m across hide past `near`; nothing past `far`. */
export const NPC_DETAIL = { near: 25, far: 70, fine: 0.05, keep: /headlamp|phone|item|drink|cup|bottle|food|held|throw/i };
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
