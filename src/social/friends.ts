import * as THREE from "three";
import type { InputFrame } from "../input/input";
import type { Simulation } from "../physics/simulation";
import type { LocalProfile } from "../data/loadout";
import { Npc, type NpcSpot } from "./npcs";
import { PlayfulRules, THROW_STRENGTH, atMost, lobVelocity, shoveStrength, type PlayfulEvent, type PlayfulHit, type PlayfulTarget, type Strength, type ThrowableKind } from "./playful";
import { t } from '../i18n';
import { lie, litterModel, restHeight } from "../art/litter";

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
interface Thing { kind: ThrowableKind; mesh: THREE.Object3D; velocity: THREE.Vector3; state: "ground" | "carried" | "flying" | "binned"; thrower: string; rest: number; hit: Set<string>; own?: boolean }
/** Litter (#58): the kinds that go in a trash can. */
export const LITTER: ThrowableKind[] = ["can", "paper", "wrapper", "bottle", "sports", "popper"];
/** What the locals leave behind, most often first. */
const DROPPED: ThrowableKind[] = ["can", "wrapper", "bottle", "can", "paper", "wrapper", "sports", "bottle"];
/** Most litter lying around at once; the locals stop dropping more past it. */
const LITTER_MAX = 10;

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
  /** Trash can mouths (#58): B beside one throws litter away. */
  bins: THREE.Vector3[] = [];
  /** A piece of litter went in a bin; `fromOthers` when it was someone else's trash (it counts toward Clean-Up Crew). */
  onBinned: (fromOthers: boolean) => void = () => {};
  private binning: { thing: Thing; from: THREE.Vector3; to: THREE.Vector3; time: number }[] = [];
  /** Seconds until one of the locals drops a can or a wrapper. */
  private litterIn = 30 + Math.random() * 40;
  readonly events: PlayfulEvent[] = [];
  /** Room adapter supplies remote targets; NPC events never leave this client. */
  remotes: PlayfulTarget[] = [];
  onNetworkEvent: (event: PlayfulEvent) => void = () => {};
  readonly prompt = document.createElement("div");

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

  /** A thing lying at `at` (its ground point), settled the way its kind lies (art/litter.ts). */
  private spawn(kind: ThrowableKind, at: THREE.Vector3) {
    const mesh = litterModel(kind).object;
    lie(kind, mesh, at.x, at.y, at.z);
    this.scene.add(mesh);
    const thing: Thing = { kind, mesh, velocity: new THREE.Vector3(), state: "ground", thrower: "", rest: 0, hit: new Set() };
    this.things.push(thing);
    return thing;
  }

  /** Everyone a hit can land on. */
  get targets(): PlayfulTarget[] { return [this.local, ...this.npcs, ...this.remotes]; }

  /** Delivers a hit through the rules: it may be softened to cosmetic or not land at all. */
  deliver(target: PlayfulTarget, hit: PlayfulHit) {
    if(target.kind === 'remote') {
      if(hit.source === 'local' && hit.kind === 'shove')this.onNetworkEvent({type:'ShoveRequest',source:'local',target:target.id,direction:[hit.direction.x,hit.direction.z],strength:hit.strength});
      return null; // Only the room server decides remote hits.
    }
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
    const event:PlayfulEvent={ type: "ThrowItem", source, item: kind, from: from.toArray() as [number, number, number], velocity: t.velocity.toArray() as [number, number, number] };
    this.events.push(event);if(source==='local')this.onNetworkEvent(event);
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
    return [...this.npcs,...this.remotes].map((n) => ({ n, d: n.position.distanceTo(s.position), dot: n.position.clone().sub(s.position).setY(0).normalize().dot(f) }))
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
      const near = this.carried ? null : this.things.filter((t) => !t.thrower.startsWith('network:') && t.state === "ground" && t.mesh.position.distanceTo(s.position) < 1.3).sort((a, b) => a.mesh.position.distanceTo(s.position) - b.mesh.position.distanceTo(s.position))[0];
      const npc = this.nearestNpc(s, 1.6, heading);
      const throwing = this.carried?.kind ?? heldEmpty;
      // Beside a trash can, B throws litter away peacefully (RT still throws it at someone).
      const bin = throwing && LITTER.includes(throwing) ? this.bins.find((b) => Math.hypot(b.x - s.position.x, b.z - s.position.z) < 1.5) : undefined;
      if (bin) this.show(`${t('playful.bin')} · ${t('playful.throw',{item:t('item.'+throwing)})}`);
      else if (throwing) this.show(t('playful.throw',{item:t('item.'+throwing)}));
      else if (npc) this.show(t('playful.shove'));
      else if (near && !heldEmpty) this.show(t('playful.pick_up',{item:t('item.'+near.kind)}));
      if (bin && input.pressed.brakeBars) {
        const hand = s.position.clone().add(new THREE.Vector3(Math.sin(heading) * 0.3, 1.2, Math.cos(heading) * 0.3));
        const thing = this.carried ?? this.spawn(throwing!, hand);
        if (!this.carried) { thing.own = true; dropHeld(); }
        this.carried = null;
        thing.state = "binned"; thing.velocity.set(0, 0, 0);
        this.binning.push({ thing, from: hand, to: bin.clone(), time: 0 });
        s.emote = { id: "place", time: 0, duration: 0.6 };
        this.onBinned(!thing.own);
        out = { ...out, pressed: { ...out.pressed, brakeBars: false } };
      } else if (input.pressed.pumpGrind && throwing) {
        const hand = s.position.clone().add(new THREE.Vector3(Math.sin(heading) * 0.35, 1.45, Math.cos(heading) * 0.35));
        const thrown = this.throwFrom("local", throwing, hand, heading, this.aimFor(s.position, heading, "local"), this.carried ?? undefined);
        if (!this.carried) { thrown.own = true; dropHeld(); }
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
    this.stepBinning(dt);
    this.dropLitter(dt);
    return out;
  }

  private show(text: string) { this.prompt.hidden = false; this.prompt.textContent = text; }
  /** Litter arcs from the hand into the can's mouth, then it is gone. */
  private stepBinning(dt: number) {
    for (const b of this.binning) {
      b.time += dt;
      const t = Math.min(1, b.time / 0.45);
      b.thing.mesh.visible = true;
      b.thing.mesh.position.lerpVectors(b.from, b.to, t).setY(THREE.MathUtils.lerp(b.from.y, b.to.y, t) + Math.sin(t * Math.PI) * 0.35);
      b.thing.mesh.rotation.x += dt * 8;
    }
    for (const b of this.binning.filter((b) => b.time >= 0.45)) {
      b.thing.mesh.removeFromParent();
      this.things = this.things.filter((t) => t !== b.thing);
    }
    this.binning = this.binning.filter((b) => b.time < 0.45);
  }
  /** Now and then a local leaves a can or a wrapper on the ground by them. */
  private dropLitter(dt: number) {
    this.litterIn -= dt;
    if (this.litterIn > 0 || !this.npcs.length) return;
    this.litterIn = 45 + Math.random() * 45;
    if (this.things.filter((t) => LITTER.includes(t.kind) && t.state === "ground").length >= LITTER_MAX) return;
    const npc = this.npcs[Math.floor(Math.random() * this.npcs.length)], a = Math.random() * Math.PI * 2;
    const x = npc.position.x + Math.cos(a) * 0.7, z = npc.position.z + Math.sin(a) * 0.7;
    const thing = this.spawn(DROPPED[Math.floor(Math.random() * DROPPED.length)], new THREE.Vector3(x, this.ground(x, z), z));
    thing.thrower = npc.id;
  }
  /** Litter lying on the ground right now, for the doves to pick through (#71). */
  litterObjects() { return this.things.filter((t) => LITTER.includes(t.kind) && t.state === "ground").map((t) => t.mesh); }
  /** Someone else's litter left at `at` (its resting surface), e.g. an empty chip bag the doves picked clean. */
  leaveLitter(kind: ThrowableKind, at: THREE.Vector3) { this.spawn(kind, at).thrower = "park"; }
  /** Litter lying on the ground now (tests). */
  get litter() { return this.things.filter((t) => LITTER.includes(t.kind) && t.state === "ground").length; }
  private drop(s: Simulation) {
    const t = this.carried!;
    this.carried = null;
    t.state = "ground";
    lie(t.kind, t.mesh, s.position.x, this.ground(s.position.x, s.position.z), s.position.z, s.yaw);
  }

  /** Flight: gravity, a bounce or two, hits on anyone but the thrower, then rest where it lands. */
  private fly(dt: number) {
    for (const t of this.things) {
      if (t.state !== "flying") continue;
      t.velocity.y -= GRAVITY * dt;
      const p = t.mesh.position.addScaledVector(t.velocity, dt);
      t.mesh.rotation.x += dt * 9; t.mesh.rotation.y += dt * 5;
      for (const target of this.targets) {
        if (target.kind==='remote'||t.thrower.startsWith('network:')||target.id === t.thrower || t.hit.has(target.id)) continue;
        const dx = p.x - target.position.x, dz = p.z - target.position.z, up = p.y - target.position.y;
        if (Math.hypot(dx, dz) < target.radius + 0.08 && up > 0 && up < target.height + 0.1) {
          t.hit.add(target.id);
          const direction = t.velocity.clone().setY(0).normalize();
          this.deliver(target, { kind: "throw", item: t.kind, source: t.thrower, from: p.clone().sub(direction), direction, strength: THROW_STRENGTH[t.kind] });
          // It bounces off and drops.
          t.velocity.set(-t.velocity.x * 0.2, Math.min(1.5, Math.abs(t.velocity.y) * 0.3), -t.velocity.z * 0.2);
        }
      }
      const floor = this.ground(p.x, p.z) + restHeight(t.kind);
      if (p.y <= floor) {
        p.y = floor;
        // It settles the way it lies: a can or bottle on its side, a bag flat.
        if (Math.abs(t.velocity.y) < 1.2) { t.velocity.set(0, 0, 0); t.state = "ground"; lie(t.kind, t.mesh, p.x, this.ground(p.x, p.z), p.z, t.mesh.rotation.y); }
        else { t.velocity.y = -t.velocity.y * 0.35; t.velocity.x *= 0.55; t.velocity.z *= 0.55; }
      }
    }
    for (const t of this.things) if (t.state === "carried") t.mesh.visible = false; else t.mesh.visible = true;
  }

  /** The locals' poses, and a carried thing in the rider's hand. */
  networkThrow(item:ThrowableKind,source:string,from:[number,number,number],velocity:[number,number,number]) {
    const t=this.spawn(item,new THREE.Vector3(...from));t.mesh.position.fromArray(from);t.velocity.fromArray(velocity);t.state='flying';t.thrower='network:'+source;
    // Network-only props expire; they never create inventory or local pickup copies.
    t.rest=-4;
  }
  render(dt: number, elapsed: number, hand?: THREE.Object3D) {
    for(const t of this.things)if(t.thrower.startsWith('network:')){t.rest+=dt;if(t.rest>=0)t.mesh.removeFromParent();}
    this.things=this.things.filter(t=>!t.thrower.startsWith('network:')||t.rest<0);
    for (const npc of this.npcs) npc.render(dt, elapsed);
    if (this.carried && hand) { this.carried.mesh.visible = true; hand.getWorldPosition(this.carried.mesh.position); }
  }

  dispose() {
    for (const n of this.npcs) n.dispose();
    for (const t of this.things) t.mesh.removeFromParent();
    this.prompt.remove();
  }
}
