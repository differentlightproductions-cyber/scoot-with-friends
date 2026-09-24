import { Vector3 } from "three";
import { TUNE, clamp, wrap } from "../core/config";
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
  /** Wheel-to-travel angle measured on the landing surface (crookedLandingAngle).
   * When given it replaces the flat yaw-versus-travel comparison. */
  crookedAngle?: number;
}
/**
 * The scooter's long axis on a surface: the line where the vertical plane
 * through the heading meets the surface. The deck is drawn along it (heading,
 * then pitched onto the surface), and it is what an air aligns to. On flat
 * ground, or heading straight up a ramp, it equals the projected heading. Across
 * a steep wall the two part: a heading 20 degrees off a near-vertical quarter
 * wall projects to a line 65 degrees off the fall line, while the deck itself
 * points 4 degrees off it.
 */
export function surfaceAxis(yaw: number, normal: Vector3, target = new Vector3()) {
  target.set(Math.cos(yaw), 0, -Math.sin(yaw)).cross(normal);
  if (target.lengthSq() < 1e-8)
    return target.set(Math.sin(yaw), 0, Math.cos(yaw)).projectOnPlane(normal).normalize();
  return target.normalize();
}
/**
 * Angle between the travel along a landing surface and the scooter's axis on
 * it, either end (0..PI/2). Below 0.8 m/s of surface travel there is nothing to
 * be crooked against.
 */
export function crookedLandingAngle(velocity: Vector3, normal: Vector3, yaw: number) {
  const along = velocity.clone().addScaledVector(normal, -velocity.dot(normal));
  const speed = along.length();
  if (speed < 0.8) return 0;
  return Math.acos(clamp(Math.abs(along.dot(surfaceAxis(yaw, normal))) / speed, 0, 1));
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
    f.crookedAngle ?? (f.speed < 0.8
      ? 0
      : Math.min(
          Math.abs(wrap(f.yaw - f.velocityYaw)),
          Math.abs(wrap(f.yaw - f.velocityYaw + Math.PI)),
        ));
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
