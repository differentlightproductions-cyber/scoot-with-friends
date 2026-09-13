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
  if (
    angle > TUNE.cleanAngle ||
    part > TUNE.cleanPartAngle ||
    f.impact > TUNE.cleanImpact ||
    Math.abs(f.pitchError) > 0.45 ||
    Math.abs(f.spinSpeed) > 5 ||
    weightError > 1.1 ||
    Math.abs(bodyError) > 0.7
  )
    return "sketchy";
  return "clean";
}
