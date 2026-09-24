/** First-person horizontal field of view range and default, in degrees. */
export const FP_FOV_MIN = 100, FP_FOV_MAX = 150, FP_FOV_DEFAULT = 135;
/**
 * Third-person field of view, as the HORIZONTAL angle on a 16:9 screen. The
 * vertical angle it implies is kept on every screen shape (so a tall phone does
 * not turn into a fisheye). 87° is the original fixed chase view (56° vertical).
 */
export const TP_FOV_MIN = 75, TP_FOV_MAX = 115, TP_FOV_STEP = 4, TP_FOV_DEFAULT = 87;
/** Vertical angle, in degrees, for a third-person setting. */
export function thirdPersonVertical(horizontal: number) {
  const h = (Math.min(TP_FOV_MAX, Math.max(TP_FOV_MIN, horizontal)) * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(h / 2) / (16 / 9)) * 180) / Math.PI;
}
