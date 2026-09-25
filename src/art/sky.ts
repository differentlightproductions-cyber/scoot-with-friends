// The outdoor sky: a dome drawn behind everything with a scattering-style
// gradient, a sun (or moon) with its glow, drifting fair-weather clouds and
// the real stars at night (stars.ts). The same dome lights the scene: it is rendered into a small
// PMREM environment map whenever it changes, so every material picks up the
// real sky and horizon colour instead of an indoor studio.
import * as THREE from "three";
import { StarField } from "./stars";
import { SkyEvents } from "./sky-events";

export type SkyPhase = "day" | "sunset" | "night" | "sunrise";

interface Preset {
  zenith: number; horizon: number; ground: number; sun: number; cloudLit: number; cloudShade: number;
  cover: number; night: number; haze: number; size: number; dir: [number, number, number];
}
// Mojave light: a deep clear blue overhead, a pale dusty band at the horizon,
// and long warm sunsets. Directions point toward the sun (or the moon).
const PRESETS: Record<SkyPhase, Preset> = {
  day: { zenith: 0x2a6fc0, horizon: 0xcfdde8, ground: 0xb8a48a, sun: 0xfff0d8, cloudLit: 0xffffff, cloudShade: 0x9eaabd, cover: 0.3, night: 0, haze: 0.85, size: 0.00085, dir: [-0.5, 0.8, -0.39] },
  sunset: { zenith: 0x33477e, horizon: 0xf29d62, ground: 0x6f5448, sun: 0xffa052, cloudLit: 0xffbf94, cloudShade: 0x6a5578, cover: 0.36, night: 0.12, haze: 1, size: 0.0012, dir: [-0.9, 0.1, -0.42] },
  night: { zenith: 0x040914, horizon: 0x18233a, ground: 0x0b0f16, sun: 0xaebfff, cloudLit: 0x2a3346, cloudShade: 0x0e121a, cover: 0.22, night: 1, haze: 0.7, size: 0.0005, dir: [0.35, 0.72, -0.6] },
  sunrise: { zenith: 0x5476b4, horizon: 0xf5c19c, ground: 0x957d6d, sun: 0xffc485, cloudLit: 0xffdcc2, cloudShade: 0x847c96, cover: 0.3, night: 0.08, haze: 1, size: 0.0011, dir: [0.88, 0.14, 0.45] },
};

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  gl_Position.z = p.w * 0.99999;
}`;

const fragment = /* glsl */ `
uniform vec3 uSunDir, uZenith, uHorizon, uGround, uSunColor, uCloudLit, uCloudShade;
uniform float uCover, uNight, uTime, uSize, uHaze, uOvercast, uStorm, uFlash;
uniform vec3 uMoonDir, uMoonSun;
uniform float uMoon, uMoonSize, uMoonLit;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y, up = max(h, 0.0);
  vec3 sky = mix(uHorizon, uZenith, pow(up, 0.34));
  // The dusty band just above the horizon, and the ground haze below it.
  sky = mix(sky, uHorizon * 1.04, exp(-up * 16.0) * uHaze);
  if (h < 0.0) sky = mix(uHorizon, uGround, 1.0 - exp(h * 10.0));
  float sd = max(dot(d, uSunDir), 0.0);
  // With the real moon drawn (#74), the night preset's stand-in disk and glow give way to it.
  float sunSide = 1.0 - uMoon * smoothstep(0.5, 0.95, uNight);
  float glow = pow(sd, 5.0) * 0.16 + pow(sd, 42.0) * 0.32 + pow(sd, 400.0) * 0.6;
  sky += uSunColor * glow * (1.0 - uOvercast * 0.7) * sunSide;
  // Stars are their own layer (stars.ts): the real sky over Boulder City.
  // Clouds on a flat layer: thin at the horizon, lit from the sun side.
  float cloud = 0.0;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.06) * 0.55 + vec2(uTime * 0.0035, uTime * 0.0012);
    float n = fbm(uv * 1.6);
    // A thunderstorm (#63) closes the deck completely, down to the horizon.
    float cover = mix(mix(uCover, 0.92, uOvercast), 1.05, uStorm);
    cloud = smoothstep(1.0 - cover, 1.0 - cover + 0.2, n) * smoothstep(0.0, mix(0.12, 0.015, uStorm), h);
    float lit = fbm(uv * 1.6 + uSunDir.xz * 0.12);
    vec3 cc = mix(uCloudLit, uCloudShade, clamp((lit - n) * 4.0 + 0.4 + uOvercast * 0.4, 0.0, 1.0));
    cc += uSunColor * pow(sd, 8.0) * 0.45 * (1.0 - uOvercast);
    // Its underside hangs in heavy, uneven lumps: darker where the cloud is thickest.
    cc = mix(cc, cc * (0.45 + 0.9 * (1.0 - n)) * mix(1.0, 0.8, smoothstep(0.35, 0.0, h)), uStorm);
    sky = mix(sky, cc, cloud * 0.95);
  }
  // The disk last, dimmed behind cloud.
  float disk = smoothstep(1.0 - uSize, 1.0 - uSize * 0.55, sd);
  sky += uSunColor * disk * (uNight > 0.5 ? 1.2 : 7.0) * (1.0 - cloud * 0.9) * (1.0 - uOvercast) * sunSide;
  // The moon (#74): its real phase, the terminator lit from where the sun
  // really is, dark maria, a trace of earthshine on the unlit part and a halo
  // that grows with the phase. Cloud passes in front of it.
  if (uMoon > 0.0) {
    float md = dot(d, uMoonDir), veil = uMoon * (1.0 - cloud * 0.9) * (1.0 - uOvercast * 0.85);
    sky += vec3(0.72, 0.8, 1.0) * (pow(max(md, 0.0), 70.0) * 0.06 + pow(max(md, 0.0), 1200.0) * 0.12) * uMoonLit * veil;
    vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.0, 1e-4));
    vec3 over = cross(right, uMoonDir);
    vec2 q = vec2(dot(d, right), dot(d, over)) / sin(uMoonSize);
    float rr = dot(q, q);
    if (md > 0.0 && rr < 1.0) {
      vec3 n = right * q.x + over * q.y - uMoonDir * sqrt(1.0 - rr);
      float lit = smoothstep(-0.03, 0.07, dot(n, uMoonSun));
      float maria = fbm(q * 2.1 + vec2(4.3, 1.7)), crater = vnoise(q * 11.0);
      float albedo = mix(1.0, 0.6, smoothstep(0.47, 0.62, maria)) * (0.9 + crater * 0.14);
      vec3 moon = vec3(0.95, 0.94, 0.88) * albedo * (lit * 1.35 + 0.012);
      // By day only the lit part shows, pale against the blue; at night the whole disk hides the stars behind it.
      float dark = smoothstep(0.4, 0.9, uNight);
      sky = mix(sky, moon, smoothstep(1.0, 0.93, rr) * veil * mix(lit, 1.0, dark) * mix(0.45, 1.0, dark));
    }
  }
  // Overcast (falling snow) greys the whole sky.
  float grey = dot(sky, vec3(0.3, 0.55, 0.15));
  sky = mix(sky, vec3(grey) * vec3(0.92, 0.95, 1.0), uOvercast * 0.75);
  // A rain storm darkens the cloud deck to slate; lightning lights it from inside.
  sky *= 1.0 - uStorm * 0.42;
  // A flash lights the deck from inside, strongest in its thick lumps, never as bright as the channel itself.
  sky += vec3(0.62, 0.68, 0.85) * uFlash * (0.12 + 0.3 * cloud);
  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uSunDir: { value: new THREE.Vector3(...PRESETS.day.dir).normalize() },
    uZenith: { value: new THREE.Color(PRESETS.day.zenith) },
    uHorizon: { value: new THREE.Color(PRESETS.day.horizon) },
    uGround: { value: new THREE.Color(PRESETS.day.ground) },
    uSunColor: { value: new THREE.Color(PRESETS.day.sun) },
    uCloudLit: { value: new THREE.Color(PRESETS.day.cloudLit) },
    uCloudShade: { value: new THREE.Color(PRESETS.day.cloudShade) },
    uCover: { value: PRESETS.day.cover },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: PRESETS.day.size },
    uHaze: { value: PRESETS.day.haze },
    uOvercast: { value: 0 },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
    uMoon: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0.35, 0.72, -0.6).normalize() },
    uMoonSun: { value: new THREE.Vector3(0, -1, 0) },
    uMoonSize: { value: 0.024 },
    uMoonLit: { value: 1 },
  };
  private envScene = new THREE.Scene();
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envAge = 99;
  private envKey = "";
  private scratch = new THREE.Color();
  private dirScratch = new THREE.Vector3();
  /** The night sky: real constellations for Boulder City, drawn just inside the dome. */
  readonly stars: StarField;
  /** Lightning channels and shooting stars (#63). */
  readonly events = new SkyEvents();

  constructor(private scene: THREE.Scene, phase: SkyPhase = "day") {
    (scene.userData.sky as SkyDome | undefined)?.dispose();
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment,
      side: THREE.BackSide, depthWrite: false, fog: false,
      // Fog is applied after tone mapping, so the dome is not tone mapped
      // either: the horizon and the haze on distant ground stay one colour.
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
    this.stars = new StarField(this.uniforms);
    this.mesh.name = "Sky dome";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.scale.setScalar(1000);
    this.mesh.onBeforeRender = (_r, _s, camera) => { this.mesh.position.copy(camera.position); this.mesh.updateMatrixWorld(); this.events.follow(camera); };
    scene.add(this.mesh, this.stars.points, this.events.group);
    scene.background = null;
    scene.userData.sky = this;
    this.envScene.add(new THREE.Mesh(this.mesh.geometry, material));
    this.snap(phase);
  }

  /** Jumps straight to a phase (a rebuilt park starts in the current light). */
  snap(phase: SkyPhase) {
    this.approach(phase, 1);
  }

  /** Eases toward a phase; `amount` is the blend for this step (0..1). */
  approach(phase: SkyPhase, amount: number) {
    const p = PRESETS[phase], u = this.uniforms;
    for (const [key, hex] of [["uZenith", p.zenith], ["uHorizon", p.horizon], ["uGround", p.ground], ["uSunColor", p.sun], ["uCloudLit", p.cloudLit], ["uCloudShade", p.cloudShade]] as const)
      u[key].value.lerp(this.scratch.set(hex), amount);
    // Live (#74): the real cloud cover, set by weather.ts, instead of the preset's.
    const cover = typeof this.scene.userData.cloudCover === "number" ? this.scene.userData.cloudCover : p.cover;
    u.uCover.value += (cover - u.uCover.value) * amount;
    u.uNight.value += (p.night - u.uNight.value) * amount;
    u.uSize.value += (p.size - u.uSize.value) * amount;
    u.uHaze.value += (p.haze - u.uHaze.value) * amount;
    const dir = phase === "night" && this.nightDirection ? this.dirScratch.copy(this.nightDirection) : this.dirScratch.set(...p.dir).normalize();
    u.uSunDir.value.lerp(dir, amount).normalize();
  }
  /** At night the key light comes from here instead of the preset (the real moon when it is up). */
  nightDirection: THREE.Vector3 | null = null;
  /** The preset night light's direction, where a moon is drawn when the sky is not live. */
  static readonly NIGHT_DIRECTION = new THREE.Vector3(...PRESETS.night.dir).normalize();
  /**
   * Draws the moon toward `moon` with the Sun toward `sun` (unit directions),
   * `illumination` its lit fraction, `visible` fades it (0..1); null hides it.
   */
  setMoon(moon: THREE.Vector3 | null, sun?: THREE.Vector3, illumination = 1, visible = 1) {
    const u = this.uniforms;
    u.uMoon.value = moon ? visible * THREE.MathUtils.smoothstep(moon.y, -0.03, 0.02) : 0;
    if (!moon) return;
    u.uMoonDir.value.copy(moon);
    if (sun) u.uMoonSun.value.copy(sun);
    u.uMoonLit.value = illumination;
  }

  /** Direction toward the sun (or moon), for the key light. */
  get sunDirection() { return this.uniforms.uSunDir.value; }
  /** The colour at the horizon: what distance fades into. */
  get horizon() { return this.uniforms.uHorizon.value; }

  step(dt: number, renderer?: THREE.WebGLRenderer) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uOvercast.value = THREE.MathUtils.clamp(this.scene.userData.overcast ?? 0, 0, 1);
    this.uniforms.uStorm.value = THREE.MathUtils.clamp(this.scene.userData.storm ?? 0, 0, 1);
    this.uniforms.uFlash.value = THREE.MathUtils.clamp(this.scene.userData.lightning ?? 0, 0, 1);
    // Stars come out with the night and hide behind cloud; a little twilight
    // shows only the brightest (sunset and sunrise carry a small uNight).
    const u = this.uniforms;
    this.stars.setVisibility(THREE.MathUtils.smoothstep(u.uNight.value, 0.05, 0.9) * (1 - u.uOvercast.value) * (1 - 0.8 * u.uStorm.value));
    // A strike's channel flickers with its return strokes (weather.ts); shooting
    // stars need a properly dark, clear night.
    this.events.step(dt, THREE.MathUtils.clamp(this.scene.userData.lightningChannel ?? 0, 0, 1), THREE.MathUtils.smoothstep(u.uNight.value, 0.6, 0.95) * (1 - u.uOvercast.value) * (1 - u.uStorm.value));
    if (renderer) this.updateEnvironment(renderer, dt);
  }

  /**
   * Re-renders the lighting environment from the dome, at most twice a second
   * and only when the sky has visibly changed.
   */
  private updateEnvironment(renderer: THREE.WebGLRenderer, dt: number) {
    this.envAge += dt;
    if (this.envAge < 0.5) return;
    const u = this.uniforms;
    const key = [u.uZenith.value.getHexString(), u.uHorizon.value.getHexString(), u.uSunColor.value.getHexString(), u.uSunDir.value.x.toFixed(2), u.uSunDir.value.y.toFixed(2), u.uOvercast.value.toFixed(2)].join();
    if (key === this.envKey && this.envTarget) return;
    this.envAge = 0;
    this.envKey = key;
    this.pmrem ??= new THREE.PMREMGenerator(renderer);
    // The environment should not carry the sun's disk as a hard highlight.
    const size = u.uSize.value;
    u.uSize.value = 0;
    const next = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000, { size: 128 });
    u.uSize.value = size;
    this.envTarget?.dispose();
    this.envTarget = next;
    this.scene.environment = next.texture;
    this.scene.userData.skyEnvironment = next.texture;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.stars.dispose();
    this.events.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    if (this.scene.userData.sky === this) delete this.scene.userData.sky;
  }
}
