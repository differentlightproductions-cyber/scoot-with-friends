import { TUNE, wrap } from "../core/config";
import type { LandingQuality } from "../core/events";
export interface LandingFactors {
  yaw: number;
  velocityYaw: number;
  speed: number;
  impact: number;
  deckAngle: number;
  barAngle: number;
  pitchError: number;
  spinSpeed: number;
  weightBias?: number;
  riderPitch?: number;
  surfacePitch?: number;
}
export function classifyLanding(f: LandingFactors): LandingQuality {
  const bodyError = wrap(
    (f.riderPitch ?? f.pitchError) - (f.surfacePitch ?? 0),
  );
  const weightError = Math.abs(
    (f.weightBias ?? 0) - Math.sin(f.surfacePitch ?? 0) * 0.6,
  );
  // Riding fakie is legitimate: wheel alignment is an axis, not a forward-only vector.
  const angle =
    f.speed < 0.8
      ? 0
      : Math.min(
          Math.abs(wrap(f.yaw - f.velocityYaw)),
          Math.abs(wrap(f.yaw - f.velocityYaw + Math.PI)),
        );
  const part = Math.max(
    Math.abs(wrap(f.deckAngle)),
    Math.abs(wrap(f.barAngle)),
  );
  if (
    angle > TUNE.failAngle ||
    part > TUNE.failPartAngle ||
    f.impact > TUNE.failImpact ||
    Math.abs(f.pitchError) > 1.1 ||
    (Math.abs(bodyError) > 1.35 && weightError > 0.9)
  )
    return "failed";
  // Between PERFECT and SKETCHY sits GOOD: a normal solid landing with small
  // recoverable errors. Without this band every landing that was not
  // mathematically exact fell straight through to SKETCHY, which is why routine
  // ride-aways were being graded as though they were nearly crashes.
  if (
    angle > TUNE.goodAngle ||
    part > TUNE.goodPartAngle ||
    f.impact > TUNE.goodImpact ||
    Math.abs(f.pitchError) > TUNE.goodPitchError ||
    Math.abs(f.spinSpeed) > TUNE.goodSpinSpeed ||
    weightError > TUNE.goodWeightError ||
    Math.abs(bodyError) > TUNE.goodBodyError
  )
    return "sketchy";
  if (
    angle > TUNE.cleanAngle ||
    part > TUNE.cleanPartAngle ||
    f.impact > TUNE.cleanImpact ||
    Math.abs(f.pitchError) > TUNE.cleanPitchError ||
    Math.abs(f.spinSpeed) > TUNE.cleanSpinSpeed ||
    weightError > TUNE.cleanWeightError ||
    Math.abs(bodyError) > TUNE.cleanBodyError
  )
    return "good";
  return "clean";
}
