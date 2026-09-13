import { TAU, TUNE, clamp, wrap } from "../core/config";
import { Events, LandingQuality } from "../core/events";
import { resolveTrick, TrickRecord, TrickPrimitives } from "./resolver";
import type { InputFrame } from "../input/input";
import { StickGesture } from "./gesture";
import { ridingButtons } from "../input/riding";
// A torque-limited rotational channel. Inputs add angular targets; angle and angular
// velocity remain continuous, and an unfinished catch remains a landing hazard.
export class RotationChannel {
  angle = 0;
  velocity = 0;
  target = 0;
  holdTime = 0;
  catches: number[] = [];
  reversals: { angle: number; from: number; to: number; side: string }[] = [];
  segmentStart = 0;
  segmentEnd = 0;
  originalDirection = 0;
  reversalAge = 99;
  static rewindWindow = [0.65, 0.9];
  get progress() {
    return Math.abs(this.segmentEnd - this.segmentStart) > 0.1
      ? Math.abs(
          (this.angle - this.segmentStart) /
            (this.segmentEnd - this.segmentStart),
        )
      : 0;
  }
  get canRewind() {
    return (
      this.progress >= RotationChannel.rewindWindow[0] &&
      this.progress <= RotationChannel.rewindWindow[1] &&
      Math.abs(this.velocity) > 1
    );
  }
  rewind(direction: number, side: string, capturedWindow = false) {
    const current = Math.sign(this.segmentEnd - this.segmentStart);
    if ((!this.canRewind && !capturedWindow) || direction === current)
      return false;
    this.reversals.push({
      angle: this.angle,
      from: current,
      to: direction,
      side,
    });
    this.reversalAge = 0;
    this.segmentStart = this.angle;
    this.segmentEnd =
      direction > 0
        ? Math.ceil(this.angle / TAU) * TAU
        : Math.floor(this.angle / TAU) * TAU;
    this.target = this.segmentEnd;
    this.holdTime = 0;
    return true;
  }
  constructor(
    public acceleration: number,
    public maxSpeed: number,
  ) {}
  kick(direction: number) {
    if (!this.originalDirection) this.originalDirection = direction;
    this.segmentStart = this.target;
    if (
      Math.abs(this.target) > 1 &&
      Math.abs(this.target - this.angle) < 0.04 &&
      Math.abs(this.velocity) < 1
    )
      this.catches.push(Math.abs(this.turns));
    this.target += TAU * direction;
    this.segmentEnd = this.target;
  }
  input(dt: number, pressed: boolean, held: boolean, direction: number) {
    this.holdTime = held ? this.holdTime + dt : 0;
    if (pressed) this.kick(direction);
    const stoppingDistance =
      (this.velocity * this.velocity) / (2 * this.acceleration);
    if (
      held &&
      this.reversals.length === 0 &&
      this.holdTime > TUNE.trickHoldDelay &&
      Math.abs(this.target - this.angle) <
        Math.max(0.15, stoppingDistance + Math.abs(this.velocity) * dt * 2)
    )
      this.kick(direction);
  }
  step(dt: number, manipulation = 0) {
    this.reversalAge += dt;
    const error = this.target - this.angle;
    const desired =
      Math.sign(error) *
      Math.min(
        this.maxSpeed * (1 + manipulation * 0.15),
        Math.sqrt(2 * this.acceleration * Math.abs(error)),
      );
    this.velocity += clamp(
      desired - this.velocity,
      -this.acceleration * dt,
      this.acceleration * dt,
    );
    const move = this.velocity * dt;
    if (Math.abs(error) < 0.018 && Math.abs(this.velocity) < 1) {
      this.angle = this.target;
      this.velocity = 0;
    } else this.angle += move;
  }
  get mismatch() {
    return Math.abs(wrap(this.angle));
  }
  get turns() {
    return Math.trunc((this.angle + Math.sign(this.angle) * 0.2) / TAU);
  }
  reset() {
    this.angle = 0;
    this.target = 0;
    this.velocity = 0;
    this.holdTime = 0;
    this.catches = [];
    this.reversals = [];
    this.segmentStart = 0;
    this.segmentEnd = 0;
    this.originalDirection = 0;
  }
}
export function trickName(
  yaw: number,
  deck: number,
  bars: number,
  body: string[],
  out = false,
) {
  return resolveTrick({
    bodyYaw: yaw,
    flipPitch: 0,
    deckAngle: deck * TAU,
    barAngle: bars * TAU,
    deckTurns: deck,
    barTurns: bars,
    states: body,
    out,
    direction: {
      body: Math.sign(yaw),
      deck: Math.sign(deck),
      bars: Math.sign(bars),
    },
  }).name;
}
export class Tricks {
  pendingBumper: {
    action: "leftModifier" | "rightModifier";
    side: string;
    direction: number;
    elapsed: number;
    originalTarget: number;
  } | null = null;
  bumperHeldDuration = 0;
  consumedBumpers = new Set<string>();
  kicklessHistory: {
    originalDirection: number;
    direction: number;
    stance: string;
    side: string;
    deckAngle: number;
    startAngle: number;
    targetAngle: number;
    completed: boolean;
  }[] = [];
  stance: "regular" | "goofy" = "regular";
  get naturalDirection() {
    return this.stance === "regular" ? 1 : -1;
  }
  bri = new RotationChannel(130, 15);
  kickless = new RotationChannel(110, 17);
  gesture = new StickGesture();
  finger = false;
  fingerTargets: { angle: number; direction: number; hand: number }[] = [];
  fingerHand = 1;
  fingerTime = 0;
  poseBlend = 0;
  visualPose = "";
  poseSide = 1;
  inputContext = "air";
  motionOrder: string[] = [];
  private completed = { deck: 0, bri: 0, kickless: 0 };
  input(dt: number, input: InputFrame) {
    const buttons = ridingButtons(this.stance);
    const heel = input.held.brake > 0.5;
    const finger = input.held.pumpGrind > 0.5;
    const direction = this.naturalDirection * (heel ? -1 : 1);
    for (const action of ["leftModifier", "rightModifier"] as const)
      if (input.held[action] < 0.5 && !input.pressed[action])
        this.consumedBumpers.delete(action);
    this.inputContext =
      this.pendingBumper || this.deck.canRewind
        ? "deck-rewind"
        : this.bars.canRewind
          ? "bar-rewind"
          : "air";
    for (const [action, side, requested] of [
      ["leftModifier", "left", -1],
      ["rightModifier", "right", 1],
    ] as const) {
      if (!input.pressed[action] || this.pendingBumper) continue;
      if (this.deck.canRewind) {
        // Capture eligibility now, then slow toward the catch while distinguishing tap/hold.
        // Both feet can redirect a deck; bars still require the opposite requested direction.
        const current = Math.sign(
          this.deck.segmentEnd - this.deck.segmentStart,
        );
        this.pendingBumper = {
          action,
          side,
          direction: -current,
          elapsed: 0,
          originalTarget: this.deck.target,
        };
        this.consumedBumpers.add(action);
        this.deck.target =
          this.deck.angle +
          current *
            Math.min(0.2, Math.abs(this.deck.segmentEnd - this.deck.angle));
      } else if (this.bars.canRewind) {
        this.bars.rewind(requested, side);
        this.consumedBumpers.add(action);
      }
    }
    const pending = this.pendingBumper;
    if (pending) {
      pending.elapsed += dt;
      this.bumperHeldDuration = pending.elapsed;
      if (
        input.released[pending.action] ||
        (!input.pressed[pending.action] && input.held[pending.action] < 0.5)
      ) {
        this.deck.target = pending.originalTarget;
        this.deck.rewind(pending.direction, pending.side, true);
        this.pendingBumper = null;
      } else if (pending.elapsed >= TUNE.bumperHoldThreshold) {
        const direction = -pending.direction;
        const startAngle = this.kickless.target;
        this.kickless.kick(direction);
        this.kicklessHistory.push({
          originalDirection: this.deck.originalDirection,
          direction,
          stance: this.stance,
          side: pending.side,
          deckAngle: this.deck.angle,
          startAngle,
          targetAngle: this.kickless.target,
          completed: false,
        });
        this.deck.target = pending.originalTarget;
        this.pendingBumper = null;
      }
    } else this.bumperHeldDuration = 0;
    const whipPressed = input.pressed[buttons.whip] && !this.pendingBumper;
    if (whipPressed && finger) {
      this.finger = true;
      this.fingerHand = direction === 1 ? 1 : -1;
      this.fingerTime = 0.35;
      this.fingerTargets.push({
        angle: this.deck.target + TAU * direction,
        direction,
        hand: this.fingerHand,
      });
    }
    this.fingerTime = Math.max(0, this.fingerTime - dt);
    if (!this.pendingBumper)
      this.deck.input(
        dt,
        whipPressed,
        input.held[buttons.whip] > 0.5,
        direction,
      );
    const rb =
      input.held.rightModifier > 0.5 &&
      !this.consumedBumpers.has("rightModifier");
    const lb =
      input.held.leftModifier > 0.5 &&
      !this.consumedBumpers.has("leftModifier");
    this.bars.input(
      dt,
      input.pressed.brakeBars,
      input.held.brakeBars > 0.5,
      this.naturalDirection * (rb ? -1 : 1),
    );
    this.deck.maxSpeed = TUNE.deckMaxSpeed * (this.fingerTime > 0 ? 0.72 : 1);
    let pose = "";
    if (input.held.body > 0.5) {
      this.gesture.reset();
      pose =
        heel && finger
          ? "Superman"
          : finger
            ? "Tuck No-hander"
            : heel
              ? "Deck Grab"
              : lb && rb
                ? "No Foot"
                : lb
                  ? "Can Can"
                  : rb
                    ? "One-footer"
                    : "No-hander";
    } else {
      const gesture = this.gesture.step(dt, input.rx, input.ry);
      if (gesture?.kind === "bri") this.bri.kick(gesture.direction);
    }
    this.poseBlend += clamp((pose ? 1 : 0) - this.poseBlend, -dt * 7, dt * 7);
    if (pose) {
      this.visualPose = pose;
      this.poseSide = Math.sign(input.steer) || this.naturalDirection;
    } else if (this.poseBlend === 0) this.visualPose = "";
    this.step(dt, pose, input.rx);
  }
  deck = new RotationChannel(TUNE.deckAcceleration, TUNE.deckMaxSpeed);
  bars = new RotationChannel(TUNE.barAcceleration, TUNE.barMaxSpeed);
  yaw = 0;
  flip = 0;
  body = new Set<string>();
  bodyTime = 0;
  bodyState = "";
  airborne = false;
  fromLink = false;
  line: string[] = [];
  ordinary = 0;
  last = "";
  history: TrickRecord[] = [];
  fakieRecord: TrickRecord | null = null;
  fakieDuration = 0;
  private nextRecordId = 1;
  holdFakie(dt: number) {
    this.fakieDuration += dt;
    if (this.fakieDuration < 0.25) return;
    if (!this.fakieRecord) {
      const raw: TrickPrimitives = {
        bodyYaw: 0,
        flipPitch: 0,
        deckAngle: 0,
        barAngle: 0,
        deckTurns: 0,
        barTurns: 0,
        states: ["Fakie"],
        out: false,
        direction: { body: 0, deck: 0, bars: 0 },
        fakieSeconds: this.fakieDuration,
      };
      this.fakieRecord = {
        id: this.nextRecordId++,
        name: "Fakie",
        recognized: null,
        components: ["Fakie"],
        raw,
        landing: "clean",
      };
      this.history.push(this.fakieRecord);
      if (this.history.length > 256) this.history.shift();
      this.add("Fakie", this.fakieRecord);
    }
    this.fakieRecord.raw.fakieSeconds = this.fakieDuration;
  }
  endFakie() {
    this.fakieRecord = null;
    this.fakieDuration = 0;
  }
  landing: LandingQuality = "clean";
  constructor(public events: Events) {}
  startAir(fromLink: boolean) {
    this.fingerTargets = [];
    this.pendingBumper = null;
    this.consumedBumpers.clear();
    this.kicklessHistory = [];
    this.bri.reset();
    this.kickless.reset();
    this.gesture.reset();
    this.finger = false;
    this.fingerTime = 0;
    this.poseBlend = 0;
    this.motionOrder = [];
    this.completed = { deck: 0, bri: 0, kickless: 0 };
    this.deck.reset();
    this.bars.reset();
    this.yaw = 0;
    this.flip = 0;
    this.body.clear();
    this.bodyTime = 0;
    this.airborne = true;
    this.fromLink = fromLink;
  }
  step(dt: number, bodyState: string, manip: number) {
    this.deck.step(dt, manip);
    this.bars.step(dt, manip);
    this.bri.step(dt);
    this.kickless.step(dt);
    for (const event of this.kicklessHistory)
      if (
        !event.completed &&
        event.direction * (this.kickless.angle - event.targetAngle) >= -0.2
      )
        event.completed = true;
    for (const kind of ["deck", "bri", "kickless"] as const) {
      const turns = Math.abs(this[kind].turns);
      if (turns > this.completed[kind]) this.motionOrder.push(kind);
      this.completed[kind] = turns;
    }
    if (bodyState) {
      this.bodyTime = this.bodyState === bodyState ? this.bodyTime + dt : 0;
      if (this.bodyTime > 0.12) this.body.add(bodyState);
    } else this.bodyTime = 0;
    this.bodyState = bodyState;
  }
  finish(quality: LandingQuality) {
    if (!this.airborne) return;
    this.airborne = false;
    this.landing = quality;
    if (quality === "failed") return;
    const raw: TrickPrimitives = {
      bodyYaw: this.yaw,
      flipPitch: this.flip,
      deckAngle: this.deck.angle,
      barAngle: this.bars.angle,
      deckTurns: this.deck.turns,
      barTurns: this.bars.turns,
      states: [...this.body],
      out: this.fromLink,
      direction: {
        body: Math.sign(this.yaw),
        deck: Math.sign(this.deck.angle),
        bars: Math.sign(this.bars.angle),
      },
    };
    raw.deckCatches = [...this.deck.catches];
    raw.barCatches = [...this.bars.catches];
    raw.stance = this.stance;
    raw.naturalWhipDirection = this.naturalDirection;
    raw.deckReversals = [...this.deck.reversals];
    raw.barReversals = [...this.bars.reversals];
    raw.originalDeckDirection = this.deck.originalDirection;
    raw.finger = this.finger;
    raw.fingerTurns = this.fingerTargets.filter(
      (f) =>
        f.direction === Math.sign(this.deck.angle) &&
        Math.abs(this.deck.angle) + 0.2 >= Math.abs(f.angle),
    ).length;
    raw.briAngle = this.bri.angle;
    raw.kicklessAngle = this.kickless.angle;
    raw.motionOrder = [...this.motionOrder];
    raw.kicklessHistory = this.kicklessHistory.map((event) => ({ ...event }));
    const resolved = resolveTrick(raw);
    if (resolved.name) {
      const record: TrickRecord = {
        ...resolved,
        id: this.nextRecordId++,
        landing: quality,
      };
      this.history.push(record);
      if (this.history.length > 256) this.history.shift();
      this.add(record.name, record);
    }
    this.deck.reset();
    this.bars.reset();
    this.bodyState = "";
    this.bri.reset();
    this.kickless.reset();
    this.poseBlend = 0;
    this.visualPose = "";
    this.gesture.reset();
    this.fingerTargets = [];
    this.pendingBumper = null;
    this.consumedBumpers.clear();
    this.kicklessHistory = [];
  }
  add(name: string, record?: TrickRecord) {
    this.last = name;
    this.line.push(name);
    if (this.line.length > 12) this.line.shift();
    this.ordinary = 0;
    this.events.emit({ type: "trick", name, record });
    this.events.emit({ type: "line", names: [...this.line], ended: false });
  }
  tick(dt: number, linked: boolean) {
    if (linked) this.ordinary = 0;
    else this.ordinary += dt;
    if (this.ordinary > TUNE.comboTimeout && this.line.length) {
      this.events.emit({ type: "line", names: [...this.line], ended: true });
      this.line = [];
    }
  }
  reset() {
    this.fingerTargets = [];
    this.pendingBumper = null;
    this.consumedBumpers.clear();
    this.kicklessHistory = [];
    this.deck.reset();
    this.bars.reset();
    this.bri.reset();
    this.kickless.reset();
    this.gesture.reset();
    this.poseBlend = 0;
    this.visualPose = "";
    this.finger = false;
    this.fingerTime = 0;
    this.motionOrder = [];
    this.inputContext = "air";
    this.body.clear();
    this.yaw = 0;
    this.airborne = false;
    this.bodyState = "";
    this.line = [];
    this.last = "";
    this.ordinary = 0;
    this.endFakie();
  }
}
