import { Events } from "../core/events";
import { TUNE } from "../core/config";
import { completedDegrees, type TrickPrimitives } from "./resolver";
export function trickSignature(raw?: TrickPrimitives, name = "") {
  if (!raw) return name.toLowerCase().replace(/ out$/, "");
  return JSON.stringify([completedDegrees(raw.bodyYaw), raw.deckTurns, raw.barTurns,
    raw.finger ?? false, Math.round((raw.briAngle ?? 0) / (Math.PI * 2)),
    Math.round((raw.kicklessAngle ?? 0) / (Math.PI * 2)),
    raw.deckReversals?.length ?? 0, raw.barReversals?.length ?? 0,
    [...raw.states].sort(), raw.fakieSeconds !== undefined]);
}
export function trickValue(raw?: TrickPrimitives) {
  if (!raw) return TUNE.contactTrickPoints;
  if (raw.fakieSeconds !== undefined) return TUNE.fakieEntryPoints;
  const values = [completedDegrees(raw.bodyYaw) / 180 * TUNE.rotationPointsPer180,
    Math.abs(raw.deckTurns) * TUNE.deckTurnPoints * (raw.finger ? 1.35 : 1),
    Math.abs(raw.barTurns) * TUNE.barTurnPoints, raw.states.length * TUNE.bodyTrickPoints,
    Math.trunc((Math.abs(raw.briAngle ?? 0) + 0.2) / (Math.PI * 2)) * 300,
    Math.trunc((Math.abs(raw.kicklessAngle ?? 0) + 0.2) / (Math.PI * 2)) * 200,
    ((raw.deckReversals?.length ?? 0) + (raw.barReversals?.length ?? 0)) * 100];
  const combined = values.filter(n => n > 0).length;
  return Math.round(values.reduce((a,b) => a+b,0) * (1 + Math.max(0, combined-1)*0.12));
}
export class ScoreSystem {
  dispose: () => unknown;
  total = 0; line = 0; multiplier = 1;
  recent: string[] = [];
  lastAward = 0;
  caseFactor = 1;
  private holdFraction = 0;
  constructor(events: Events) {
    this.dispose = events.on(e => {
      if (e.type === "trick") {
        const signature = trickSignature(e.record?.raw, e.name);
        this.lastAward = this.preview(e.record?.raw, e.name, e.record?.landing === "sketchy" ? 0.8 : 1);
        this.line += this.lastAward;
        this.recent.push(signature); this.recent = this.recent.slice(-3);
        this.multiplier = Math.min(4, this.multiplier + 0.25); this.caseFactor = 1;
      }
      if (e.type === "marker" && e.message === "CASE / HOLD ON") this.caseFactor = 0.65;
      if (e.type === "line" && e.ended) { this.total += this.line; this.clearLine(); }
      if (e.type === "bail" || e.type === "reset") this.clearLine();
    });
  }
  preview(raw?: TrickPrimitives, name = "", quality = 1) {
    const sig = trickSignature(raw, name);
    const count = this.recent.filter(s => s === sig).length;
    const variety = [1, 0.75, 0.5, 0.35][count];
    return Math.round(trickValue(raw) * this.multiplier * variety * quality * this.caseFactor);
  }
  holdContact(dt: number, duration: number, grind: boolean, difficulty = 1) {
    this.holdFraction += dt * (grind ? 45 : 24) * difficulty * this.multiplier / Math.sqrt(1 + duration * 0.4);
    const whole = Math.floor(this.holdFraction); this.line += whole; this.holdFraction -= whole;
  }
  holdFakie(dt: number) {
    this.holdFraction += TUNE.fakiePointsPerSecond * dt * this.multiplier;
    const whole = Math.floor(this.holdFraction); this.line += whole; this.holdFraction -= whole;
  }
  private clearLine() { this.line = 0; this.multiplier = 1; this.holdFraction = 0; this.caseFactor = 1; }
  restart() { this.total = 0; this.recent = []; this.clearLine(); }
}
