import * as THREE from "three";
import { TUNE, clamp, damp, wrap } from "../core/config";

export interface BoardInput {
  /**
   * LS horizontal: carve right (+) or left (-) relative to the direction of
   * travel, which is where the chase camera looks. Rolling tail first (fakie)
   * does not reverse it; the board simply leans on its other edge (`edge`).
   */
  steer: number;
  push: boolean;
  pushHeld: boolean;
  /** LT: progressive foot brake. */
  brake: number;
  /** RT: downhill tuck. */
  tuck: number;
  /** RB: allows a controlled slide when leaning hard enough. */
  slide: number;
  /** How much of the wheels' hold the ground gives (1; less on ice, #87). */
  traction?: number;
}

/**
 * Grounded longboard handling. Nothing here is the scooter controller with
 * handlebars hidden: the board turns because the rider leans and the trucks
 * steer, it coasts on large urethane wheels, and speed is lost to rolling
 * resistance, air, a dragged foot or a slide - never to arbitrary caps.
 *
 * The board is symmetric, so either end may lead: `travel` records which way
 * it is rolling, and turning follows the direction of travel.
 */
export class LongboardMotion {
  /** Smoothed carve, -1..1, relative to travel (right +). Slower to build than scooter steering. */
  lean = 0;
  /** 0..1 how far into a slide the board has swung. */
  slide = 0;
  /** Which way the current slide swings the board (-1, 0 or 1). */
  slideSide = 0;
  tuck = 0;
  brake = 0;
  /** Counts down after a push; the visible push cycle runs across it. */
  pushTimer = 0;
  private pushHold = 0;
  travel: 1 | -1 = 1;
  /** Riding tail first after pushing while rolling backwards: the other foot leads and kicks. */
  switchStance = false;
  /** Roll that lays the board on the surface, separate from the carve lean. */
  surfaceRoll = 0;

  /** The same carve on the board's own toe (+) / heel (-) edge: flips with travel. Drives deck roll, trucks and body lean. */
  get edge() { return this.lean * this.travel; }

  reset() {
    this.lean = this.slide = this.slideSide = this.tuck = this.brake = 0;
    this.pushTimer = this.pushHold = this.surfaceRoll = 0;
    this.travel = 1;
    this.switchStance = false;
  }

  /**
   * Advances one grounded step. Mutates `velocity` and returns the board's new
   * heading plus whether a push landed this step.
   */
  ride(
    dt: number,
    input: BoardInput,
    velocity: THREE.Vector3,
    yaw: number,
    normal: THREE.Vector3,
    sideSlope: number,
  ) {
    this.pushTimer = Math.max(0, this.pushTimer - dt);
    const heading = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const tangent = heading.clone().projectOnPlane(normal).normalize();
    let speed = velocity.length();
    const along = velocity.dot(tangent);
    if (speed > 0.6 && Math.abs(along) > speed * 0.3) this.travel = along >= 0 ? 1 : -1;

    this.lean = damp(this.lean, clamp(input.steer, -1, 1), TUNE.boardLeanResponse, dt);
    this.tuck = damp(
      this.tuck,
      input.tuck > 0.5 && speed > 1.5 && this.slide < 0.2 ? 1 : 0,
      TUNE.boardTuckResponse,
      dt,
    );
    this.brake = damp(this.brake, clamp(input.brake, 0, 1), 8, dt);

    // A slide is asked for with RB and a committed lean at real speed. Once
    // started it holds its side until released or scrubbed out.
    const wantsSlide =
      input.slide > 0.5 &&
      speed > TUNE.boardSlideMinSpeed &&
      (this.slideSide !== 0 || Math.abs(input.steer) > TUNE.boardSlideSteer);
    if (!wantsSlide) this.slideSide = 0;
    else if (!this.slideSide) this.slideSide = Math.sign(input.steer);
    this.slide = damp(this.slide, this.slideSide ? 1 : 0, this.slideSide ? 6 : 8, dt);

    // Truck steering: the tightest arc a lean allows is limited by how much
    // sideways acceleration the rider can lean against, so the same full lean
    // that pivots a slow board draws a long, steady arc at speed. Yaw rate turns
    // the direction of travel the same way whichever end leads (a rotation is a
    // left or right turn for either direction), so the carve needs no travel
    // sign here: the old `* travel` made LS right carve left when rolling fakie.
    // Bombing a hill the rider leans far harder into a carve than when cruising (#87).
    const carveAccel = THREE.MathUtils.lerp(TUNE.boardCarveAccel, TUNE.boardRaceCarveAccel, THREE.MathUtils.smoothstep(speed, TUNE.boardPushMaxSpeed, 20));
    const curvature =
      -this.lean *
      Math.min(TUNE.boardMaxCurvature, (carveAccel * (input.traction ?? 1)) / Math.max(1, speed * speed));
    let yawRate = curvature * speed * (1 - this.slide);
    // Nearly stopped, a rider can still pivot the board with their feet.
    if (speed < TUNE.boardPivotSpeed)
      yawRate += -this.lean * TUNE.boardPivotRate * (1 - speed / TUNE.boardPivotSpeed);
    let newYaw = yaw + yawRate * dt;
    if (this.slide > 0.01 && speed > 0.5) {
      // Power slide: swing the board across the direction of travel, further
      // the harder the rider leans. Released, it swings back onto the line so
      // the rider settles straight back into the bomb.
      const travelYaw =
        Math.atan2(velocity.x, velocity.z) + (this.travel < 0 ? Math.PI : 0);
      const depth = this.slideSide ? THREE.MathUtils.lerp(0.55, 1, clamp((Math.abs(input.steer) - TUNE.boardSlideSteer) / (1 - TUNE.boardSlideSteer), 0, 1)) : 0;
      const target = travelYaw - this.slideSide * TUNE.boardSlideAngle * depth;
      newYaw += wrap(target - newYaw) * (1 - Math.exp(-TUNE.boardSlideSwing * dt)) * (this.slideSide ? this.slide : 1);
    }

    // Gravity along the surface.
    velocity.addScaledVector(
      new THREE.Vector3(0, -TUNE.gravity, 0).projectOnPlane(normal),
      dt,
    );
    // Wheels grip across their axles; a slide gives most of that up.
    const newTangent = new THREE.Vector3(Math.sin(newYaw), 0, Math.cos(newYaw))
      .projectOnPlane(normal)
      .normalize();
    const lengthwise = velocity.dot(newTangent);
    const across = velocity.clone().addScaledVector(newTangent, -lengthwise).projectOnPlane(normal);
    const before = velocity.length(),
      bite = Math.min(1, TUNE.boardGrip * (input.traction ?? 1) * dt * (1 - this.slide) ** 2);
    velocity.addScaledVector(across, -bite);
    // A carve turns the board's momentum rather than deleting it: keep the
    // speed, less a little tyre scrub for the sideways slip taken out. In a
    // slide the scrub below does the slowing instead.
    if (velocity.lengthSq() > 1e-6 && this.slide < 0.5)
      velocity.setLength(Math.max(0, before - TUNE.boardCarveScrub * across.length() * bite));

    // Resistance: rolling, air (reduced in a tuck), foot brake and slide scrub.
    speed = velocity.length();
    const aero = THREE.MathUtils.lerp(TUNE.boardAero, TUNE.boardTuckAero, this.tuck);
    const loss =
      (TUNE.boardRollingDrag +
        aero * speed * speed +
        this.brake * TUNE.boardFootBrake * (input.traction ?? 1) +
        this.slide * TUNE.boardSlideScrub * (0.6 + 0.4 * Math.min(1, speed / 12))) *
      dt;
    if (speed > 0) velocity.multiplyScalar(Math.max(0, speed - loss) / speed);

    // Pushing: a tap pushes once, holding keeps pushing at the cadence. Each
    // push adds less as the board approaches its pushing ceiling, so pushing
    // can never exceed it; a hill can.
    let pushed = false;
    const canPush =
      this.tuck < 0.3 &&
      this.slide < 0.1 &&
      this.brake < 0.3 &&
      normal.y > 0.96;
    this.pushHold = input.pushHeld && canPush ? this.pushHold + dt : 0;
    if (
      canPush &&
      this.pushTimer === 0 &&
      (input.push || this.pushHold >= TUNE.boardPushCadence)
    ) {
      const current = Math.max(0, velocity.dot(newTangent) * this.travel);
      velocity.addScaledVector(
        newTangent,
        this.travel * TUNE.boardPush * clamp(1 - current / TUNE.boardPushMaxSpeed, 0, 1),
      );
      this.pushTimer = TUNE.boardPushCadence;
      // Kicking while rolling tail first rides switch; a push rolling nose first rides normal again.
      this.switchStance = this.travel < 0;
      pushed = true;
    }

    this.surfaceRoll = sideSlope;
    return {
      yaw: newYaw,
      roll: sideSlope + this.edge * TUNE.boardLeanRoll * (1 - this.slide),
      pushed,
      tangent: newTangent,
    };
  }
}
