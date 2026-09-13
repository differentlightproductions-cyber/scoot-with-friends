import { TUNE, clamp, damp } from "../core/config";
export class AirSpinControl {
  authority = TUNE.lowAirSpinMultiplier as number;
  reset() {
    this.authority = TUNE.lowAirSpinMultiplier;
  }
  step(
    dt: number,
    spin: number,
    stick: number,
    verticalSpeed: number,
    height: number,
    elapsed: number,
  ) {
    const remaining =
      (verticalSpeed +
        Math.sqrt(
          verticalSpeed * verticalSpeed +
            2 * TUNE.gravity * Math.max(0, height),
        )) /
      TUNE.gravity;
    const fraction = clamp(
      (remaining + elapsed - TUNE.spinLowAirtime) /
        (TUNE.spinHighAirtime - TUNE.spinLowAirtime),
      0,
      1,
    );
    const available =
      TUNE.lowAirSpinMultiplier +
      (TUNE.highAirSpinMultiplier - TUNE.lowAirSpinMultiplier) * fraction;
    this.authority = damp(this.authority, available, 10, dt);
    const magnitude = clamp(
      (Math.abs(stick) - TUNE.spinStickDeadzone) / (1 - TUNE.spinStickDeadzone),
      0,
      1,
    );
    const response = Math.pow(magnitude, TUNE.spinResponseExponent);
    const ceiling =
      TUNE.airMaxSpin *
      this.authority *
      (0.1 + 0.9 * Math.pow(magnitude, TUNE.spinCeilingExponent));
    // A softer stick supplies less torque and a lower driven ceiling; it does not
    // instantly erase momentum already supplied by a stronger input.
    const direction = -Math.sign(stick);
    if (
      response > 0 &&
      (Math.sign(spin) !== direction || Math.abs(spin) < ceiling)
    ) {
      const next =
        spin +
        direction *
          TUNE.airAcceleration *
          this.authority *
          (TUNE.spinAccelerationFloor +
            (1 - TUNE.spinAccelerationFloor) * response) *
          dt;
      spin = Math.abs(spin) <= ceiling ? clamp(next, -ceiling, ceiling) : next;
    }
    return spin * Math.exp(-TUNE.airDamping * dt);
  }
}
