import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ThrowableKind } from "../social/playful";

/**
 * The small things lying around the park that can be picked up, thrown and
 * binned (#47, #58, #78): each is its own model, not a stand-in shape. An
 * empty soda can (a little crushed), a crumpled chip bag, a water bottle, a
 * sports drink, a popped party popper, a balled-up napkin, and the park's
 * own acorns, pinecones and rocks. Every model sits centred on its origin
 * with its long axis along +Y; `lie` turns it over the way it comes to rest.
 * Geometry and materials are built once per kind and shared.
 */
export interface LitterModel {
  object: THREE.Object3D;
  /** Height of the centre above the ground when it lies at rest. */
  rest: number;
}

const cache = new Map<ThrowableKind, () => THREE.Object3D>();
const REST: Record<ThrowableKind, number> = { acorn: 0.012, pinecone: 0.028, rock: 0.026, can: 0.03, paper: 0.03, wrapper: 0.0075, bottle: 0.031, sports: 0.034, popper: 0.014 };
/** Round things tumble to any side; long things lie on their side; flat things lie flat. */
const SHAPE: Record<ThrowableKind, "round" | "long" | "flat"> = { acorn: "long", pinecone: "long", rock: "round", can: "long", paper: "round", wrapper: "flat", bottle: "long", sports: "long", popper: "long" };

export function litterModel(kind: ThrowableKind): LitterModel {
  let make = cache.get(kind);
  if (!make) { make = BUILD[kind](); cache.set(kind, make); }
  const object = make();
  object.name = "Throwable " + kind;
  object.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { object, rest: REST[kind] };
}

/** Settles `object` on the ground at `ground` height, turned `yaw`, the way its kind lies. */
export function lie(kind: ThrowableKind, object: THREE.Object3D, x: number, ground: number, z: number, yaw = Math.random() * Math.PI * 2) {
  object.position.set(x, ground + REST[kind], z);
  const shape = SHAPE[kind];
  object.rotation.order = "YXZ";
  if (shape === "long") object.rotation.set(0, yaw, Math.PI / 2 + (Math.random() - 0.5) * 0.08);
  else if (shape === "flat") object.rotation.set((Math.random() - 0.5) * 0.03, yaw, (Math.random() - 0.5) * 0.03);
  else object.rotation.set(Math.random() * 6.3, yaw, Math.random() * 6.3);
}
export const restHeight = (kind: ThrowableKind) => REST[kind];

// ---- helpers ----------------------------------------------------------------------
const hash = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext("2d")!, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
/**
 * A lathe from a profile of [radius, height] pairs (metres), bottom to top. Its
 * texture runs up by height (the built-in lathe spaces it by profile point), so
 * a printed label lands where it is drawn.
 */
function lathe(profile: [number, number][], segments = 24) {
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const p = geometry.attributes.position as THREE.BufferAttribute, uv = geometry.attributes.uv as THREE.BufferAttribute;
  const low = profile[0][1], span = profile[profile.length - 1][1] - low || 1;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (p.getY(i) - low) / span);
  return geometry;
}
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material) { return new THREE.Mesh(geometry, material); }
function group(...parts: THREE.Object3D[]) { const g = new THREE.Group(); g.add(...parts); return g; }

// ---- the models -------------------------------------------------------------------
const BUILD: Record<ThrowableKind, () => () => THREE.Object3D> = {
  can() {
    // A 355 ml can, 12.2 cm tall: domed base, straight wall, necked top with a
    // rolled rim and a pull tab. Empty and stepped on: pinched in on one side.
    const profile: [number, number][] = [[0, -0.056], [0.024, -0.058], [0.029, -0.061], [0.0325, -0.056], [0.033, -0.05], [0.033, 0.045], [0.031, 0.052], [0.027, 0.058], [0.0268, 0.061], [0.0255, 0.0605], [0.022, 0.058], [0, 0.058]];
    const geometry = lathe(profile, 28);
    const p = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (Math.abs(y) > 0.045) continue;
      const side = Math.max(0, x / 0.033), band = Math.exp(-((y - 0.004) ** 2) / 0.0006);
      const dent = side ** 3 * band * 0.012 + hash(x, y, z) * 0.0006;
      p.setX(i, x - dent);
    }
    geometry.computeVertexNormals();
    const label = canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = "#b8b8b8"; g.fillRect(0, 0, w, h);
      // Lathe UVs run bottom (v=0) to top (v=1): aluminium ends, printed wall.
      g.fillStyle = "#c8262d"; g.fillRect(0, h * 0.13, w, h * 0.78);
      g.fillStyle = "#f4efe6"; g.beginPath(); g.moveTo(0, h * 0.5);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.46 + Math.sin(x / w * Math.PI * 4) * 8);
      for (let x = w; x >= 0; x -= 8) g.lineTo(x, h * 0.56 + Math.sin(x / w * Math.PI * 4) * 8);
      g.fill();
      g.fillStyle = "#fff"; g.font = "bold 30px Impact, sans-serif"; g.textAlign = "center";
      g.fillText("FIZZ", w * 0.25, h * 0.4); g.fillText("FIZZ", w * 0.75, h * 0.4);
    });
    const body = new THREE.MeshStandardMaterial({ map: label, metalness: 0.75, roughness: 0.32 });
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0012, 0.02), new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.9, roughness: 0.25 }));
    tab.position.set(0, 0.0592, 0.006);
    return () => group(mesh(geometry, body), tab.clone());
  },
  wrapper() {
    // A single-serve chip bag, 15 x 21 cm, flattened and crumpled: a puffed
    // pillow with crimped, serrated seals at both ends and creases across it.
    const W = 0.15, L = 0.21, geometry = new THREE.PlaneGeometry(W, L, 18, 26);
    const top = geometry.clone(), p = top.attributes.position as THREE.BufferAttribute, bottomP = geometry.attributes.position as THREE.BufferAttribute;
    const puff = (x: number, y: number) => {
      const u = x / W + 0.5, v = y / L + 0.5, seal = Math.min(1, Math.min(v, 1 - v) / 0.11);
      return 0.011 * Math.sin(Math.PI * u) ** 0.6 * Math.sin(Math.PI * Math.min(1, seal)) ** 0.8;
    };
    // Creases scale with the puff, so both faces meet exactly at the seams and
    // the back never shows through the front.
    const crumple = (x: number, y: number) => 0.5 + hash(Math.floor(x * 55), Math.floor(y * 55), 1) * 0.8 + Math.abs(Math.sin(x * 60 + y * 32)) * 0.45 - Math.abs(Math.sin(y * 95 - x * 28)) * 0.3;
    const serrate = (x: number, y: number) => { const v = y / L + 0.5; return v < 0.02 || v > 0.98 ? ((Math.round(x / 0.006) % 2) ? 0.003 : -0.003) : 0; };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), h = puff(x, y);
      p.setZ(i, h * crumple(x, y));
      p.setY(i, y + serrate(x, y));
      bottomP.setZ(i, -h * 0.55 * crumple(y, x));
      bottomP.setY(i, y + serrate(x, y));
    }
    top.computeVertexNormals();
    geometry.computeVertexNormals();
    // Bottom faces the other way.
    const index = geometry.index!;
    for (let i = 0; i < index.count; i += 3) { const a = index.getX(i); index.setX(i, index.getX(i + 2)); index.setX(i + 2, a); }
    geometry.computeVertexNormals();
    const print = canvasTexture(256, 360, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, "#f39a1b"); grad.addColorStop(0.55, "#f7c52b"); grad.addColorStop(1, "#e8741a");
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.fillStyle = "#c7361c"; g.fillRect(0, 0, w, 34); g.fillRect(0, h - 34, w, 34);
      g.strokeStyle = "rgba(0,0,0,.18)"; for (let y = 4; y < 34; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.beginPath(); g.moveTo(0, h - y); g.lineTo(w, h - y); g.stroke(); }
      g.fillStyle = "#7a1c0c"; g.font = "bold 64px Impact, sans-serif"; g.textAlign = "center"; g.fillText("CRNCH", w / 2, 128);
      g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.fillText("SEA SALT", w / 2, 160);
      // Chips on the front.
      for (let i = 0; i < 6; i++) { g.save(); g.translate(70 + (i % 3) * 58, 215 + Math.floor(i / 3) * 50); g.rotate(i * 0.9); g.fillStyle = i % 2 ? "#f2d27a" : "#e9c060"; g.beginPath(); g.ellipse(0, 0, 30, 20, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = "rgba(160,90,20,.35)"; g.beginPath(); g.ellipse(4, 3, 6, 4, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    });
    // Printed front and back, as a real bag is; single-sided so the two never fight at the seams.
    // Faceted shading reads as crinkled foil.
    const printed = new THREE.MeshStandardMaterial({ map: print, metalness: 0.4, roughness: 0.34, flatShading: true });
    // Built flat in XY; turned so the bag lies in XZ, thickness up.
    const bag = group(mesh(top, printed), mesh(geometry, printed));
    bag.rotation.x = -Math.PI / 2;
    return () => group(bag.clone());
  },
  bottle() {
    // A 500 ml water bottle, 21 cm: ribbed clear plastic, a paper-thin label,
    // blue cap. Crinkled from being squeezed empty.
    const profile: [number, number][] = [[0, -0.105], [0.022, -0.105], [0.03, -0.1], [0.032, -0.09]];
    for (let y = -0.085; y <= 0.035; y += 0.006) profile.push([0.031 + Math.sin((y + 0.085) / 0.012 * Math.PI) * 0.0012, y]);
    profile.push([0.03, 0.05], [0.024, 0.066], [0.016, 0.078], [0.0125, 0.083], [0.0125, 0.086]);
    const geometry = lathe(profile, 28), p = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y > -0.09 && y < 0.04) { const k = 1 - (hash(Math.round(x * 200), Math.round(y * 60), Math.round(z * 200)) - 0.5) * 0.08; p.setX(i, x * k); p.setZ(i, z * k); } }
    geometry.computeVertexNormals();
    const plastic = new THREE.MeshStandardMaterial({ color: 0xdff1fb, transparent: true, opacity: 0.42, roughness: 0.08, metalness: 0, depthWrite: false });
    const label = canvasTexture(256, 64, (g, w, h) => { g.fillStyle = "#1f6fbf"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "bold 30px sans-serif"; g.textAlign = "center"; g.fillText("SPRING", w / 4, h * 0.62); g.fillText("SPRING", w * 0.75, h * 0.62); g.fillStyle = "#7fc6f0"; g.fillRect(0, h * 0.78, w, 6); });
    const band = mesh(new THREE.CylinderGeometry(0.0318, 0.0318, 0.05, 28, 1, true), new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 }));
    band.position.y = -0.02;
    const cap = mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.016, 20), new THREE.MeshStandardMaterial({ color: 0x2c7fd6, roughness: 0.5 }));
    cap.position.y = 0.093;
    return () => group(mesh(geometry, plastic), band.clone(), cap.clone());
  },
  sports() {
    // A sports drink, 20 cm: a gripped waist, bright liquid colour through the
    // plastic, a wide sport cap and a wraparound label.
    const profile: [number, number][] = [[0, -0.1], [0.026, -0.1], [0.034, -0.094], [0.035, -0.06], [0.029, -0.035], [0.029, -0.01], [0.035, 0.015], [0.034, 0.045], [0.025, 0.07], [0.017, 0.08], [0.017, 0.085]];
    const bottle = mesh(lathe(profile, 28), new THREE.MeshStandardMaterial({ color: 0xff8a1f, roughness: 0.18, metalness: 0.05 }));
    const label = canvasTexture(256, 64, (g, w, h) => { g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, w, h); g.fillStyle = "#ffb000"; g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.3, 0); g.lineTo(w * 0.42, 0); g.lineTo(w * 0.12, h); g.fill(); g.fillStyle = "#fff"; g.font = "bold italic 28px sans-serif"; g.fillText("VOLT", w * 0.5, h * 0.7); });
    const band = mesh(new THREE.CylinderGeometry(0.0352, 0.0352, 0.04, 28, 1, true), new THREE.MeshStandardMaterial({ map: label, roughness: 0.55 }));
    band.position.y = 0.028;
    const cap = mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.022, 20), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 }));
    cap.position.y = 0.096;
    return () => group(bottle.clone(), band.clone(), cap.clone());
  },
  paper() {
    // A balled-up napkin: soft crumpled facets, not a smooth ball.
    const geometry = new THREE.IcosahedronGeometry(0.034, 2), p = geometry.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 0.72 + hash(Math.round(v.x * 90), Math.round(v.y * 90), Math.round(v.z * 90)) * 0.42; p.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k); }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.95, flatShading: true });
    return () => mesh(geometry, material);
  },
  popper() {
    // A spent party popper: a striped card cone, its string pulled, a few
    // curls of streamer still hanging out of the mouth.
    const cone = new THREE.ConeGeometry(0.019, 0.075, 18, 1, true);
    cone.rotateX(Math.PI);
    const stripes = canvasTexture(128, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = ["#e8274b", "#f7d33c", "#2a8fe0", "#f5f1ea"][i % 4]; g.fillRect(i * w / 8, 0, w / 8 + 1, h); } });
    const body = mesh(cone, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.7, side: THREE.DoubleSide }));
    const streamers: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3, pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector3(Math.cos(a + t * 5) * 0.012 * (1 + t), 0.03 + t * 0.03, Math.sin(a + t * 5) * 0.012 * (1 + t))); }
      streamers.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0012, 4, false));
    }
    const curl = mesh(mergeGeometries(streamers), new THREE.MeshStandardMaterial({ color: 0xff4fa0, roughness: 0.6 }));
    return () => group(body.clone(), curl.clone());
  },
  acorn() {
    // A valley oak acorn: a glossy tapered nut in a scaly, rough cap with a stub stem.
    const nut = mesh(lathe([[0, -0.016], [0.004, -0.0155], [0.008, -0.012], [0.0105, -0.005], [0.011, 0.003], [0.0105, 0.008], [0.0095, 0.01]], 20), new THREE.MeshStandardMaterial({ color: 0x9a6a33, roughness: 0.35 }));
    const capGeometry = new THREE.SphereGeometry(0.0118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), p = capGeometry.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + (hash(Math.round(v.x * 900), Math.round(v.y * 900), Math.round(v.z * 900)) - 0.5) * 0.14; p.setXYZ(i, v.x * k, v.y * k * 0.75, v.z * k); }
    capGeometry.computeVertexNormals();
    const cap = mesh(capGeometry, new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.95, flatShading: true }));
    cap.position.y = 0.0065;
    const stem = mesh(new THREE.CylinderGeometry(0.0012, 0.0016, 0.006, 6), cap.material as THREE.Material);
    stem.position.y = 0.017;
    return () => group(nut.clone(), cap.clone(), stem.clone());
  },
  pinecone() {
    // An Aleppo pinecone, 9 cm: woody scales wound in the cone's spiral round a
    // tapered core, each a flattened, thickened lobe that opens away from the
    // stem, lighter and weathered at the tip.
    const parts: THREE.BufferGeometry[] = [], colors: number[] = [], c = new THREE.Color();
    const core = lathe([[0, -0.045], [0.009, -0.04], [0.014, -0.02], [0.013, 0.012], [0.008, 0.034], [0, 0.044]], 12).toNonIndexed();
    parts.push(core);
    for (let i = 0; i < core.attributes.position.count; i++) { c.set(0x4a3220); colors.push(c.r, c.g, c.b); }
    for (let i = 0; i < 64; i++) {
      const t = i / 64, y = -0.038 + t * 0.074, bulge = Math.sin(Math.PI * Math.min(1, t * 1.15)), r = 0.009 + bulge * 0.011, a = i * 2.39996;
      const size = 0.55 + bulge * 0.6;
      const scale = new THREE.SphereGeometry(0.0085, 7, 5).toNonIndexed();
      scale.scale(size, 0.42 * size, 1.25 * size);
      scale.translate(0, 0, 0.007 * size);
      scale.rotateX(-0.55 + t * 0.35);
      scale.rotateY(a);
      scale.translate(Math.sin(a) * r * 0.55, y, Math.cos(a) * r * 0.55);
      const count = scale.attributes.position.count, pos = scale.attributes.position;
      for (let k = 0; k < count; k++) {
        const tip = Math.min(1, Math.hypot(pos.getX(k), pos.getZ(k)) / (r + 0.012));
        c.setRGB(0.36 + tip * 0.2, 0.24 + tip * 0.14, 0.15 + tip * 0.08).multiplyScalar(0.85 + hash(i, k, 3) * 0.3);
        colors.push(c.r, c.g, c.b);
      }
      parts.push(scale);
    }
    for (const g of parts) for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    const geometry = mergeGeometries(parts);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    return () => mesh(geometry, material);
  },
  rock() {
    // A desert cobble: rounded but lumpy, with a varnished, mottled face.
    const geometry = new THREE.IcosahedronGeometry(0.03, 4), p = geometry.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), colors: number[] = [], c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 95 + v.z * 40) * 0.07 + Math.sin(v.y * 120 + v.z * 70) * 0.06 + Math.sin(v.x * 260 - v.y * 180) * 0.015;
      p.setXYZ(i, v.x * (1.15 + n), v.y * (0.78 + n), v.z * (0.95 + n));
      c.setHSL(0.07 + n * 0.1, 0.16, 0.4 + n * 0.9 + (hash(Math.round(v.x * 400), Math.round(v.y * 400), Math.round(v.z * 400)) - 0.5) * 0.08); colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    return () => mesh(geometry, material);
  },
};
