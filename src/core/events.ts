import type { TrickRecord } from "../tricks/resolver";
// Four outcomes, one coherent set. "clean" is the original internal name for the
// top grade and is displayed as PERFECT; "good" is a normal solid landing and a
// genuine success, not a disguised penalty; "failed" is displayed as BAIL.
export type LandingQuality = "clean" | "good" | "sketchy" | "failed";
export type GameEvent =
  | {type:"banked";eventId:string;points:number}
  | { type:'worldInteraction'; interaction:string; item:string }
  | { type: "playerEmote"; playerId: string; emoteId: string; timestamp: number }
  | { type: "playerChat"; playerId: string; message: string; timestamp: number }
  | { type: "splash"; x: number; z: number }
  | { type: "pop"; charge: number }
  | { type: "push" }
  | { type: "pump" }
  | { type: "landing"; quality: LandingQuality; impact: number }
  | { type: "bail"; reason: string }
  | { type: "trick"; name: string; record?: TrickRecord; attemptId?:number }
  | { type: "railImpact"; speed: number; bail: boolean }
  | { type: "grindCatch"; name: string; assisted: boolean }
  | { type: "dismount"; walking: boolean }
  | { type: "marker"; message: string; progress: number }
  | { type: "line"; names: string[]; ended: boolean }
  | { type: "reset" };
export class Events {
  private listeners = new Set<(e: GameEvent) => void>();
  history: GameEvent[] = [];
  on(fn: (e: GameEvent) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: GameEvent) {
    this.history.push(e);
    if (this.history.length > 150) this.history.shift();
    this.listeners.forEach((fn) => fn(e));
  }
}
