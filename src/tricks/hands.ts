/**
 * One hand-occupancy model for held air poses. `bars` is how many hands stay
 * on the bars (2 both, 1 one, 0 none) and `reach` where a freed hand goes (the
 * stance-side hand: Regular right, Goofy left). The rider model reads `reach`
 * for its targets; the trick input reads `bars` to decide whether a pose may
 * start while a spin owns the hands.
 */
export interface PoseHands { bars: 0 | 1 | 2; reach?: 'clamp' | 'deck' | 'rear-deck' }
export const POSE_HANDS: Record<string, PoseHands> = {
  'No-hander': { bars: 0 },
  'Tuck No-hander': { bars: 0 },
  'Superman': { bars: 2 },
  'Can Can': { bars: 2 },
  'One-footer': { bars: 2 },
  'No Foot': { bars: 2 },
  'Deck Grab': { bars: 1, reach: 'deck' },
  'Clamp Grab': { bars: 1, reach: 'clamp' },
  'Toboggan': { bars: 1, reach: 'rear-deck' },
};
/**
 * What owns the hands this frame. A whip is thrown with both hands on the bars;
 * a bar spin has let go and must be caught; a finger whip, Bri, Kickless,
 * Decade or pending rewind also hold them.
 */
export interface HandsBusy { whip: boolean; barspin: boolean; other: boolean }
/** A pose that takes a hand off the bars waits until no spin owns the hands. */
export function poseAllowed(pose: string, busy: HandsBusy) {
  const need = POSE_HANDS[pose];
  if (!need || need.bars === 2) return true;
  return !busy.whip && !busy.barspin && !busy.other;
}
