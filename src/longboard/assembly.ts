import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import {
  LONGBOARD_DIMENSIONS as D,
  defaultLongboard,
  longboardPart,
  type LongboardLoadout,
} from "../data/longboardParts";
import { lathe, tube } from "../scooter/surfaces";
import { deckGraphic, gripBump, gripTexture, laminateTexture } from "./graphics";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const HALF = D.length / 2;
const STATION = D.wheelbase / 2;
const AXLE_Y = D.wheelDiameter / 2;
const TILT = (D.kingpinAngle * Math.PI) / 180;

/** Half the deck width at a point along its length (symmetric nose and tail). */
export function deckHalfWidth(z: number) {
  const a = Math.abs(z);
  if (a <= 0.22) return 0.125;
  if (a <= 0.4) {
    const t = (a - 0.22) / 0.18;
    return 0.125 - 0.022 * t * t * (3 - 2 * t);
  }
  return 0.103 * Math.sqrt(Math.max(0, 1 - ((a - 0.4) / (HALF - 0.4)) ** 2));
}

/**
 * Height of the deck's underside. Drop-through stations sit at deckBottom; the
 * centre dips by the rocker and the ends kick up slightly past the trucks.
 * Concave lifts the rails.
 */
export function deckUnderside(x: number, z: number) {
  const a = Math.abs(z);
  const rocker =
    a < STATION
      ? -D.rocker * (1 - (a / STATION) ** 2)
      : 0.012 * ((a - STATION) / (HALF - STATION)) ** 2;
  return D.deckBottom + rocker + D.concave * (x / 0.125) ** 2;
}

/** The standing surface height at a deck-local point. */
export function deckTop(x: number, z: number) {
  return deckUnderside(x, z) + D.thickness;
}

type Batch = { geometries: THREE.BufferGeometry[]; material: THREE.Material; part: string };

/**
 * Splits triangles until no edge is longer than `maxEdge`, keeping material
 * groups and UVs. Flat shapes triangulate into long slivers spanning the whole
 * deck; bent for concave and rocker, those slivers cut straight lines through
 * anything layered on the true curve (the grip and the underside graphic).
 */
function subdivide(source: THREE.BufferGeometry, maxEdge: number) {
  const g = source.index ? source.toNonIndexed() : source;
  const position = g.getAttribute("position") as THREE.BufferAttribute,
    uv = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
  const groups = g.groups.length ? g.groups : [{ start: 0, count: position.count, materialIndex: 0 }];
  type Corner = { p: THREE.Vector3; t: THREE.Vector2 };
  const points: number[] = [],
    uvs: number[] = [],
    out = new THREE.BufferGeometry();
  for (const group of groups) {
    const first = points.length / 3;
    const stack: Corner[][] = [];
    for (let i = group.start; i < group.start + group.count; i += 3)
      stack.push(
        [i, i + 1, i + 2].map((k) => ({
          p: new THREE.Vector3().fromBufferAttribute(position, k),
          t: uv ? new THREE.Vector2().fromBufferAttribute(uv, k) : new THREE.Vector2(),
        })),
      );
    while (stack.length) {
      const tri = stack.pop()!;
      const edges = [0, 1, 2].map((k) => tri[k].p.distanceTo(tri[(k + 1) % 3].p));
      const longest = edges.indexOf(Math.max(...edges));
      if (edges[longest] <= maxEdge) {
        for (const c of tri) {
          points.push(c.p.x, c.p.y, c.p.z);
          uvs.push(c.t.x, c.t.y);
        }
        continue;
      }
      const a = tri[longest],
        b = tri[(longest + 1) % 3],
        c = tri[(longest + 2) % 3];
      const mid = { p: a.p.clone().lerp(b.p, 0.5), t: a.t.clone().lerp(b.t, 0.5) };
      stack.push([a, mid, c], [mid, b, c]);
    }
    out.addGroup(first, points.length / 3 - first, group.materialIndex ?? 0);
  }
  out.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  if (g !== source) g.dispose();
  source.dispose();
  return out;
}

/**
 * One Sometimes Summer drop-through longboard, built from its loadout. The
 * same assembly serves riding, the carried board, racks, the shop and the
 * builder preview, so what is sold is what is ridden. Nothing here creates a
 * collider; handling lives in the longboard controller.
 */
export class LongboardAssembly {
  /** Rolls with the rider's lean about the axle line; the trucks stay on the road. */
  deck = new THREE.Group();
  /** Front then rear hanger groups; each steers about its kingpin axis. */
  hangers: THREE.Group[] = [];
  /** Four wheel groups (front left/right, rear left/right) that spin on the axle. */
  wheels: THREE.Group[] = [];
  /** Where the front and rear shoes stand on the grip. */
  footSockets: THREE.Object3D[] = [];
  /** Where a hand holds the board when carried: the rail at its centre. */
  carrySocket = new THREE.Object3D();
  private textures: THREE.Texture[] = [];
  private materials = new Map<string, THREE.Material>();

  constructor(
    public root: THREE.Group,
    loadout: LongboardLoadout = defaultLongboard(),
  ) {
    this.build(loadout);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.materials.clear();
    this.textures = [];
    this.root.clear();
  }

  build(loadout: LongboardLoadout) {
    this.dispose();
    this.deck = new THREE.Group();
    this.deck.position.y = AXLE_Y;
    this.root.add(this.deck);
    this.hangers = [];
    this.wheels = [];
    this.footSockets = [];
    const deckPart = longboardPart(loadout.deck),
      trucks = longboardPart(loadout.trucks),
      wheels = longboardPart(loadout.wheels),
      bushings = longboardPart(loadout.bushings),
      bearings = longboardPart(loadout.bearings),
      hardware = longboardPart(loadout.hardware);
    const batches = new Map<THREE.Object3D, Map<string, Batch>>();
    const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, part: string) => {
      let g = geometry;
      if (g.index) {
        const flat = g.toNonIndexed();
        g.dispose();
        g = flat;
      }
      let byMaterial = batches.get(parent);
      if (!byMaterial) batches.set(parent, (byMaterial = new Map()));
      const key = part + "/" + material.uuid;
      if (!byMaterial.has(key)) byMaterial.set(key, { geometries: [], material, part });
      byMaterial.get(key)!.geometries.push(g);
    };
    const mat = (key: string, make: () => THREE.Material) => {
      if (!this.materials.has(key)) this.materials.set(key, make());
      return this.materials.get(key)!;
    };
    const metal = (color: number, finish: "cast" | "steel" | "black-oxide") =>
      mat(`${finish}/${color}`, () =>
        new THREE.MeshStandardMaterial({
          color,
          metalness: finish === "steel" ? 0.9 : finish === "black-oxide" ? 0.55 : 0.72,
          roughness: finish === "steel" ? 0.28 : finish === "black-oxide" ? 0.5 : 0.42,
        }),
      );
    const tex = <T extends THREE.Texture>(t: T) => {
      this.textures.push(t);
      return t;
    };

    // ---- Deck ------------------------------------------------------------
    // Outline sampled along the length; the shape's second coordinate is -z so
    // that after laying the extrusion flat the nose points toward +z.
    const outline = (inset = 0) => {
      const shape = new THREE.Shape(),
        steps = 90;
      for (let i = 0; i <= steps; i++) {
        const z = -HALF + inset + ((D.length - inset * 2) * i) / steps;
        const x = Math.max(0.0005, deckHalfWidth(z) - inset);
        i ? shape.lineTo(x, -z) : shape.moveTo(x, -z);
      }
      for (let i = steps; i >= 0; i--) {
        const z = -HALF + inset + ((D.length - inset * 2) * i) / steps;
        shape.lineTo(-Math.max(0.0005, deckHalfWidth(z) - inset), -z);
      }
      shape.closePath();
      for (const station of [STATION, -STATION]) {
        // Drop-through cutout: the truck's pivot housing passes through here.
        const hole = new THREE.Path(),
          hx = 0.027,
          hz = 0.034,
          r = 0.009;
        hole.moveTo(-hx + r, -(station - hz));
        hole.lineTo(hx - r, -(station - hz));
        hole.quadraticCurveTo(hx, -(station - hz), hx, -(station - hz + r));
        hole.lineTo(hx, -(station + hz - r));
        hole.quadraticCurveTo(hx, -(station + hz), hx - r, -(station + hz));
        hole.lineTo(-hx + r, -(station + hz));
        hole.quadraticCurveTo(-hx, -(station + hz), -hx, -(station + hz - r));
        hole.lineTo(-hx, -(station - hz + r));
        hole.quadraticCurveTo(-hx, -(station - hz), -hx + r, -(station - hz));
        shape.holes.push(hole);
      }
      return shape;
    };
    // Lays a flat (x, y=0..t, z) body onto the concave/rocker profile.
    const bend = (g: THREE.BufferGeometry, surface: (x: number, z: number) => number) => {
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + surface(p.getX(i), p.getZ(i)) - AXLE_Y);
      p.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    };
    const flat = (g: THREE.BufferGeometry) => subdivide(g.rotateX(-Math.PI / 2), 0.02);
    const body = flat(
      new THREE.ExtrudeGeometry(outline(), {
        depth: D.thickness,
        bevelEnabled: true,
        bevelThickness: 0.0012,
        bevelSize: 0.0012,
        bevelSegments: 2,
        curveSegments: 6,
        steps: 1,
      }),
    );
    // After rotation the extrusion spans y 0..thickness; lift it onto the profile.
    bend(body, (x, z) => deckUnderside(x, z));
    const laminate = tex(laminateTexture());
    laminate.repeat.set(40, 1 / D.thickness);
    const woodFace = mat("deck-body", () => new THREE.MeshStandardMaterial({ color: 0xc79a62, roughness: 0.72 }));
    const edge = mat("deck-edge", () => new THREE.MeshStandardMaterial({ map: laminate, roughness: 0.66 }));
    // Keep the two material groups the extrusion provides: faces and edges.
    const deckMesh = new THREE.Mesh(body, [woodFace, edge]);
    deckMesh.userData.part = deckPart.part.id;
    deckMesh.castShadow = deckMesh.receiveShadow = true;
    deckMesh.name = "Sometimes Summer deck";
    this.deck.add(deckMesh);

    // `fromAbove` sheets are read looking down with the nose ahead, which
    // mirrors the deck's x axis relative to reading the underside from below.
    const surfaceSheet = (inset: number, surface: (x: number, z: number) => number, lift: number, fromAbove: boolean) => {
      const g = flat(new THREE.ShapeGeometry(outline(inset), 6));
      const p = g.getAttribute("position"),
        uv = g.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          z = p.getZ(i);
        // The artwork's top edge is the nose.
        uv.setXY(i, (fromAbove ? 0.125 - x : x + 0.125) / 0.25, (z + HALF) / D.length);
      }
      // Sheets shade smoothly; welding shared corners lets normals average.
      return bend(mergeVertices(g), (x, z) => surface(x, z) + lift);
    };
    // Sheets sit just outside the deck's 1.2 mm bevel, or the laminate face
    // shows through them.
    const grip = new THREE.Mesh(
      surfaceSheet(0.006, deckTop, 0.0019, true),
      mat("grip/" + deckPart.variant.id, () =>
        new THREE.MeshStandardMaterial({
          map: tex(gripTexture(deckPart.variant.id)),
          bumpMap: tex(gripBump()),
          bumpScale: 0.0009,
          roughness: 0.97,
        }),
      ),
    );
    grip.userData.part = loadout.grip.partId;
    grip.receiveShadow = true;
    grip.name = "Sometimes Summer grip";
    this.deck.add(grip);
    const graphicGeometry = surfaceSheet(0.004, deckUnderside, -0.0019, false);
    // The underside is seen from below, so flip the winding to face down.
    const index = graphicGeometry.index;
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        index.setX(i, index.getX(i + 1));
        index.setX(i + 1, a);
      }
      graphicGeometry.computeVertexNormals();
    }
    const graphic = new THREE.Mesh(
      graphicGeometry,
      mat("graphic/" + deckPart.variant.id, () =>
        new THREE.MeshStandardMaterial({ map: tex(deckGraphic(deckPart.variant.id)), roughness: 0.48 }),
      ),
    );
    graphic.userData.part = deckPart.part.id;
    graphic.name = `Sometimes Summer ${deckPart.variant.name} graphic`;
    this.deck.add(graphic);

    // ---- Trucks ----------------------------------------------------------
    const truckColor = metal(trucks.variant.color, "cast"),
      steel = metal(0xbcc4c6, "steel"),
      oxide = metal(hardware.variant.color, "black-oxide"),
      bushingMat = mat("bushing/" + bushings.variant.id, () =>
        new THREE.MeshStandardMaterial({ color: bushings.variant.color, roughness: 0.55 }),
      ),
      urethane = mat("wheel/" + wheels.variant.id, () =>
        new THREE.MeshPhysicalMaterial({
          color: wheels.variant.color,
          roughness: 0.42,
          clearcoat: 0.25,
          clearcoatRoughness: 0.5,
          sheen: 0.2,
        }),
      ),
      core = mat("wheel-core", () => new THREE.MeshStandardMaterial({ color: 0xe4e6e2, roughness: 0.5 })),
      shield = mat("bearing-shield", () =>
        new THREE.MeshStandardMaterial({ color: bearings.variant.accent ?? 0x1c1f20, roughness: 0.6 }),
      );
    const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, segments = 16) => {
      const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), segments);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      return g;
    };
    const along = (a: THREE.Vector3, direction: THREE.Vector3, from: number, to: number, r: number, segments = 20) =>
      rod(a.clone().addScaledVector(direction, from), a.clone().addScaledVector(direction, to), r, segments);
    const hex = (at: THREE.Vector3, r: number, h: number, axis: THREE.Vector3) => {
      const g = new THREE.CylinderGeometry(r, r, h, 6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), axis));
      g.translate(at.x, at.y, at.z);
      return g;
    };
    for (const [index, direction] of [
      [0, 1],
      [1, -1],
    ] as const) {
      // Truck frame: origin on the axle, +z outboard (toward the nose for the
      // front truck, the tail for the rear). Heights are above the axle.
      const truck = new THREE.Group();
      truck.name = index === 0 ? "Front truck" : "Rear truck";
      truck.position.set(0, AXLE_Y, direction * STATION);
      truck.rotation.y = direction > 0 ? 0 : Math.PI;
      this.root.add(truck);
      const deckFace = D.deckBottom + D.thickness - AXLE_Y; // top of the deck at the station
      const plateTop = deckFace + 0.007;
      // Baseplate on the grip side (drop-through), flanges over the cutout.
      const plateShape = new THREE.Shape();
      const px = 0.046,
        pz = 0.056,
        pr = 0.012;
      plateShape.moveTo(-px + pr, -pz);
      plateShape.lineTo(px - pr, -pz);
      plateShape.quadraticCurveTo(px, -pz, px, -pz + pr);
      plateShape.lineTo(px, pz - pr);
      plateShape.quadraticCurveTo(px, pz, px - pr, pz);
      plateShape.lineTo(-px + pr, pz);
      plateShape.quadraticCurveTo(-px, pz, -px, pz - pr);
      plateShape.lineTo(-px, -pz + pr);
      plateShape.quadraticCurveTo(-px, -pz, -px + pr, -pz);
      const bolts = [
        [-0.036, -0.04],
        [0.036, -0.04],
        [-0.036, 0.04],
        [0.036, 0.04],
      ];
      for (const [bx, bz] of bolts) {
        const h = new THREE.Path();
        h.absarc(bx, bz, 0.0035, 0, Math.PI * 2, true);
        plateShape.holes.push(h);
      }
      const plate = new THREE.ExtrudeGeometry(plateShape, {
        depth: 0.007,
        bevelEnabled: true,
        bevelSize: 0.0015,
        bevelThickness: 0.0015,
        bevelSegments: 2,
        curveSegments: 8,
      });
      plate.rotateX(-Math.PI / 2);
      plate.translate(0, deckFace + 0.0015, 0);
      add(truck, plate, truckColor, trucks.part.id);
      // Pivot housing drops through the cutout on the outboard side; the
      // kingpin boss sits inboard. Both are part of the same casting.
      // It stays inside the deck cutout (z within +-0.034) down to the pivot cup.
      const housing = new THREE.Shape();
      housing.moveTo(0.004, plateTop);
      housing.lineTo(0.029, plateTop);
      housing.quadraticCurveTo(0.032, deckFace - 0.02, 0.036, 0.034);
      housing.quadraticCurveTo(0.028, 0.022, 0.012, 0.032);
      housing.quadraticCurveTo(0.004, deckFace - 0.02, 0.004, plateTop);
      housing.closePath();
      const housingGeometry = new THREE.ExtrudeGeometry(housing, {
        depth: 0.034,
        bevelEnabled: true,
        bevelSize: 0.003,
        bevelThickness: 0.003,
        bevelSegments: 3,
        curveSegments: 10,
      });
      housingGeometry.translate(0, 0, -0.017);
      housingGeometry.rotateY(-Math.PI / 2);
      add(truck, housingGeometry, truckColor, trucks.part.id);
      // Reverse kingpin: it leaves the baseplate just inside the cutout's
      // inboard edge and runs down and inboard, under the deck, at 50 degrees.
      const kingpinAxis = v(0, -Math.sin(TILT), -Math.cos(TILT));
      const kingpinBase = v(0, deckFace, -0.018);
      add(truck, along(kingpinBase, kingpinAxis, -0.007, 0.013, 0.011, 24), truckColor, trucks.part.id);
      add(truck, along(kingpinBase, kingpinAxis, 0, 0.08, 0.004, 12), steel, trucks.part.id);
      // Mounting hardware: nuts on the baseplate, low heads under the deck.
      for (const [bx, bz] of bolts) {
        add(truck, hex(v(bx, plateTop + 0.0035, bz), 0.0052, 0.005, v(0, 1, 0)), oxide, hardware.part.id);
        add(truck, rod(v(bx, deckFace - D.thickness - 0.0014, bz), v(bx, plateTop + 0.006, bz), 0.0028, 10), oxide, hardware.part.id);
        // Truck frame to deck frame: turn with the truck, then move to its station.
        const head = new THREE.CylinderGeometry(0.0058, 0.0052, 0.0022, 16);
        head.translate(bx, deckFace - D.thickness - 0.0016, bz);
        head.applyMatrix4(new THREE.Matrix4().makeRotationY(direction > 0 ? 0 : Math.PI));
        head.translate(0, 0, direction * STATION);
        add(this.deck, head, oxide, hardware.part.id);
      }
      // Hanger: steers as a unit with its axle, bearings and wheels.
      const hanger = new THREE.Group();
      hanger.name = truck.name + " hanger";
      hanger.userData.axis = v(0, Math.cos(TILT), Math.sin(TILT)); // steering axis, roughly the pivot line
      hanger.userData.direction = direction;
      truck.add(hanger);
      this.hangers.push(hanger);
      const seat = kingpinBase.clone().addScaledVector(kingpinAxis, 0.045);
      // Bushings stack on the kingpin: boardside above the seat, roadside below.
      const barrel = (from: number, to: number) => {
        const g = lathe([[0.004, 0], [0.0125, 0], [0.0135, 0.004], [0.0135, to - from - 0.004], [0.0125, to - from], [0.004, to - from]], 24);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), kingpinAxis));
        g.translate(kingpinBase.x + kingpinAxis.x * from, kingpinBase.y + kingpinAxis.y * from, kingpinBase.z + kingpinAxis.z * from);
        return g;
      };
      add(truck, barrel(0.015, 0.036), bushingMat, bushings.part.id);
      add(truck, barrel(0.054, 0.07), bushingMat, bushings.part.id);
      add(truck, along(kingpinBase, kingpinAxis, 0.07, 0.073, 0.014, 20), steel, trucks.part.id);
      add(truck, hex(kingpinBase.clone().addScaledVector(kingpinAxis, 0.077), 0.0068, 0.007, kingpinAxis), steel, trucks.part.id);
      // Hanger casting: tapered axle housing plus the web that carries the
      // bushing seat and reaches the pivot cup in the housing.
      const beam = lathe([[0, -0.085], [0.0085, -0.085], [0.0105, -0.07], [0.013, -0.02], [0.013, 0.02], [0.0105, 0.07], [0.0085, 0.085], [0, 0.085]], 24);
      beam.rotateZ(Math.PI / 2);
      add(hanger, beam, truckColor, trucks.part.id);
      // Side profile (outboard z, height y): axle below, bushing seat inboard,
      // pivot nose reaching up into the cup in the housing.
      const web = new THREE.Shape();
      web.moveTo(0.008, -0.009);
      web.quadraticCurveTo(seat.z + 0.012, seat.y - 0.034, seat.z - 0.004, seat.y - 0.013);
      web.quadraticCurveTo(seat.z - 0.016, seat.y, seat.z - 0.002, seat.y + 0.013);
      web.quadraticCurveTo(0.0, 0.03, 0.03, 0.036);
      web.lineTo(0.035, 0.029);
      web.quadraticCurveTo(0.016, 0.012, 0.008, -0.009);
      web.closePath();
      const webGeometry = new THREE.ExtrudeGeometry(web, {
        depth: 0.026,
        bevelEnabled: true,
        bevelSize: 0.003,
        bevelThickness: 0.003,
        bevelSegments: 3,
        curveSegments: 10,
      });
      webGeometry.translate(0, 0, -0.013);
      webGeometry.rotateY(-Math.PI / 2);
      add(hanger, webGeometry, truckColor, trucks.part.id);
      add(hanger, along(seat, kingpinAxis, -0.01, 0.01, 0.016, 24), truckColor, trucks.part.id);
      add(hanger, rod(v(-0.128, 0, 0), v(0.128, 0, 0), 0.004, 12), steel, trucks.part.id);
      for (const side of [-1, 1]) {
        const x = side * 0.1145;
        // Speed washers either side of the wheel, then the axle nut.
        add(hanger, rod(v(side * 0.0865, 0, 0), v(side * 0.0885, 0, 0), 0.0065, 16), steel, bearings.part.id);
        add(hanger, rod(v(side * 0.1405, 0, 0), v(side * 0.1425, 0, 0), 0.0065, 16), steel, bearings.part.id);
        add(hanger, hex(v(side * 0.1455, 0, 0), 0.0058, 0.006, v(1, 0, 0)), steel, trucks.part.id);
        const wheel = new THREE.Group();
        wheel.position.x = x;
        wheel.name = `${index === 0 ? "Front" : "Rear"} ${side * direction > 0 ? "right" : "left"} wheel`;
        hanger.add(wheel);
        this.wheels.push(wheel);
        const half = D.wheelWidth / 2,
          r = AXLE_Y;
        const tyre = lathe(
          [
            [0.016, -half + 0.004],
            [0.028, -half],
            [0.0325, -half + 0.0008],
            [r, -half + 0.0045],
            [r, half - 0.0045],
            [0.0325, half - 0.0008],
            [0.028, half],
            [0.016, half - 0.004],
          ],
          48,
        );
        tyre.rotateZ(Math.PI / 2);
        add(wheel, tyre, urethane, wheels.part.id);
        const hub = lathe([[0.0112, -half + 0.004], [0.0165, -half + 0.004], [0.0165, half - 0.004], [0.0112, half - 0.004]], 32);
        hub.rotateZ(Math.PI / 2);
        add(wheel, hub, core, wheels.part.id);
        for (const face of [-1, 1]) {
          const race = lathe([[0.004, -0.0035], [0.011, -0.0035], [0.011, 0.0035], [0.004, 0.0035]], 24);
          race.rotateZ(Math.PI / 2);
          race.translate(face * (half - 0.0075), 0, 0);
          add(wheel, race, steel, bearings.part.id);
          const cover = new THREE.RingGeometry(0.0048, 0.0098, 24);
          cover.rotateY((face * Math.PI) / 2);
          cover.translate(face * (half - 0.0039), 0, 0);
          add(wheel, cover, shield, bearings.part.id);
        }

        add(wheel, rod(v(-0.009, 0, 0), v(0.009, 0, 0), 0.0055, 12), steel, bearings.part.id);
      }
    }

    // ---- Sockets -----------------------------------------------------------
    for (const z of [0.25, -0.26]) {
      const socket = new THREE.Object3D();
      socket.position.set(0, deckTop(0, z) - AXLE_Y + 0.002, z);
      this.deck.add(socket);
      this.footSockets.push(socket);
    }
    this.carrySocket = new THREE.Object3D();
    this.carrySocket.position.set(0.125, deckTop(0.125, 0) - AXLE_Y - 0.006, 0);
    this.deck.add(this.carrySocket);

    for (const [parent, groups] of batches)
      for (const batch of groups.values()) {
        const merged = mergeGeometries(batch.geometries);
        batch.geometries.forEach((g) => g.dispose());
        const mesh = new THREE.Mesh(merged, batch.material);
        mesh.userData.part = batch.part;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    this.root.userData.loadout = structuredClone(loadout);
    this.root.userData.assetRevision = "sometimes-summer-drop-through-1";
  }

  /**
   * Poses the board for a lean: the deck rolls about the axle line while each
   * hanger turns about its steering axis in the opposite sense, so both trucks
   * carve the same way and the wheels stay on the road.
   */
  setLean(roll: number, steer: number) {
    this.deck.rotation.z = roll;
    for (const hanger of this.hangers) {
      const axis = hanger.userData.axis as THREE.Vector3;
      hanger.quaternion.setFromAxisAngle(axis, -steer * (hanger.userData.direction as number));
    }
  }

  /** Spins every wheel to the distance travelled. */
  setRoll(angle: number) {
    for (const wheel of this.wheels) wheel.rotation.x = angle;
  }
}

/** Cheap helper for callers that only need the curve used by the rider's feet. */
export const LONGBOARD_STANCE = {
  front: v(0, 0, 0.25),
  rear: v(0, 0, -0.26),
  tube,
};
