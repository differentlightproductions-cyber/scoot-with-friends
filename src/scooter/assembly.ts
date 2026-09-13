import * as THREE from "three";
import {
  defaultScooter,
  selectedPart,
  type ScooterLoadout,
} from "../data/scooterParts";
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export class ScooterAssembly {
  deckPivot = new THREE.Group();
  barPivot = new THREE.Group();
  wheels: THREE.Mesh[] = [];
  constructor(public root: THREE.Group) {
    this.build(defaultScooter());
  }
  build(loadout: ScooterLoadout) {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.root.clear();
    this.deckPivot = new THREE.Group();
    this.barPivot = new THREE.Group();
    this.wheels = [];
    this.root.add(this.deckPivot, this.barPivot);
    this.deckPivot.position.z = 0.3;
    this.barPivot.position.z = 0.3;
    const material = (color: number) =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.55,
        roughness: 0.42,
      });
    const box = (
      parent: THREE.Object3D,
      size: THREE.Vector3,
      pos: THREE.Vector3,
      color: number,
      part: string,
    ) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        material(color),
      );
      m.position.copy(pos);
      m.castShadow = true;
      m.userData.part = part;
      parent.add(m);
      return m;
    };
    const rod = (
      parent: THREE.Object3D,
      a: THREE.Vector3,
      b: THREE.Vector3,
      r: number,
      color: number,
      part: string,
    ) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, a.distanceTo(b), 10),
        material(color),
      );
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
      m.castShadow = true;
      m.userData.part = part;
      parent.add(m);
      return m;
    };
    const get = (slot: keyof ScooterLoadout) => selectedPart(loadout[slot]);
    const deck = get("deck"),
      length =
        deck.part.shape === "street"
          ? 0.74
          : deck.part.shape === "light"
            ? 0.57
            : 0.62,
      width =
        deck.part.shape === "street"
          ? 0.18
          : deck.part.shape === "light"
            ? 0.115
            : 0.135;
    box(
      this.deckPivot,
      v(width, 0.045, length),
      v(0, 0.13, -length / 2),
      deck.variant.color,
      deck.part.id,
    );
    box(
      this.deckPivot,
      v(width * 0.85, 0.007, length * 0.8),
      v(0, 0.157, -length * 0.53),
      0x263333,
      "griptape",
    );
    rod(
      this.deckPivot,
      v(0, 0.13, -0.06),
      v(0, 0.29, 0),
      0.035,
      deck.variant.color,
      deck.part.id,
    );
    rod(
      this.root,
      v(0, 0.23, 0.3),
      v(0, 0.39, 0.28),
      0.039,
      deck.variant.color,
      deck.part.id,
    );
    const bars = get("bars"),
      barWidth = bars.part.shape === "oversized" ? 0.35 : 0.29,
      barRadius = bars.part.shape === "oversized" ? 0.026 : 0.018;
    rod(
      this.barPivot,
      v(0, 0.2, 0),
      v(0, 1.01, -0.04),
      barRadius,
      bars.variant.color,
      bars.part.id,
    );
    rod(
      this.barPivot,
      v(-barWidth, 1.01, -0.04),
      v(barWidth, 1.01, -0.04),
      barRadius,
      bars.variant.color,
      bars.part.id,
    );
    if (bars.part.shape === "y")
      for (const sign of [-1, 1])
        rod(
          this.barPivot,
          v(0, 0.72, -0.02),
          v(sign * 0.22, 1.01, -0.04),
          0.015,
          bars.variant.color,
          bars.part.id,
        );
    const grips = get("grips"),
      fork = get("fork");
    for (const sign of [-1, 1]) {
      rod(
        this.barPivot,
        v(sign * (barWidth - 0.12), 1.01, -0.04),
        v(sign * (barWidth + 0.01), 1.01, -0.04),
        grips.part.shape === "soft" ? 0.029 : 0.024,
        grips.variant.color,
        grips.part.id,
      );
      if (grips.part.shape === "ribbed")
        for (let j = 0; j < 8; j++)
          rod(
            this.barPivot,
            v(sign * (barWidth - 0.115 + j * 0.015), 1.01, -0.04),
            v(sign * (barWidth - 0.11 + j * 0.015), 1.01, -0.04),
            0.028,
            grips.variant.color,
            grips.part.id,
          );
      rod(
        this.barPivot,
        v(sign * 0.032, 0.09, 0.045),
        v(sign * (fork.part.shape === "reinforced" ? 0.045 : 0.032), 0.28, 0),
        fork.part.shape === "light"
          ? 0.009
          : fork.part.shape === "reinforced"
            ? 0.019
            : 0.012,
        fork.variant.color,
        fork.part.id,
      );
    }
    const clamp = get("clamp");
    for (let i = 0; i < (clamp.part.shape === "triple" ? 3 : 2); i++)
      box(
        this.barPivot,
        v(0.073, 0.026, 0.068),
        v(0, 0.39 + i * 0.029, -0.007),
        clamp.variant.color,
        clamp.part.id,
      );
    const headset = get("headset");
    rod(
      this.barPivot,
      v(0, 0.29, 0),
      v(0, headset.part.shape === "sealed" ? 0.345 : 0.33, 0),
      0.037,
      headset.variant.color,
      headset.part.id,
    );
    const compression = get("compression");
    rod(
      this.barPivot,
      v(0, 0.35, 0),
      v(0, 0.385, 0),
      compression.part.shape === "scs" ? 0.031 : 0.023,
      compression.variant.color,
      compression.part.id,
    );
    const bearings = get("bearings");
    for (const [slot, parent, z] of [
      ["rearWheel", this.deckPivot, -length],
      ["frontWheel", this.barPivot, 0.045],
    ] as const) {
      const wheel = get(slot),
        radius = (wheel.part.compatibility.wheelDiameter ?? 110) / 2000;
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.027, 16).rotateZ(
          Math.PI / 2,
        ),
        material(0x263333),
      );
      m.position.set(0, 0.055, z);
      m.castShadow = true;
      m.userData.part = wheel.part.id;
      m.userData.slot = slot;
      parent.add(m);
      this.wheels.push(m);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(
          radius * 0.62,
          radius * 0.62,
          0.03,
          12,
        ).rotateZ(Math.PI / 2),
        material(wheel.variant.color),
      );
      m.add(hub);
      const bearing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.032, 10).rotateZ(
          Math.PI / 2,
        ),
        material(bearings.variant.color),
      );
      bearing.userData.part = bearings.part.id;
      m.add(bearing);
      box(m, v(0.033, 0.007, radius * 0.82), v(0, 0, 0), 0xb8cbc6, "spoke");
    }
    const brake = get("brake");
    const fender = box(
      this.deckPivot,
      v(
        brake.part.shape === "street" ? 0.09 : 0.06,
        0.016,
        brake.part.shape === "street" ? 0.14 : 0.1,
      ),
      v(0, 0.118, -length + 0.01),
      brake.variant.color,
      brake.part.id,
    );
    fender.rotation.x = 0.2;
    box(
      this.deckPivot,
      v(0.07, 0.008, 0.055),
      v(0, 0.163, -0.1),
      0xe6dfc6,
      "lazer-mark",
    );
    this.root.userData.loadout = structuredClone(loadout);
  }
}
