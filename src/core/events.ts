import type { TrickRecord } from "../tricks/resolver";
export type LandingQuality = "clean" | "sketchy" | "failed";
export type GameEvent =
  | { type: "splash"; x: number; z: number }
  | { type: "pop"; charge: number }
  | { type: "push" }
  | { type: "pump" }
  | { type: "landing"; quality: LandingQuality; impact: number }
  | { type: "bail"; reason: string }
  | { type: "trick"; name: string; record?: TrickRecord }
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
