import * as THREE from "three";
import { TUNE, clamp, wrap } from "../core/config";
import { Rail } from "../park/park";
export interface GrindContact {
  rail: Rail;
  t: number;
  point: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  name: string;
  contactOffset: number;
  entryPitch: number;
  lateralSpeed: number;
}
export function findGrind(
  rails: Rail[],
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  yaw: number,
  pitch: number,
  assist: boolean,
  intentional = false,
): GrindContact | null {
  if (velocity.length() < TUNE.grindMinSpeed || velocity.y > 2.2) return null;
  let best: GrindContact | null = null,
    bestDist = Infinity;
  for (const rail of rails) {
    const delta = rail.b.clone().sub(rail.a);
    const len = delta.length();
    const direction = delta.clone().normalize();
    const t = clamp(position.clone().sub(rail.a).dot(direction) / len, 0, 1);
    if (t < 0.001 || t > 0.999) continue;
    const point = rail.a.clone().addScaledVector(delta, t);
    const lateral = Math.hypot(position.x - point.x, position.z - point.z);
    const height = position.y - point.y;
    if (
      lateral >
        (assist
          ? intentional
            ? TUNE.grindIntentDistance
            : TUNE.grindDistance
          : TUNE.grindExactDistance) ||
      height < -0.06 ||
      height > (assist ? TUNE.grindCaptureHeight : 0.42)
    )
      continue;
    const speed = velocity.dot(direction);
    if (Math.abs(speed) < TUNE.grindMinSpeed) continue;
    const approach = Math.abs(
      velocity
        .clone()
        .setY(0)
        .normalize()
        .dot(direction.clone().setY(0).normalize()),
    );
    if (
      approach <
      (assist
        ? intentional
          ? TUNE.grindIntentAlignment
          : TUNE.grindApproachAlignment
        : 0.74)
    )
      continue;
    const yawDifference = Math.abs(
      wrap(yaw - Math.atan2(direction.x, direction.z)),
    );
    const sideways = Math.abs(Math.sin(yawDifference));
    // Contact offsets/pitch distinguish wheel/deck combinations; buttons never name grinds.
    const name =
      sideways > 0.7
        ? "Deck Slide"
        : pitch > 0.1
          ? "Smith"
          : pitch < -0.1
            ? "Feeble"
            : "50-50";
    if (lateral < bestDist) {
      const side = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
      const signedOffset = position.clone().sub(point).dot(side);
      const reach = sideways * 0.25 + (1 - sideways) * 0.06;
      best = {
        rail,
        t,
        point,
        direction,
        speed,
        name,
        contactOffset: clamp(signedOffset, -reach, reach),
        entryPitch: pitch,
        lateralSpeed: velocity.dot(side) * 0.35,
      };
      bestDist = lateral;
    }
  }
  return best;
}
