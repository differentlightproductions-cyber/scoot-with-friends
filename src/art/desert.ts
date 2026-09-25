// The Mojave around Boulder City: an open desert floor that runs out from the
// edge of a map to rugged volcanic ranges on every side (the River Mountains
// and the Eldorado range), fading into the dusty horizon haze.
import * as THREE from "three";
import { mulberry, Noise2 } from "./noise";
import { boulder, bursage, creosote, grassTuft, plant, yucca, type Placement, type PlantModel } from "./flora";
import { desertGround, gravelTexture, scrubTexture } from "./textures";

export interface DesertOptions {
  /** Centre of the world the desert surrounds. */
  center: THREE.Vector2;
  /** Height of the desert floor at the map's edge. */
  base: number;
  /** Inside this footprint the floor stays below `base` (the map is there). */
  keepOut: (x: number, z: number) => number;
  /** Radius where the floor starts rising into the ranges. */
  rangeStart: number;
  /**
   * A rectangular map's landscaped border: a band of rock (about `width`
   * metres, wandering) laid around a lawn centred on x/z, half-size `halfX` by `halfZ`.
   */
  apron?: { x: number; z: number; halfX: number; halfZ: number; width: number };
  seed?: number;
}

/** Desert floor height outside a map: flat by the map, rolling beyond, climbing into the mountains. */
export function desertHeightFunction(o: DesertOptions) {
  const noise = new Noise2(o.seed ?? 4242);
  return (x: number, z: number) => {
    const out = o.keepOut(x, z);
    const dx = x - o.center.x, dz = z - o.center.y, r = Math.hypot(dx, dz), angle = Math.atan2(dz, dx);
    // Gentle swales and washes away from the map.
    const roll = noise.fbm(x * 0.006, z * 0.006, 4) * 3.2 + noise.fbm(x * 0.03, z * 0.03, 3) * 0.5;
    let h = o.base - 0.12 + THREE.MathUtils.smoothstep(out, 0, 60) * (roll + out * 0.012);
    // The ranges: height varies around the horizon so some directions open onto
    // lower country and others rise into big rugged ridges.
    const t = THREE.MathUtils.smoothstep(r, o.rangeStart, o.rangeStart + 420);
    if (t > 0) {
      const envelope = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(angle * 2 + 0.7)) * (0.7 + 0.3 * Math.sin(angle * 5 + 2.1));
      const crest = noise.ridged(x * 0.0022 + 11, z * 0.0022 - 7, 6);
      const body = noise.fbm(x * 0.0011 - 3, z * 0.0011 + 5, 3) * 0.5 + 0.5;
      // Bajada: a long smooth apron of alluvium before the rock rises.
      h += t * t * (40 + envelope * (160 + 330 * crest * body));
    }
    return h;
  };
}

export interface Apron { x: number; z: number; halfX: number; halfZ: number; width: number }

/**
 * The desert ground material: vertex colour is the albedo, a pebble texture
 * adds detail near the camera, far scrub dots take over in the distance,
 * distant ground fades into the horizon haze, and an optional rock apron is
 * laid around a lawn. Geometry needs `uv` (world x/z / 5) and `relief`
 * (height above the local floor, which thins the scrub dots on high rock).
 */
export function desertMaterial(apronOption?: Apron) {
  const { map, bump } = desertGround();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map, bumpMap: bump, bumpScale: 0.012, roughness: 0.97, name: "Mojave desert floor" });
  const scrub = scrubTexture(), gravel = gravelTexture();
  const apron = apronOption ?? { x: 0, z: 0, halfX: 0, halfZ: 0, width: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.scrubMap = { value: scrub };
    shader.uniforms.gravelMap = { value: gravel };
    shader.uniforms.apron = { value: new THREE.Vector4(apron.x, apron.z, apron.halfX, apron.halfZ) };
    shader.uniforms.apronWidth = { value: apron.width };
    shader.vertexShader = "attribute float relief;\nvarying vec3 vDesertWorld;\nvarying float vRelief;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vDesertWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vRelief = relief;`);
    shader.fragmentShader = "uniform sampler2D scrubMap, gravelMap;\nuniform vec4 apron;\nuniform float apronWidth;\nvarying vec3 vDesertWorld;\nvarying float vRelief;\n" + shader.fragmentShader;
    // Break up the tile at two scales, and fade the texture out with distance
    // so far country reads as smooth colour instead of shimmering pebbles.
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
      vec4 nearTex = texture2D(map, vMapUv);
      vec4 farTex = texture2D(map, vMapUv * 0.137 + 0.31);
      float dist = length(vViewPosition);
      // The texture only modulates around 1.0 (detail); vertex colour is the albedo.
      vec4 detail = nearTex / vec4(0.5, 0.36, 0.2, 1.0) * mix(vec4(1.0), farTex / vec4(0.5, 0.36, 0.2, 1.0), 0.3);
      vec4 texelColor = mix(detail, vec4(1.0), smoothstep(60.0, 420.0, dist));
      // Far scrub dots take over where individual bushes are no longer drawn,
      // thinning on the high rock of the ranges.
      float scrubAmount = smoothstep(90.0, 260.0, dist) * (1.0 - 0.55 * smoothstep(25.0, 140.0, vRelief));
      texelColor *= mix(vec4(1.0), texture2D(scrubMap, vMapUv * (5.0 / 96.0)), scrubAmount);
      // The landscaped rock border around a lawn, with a wandering soft edge.
      if (apronWidth > 0.0) {
        vec2 q = abs(vDesertWorld.xz - apron.xy) - apron.zw;
        float d = length(max(q, 0.0));
        float reach = apronWidth * (0.85 + 0.3 * sin(vDesertWorld.x * 0.061) + 0.24 * sin(vDesertWorld.z * 0.097 + 1.3) + 0.12 * sin((vDesertWorld.x + vDesertWorld.z) * 0.27));
        float rock = 1.0 - smoothstep(reach - 1.2, reach + 0.4, d + (texture2D(scrubMap, vDesertWorld.xz * 0.07).r - 0.8) * 3.0);
        vec4 stones = texture2D(gravelMap, vDesertWorld.xz * 0.55) * vec4(1.8, 1.9, 2.3, 1.0);
        texelColor = mix(texelColor, stones, rock);
      }
      diffuseColor *= texelColor;`);
    // Distant ranges keep their shape through the haze instead of vanishing
    // at the fog's far distance: exponential haze toward the horizon colour.
    shader.fragmentShader = shader.fragmentShader.replace("#include <fog_fragment>", `
      #ifdef USE_FOG
        float haze = 1.0 - exp(-max(vFogDepth - fogNear, 0.0) * 0.00055);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(haze, 0.0, 0.72));
      #endif`);
  };
  material.customProgramCacheKey = () => "mojave-desert";
  return material;
}

/**
 * Colours a desert vertex: sandy floor patched pink and grey; rock bands,
 * dark varnish on the crests and rusty slopes where the ground stands high
 * above its local floor (`relief`); steep ground darkens.
 */
function desertColor(noise: Noise2, x: number, y: number, z: number, relief: number, slope: number, c: THREE.Color) {
  const patch = noise.fbm(x * 0.01, z * 0.01, 3);
  c.copy(SAND).lerp(patch > 0 ? PINK : GREY, Math.abs(patch) * 0.9);
  const rock = THREE.MathUtils.smoothstep(relief, 8, 90);
  if (rock > 0) {
    const band = 0.5 + 0.5 * Math.sin(y * 0.045 + noise.simplex(x * 0.004, z * 0.004) * 3);
    const rockColor = scratch.copy(TAN).lerp(RUST, band * 0.8).lerp(VARNISH, THREE.MathUtils.smoothstep(slope, 0.3, 0.9) * 0.8);
    c.lerp(rockColor, rock);
  }
  return c.lerp(DARK, slope * 0.25);
}
const SAND = new THREE.Color(0xc9ae88), PINK = new THREE.Color(0xc4a08a), GREY = new THREE.Color(0xb0a594);
const VARNISH = new THREE.Color(0x5b4436), RUST = new THREE.Color(0x8c5a3e), TAN = new THREE.Color(0xa88a66), DARK = new THREE.Color(0x3f332d);
const scratch = new THREE.Color();

/**
 * Builds desert ground as a polar grid around `center` (dense near the middle,
 * coarse far out) out to `radius`. `height` gives the ground; `floor` is the
 * local floor height used to decide what counts as high rock (default: base).
 */
export function buildTerrain(scene: THREE.Scene, o: { center: THREE.Vector2; height: (x: number, z: number) => number; base: number; floor?: (x: number, z: number) => number; radius?: number; inner?: number; apron?: Apron; seed?: number; name: string }) {
  const noise = new Noise2((o.seed ?? 4242) + 1), floor = o.floor ?? (() => o.base), radius = o.radius ?? 1560, inner = o.inner ?? 250;
  const rings: number[] = [];
  for (let r = 0; r < radius;) { rings.push(r); r += r < inner ? 6 : r < inner + 450 ? 14 : r < inner + 950 ? 22 : 40; }
  const segments = 360;
  const heights = new Float32Array(rings.length * segments), p: number[] = [], idx: number[] = [];
  rings.forEach((r, i) => {
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const x = o.center.x + Math.cos(a) * Math.max(r, 0.01), z = o.center.y + Math.sin(a) * Math.max(r, 0.01);
      const y = o.height(x, z);
      heights[i * segments + s] = y;
      p.push(x, y, z);
    }
  });
  for (let i = 0; i < rings.length - 1; i++)
    for (let s = 0; s < segments; s++) {
      const a = i * segments + s, b = i * segments + ((s + 1) % segments), d = a + segments, e = b + segments;
      idx.push(a, b, d, b, e, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  paintDesert(g, floor, (o.seed ?? 4242) + 1);
  const mesh = new THREE.Mesh(g, desertMaterial(o.apron));
  mesh.name = o.name;
  mesh.receiveShadow = true;
  scene.add(mesh);
  /** The mesh's own surface height (what is drawn), for setting things on it. */
  const surface = (x: number, z: number) => {
    const dx = x - o.center.x, dz = z - o.center.y, r = Math.hypot(dx, dz);
    let i = 0;
    while (i < rings.length - 2 && rings[i + 1] <= r) i++;
    const fr = THREE.MathUtils.clamp((r - rings[i]) / (rings[i + 1] - rings[i]), 0, 1);
    const at = ((Math.atan2(dz, dx) / (Math.PI * 2)) * segments + segments) % segments, s = Math.floor(at) % segments, fs = at - Math.floor(at);
    const A = heights[i * segments + s], B = heights[i * segments + ((s + 1) % segments)], D = heights[(i + 1) * segments + s], E = heights[(i + 1) * segments + ((s + 1) % segments)];
    return fs + fr <= 1 ? A + (B - A) * fs + (D - A) * fr : E + (D - E) * (1 - fs) + (B - E) * (1 - fr);
  };
  return { mesh, surface };
}

/**
 * Colours and attributes for ground built elsewhere (a road's hillside) so it
 * can wear the desert material: adds `color`, `relief` and world `uv`.
 */
export function paintDesert(g: THREE.BufferGeometry, floor: (x: number, z: number) => number, seed = 4243) {
  const noise = new Noise2(seed), pos = g.getAttribute("position"), normal = g.getAttribute("normal");
  const col: number[] = [], rel: number[] = [], uv: number[] = [], c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const slope = normal ? Math.min(1, Math.sqrt(Math.max(0, 1 - normal.getY(i) ** 2)) / Math.max(0.2, normal.getY(i)) * 1.4) : 0;
    const relief = y - floor(x, z);
    desertColor(noise, x, y, z, relief, slope, c);
    col.push(c.r, c.g, c.b); rel.push(relief); uv.push(x / 5, z / 5);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("relief", new THREE.Float32BufferAttribute(rel, 1));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Builds the desert floor and the ranges around a map. */
export function buildDesert(scene: THREE.Scene, o: DesertOptions) {
  const height = desertHeightFunction(o);
  const { mesh, surface } = buildTerrain(scene, { center: o.center, height, base: o.base, apron: o.apron, seed: o.seed, name: "Desert floor and ranges" });
  return { mesh, height, surface };
}

export interface ScatterKind { name: string; models: PlantModel[]; placements: Placement[][]; solid: boolean }

/**
 * Scatters desert plants and rocks between `near` and `far` metres outside a
 * map (`keepOut` distance), in natural clumps: creosote spaced out as it grows
 * in the wild, bursage and grass filling between, boulders and the odd yucca.
 * `ground` gives the height to set them on. A map with its own shape passes
 * `sample` to propose candidate points instead of the rings around `center`.
 * Returns what was planted (by kind and model) so callers can add colliders.
 */
export function scatterDesert(scene: THREE.Scene, o: { keepOut: (x: number, z: number) => number; ground: (x: number, z: number) => number; center: THREE.Vector2; near: number; far: number; count: number; seed?: number; avoid?: (x: number, z: number) => boolean; sample?: (random: () => number) => [number, number]; shadowRange?: number }) {
  const random = mulberry(o.seed ?? 99), noise = new Noise2((o.seed ?? 99) + 3);
  const kinds: { name: string; share: number; models: PlantModel[]; scale: [number, number]; sink: number; solid: boolean }[] = [
    { name: "creosote", share: 0.38, models: [1, 2, 3, 4].map(creosote), scale: [0.7, 1.35], sink: 0.02, solid: false },
    { name: "bursage", share: 0.26, models: [4, 5, 6].map(bursage), scale: [0.7, 1.3], sink: 0.03, solid: false },
    { name: "grass", share: 0.22, models: [1, 2, 3].map(grassTuft), scale: [0.8, 1.4], sink: 0, solid: false },
    { name: "boulders", share: 0.1, models: [11, 12, 13].map(boulder), scale: [0.3, 1.6], sink: 0.15, solid: true },
    { name: "yucca", share: 0.04, models: [5, 6].map(yucca), scale: [0.8, 1.3], sink: 0.02, solid: true },
  ];
  const lists = kinds.map((k) => k.models.map(() => [] as Placement[]));
  // Plants further out than the sun's shadow box ever reaches from where a
  // rider can be cast no shadow: they are drawn once a frame, not twice.
  const shadowRange = o.shadowRange ?? 30, farLists = kinds.map((k) => k.models.map(() => [] as Placement[]));
  let placed = 0, tries = 0;
  while (placed < o.count && tries < o.count * 30) {
    tries++;
    let x: number, z: number;
    if (o.sample) [x, z] = o.sample(random);
    else {
      const a = random() * Math.PI * 2, r = o.near + 30 + random() * (o.far + 120);
      x = o.center.x + Math.cos(a) * r; z = o.center.y + Math.sin(a) * r;
    }
    const out = o.keepOut(x, z);
    if (out < o.near || out > o.far || o.avoid?.(x, z)) continue;
    // Clumpy density, and thinner further out (the far ground carries scrub dots).
    const density = 0.55 + 0.45 * noise.fbm(x * 0.02, z * 0.02, 3);
    if (random() > density * (1 - 0.6 * (out - o.near) / (o.far - o.near))) continue;
    let pick = random(), k = 0;
    while (k < kinds.length - 1 && pick > kinds[k].share) { pick -= kinds[k].share; k++; }
    const kind = kinds[k], m = Math.floor(random() * kind.models.length);
    const scale = kind.scale[0] + random() * (kind.scale[1] - kind.scale[0]);
    (out - o.near > shadowRange ? farLists : lists)[k][m].push({ x, y: o.ground(x, z) - kind.sink * scale, z, scale, yaw: random() * Math.PI * 2 });
    placed++;
  }
  kinds.forEach((kind, k) => kind.models.forEach((model, m) => {
    if (lists[k][m].length) plant(scene, model, lists[k][m], "desert " + kind.name, true);
    if (farLists[k][m].length) for (const mesh of plant(scene, model, farLists[k][m], "desert " + kind.name + " (far)", true)) mesh.castShadow = false;
  }));
  return kinds.map((kind, k): ScatterKind => ({ name: kind.name, models: kind.models, placements: lists[k].map((near, m) => near.concat(farLists[k][m])), solid: kind.solid }));
}
