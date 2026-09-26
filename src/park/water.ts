import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
/**
 * Veterans' water (#99, from the owner's aerial photo): north of the park,
 * past the open grass field, the long footprint-shaped lake runs east-west
 * with the Model Boat Pond south of its west half. Outlines are traced off the
 * photo at the district's scale (0.44 of real), in world metres round each
 * body's centre. Both are star-shaped from their centre, so a point's
 * normalised distance out to the bank (`lakeRho`) is its distance over the
 * bank's distance along the same bearing: 0 at the middle, 1 at the bank.
 */
export interface LakeBody { name: string; x: number; z: number; depth: number; outline: [number, number][] }
export const LAKES: LakeBody[] = [
  { name: "Veterans lake", x: 33.3, z: -297.3, depth: 2.5, outline: [[36.7, -19.5], [32.6, -20.3], [26.0, -19.5], [21.1, -17.0], [17.8, -14.6], [12.9, -13.3], [7.9, -12.9], [1.3, -12.5], [-6.9, -11.3], [-15.1, -10.4], [-23.3, -9.6], [-31.5, -9.2], [-39.8, -8.8], [-46.3, -7.6], [-50.0, -5.5], [-51.3, -1.4], [-51.3, 4.4], [-49.6, 9.3], [-46.3, 12.2], [-41.4, 13.0], [-31.5, 13.4], [-23.3, 13.8], [-15.1, 13.8], [-6.9, 13.4], [1.3, 12.6], [9.6, 12.2], [16.1, 12.6], [21.9, 13.8], [29.3, 14.9], [35.9, 14.6], [40.0, 12.6], [42.0, 8.5], [42.6, 1.9], [42.4, -6.3], [41.6, -13.7], [40.0, -17.8]] },
  { name: "Model Boat Pond", x: 11.1, z: -262.4, depth: 1.1, outline: [[21.5, -4.2], [21.9, -0.1], [20.3, 3.6], [16.2, 5.4], [10.4, 5.8], [4.7, 5.2], [-1.1, 6.0], [-9.3, 7.3], [-16.7, 7.3], [-20.4, 5.6], [-21.2, 1.5], [-19.2, -3.4], [-15.0, -6.3], [-9.3, -7.4], [-3.5, -6.6], [1.4, -4.1], [5.5, -3.8], [10.4, -6.3], [15.4, -7.9], [19.5, -7.1]] },
];
/** The main lake's centre and extent, the shared surface height and the deepest water. */
export const WATER = { x: LAKES[0].x, z: LAKES[0].z, radiusX: 47, radiusZ: 17.5, surface: 0.009, depth: 2.5 };

/** Bank distance by bearing, sampled finely and smoothed, per body. */
const BEARINGS = 256;
const bankRadii = LAKES.map((lake) => {
  const out = new Float32Array(BEARINGS), n = lake.outline.length;
  for (let j = 0; j < BEARINGS; j++) {
    const a = (j / BEARINGS) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const [ax, az] = lake.outline[i], [bx, bz] = lake.outline[(i + 1) % n], ex = bx - ax, ez = bz - az;
      const det = dz * ex - dx * ez; // the ray t·(dx, dz) meets the edge a + u·e
      if (Math.abs(det) < 1e-9) continue;
      const t = (ax * -ez + az * ex) / det, u = (dx * az - dz * ax) / det;
      if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    out[j] = best;
  }
  // A light circular smoothing takes the corners off the traced polygon.
  const smooth = new Float32Array(BEARINGS);
  for (let j = 0; j < BEARINGS; j++) { let sum = 0; for (let k = -3; k <= 3; k++) sum += out[(j + k + BEARINGS) % BEARINGS]; smooth[j] = sum / 7; }
  return smooth;
});
/** The distance from body `i`'s centre to its bank along bearing `a` (radians, from +x toward +z). */
export function bankRadius(i: number, a: number) {
  const r = bankRadii[i], f = (((a / (Math.PI * 2)) % 1) + 1) % 1 * BEARINGS, j = Math.floor(f), t = f - j;
  return r[j % BEARINGS] * (1 - t) + r[(j + 1) % BEARINGS] * t;
}
/** The nearest body to (x, z) by normalised distance: `rho` is 0 at its middle, 1 at its bank. */
export function lakeRho(x: number, z: number) {
  let body = 0, rho = Infinity;
  for (let i = 0; i < LAKES.length; i++) {
    const dx = x - LAKES[i].x, dz = z - LAKES[i].z, r = Math.hypot(dx, dz) / bankRadius(i, Math.atan2(dz, dx));
    if (r < rho) { rho = r; body = i; }
  }
  return { body, rho };
}
export function inWater(x: number, z: number, margin = 1) {
  return lakeRho(x, z).rho < margin;
}
/** Outward normal of the bank near (x, z) (the way `rho` grows), in the xz plane. */
export function shoreNormal(x: number, z: number) {
  const e = 0.25, r = (px: number, pz: number) => lakeRho(px, pz).rho;
  const nx = r(x + e, z) - r(x - e, z), nz = r(x, z + e) - r(x, z - e), l = Math.hypot(nx, nz) || 1;
  return { x: nx / l, z: nz / l };
}
export const bedBump = (x: number, z: number) => Math.sin(x * 0.9 + z * 0.35) * 0.08 + Math.sin(z * 0.53 - x * 0.4) * 0.1;
/** Floor depth at normalised distance `r` for a body `depth` deep. */
export const bowl = (depth: number, r: number) => -depth * Math.pow(Math.max(0, 1 - r * r), 0.7);
/** The lake bottom (underwater.ts draws it): a bowl 2.5 m deep at the middle (the pond 1.1 m), 0.34 m at the bank. */
export function lakeBed(x: number, z: number) {
  const { body, rho } = lakeRho(x, z), r = Math.min(1, rho);
  return Math.min(-0.34, bowl(LAKES[body].depth, r) + bedBump(x, z) * (1 - r));
}
/**
 * A body's disc as a polar mesh in world metres: `rings` rings out to the bank
 * along each bearing. Each vertex carries `rim` (its normalised distance out).
 * `y` gives each vertex's height; the triangles face up.
 */
export function lakeDisc(i: number, rings: number, segments: number, y: (x: number, z: number, r: number) => number) {
  const lake = LAKES[i], position: number[] = [], rim: number[] = [], index: number[] = [];
  position.push(lake.x, y(lake.x, lake.z, 0), lake.z); rim.push(0);
  for (let k = 1; k <= rings; k++) {
    const r = k / rings;
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2, R = bankRadius(i, a) * r, x = lake.x + Math.cos(a) * R, z = lake.z + Math.sin(a) * R;
      position.push(x, y(x, z, r), z); rim.push(r);
    }
  }
  // Bearings turn from +x toward +z, clockwise seen from above; these windings face up.
  for (let j = 0; j < segments; j++) index.push(0, 1 + ((j + 1) % segments), 1 + j);
  for (let k = 1; k < rings; k++) for (let j = 0; j < segments; j++) {
    const p = 1 + (k - 1) * segments + j, q = 1 + (k - 1) * segments + ((j + 1) % segments);
    index.push(p, q, p + segments, q, q + segments, p + segments);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("rim", new THREE.Float32BufferAttribute(rim, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
/** Every body's surface in one mesh (one draw, one shader), at height 0 in its own space. */
export function lakeSurfaceGeometry() {
  const parts = LAKES.map((_, i) => lakeDisc(i, 12, 128, () => 0));
  const position: number[] = [], rim: number[] = [], index: number[] = [];
  let base = 0;
  for (const g of parts) {
    position.push(...(g.getAttribute("position").array as Float32Array));
    rim.push(...(g.getAttribute("rim").array as Float32Array));
    for (const k of Array.from(g.getIndex()!.array)) index.push(k + base);
    base += g.getAttribute("position").count;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(position.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  g.setAttribute("rim", new THREE.Float32BufferAttribute(rim, 1));
  g.setIndex(index);
  return g;
}
/**
 * Where there is water, as a small mask texture over all the bodies (1 inside),
 * for effects that must stay on it (the splash rings).
 */
let mask: { texture: THREE.DataTexture; min: THREE.Vector2; size: THREE.Vector2 } | null = null;
export function lakeMask() {
  if (mask) return mask;
  const min = new THREE.Vector2(Infinity, Infinity), max = new THREE.Vector2(-Infinity, -Infinity);
  LAKES.forEach((l) => l.outline.forEach(([x, z]) => { min.min(new THREE.Vector2(l.x + x, l.z + z)); max.max(new THREE.Vector2(l.x + x, l.z + z)); }));
  min.subScalar(2); max.addScalar(2);
  const N = 256, data = new Uint8Array(N * N * 4), size = max.clone().sub(min);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = inWater(min.x + ((i + 0.5) / N) * size.x, min.y + ((j + 0.5) / N) * size.y, 0.97) ? 255 : 0;
    data.set([v, v, v, 255], (j * N + i) * 4);
  }
  const texture = new THREE.DataTexture(data, N, N);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return (mask = { texture, min, size });
}
/**
 * The lake's surface: a MeshStandardMaterial (so it keeps the scene's lights,
 * shadows and haze) with wind ripples as animated normals (crossing wave trains
 * plus a fine chop), clearer green shallows over a deep blue-green middle,
 * caustic shimmer near the bank, a moving foam line where it meets the edge,
 * and a reflection of the actual sky dome (zenith, horizon, sun glints) that
 * grows toward grazing angles. WaterEffects.update feeds it the time and sky.
 */
export function dressLake(lake: THREE.Mesh) {
  const material = new THREE.MeshStandardMaterial({ color: 0x1d4f57, roughness: 0.1, metalness: 0, polygonOffset: true, polygonOffsetUnits: -30, name: "Lake water" });
  material.customProgramCacheKey = () => "swf-lake-water-v3";
  lake.material = material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = { value: 0 };
    shader.uniforms.skyZenith = { value: new THREE.Color(0x6f9fd0) };
    shader.uniforms.skyHorizon = { value: new THREE.Color(0xd7e2e6) };
    shader.uniforms.sunDir = { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() };
    lake.userData.waterShader = shader;
    shader.vertexShader =
      "attribute float rim; varying vec2 waterUV; varying float waterRim;\n" +
      shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nwaterUV=position.xz; waterRim=rim;");
    shader.fragmentShader =
      `uniform float waterTime; uniform vec3 skyZenith; uniform vec3 skyHorizon; uniform vec3 sunDir; varying vec2 waterUV; varying float waterRim;
float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float waterNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(waterHash(i),waterHash(i+vec2(1,0)),f.x),mix(waterHash(i+vec2(0,1)),waterHash(i+vec2(1,1)),f.x),f.y);}
// Slope of the ripple height field at p (metres): four wind wave trains and two octaves of chop.
vec2 waterSlope(vec2 p,float t){
  vec2 g=vec2(0.0);
  vec2 d1=normalize(vec2(0.8,0.6)),d2=normalize(vec2(-0.5,0.9)),d3=normalize(vec2(0.2,-1.0)),d4=normalize(vec2(-0.9,-0.3));
  g+=d1*cos(dot(p,d1)*1.3+t*1.1)*0.12; g+=d2*cos(dot(p,d2)*2.7+t*1.8)*0.09;
  g+=d3*cos(dot(p,d3)*5.1+t*2.6)*0.06; g+=d4*cos(dot(p,d4)*9.7+t*3.5)*0.04;
  float e=0.08; vec2 q=p*2.6+vec2(t*0.35,-t*0.22), r=p*7.0+vec2(-t*0.6,t*0.4);
  g+=vec2(waterNoise(q+vec2(e,0.0))-waterNoise(q-vec2(e,0.0)),waterNoise(q+vec2(0.0,e))-waterNoise(q-vec2(0.0,e)))*0.34;
  g+=vec2(waterNoise(r+vec2(e,0.0))-waterNoise(r-vec2(e,0.0)),waterNoise(r+vec2(0.0,e))-waterNoise(r-vec2(0.0,e)))*0.16;
  return g;
}
` +
      shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
vec2 wp=waterUV;
float edge=waterRim;
float shallowness=smoothstep(0.5,1.0,edge);
vec3 shallow=vec3(0.22,0.44,0.38),deep=vec3(0.05,0.17,0.21);
diffuseColor.rgb=mix(deep,shallow,shallowness);
// Caustic shimmer where light reaches the bottom near the bank.
float c1=sin(wp.x*1.9+waterTime*1.1+sin(wp.y*1.3))+sin(wp.y*2.3-waterTime*0.9+sin(wp.x*1.7))+sin((wp.x+wp.y)*1.5+waterTime*0.7);
diffuseColor.rgb+=vec3(0.10,0.15,0.11)*pow(abs(c1)/3.0,3.0)*shallowness*1.6;
// Ripple texture in the colour itself, lit crests and shaded troughs, so the
// wind on the water reads from above too, where the sky reflection is weak.
vec2 ripple=waterSlope(wp,waterTime);
diffuseColor.rgb*=1.0+clamp(dot(ripple,vec2(1.1,-0.8)),-0.45,0.45)*0.85;
float foam=smoothstep(0.955,0.99,edge)*(0.55+0.45*waterNoise(wp*2.2+vec2(waterTime*0.6,waterTime*0.3)));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.86,0.9,0.86),foam*0.75);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
{ vec2 s=waterSlope(waterUV,waterTime)*0.75*(1.0-0.7*smoothstep(0.95,1.0,waterRim));
  // The surface is built flat in world x/z, so the height field's world normal is (-dh/dx, 1, -dh/dz).
  normal=normalize((viewMatrix*vec4(-s.x,1.0,-s.y,0.0)).xyz); }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
{ vec3 I=-normalize(vViewPosition);
  vec3 R=reflect(I,normal);
  vec3 Rw=normalize((vec4(R,0.0)*viewMatrix).xyz);
  float fres=0.02+0.98*pow(1.0-max(0.0,dot(normal,-I)),5.0);
  vec3 sky=mix(skyHorizon,skyZenith,pow(clamp(Rw.y,0.0,1.0),0.55));
  totalEmissiveRadiance+=sky*(0.04+fres*0.7);
  float glint=pow(max(dot(Rw,normalize(sunDir)),0.0),700.0)*step(0.0,sunDir.y);
  totalEmissiveRadiance+=vec3(1.0,0.95,0.84)*glint*3.5; }`,
        );
  };
  return material;
}

/**
 * A slim poured-concrete edge round the lake, flush with the ground: it
 * separates the grass from the water so the shoreline reads at a glance, with a
 * darker damp strip right at the waterline.
 */
export function buildShoreline(scene: THREE.Scene, material: THREE.Material) {
  const segments = 220, width = 0.7, damp = 0.14;
  // One band per body, `from`..`to` metres out from its bank (outward along the bank's normal).
  const band = (body: number, from: number, to: number, y: number, uvScale: number) => {
    const lake = LAKES[body], edges: THREE.Vector2[] = [];
    for (let i = 0; i < segments; i++) { const a = (i / segments) * Math.PI * 2, R = bankRadius(body, a); edges.push(new THREE.Vector2(lake.x + Math.cos(a) * R, lake.z + Math.sin(a) * R)); }
    const p: number[] = [], uv: number[] = [], index: number[] = [];
    let along = 0;
    for (let i = 0; i <= segments; i++) {
      const edge = edges[i % segments], prev = edges[(i - 1 + segments) % segments], next = edges[(i + 1) % segments];
      // Outward: the bank's tangent turned a quarter (bearings run clockwise seen from above).
      const t = next.clone().sub(prev).normalize(), n = new THREE.Vector2(t.y, -t.x);
      if (i) along += edge.distanceTo(prev);
      for (const off of [from, to]) {
        p.push(edge.x + n.x * off, y, edge.y + n.y * off);
        uv.push(along / uvScale, (off - from) / uvScale);
      }
      if (i < segments) { const k = i * 2; index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } // Wound to face up.
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(p.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
    g.setIndex(index);
    return g;
  };
  const merged = (from: number, to: number, y: number, uvScale: number) => mergeGeometries(LAKES.map((_, i) => band(i, from, to, y, uvScale)));
  const edge = new THREE.Mesh(merged(-0.02, width, 0.02, 2.4), material);
  edge.name = "Lake shoreline edge";
  edge.receiveShadow = true;
  scene.add(edge);
  const wet = new THREE.Mesh(merged(-0.02, damp, 0.021, 2.4), new THREE.MeshStandardMaterial({ color: 0x2f3634, transparent: true, opacity: 0.35, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetUnits: -44, name: "Damp waterline" }));
  wet.name = "Lake waterline";
  wet.renderOrder = 1;
  scene.add(wet);
  return { edge, band };
}

/** A soft round droplet: white core fading to clear, shared by every spray sprite. */
let dropTexture: THREE.CanvasTexture | null = null;
function droplet() {
  if (dropTexture) return dropTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,0.95)");
  r.addColorStop(0.45, "rgba(236,248,250,0.6)");
  r.addColorStop(1, "rgba(220,240,245,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  dropTexture = new THREE.CanvasTexture(c);
  dropTexture.colorSpace = THREE.SRGBColorSpace;
  return dropTexture;
}

/**
 * Lake effects: a spray of soft droplets and expanding ripple rings when
 * something hits the water, and a steady wake of rings round a swimmer so the
 * swim reads from the gameplay camera even with only the head above water.
 */
export class WaterEffects {
  particles: { sprite: THREE.Sprite; velocity: THREE.Vector3; age: number; life: number; size: number }[] = [];
  rings: { mesh: THREE.Mesh; age: number; life: number; size: number }[] = [];
  private spray = new THREE.SpriteMaterial({ map: droplet(), transparent: true, depthWrite: false, color: 0xeef9fb });
  private ringGeometry = new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2);
  private wakeTimer = 0;
  constructor(public scene: THREE.Scene) {}
  splash(x: number, z: number) {
    for (let i = 0; i < 36; i++) {
      const a = (i * Math.PI * 2) / 36 + (i % 5) * 0.21,
        out = 0.8 + (i % 3) * 0.7 + (i % 7) * 0.12,
        sprite = new THREE.Sprite(this.spray),
        size = 0.14 + (i % 4) * 0.05;
      sprite.position.set(x + Math.cos(a) * 0.15, WATER.surface + 0.1, z + Math.sin(a) * 0.15);
      sprite.scale.setScalar(size);
      this.scene.add(sprite);
      this.particles.push({ sprite, velocity: new THREE.Vector3(Math.cos(a) * out, 2.2 + (i % 4) * 0.55, Math.sin(a) * out), age: 0, life: 0.9 + (i % 5) * 0.08, size });
    }
    this.ring(x, z, 0.35, 1.6, 0.8);
    this.ring(x, z, 0.2, 2.1, 1.1);
  }
  /** One ripple ring on the surface, growing from `from` to `to` metres over `life` seconds. */
  ring(x: number, z: number, from: number, life: number, to = 1) {
    const material = new THREE.MeshBasicMaterial({ color: 0xe8f6f4, transparent: true, opacity: 0.45, depthWrite: false });
    // Rings live on the water only: clipped to the lake's outline where a splash meets the bank.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = "varying vec2 ringWorld;\n" + shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nringWorld = (modelMatrix * vec4(transformed, 1.0)).xz;");
      const m = lakeMask(), e = (n: number) => n.toFixed(2);
      shader.uniforms.lakeMask = { value: m.texture };
      shader.fragmentShader = "uniform sampler2D lakeMask; varying vec2 ringWorld;\n" + shader.fragmentShader.replace("void main() {", `void main() {
  vec2 lakeUV = (ringWorld - vec2(${e(m.min.x)}, ${e(m.min.y)})) / vec2(${e(m.size.x)}, ${e(m.size.y)});
  if (texture2D(lakeMask, lakeUV).r < 0.5) discard;`);
    };
    material.customProgramCacheKey = () => "lake-ring";
    const mesh = new THREE.Mesh(this.ringGeometry, material);
    mesh.position.set(x, WATER.surface + 0.012, z);
    mesh.scale.setScalar(from);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.rings.push({ mesh, age: 0, life, size: to * 2.2 });
  }
  /** Feed a swimmer each frame: rings pulse off them, faster while stroking. */
  swimmer(x: number, z: number, stroking: boolean, dt: number) {
    this.wakeTimer -= dt;
    if (this.wakeTimer > 0) return;
    this.wakeTimer = stroking ? 0.42 : 1.1;
    this.ring(x, z, 0.35, stroking ? 1.4 : 1.8, stroking ? 0.75 : 0.6);
  }
  update(dt: number, time: number) {
    const root = this.scene.getObjectByName("lake-water");
    const lake = (root instanceof THREE.Mesh ? root : root?.getObjectByProperty("type", "Mesh")) as THREE.Mesh | undefined;
    if (lake) {
      const shader = lake.userData.waterShader as { uniforms: Record<string, { value: any }> } | undefined;
      if (shader) {
        shader.uniforms.waterTime.value = time;
        const dome = this.scene.userData.sky as { uniforms: { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color } }; sunDirection: THREE.Vector3 } | undefined;
        if (dome && shader.uniforms.skyZenith) {
          shader.uniforms.skyZenith.value.copy(dome.uniforms.uZenith.value);
          shader.uniforms.skyHorizon.value.copy(dome.uniforms.uHorizon.value);
          shader.uniforms.sunDir.value.copy(dome.sunDirection);
        }
      }
      lake.position.y = 0.009 + Math.sin(time) * 0.004;
    }
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      p.velocity.y -= 7 * dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      const t = p.age / p.life;
      // Droplets swell a little as they spread, then shrink away; any that fall back through the surface are gone.
      p.sprite.scale.setScalar(p.size * (1 + t * 0.8) * Math.max(0, 1 - t * t));
      if (p.age > p.life || p.sprite.position.y < WATER.surface) {
        this.scene.remove(p.sprite);
        return false;
      }
      return true;
    });
    this.rings = this.rings.filter((r) => {
      r.age += dt;
      const t = r.age / r.life;
      r.mesh.scale.setScalar(THREE.MathUtils.lerp(r.mesh.scale.x, r.size, Math.min(1, dt * 2.2)));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - t) * (1 - t);
      if (t >= 1) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }
}
