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
  intent: number;
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
  // A rising rider is airing out or clearing an obstacle, never looking to lock in.
  if (velocity.length() < TUNE.grindMinSpeed || velocity.y > 0.85) return null;
  let best: GrindContact | null = null,
    bestDist = Infinity;
  for (const rail of rails) {
    const delta = rail.b.clone().sub(rail.a);
    const len = delta.length();
    const direction = delta.clone().normalize();
    const t = clamp(position.clone().sub(rail.a).dot(direction) / len, 0, 1);
    if (t < 0.001 || t > 0.999) continue;
    const point = rail.a.clone().addScaledVector(delta, t);
    const side = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    const signedOffset = position.clone().sub(point).dot(side);
    const lateral = Math.abs(signedOffset);
    const height = position.y - point.y;
    const maxDistance = assist
      ? intentional
        ? TUNE.grindIntentDistance
        : TUNE.grindDistance
      : TUNE.grindExactDistance;
    const maxHeight = assist && intentional ? TUNE.grindCaptureHeight : 0.28;
    if (
      lateral > maxDistance ||
      height < -0.06 ||
      height > maxHeight
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
    const minApproach = assist
      ? intentional
        ? TUNE.grindIntentAlignment
        : TUNE.grindApproachAlignment
      : 0.9;
    if (approach < minApproach) continue;
    // Entry must be converging on the rail unless the rider is already almost
    // exactly over it. This makes crossing a rail feel deliberate rather than magnetic.
    const lateralVelocity = velocity.dot(side);
    const crossing =
      lateral < 0.07
        ? 1
        : clamp((-Math.sign(signedOffset) * lateralVelocity) / 1.2, 0, 1);
    // With no explicit grind hold, a rider must genuinely be crossing the rail.
    // Holding the grind control permits a carefully aligned parallel landing,
    // but still has to pass the full distance/height/alignment score below.
    if (!intentional && lateral >= 0.07 && crossing < 0.45) continue;
    const crossingScore = intentional && crossing < 0.45 ? 0.45 : crossing;
    const distanceScore = 1 - lateral / maxDistance;
    const alignmentScore = clamp(
      (approach - minApproach) / Math.max(0.01, 1 - minApproach),
      0,
      1,
    );
    const heightScore = 1 - Math.abs(height - 0.12) / maxHeight;
    const descentScore = velocity.y <= 0 ? 1 : clamp(1 - velocity.y / 0.85, 0, 1);
    const intentScore = clamp(
      distanceScore * 0.32 +
        alignmentScore * 0.25 +
        clamp(heightScore, 0, 1) * 0.13 +
        descentScore * 0.15 +
        crossingScore * 0.15,
      0,
      1,
    );
    const requiredScore = intentional
      ? TUNE.grindHeldIntentScore
      : TUNE.grindNaturalIntentScore;
    if (intentScore < requiredScore) continue;
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
        lateralSpeed: velocity.dot(side) * 0.7,
        intent: intentScore,
      };
      bestDist = lateral;
    }
  }
  return best;
}
