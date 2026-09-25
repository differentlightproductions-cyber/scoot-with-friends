// Parked vehicles for driveways and RV pads (#89): a sedan, an SUV, a pickup,
// a class C motorhome and a travel trailer, after the ones in the owner's
// aerial photos of B Hill. Each body is its side profile (wheel arches cut in)
// extruded across the width with rounded edges; the cabin is a narrower glass
// greenhouse under a painted roof. Parts are handed to the caller by finish
// ("plain" or "gloss") with their colours in the vertices, so a whole street
// of cars merges into the street's own meshes.
import * as THREE from "three";
import { mulberry } from "./noise";

export type VehicleKind = "sedan" | "suv" | "pickup" | "rv" | "trailer";
/** Receives one part in the vehicle's own frame (front toward +z, wheels on y = 0). */
export type PutPart = (finish: "plain" | "gloss", g: THREE.BufferGeometry, color: THREE.ColorRepresentation) => void;
/** Length (z), width (x) and height of each kind, for colliders and siting. */
export const VEHICLE_SIZE: Record<VehicleKind, { length: number; width: number; height: number }> = {
  sedan: { length: 4.8, width: 1.84, height: 1.46 },
  suv: { length: 4.9, width: 1.96, height: 1.78 },
  pickup: { length: 5.8, width: 2.02, height: 1.9 },
  rv: { length: 7.6, width: 2.4, height: 3.3 },
  trailer: { length: 7.4, width: 2.4, height: 3.0 },
};
// Driveway colours: mostly white, silver, grey and black, the odd colour.
const PAINT = [0xf1f1ee, 0xeeeeea, 0x3b3e44, 0xa3a8ad, 0x6a6f75, 0x8b1d1d, 0x243a57, 0xcfc7b3, 0x3b5b43, 0xb8412e];
const TYRE = 0x1c1c1c, TRIM = 0x232526, GLASS = 0x1d2730, CHROME = 0xc9ccd0, TAIL = 0xa3161a, LAMP = 0xf4f1e2, PLATE = 0xe9e6d8;

/** A side profile extruded across `width`, centred on x = 0, edges rounded by `round`. */
function profile(points: [number, number][], width: number, round: number, arches: [number, number][] = [], archR = 0.42) {
  const shape = new THREE.Shape();
  // Clockwise from the rear bottom: up the back, over the top, down the front,
  // then back along the sill with an arch over each wheel (front first).
  shape.moveTo(points[0][0], points[0][1]);
  for (const [z, y] of points.slice(1)) shape.lineTo(z, y);
  const sill = points[0][1];
  for (const [cz] of [...arches].sort((a, b) => b[0] - a[0])) {
    shape.lineTo(cz + archR, sill);
    shape.absarc(cz, sill, archR, 0, Math.PI, false);
  }
  shape.lineTo(points[0][0], points[0][1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - round * 2, bevelEnabled: round > 0, bevelThickness: round, bevelSize: round * 0.8, bevelSegments: 2, curveSegments: 8 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 - round, 0, 0);
  return g;
}
const box = (w: number, h: number, l: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, l).translate(x, y, z);

function wheels(put: PutPart, width: number, axles: number[], r: number, dual = false) {
  for (const z of axles) for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.16);
    put("plain", new THREE.CylinderGeometry(r, r, 0.24, 18).rotateZ(Math.PI / 2).translate(x, r, z), TYRE);
    put("gloss", new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.25, 12).rotateZ(Math.PI / 2).translate(x + side * 0.003, r, z), CHROME);
    if (dual) put("plain", new THREE.CylinderGeometry(r, r, 0.22, 18).rotateZ(Math.PI / 2).translate(x - side * 0.25, r, z), TYRE);
  }
}
/** Lamps, plates, grille and mirrors common to the cars. */
function dressCar(put: PutPart, width: number, rear: number, front: number, lampY: number, mirrorZ: number, mirrorY: number) {
  for (const side of [-1, 1]) {
    put("gloss", box(0.42, 0.13, 0.06, side * (width / 2 - 0.3), lampY + 0.08, rear - 0.01), TAIL);
    put("gloss", box(0.4, 0.12, 0.06, side * (width / 2 - 0.3), lampY, front + 0.01), LAMP);
    put("plain", box(0.1, 0.1, 0.2, side * (width / 2 + 0.06), mirrorY, mirrorZ), TRIM);
  }
  put("plain", box(width * 0.42, 0.2, 0.05, 0, lampY - 0.04, front + 0.02), TRIM);
  put("plain", box(0.5, 0.12, 0.02, 0, lampY - 0.2, rear - 0.04), PLATE);
  put("plain", box(width + 0.02, 0.14, 0.12, 0, 0.42, rear + 0.02), TRIM);
  put("plain", box(width + 0.02, 0.14, 0.12, 0, 0.4, front - 0.02), TRIM);
}

/** Builds one vehicle of `kind`; its paint comes from `seed`. */
export function buildVehicle(kind: VehicleKind, seed: number, put: PutPart) {
  const random = mulberry(seed * 7 + 3), paint = new THREE.Color(PAINT[Math.floor(random() * PAINT.length)]);
  const { length: L, width: W } = VEHICLE_SIZE[kind], R = L / 2;
  if (kind === "sedan" || kind === "suv") {
    const suv = kind === "suv", belt = suv ? 1.12 : 0.98, roof = suv ? 1.74 : 1.43, r = suv ? 0.37 : 0.33;
    const front = 1.5 * (L / 4.8), back = -1.45 * (L / 4.8);
    put("gloss", profile(suv
      ? [[-R, 0.34], [-R - 0.04, 0.62], [-R + 0.02, belt], [1.05, belt], [R - 0.22, belt - 0.12], [R, 0.78], [R, 0.34]]
      : [[-R, 0.32], [-R - 0.05, 0.6], [-R + 0.08, 0.93], [-1.55, belt + 0.03], [1.2, belt], [R - 0.2, 0.84], [R + 0.02, 0.62], [R, 0.32]], W, 0.1, [[front, 0], [back, 0]], r + 0.08), paint);
    // The greenhouse: glass, a painted roof and a B pillar.
    const cabin: [number, number][] = suv ? [[-R + 0.05, belt], [-R + 0.12, roof - 0.04], [0.55, roof], [1.1, belt]] : [[-1.55, belt], [-1.0, roof - 0.02], [0.52, roof], [1.22, belt]];
    const glass = profile([...cabin], W * 0.86, 0.05);
    put("gloss", glass, GLASS);
    const roofStart = cabin[1][0] + 0.06, roofEnd = cabin[2][0] - 0.02;
    put("gloss", box(W * 0.84, 0.05, roofEnd - roofStart, 0, roof + 0.025, (roofStart + roofEnd) / 2), paint);
    put("gloss", box(W * 0.865, roof - belt - 0.04, 0.12, 0, (belt + roof) / 2, suv ? 0.05 : -0.22), paint);
    if (suv) put("gloss", box(W * 0.865, roof - belt - 0.04, 0.14, 0, (belt + roof) / 2, -1.05), paint);
    wheels(put, W, [front, back], r);
    dressCar(put, W, -R, R, belt - 0.24, cabin[3][0] - 0.12, belt + 0.06);
    if (suv && random() < 0.6) for (const side of [-1, 1]) put("plain", box(0.05, 0.05, 2.0, side * W * 0.38, roof + 0.07, -0.5), TRIM);
    return;
  }
  if (kind === "pickup") {
    const belt = 1.14, roof = 1.86, r = 0.39, cab = -0.95, front = 1.85, back = -1.95;
    // Hood and crew cab pressed in one; the bed is open, its walls arched over the rear wheels.
    put("gloss", profile([[cab, 0.42], [cab, belt], [1.25, belt], [R - 0.15, belt - 0.1], [R, 0.8], [R, 0.42]], W, 0.08, [[front, 0]], r + 0.1), paint);
    for (const side of [-1, 1]) put("gloss", profile([[-R, 0.45], [-R, belt], [cab - 0.02, belt], [cab - 0.02, 0.45]], 0.12, 0.03, [[back, 0]], r + 0.1).translate(side * (W / 2 - 0.06), 0, 0), paint);
    put("gloss", box(W - 0.2, belt - 0.5, 0.08, 0, (belt + 0.5) / 2, -R + 0.05), paint);
    put("plain", box(W - 0.22, 0.08, cab + R - 0.12, 0, 0.66, (cab - R) / 2), TRIM);
    put("gloss", profile([[cab + 0.05, belt], [cab + 0.12, roof], [0.45, roof], [1.2, belt]], W * 0.88, 0.05), GLASS);
    put("gloss", box(W * 0.86, 0.05, 0.4 - cab - 0.12, 0, roof + 0.02, (cab + 0.12 + 0.4) / 2), paint);
    wheels(put, W, [front, back], r);
    dressCar(put, W, -R, R, 0.92, 0.95, 1.2);
    return;
  }
  // The big ones: a white box with a coloured stripe and a band of windows.
  const white = new THREE.Color(0xf2f0ea), stripe = new THREE.Color([0x7a3b22, 0x2e4a6b, 0x6b6b6b, 0x8a6a2c][Math.floor(random() * 4)]);
  if (kind === "rv") {
    const top = 3.3, r = 0.42;
    // Cab-over: the chassis cab below, the sleeper bulging out over it.
    put("plain", profile([[-R, 0.55], [-R, top - 0.1], [-R + 0.15, top], [R - 1.4, top], [R - 0.3, top - 0.35], [R - 0.25, 2.45], [R - 1.45, 2.3], [R - 1.45, 2.1], [R - 0.9, 1.95], [R, 1.25], [R, 0.55]], W, 0.1, [[R - 1.1, 0], [-R + 1.9, 0]], r + 0.1), white);
    put("gloss", box(W * 0.9, 0.55, 0.06, 0, 1.72, R - 0.62).rotateX(-0.5), GLASS);
    put("plain", box(W + 0.02, 0.22, L - 1.8, 0, 1.2, -0.7), stripe);
    for (const [z, w] of [[-2.2, 1.2], [-0.2, 0.9], [1.3, 1.1]] as const) for (const side of [-1, 1]) put("gloss", box(0.03, 0.62, w, side * (W / 2 + 0.01), 2.25, z), GLASS);
    put("plain", box(0.03, 1.9, 0.7, W / 2 + 0.01, 1.6, -0.9), 0xd9d6cc);
    put("plain", box(0.8, 0.5, 0.9, 0, top + 0.25, -0.6), 0xdedad2);
    wheels(put, W, [R - 1.1, -R + 1.9], r, true);
    for (const side of [-1, 1]) {
      put("gloss", box(0.3, 0.35, 0.05, side * (W / 2 - 0.25), 0.95, -R - 0.01), TAIL);
      put("gloss", box(0.3, 0.14, 0.05, side * (W / 2 - 0.3), 0.95, R + 0.01), LAMP);
    }
    return;
  }
  // Travel trailer: rounded front and back, one axle, a tongue and jack.
  const top = 3.0, r = 0.36;
  put("plain", profile([[-R, 0.55], [-R, top - 0.35], [-R + 0.35, top], [R - 0.9, top], [R - 0.15, top - 0.55], [R, 1.6], [R - 0.1, 0.55]], W, 0.12, [[-0.4, 0]], r + 0.12), white);
  put("plain", box(W + 0.02, 0.25, L - 0.6, 0, 1.3, -0.1), stripe);
  put("gloss", box(W * 0.8, 0.5, 0.06, 0, 2.2, R - 0.35).rotateX(-0.45), GLASS);
  for (const [z, w] of [[-2.5, 1.0], [0.6, 1.4]] as const) for (const side of [-1, 1]) put("gloss", box(0.03, 0.6, w, side * (W / 2 + 0.01), 2.1, z), GLASS);
  put("plain", box(0.03, 1.9, 0.7, W / 2 + 0.01, 1.55, -1.2), 0xd9d6cc);
  wheels(put, W, [-0.4], r);
  put("plain", box(0.12, 0.12, 1.3, 0, 0.5, R + 0.6), TRIM);
  put("plain", box(0.08, 0.5, 0.08, 0, 0.25, R + 1.0), TRIM);
  put("plain", box(0.9, 0.5, 0.5, 0, 0.8, R + 0.25), 0x2a2a2a);
}
