import * as THREE from "three";
import type { InputFrame } from "../input/input";
import type { Simulation } from "../physics/simulation";
import type { LocalProfile } from "../data/loadout";
import { Npc, type NpcSpot } from "./npcs";
import { PlayfulRules, THROW_STRENGTH, atMost, lobVelocity, shoveStrength, type PlayfulEvent, type PlayfulHit, type PlayfulTarget, type Strength, type ThrowableKind } from "./playful";

/**
 * "With Friends" in the park (#47): small things to throw lying around,
 * the locals to throw them at, shoves, and the locals throwing back. Priority
 * A of the spec, first slice. On foot:
 *   B near something small picks it up (hands free);
 *   RT throws what you carry, or an empty can or wrapper from your pockets;
 *   RT next to someone with nothing to throw gives them a shove.
 * Throws aim themselves at the nearest person in front, within reach.
 */
const THROW_REACH = 18;
const GRAVITY = 9.81;
const LOOK: Record<ThrowableKind, { color: number; size: number; shape: "ball" | "can" | "cone" }> = {
  acorn: { color: 0x8a5a2b, size: 0.03, shape: "ball" },
  pinecone: { color: 0x6b4a2a, size: 0.045, shape: "cone" },
  rock: { color: 0x9d9486, size: 0.04, shape: "ball" },
  can: { color: 0xc8262d, size: 0.033, shape: "can" },
  paper: { color: 0xeeeae0, size: 0.04, shape: "ball" },
};
const NAME: Record<ThrowableKind, string> = { acorn: "acorn", pinecone: "pinecone", rock: "rock", can: "empty can", paper: "paper ball" };

interface Thing { kind: ThrowableKind; mesh: THREE.Mesh; velocity: THREE.Vector3; state: "ground" | "carried" | "flying"; thrower: string; rest: number; hit: Set<string> }

/** The local player as a playful target: a flinch shows as a camera bump and a word on the HUD. */
export class LocalTarget implements PlayfulTarget {
  readonly id = "local";
  readonly kind = "local" as const;
  readonly radius = 0.4;
  readonly height = 1.75;
  position = new THREE.Vector3();
  /** Last reaction, for the HUD and tests. */
  last: { strength: Strength; source: string; at: number } | null = null;
  onHit: (hit: PlayfulHit) => void = () => {};
  receive(hit: PlayfulHit) { this.last = { strength: hit.strength, source: hit.source, at: performance.now() }; this.onHit(hit); return true; }
}

export class WithFriends {
  readonly rules = new PlayfulRules();
  readonly npcs: Npc[] = [];
  readonly local = new LocalTarget();
  private things: Thing[] = [];
  carried: Thing | null = null;
  readonly events: PlayfulEvent[] = [];
  readonly prompt = document.createElement("div");
  private geometries: Partial<Record<ThrowableKind, THREE.BufferGeometry>> = {};
  private materials: Partial<Record<ThrowableKind, THREE.Material>> = {};

  constructor(private scene: THREE.Scene, private ground: (x: number, z: number) => number) {
    this.prompt.className = "world-prompt playful-prompt";
    this.prompt.hidden = true;
    document.body.append(this.prompt);
  }

  /** Puts the locals in, and scatters small throwables near them and under trees. */
  populate(spots: NpcSpot[], template: any, profile: LocalProfile, scatter: [number, number, ThrowableKind][]) {
    spots.forEach((spot, i) => this.npcs.push(new Npc(this.scene, "local-" + (i + 1), spot, i + 2, template, profile, this.ground)));
    for (const [x, z, kind] of scatter) this.spawn(kind, new THREE.Vector3(x, this.ground(x, z), z));
  }

  private spawn(kind: ThrowableKind, at: THREE.Vector3) {
    const look = LOOK[kind];
    this.geometries[kind] ??= look.shape === "can" ? new THREE.CylinderGeometry(look.size, look.size, look.size * 3.6, 12) : look.shape === "cone" ? new THREE.ConeGeometry(look.size, look.size * 2.4, 8) : new THREE.IcosahedronGeometry(look.size, 1);
    this.materials[kind] ??= new THREE.MeshStandardMaterial({ color: look.color, roughness: kind === "can" ? 0.35 : 0.9, metalness: kind === "can" ? 0.6 : 0 });
    const mesh = new THREE.Mesh(this.geometries[kind], this.materials[kind]);
    mesh.name = "Throwable " + kind;
    mesh.castShadow = true;
    mesh.position.copy(at).setY(at.y + look.size);
    if (look.shape === "can") mesh.rotation.z = Math.PI / 2;
    this.scene.add(mesh);
    const thing: Thing = { kind, mesh, velocity: new THREE.Vector3(), state: "ground", thrower: "", rest: 0, hit: new Set() };
    this.things.push(thing);
    return thing;
  }

  /** Everyone a hit can land on. */
  get targets(): PlayfulTarget[] { return [this.local, ...this.npcs]; }

  /** Delivers a hit through the rules: it may be softened to cosmetic or not land at all. */
  deliver(target: PlayfulTarget, hit: PlayfulHit) {
    const allowed = this.rules.allow(target, hit);
    if (!allowed) return null;
    const landed = { ...hit, strength: atMost(hit.strength, allowed) };
    if (!target.receive(landed)) return null;
    this.rules.landed(target, landed.strength);
    this.events.push(hit.kind === "shove"
      ? { type: "ShoveRequest", source: hit.source, target: target.id, direction: [hit.direction.x, hit.direction.z], strength: landed.strength }
      : { type: "ItemImpact", source: hit.source, target: target.id, item: hit.item!, strength: landed.strength });
    if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
    return landed.strength;
  }

  /** Throws `kind` from `from`, aimed at `target` when there is one, else along `heading`. */
  throwFrom(source: string, kind: ThrowableKind, from: THREE.Vector3, heading: number, target: PlayfulTarget | null, thing?: Thing) {
    const t = thing ?? this.spawn(kind, from);
    t.state = "flying"; t.thrower = source; t.rest = 0; t.hit.clear();
    t.mesh.position.copy(from);
    if (target) {
      const aim = target.position.clone().setY(target.position.y + target.height * 0.62), time = THREE.MathUtils.clamp(from.distanceTo(aim) / 13, 0.25, 1.1);
      t.velocity.copy(lobVelocity(from, aim, time, GRAVITY));
    } else t.velocity.set(Math.sin(heading) * 11, 3.2, Math.cos(heading) * 11);
    this.events.push({ type: "ThrowItem", source, item: kind, from: from.toArray() as [number, number, number], velocity: t.velocity.toArray() as [number, number, number] });
    return t;
  }

  /** The person nearest the middle of the view in front of `from`, within reach. */
  private aimFor(from: THREE.Vector3, heading: number, exclude: string) {
    const f = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    let best: PlayfulTarget | null = null, score = 0.8;
    for (const t of this.targets) {
      if (t.id === exclude) continue;
      const to = t.position.clone().sub(from).setY(0), d = to.length();
      if (d < 0.5 || d > THROW_REACH) continue;
      const facing = to.normalize().dot(f);
      if (facing > score) { score = facing; best = t; }
    }
    return best;
  }
  private nearestNpc(s: Simulation, reach: number, heading: number) {
    const f = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    return this.npcs.map((n) => ({ n, d: n.position.distanceTo(s.position), dot: n.position.clone().sub(s.position).setY(0).normalize().dot(f) }))
      .filter(({ d, dot }) => d < reach && dot > 0.2).sort((a, b) => a.d - b.d)[0]?.n ?? null;
  }

  /**
   * One frame of input on foot. Returns the frame gameplay still gets: the
   * buttons used here (B for a pickup, RT for a throw or shove) are taken out.
   * `heldEmpty` is the empty can or wrapper in the rider's hand, if any, and
   * `dropHeld` takes it out of their pockets as it is thrown.
   */
  update(dt: number, input: InputFrame, s: Simulation, enabled: boolean, heldEmpty: ThrowableKind | null, dropHeld: () => void): InputFrame {
    this.rules.update(dt);
    this.local.position.copy(s.position);
    this.prompt.hidden = true;
    const onFoot = enabled && s.walking && s.grounded && !s.sitting && s.state !== "Bail" && !s.swim;
    if (!onFoot && this.carried) this.drop(s);
    let out = input;
    if (onFoot) {
      const heading = s.yaw;
      const near = this.carried ? null : this.things.filter((t) => t.state === "ground" && t.mesh.position.distanceTo(s.position) < 1.3).sort((a, b) => a.mesh.position.distanceTo(s.position) - b.mesh.position.distanceTo(s.position))[0];
      const npc = this.nearestNpc(s, 1.6, heading);
      const throwing = this.carried?.kind ?? heldEmpty;
      if (throwing) this.show(`RT · Throw ${NAME[throwing]}`);
      else if (npc) this.show("RT · Shove");
      else if (near && !heldEmpty) this.show(`B · Pick up ${NAME[near.kind]}`);
      if (input.pressed.pumpGrind && throwing) {
        const hand = s.position.clone().add(new THREE.Vector3(Math.sin(heading) * 0.35, 1.45, Math.cos(heading) * 0.35));
        this.throwFrom("local", throwing, hand, heading, this.aimFor(s.position, heading, "local"), this.carried ?? undefined);
        if (!this.carried) dropHeld();
        this.carried = null;
        out = { ...out, pressed: { ...out.pressed, pumpGrind: false } };
      } else if (input.pressed.pumpGrind && npc) {
        const direction = npc.position.clone().sub(s.position).setY(0).normalize();
        this.deliver(npc, { kind: "shove", source: "local", from: s.position.clone(), direction, strength: shoveStrength(Math.hypot(s.velocity.x, s.velocity.z)) });
        s.emote = { id: "point", time: 0, duration: 0.5 };
        out = { ...out, pressed: { ...out.pressed, pumpGrind: false } };
      } else if (input.pressed.brakeBars && near && !heldEmpty) {
        near.state = "carried"; this.carried = near;
        out = { ...out, pressed: { ...out.pressed, brakeBars: false } };
      }
    }
    // The locals: idle, react, and throw back what they were hit with.
    for (const npc of this.npcs) {
      const due = npc.update(dt);
      if (due) {
        const target = due.source === "local" ? this.local : this.npcs.find((n) => n.id === due.source) ?? null;
        if (target && target.position.distanceTo(npc.position) < THROW_REACH) { npc.play("point"); this.throwFrom(npc.id, due.item, npc.hand(), npc.yaw, target); }
      }
    }
    this.fly(dt);
    return out;
  }

  private show(text: string) { this.prompt.hidden = false; this.prompt.textContent = text; }
  private drop(s: Simulation) {
    const t = this.carried!;
    this.carried = null;
    t.state = "ground";
    t.mesh.position.set(s.position.x, this.ground(s.position.x, s.position.z) + LOOK[t.kind].size, s.position.z);
  }

  /** Flight: gravity, a bounce or two, hits on anyone but the thrower, then rest where it lands. */
  private fly(dt: number) {
    for (const t of this.things) {
      if (t.state !== "flying") continue;
      t.velocity.y -= GRAVITY * dt;
      const p = t.mesh.position.addScaledVector(t.velocity, dt);
      t.mesh.rotation.x += dt * 9; t.mesh.rotation.y += dt * 5;
      for (const target of this.targets) {
        if (target.id === t.thrower || t.hit.has(target.id)) continue;
        const dx = p.x - target.position.x, dz = p.z - target.position.z, up = p.y - target.position.y;
        if (Math.hypot(dx, dz) < target.radius + 0.08 && up > 0 && up < target.height + 0.1) {
          t.hit.add(target.id);
          const direction = t.velocity.clone().setY(0).normalize();
          this.deliver(target, { kind: "throw", item: t.kind, source: t.thrower, from: p.clone().sub(direction), direction, strength: THROW_STRENGTH[t.kind] });
          // It bounces off and drops.
          t.velocity.set(-t.velocity.x * 0.2, Math.min(1.5, Math.abs(t.velocity.y) * 0.3), -t.velocity.z * 0.2);
        }
      }
      const floor = this.ground(p.x, p.z) + LOOK[t.kind].size;
      if (p.y <= floor) {
        p.y = floor;
        if (Math.abs(t.velocity.y) < 1.2) { t.velocity.set(0, 0, 0); t.state = "ground"; }
        else { t.velocity.y = -t.velocity.y * 0.35; t.velocity.x *= 0.55; t.velocity.z *= 0.55; }
      }
    }
    for (const t of this.things) if (t.state === "carried") t.mesh.visible = false; else t.mesh.visible = true;
  }

  /** The locals' poses, and a carried thing in the rider's hand. */
  render(dt: number, elapsed: number, hand?: THREE.Object3D) {
    for (const npc of this.npcs) npc.render(dt, elapsed);
    if (this.carried && hand) { this.carried.mesh.visible = true; hand.getWorldPosition(this.carried.mesh.position); }
  }

  dispose() {
    for (const n of this.npcs) n.dispose();
    for (const t of this.things) t.mesh.removeFromParent();
    for (const g of Object.values(this.geometries)) g?.dispose();
    for (const m of Object.values(this.materials)) m?.dispose();
    this.prompt.remove();
  }
}
