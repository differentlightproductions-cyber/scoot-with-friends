import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Gutters and storm drains (#87). Each gutter is a flowline along a curb (or
 * a rolled gutter) with the storm drain inlets on it. What happens in them
 * follows the water:
 *
 * - Rain runs off the street into the gutter and down it. How far the water
 *   spreads from the curb and how fast it runs come from the flow reaching
 *   each point (Manning's equation for a triangular gutter: spread grows with
 *   flow to the 3/8 power, speed to the 1/4), so it widens along a run, pours
 *   into each inlet, and a steep street carries it narrow and fast. An inlet
 *   on a grade lets some flow run past to the next; one in a sag takes it all.
 * - Leaves fall into the gutters in autumn and lie along the curb. Rain washes
 *   them downstream to the inlets, where some go down and the rest pile on the
 *   grate and hold water back into a pond around it.
 * - Snow piles into a bank along the curb. Traffic packs it and melt runs off
 *   it by day and freezes again by night, so the gutter beside the curb turns
 *   to ice that outlasts the snow, and ice is slippery (Simulation).
 */
export interface GutterLine {
  /** Points along the flowline, about a metre apart (world, y on the ground). */
  points: THREE.Vector3[];
  /** Per point: the unit direction (x, z) from the curb across the gutter into the street. */
  across: [number, number][];
  /** Paved width (m) that drains into this gutter. */
  catchment: number;
  /** Indices of points with a storm drain inlet. */
  inlets: number[];
  /** Designed flowline elevation per point, for which way it runs (defaults to the points' height). */
  grade?: number[];
  /** Curb face above the flowline (0 for a rolled gutter). */
  face: number;
}

export interface DrainageState {
  /** How hard it is raining (0..1) and how soaked the ground is (0..1). */
  rain: number;
  wet: number;
  /** Autumn leaf litter on the ground (0..1). */
  litter: number;
  /** Snow lying on the ground (0..1). */
  snow: number;
  /** Night (0..1): melt stops and meltwater freezes. */
  night: number;
}

/** Design storm: heavy rain, 50 mm an hour (m/s). */
const DESIGN_RAIN = 50 / 1000 / 3600;
const MANNING = 0.016, CROSS_SLOPE = 0.05;
/** Gutter flow capacity factor: Q = K sqrt(S) T^(8/3) (SI). */
const K = (0.376 / MANNING) * CROSS_SLOPE ** (5 / 3);
const ACROSS = [0, 0.1, 0.25, 0.45, 0.7, 1.05];
const MAX_SPREAD = 1.05;
const ON_GRADE_CAPTURE = 0.7;

/** Kept from map to map, like the weather, so the city's gutters agree. */
const carried = { runoff: 0, bank: 0, ice: 0 };
/** How high the snow bank stands against the curb when full (m). */
const BANK_HEIGHT = 0.16;

interface Built {
  line: GutterLine;
  down: Int32Array;
  flow: Float32Array; // design flow passing each point (m3/s)
  spread: Float32Array; // design spread from the curb (m)
  speed: Float32Array; // design speed (m/s)
  phase: Float32Array; // distance along the flow, rising downstream (m)
  inletDist: Float32Array; // distance to the nearest inlet (m)
  inflow: Map<number, number>; // design flow into each inlet
}

interface Leaf { line: number; at: number; rest: number; lateral: number; yaw: number; threshold: number; state: 0 | 1 | 2; drift: number }

export class Drainage {
  readonly group = new THREE.Group();
  private built: Built[];
  private water: THREE.Mesh;
  private bankMesh: THREE.Mesh;
  private iceMesh: THREE.Mesh;
  private swirls: THREE.Mesh;
  private leafMesh: THREE.InstancedMesh;
  private leaves: Leaf[] = [];
  private uniforms = { uTime: { value: 0 }, uRunoff: { value: 0 }, uPond: { value: 0 }, uBank: { value: 0 }, uIce: { value: 0 } };
  /** Water running in the gutters now (0..1 of the design storm). */
  runoff = carried.runoff;
  /** Height of the snow bank at the curb (0..1) and the ice beside it (0..1). */
  bank = carried.bank;
  ice = carried.ice;
  /** Meltwater running off the bank now (0..1). */
  melt = 0;
  private leafAge = 0;
  private leafDirty = true;
  private lastLitter = -1;
  /** Leaves on the grates, down the drains (tests). */
  piled = 0;
  drained = 0;
  private cells = new Map<string, { line: number; i: number }[]>();

  constructor(scene: THREE.Scene, lines: GutterLine[], private ground: (x: number, z: number) => number) {
    this.group.name = "Gutters and storm drains";
    this.group.userData.weatherDynamic = true;
    this.built = lines.filter((l) => l.points.length > 1).map((l) => this.route(l));
    this.water = this.buildWater();
    this.bankMesh = this.buildBank();
    this.iceMesh = this.buildIce();
    this.swirls = this.buildSwirls();
    this.group.add(this.water, this.bankMesh, this.iceMesh, this.swirls, this.buildInlets());
    this.leafMesh = this.buildLeaves();
    this.group.add(this.leafMesh);
    for (const [li, b] of this.built.entries())
      b.line.points.forEach((p, i) => {
        const keys = new Set<string>();
        for (const dx of [-1, 1]) for (const dz of [-1, 1]) keys.add(`${Math.floor((p.x + dx) / 8)},${Math.floor((p.z + dz) / 8)}`);
        for (const key of keys) {
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push({ line: li, i });
        }
      });
    scene.add(this.group);
    scene.userData.drainage = this;
    active = this;
  }

  /** Which way each point drains, and the flow, spread and speed along the line in the design storm. */
  private route(line: GutterLine): Built {
    const pts = line.points, n = pts.length, e = line.grade ?? pts.map((p) => p.y);
    const len = (i: number) => (i < 0 || i >= n - 1 ? 0 : Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z));
    const down = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? e[i - 1] : Infinity, b = i < n - 1 ? e[i + 1] : Infinity;
      if (Math.min(a, b) < e[i]) down[i] = a <= b ? i - 1 : i + 1;
    }
    const inlet = new Set(line.inlets);
    const flow = new Float32Array(n), inflow = new Map<number, number>(), order = [...Array(n).keys()].sort((a, b) => e[b] - e[a]);
    const passing = new Float32Array(n);
    for (const i of order) {
      passing[i] += DESIGN_RAIN * line.catchment * 0.5 * (len(i - 1) + len(i));
      flow[i] = passing[i];
      let pass = passing[i];
      if (inlet.has(i)) {
        const take = pass * (down[i] < 0 ? 1 : ON_GRADE_CAPTURE);
        inflow.set(i, take);
        pass -= take;
      }
      if (down[i] >= 0) passing[down[i]] += pass;
    }
    const spread = new Float32Array(n), speed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = down[i] >= 0 ? down[i] : i > 0 ? i - 1 : Math.min(n - 1, i + 1);
      const slope = Math.max(0.004, Math.abs(e[i] - e[j]) / Math.max(0.2, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)));
      const t = Math.min(MAX_SPREAD, (flow[i] / (K * Math.sqrt(slope))) ** (3 / 8));
      spread[i] = t;
      speed[i] = THREE.MathUtils.clamp(flow[i] / Math.max(1e-6, (CROSS_SLOPE * t * t) / 2), 0.1, 2.2);
    }
    // Distance along the flow, so ripples run downstream from every high point.
    const phase = new Float32Array(n);
    for (const i of [...order].reverse()) phase[i] = down[i] >= 0 ? phase[down[i]] - Math.hypot(pts[i].x - pts[down[i]].x, pts[i].z - pts[down[i]].z) : 0;
    const inletDist = new Float32Array(n).fill(1e3);
    for (const k of line.inlets) for (let i = 0; i < n; i++) inletDist[i] = Math.min(inletDist[i], Math.abs(i - k));
    return { line, down, flow, spread, speed, phase, inletDist, inflow };
  }

  /** A strip along a line, `offsets` across it, with a height and per-vertex attributes. */
  private strip(b: Built, offsets: number[], lift: (i: number, k: number) => number, attrs: Record<string, (i: number, k: number) => number>) {
    const { points, across } = b.line, n = points.length, m = offsets.length;
    const p: number[] = [], idx: number[] = [], extra: Record<string, number[]> = {};
    for (const key in attrs) extra[key] = [];
    for (let i = 0; i < n; i++)
      offsets.forEach((o, k) => {
        const x = points[i].x + across[i][0] * o, z = points[i].z + across[i][1] * o;
        p.push(x, this.ground(x + across[i][0] * 0.02, z + across[i][1] * 0.02) + lift(i, k), z);
        for (const key in attrs) extra[key].push(attrs[key](i, k));
      });
    // Faces up whichever side of the line the street lies.
    const [ax, az] = across[0], dx = points[1].x - points[0].x, dz = points[1].z - points[0].z, up = ax * dz - az * dx > 0;
    for (let i = 0; i < n - 1; i++)
      for (let k = 0; k < m - 1; k++) {
        const a = i * m + k, c = a + 1, d = a + m, f = d + 1;
        if (up) idx.push(a, d, c, c, d, f);
        else idx.push(a, c, d, c, f, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    for (const key in extra) g.setAttribute(key, new THREE.Float32BufferAttribute(extra[key], 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  private buildWater() {
    const g = mergeGeometries(this.built.map((b) => this.strip(b, ACROSS, () => 0.008, {
      aAcross: (_i, k) => ACROSS[k],
      aSpread: (i) => b.spread[i],
      aSpeed: (i) => b.speed[i],
      aPhase: (i) => b.phase[i],
      aInlet: (i) => b.inletDist[i],
    })))!;
    const material = new THREE.MeshStandardMaterial({ color: 0x3a4146, roughness: 0.06, metalness: 0.1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetUnits: -60, name: "Gutter water" });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uTime: this.uniforms.uTime, uRunoff: this.uniforms.uRunoff, uPond: this.uniforms.uPond });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aAcross, aSpread, aSpeed, aPhase, aInlet;\nvarying float vAcross, vSpread, vSpeed, vPhase, vInlet;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAcross = aAcross; vSpread = aSpread; vSpeed = aSpeed; vPhase = aPhase; vInlet = aInlet;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uTime, uRunoff, uPond;\nvarying float vAcross, vSpread, vSpeed, vPhase, vInlet;")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
          float runoff = max(uRunoff, 0.0);
          // Spread with flow (Manning, 3/8 power), plus a pond round a choked grate.
          float spreadNow = vSpread * pow(runoff, 0.375) + uPond * exp(-vInlet * 0.7);
          float cover = smoothstep(0.0, 0.06, spreadNow - vAcross);
          if (cover < 0.01) discard;
          float run = vPhase - uTime * vSpeed * pow(max(runoff, 0.05), 0.25);
          float ripple = sin(run * 11.0 + vAcross * 17.0) * 0.5 + sin(run * 27.0 - vAcross * 29.0 + 1.7) * 0.3 + sin(run * 5.0 + vAcross * 7.0) * 0.2;
          normal = normalize(normal + vec3(ripple * 0.22, 0.0, ripple * 0.12));
          float edge = smoothstep(0.08, 0.0, spreadNow - vAcross) * 0.35;`)
        // The sky's sheen on the moving surface (there is no environment map to
        // reflect), brighter at a glancing look and on the ripples' crests.
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
          float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
          gl_FragColor.rgb += vec3(0.6, 0.7, 0.8) * (0.18 + 0.55 * fres) + max(ripple, 0.0) * 0.12 + edge * 0.25;
          gl_FragColor.a *= cover * (0.55 + 0.3 * runoff);`);
    };
    material.customProgramCacheKey = () => "swf-gutter-water-v2";
    const mesh = new THREE.Mesh(g, material);
    mesh.name = "Gutter water";
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  private buildBank() {
    const offsets = [-0.15, -0.02, 0.05, 0.2, 0.35, 0.5, 0.62];
    const g = mergeGeometries(this.built.map((b) => this.strip(b, offsets, () => 0.004, {
      aBank: (i, k) => {
        const o = offsets[k], shape = o < 0 ? 0.45 * (1 + o / 0.15) : Math.max(0, 1 - ((o - 0.05) / 0.6) ** 2);
        return shape * (0.72 + 0.28 * Math.sin(i * 0.9 + k) * Math.sin(i * 0.37 + 1.3));
      },
    })))!;
    // The mound's own normals (at full height), so it is shaded as a bank, not a stripe.
    const full = g.clone(), fp = full.getAttribute("position") as THREE.BufferAttribute, fb = full.getAttribute("aBank") as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) fp.setY(i, fp.getY(i) + fb.getX(i) * BANK_HEIGHT);
    full.computeVertexNormals();
    g.setAttribute("aBankNormal", full.getAttribute("normal").clone());
    full.dispose();
    const material = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.78, name: "Curb snow bank" });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBank = this.uniforms.uBank;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aBank;\nattribute vec3 aBankNormal;\nuniform float uBank;\nvarying float vBank; varying vec2 vPlan;")
        .replace("#include <beginnormal_vertex>", "vec3 objectNormal = normalize(mix(normal, aBankNormal, clamp(uBank * 1.5, 0.0, 1.0)));")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          transformed.y += aBank * uBank * ${BANK_HEIGHT.toFixed(3)} - 0.01 * (1.0 - step(0.001, aBank * uBank));
          vBank = aBank; vPlan = (modelMatrix * vec4(transformed, 1.0)).xz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
          varying float vBank; varying vec2 vPlan;
          float snowHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float snowNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(snowHash(i), snowHash(i + vec2(1, 0)), f.x), mix(snowHash(i + vec2(0, 1)), snowHash(i + 1.0), f.x), f.y); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          // A ragged street edge where the plough and the tyres have broken it off.
          float ragged = snowNoise(vPlan * 2.2) * 0.28 + snowNoise(vPlan * 8.0) * 0.12;
          if (vBank < ragged) discard;
          // Grainy snow, packed grey where wheels and plough have pushed it at the street edge.
          float grain = snowHash(floor(vPlan * 60.0)) * 0.06 + snowHash(floor(vPlan * 9.0)) * 0.05 + (snowNoise(vPlan * 3.5) - 0.5) * 0.08;
          diffuseColor.rgb *= 0.93 + grain;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.57), smoothstep(0.45, 0.1, vBank) * 0.55);`);
    };
    material.customProgramCacheKey = () => "swf-curb-bank-v3";
    const mesh = new THREE.Mesh(g, material);
    mesh.name = "Curb snow bank";
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  private buildIce() {
    const offsets = [0.01, 0.15, 0.3, 0.45, 0.6];
    const g = mergeGeometries(this.built.map((b) => this.strip(b, offsets, () => 0.005, { aAcross: (_i, k) => offsets[k] })))!;
    // Black ice: thin, dark and glassy over the concrete, frosted white in patches.
    const material = new THREE.MeshStandardMaterial({ color: 0x7f97a4, roughness: 0.04, metalness: 0.3, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetUnits: -70, name: "Gutter ice" });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uIce = this.uniforms.uIce;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aAcross;\nvarying float vAcross; varying vec2 vPlan;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAcross = aAcross; vPlan = (modelMatrix * vec4(transformed, 1.0)).xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform float uIce; varying float vAcross; varying vec2 vPlan;
          float iceHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float iceNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(iceHash(i), iceHash(i + vec2(1, 0)), f.x), mix(iceHash(i + vec2(0, 1)), iceHash(i + 1.0), f.x), f.y); }`)
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
          // Patchy, widest where it has built up longest, against the curb.
          float patch = iceNoise(vPlan * 1.7) * 0.6 + iceNoise(vPlan * 5.3) * 0.4;
          float reach = 0.12 + 0.48 * uIce;
          float a = smoothstep(reach, reach - 0.12, vAcross + (patch - 0.5) * 0.25) * smoothstep(0.2, 0.55, patch + uIce * 0.5);
          float frost = smoothstep(0.62, 0.82, iceNoise(vPlan * 3.1 + 7.0) * 0.7 + iceNoise(vPlan * 11.0) * 0.3);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.9, 0.94, 0.97), frost * 0.75);
          gl_FragColor.a *= a * min(1.0, uIce * 1.6) * (0.5 + 0.35 * frost);`);
    };
    material.customProgramCacheKey = () => "swf-gutter-ice-v2";
    const mesh = new THREE.Mesh(g, material);
    mesh.name = "Gutter ice";
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  /** The inlets: a cast-iron grate in the gutter and, at a curb, the opening in its face. */
  private buildInlets() {
    const grates: THREE.BufferGeometry[] = [], throats: THREE.BufferGeometry[] = [];
    const place = new THREE.Object3D();
    for (const b of this.built)
      for (const i of b.line.inlets) {
        const p = b.line.points[i], [ax, az] = b.line.across[i], yaw = Math.atan2(ax, az);
        const y = this.ground(p.x + ax * 0.25, p.z + az * 0.25) + 0.004;
        place.position.set(p.x + ax * 0.24, y, p.z + az * 0.24);
        place.rotation.set(0, yaw, 0);
        place.updateMatrix();
        const grate = new THREE.PlaneGeometry(0.9, 0.42).rotateX(-Math.PI / 2);
        grates.push(grate.applyMatrix4(place.matrix));
        if (b.line.face > 0.05) {
          // The curb opening: a dark slot in the face with the throat behind it.
          const slot = new THREE.PlaneGeometry(1.2, 0.1);
          place.position.set(p.x + ax * 0.004, this.ground(p.x + ax * 0.02, p.z + az * 0.02) + 0.06, p.z + az * 0.004);
          place.rotation.set(0, Math.atan2(ax, az), 0);
          place.updateMatrix();
          throats.push(slot.applyMatrix4(place.matrix));
        }
      }
    const group = new THREE.Group();
    group.name = "Storm drain inlets";
    if (grates.length) {
      const grate = new THREE.Mesh(mergeGeometries(grates)!, new THREE.MeshStandardMaterial({ map: grateTexture(), roughness: 0.55, metalness: 0.6, polygonOffset: true, polygonOffsetUnits: -50, name: "Drain grate" }));
      grate.name = "Drain grates";
      grate.receiveShadow = true;
      group.add(grate);
    }
    if (throats.length) {
      const throat = new THREE.Mesh(mergeGeometries(throats)!, new THREE.MeshBasicMaterial({ color: 0x0b0c0d, polygonOffset: true, polygonOffsetUnits: -30, name: "Curb inlet throat" }));
      throat.name = "Curb inlet openings";
      group.add(throat);
    }
    return group;
  }

  /** A swirl of water pouring into each inlet, as strong as its share of the flow. */
  private buildSwirls() {
    const discs: THREE.BufferGeometry[] = [], strength: number[] = [];
    let most = 1e-9;
    for (const b of this.built) for (const q of b.inflow.values()) most = Math.max(most, q);
    for (const b of this.built)
      for (const i of b.line.inlets) {
        const p = b.line.points[i], [ax, az] = b.line.across[i];
        const disc = new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2);
        disc.translate(p.x + ax * 0.24, this.ground(p.x + ax * 0.24, p.z + az * 0.24) + 0.012, p.z + az * 0.24);
        const share = Math.sqrt((b.inflow.get(i) ?? 0) / most);
        disc.setAttribute("aShare", new THREE.Float32BufferAttribute(new Array(disc.attributes.position.count).fill(share), 1));
        discs.push(disc);
        strength.push(share);
      }
    const g = discs.length ? mergeGeometries(discs)! : new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial({ color: 0xdfe8ee, transparent: true, depthWrite: false, name: "Inlet swirl" });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uTime: this.uniforms.uTime, uRunoff: this.uniforms.uRunoff });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aShare;\nvarying float vShare; varying vec2 vDisc;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShare = aShare; vDisc = uv * 2.0 - 1.0;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uTime, uRunoff;\nvarying float vShare; varying vec2 vDisc;")
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
          float r = length(vDisc), a = atan(vDisc.y, vDisc.x);
          float arms = 0.5 + 0.5 * sin(a * 3.0 + r * 9.0 - uTime * 6.0);
          gl_FragColor.a = arms * smoothstep(1.0, 0.35, r) * smoothstep(0.05, 0.3, r) * vShare * min(1.0, uRunoff * 1.4) * 0.45;`);
    };
    material.customProgramCacheKey = () => "swf-inlet-swirl-v1";
    const mesh = new THREE.Mesh(g, material);
    mesh.name = "Inlet swirls";
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  private buildLeaves() {
    const random = mulberry(8713);
    for (const [li, b] of this.built.entries()) {
      const n = b.line.points.length;
      // Along the whole curb, and more toward the inlets and low points where wind and water gather them.
      for (let i = 0; i < n * 1.4; i++) {
        let at = random() * (n - 1);
        if (random() < 0.3) {
          const sink = b.line.inlets.length ? b.line.inlets[Math.floor(random() * b.line.inlets.length)] : Math.round(at);
          at = THREE.MathUtils.clamp(sink + (random() - 0.5) * 8, 0, n - 1);
        }
        this.leaves.push({ line: li, at, rest: at, lateral: 0.03 + random() ** 2 * 0.4, yaw: random() * Math.PI * 2, threshold: 0.12 + random() * 0.8, state: 0, drift: 0.6 + random() * 0.8 });
      }
    }
    const shape = new THREE.PlaneGeometry(0.1, 0.07).rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, name: "Gutter leaves" });
    const mesh = new THREE.InstancedMesh(shape, material, Math.max(1, this.leaves.length));
    mesh.name = "Gutter leaves";
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    const palette = [0xb5651d, 0xc98a2b, 0x8f4a1c, 0xd2a441, 0x7a5a2a, 0xa33d1e].map((c) => new THREE.Color(c));
    this.leaves.forEach((_, k) => mesh.setColorAt(k, palette[k % palette.length]));
    mesh.count = this.leaves.length;
    mesh.visible = false;
    return mesh;
  }

  /** Where along its line a leaf lies, in the world. */
  private leafMatrix(leaf: Leaf, out: THREE.Matrix4, show: boolean) {
    const b = this.built[leaf.line], pts = b.line.points, i = Math.min(pts.length - 2, Math.floor(leaf.at)), f = leaf.at - i;
    const [ax, az] = b.line.across[i];
    const x = pts[i].x + (pts[i + 1].x - pts[i].x) * f + ax * leaf.lateral, z = pts[i].z + (pts[i + 1].z - pts[i].z) * f + az * leaf.lateral;
    const s = show ? 1 : 0;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(leaf.yaw * 3) * 0.2, leaf.yaw, Math.cos(leaf.yaw * 5) * 0.2, "YXZ"));
    return out.compose(new THREE.Vector3(x, this.ground(x, z) + 0.014 + (leaf.state === 1 ? 0.01 * (leaf.yaw % 1) : 0), z), q, new THREE.Vector3(s, s, s));
  }

  update(dt: number, state: DrainageState) {
    const d = Math.min(dt, 0.1);
    this.uniforms.uTime.value += d;
    // Snow: the bank builds from the snow on the ground; packed and refrozen, the gutter ices.
    const snowing = state.snow > 0.2;
    if (snowing) this.bank += (state.snow - this.bank) * (1 - Math.exp(-d / 25));
    const warm = 1 - state.night;
    const meltRate = snowing ? 0 : this.bank > 0 ? (warm * 1 / 160 + 1 / 900) : 0;
    this.melt = Math.min(1, meltRate * 200) * (this.bank > 0.01 ? 1 : 0);
    this.bank = Math.max(0, this.bank - meltRate * d);
    // Compaction beside the curb while snow lies; meltwater refreezing overnight.
    const freeze = snowing ? state.snow / 70 : this.melt * state.night / 25;
    const thaw = !snowing && this.bank < 0.05 ? warm / 240 : 0;
    this.ice = THREE.MathUtils.clamp(this.ice + (freeze - thaw) * d, 0, 1);
    // Rain runs off the soaked street; meltwater runs by day; the gutter drains in about half a minute.
    const target = Math.max(state.rain * Math.min(1, state.wet * 3), this.melt * warm * 0.35);
    this.runoff += (target - this.runoff) * (1 - Math.exp(-d / (target > this.runoff ? 4 : 7)));
    if (this.runoff < 0.01 && target < 0.01) this.runoff = 0;
    Object.assign(carried, { runoff: this.runoff, bank: this.bank, ice: this.ice });
    this.uniforms.uRunoff.value = this.runoff;
    this.uniforms.uBank.value = this.bank;
    this.uniforms.uIce.value = this.ice;
    this.water.visible = this.runoff > 0.005 || this.uniforms.uPond.value > 0.01;
    this.swirls.visible = this.runoff > 0.02;
    this.bankMesh.visible = this.bank > 0.01;
    this.iceMesh.visible = this.ice > 0.01;
    this.stepLeaves(d, state.litter);
  }

  private stepLeaves(dt: number, litter: number) {
    if (Math.abs(litter - this.lastLitter) > 0.02) { this.lastLitter = litter; this.leafDirty = true; }
    // After the season the gutters are swept: every leaf back to its place for next fall.
    if (litter <= 0.001 && (this.piled || this.drained)) {
      for (const leaf of this.leaves) { leaf.state = 0; leaf.at = leaf.rest; }
      this.piled = this.drained = 0;
      this.uniforms.uPond.value = 0;
      this.leafDirty = true;
    }
    this.leafMesh.visible = litter > 0.01;
    if (!this.leafMesh.visible) return;
    this.leafAge += dt;
    const wash = this.runoff > 0.12;
    if (wash && this.leafAge >= 0.1) {
      const step = this.leafAge;
      this.leafAge = 0;
      for (const leaf of this.leaves) {
        if (leaf.state !== 0 || litter < leaf.threshold) continue;
        const b = this.built[leaf.line], i = Math.round(leaf.at), next = b.down[i];
        if (next < 0) { leaf.state = 1; this.piled++; continue; }
        // Leaves in the stream ride it; ones up on the dry edge barely move.
        const wetEdge = b.spread[i] * this.runoff ** 0.375;
        if (leaf.lateral > wetEdge) continue;
        leaf.at = THREE.MathUtils.clamp(leaf.at + Math.sign(next - i) * b.speed[i] * this.runoff ** 0.25 * leaf.drift * step, 0, b.line.points.length - 1);
        const j = Math.round(leaf.at);
        if (b.line.inlets.includes(j) && Math.abs(leaf.at - j) < 0.5) {
          // Half go down through the bars; the rest mat on the grate.
          if (leaf.yaw % 1 < 0.5) { leaf.state = 2; this.drained++; }
          else { leaf.state = 1; this.piled++; leaf.at = j + (leaf.yaw % 0.5 - 0.25) * 1.6; leaf.lateral = 0.05 + (leaf.drift - 0.6) * 0.35; }
        }
        this.leafDirty = true;
      }
      // A matted grate holds water back into a pond round it.
      this.uniforms.uPond.value = Math.min(0.9, this.piled / Math.max(1, this.inletCount) / 30) * Math.min(1, this.runoff * 2);
    } else if (!wash) this.uniforms.uPond.value *= Math.exp(-dt / 8);
    if (!this.leafDirty) return;
    this.leafDirty = false;
    const m = new THREE.Matrix4();
    this.leaves.forEach((leaf, k) => this.leafMesh.setMatrixAt(k, this.leafMatrix(leaf, m, leaf.state !== 2 && litter >= leaf.threshold)));
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  private get inletCount() { return this.built.reduce((sum, b) => sum + b.line.inlets.length, 0); }

  /** How icy the ground is at a point (0..1): only in the frozen band beside the curb. */
  iceAt(x: number, z: number) {
    if (this.ice < 0.05) return 0;
    const list = this.cells.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`);
    if (!list) return 0;
    const reach = 0.12 + 0.48 * this.ice;
    for (const { line, i } of list) {
      const b = this.built[line], p = b.line.points[i], [ax, az] = b.line.across[i];
      const dx = x - p.x, dz = z - p.z, out = dx * ax + dz * az, along = -dx * az + dz * ax;
      if (Math.abs(along) <= 0.6 && out >= -0.05 && out <= reach) return this.ice;
    }
    return 0;
  }
  /** The design flow, spread and inlets of each line (tests). */
  summary() {
    return this.built.map((b) => {
      const pts = b.line.points;
      let length = 0;
      for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
      return { points: pts.length, inlets: b.line.inlets.slice(), rain: DESIGN_RAIN * b.line.catchment * length, captured: [...b.inflow.values()].reduce((a, q) => a + q, 0), spread: Array.from(b.spread), speed: Array.from(b.speed), down: Array.from(b.down) };
    });
  }
  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    });
    if (active === this) active = null;
  }
}

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grate: THREE.Texture | null = null;
function grateTexture() {
  if (grate) return grate;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#050606";
  g.fillRect(0, 0, 128, 64);
  // Frame, bars across the gutter (safe for wheels) and one stiffener along it.
  g.fillStyle = "#4a4643";
  g.fillRect(0, 0, 128, 6); g.fillRect(0, 58, 128, 6); g.fillRect(0, 0, 6, 64); g.fillRect(122, 0, 6, 64);
  for (let x = 12; x < 120; x += 9) g.fillRect(x, 6, 4, 52);
  g.fillRect(6, 29, 116, 5);
  g.fillStyle = "rgba(120,62,30,.35)";
  for (let i = 0; i < 40; i++) g.fillRect((i * 37) % 124, (i * 53) % 60, 3, 2);
  grate = new THREE.CanvasTexture(c);
  grate.colorSpace = THREE.SRGBColorSpace;
  return grate;
}

let leaf: THREE.Texture | null = null;
function leafTexture() {
  if (leaf) return leaf;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 48;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(4, 24);
  g.bezierCurveTo(16, 2, 44, 2, 60, 24);
  g.bezierCurveTo(44, 46, 16, 46, 4, 24);
  g.fill();
  g.strokeStyle = "rgba(90,60,30,.6)";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(2, 24); g.lineTo(58, 24); g.stroke();
  for (const x of [18, 30, 42]) { g.beginPath(); g.moveTo(x, 24); g.lineTo(x + 8, 12); g.moveTo(x, 24); g.lineTo(x + 8, 36); g.stroke(); }
  leaf = new THREE.CanvasTexture(c);
  leaf.colorSpace = THREE.SRGBColorSpace;
  return leaf;
}

let active: Drainage | null = null;
/** The drainage on the map being ridden. */
export function activeDrainage() { return active; }
export function clearDrainage() { active = null; }
/** How icy the ground is at a point on the active map (0..1). */
export function iceAt(x: number, z: number) { return active ? active.iceAt(x, z) : 0; }
