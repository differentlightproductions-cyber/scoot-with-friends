// The one place that says which real foot or hand a stance means. Everything
// that draws or positions a rider by stance (model, push cycle, fast-plant,
// grabs) asks here instead of comparing "regular" to an index of its own.
//
//   Regular: LEFT foot forward on the deck, RIGHT foot pushes.
//   Goofy:   RIGHT foot forward on the deck, LEFT foot pushes.
//
// Rider-local space faces +z with +y up, so the rider's RIGHT side is -x and the
// LEFT side is +x. Limb arrays in the model (hands, shoes, grip sockets) are
// indexed by that side: index 0 is -x (right), index 1 is +x (left).
// Avatar.bone() maps conventional Left/Right bone names onto these indices.
export type Stance = "regular" | "goofy";
export type Side = "left" | "right";
export const oppositeSide = (side: Side): Side => (side === "left" ? "right" : "left");
/** The foot that stays on the deck at the front while pushing. */
export const frontFoot = (stance: Stance): Side => (stance === "regular" ? "left" : "right");
/** The foot that leaves the deck to push and to plant. */
export const pushFoot = (stance: Stance): Side => oppositeSide(frontFoot(stance));
/** Limb-array index of a rider side (0 = right = -x, 1 = left = +x). */
export const sideIndex = (side: Side): 0 | 1 => (side === "right" ? 0 : 1);
/** Rider-local x direction of a side (right is -x, left is +x). */
export const sideSign = (side: Side): -1 | 1 => (side === "right" ? -1 : 1);
export const frontFootIndex = (stance: Stance) => sideIndex(frontFoot(stance));
export const pushFootIndex = (stance: Stance) => sideIndex(pushFoot(stance));
/**
 * Off the scooter (standing, walking, sitting, mounting, racking) it stays on
 * this side of the rider: Regular on the RIGHT, Goofy on the LEFT. Only where
 * the scooter sits changes; trick buttons never follow it.
 */
export const walkSide = (stance: Stance): Side => (stance === "regular" ? "right" : "left");
/** The hand that lets go of the bars for a Clamp Grab (the other stays on the grip). */
export const clampGrabHand = (stance: Stance): Side => (stance === "regular" ? "right" : "left");
