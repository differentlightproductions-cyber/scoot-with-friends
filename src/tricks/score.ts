import { Events } from "../core/events";
import { TUNE } from "../core/config";
import { completedDegrees } from "./resolver";
export class ScoreSystem {
  dispose: () => unknown;
  total = 0;
  line = 0;
  multiplier = 1;
  private holdFraction = 0;
  constructor(events: Events) {
    this.dispose = events.on((e) => {
      if (e.type === "trick") {
        const raw = e.record?.raw;
        const base =
          raw?.fakieSeconds !== undefined
            ? TUNE.fakieEntryPoints
            : raw
              ? (completedDegrees(raw.bodyYaw) / 180) *
                  TUNE.rotationPointsPer180 +
                Math.abs(raw.deckTurns) * TUNE.deckTurnPoints +
                Math.abs(raw.barTurns) * TUNE.barTurnPoints +
                raw.states.length * TUNE.bodyTrickPoints +
                Math.trunc(
                  (Math.abs(raw.briAngle ?? 0) + 0.2) / (Math.PI * 2),
                ) *
                  300 +
                Math.trunc(
                  (Math.abs(raw.kicklessAngle ?? 0) + 0.2) / (Math.PI * 2),
                ) *
                  200 +
                ((raw.deckReversals?.length ?? 0) +
                  (raw.barReversals?.length ?? 0)) *
                  100
              : TUNE.contactTrickPoints;
        this.line += Math.round(base * this.multiplier);
      }
      if (e.type === "line" && e.ended) {
        this.total += this.line;
        this.clearLine();
      }
      if (e.type === "bail" || e.type === "reset") this.clearLine();
    });
  }
  holdFakie(dt: number) {
    this.holdFraction += TUNE.fakiePointsPerSecond * dt * this.multiplier;
    const whole = Math.floor(this.holdFraction);
    this.line += whole;
    this.holdFraction -= whole;
  }
  private clearLine() {
    this.line = 0;
    this.multiplier = 1;
    this.holdFraction = 0;
  }
  restart() {
    this.total = 0;
    this.clearLine();
  }
}
