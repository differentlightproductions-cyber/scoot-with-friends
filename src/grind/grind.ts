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
  /** Smith (+) / Feeble (-) tilt held relative to the rail's own slope. */
  stancePitch: number;
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
  if (velocity.length() < TUNE.grindMinSpeed) return null;
  let best: GrindContact | null = null,
    bestDist = Infinity;
  for (const rail of rails) {
    const delta = rail.b.clone().sub(rail.a);
    const len = delta.length();
    const direction = delta.clone().normalize();
    const t = clamp(position.clone().sub(rail.a).dot(direction) / len, 0, 1);
    if (t < 0.001 || t > 0.999) continue;
    // A rider rising away from the rail is airing out or clearing an obstacle,
    // never looking to lock in. Travel up a sloped rail is not rising away.
    const rising = velocity.y - direction.y * velocity.dot(direction);
    if (rising > 0.85) continue;
    const point = rail.a.clone().addScaledVector(delta, t);
    // How far the deck is turned across this rail. A deck slide presents the
    // deck's underside, a footprint far wider than a wheel or peg, so an angled
    // approach that meets it with that footprint is a real contact.
    const sideways = Math.abs(Math.sin(wrap(yaw - Math.atan2(direction.x, direction.z))));
    const slide = assist ? clamp((sideways - 0.3) / 0.45, 0, 1) : 0;
    const side = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    const signedOffset = position.clone().sub(point).dot(side);
    const lateral = Math.abs(signedOffset);
    const height = position.y - point.y;
    const maxDistance = (assist
      ? intentional
        ? TUNE.grindIntentDistance
        : TUNE.grindDistance
      : TUNE.grindExactDistance) + slide * TUNE.grindSlideReach;
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
    const minApproach = THREE.MathUtils.lerp(assist
      ? intentional
        ? TUNE.grindIntentAlignment
        : TUNE.grindApproachAlignment
      : 0.9, TUNE.grindSlideAlignment, slide * (intentional ? 1 : 0.6));
    if (approach < minApproach) continue;
    // Entry must be converging on the rail unless the rider is already almost
    // exactly over it. This makes crossing a rail feel deliberate rather than magnetic.
    const lateralVelocity = velocity.dot(side);
    if (lateral > 0.055 && signedOffset * lateralVelocity > 0.025) continue;
    const crossing =
      lateral < 0.07
        ? 1
        : clamp((-Math.sign(signedOffset) * lateralVelocity) / 1.2, 0, 1);
    // With no explicit grind hold, a rider must genuinely be crossing the rail.
    // Holding the grind control permits a carefully aligned parallel landing,
    // but still has to pass the full distance/height/alignment score below.
    if (!intentional && lateral >= 0.12 && crossing < 0.45) continue;
    const crossingScore = (intentional||lateral<.12) && crossing < 0.45 ? 0.45 : crossing;
    const distanceScore = 1 - lateral / maxDistance;
    const alignmentScore = clamp(
      (approach - minApproach) / Math.max(0.01, 1 - minApproach),
      0,
      1,
    );
    const heightScore = 1 - Math.abs(height - 0.12) / maxHeight;
    const descentScore = rising <= 0 ? 1 : clamp(1 - rising / 0.85, 0, 1);
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
        stancePitch: 0,
        lateralSpeed: velocity.dot(side) * 0.7,
        intent: intentScore,
      };
      bestDist = lateral;
    }
  }
  return best;
}
/**
 * A grind that runs off the end of one segment carries onto the next when the
 * two share an endpoint and continue broadly the same way. Long ledges that
 * follow a slope are authored as chains of short straight pieces, and without
 * this the grind simply ended at the first joint.
 */
export function continueGrind(rails: Rail[], contact: GrindContact) {
  const forward = contact.speed >= 0;
  const exit = forward ? contact.rail.b : contact.rail.a;
  const travel = contact.direction.clone().multiplyScalar(forward ? 1 : -1);
  let best: { rail: Rail; fromA: boolean; agreement: number } | null = null;
  for (const rail of rails) {
    if (rail === contact.rail) continue;
    for (const fromA of [true, false]) {
      const end = fromA ? rail.a : rail.b;
      if (end.distanceToSquared(exit) > TUNE.grindJoinDistance ** 2) continue;
      const along = rail.b.clone().sub(rail.a).normalize();
      if (!fromA) along.negate();
      const agreement = along.dot(travel);
      if (agreement > TUNE.grindJoinAlignment && (!best || agreement > best.agreement))
        best = { rail, fromA, agreement };
    }
  }
  if (!best) return false;
  const delta = best.rail.b.clone().sub(best.rail.a);
  contact.rail = best.rail;
  contact.direction = delta.clone().normalize();
  contact.speed = (best.fromA ? 1 : -1) * Math.abs(contact.speed);
  contact.t = best.fromA ? 0 : 1;
  return true;
}
