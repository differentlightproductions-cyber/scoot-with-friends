import * as THREE from "three";
import { WATER, inWater } from "./water";

/**
 * Under the lake (#62). Its basin: a bowl 2.5 m deep at the middle, sand in
 * the shallows going to dark silt, stones on the bottom and light rippling
 * across it; the surface seen from below, a bright rippling window straight up
 * (Snell's window: past about 49 degrees from overhead the surface is a dull
 * mirror of the water); and, with the eye under, murky green water that
 * swallows the view within a few metres, drifting motes, bubbles and muffled
 * sound. From above the opaque lake hides all of it.
 */
/** Where the surface is drawn from below, and where the eye counts as under. */
const UNDERSIDE = -0.3;

export function buildLakeBasin(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = "Lake basin";
  // The weather's snow and wet shading stays off the bottom of a lake.
  group.userData.weatherDynamic = true;
  const rings = 22, segments = 96, position: number[] = [], color: number[] = [], index: number[] = [];
  const sand = new THREE.Color(0x8d8263), silt = new THREE.Color(0x33402f), c = new THREE.Color();
  const bump = (x: number, z: number) => Math.sin(x * 0.9 + z * 0.35) * 0.08 + Math.sin(z * 0.53 - x * 0.4) * 0.1;
  for (let i = 0; i <= rings; i++) {
    const r = i / rings;
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2, x = WATER.x + Math.cos(a) * WATER.radiusX * r, z = WATER.z + Math.sin(a) * WATER.radiusZ * r;
      const floor = -WATER.depth * Math.pow(Math.max(0, 1 - r * r), 0.7);
      position.push(x, i === rings ? -0.34 : Math.min(-0.34, floor + bump(x, z) * (1 - r)), z);
      c.copy(sand).lerp(silt, THREE.MathUtils.smoothstep(-floor, 0.4, 2.2)).multiplyScalar(0.9 + 0.2 * Math.sin(x * 3.1 + z * 2.3) * Math.sin(z * 1.7));
      color.push(c.r, c.g, c.b);
      if (i < rings) {
        const p = i * segments + j, q = i * segments + ((j + 1) % segments);
        index.push(p, q, p + segments, q, q + segments, p + segments);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const bed = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, name: "Lake bed" });
  // Sunlight through the rippling surface: caustic bands wandering over the bottom.
  const time = { value: 0 };
  bed.onBeforeCompile = (shader) => {
    shader.uniforms.causticTime = time;
    shader.vertexShader = "varying vec3 bedWorld;\n" + shader.vertexShader.replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nbedWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = "uniform float causticTime; varying vec3 bedWorld;\n" + shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
{ vec2 p = bedWorld.xz * 1.3; float t = causticTime;
  float k = abs(sin(p.x + sin(p.y * 1.3 + t) + t * 0.7) + sin(p.y * 1.1 + sin(p.x * 1.7 - t * 0.8) - t * 0.5));
  float band = pow(clamp(1.0 - k * 0.5, 0.0, 1.0), 6.0);
  totalEmissiveRadiance += diffuseColor.rgb * band * 0.55 * smoothstep(-2.6, -0.3, bedWorld.y + 0.2); }`,
    );
  };
  bed.customProgramCacheKey = () => "swf-lake-bed-v1";
  const basin = new THREE.Mesh(geometry, bed);
  basin.name = "Lake bed";
  basin.receiveShadow = true;
  group.add(basin);
  // Stones on the bottom, a few half buried.
  const stone = new THREE.MeshStandardMaterial({ color: 0x5b5a4e, roughness: 0.95, name: "Lake stones" });
  let seed = 9173;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.92, x = WATER.x + Math.cos(a) * WATER.radiusX * r, z = WATER.z + Math.sin(a) * WATER.radiusZ * r;
    const size = 0.12 + rnd() * rnd() * 0.5, rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), stone);
    rock.position.set(x, -WATER.depth * Math.pow(Math.max(0, 1 - r * r), 0.7) + bump(x, z) * (1 - r) + size * 0.2, z);
    rock.scale.set(1, 0.55 + rnd() * 0.4, 0.8 + rnd() * 0.4);
    rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    group.add(rock);
  }
  // The surface from below: only its underside is drawn (the lake above draws the top).
  const surfaceTime = { value: 0 };
  const underside = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSky: { value: new THREE.Color(0xbfe0e8) }, uDeep: { value: new THREE.Color(0x0f2e2c) }, uLight: { value: 1 } }]),
      vertexShader: `varying vec3 vWorld;
#include <fog_pars_vertex>
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
      fragmentShader: `uniform float uTime, uLight; uniform vec3 uSky, uDeep; varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  vec3 v = normalize(vWorld - cameraPosition);
  vec2 p = vWorld.xz;
  float ripple = sin(p.x * 2.1 + uTime * 1.3 + sin(p.y * 1.7)) * 0.5 + sin(p.y * 2.9 - uTime * 1.7 + sin(p.x * 2.3)) * 0.5;
  // Snell's window: looking up within ~49 degrees of overhead the sky shows, wobbling with the ripples.
  float up = v.y + ripple * 0.035;
  float window = smoothstep(0.62, 0.7, up);
  vec3 sky = uSky * (1.1 + 0.25 * ripple) * uLight;
  vec3 mirror = uDeep * (1.0 + 0.35 * ripple) * uLight;
  vec3 color = mix(mirror, sky, window) + vec3(0.9, 1.0, 0.95) * uLight * smoothstep(0.035, 0.0, abs(up - 0.66)) * 0.35;
  gl_FragColor = vec4(color, 1.0);
#include <fog_fragment>
}`,
      side: THREE.BackSide,
      fog: true,
    }),
  );
  underside.name = "Lake surface from below";
  underside.rotation.x = -Math.PI / 2;
  underside.scale.set(WATER.radiusX, WATER.radiusZ, 1);
  // Below the park's ground layers, which run on under the lake: the lawn is a
  // 20 cm slab down to y -0.25 whose underside would otherwise hide the surface from below.
  underside.position.set(WATER.x, UNDERSIDE, WATER.z);
  group.add(underside);
  scene.add(group);
  const uniforms = (underside.material as THREE.ShaderMaterial).uniforms;
  return {
    group,
    /** Moves the ripples and caustics on; `sky` and `light` tint the window to the day. */
    update(dt: number, sky?: THREE.Color, light = 1) {
      time.value += dt;
      surfaceTime.value += dt;
      uniforms.uTime.value = surfaceTime.value;
      uniforms.uLight.value = light;
      if (sky) uniforms.uSky.value.copy(sky);
    },
  };
}

/** The eye under water: fog, tint, motes and bubbles, and a muffle for the sound. */
export class Underwater {
  /** The camera is under the surface now. */
  under = false;
  private overlay = document.createElement("div");
  private saved: { near: number; far: number; color: THREE.Color } | null = null;
  private motes: THREE.Points;
  private bubbles: THREE.Points;
  private bubbleSpeed: Float32Array;
  private water = new THREE.Color(0x1d4a44);
  onChange: (under: boolean) => void = () => {};

  constructor(private scene: THREE.Scene) {
    this.overlay.className = "underwater-tint";
    Object.assign(this.overlay.style, {
      position: "fixed", inset: "0", pointerEvents: "none", zIndex: "3", opacity: "0", transition: "opacity .18s",
      background: "radial-gradient(ellipse at 50% 18%, rgba(120,200,190,.16), rgba(10,52,48,.34) 62%, rgba(2,20,22,.62) 100%)",
    });
    document.body.append(this.overlay);
    // Motes: fine silt hanging in the water around the eye.
    const n = 260, motes = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) motes.set([(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8], i * 3);
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(motes, 3));
    this.motes = new THREE.Points(moteGeometry, new THREE.PointsMaterial({ color: 0xb8d6c4, size: 0.018, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    // Bubbles: a few wobbling up past the face.
    const b = 40, bubbles = new Float32Array(b * 3);
    this.bubbleSpeed = new Float32Array(b);
    for (let i = 0; i < b; i++) { bubbles.set([(Math.random() - 0.5) * 1.2, -Math.random() * 1.5, (Math.random() - 0.5) * 1.2], i * 3); this.bubbleSpeed[i] = 0.35 + Math.random() * 0.5; }
    const bubbleGeometry = new THREE.BufferGeometry();
    bubbleGeometry.setAttribute("position", new THREE.BufferAttribute(bubbles, 3));
    this.bubbles = new THREE.Points(bubbleGeometry, new THREE.PointsMaterial({ color: 0xe6fbff, size: 0.03, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    for (const p of [this.motes, this.bubbles]) { p.frustumCulled = false; p.visible = false; p.name = "Underwater particles"; }
    scene.add(this.motes, this.bubbles);
  }

  /**
   * After the camera, daylight and weather have moved for the frame. `light`
   * is how bright the day is (0 night .. 1 noon). Only the outdoor lake has water.
   */
  update(camera: THREE.Camera, dt: number, light: number, lake = true) {
    const p = camera.position;
    // A little hysteresis so an eye right at the surface does not flicker in and out.
    const surface = UNDERSIDE + (this.under ? 0.015 : -0.015);
    const under = lake && inWater(p.x, p.z, 1) && p.y < surface;
    if (under !== this.under) { this.under = under; this.onChange(under); this.overlay.style.opacity = under ? "1" : "0"; }
    this.motes.visible = this.bubbles.visible = under;
    const fog = this.scene.fog;
    if (under && fog instanceof THREE.Fog) {
      this.saved ??= { near: fog.near, far: fog.far, color: fog.color.clone() };
      fog.near = 0.4;
      fog.far = 9;
      fog.color.copy(this.water).multiplyScalar(0.18 + 0.82 * light);
      this.motes.position.copy(p);
      this.motes.rotation.y += dt * 0.02;
      const pos = this.bubbles.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + this.bubbleSpeed[i] * dt;
        if (y > 0.6) y = -1.5;
        pos.setXYZ(i, pos.getX(i) + Math.sin(y * 9 + i) * dt * 0.05, y, pos.getZ(i));
      }
      pos.needsUpdate = true;
      this.bubbles.position.set(p.x, Math.min(p.y, WATER.surface - 0.6), p.z);
    } else if (this.saved && fog instanceof THREE.Fog) {
      // Weather and daylight set the fog every frame; this just leaves it as it was.
      fog.near = this.saved.near; fog.far = this.saved.far; fog.color.copy(this.saved.color);
      this.saved = null;
    }
  }

  dispose() {
    this.overlay.remove();
    for (const p of [this.motes, this.bubbles]) { p.removeFromParent(); p.geometry.dispose(); (p.material as THREE.Material).dispose(); }
  }
}
