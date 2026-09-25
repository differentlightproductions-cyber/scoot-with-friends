import * as THREE from "three";

/**
 * Brief things in the sky (#63): the channel of a cloud-to-ground lightning
 * strike and, on clear nights, a shooting star. Both are drawn around the
 * camera without fog. A shooting star sits on a shell just inside the stars
 * (stars.ts, 990 m). The park's mountains stand only 640-1060 m out, so a
 * strike is drawn scaled down to keep its true angular size: a near one (under
 * 5 km) between the park and the ranges, a far one behind them, showing only
 * above the ridges.
 */
const SHELL = 960;
/** Where a strike `distance` metres off is drawn, in metres from the camera. */
export const drawnAt = (distance: number) => (distance < 5000 ? 220 + ((Math.max(distance, 1000) - 1000) / 4000) * 380 : SHELL);
/** About how many metres one pixel spans on the shell (70 degree view, 720 px tall). */
const PIXEL = 1.6;

const vertex = /* glsl */ `
attribute float aSide; attribute float aWeight;
varying float vSide; varying float vWeight;
void main() { vSide = aSide; vWeight = aWeight; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fragment = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha, uSoft;
varying float vSide; varying float vWeight;
void main() {
  // Bright along the middle of the ribbon, soft to its edges.
  float across = 1.0 - abs(vSide);
  float a = uAlpha * vWeight * pow(across, uSoft);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;
const ribbonMaterial = (color: number, soft: number) =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 }, uSoft: { value: soft } },
    vertexShader: vertex, fragmentShader: fragment,
    transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending,
    // Ribbons wind either way round depending on the bolt's path.
    side: THREE.DoubleSide,
  });

/**
 * A ribbon along each polyline (points on the shell), `width` metres across,
 * facing the camera at the shell's centre. `weight` scales a line's brightness
 * (branches are fainter than the main channel) and may taper along it.
 */
function ribbons(lines: { points: THREE.Vector3[]; weight: (t: number) => number; width: (t: number) => number }[]) {
  const position: number[] = [], side: number[] = [], weight: number[] = [], index: number[] = [];
  const tangent = new THREE.Vector3(), across = new THREE.Vector3(), radial = new THREE.Vector3();
  for (const line of lines) {
    const p = line.points, base = position.length / 3;
    p.forEach((point, i) => {
      tangent.subVectors(p[Math.min(i + 1, p.length - 1)], p[Math.max(i - 1, 0)]).normalize();
      radial.copy(point).normalize();
      across.crossVectors(tangent, radial).normalize();
      const t = i / (p.length - 1), w = line.width(t) / 2;
      for (const s of [-1, 1]) {
        position.push(point.x + across.x * w * s, point.y + across.y * w * s, point.z + across.z * w * s);
        side.push(s);
        weight.push(line.weight(t));
      }
      if (i < p.length - 1) {
        const a = base + i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
  geometry.setAttribute("aWeight", new THREE.Float32BufferAttribute(weight, 1));
  geometry.setIndex(index);
  return geometry;
}

/** A jagged path from `a` to `b`: midpoint displacement, `roughness` of each span's length. */
function jagged(a: THREE.Vector3, b: THREE.Vector3, levels: number, roughness: number, random: () => number) {
  let points = [a.clone(), b.clone()];
  for (let level = 0; level < levels; level++) {
    const next: THREE.Vector3[] = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i], q = points[i + 1], length = p.distanceTo(q);
      const mid = p.clone().add(q).multiplyScalar(0.5);
      mid.x += (random() - 0.5) * 2 * roughness * length;
      mid.z += (random() - 0.5) * 2 * roughness * length;
      mid.y += (random() - 0.5) * roughness * length * 0.6;
      next.push(mid, q);
    }
    points = next;
  }
  return points;
}

export class SkyEvents {
  readonly group = new THREE.Group();
  /** Where the camera last looked (world direction): strikes favour the view a little. */
  readonly view = new THREE.Vector3(0, 0, -1);
  private bolt: { core: THREE.Mesh; glow: THREE.Mesh; age: number } | null = null;
  private meteor: { mesh: THREE.Mesh; age: number; life: number; start: THREE.Vector3; axis: THREE.Vector3; arc: number; tail: number } | null = null;
  private coreMaterial = ribbonMaterial(0xf4f6ff, 0.6);
  private glowMaterial = ribbonMaterial(0x9fb4ff, 2.2);
  private meteorMaterial = ribbonMaterial(0xf2fff0, 1.2);
  /** Seconds to the next shooting star while the night is clear. */
  nextMeteor = 60 + Math.random() * 120;
  /** Strikes and shooting stars so far (tests). */
  bolts = 0;
  meteors = 0;

  constructor() {
    this.group.name = "Sky events (lightning, shooting stars)";
    this.group.renderOrder = -998;
    this.group.onBeforeRender = () => {};
  }

  /** Follows the camera like the dome: call from the dome's onBeforeRender. */
  follow(camera: THREE.Camera) {
    this.group.position.copy(camera.position);
    this.group.updateMatrixWorld();
    camera.getWorldDirection(this.view);
  }

  /**
   * A cloud-to-ground strike `distance` metres away: a branched, jagged channel
   * from the cloud base (1.2-2 km up) to the ground. `azimuth` (radians from +z
   * toward +x) defaults to a random bearing, leaning toward where the camera looks.
   */
  strike(distance: number, azimuth?: number, random: () => number = Math.random) {
    this.clearBolt();
    if (azimuth === undefined) {
      const ahead = Math.atan2(this.view.x, this.view.z);
      azimuth = random() < 0.6 ? ahead + (random() - 0.5) * 2.4 : random() * Math.PI * 2;
    }
    const cloud = 1200 + random() * 800;
    const ground = new THREE.Vector3(Math.sin(azimuth) * distance, -2, Math.cos(azimuth) * distance);
    const lean = new THREE.Vector3(random() - 0.5, 0, random() - 0.5).multiplyScalar(cloud * 0.5);
    const top = ground.clone().add(lean).setY(cloud);
    const main = jagged(top, ground, 7, 0.16, random);
    const lines: Parameters<typeof ribbons>[0] = [];
    // Scaled about the camera: the channel keeps its true angular size.
    const at = drawnAt(distance), shrink = at / distance;
    const toShell = (p: THREE.Vector3) => p.clone().multiplyScalar(shrink);
    const bright = THREE.MathUtils.clamp(1.35 - distance / 9000, 0.4, 1);
    lines.push({ points: main.map(toShell), weight: () => bright, width: () => 1 });
    // Branches fork off the upper channel and reach down and out, fainter and thinner.
    const branches = 3 + Math.floor(random() * 4);
    for (let b = 0; b < branches; b++) {
      const at = Math.floor((0.08 + random() * 0.6) * main.length), from = main[at];
      const reach = (ground.y - top.y) * (0.12 + random() * 0.3);
      const to = from.clone().add(new THREE.Vector3((random() - 0.5) * -reach * 1.2, reach, (random() - 0.5) * -reach * 1.2));
      const points = jagged(from, to, 5, 0.2, random).map(toShell);
      lines.push({ points, weight: (t) => bright * 0.55 * (1 - t * 0.8), width: (t) => 1 - t * 0.5 });
    }
    const scale = (px: number) => (line: (typeof lines)[number]) => ({ ...line, width: (t: number) => line.width(t) * px * PIXEL * (at / SHELL) });
    const core = new THREE.Mesh(ribbons(lines.map(scale(2.2))), this.coreMaterial);
    const glow = new THREE.Mesh(ribbons(lines.map(scale(16))), this.glowMaterial);
    for (const m of [core, glow]) { m.frustumCulled = false; m.renderOrder = -998; this.group.add(m); }
    this.bolt = { core, glow, age: 0 };
    this.bolts++;
  }

  /** A shooting star now: a short bright streak across a clear night sky. */
  shootingStar(random: () => number = Math.random) {
    this.clearMeteor();
    const azimuth = random() * Math.PI * 2, elevation = THREE.MathUtils.degToRad(28 + random() * 42);
    const start = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
    // It travels mostly sideways and a little down: rotate about an axis square to that heading.
    const east = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)).multiplyScalar(random() < 0.5 ? 1 : -1);
    const down = new THREE.Vector3(0, -1, 0).projectOnPlane(start).normalize();
    const heading = east.multiplyScalar(0.8).addScaledVector(down, 0.35 + random() * 0.5).normalize();
    const axis = new THREE.Vector3().crossVectors(start, heading).normalize();
    const segments = 14, geometry = ribbons([{ points: Array.from({ length: segments + 1 }, () => new THREE.Vector3(0, SHELL, 0)), weight: (t) => t * t, width: (t) => (0.6 + 2.2 * t) * PIXEL }]);
    const mesh = new THREE.Mesh(geometry, this.meteorMaterial);
    mesh.frustumCulled = false; mesh.renderOrder = -998; this.group.add(mesh);
    this.meteor = { mesh, age: 0, life: 0.45 + random() * 0.75, start, axis, arc: THREE.MathUtils.degToRad(7 + random() * 12), tail: THREE.MathUtils.degToRad(6 + random() * 6) };
    this.meteors++;
  }

  /**
   * `flash`: the strike's light now (weather.ts), which the channel flickers
   * with. `clearNight`: 0..1, how dark and cloudless the sky is; shooting stars
   * come only when it is near 1, about one every one to three minutes.
   */
  step(dt: number, flash: number, clearNight: number) {
    if (this.bolt) {
      this.bolt.age += dt;
      const on = THREE.MathUtils.clamp(flash * 1.6, 0, 1);
      this.coreMaterial.uniforms.uAlpha.value = on;
      this.glowMaterial.uniforms.uAlpha.value = on * 0.3;
      if (this.bolt.age > 1.2) this.clearBolt();
    }
    if (clearNight > 0.7) {
      this.nextMeteor -= dt;
      if (this.nextMeteor <= 0) { this.nextMeteor = 60 + Math.random() * 120; this.shootingStar(); }
    }
    if (this.meteor) this.stepMeteor(dt, clearNight);
  }

  private stepMeteor(dt: number, clearNight: number) {
    const m = this.meteor!;
    m.age += dt;
    const t = m.age / m.life;
    if (t >= 1) { this.clearMeteor(); return; }
    // The head runs along its arc; the tail trails a few degrees behind, shorter as it starts.
    const head = m.arc * t, tail = Math.min(m.tail, head + m.tail * 0.2);
    const position = m.mesh.geometry.getAttribute("position") as THREE.BufferAttribute, count = position.count / 2;
    const radial = new THREE.Vector3(), tangent = new THREE.Vector3(), across = new THREE.Vector3(), point = new THREE.Vector3();
    const width = (m.mesh.geometry.getAttribute("aWeight") as THREE.BufferAttribute);
    for (let i = 0; i < count; i++) {
      const k = i / (count - 1), angle = head - tail * (1 - k);
      radial.copy(m.start).applyAxisAngle(m.axis, angle).normalize();
      tangent.crossVectors(m.axis, radial).normalize();
      across.crossVectors(tangent, radial).normalize();
      point.copy(radial).multiplyScalar(SHELL);
      const w = ((0.6 + 2.8 * k) * PIXEL) / 2;
      position.setXYZ(i * 2, point.x - across.x * w, point.y - across.y * w, point.z - across.z * w);
      position.setXYZ(i * 2 + 1, point.x + across.x * w, point.y + across.y * w, point.z + across.z * w);
      width.setX(i * 2, k * k); width.setX(i * 2 + 1, k * k);
    }
    position.needsUpdate = true; width.needsUpdate = true;
    // It flares up fast and burns out.
    this.meteorMaterial.uniforms.uAlpha.value = clearNight * Math.min(1, t * 8) * (1 - t * t) * 1.3;
  }

  private clearBolt() {
    if (!this.bolt) return;
    for (const m of [this.bolt.core, this.bolt.glow]) { m.geometry.dispose(); m.removeFromParent(); }
    this.bolt = null;
    this.coreMaterial.uniforms.uAlpha.value = 0;
    this.glowMaterial.uniforms.uAlpha.value = 0;
  }
  private clearMeteor() {
    if (!this.meteor) return;
    this.meteor.mesh.geometry.dispose();
    this.meteor.mesh.removeFromParent();
    this.meteor = null;
  }
  /** A channel or a shooting star is showing (tests). */
  get showing() { return { bolt: !!this.bolt, meteor: !!this.meteor }; }

  dispose() {
    this.clearBolt();
    this.clearMeteor();
    for (const m of [this.coreMaterial, this.glowMaterial, this.meteorMaterial]) m.dispose();
    this.group.removeFromParent();
  }
}
