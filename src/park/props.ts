import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Park } from "./park";
import { GROUPS } from "../physics/groups";
import { surfaceMaterial } from "./art";
import { woodRampMaterials } from "./wood-ramps";

/**
 * Park furniture in the stylized-realism look (#39): vending machines, scooter
 * racks, drinking fountains, lamp posts, pavilions and the park's monument
 * sign. Each prop's parts are merged per material, so the added detail costs
 * a handful of draw calls rather than one per piece.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
type Part = { g: THREE.BufferGeometry; m: THREE.Material };
/** Collects transformed geometry per material, then merges it into one mesh each. */
class Kit {
  private parts: Part[] = [];
  constructor(private origin: THREE.Vector3, private yaw = 0) {}
  add(g: THREE.BufferGeometry, m: THREE.Material, at: THREE.Vector3, rot: THREE.Euler = new THREE.Euler(), scale = V(1, 1, 1)) {
    const local = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(rot), scale);
    const place = new THREE.Matrix4().compose(this.origin, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), this.yaw), V(1, 1, 1));
    const out = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(place.multiply(local));
    for (const name of Object.keys(out.attributes)) if (!["position", "normal", "uv"].includes(name)) out.deleteAttribute(name);
    g.dispose();
    this.parts.push({ g: out, m });
    return this;
  }
  box(size: THREE.Vector3, m: THREE.Material, at: THREE.Vector3, radius = 0.01, rot?: THREE.Euler) {
    return this.add(new RoundedBoxGeometry(size.x, size.y, size.z, 2, Math.min(radius, size.x * 0.45, size.y * 0.45, size.z * 0.45)), m, at, rot);
  }
  build(scene: THREE.Object3D, name: string, shadow = true) {
    const group = new THREE.Group();
    group.name = name;
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of this.parts) byMaterial.set(p.m, [...(byMaterial.get(p.m) ?? []), p.g]);
    for (const [m, list] of byMaterial) {
      const mesh = new THREE.Mesh(mergeGeometries(list), m);
      list.forEach((g) => g.dispose());
      mesh.castShadow = shadow && !(m as THREE.MeshStandardMaterial).transparent;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    scene.add(group);
    return group;
  }
}
/** A static box collider in world space, like Park.box's. */
function solid(park: Park, centre: THREE.Vector3, size: THREE.Vector3, yaw = 0) {
  park.world.createCollider(
    RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(centre.x, centre.y, centre.z)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw))
      .setFriction(0.1)
      .setCollisionGroups(GROUPS.surface),
  );
}
const turn = (origin: THREE.Vector3, yaw: number, local: THREE.Vector3) => local.clone().applyAxisAngle(V(0, 1, 0), yaw).add(origin);

// ---- Shared materials -------------------------------------------------------
const cache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  let m = cache.get(key);
  if (!m) { m = make(); m.name = key; cache.set(key, m); }
  return m;
}
const paint = (color: number, roughness = 0.42, metalness = 0.35) => mat(`paint ${color.toString(16)} ${roughness} ${metalness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));
const galvanized = () => woodRampMaterials().steel;
const concrete = () => mat("prop concrete", () => surfaceMaterial(0xcfc8b8, "concrete", 1.2, 1.2));
const timber = () => mat("prop timber", () => surfaceMaterial(0x9b6c41, "wood", 0.6, 3));
const rubber = () => paint(0x1b1d1f, 0.8, 0);

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** Seeded 0..1 noise for the canvas painters. */
function rng(seed: number) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Asphalt roof shingles: staggered tabs in rows, weathered unevenly. */
const shingles = () => mat("roof shingles", () => {
  const t = canvasTexture(256, 256, (g) => {
    const r = rng(77);
    g.fillStyle = "#6b3f2c"; g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
      const x = col * 64 + (row % 2) * 32, y = row * 32, k = 0.8 + r() * 0.35;
      g.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(82 * k)},${Math.round(55 * k)})`;
      g.fillRect(x + 1, y + 1, 62, 30);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "30,20,15" : "210,180,150"},${0.12 + r() * 0.15})`; g.fillRect(x + r() * 62, y + r() * 30, 1.5, 1.5); }
      g.fillStyle = "rgba(20,10,5,.45)"; g.fillRect(x, y + 28, 64, 4);
    }
  }, true);
  t.repeat.set(3, 2.4);
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.02, roughness: 0.92 });
});
/** Desert stone veneer: coursed blocks in tans and rust with dark mortar. */
const stone = () => mat("stone veneer", () => {
  const t = canvasTexture(256, 256, (g) => {
    const r = rng(311);
    g.fillStyle = "#6f655a"; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256;) {
      const h = 20 + r() * 22;
      for (let x = -r() * 40; x < 256;) {
        const w = 34 + r() * 50, k = 0.85 + r() * 0.3, hue = r();
        g.fillStyle = hue < 0.3 ? `rgb(${178 * k},${126 * k},${86 * k})` : hue < 0.7 ? `rgb(${196 * k},${172 * k},${138 * k})` : `rgb(${150 * k},${132 * k},${112 * k})`;
        g.fillRect(x + 2, y + 2, w - 3, h - 3);
        g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(x + 2, y + 2, w - 3, 3);
        x += w;
      }
      y += h;
    }
  }, true);
  t.repeat.set(1.4, 1);
  return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.03, roughness: 0.95 });
});

// ---- Vending machine ---------------------------------------------------------
/** The backlit product wall: four shelves of cans and bottles with price tags. */
const products = () => mat("vending products", () => {
  const t = canvasTexture(256, 512, (g) => {
    const r = rng(19);
    const grad = g.createLinearGradient(0, 0, 0, 512); grad.addColorStop(0, "#f4fbff"); grad.addColorStop(1, "#cfe6ee");
    g.fillStyle = grad; g.fillRect(0, 0, 256, 512);
    const colors = ["#d7322e", "#f2a228", "#2e7fd0", "#35a852", "#7c3fb6", "#f0e3c2", "#e05a8c", "#1e2a36"];
    for (let s = 0; s < 4; s++) {
      const y0 = 20 + s * 122;
      for (let i = 0; i < 5; i++) {
        const c = colors[Math.floor(r() * colors.length)], x = 14 + i * 48, bottle = r() < 0.4;
        g.fillStyle = c;
        if (bottle) { g.fillRect(x + 10, y0 + 22, 22, 68); g.fillRect(x + 15, y0 + 6, 12, 18); }
        else g.fillRect(x + 6, y0 + 34, 30, 56);
        g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(x + (bottle ? 13 : 9), y0 + 38, 4, 46);
        g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(x + (bottle ? 12 : 8), y0 + 60, bottle ? 18 : 26, 10);
      }
      g.fillStyle = "#39434a"; g.fillRect(0, y0 + 92, 256, 10);
      for (let i = 0; i < 5; i++) { g.fillStyle = "#fff6c8"; g.fillRect(20 + i * 48, y0 + 104, 30, 10); g.fillStyle = "#333"; g.font = "bold 9px sans-serif"; g.fillText(`${String.fromCharCode(65 + s)}${i + 1}`, 26 + i * 48, y0 + 113); }
    }
  });
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55, roughness: 0.6 });
});
const vendingHeader = () => mat("vending header", () => {
  const t = canvasTexture(512, 160, (g) => {
    const grad = g.createLinearGradient(0, 0, 512, 0); grad.addColorStop(0, "#0e8c96"); grad.addColorStop(1, "#1dbfb0");
    g.fillStyle = grad; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 6;
    for (let i = 0; i < 3; i++) { g.beginPath(); for (let x = 0; x <= 512; x += 8) g.lineTo(x, 118 + i * 12 + Math.sin(x * 0.03 + i) * 5); g.stroke(); }
    g.fillStyle = "#ffffff"; g.font = "italic 900 84px sans-serif"; g.textAlign = "center"; g.fillText("REFRESH", 256, 92);
    g.font = "bold 22px sans-serif"; g.fillText("ICE COLD  ·  DRINKS & SNACKS", 256, 150);
  });
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.7, roughness: 0.4 });
});
const glass = () => mat("vending glass", () => new THREE.MeshStandardMaterial({ color: 0xcfe4ec, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.2, depthWrite: false }));
const screen = () => mat("vending screen", () => new THREE.MeshStandardMaterial({ color: 0x0c1a12, emissive: 0x4dff9a, emissiveIntensity: 0.6, roughness: 0.3 }));

/**
 * A glass-front drinks machine facing +z (turned by `yaw`), 1.05 x 1.9 x 0.75 m.
 * Returns the mesh group; adds its collider.
 */
export function vendingMachine(park: Park, base: THREE.Vector3, yaw = 0) {
  const k = new Kit(base, yaw), body = paint(0x1b5961, 0.36, 0.5), trim = paint(0x2c3439, 0.4, 0.6), dark = paint(0x11171b, 0.6, 0.2);
  k.box(V(1.02, 1.8, 0.72), body, V(0, 0.95, 0), 0.05);
  k.box(V(1.06, 0.1, 0.76), trim, V(0, 1.88, 0), 0.03);
  k.box(V(1.04, 0.1, 0.74), dark, V(0, 0.05, 0), 0.02);
  for (const x of [-0.46, 0.46]) for (const z of [-0.3, 0.3]) k.add(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 10), rubber(), V(x, 0.01, z));
  // Lit header, glass front with the product wall behind it, and its frame.
  k.add(new THREE.PlaneGeometry(0.96, 0.3), vendingHeader(), V(0, 1.7, 0.362));
  k.add(new THREE.PlaneGeometry(0.62, 1.12), products(), V(-0.14, 1.0, 0.33));
  k.add(new THREE.PlaneGeometry(0.64, 1.14), glass(), V(-0.14, 1.0, 0.366));
  for (const [x, y, w, h] of [[-0.14, 1.575, 0.7, 0.04], [-0.14, 0.425, 0.7, 0.04], [-0.47, 1.0, 0.04, 1.19], [0.19, 1.0, 0.04, 1.19]] as const) k.box(V(w, h, 0.03), trim, V(x, y, 0.36), 0.01);
  // Control column: display, keypad, coin and card slots, the change cup.
  k.box(V(0.24, 1.12, 0.02), dark, V(0.32, 1.0, 0.362), 0.01);
  k.add(new THREE.PlaneGeometry(0.16, 0.07), screen(), V(0.32, 1.44, 0.374));
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) k.box(V(0.04, 0.032, 0.012), trim, V(0.275 + col * 0.047, 1.33 - row * 0.045, 0.376), 0.006);
  k.box(V(0.1, 0.018, 0.012), galvanized(), V(0.32, 1.09, 0.376), 0.004);
  k.box(V(0.12, 0.07, 0.02), galvanized(), V(0.32, 0.98, 0.378), 0.008);
  k.box(V(0.12, 0.08, 0.05), trim, V(0.32, 0.62, 0.38), 0.01);
  // Delivery bin with its push flap, and a vented kick plate.
  k.box(V(0.66, 0.2, 0.05), dark, V(-0.08, 0.27, 0.36), 0.015);
  k.box(V(0.6, 0.15, 0.02), paint(0x3a454c, 0.3, 0.6), V(-0.08, 0.28, 0.39), 0.01, new THREE.Euler(-0.18, 0, 0));
  for (let i = 0; i < 4; i++) k.box(V(0.8, 0.012, 0.01), trim, V(0, 0.07 + i * 0.022, 0.366), 0.004);
  // Side vents and a seam down the back.
  for (const s of [-1, 1]) for (let i = 0; i < 8; i++) k.box(V(0.012, 0.012, 0.4), trim, V(s * 0.512, 1.45 - i * 0.03, -0.05), 0.004);
  k.box(V(0.02, 1.7, 0.01), trim, V(0, 0.95, -0.362), 0.004);
  const group = k.build(park.scene, "Refresh vending machine");
  solid(park, turn(base, yaw, V(0, 0.95, 0)), V(1.06, 1.9, 0.76), yaw);
  return group;
}

// ---- Trash can (#58) ------------------------------------------------------------
/**
 * A park litter receptacle, 0.95 m tall: a powder-coated steel basket of flat
 * vertical slats between two hoops, a black liner showing between them, and a
 * domed rain lid with a front opening. Returns where litter goes in (the mouth).
 */
export function trashCan(park: Park, base: THREE.Vector3, yaw = 0) {
  const k = new Kit(base, yaw), steel = paint(0x2c4a3b, 0.55, 0.35), liner = paint(0x131617, 0.8, 0), lid = paint(0x27382f, 0.45, 0.4);
  const r = 0.29, slats = 22;
  k.add(new THREE.CylinderGeometry(r + 0.02, r + 0.03, 0.05, 28), paint(0x9a978f, 0.9, 0), V(0, 0.025, 0));
  k.add(new THREE.CylinderGeometry(r - 0.03, r - 0.03, 0.8, 24, 1, true), liner, V(0, 0.45, 0));
  for (let i = 0; i < slats; i++) {
    const a = (i / slats) * Math.PI * 2;
    k.box(V(0.052, 0.8, 0.014), steel, V(Math.sin(a) * r, 0.45, Math.cos(a) * r), 0.005, new THREE.Euler(0, a, 0));
  }
  for (const y of [0.12, 0.47, 0.83]) k.add(new THREE.TorusGeometry(r + 0.006, 0.012, 6, 36), steel, V(0, y, 0), new THREE.Euler(Math.PI / 2, 0, 0));
  // Rain lid: a shallow dome on a band, open at the front where litter goes in.
  k.add(new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.07, 28, 1, true, 0.45, Math.PI * 2 - 0.9), lid, V(0, 0.9, 0));
  k.add(new THREE.SphereGeometry(r + 0.02, 28, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), lid, V(0, 0.9, 0), new THREE.Euler(), V(1, 0.55, 1));
  k.add(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12), paint(0x9aa1a3, 0.3, 0.8), V(0, 1.075, 0));
  const group = k.build(park.scene, "Trash can");
  solid(park, turn(base, yaw, V(0, 0.5, 0)), V(0.64, 1, 0.64), yaw);
  return { group, mouth: turn(base, yaw, V(0, 0.95, r)) };
}

/**
 * A poured concrete pad under a service cluster (#58), `length` along the row
 * and `depth` across it. Visual only: flush with the ground, nothing to trip on.
 */
export function servicePad(park: Park, centre: THREE.Vector3, yaw: number, length: number, depth: number) {
  const m = (concrete() as THREE.MeshStandardMaterial).clone();
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4;
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(length, depth).rotateX(-Math.PI / 2), m);
  pad.position.set(centre.x, centre.y + 0.012, centre.z);
  pad.rotation.y = yaw;
  pad.receiveShadow = true;
  pad.name = "Service pad";
  park.scene.add(pad);
  return pad;
}

// ---- Scooter rack -------------------------------------------------------------
/** Three galvanised inverted-U hoops on a footing, 2.3 m long, running along x. */
export function scooterRack(park: Park, base: THREE.Vector3, yaw = 0) {
  const k = new Kit(base, yaw), steel = galvanized();
  k.box(V(2.3, 0.07, 0.8), concrete(), V(0, 0.035, 0), 0.02);
  const hoop = new THREE.CatmullRomCurve3([V(0, 0.02, -0.3), V(0, 0.46, -0.3), V(0, 0.64, -0.23), V(0, 0.69, 0), V(0, 0.64, 0.23), V(0, 0.46, 0.3), V(0, 0.02, 0.3)], false, "centripetal");
  for (const x of [-0.85, 0, 0.85]) {
    k.add(new THREE.TubeGeometry(hoop, 40, 0.024, 10, false), steel, V(x, 0.05, 0));
    for (const z of [-0.3, 0.3]) k.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14), steel, V(x, 0.076, z));
  }
  k.box(V(1.9, 0.02, 0.05), steel, V(0, 0.09, -0.3), 0.008).box(V(1.9, 0.02, 0.05), steel, V(0, 0.09, 0.3), 0.008);
  // A small "scooter parking" plate on the end hoop.
  k.add(new THREE.PlaneGeometry(0.34, 0.2), mat("rack plate", () => new THREE.MeshStandardMaterial({ map: canvasTexture(170, 100, (g) => { g.fillStyle = "#1f5aa6"; g.fillRect(0, 0, 170, 100); g.strokeStyle = "#fff"; g.lineWidth = 5; g.strokeRect(5, 5, 160, 90); g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"; g.textAlign = "center"; g.fillText("SCOOTER", 85, 44); g.fillText("PARKING", 85, 74); }), roughness: 0.5, side: THREE.DoubleSide })), V(1.2, 0.42, 0), new THREE.Euler(0, Math.PI / 2, 0));
  k.box(V(0.02, 0.24, 0.38), steel, V(1.19, 0.42, 0), 0.005);
  const group = k.build(park.scene, "Scooter rack");
  for (const x of [-0.85, 0, 0.85]) solid(park, turn(base, yaw, V(x, 0.36, 0)), V(0.06, 0.66, 0.66), yaw);
  solid(park, turn(base, yaw, V(0, 0.035, 0)), V(2.3, 0.07, 0.8), yaw);
  return group;
}

// ---- Drinking fountain -----------------------------------------------------------
/** A pedestal fountain with a stainless basin and bubbler, plus a pet bowl at its foot. */
export function drinkingFountain(park: Park, base: THREE.Vector3, yaw = 0) {
  const k = new Kit(base, yaw), coat = paint(0x2f5d57, 0.5, 0.3), steel = paint(0xc9ced1, 0.22, 0.9);
  k.box(V(0.62, 0.06, 0.62), concrete(), V(0, 0.03, 0), 0.02);
  k.add(new THREE.CylinderGeometry(0.15, 0.2, 0.78, 20), coat, V(0, 0.45, 0));
  k.add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), coat, V(0, 0.08, 0));
  const bowl = [V(0.001, 0), V(0.05, 0), V(0.2, 0.02), V(0.27, 0.07), V(0.3, 0.1), V(0.3, 0.12), V(0.27, 0.12), V(0.25, 0.09), V(0.18, 0.05), V(0.05, 0.035), V(0.001, 0.035)].map((p) => new THREE.Vector2(p.x, p.y));
  k.add(new THREE.LatheGeometry(bowl, 32), steel, V(0, 0.84, 0));
  k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.005, 12), paint(0x55595c, 0.4, 0.8), V(0, 0.878, 0));
  // Bubbler and its guard, and the push button on the front.
  k.add(new THREE.CylinderGeometry(0.018, 0.024, 0.09, 12), steel, V(0.08, 0.92, -0.05));
  k.add(new THREE.TorusGeometry(0.04, 0.008, 6, 14, Math.PI), steel, V(0.08, 0.95, -0.05), new THREE.Euler(0, Math.PI / 2, 0));
  k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), paint(0x9aa1a5, 0.3, 0.85), V(0, 0.9, 0.305), new THREE.Euler(Math.PI / 2, 0, 0));
  // Pet bowl.
  k.add(new THREE.LatheGeometry([V(0.001, 0), V(0.14, 0), V(0.16, 0.06), V(0.14, 0.06), V(0.12, 0.02), V(0.001, 0.02)].map((p) => new THREE.Vector2(p.x, p.y)), 24), steel, V(0.32, 0.06, 0.18));
  const group = k.build(park.scene, "Drinking fountain");
  solid(park, turn(base, yaw, V(0, 0.45, 0)), V(0.36, 0.9, 0.36), yaw);
  return group;
}

// ---- Lamp posts ------------------------------------------------------------------
// Every lamp in the park glows sodium amber (#83), like the old street lights.
const lampLens = () => new THREE.MeshStandardMaterial({ color: 0xffd9a8, emissive: 0xff9a3c, emissiveIntensity: 0, roughness: 0.3 });
/**
 * A park path light: footing, shroud, tapered bronze pole, a swept arm and an
 * LED head. Returns the lens material for the day/night cycle to light.
 */
export function lampPost(park: Park, base: THREE.Vector3, yaw = 0, height = 5.9) {
  const k = new Kit(base, yaw), bronze = paint(0x3b3a34, 0.45, 0.55), lens = lampLens();
  k.add(new THREE.CylinderGeometry(0.26, 0.3, 0.22, 16), concrete(), V(0, 0.11, 0));
  k.add(new THREE.CylinderGeometry(0.1, 0.16, 0.55, 12), bronze, V(0, 0.49, 0));
  k.add(new THREE.CylinderGeometry(0.045, 0.075, height - 0.5, 12), bronze, V(0, 0.5 + (height - 0.5) / 2 - 0.1, 0));
  k.add(new THREE.TorusGeometry(0.075, 0.018, 6, 16), bronze, V(0, 0.78, 0), new THREE.Euler(Math.PI / 2, 0, 0));
  const arm = new THREE.CatmullRomCurve3([V(0, height - 0.35, 0), V(0.12, height - 0.08, 0), V(0.5, height + 0.02, 0), V(0.95, height, 0)]);
  k.add(new THREE.TubeGeometry(arm, 24, 0.032, 8, false), bronze, V());
  k.box(V(0.62, 0.1, 0.34), bronze, V(1.05, height - 0.02, 0), 0.04);
  k.box(V(0.56, 0.02, 0.28), lens, V(1.05, height - 0.08, 0), 0.008);
  k.add(new THREE.SphereGeometry(0.05, 12, 8), bronze, V(0, height + 0.02 - 0.3, 0));
  k.build(park.scene, "Park lamp post");
  solid(park, turn(base, yaw, V(0, height / 2, 0)), V(0.2, height, 0.2), yaw);
  return lens;
}
/** A parking-lot floodlight: tall galvanised pole with a pair of flat heads. */
export function floodlight(park: Park, base: THREE.Vector3, yaw = 0) {
  const k = new Kit(base, yaw), steel = galvanized(), head = paint(0x2a2f33, 0.5, 0.5), lens = lampLens();
  k.add(new THREE.CylinderGeometry(0.28, 0.32, 0.5, 16), concrete(), V(0, 0.25, 0));
  k.box(V(0.34, 0.03, 0.34), steel, V(0, 0.515, 0), 0.01);
  k.add(new THREE.CylinderGeometry(0.06, 0.1, 8, 12), steel, V(0, 4.5, 0));
  k.box(V(1.4, 0.08, 0.08), steel, V(0, 8.4, 0), 0.02);
  for (const s of [-1, 1]) { k.box(V(0.5, 0.12, 0.42), head, V(s * 0.6, 8.3, 0), 0.03, new THREE.Euler(0, 0, s * 0.18)); k.box(V(0.44, 0.02, 0.36), lens, V(s * 0.6, 8.23, 0), 0.006, new THREE.Euler(0, 0, s * 0.18)); }
  k.build(park.scene, "Parking floodlight");
  (park.scene.userData.lampLenses ??= []).push(lens);
  // Where its light comes from, for daylight.ts to light the lot at night.
  (park.scene.userData.floodHeads ??= []).push(turn(base, yaw, V(0, 8.2, 0)));
  solid(park, turn(base, yaw, V(0, 4.25, 0)), V(0.2, 8.5, 0.2), yaw);
  return lens;
}
/** A soft radial falloff for a street light's pool on the ground. */
const amberPool = () => {
  const key = "amber pool";
  let t = textures.get(key);
  if (!t) {
    const c = canvasTexture(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "#fff"); r.addColorStop(0.35, "#ffffffaa"); r.addColorStop(0.7, "#ffffff33"); r.addColorStop(1, "#fff0"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    textures.set(key, (t = c));
  }
  return t;
};
const textures = new Map<string, THREE.Texture>();
/**
 * An old sodium street light: a tall galvanised pole, an upswept arm and a
 * cobra head with an amber lens. It returns the lens and the glow on the
 * ground under it; daylight.ts brings both up at night (scene.userData.amberLights).
 */
export function sodiumLamp(park: Park, base: THREE.Vector3, yaw = 0, height = 8) {
  const k = new Kit(base, yaw), steel = galvanized(), head = paint(0x5d6166, 0.46, 0.55);
  const lens = new THREE.MeshStandardMaterial({ color: 0xffd9a8, emissive: 0xff9a3c, emissiveIntensity: 0, roughness: 0.35 });
  k.add(new THREE.CylinderGeometry(0.3, 0.34, 0.45, 16), concrete(), V(0, 0.225, 0));
  k.box(V(0.36, 0.03, 0.36), steel, V(0, 0.465, 0), 0.01);
  for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) k.add(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 6), steel, V(dx * 0.13, 0.51, dz * 0.13));
  k.add(new THREE.CylinderGeometry(0.07, 0.11, height - 0.5, 14), steel, V(0, 0.48 + (height - 0.5) / 2, 0));
  const arm = new THREE.CatmullRomCurve3([V(0, height - 0.55, 0), V(0.25, height - 0.1, 0), V(0.9, height + 0.18, 0), V(1.7, height + 0.26, 0)]);
  k.add(new THREE.TubeGeometry(arm, 24, 0.045, 8, false), steel, V());
  k.add(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10), steel, V(0, height - 0.02, 0));
  // The cobra head: a tapered shell over a slightly dished amber refractor.
  k.box(V(0.86, 0.16, 0.4), head, V(1.95, height + 0.24, 0), 0.07, new THREE.Euler(0, 0, -0.06));
  k.box(V(0.5, 0.1, 0.34), head, V(2.28, height + 0.3, 0), 0.05, new THREE.Euler(0, 0, -0.06));
  k.box(V(0.66, 0.05, 0.3), lens, V(2.0, height + 0.14, 0), 0.02, new THREE.Euler(0, 0, -0.06));
  k.build(park.scene, "Amber street light");
  solid(park, turn(base, yaw, V(0, height / 2, 0)), V(0.24, height, 0.24), yaw);
  // The glow on the ground is a soft decal, like the path lamps' pools: a real
  // light would add to the cost of every material in the park, day or night.
  const pool = new THREE.MeshBasicMaterial({ map: amberPool(), color: 0xffa24a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const under = turn(base, yaw, V(2.0, 0, 0)), radius = height * 0.95;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), pool);
  decal.rotation.x = -Math.PI / 2; decal.position.set(under.x, base.y + 0.03, under.z);
  decal.name = "Amber light pool"; decal.renderOrder = 2;
  park.scene.add(decal);
  (park.scene.userData.amberLights ??= []).push({ lens, pool });
  return { lens, pool };
}

// ---- Pavilion ---------------------------------------------------------------------
/** A 7 m picnic pavilion: slab, stone-footed timber posts with knee braces, beams and a shingled hip roof. */
export function pavilion(park: Park, x: number, z: number, y = 0) {
  const base = V(x, y, z), k = new Kit(base), post = timber(), dark = paint(0x3b2a1e, 0.7, 0.05);
  k.box(V(7, 0.14, 7), concrete(), V(0, 0.05, 0), 0.05);
  for (const dx of [-2.6, 2.6]) for (const dz of [-2.6, 2.6]) {
    k.box(V(0.42, 0.55, 0.42), stone(), V(dx, 0.395, dz), 0.02);
    k.box(V(0.48, 0.05, 0.48), concrete(), V(dx, 0.69, dz), 0.015);
    k.box(V(0.2, 2.45, 0.2), post, V(dx, 1.94, dz), 0.02);
    // Knee braces into both beams.
    // Each brace rises from the post inward to the beam above.
    k.box(V(0.1, 0.9, 0.1), post, V(dx - Math.sign(dx) * 0.32, 2.85, dz), 0.01, new THREE.Euler(0, 0, Math.sign(dx) * 0.78));
    k.box(V(0.1, 0.9, 0.1), post, V(dx, 2.85, dz - Math.sign(dz) * 0.32), 0.01, new THREE.Euler(-Math.sign(dz) * 0.78, 0, 0));
  }
  for (const s of [-1, 1]) { k.box(V(5.8, 0.3, 0.16), post, V(0, 3.3, s * 2.6), 0.02); k.box(V(0.16, 0.3, 5.8), post, V(s * 2.6, 3.3, 0), 0.02); }
  // Rafters under the roof, the shingled hip roof, fascia and a ridge cap.
  for (let i = -2; i <= 2; i++) k.box(V(0.08, 0.14, 5.2), dark, V(i * 1.2, 3.52, 0), 0.01);
  const roof = new THREE.ConeGeometry(5.1, 1.5, 4, 1, true);
  k.add(roof, shingles(), V(0, 4.22, 0), new THREE.Euler(0, Math.PI / 4, 0));
  // The underside: the same pyramid drawn from inside, as a dark timber ceiling.
  k.add(new THREE.ConeGeometry(5.08, 1.5, 4, 1, true), mat("pavilion soffit", () => new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.85, side: THREE.BackSide })), V(0, 4.2, 0), new THREE.Euler(0, Math.PI / 4, 0));
  for (const s of [-1, 1]) { k.box(V(7.25, 0.18, 0.06), dark, V(0, 3.43, s * 3.6), 0.01); k.box(V(0.06, 0.18, 7.25), dark, V(s * 3.6, 3.43, 0), 0.01); }
  k.add(new THREE.ConeGeometry(0.22, 0.25, 4), dark, V(0, 5.02, 0), new THREE.Euler(0, Math.PI / 4, 0));
  // A picnic table in the shade.
  const table = V(1.1, 0, 0.6);
  k.box(V(0.9, 0.06, 1.9), timber(), table.clone().setY(0.76), 0.012);
  for (const s of [-1, 1]) {
    k.box(V(0.3, 0.05, 1.9), timber(), table.clone().add(V(s * 0.7, 0.45, 0)), 0.01);
    k.box(V(1.7, 0.06, 0.06), paint(0x2d3a3d, 0.5, 0.6), table.clone().add(V(0, 0.42, s * 0.7)), 0.01);
    for (const t of [-1, 1]) k.box(V(0.06, 0.8, 0.06), paint(0x2d3a3d, 0.5, 0.6), table.clone().add(V(t * 0.33, 0.4, s * 0.7)), 0.01, new THREE.Euler(0, 0, -t * 0.42));
  }
  k.build(park.scene, "Pavilion");
  solid(park, V(x, y + 0.06, z), V(7, 0.12, 7));
  for (const dx of [-2.6, 2.6]) for (const dz of [-2.6, 2.6]) solid(park, V(x + dx, y + 1.6, z + dz), V(0.42, 3.2, 0.42));
  solid(park, V(x + 1.1, y + 0.45, z + 0.6), V(1.7, 0.9, 1.9));
}

// ---- Monument sign ----------------------------------------------------------------
/**
 * The park's monument sign: a stone wall between two capped pillars, a dark
 * panel carrying the lettering on both faces (`panel` draws it), centred at
 * (x, z) and facing +-z.
 */
export function monumentSign(park: Park, x: number, z: number, panel: HTMLCanvasElement) {
  const base = V(x, 0, z), k = new Kit(base), cap = concrete();
  k.box(V(13.2, 1.0, 0.7), stone(), V(0, 0.5, 0), 0.03);
  k.box(V(13.4, 0.08, 0.8), cap, V(0, 1.04, 0), 0.02);
  for (const s of [-1, 1]) {
    k.box(V(1.2, 3.4, 0.95), stone(), V(s * 7.0, 1.7, 0), 0.03);
    k.box(V(1.36, 0.12, 1.1), cap, V(s * 7.0, 3.46, 0), 0.03);
    k.box(V(1.0, 0.1, 0.85), cap, V(s * 7.0, 3.57, 0), 0.02);
    // A small uplight in the lawn in front of each pillar.
    for (const f of [-1, 1]) k.add(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 12), paint(0x2a2f33, 0.5, 0.5), V(s * 7.0, 0.06, f * 1.1));
  }
  k.box(V(12.8, 2.2, 0.18), paint(0x22382f, 0.55, 0.2), V(0, 2.2, 0), 0.02);
  k.box(V(13.0, 0.08, 0.26), paint(0xb08d4f, 0.35, 0.8), V(0, 3.33, 0), 0.01);
  k.box(V(13.0, 0.08, 0.26), paint(0xb08d4f, 0.35, 0.8), V(0, 1.1, 0), 0.01);
  k.build(park.scene, "Veterans Memorial Park monument");
  const texture = new THREE.CanvasTexture(panel);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0.15, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.08 });
  for (const s of [1, -1]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 2.05), face);
    plane.position.set(x, 2.2, z + s * 0.095);
    plane.rotation.y = s > 0 ? 0 : Math.PI;
    plane.name = `Veterans Memorial Park sign / ${s > 0 ? "front" : "back"}`;
    park.scene.add(plane);
  }
  solid(park, V(x, 0.5, z), V(13.2, 1.0, 0.7));
  for (const s of [-1, 1]) solid(park, V(x + s * 7.0, 1.7, z), V(1.2, 3.4, 0.95));
  solid(park, V(x, 2.2, z), V(12.8, 2.2, 0.2));
}
/** The lettering panel for the monument: bronze letters on dark green, a star, a rule. */
export function veteransPanel() {
  const c = document.createElement("canvas");
  c.width = 2048; c.height = 340;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, 340); bg.addColorStop(0, "#2a4a3c"); bg.addColorStop(1, "#1d3329");
  g.fillStyle = bg; g.fillRect(0, 0, 2048, 340);
  g.strokeStyle = "#b48f4f"; g.lineWidth = 6; g.strokeRect(18, 18, 2012, 304);
  const bronze = g.createLinearGradient(0, 60, 0, 190); bronze.addColorStop(0, "#f3d9a0"); bronze.addColorStop(0.5, "#c69a55"); bronze.addColorStop(1, "#8f6a33");
  const star = (cx: number, cy: number, r: number) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  g.fillStyle = bronze; star(150, 150, 70); star(1898, 150, 70);
  g.textAlign = "center";
  let font = 150; while (font > 40) { g.font = `bold ${font}px Georgia, 'Times New Roman', serif`; if (g.measureText("VETERANS MEMORIAL PARK").width < 1540) break; font -= 2; }
  g.fillStyle = "rgba(0,0,0,.45)"; g.fillText("VETERANS MEMORIAL PARK", 1028, 196);
  g.fillStyle = bronze; g.fillText("VETERANS MEMORIAL PARK", 1024, 190);
  g.fillStyle = "#b48f4f"; g.fillRect(420, 222, 1208, 4);
  g.font = "44px Georgia, 'Times New Roman', serif"; g.fillStyle = "#e9dcbc";
  g.fillText("WOOD PARK  ·  METAL STREET PARK  ·  LAKESIDE TRAIL", 1024, 285);
  return c;
}
