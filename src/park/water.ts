import * as THREE from "three";
export const WATER = {
  x: -97,
  z: 5,
  radiusX: 10,
  radiusZ: 30,
  surface: 0.009,
  depth: 2.5,
};
export function inWater(x: number, z: number, margin = 1) {
  return (
    ((x - WATER.x) / WATER.radiusX) ** 2 +
      ((z - WATER.z) / WATER.radiusZ) ** 2 <
    margin * margin
  );
}
export const bedBump = (x: number, z: number) => Math.sin(x * 0.9 + z * 0.35) * 0.08 + Math.sin(z * 0.53 - x * 0.4) * 0.1;
/** The lake bottom (underwater.ts draws it): a bowl 2.5 m deep at the middle, 0.34 m at the bank. */
export function lakeBed(x: number, z: number) {
  const r = Math.min(1, Math.hypot((x - WATER.x) / WATER.radiusX, (z - WATER.z) / WATER.radiusZ));
  return Math.min(-0.34, -WATER.depth * Math.pow(Math.max(0, 1 - r * r), 0.7) + bedBump(x, z) * (1 - r));
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
  material.customProgramCacheKey = () => "swf-lake-water-v2";
  lake.material = material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = { value: 0 };
    shader.uniforms.skyZenith = { value: new THREE.Color(0x6f9fd0) };
    shader.uniforms.skyHorizon = { value: new THREE.Color(0xd7e2e6) };
    shader.uniforms.sunDir = { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() };
    lake.userData.waterShader = shader;
    shader.vertexShader =
      "varying vec2 waterUV;\n" +
      shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nwaterUV=position.xy;");
    shader.fragmentShader =
      `uniform float waterTime; uniform vec3 skyZenith; uniform vec3 skyHorizon; uniform vec3 sunDir; varying vec2 waterUV;
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
vec2 wp=waterUV*vec2(${WATER.radiusX.toFixed(1)},${WATER.radiusZ.toFixed(1)});
float edge=length(waterUV);
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
{ vec2 s=waterSlope(waterUV*vec2(${WATER.radiusX.toFixed(1)},${WATER.radiusZ.toFixed(1)}),waterTime)*0.75*(1.0-0.7*smoothstep(0.95,1.0,length(waterUV)));
  // The disc is turned flat (-90 degrees about x): local y runs along world -z,
  // so the height field's world normal is (-dh/dx, 1, dh/dy_local).
  normal=normalize((viewMatrix*vec4(-s.x,1.0,s.y,0.0)).xyz); }`,
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
  const segments = 180, width = 0.7, damp = 0.14;
  const ring = (from: number, to: number, y: number, uvScale: number) => {
    const p: number[] = [], uv: number[] = [], index: number[] = [];
    let along = 0, last: THREE.Vector2 | null = null;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const edge = new THREE.Vector2(WATER.x + WATER.radiusX * c, WATER.z + WATER.radiusZ * s);
      const n = new THREE.Vector2(c / WATER.radiusX, s / WATER.radiusZ).normalize();
      if (last) along += edge.distanceTo(last);
      last = edge;
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
  const edge = new THREE.Mesh(ring(-0.02, width, 0.02, 2.4), material);
  edge.name = "Lake shoreline edge";
  edge.receiveShadow = true;
  scene.add(edge);
  const wet = new THREE.Mesh(ring(-0.02, damp, 0.021, 2.4), new THREE.MeshStandardMaterial({ color: 0x2f3634, transparent: true, opacity: 0.35, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetUnits: -44, name: "Damp waterline" }));
  wet.name = "Lake waterline";
  wet.renderOrder = 1;
  scene.add(wet);
  return edge;
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
      const e = (n: number) => n.toFixed(2);
      shader.fragmentShader = "varying vec2 ringWorld;\n" + shader.fragmentShader.replace("void main() {", `void main() {
  vec2 lakeUV = (ringWorld - vec2(${e(WATER.x)}, ${e(WATER.z)})) / vec2(${e(WATER.radiusX)}, ${e(WATER.radiusZ)});
  if (dot(lakeUV, lakeUV) > 0.94) discard;`);
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
