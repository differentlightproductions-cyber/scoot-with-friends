import * as THREE from "three";

/**
 * The real night sky over Boulder City, Nevada (#44): the naked-eye stars of
 * the constellations seen from 35.98 N, placed by right ascension and
 * declination for the local sidereal time, plus a faint field that thickens
 * along the Milky Way. The game's compass (phone/map.ts) has north at -z and
 * east at +x, so Polaris hangs due "N" about 36 degrees up.
 */
export const BOULDER_CITY = { lat: 35.978, lon: -114.832 };

/** [name, RA (hours), Dec (degrees), visual magnitude, B-V colour index]. */
type Star = [string, number, number, number, number];
// Bright stars by constellation (J2000, rounded). Colour indices only where
// they are distinctive; the rest default to a white-ish 0.2.
const CATALOG: Star[] = [
  // Orion
  ["Betelgeuse", 5.919, 7.407, 0.5, 1.85], ["Rigel", 5.242, -8.202, 0.13, -0.03], ["Bellatrix", 5.419, 6.35, 1.64, -0.22], ["Mintaka", 5.533, -0.299, 2.23, -0.22], ["Alnilam", 5.604, -1.202, 1.69, -0.18], ["Alnitak", 5.679, -1.943, 1.77, -0.21], ["Saiph", 5.796, -9.67, 2.09, -0.17], ["Meissa", 5.585, 9.934, 3.39, -0.16], ["Nair al Saif", 5.59, -5.91, 2.77, -0.24], ["Pi3 Ori", 4.83, 6.961, 3.19, 0.45], ["Pi4 Ori", 4.853, 5.605, 3.69, -0.17], ["Pi2 Ori", 4.843, 8.9, 4.35, 0.01],
  // Taurus and the Pleiades
  ["Aldebaran", 4.599, 16.509, 0.86, 1.54], ["Elnath", 5.438, 28.608, 1.65, -0.13], ["Tianguan", 5.627, 21.143, 3.0, -0.19], ["Prima Hyadum", 4.33, 15.628, 3.65, 0.99], ["Secunda Hyadum", 4.382, 17.543, 3.76, 0.98], ["Ain", 4.477, 19.18, 3.53, 1.01], ["Chamukuy", 4.478, 15.871, 3.4, 0.18],
  ["Alcyone", 3.791, 24.105, 2.87, -0.09], ["Atlas", 3.819, 24.053, 3.62, -0.08], ["Electra", 3.747, 24.113, 3.7, -0.11], ["Maia", 3.763, 24.368, 3.87, -0.07], ["Merope", 3.772, 23.948, 4.18, -0.06], ["Taygeta", 3.754, 24.467, 4.3, -0.11], ["Pleione", 3.82, 24.137, 5.05, -0.08],
  // Gemini, Canis Major and Minor, Auriga
  ["Castor", 7.577, 31.888, 1.58, 0.03], ["Pollux", 7.755, 28.026, 1.14, 1.0], ["Alhena", 6.629, 16.399, 1.93, 0.0], ["Mebsuta", 6.732, 25.131, 2.98, 1.4], ["Tejat", 6.383, 22.514, 2.87, 1.64], ["Wasat", 7.335, 21.982, 3.53, 0.34], ["Propus", 6.248, 22.507, 3.3, 1.6],
  ["Sirius", 6.752, -16.716, -1.46, 0.0], ["Adhara", 6.977, -28.972, 1.5, -0.21], ["Wezen", 7.14, -26.393, 1.83, 0.68], ["Mirzam", 6.378, -17.956, 1.98, -0.24], ["Aludra", 7.402, -29.303, 2.45, -0.08],
  ["Procyon", 7.655, 5.225, 0.34, 0.42], ["Gomeisa", 7.453, 8.289, 2.89, -0.1],
  ["Capella", 5.278, 45.998, 0.08, 0.8], ["Menkalinan", 5.992, 44.948, 1.9, 0.08], ["Mahasim", 5.995, 37.213, 2.62, -0.08], ["Hassaleh", 4.95, 33.166, 2.69, 1.53], ["Almaaz", 5.033, 43.823, 2.99, 0.54],
  // Leo, Virgo, Corvus, Hydra, Libra
  ["Regulus", 10.14, 11.967, 1.35, -0.11], ["Denebola", 11.818, 14.572, 2.14, 0.09], ["Algieba", 10.333, 19.842, 2.08, 1.13], ["Zosma", 11.235, 20.524, 2.56, 0.12], ["Chertan", 11.237, 15.43, 3.33, 0.0], ["Ras Elased", 9.764, 23.774, 2.98, 0.81], ["Adhafera", 10.278, 23.417, 3.43, 0.31], ["Rasalas", 9.879, 26.007, 3.88, 1.22], ["Eta Leo", 10.122, 16.763, 3.49, -0.03],
  ["Spica", 13.42, -11.161, 0.97, -0.23], ["Porrima", 12.694, -1.449, 2.74, 0.36], ["Vindemiatrix", 13.036, 10.959, 2.83, 0.94], ["Heze", 13.578, -0.596, 3.37, 0.11], ["Minelauva", 12.927, 3.397, 3.38, 1.58], ["Zavijava", 11.845, 1.765, 3.6, 0.55],
  ["Gienah Corvi", 12.263, -17.542, 2.59, -0.11], ["Kraz", 12.573, -23.397, 2.65, 0.89], ["Algorab", 12.498, -16.515, 2.95, -0.05], ["Minkar", 12.169, -22.62, 3.0, 1.33],
  ["Alphard", 9.46, -8.659, 1.98, 1.44], ["Zubeneschamali", 15.283, -9.383, 2.61, -0.07], ["Zubenelgenubi", 14.848, -16.042, 2.75, 0.15],
  // The Dippers, Draco, Cassiopeia, Cepheus
  ["Dubhe", 11.062, 61.751, 1.79, 1.07], ["Merak", 11.031, 56.382, 2.37, -0.02], ["Phecda", 11.897, 53.695, 2.44, 0.0], ["Megrez", 12.257, 57.033, 3.31, 0.08], ["Alioth", 12.9, 55.96, 1.77, -0.02], ["Mizar", 13.399, 54.925, 2.23, 0.02], ["Alkaid", 13.792, 49.313, 1.86, -0.19], ["Talitha", 8.987, 48.042, 3.14, 0.19], ["Tania Borealis", 10.284, 42.914, 3.45, 0.03], ["Tania Australis", 10.372, 41.499, 3.05, 1.59], ["Alula Borealis", 11.308, 33.094, 3.49, 1.4], ["Muscida", 8.504, 60.718, 3.36, 0.85], ["Psi UMa", 11.161, 44.498, 3.0, 1.14],
  ["Polaris", 2.53, 89.264, 1.98, 0.6], ["Kochab", 14.845, 74.156, 2.08, 1.47], ["Pherkad", 15.345, 71.834, 3.05, 0.05], ["Yildun", 17.537, 86.586, 4.36, 0.02], ["Epsilon UMi", 16.766, 82.037, 4.23, 0.89], ["Zeta UMi", 15.734, 77.795, 4.32, 0.04], ["Eta UMi", 16.292, 75.755, 4.95, 0.37],
  ["Eltanin", 17.943, 51.489, 2.23, 1.52], ["Rastaban", 17.507, 52.301, 2.79, 0.98], ["Aldhibah", 16.4, 61.514, 2.73, 0.91], ["Altais", 19.209, 67.662, 3.07, 1.0], ["Thuban", 14.073, 64.376, 3.65, -0.05], ["Edasich", 15.415, 58.966, 3.29, 1.16], ["Grumium", 17.892, 56.873, 3.75, 1.18], ["Aldhibain", 17.146, 65.715, 3.17, -0.12], ["Chi Dra", 18.351, 72.733, 3.57, 0.49],
  ["Schedar", 0.675, 56.537, 2.24, 1.17], ["Caph", 0.153, 59.15, 2.28, 0.34], ["Gamma Cas", 0.945, 60.717, 2.47, -0.15], ["Ruchbah", 1.43, 60.235, 2.68, 0.13], ["Segin", 1.907, 63.67, 3.37, -0.15],
  ["Alderamin", 21.31, 62.586, 2.45, 0.22], ["Alfirk", 21.478, 70.561, 3.23, -0.22], ["Errai", 23.656, 77.632, 3.21, 1.03], ["Zeta Cep", 22.181, 58.201, 3.35, 1.57], ["Iota Cep", 22.828, 66.201, 3.52, 1.05],
  // Boötes, Corona Borealis, Hercules, Ophiuchus, Serpens
  ["Arcturus", 14.261, 19.182, -0.05, 1.23], ["Izar", 14.75, 27.074, 2.37, 0.97], ["Muphrid", 13.911, 18.398, 2.68, 0.58], ["Seginus", 14.535, 38.308, 3.03, 0.19], ["Nekkar", 15.032, 40.391, 3.5, 0.97], ["Delta Boo", 15.258, 33.315, 3.47, 0.95], ["Rho Boo", 14.53, 30.371, 3.58, 1.3],
  ["Alphecca", 15.578, 26.715, 2.23, 0.03], ["Nusakan", 15.464, 29.106, 3.68, 0.28], ["Gamma CrB", 15.713, 26.296, 3.84, 0.0], ["Delta CrB", 15.826, 26.068, 4.63, 0.8], ["Epsilon CrB", 15.96, 26.878, 4.15, 1.23], ["Theta CrB", 15.549, 31.359, 4.14, -0.13],
  ["Kornephoros", 16.504, 21.49, 2.77, 0.94], ["Zeta Her", 16.688, 31.603, 2.81, 0.65], ["Pi Her", 17.251, 36.809, 3.16, 1.44], ["Eta Her", 16.714, 38.922, 3.48, 0.92], ["Epsilon Her", 17.005, 30.926, 3.92, -0.02], ["Sarin", 17.251, 24.839, 3.14, 0.08], ["Rasalgethi", 17.244, 14.39, 3.1, 1.44], ["Mu Her", 17.774, 27.72, 3.42, 0.75],
  ["Rasalhague", 17.582, 12.56, 2.08, 0.15], ["Sabik", 17.173, -15.725, 2.43, 0.06], ["Yed Prior", 16.239, -3.694, 2.73, 1.58], ["Zeta Oph", 16.619, -10.567, 2.56, 0.02], ["Cebalrai", 17.725, 4.567, 2.76, 1.16], ["Kappa Oph", 16.961, 9.375, 3.2, 1.15], ["Unukalhai", 15.738, 6.426, 2.63, 1.17],
  // Summer Triangle: Lyra, Cygnus, Aquila, with Delphinus and Sagitta
  ["Vega", 18.616, 38.784, 0.03, 0.0], ["Sheliak", 18.835, 33.363, 3.52, 0.0], ["Sulafat", 18.982, 32.69, 3.25, -0.05], ["Zeta1 Lyr", 18.746, 37.605, 4.36, 0.19], ["Delta2 Lyr", 18.908, 36.899, 4.3, 1.68],
  ["Deneb", 20.69, 45.28, 1.25, 0.09], ["Sadr", 20.37, 40.257, 2.23, 0.67], ["Aljanah", 20.77, 33.97, 2.48, 1.03], ["Fawaris", 19.75, 45.131, 2.87, -0.03], ["Albireo", 19.512, 27.96, 3.08, 1.13], ["Zeta Cyg", 21.216, 30.227, 3.2, 0.99], ["Eta Cyg", 19.938, 35.083, 3.89, 1.02],
  ["Altair", 19.846, 8.868, 0.77, 0.22], ["Tarazed", 19.771, 10.613, 2.72, 1.52], ["Alshain", 19.922, 6.407, 3.71, 0.86], ["Okab", 19.09, 13.864, 2.99, 0.01], ["Delta Aql", 19.425, 3.115, 3.36, 0.32], ["Lambda Aql", 19.104, -4.882, 3.43, -0.09], ["Theta Aql", 20.188, -0.822, 3.23, -0.07],
  ["Rotanev", 20.626, 14.595, 3.63, 0.44], ["Sualocin", 20.661, 15.912, 3.77, -0.06], ["Gamma Del", 20.777, 16.124, 3.9, 1.04], ["Delta Del", 20.724, 15.075, 4.43, 0.32], ["Aldulfin", 20.554, 11.303, 4.03, -0.13], ["Gamma Sge", 19.979, 19.492, 3.47, 1.57],
  // Scorpius and Sagittarius, low in the south
  ["Antares", 16.49, -26.432, 1.06, 1.83], ["Shaula", 17.56, -37.104, 1.62, -0.22], ["Sargas", 17.622, -42.998, 1.86, 0.4], ["Dschubba", 16.006, -22.622, 2.29, -0.12], ["Acrab", 16.091, -19.806, 2.56, -0.07], ["Fang", 15.981, -26.114, 2.89, -0.19], ["Alniyat", 16.353, -25.593, 2.89, 0.13], ["Paikauhale", 16.598, -28.216, 2.82, -0.25], ["Larawag", 16.836, -34.293, 2.29, 1.15], ["Xamidimura", 16.864, -38.047, 3.0, -0.2], ["Zeta2 Sco", 16.91, -42.362, 3.62, 1.37], ["Eta Sco", 17.203, -43.239, 3.33, 0.41], ["Girtab", 17.708, -39.03, 2.39, -0.17], ["Iota1 Sco", 17.793, -40.127, 2.99, 0.51], ["Lesath", 17.513, -37.296, 2.7, -0.22],
  ["Kaus Australis", 18.403, -34.385, 1.85, -0.03], ["Nunki", 18.921, -26.297, 2.05, -0.13], ["Ascella", 19.044, -29.88, 2.6, 0.08], ["Kaus Media", 18.35, -29.828, 2.7, 1.38], ["Kaus Borealis", 18.466, -25.422, 2.82, 1.04], ["Alnasl", 18.097, -30.424, 2.98, 1.0], ["Phi Sgr", 18.761, -26.991, 3.17, -0.11], ["Tau Sgr", 19.116, -27.671, 3.32, 1.19],
  // Autumn: Pegasus, Andromeda, Perseus, Aries, Cetus, and the southern first-magnitude stars
  ["Enif", 21.736, 9.875, 2.39, 1.52], ["Scheat", 23.063, 28.083, 2.42, 1.67], ["Markab", 23.079, 15.205, 2.49, -0.04], ["Algenib", 0.221, 15.184, 2.83, -0.23], ["Homam", 22.691, 10.831, 3.4, -0.09], ["Matar", 22.717, 30.221, 2.94, 0.86],
  ["Alpheratz", 0.14, 29.09, 2.06, -0.11], ["Mirach", 1.162, 35.621, 2.05, 1.58], ["Almach", 2.065, 42.33, 2.1, 1.37], ["Delta And", 0.655, 30.861, 3.27, 1.28],
  ["Mirfak", 3.405, 49.861, 1.79, 0.48], ["Algol", 3.136, 40.956, 2.12, -0.05], ["Menkib", 3.902, 31.884, 2.85, 0.12], ["Epsilon Per", 3.964, 40.01, 2.89, -0.18], ["Gamma Per", 3.08, 53.506, 2.93, 0.7], ["Delta Per", 3.715, 47.788, 3.01, -0.13],
  ["Hamal", 2.12, 23.462, 2.0, 1.15], ["Sheratan", 1.911, 20.808, 2.64, 0.13], ["Mesarthim", 1.892, 19.294, 3.88, -0.1], ["Beta Tri", 2.159, 34.987, 3.0, 0.14],
  ["Diphda", 0.727, -17.987, 2.04, 1.02], ["Menkar", 3.038, 4.09, 2.54, 1.64], ["Mira", 2.322, -2.978, 3.0, 1.42],
  ["Fomalhaut", 22.961, -29.622, 1.16, 0.09], ["Sadalsuud", 21.526, -5.571, 2.87, 0.83], ["Sadalmelik", 22.096, -0.32, 2.95, 0.97], ["Deneb Algedi", 21.784, -16.127, 2.85, 0.29], ["Dabih", 20.35, -14.781, 3.05, 0.79],
  ["Cursa", 5.131, -5.086, 2.78, 0.13], ["Arneb", 5.546, -17.822, 2.58, 0.21], ["Nihal", 5.471, -20.759, 2.84, 0.82], ["Phact", 5.661, -34.074, 2.64, -0.12], ["Naos", 8.06, -40.003, 2.21, -0.27], ["Regor", 8.158, -47.337, 1.83, -0.22],
  ["Menkent", 14.111, -36.37, 2.06, 1.01], ["Cor Caroli", 12.934, 38.318, 2.9, -0.12], ["Alpha Lyn", 9.351, 34.393, 3.13, 1.55], ["Canopus", 6.399, -52.696, -0.74, 0.15],
];

const DEG = Math.PI / 180;
/** Local sidereal time (hours) at `date` for east longitude `lon` (degrees). */
export function siderealHours(date: Date, lon: number) {
  const days = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  return ((((18.697374558 + 24.06570982441908 * days + lon / 15) % 24) + 24) % 24);
}
/**
 * A star's direction in the game world: y up, north -z, east +x. `lst` in
 * hours, RA in hours, Dec and latitude in degrees.
 */
export function starDirection(ra: number, dec: number, lst: number, lat: number, out = new THREE.Vector3()) {
  const h = (lst - ra) * 15 * DEG, d = dec * DEG, phi = lat * DEG;
  const up = Math.cos(phi) * Math.cos(d) * Math.cos(h) + Math.sin(phi) * Math.sin(d);
  const north = -Math.sin(phi) * Math.cos(d) * Math.cos(h) + Math.cos(phi) * Math.sin(d);
  const west = Math.cos(d) * Math.sin(h);
  return out.set(-west, up, -north);
}
/** Star colour from its B-V index: blue-white through white and yellow to orange-red. */
function starColor(bv: number, out = new THREE.Color()) {
  const t = THREE.MathUtils.clamp((bv + 0.3) / 2.0, 0, 1);
  const stops = [[0, 0.64, 0.74, 1], [0.15, 0.82, 0.88, 1], [0.3, 1, 1, 1], [0.5, 1, 0.94, 0.8], [0.75, 1, 0.8, 0.58], [1, 1, 0.66, 0.46]];
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0]);
    return out.setRGB(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k);
  }
  return out.setRGB(1, 0.66, 0.46);
}
/** Equatorial RA/Dec (degrees) of galactic longitude/latitude (degrees). */
function galacticToEquatorial(l: number, b: number) {
  const lr = l * DEG, br = b * DEG, pole = { ra: 192.85948 * DEG, dec: 27.12825 * DEG }, lNcp = 122.93192 * DEG;
  const sinDec = Math.sin(br) * Math.sin(pole.dec) + Math.cos(br) * Math.cos(pole.dec) * Math.cos(lNcp - lr);
  const dec = Math.asin(sinDec);
  const y = Math.cos(br) * Math.sin(lNcp - lr), x = Math.sin(br) * Math.cos(pole.dec) - Math.cos(br) * Math.sin(pole.dec) * Math.cos(lNcp - lr);
  return { ra: ((pole.ra + Math.atan2(y, x)) / DEG + 360) % 360, dec: dec / DEG };
}

/** Evening in Boulder City tonight (10 pm Pacific) as a sidereal time: the sky matches the season. */
export function tonight(now = new Date()) {
  const evening = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 0, 0));
  return siderealHours(evening, BOULDER_CITY.lon);
}

/**
 * The star layer: a Points cloud on a sphere just inside the sky dome, following
 * the camera. `setVisibility` fades it with night and cloud; `setSidereal`
 * turns the sky to another time.
 */
export class StarField {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private entries: { ra: number; dec: number }[] = [];
  /**
   * `clouds` shares the sky dome's cloud uniforms (cover, overcast, time), so a
   * star behind a drifting cloud is hidden by the same noise that draws it.
   */
  constructor(clouds?: { uCover: { value: number }; uOvercast: { value: number }; uTime: { value: number } }, lst = tonight(), private lat = BOULDER_CITY.lat) {
    const faint = this.faintField();
    const all = [...CATALOG.map(([, ra, dec, mag, bv]) => ({ ra, dec, mag, bv })), ...faint];
    const positions = new Float32Array(all.length * 3), colors = new Float32Array(all.length * 3), sizes = new Float32Array(all.length), phases = new Float32Array(all.length);
    const c = new THREE.Color();
    all.forEach((s, i) => {
      this.entries.push({ ra: s.ra, dec: s.dec });
      starColor(s.bv, c).toArray(colors, i * 3);
      // Apparent size and brightness fall off with magnitude (a step of 1 is 2.5x fainter).
      sizes[i] = THREE.MathUtils.clamp(4.6 - 0.72 * s.mag, 1.1, 6.2);
      phases[i] = (i * 2.399) % (Math.PI * 2);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 0 }, uTime: clouds?.uTime ?? { value: 0 }, uPixel: { value: 1 }, uCover: clouds?.uCover ?? { value: 0 }, uOvercast: clouds?.uOvercast ?? { value: 0 } },
      vertexShader: `attribute float aSize; attribute float aPhase; attribute vec3 color; varying vec3 vColor; varying float vFade; uniform float uTime, uPixel, uCover, uOvercast;
        // The dome's cloud noise (sky.ts), so stars go behind the same clouds.
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
        void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          // Stars thin out and redden into the haze near the horizon, and twinkle there most.
          vec3 d = normalize(position); float h = d.y; vFade = smoothstep(-0.02, 0.18, h);
          vec2 uv = d.xz / (max(h, 0.0) + 0.06) * 0.55 + vec2(uTime * 0.0035, uTime * 0.0012);
          float cover = mix(uCover, 0.92, uOvercast);
          vFade *= 1.0 - smoothstep(1.0 - cover, 1.0 - cover + 0.2, fbm(uv * 1.6)) * smoothstep(0.0, 0.12, h) * 0.97;
          float twinkle = 1.0 + (1.0 - vFade * 0.7) * 0.25 * sin(uTime * (3.0 + fract(aPhase) * 4.0) + aPhase * 7.0);
          gl_PointSize = aSize * uPixel * twinkle; }`,
      fragmentShader: `varying vec3 vColor; varying float vFade; uniform float uAlpha;
        void main() { vec2 p = gl_PointCoord - 0.5; float r = length(p); float core = smoothstep(0.5, 0.0, r); core *= core;
          gl_FragColor = vec4(vColor * (0.55 + 0.9 * core), core * uAlpha * vFade); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.name = "Stars (Boulder City sky)";
    this.points.frustumCulled = false;
    this.points.renderOrder = -999;
    this.points.scale.setScalar(990);
    this.points.onBeforeRender = (renderer, _s, camera) => {
      this.points.position.copy(camera.position); this.points.updateMatrixWorld();
      this.material.uniforms.uPixel.value = renderer.getPixelRatio();
    };
    this.setSidereal(lst);
  }
  /** Turn the sky to local sidereal time `lst` (hours). */
  setSidereal(lst: number) {
    const pos = this.points.geometry.getAttribute("position") as THREE.BufferAttribute, v = new THREE.Vector3();
    this.entries.forEach((e, i) => { starDirection(e.ra, e.dec, lst, this.lat, v); pos.setXYZ(i, v.x, v.y, v.z); });
    pos.needsUpdate = true;
  }
  /** Brightness 0..1: night, cleared by cloud. */
  setVisibility(alpha: number) { this.material.uniforms.uAlpha.value = alpha; this.points.visible = alpha > 0.005; }
  /**
   * The faint naked-eye field (magnitude 4.5-6.2): a sprinkle over the whole
   * sky and a dense band along the galactic plane, brightest toward the
   * galactic centre in Sagittarius. Seeded, so it is the same every night.
   */
  private faintField() {
    let seed = 20260924;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const out: { ra: number; dec: number; mag: number; bv: number }[] = [];
    for (let i = 0; i < 900; i++) {
      const u = rnd() * 2 - 1, ra = rnd() * 24;
      out.push({ ra, dec: Math.asin(u) / DEG, mag: 4.6 + rnd() * 1.6, bv: rnd() * 1.4 - 0.1 });
    }
    for (let i = 0; i < 1400; i++) {
      const l = rnd() * 360, bulge = Math.cos(l * DEG) > 0.6 ? 1.7 : 1;
      if (rnd() > 0.55 + 0.45 * Math.cos((l * DEG) / 2) ** 2) continue;
      const g1 = rnd() + rnd() + rnd() - 1.5, b = g1 * 7 * bulge;
      const eq = galacticToEquatorial(l, b);
      out.push({ ra: eq.ra / 15, dec: eq.dec, mag: 5.0 + rnd() * 1.3, bv: rnd() * 1.2 });
    }
    return out;
  }
  dispose() { this.points.geometry.dispose(); this.material.dispose(); this.points.removeFromParent(); }
}
