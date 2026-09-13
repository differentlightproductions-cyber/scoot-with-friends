import { activeLayout, brushHeight } from "../editor/layout";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { Park } from "./park";
import { GROUPS } from "../physics/groups";
const clamp = THREE.MathUtils.clamp;
export const metalQuarters = [
  {
    id: "metal-west-quarter",
    x0: 48,
    x1: 54,
    z0: 8,
    z1: 18,
    h: 2.2,
    reverse: true,
  },
  {
    id: "metal-east-quarter",
    x0: 72,
    x1: 78,
    z0: 8,
    z1: 18,
    h: 2.2,
    reverse: false,
  },
];
function quarterHeight(
  x: number,
  reverse: boolean,
  x0: number,
  x1: number,
  h: number,
) {
  const d = clamp(reverse ? x1 - x : x - x0, 0, 3.2),
    r = (3.2 * 3.2 + h * h) / (2 * h);
  return r - Math.sqrt(Math.max(0, r * r - d * d));
}
export function metalHeight(x: number, z: number) {
  let h = 0;
  for (const m of metalQuarters)
    if (x >= m.x0 && x <= m.x1 && z >= m.z0 && z <= m.z1)
      h = Math.max(h, quarterHeight(x, m.reverse, m.x0, m.x1, m.h));
  // Four-way street pyramid; clear central stairs beside the bank, with a flat catch deck.
  if (x >= 59 && x <= 72 && z >= -14 && z <= -2) {
    const side = clamp(Math.min(x - 59, 72 - x) / 3.5, 0, 1);
    const front = clamp((z + 14) / 4, 0, 1),
      back = clamp((-2 - z) / 4, 0, 1);
    h = Math.max(h, 1.4 * Math.min(side, front, back));
    if (x >= 65 && x <= 68 && z >= -6)
      h = Math.ceil(clamp((-2 - z) / 0.8, 0, 5)) * 0.28;
  }
  if (x >= 81 && x <= 85 && z >= -15 && z <= -8)
    h = Math.max(h, 0.9 * clamp((z + 15) / 5.5, 0, 1));
  return h;
}
export function bmxHeight(x: number, z: number) {
  if (x < -81 || x > -43 || z < -28 || z > 34) return 0;
  const edge = Math.min(
    clamp((x + 81) / 3, 0, 1),
    clamp((-43 - x) / 3, 0, 1),
    clamp((z + 28) / 4, 0, 1),
    clamp((34 - z) / 4, 0, 1),
  );
  const lane = Math.floor((x + 81) / 9.5);
  const roller = Math.pow(
    Math.max(0, Math.sin(((z + lane * 2) * Math.PI) / 9)),
    2,
  );
  const berm = Math.pow(clamp((Math.abs(z - 3) - 22) / 7, 0, 1), 2) * 1.8;
  return edge * (roller * (lane % 2 ? 0.85 : 1.25) + berm);
}
export function extensionHeight(x: number, z: number) {
  return Math.max(metalHeight(x, z), bmxHeight(x, z));
}

export function buildMemorialGrounds(park: Park) {
  const { scene, world } = park;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
    solid = false,
  ) => {
    const mesh = park.box(v(x, y, z), v(w, h, d), c, solid);
    if (h <= 0.06) {
      mesh.castShadow = false;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.polygonOffset = true;
      material.polygonOffsetFactor = 0;
      material.polygonOffsetUnits = Math.round(-(y + h / 2) * 3000);
    }
    return mesh;
  };
  // Continuous flat collider under the connected grounds. Existing wooden ramp triangles stay untouched.
  if (!activeLayout?.terrain.length)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(116, 0.1, 125)
        .setTranslation(0, -0.1, -45)
        .setCollisionGroups(GROUPS.surface),
    );
  else {
    const verts: number[] = [],
      indices: number[] = [],
      nx = 116,
      nz = 125;
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = -116 + i * 2,
          z = -170 + j * 2;
        verts.push(x, brushHeight(x, z, 0), z);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(verts),
        new Uint32Array(indices),
      ).setCollisionGroups(GROUPS.surface),
    );
  }
  box(0, -0.045, -45, 232, 0.06, 250, 0xb49a73);
  box(5, -0.014, 18, 195, 0.012, 82, 0x7f9b55);
  box(-62, -0.005, 3, 38, 0.008, 62, 0xc3a16f).name = "Dirt riding track base";
  const patch = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    step: number,
    height: (x: number, z: number) => number,
    color: number,
  ) => {
    const nx = Math.round((x1 - x0) / step),
      nz = Math.round((z1 - z0) / step),
      points: number[] = [],
      indices: number[] = [];
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * step,
          z = z0 + j * step;
        points.push(x, height(x, z), z);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    const visible: number[] = [];
    for (let i = 0; i < indices.length; i += 3)
      if (
        indices.slice(i, i + 3).some((index) => points[index * 3 + 1] > 0.001)
      )
        visible.push(...indices.slice(i, i + 3));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    g.setIndex(visible);
    g.computeVertexNormals();
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        color,
        roughness: color === 0x333c42 ? 0.56 : 0.95,
        metalness: color === 0x333c42 ? 0.4 : 0,
      }),
    );
    m.name =
      x0 === -81
        ? "Dirt riding track"
        : x0 === 47.75
          ? "Metal half pipe"
          : x0 === 58.75
            ? "Metal pyramid"
            : "Metal kicker";
    m.receiveShadow = true;
    m.castShadow = true;
    scene.add(m);
    park.solids.push(m);
    m.userData.collider = world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(points),
        new Uint32Array(indices),
      )
        .setFriction(0)
        .setCollisionGroups(GROUPS.surface),
    ).handle;
  };
  box(65, 0.001, 0, 46, 0.008, 48, 0xb8bab3);
  patch(47.75, 78.25, 7.75, 18.25, 0.125, metalHeight, 0x333c42);
  patch(58.75, 72.25, -14.25, -1.75, 0.125, metalHeight, 0x333c42);
  patch(80.75, 85.25, -15.25, -7.75, 0.125, metalHeight, 0x333c42);
  // The BMX track is authored terrain, so brush strokes rebuild both its
  // visible sand and matching collision surface.
  patch(
    -81,
    -43,
    -28,
    34,
    0.25,
    (x, z) => brushHeight(x, z, bmxHeight(x, z)),
    0xc3a16f,
  );
  const metalRail = (
    name: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    kind: "rail" | "ledge" = "rail",
  ) => {
    const before = scene.children.length;
    park.rail(name, a, b, kind);
    for (const m of scene.children.slice(before))
      if (m instanceof THREE.Mesh)
        (m.material as THREE.MeshStandardMaterial).color.set(0x899396);
  };
  for (const m of metalQuarters) {
    const lip = m.reverse ? m.x1 - 3.2 : m.x0 + 3.2;
    metalRail(
      m.id + " coping",
      v(lip, m.h + 0.025, m.z0 + 0.1),
      v(lip, m.h + 0.025, m.z1 - 0.1),
      "ledge",
    );
    const back = m.reverse ? m.x0 + 0.15 : m.x1 - 0.15;
    for (let z = m.z0; z <= m.z1; z += 2)
      box(back, m.h + 0.6, z, 0.08, 1.2, 0.08, 0x343d42, true);
    for (const y of [m.h + 0.55, m.h + 1.15])
      box(back, y, 13, 0.08, 0.065, 10, 0x465158, true);
    for (const z of [m.z0, m.z1])
      for (let x = m.x0; x < m.x1; x += 0.25) {
        const h = metalHeight(x + 0.125, z);
        box(x + 0.125, h / 2, z, 0.25, h, 0.06, 0x252c31);
      }
  }
  // Stair noses and risers make this line read as stairs rather than a dark bank.
  for (let i = 0; i < 5; i++) {
    const y = 1.4 - i * 0.28,
      z = -5.6 + i * 0.8;
    box(66.5, y / 2, z, 3, y, 0.8, 0x252c31);
    box(66.5, y + 0.008, z + 0.34, 3, 0.015, 0.1, 0x929ca0);
  }
  metalRail("Metal stair handrail", v(65, 2.04, -6.8), v(65, 0.55, -1.7));
  metalRail("Metal pyramid bank rail", v(61, 0.58, -14), v(62.8, 1.96, -9.7));
  box(51, 0.35, -7, 1.8, 0.7, 10, 0x333c42, true);
  for (const side of [-1, 1])
    metalRail(
      "Metal ledge " + side,
      v(51 + side * 0.86, 0.73, -12),
      v(51 + side * 0.86, 0.73, -2),
      "ledge",
    );
  metalRail("Metal flat rail", v(80, 0.6, 0), v(80, 0.6, 7));
  for (const x of [44, 86])
    park.bench("Metal park bench " + x, x, 0, 23, 1, 3.5);
  // Broad, level paths give a continuous ride from wood to metal, parking and lake.
  let pathSerial = 0;
  const path = (points: number[][], width = 4, color = 0xc8c5b7) => {
    const pathId = pathSerial++;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1];
      const mesh = box(
        (a[0] + b[0]) / 2,
        0.006,
        (a[1] + b[1]) / 2,
        width,
        0.012,
        Math.hypot(dx, dz) + 0.25,
        color,
      );
      mesh.userData.pathId = pathId;
      mesh.name = color === 0xc8c5b7 ? "Concrete path" : "Asphalt path";
      mesh.rotation.y = Math.atan2(dx, dz);
    }
  };
  path([
    [-30, -36],
    [0, -36],
    [35, -36],
    [65, -28],
    [90, -28],
  ]);
  path(
    [
      [25, 0],
      [36, 0],
      [42, 0],
    ],
    6,
  );
  path(
    [
      [0, -36],
      [0, -47],
    ],
    7,
  );
  path(
    [
      [65, -28],
      [65, -47],
    ],
    7,
  );
  path(
    [
      [-30, -36],
      [-35, -20],
      [-35, 25],
      [-27, 42],
      [15, 44],
      [50, 38],
      [88, 28],
      [94, 0],
      [94, -28],
    ],
    4,
  );
  path(
    [
      [-35, -20],
      [-88, -37],
      [-106, -27],
      [-109, 10],
      [-101, 40],
      [-87, 48],
      [-35, 42],
    ],
    4,
  );
  path(
    [
      [-35, -36],
      [-48, -55],
      [-81, -67],
      [-105, -51],
    ],
    4,
  );
  path(
    [
      [-35, 25],
      [-85, 36],
    ],
    4,
  );
  // Parking apron, clear ride-through aisles and two planted islands.
  box(27, -0.005, -68, 130, 0.015, 44, 0x62696c);
  path(
    [
      [-38, -47],
      [92, -47],
    ],
    4,
  );
  path(
    [
      [-38, -91],
      [92, -91],
    ],
    4,
  );
  for (const z of [-50, -72])
    for (let x = -30; x <= 85; x += 4) {
      box(x, 0.011, z - 5, 0.1, 0.008, 9, 0xeee6d3);
      // Wheel stops stay out of aisle / path crossings.
      if (Math.abs(x) > 4 && Math.abs(x - 65) > 5)
        box(x + 1.8, 0.095, z - 1, 2.8, 0.19, 0.3, 0xaeb2af, true);
    }
  for (const x of [-3, 5, 57, 65]) {
    box(x, 0.012, -54, 3.3, 0.01, 7, 0x376888);
    box(x, 0.019, -54, 0.18, 0.008, 3.5, 0xf0efe7);
  }
  path(
    [
      [-35, -65],
      [89, -65],
    ],
    7,
    0x656b6d,
  );
  path(
    [
      [103, -99],
      [103, 65],
      [-110, 65],
    ],
    9,
    0x596164,
  );
  path(
    [
      [89, -65],
      [103, -65],
    ],
    9,
    0x596164,
  );
  for (let z = -95; z < 60; z += 8) box(103, 0.017, z, 0.12, 0.01, 3, 0xe9d797);
  for (let i = 0; i < 8; i++)
    box(96 + i * 0.7, 0.023, -65, 0.32, 0.012, 7, 0xe9e7d9);
  for (const [a, b] of [
    [-37, -5],
    [9, 58],
    [72, 92],
  ])
    box((a + b) / 2, 0.08, -47, b - a, 0.16, 0.22, 0xcac8bb, true);
  for (const x of [-20, 22, 65]) {
    box(x, 0.02, -80, 14, 0.035, 3, 0xb49a73);
  }
  // Lake and surrounding trail, set outside the usable skatepark lines.
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(1, 72),
    new THREE.MeshStandardMaterial({
      color: 0x327b8c,
      roughness: 0.24,
      metalness: 0.25,
      polygonOffset: true,
      polygonOffsetUnits: -30,
    }),
  );
  lake.name = "lake-water";
  (lake.material as THREE.MeshStandardMaterial).onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = { value: 0 };
    lake.userData.waterShader = shader;
    shader.vertexShader =
      "varying vec2 waterUV;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nwaterUV=position.xy;",
      );
    shader.fragmentShader =
      "uniform float waterTime; varying vec2 waterUV;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nfloat ripple=sin(waterUV.x*45.0+waterUV.y*18.0+waterTime*1.8)*sin(waterUV.y*60.0-waterTime);diffuseColor.rgb*=0.90+0.08*ripple+0.16*length(waterUV);",
      );
  };
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(10, 30, 1);
  lake.position.set(-97, 0.009, 5);
  scene.add(lake);
  const pavilion = (x: number, z: number) => {
    box(x, 0.02, z, 7, 0.04, 7, 0xc2b9a0);
    for (const dx of [-2.6, 2.6])
      for (const dz of [-2.6, 2.6])
        box(x + dx, 1.6, z + dz, 0.16, 3.2, 0.16, 0x745a3d, true);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(5.3, 1.4, 4),
      new THREE.MeshStandardMaterial({ color: 0xb55f39, roughness: 0.9 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, 3.6, z);
    scene.add(roof);
    park.bench("Shelter bench " + x + " " + z, x - 1.7, 0, z, 0.85, 3);
  };
  for (const [x, z] of [
    [-28, -40],
    [90, -40],
    [-87, -30],
    [-83, 42],
    [-52, -51],
  ])
    pavilion(x, z);
  // The adjoining recreation lawns complete the southern edge of the reference layout.
  path(
    [
      [-30, -93],
      [-30, -151],
      [91, -151],
      [91, -93],
    ],
    4,
  );
  path(
    [
      [27, -93],
      [27, -147],
    ],
    4,
  );
  for (const x of [-3, 57]) {
    const disk = (radius: number, y: number, color: number) => {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 64),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          polygonOffset: true,
          polygonOffsetUnits: -45 - y * 100,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, -123);
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    disk(25, 0.012, 0x718d46);
    disk(11, 0.022, 0xbc8f63);
    for (const [dx, dz] of [
      [0, 7],
      [-6, 0],
      [0, -7],
      [6, 0],
    ])
      box(x + dx, 0.04, -123 + dz, 0.5, 0.04, 0.5, 0xeee9d7);
    const mound = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.2, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0xc39a72 }),
    );
    mound.position.set(x, 0.04, -123);
    scene.add(mound);
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI * 2) / 32;
      if (i > 5 && i < 10) continue;
      box(
        x + Math.cos(angle) * 25,
        1,
        -123 + Math.sin(angle) * 25,
        0.065,
        2,
        0.065,
        0x87918b,
      );
    }
    park.bench("Ballfield bench " + x, x + 19, 0, -107, 1, 4);
  }
  pavilion(27, -113);
  // Instancing keeps the larger reference landscape light enough for normal play.
  const trees: number[][] = [];
  for (let i = 0; i < 90; i++) {
    const x = -109 + ((i * 37) % 215),
      z = -99 + ((i * 53) % 174);
    const excluded =
      (x > -34 && x < 96 && z > -94 && z < -43) ||
      (x > -33 && x < 32 && z > -45 && z < 36) ||
      (x > 39 && x < 90 && z > -26 && z < 26) ||
      (x > -83 && x < -41 && z > -31 && z < 37) ||
      (x < -85 && x > -110 && z > -35 && z < 47);
    if (!excluded) trees.push([x, z, 3.7 + (i % 4) * 0.7]);
  }
  trees.push(
    [-22, -80, 4],
    [24, -80, 4],
    [66, -80, 4],
    [35, 12, 5],
    [34, -16, 4],
    [33, 28, 5],
    [91, 20, 4],
    [-29, 20, 5],
  );
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.2, 0.35, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x796248 }),
    trees.length,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0x607f3b, flatShading: true }),
    trees.length,
  );
  const matrix = new THREE.Matrix4(),
    q = new THREE.Quaternion();
  trees.forEach(([x, z, h], i) => {
    matrix.compose(v(x, h / 2, z), q, v(1, h, 1));
    trunks.setMatrixAt(i, matrix);
    matrix.compose(v(x, h + 0.8, z), q, v(2.4, h * 0.55, 2.4));
    crowns.setMatrixAt(i, matrix);
  });
  trunks.castShadow = crowns.castShadow = true;
  trunks.name = "tree-trunks";
  crowns.name = "tree-crowns";
  scene.add(trunks, crowns);
  const shrubs = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x72863c, flatShading: true }),
    120,
  );
  for (let i = 0; i < 120; i++) {
    const strip = i < 40 ? -42 : i < 80 ? 36 : -94;
    const x = -105 + (i % 40) * 5.3,
      z = strip + Math.sin(i * 2.3) * 1.8;
    const entrance =
      strip === -42 &&
      (Math.abs(x) < 6 ||
        Math.abs(x - 65) < 7 ||
        Math.abs(x + 28) < 6 ||
        Math.abs(x - 90) < 5);
    matrix.compose(
      v(x, entrance ? -2 : 0.45, z),
      q,
      v(0.65 + (i % 3) * 0.15, 0.55, 0.65),
    );
    shrubs.setMatrixAt(i, matrix);
  }
  shrubs.name = "bushes";
  scene.add(shrubs);
  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x9b947f, flatShading: true }),
    80,
  );
  for (let i = 0; i < 80; i++) {
    const x = -108 + ((i * 41) % 216),
      z = -100 + ((i * 47) % 174);
    const occupied =
      (x > -35 && x < 96 && z > -94 && z < 35) ||
      (x > -83 && x < -40 && z > -32 && z < 38);
    matrix.compose(
      v(x, occupied ? -3 : 0.35, z),
      q,
      v(0.5 + (i % 3) * 0.3, 0.5, 0.65),
    );
    rocks.setMatrixAt(i, matrix);
  }
  rocks.name = "rocks";
  scene.add(rocks);
  for (const [x, z] of [
    [35, -28],
    [43, 25],
    [88, 25],
    [88, -22],
    [-35, -45],
    [-28, -88],
    [22, -88],
    [85, -88],
    [-86, -35],
    [-86, 36],
  ]) {
    box(x, 4.2, z, 0.12, 8.4, 0.12, 0x737e80, true);
    box(x + 0.6, 8.4, z, 1.3, 0.16, 0.55, 0x303c40);
  }
  // No city/state text in the game signage.
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#283e36";
  ctx.fillRect(0, 0, 1536, 256);
  ctx.fillStyle = "#f0e9d1";
  ctx.textAlign = "center";
  ctx.font = "bold 92px sans-serif";
  ctx.fillText("VETERANS MEMORIAL PARK", 768, 110);
  ctx.font = "36px sans-serif";
  ctx.fillText("WOOD PARK  ·  METAL STREET PARK  ·  LAKESIDE TRAIL", 768, 193);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 2.34),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      side: THREE.DoubleSide,
    }),
  );
  sign.position.set(28, 2, -44);
  scene.add(sign);
  for (const x of [22, 34]) box(x, 1.3, -44, 0.16, 2.6, 0.16, 0x4a5746, true);
}
