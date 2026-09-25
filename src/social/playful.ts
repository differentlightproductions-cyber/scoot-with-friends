import * as THREE from "three";

/**
 * "With Friends" playful interactions (#47): one framework for everything
 * friends do to each other that is not riding. Throws, shoves and (later)
 * splashes all become a PlayfulHit delivered to a PlayfulTarget. NPCs are the
 * first targets; the local player is one too, and a remote player will be:
 * nothing here depends on NPCs.
 *
 * There is no health and no damage. A hit's strength class says how much it
 * may move the target, and each target decides how it shows it (a flinch, a
 * stumble, a laugh). Everything is low-stakes, short and reversible.
 */

/** How much a hit may do, weakest first. */
export type Strength = "cosmetic" | "flinch" | "wobble" | "push" | "stumble" | "ragdoll" | "splash";
export const STRENGTHS: Strength[] = ["cosmetic", "flinch", "wobble", "push", "stumble", "ragdoll", "splash"];
export const atMost = (a: Strength, b: Strength): Strength => (STRENGTHS.indexOf(a) <= STRENGTHS.indexOf(b) ? a : b);

/** Throwables (#47) and litter (#58, #78): paper is a balled-up napkin; wrapper a chip bag; bottle a water bottle; sports a sports drink; popper a spent party popper. */
export type ThrowableKind = "acorn" | "pinecone" | "rock" | "can" | "paper" | "wrapper" | "bottle" | "sports" | "popper";
export type HitKind = "throw" | "shove";

export interface PlayfulHit {
  kind: HitKind;
  /** What was thrown, for throws. */
  item?: ThrowableKind;
  /** Who did it: "local", an NPC id, or later a remote player id. */
  source: string;
  /** Where it came from and which way it pushes (horizontal, normalised). */
  from: THREE.Vector3;
  direction: THREE.Vector3;
  strength: Strength;
}

/** Anything a playful hit can land on. */
export interface PlayfulTarget {
  id: string;
  kind: "npc" | "local" | "remote";
  /** Feet position and body size, for hit tests. */
  position: THREE.Vector3;
  radius: number;
  height: number;
  /** Shows the hit. Returns false when the target shrugged it off (immune, off). */
  receive(hit: PlayfulHit): boolean;
}

/**
 * Future network authority: the events a multiplayer session would send. The
 * client-side simulation here is not authority; a server would validate these.
 */
export type PlayfulEvent =
  | { type: "ThrowItem"; source: string; item: ThrowableKind; from: [number, number, number]; velocity: [number, number, number] }
  | { type: "ItemImpact"; source: string; target: string; item: ThrowableKind; strength: Strength }
  | { type: "ShoveRequest"; source: string; target: string; direction: [number, number]; strength: Strength }
  | { type: "SplashEvent"; source: string; target: string }
  | { type: "EmoteEvent"; source: string; emote: string };

/** The PLAYFUL CONTACT setting: FULL, FRIENDS ONLY, OFF. */
export type PlayfulContact = "full" | "friends" | "off";

/** What each throwable does on a hit: all of them playful. */
export const THROW_STRENGTH: Record<ThrowableKind, Strength> = { acorn: "flinch", pinecone: "flinch", paper: "cosmetic", can: "flinch", rock: "flinch", wrapper: "cosmetic", bottle: "flinch", sports: "flinch", popper: "cosmetic" };
/** Shoves grow with the pusher's speed but never past a stumble on foot. */
export const shoveStrength = (relativeSpeed: number): Strength => (relativeSpeed > 3 ? "stumble" : "push");

/**
 * Anti-grief rules, shared by every target. A knocked-down target gets a
 * short immunity; the same source cannot repeat the same shove on the same
 * target straight away; everyone is protected for a moment after a respawn;
 * and with PLAYFUL CONTACT off, hits from other people only show cosmetically.
 */
export class PlayfulRules {
  contact: PlayfulContact = "full";
  /** Seconds of immunity after a stumble or bigger. */
  static RECOVERY = 2.5;
  /** Seconds before the same source can shove the same target again. */
  static SHOVE_COOLDOWN = 1.2;
  /** Seconds of protection after a respawn. */
  static SPAWN_GRACE = 3;
  private clock = 0;
  private immuneUntil = new Map<string, number>();
  private lastShove = new Map<string, number>();

  update(dt: number) { this.clock += dt; }
  /** A target respawned or reset: protect it briefly. */
  spawned(target: string) { this.immuneUntil.set(target, Math.max(this.immuneUntil.get(target) ?? 0, this.clock + PlayfulRules.SPAWN_GRACE)); }

  /**
   * How strong this hit may be on this target now, or null when it does not
   * land at all. `friend` says whether the source is the target's friend
   * (FRIENDS ONLY needs multiplayer friends; NPCs count as friends for testing).
   */
  allow(target: PlayfulTarget, hit: PlayfulHit, friend = true): Strength | null {
    if (hit.source === target.id) return null;
    if (target.kind === "local" && hit.source !== "local") {
      if (this.contact === "off" || (this.contact === "friends" && !friend)) return "cosmetic";
    }
    // A repeated shove does nothing at all; a hit during a recovery only shows.
    if (hit.kind === "shove") {
      const key = hit.source + ">" + target.id, last = this.lastShove.get(key);
      if (last !== undefined && this.clock - last < PlayfulRules.SHOVE_COOLDOWN) return null;
      this.lastShove.set(key, this.clock);
    }
    if (this.clock < (this.immuneUntil.get(target.id) ?? -1)) return "cosmetic";
    return hit.strength;
  }
  /** A hit landed at this strength: a big one earns the target a recovery window. */
  landed(target: PlayfulTarget, strength: Strength) {
    if (STRENGTHS.indexOf(strength) >= STRENGTHS.indexOf("stumble")) this.immuneUntil.set(target.id, this.clock + PlayfulRules.RECOVERY);
  }
}

/**
 * The launch velocity that carries a throw from `from` to `to` in `time`
 * seconds under gravity: aim assist for a throw at a picked target.
 */
export function lobVelocity(from: THREE.Vector3, to: THREE.Vector3, time: number, gravity = 9.81) {
  return new THREE.Vector3((to.x - from.x) / time, (to.y - from.y) / time + 0.5 * gravity * time, (to.z - from.z) / time);
}
