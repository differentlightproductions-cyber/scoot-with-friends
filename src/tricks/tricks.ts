import { TAU, TUNE, clamp, wrap } from "../core/config";
import { Events, LandingQuality } from "../core/events";
import { resolveTrick, TrickRecord, TrickPrimitives } from "./resolver";
import type { InputFrame } from "../input/input";
import { StickGesture } from "./gesture";
import { ridingButtons } from "../input/riding";
import { poseAllowed, type HandsBusy } from "./hands";
/** Clamp Grab hands back to the bar this many seconds before the wheels land. */
const CLAMP_RELEASE_TIME = 0.17;
/** An LB press held longer than this is a modifier (Can Can, No Foot...), not a Decade tap. */
const DECADE_TAP_TIME = 0.35;
// A torque-limited rotational channel. Inputs add angular targets; angle and angular
// velocity remain continuous, and an unfinished catch remains a landing hazard.
export class RotationChannel {
  angle = 0;
  velocity = 0;
  target = 0;
  holdTime = 0;
  catches: number[] = [];
  reversals: { angle: number; from: number; to: number; side: string; performed?:boolean }[] = [];
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
      && Math.sign(this.velocity)===Math.sign(this.segmentEnd-this.segmentStart)
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
      performed:false,
    });
    this.reversalAge = 0;
    this.segmentStart = this.angle;
    this.segmentEnd = capturedWindow
      ? this.angle + TAU * direction
      : direction > 0
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
    const reversal=this.reversals.at(-1);
    if(reversal&&reversal.to*(this.angle-reversal.angle)>.16)reversal.performed=true;
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
    queued: boolean;
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
  controlStyle: "pro" | "arcade" = "pro";
  stance: "regular" | "goofy" = "regular";
  get naturalDirection() {
    return this.stance === "regular" ? 1 : -1;
  }
  /**
   * Decade: the rider (with the bars) goes once around the front of the scooter
   * while the deck stays put. Signed radians of that orbit; separate from the
   * body spin (yaw), flips and deck/bar channels so they all compose.
   */
  decade = new RotationChannel(TUNE.decadeAcceleration, TUNE.decadeMaxSpeed);
  private decadeStarted = false;
  /** True from the input until the rider is back over the deck. */
  get decadeActive() {
    return this.decade.target !== 0 && this.decadePhase !== "caught";
  }
  /**
   * START -> ACTIVE -> CATCH WINDOW -> CAUGHT, read from the tracked angle.
   * Only "caught" (back over the deck, within tolerance of the full turn) can
   * become a landed Decade; anything earlier at touchdown is a bail.
   */
  get decadePhase(): "idle" | "active" | "catch" | "caught" {
    if (this.decade.target === 0) return "idle";
    const remaining = Math.abs(this.decade.target - this.decade.angle);
    if (remaining < 0.02 && Math.abs(this.decade.velocity) < 1) return "caught";
    return remaining < 1.0 ? "catch" : "active";
  }
  /** Revolutions completed so far, credited when the rider is within tolerance of the full turn. */
  get decadeCompleted() {
    return Math.abs(this.decade.angle) >= TAU - TUNE.decadeCatchTolerance ? 1 : 0;
  }
  /**
   * A Decade that is still swinging and not yet within the catch tolerance: the
   * rider is off to the side of the deck, so touching down now is a bail, not a
   * landing the rider is snapped back over.
   */
  get decadeUnfinished() {
    return this.decade.target !== 0 && this.decadePhase !== "caught" && !this.decadeCompleted;
  }
  private decadeSettling = false;
  /** An LB press made in the air, waiting to see whether it is a tap (Decade) or a modifier. */
  private decadeTap: { time: number; spoiled: boolean } | null = null;
  /**
   * Set by the simulation while a direct Bri/Inward takeoff is still waiting to
   * kick in just after leaving the ground; a Decade must not start over it.
   */
  briPending = false;
  /**
   * Begins one Decade when the hands, deck and bars are all free, once per air.
   * A Decade and a Bri / Inward / Kickless never share an air: both move the
   * rider round the scooter, so whichever starts first owns the air. Direction
   * follows the stance (mirrored for Goofy) like every other rotation.
   */
  startDecade() {
    if (
      !this.airborne ||
      this.decadeStarted ||
      this.pendingBumper ||
      this.briPending ||
      this.bri.target !== 0 ||
      this.kickless.target !== 0 ||
      this.fingerTime > 0 ||
      this.poseBlend >= 0.05 ||
      Math.abs(this.deck.velocity) >= 1 ||
      this.deck.mismatch >= 0.3 ||
      Math.abs(this.bars.velocity) >= 1 ||
      this.bars.mismatch >= 0.3
    )
      return false;
    this.decadeStarted = true;
    // A body swinging round the bars, not a whip: the revolution is paced to the
    // air that is left (ending a little before the wheels land) between a
    // natural slowest and a fastest committed swing. A quarter of the time
    // speeds up, half cruises, a quarter slows into the catch.
    const duration = clamp(
      this.landingIn - TUNE.decadeCatchMargin,
      TUNE.decadeFastest,
      TUNE.decadeSlowest,
    );
    this.decade.maxSpeed = TAU / (0.75 * duration);
    this.decade.acceleration = this.decade.maxSpeed / (0.25 * duration);
    this.decade.kick(-this.naturalDirection);
    return true;
  }
  bri = new RotationChannel(130, 15);
  kickless = new RotationChannel(110, 17);
  gesture = new StickGesture();
  finger = false;
  /** This air's bar spins are Bar Twists (RT + B + LS, Pro); `twisting` while one is in the hands. */
  barTwist = false;
  twisting = false;
  /**
   * Seconds until the wheels reach the surface below, written by the simulation
   * each airborne frame. Clamp Grab lets go this long before touchdown so the
   * hand is back on the bar when the landing is judged.
   */
  landingIn = 99;
  fingerTargets: { angle: number; direction: number; hand: number }[] = [];
  fingerHand = 1;
  fingerTime = 0;
  poseBlend = 0;
  visualPose = "";
  poseSide = 1;
  inputContext = "air";
  motionOrder: string[] = [];
  private completed = { deck: 0, bri: 0, kickless: 0 };
  private kicklessBuffer=0;
  private continueKickless(side:string,direction:number) {
    // A low or overlapping attempt still starts its physical animation; landing decides success.
    this.fingerTime=0;
    const startAngle=this.kickless.target;
    this.kickless.kick(direction);
    this.kicklessHistory.push({originalDirection:this.deck.originalDirection,direction,stance:this.stance,side,deckAngle:this.deck.angle,startAngle,targetAngle:this.kickless.target,completed:false});
    if(this.pendingBumper){this.deck.target=this.pendingBumper.originalTarget;this.pendingBumper=null;}
    return true;
  }
  input(dt: number, input: InputFrame, flipChord=false) {
    const buttons = ridingButtons(this.stance, this.controlStyle);
    const heel = !flipChord && input.held.brake > 0.5;
    // RT + RB is Clamp Grab in every stance and control style: one hand stays on
    // the bar, the stance-side hand reaches the clamp. It needs a free hand and
    // an unspun bar, so it waits while a bar spin, finger whip, rewind or Bri /
    // Kickless owns the hands, and lets go shortly before the wheels land.
    // A kicked spin owns the hands from the press (target set, not yet moving).
    const spinning = (c: RotationChannel) => Math.abs(c.velocity) > 1 || c.mismatch > 0.3 || Math.abs(c.target - c.angle) > 0.05;
    const barsBusy = spinning(this.bars);
    // One hand-occupancy model (hands.ts): a whip holds both hands on the bars,
    // a bar spin has let go, and the rest below hold them too.
    const busy: HandsBusy = {
      whip: spinning(this.deck),
      barspin: barsBusy,
      other: this.decadeActive || this.fingerTime > 0 || !!this.pendingBumper || Math.abs(this.bri.velocity) > 1 || Math.abs(this.kickless.velocity) > 1,
    };
    const clampWanted =
      input.held.pumpGrind > 0.5 &&
      input.held.rightModifier > 0.5 &&
      !this.consumedBumpers.has("rightModifier") &&
      poseAllowed("Clamp Grab", busy) &&
      this.landingIn > CLAMP_RELEASE_TIME;
    // Pro, either stance: RT + B is Toboggan (stance hand to the rear of the deck);
    // with LS pushed it is a Bar Twist instead (a tilted bar spin, held for more).
    // Arcade keeps RT + B as its finger whip (B whips there).
    const pro = this.controlStyle !== "arcade", rt = input.held.pumpGrind > 0.5;
    const stick = Math.abs(input.steer) > 0.5 || Math.abs(input.lean) > 0.5;
    const twistPress = pro && rt && input.pressed.brakeBars && stick && !clampWanted && !this.decadeActive;
    const tobogganWanted = pro && rt && input.held.brakeBars > 0.5 && !stick && !clampWanted && !this.twisting && poseAllowed("Toboggan", busy) && this.landingIn > CLAMP_RELEASE_TIME;
    const finger = !flipChord && !clampWanted && !tobogganWanted && input.held.pumpGrind > 0.5;
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
      const lastReversal = this.deck.reversals.at(-1);
      if (this.deck.canRewind && lastReversal?.performed !== false) {
        const current = Math.sign(
          this.deck.segmentEnd - this.deck.segmentStart,
        );
        if(requested!==-current)continue;
        this.pendingBumper = {
          action,
          side,
          direction: -current,
          elapsed: 0,
          originalTarget: this.deck.target,
          queued: false,
        };
        this.consumedBumpers.add(action);
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
        pending.queued &&
        Math.abs(this.deck.angle - pending.originalTarget) < 0.04 &&
        Math.abs(this.deck.velocity) < 1
      ) {
        this.deck.rewind(pending.direction, pending.side, true);
        this.pendingBumper = null;
      } else if (!pending.queued && (
        input.released[pending.action] ||
        (!input.pressed[pending.action] && input.held[pending.action] < 0.5)
      )) {
        pending.queued = true;
      } else if (!pending.queued && pending.elapsed >= TUNE.bumperHoldThreshold) {
        const direction = -pending.direction;
        this.continueKickless(pending.side,direction);
        this.pendingBumper = null;
      }
    } else this.bumperHeldDuration = 0;
    // Decade: a tap of LB in the air, the same button in every stance and control
    // style. LB is also the left rewind and the Can Can / No Foot / Tuck
    // No-hander modifier, so the Decade starts on the release, and only when LB
    // was used for nothing else while it was down.
    if (input.pressed.leftModifier && this.airborne) this.decadeTap = { time: 0, spoiled: false };
    const tap = this.decadeTap;
    if (tap) {
      tap.time += dt;
      if (
        tap.time > DECADE_TAP_TIME ||
        this.consumedBumpers.has("leftModifier") ||
        input.held.body > 0.5 ||
        input.held.rightModifier > 0.5 ||
        (!flipChord && (input.held.pumpGrind > 0.5 || input.held.brake > 0.5)) ||
        input.pressed.hop ||
        input.pressed.pushDeck ||
        input.pressed.brakeBars
      )
        tap.spoiled = true;
      if (input.held.leftModifier < 0.5) {
        if (!tap.spoiled) this.startDecade();
        this.decadeTap = null;
      }
    }
    const decadeActive = this.decadeActive;
    const whipPressed = input.pressed[buttons.whip] && !this.pendingBumper && !decadeActive;
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
    if (!this.pendingBumper && !decadeActive)
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
    // Pro: B with RT held is Toboggan or a Bar Twist, never a plain barspin.
    if (twistPress) this.barTwist = this.twisting = true;
    const barButton = this.controlStyle === "arcade" ? "pushDeck" : "brakeBars";
    const plainBars = !pro || !rt || this.twisting;
    this.bars.input(
      dt,
      (input.pressed[barButton] && plainBars && !clampWanted && !decadeActive) || twistPress,
      input.held[barButton] > 0.5 && plainBars && !clampWanted && !decadeActive,
      this.naturalDirection * (rb ? -1 : 1),
    );
    // The twist ends when the bars are caught and B is let go.
    if (this.twisting && input.held.brakeBars < 0.5 && Math.abs(this.bars.velocity) < 1 && this.bars.mismatch < 0.3) this.twisting = false;
    this.deck.maxSpeed = TUNE.deckMaxSpeed * (this.fingerTime > 0 ? 0.72 : 1);
    let pose = "";
    if (input.held.body > 0.5 && !decadeActive) {
      this.gesture.reset();
      // Inside a flip the chord holds RT, so Y is a no-hander rather than Superman.
      pose = flipChord
        ? "No-hander"
        : finger
          ? "Superman"
          : heel && lb
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
      if (clampWanted) pose = "Clamp Grab";
      else if (tobogganWanted) pose = "Toboggan";
      const gesture = this.gesture.step(dt, input.rx, input.ry);
      // No Bri / Inward in an air that already has a Decade (see startDecade).
      if (gesture?.kind === "bri" && !clampWanted && this.decade.target === 0) this.bri.kick(gesture.direction*(gesture.short?this.naturalDirection:1));
      if(this.gesture.upFlick&&(Math.abs(this.deck.velocity)>1||this.pendingBumper))this.kicklessBuffer=.16;
      this.kicklessBuffer=Math.max(0,this.kicklessBuffer-dt);
      if(this.kicklessBuffer>0&&(this.deck.canRewind||this.pendingBumper)&&Math.abs(this.kickless.velocity)<1){
        const direction=Math.sign(this.deck.segmentEnd-this.deck.segmentStart);
        if(this.continueKickless(direction>0?'right':'left',direction))this.kicklessBuffer=0;
      }
    }
    // A pose that frees a hand waits while a whip or bar spin owns the hands
    // (no No-hander mid-Tailwhip or mid-Barspin); the hands come back first.
    if (pose && !poseAllowed(pose, busy)) pose = "";
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
  flairContext=false;quarterAir=false;
  fastplant = false;
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
  attemptId = 0;
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

    }
    this.fakieRecord.raw.fakieSeconds = this.fakieDuration;
  }
  endFakie(success = true) {
    if(success && this.fakieRecord)this.add("Fakie",this.fakieRecord);
    this.fakieRecord = null;
    this.fakieDuration = 0;
  }
  landing: LandingQuality = "clean";
  constructor(public events: Events) {}
  startAir(fromLink: boolean, keepGesture = false) {
    this.kicklessBuffer=0;
    this.barTwist=false;this.twisting=false;
    this.attemptId=this.nextRecordId++;
    this.fingerTargets = [];
    this.pendingBumper = null;
    this.consumedBumpers.clear();
    this.kicklessHistory = [];
    this.bri.reset();
    this.kickless.reset();
    if (!keepGesture) this.gesture.reset();
    this.finger = false;
    this.fingerTime = 0;
    this.poseBlend = 0;
    this.motionOrder = [];
    this.completed = { deck: 0, bri: 0, kickless: 0 };
    this.deck.reset();
    this.bars.reset();
    this.decade.reset();
    this.decadeStarted = false;
    this.decadeSettling = false;
    this.decadeTap = null;
    this.yaw = 0;
    this.flip = 0;this.flairContext=false;this.quarterAir=false;
    this.fastplant = false;
    this.body.clear();
    this.bodyTime = 0;
    this.airborne = true;
    this.landingIn = 99;
    this.fromLink = fromLink;
  }
  step(dt: number, bodyState: string, manip: number) {
    this.deck.step(dt, manip);
    this.bars.step(dt, manip);
    this.decade.step(dt);
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
    this.kicklessBuffer=0;
    if (!this.airborne) return;
    this.airborne = false;
    this.landing = quality;
    if (quality === "failed") {
      this.decade.reset();
      this.decadeStarted = false;
      return;
    }
    const raw = this.primitives();
    const resolved = resolveTrick(raw);
    if (resolved.name) {
      const record: TrickRecord = { ...resolved, id: this.attemptId, landing: quality };
      this.history.push(record);
      if (this.history.length > 256) this.history.shift();
      this.add(record.name, record);
    }
    this.deck.reset();
    this.bars.reset();
    // A Decade caught just short of the full turn finishes its last few degrees
    // on the ground (see tick) instead of snapping back over the deck.
    if (this.decade.target !== 0 && this.decadePhase !== "caught" && this.decadeCompleted) this.decadeSettling = true;
    else {
      this.decade.reset();
      this.decadeStarted = false;
    }
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
  primitives(provisional = false): TrickPrimitives {
    const count = (channel: RotationChannel) => provisional && Math.abs(channel.angle) > 0.08
      ? Math.sign(channel.target || channel.angle) * Math.max(1, Math.ceil(Math.abs(channel.angle) / TAU))
      : channel.turns;
    const raw: TrickPrimitives = {
      bodyYaw: this.yaw,
      flipPitch: this.flip,
      flairContext:this.flairContext,
      fastplant: this.fastplant,
      deckAngle: this.deck.angle,
      barAngle: this.bars.angle,
      deckTurns: count(this.deck),
      barTurns: count(this.bars),
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
    raw.deckReversals = this.deck.reversals.filter(r=>r.performed!==false).map(r=>({...r}));
    raw.barReversals = this.bars.reversals.filter(r=>r.performed!==false).map(r=>({...r}));
    raw.originalDeckDirection = this.deck.originalDirection;
    raw.finger = this.finger;
    raw.barTwist = this.barTwist;
    raw.fingerTurns = this.fingerTargets.filter(
      (f) =>
        f.direction === Math.sign(this.deck.angle) &&
        Math.abs(this.deck.angle) + 0.2 >= Math.abs(f.angle),
    ).length;
    raw.briAngle = provisional ? count(this.bri) * TAU : this.bri.angle;
    raw.kicklessAngle = provisional ? count(this.kickless) * TAU : this.kickless.angle;
    raw.decadeAngle = this.decade.angle;
    raw.decadeTurns = provisional
      ? (Math.abs(this.decade.angle) > 0.08 ? Math.sign(this.decade.target || this.decade.angle) : 0)
      : this.decadeCompleted * Math.sign(this.decade.angle);
    raw.motionOrder = [...this.motionOrder];
    raw.kicklessHistory = this.kicklessHistory.map((event) => ({ ...event }));
    return raw;
  }
  get attempt() {
    if (!this.airborne) return null;
    const resolved = resolveTrick(this.primitives(true));
    return resolved.name ? { ...resolved, id:this.attemptId, provisional: true, componentCount: resolved.components.length } : null;
  }
  add(name: string, record?: TrickRecord) {
    this.last = name;
    this.line.push(name);
    if (this.line.length > 12) this.line.shift();
    this.ordinary = 0;
    this.events.emit({ type: "trick", name, record, attemptId:record?.id ?? this.nextRecordId++ });
    this.events.emit({ type: "line", names: [...this.line], ended: false });
  }
  tick(dt: number, linked: boolean) {
    if (this.decadeSettling) {
      this.decade.step(dt);
      if (this.decadePhase === "caught") {
        this.decade.reset();
        this.decadeStarted = false;
        this.decadeSettling = false;
      }
    }
    if (linked) this.ordinary = 0;
    else this.ordinary += dt;
    if (this.ordinary > TUNE.comboTimeout && this.line.length) {
      this.events.emit({ type: "line", names: [...this.line], ended: true });
      this.line = [];
    }
  }
  reset() {
    this.kicklessBuffer=0;
    this.flip=0;this.fastplant=false;
    this.fingerTargets = [];
    this.pendingBumper = null;
    this.consumedBumpers.clear();
    this.kicklessHistory = [];
    this.deck.reset();
    this.bars.reset();
    this.decade.reset();
    this.decadeStarted = false;
    this.decadeSettling = false;
    this.decadeTap = null;
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
    this.endFakie(false);
  }
}
