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
export class WaterEffects {
  particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number }[] = [];
  private geometry = new THREE.IcosahedronGeometry(0.07, 0);
  private material = new THREE.MeshBasicMaterial({ color: 0xc6eef2 });
  constructor(public scene: THREE.Scene) {}
  splash(x: number, z: number) {
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI * 2) / 24,
        mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.position.set(x, 0.1, z);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(a) * (1 + (i % 3)),
          2 + (i % 4) * 0.5,
          Math.sin(a) * (1 + (i % 3)),
        ),
        age: 0,
      });
    }
  }
  update(dt: number, time: number) {
    const lake = this.scene.getObjectByName("lake-water") as
      | THREE.Mesh
      | undefined;
    if (lake) {
      if (lake.userData.waterShader)
        lake.userData.waterShader.uniforms.waterTime.value = time;
      const m = lake.material as THREE.MeshStandardMaterial;
      m.roughness = 0.28 + Math.sin(time * 0.7) * 0.04;
      lake.position.y = 0.009 + Math.sin(time) * 0.004;
    }
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      p.velocity.y -= 7 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.scale.setScalar(Math.max(0, 1 - p.age / 1.2));
      if (p.age > 1.2) {
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });
  }
}
