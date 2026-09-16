import { brushHeight, objectHeight, editedHeightQuery } from "../editor/layout";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { grainTexture } from "./materials";
import { benchPlanks, surfaceMaterial, surfaceTexture } from './art';
import { lathe } from '../scooter/surfaces';
import RAPIER from "@dimforge/rapier3d-compat";
import { GROUPS } from "../physics/groups";
import { clamp } from "../core/config";
import { buildOutdoor, outdoorHeight, outdoorSpawns } from "./outdoor";
export let OUTDOOR =
  typeof window !== "undefined" &&
  !["warehouse","shop","urban-gravity","techno-gravity","techno_gravity"].includes(new URLSearchParams(window.location.search).get("map") ?? "outdoor");
export let ACTIVE_MAP = OUTDOOR ? "outdoor" : (typeof window!=="undefined" && /shop|gravity/.test(location.search) ? "techno_gravity" : "warehouse");
export interface Rail {
  id: string;
  a: THREE.Vector3;
  b: THREE.Vector3;
  kind: "rail" | "ledge";
  coping?: boolean;
  colliderHandle?: number;
}
const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const transition = (t: number, r: number) =>
  r - Math.sqrt(Math.max(0.1, r * r - t * t));
export function terrainHeight(x: number, z: number): number {
  if (editedHeightQuery) return editedHeightQuery(x, z);
  return objectHeight(x, z, brushHeight(x, z, baseTerrainHeight(x, z)));
}
export function baseTerrainHeight(x: number, z: number): number {
  if (OUTDOOR) return outdoorHeight(x, z);
  return 0;
}
export function legacyWarehouseHeight(x:number,z:number){
  let h = 0;
  // Broad quarter pipes with tangent-continuous bottoms and flat decks.
  const q = clamp(Math.abs(z) - 34, 0, 4.8);
  h = Math.max(h, transition(q, 5));
  // Central funbox: banks connect to a flat top without collider seams.
  if (Math.abs(x) < 4.5 && Math.abs(z) < 8)
    h = Math.max(
      h,
      1.25 *
        Math.min(
          smooth((4.5 - Math.abs(x)) / 1.5),
          smooth((8 - Math.abs(z)) / 3.5),
        ),
    );
  // Hip / transfer has intersecting slopes and a diagonal ridge.
  const hip = Math.max(
    Math.abs((x - 15) * 0.82 + (z - 9) * 0.32),
    Math.abs((z - 9) * 0.75 - (x - 15) * 0.25),
  );
  h = Math.max(h, 1.9 * smooth((6 - hip) / 4));
  // Spine: back-to-back transitions across a narrow rounded crest.
  if (Math.abs(x - 1) < 6)
    h = Math.max(
      h,
      1.9 *
        (1 - smooth(Math.abs(z - 24) / 2.9)) *
        smooth((6 - Math.abs(x - 1)) / 1.4),
    );
  // A small raised bowl; rolling bank outside, curved inner transition.
  const r = Math.hypot(x - 20, z - 27);
  if (r < 10)
    h = Math.max(
      h,
      r < 7.8
        ? 2.25 * smooth((r - 4) / 3.8)
        : 2.25 * (1 - smooth((r - 7.8) / 2.2)),
    );
  // Stair platform and side banks, with actual stair treads in the center.
  if (x > 10 && x < 20 && z > -23 && z < -3) {
    let stair =
      z < -13
        ? 1.5 * smooth((z + 23) / 6)
        : z < -7
          ? Math.ceil((-7 - z) / 1.2) * 0.3
          : 0;
    stair *= smooth((x - 10) / 2) * smooth((20 - x) / 2);
    h = Math.max(h, stair);
  }
  return h;
}
/**
 * Slope along one axis, robust at a step. A central difference taken across the
 * side of a box or ramp blends the two levels into a steep slope that does not
 * exist; riding onto that false slope turned horizontal speed into vertical and
 * launched the rider. Where one side is nearly flat and the other rises sharply,
 * the point belongs to the flat side. Over 10 cm a smooth transition changes
 * slope by a few hundredths near flat, and the steepest authored bank meets flat
 * ground at 0.4, so anything sharper than 0.45 is an edge, not a curve.
 */
const STEP_SLOPE_JUMP = 0.45;
function axisSlope(minus: number, centre: number, plus: number, d: number) {
  const back = (centre - minus) / d,
    ahead = (plus - centre) / d;
  if (
    Math.abs(back - ahead) > STEP_SLOPE_JUMP &&
    Math.min(Math.abs(back), Math.abs(ahead)) < 0.35
  )
    return Math.abs(back) < Math.abs(ahead) ? back : ahead;
  return (back + ahead) / 2;
}
export function terrainNormal(x: number, z: number): THREE.Vector3 {
  const d = 0.1,
    centre = terrainHeight(x, z);
  return new THREE.Vector3(
    -axisSlope(terrainHeight(x - d, z), centre, terrainHeight(x + d, z), d),
    1,
    -axisSlope(terrainHeight(x, z - d), centre, terrainHeight(x, z + d), d),
  ).normalize();
}
const warehouseSpawns = [
  { name: "FLAT / RUNWAY", x: -12, z: -24, yaw: 0 },
  { name: "RAIL / STREET", x: -14, z: 2, yaw: 0 },
  { name: "FUNBOX", x: 0, z: -17, yaw: 0 },
  { name: "QUARTER PIPE", x: -12, z: 25, yaw: 0 },
  { name: "BOWL / TRANSFERS", x: 20, z: 26, yaw: 0 },
  { name: "STAIRS / DOWN RAIL", x: 15, z: -18, yaw: 0 },
];
export let SPAWNS = OUTDOOR ? outdoorSpawns : warehouseSpawns;
let shopBuilder:((park:Park)=>void)|null=null;
export function registerShop(build:(park:Park)=>void){shopBuilder=build;}
const shopSpawns=[{name:"TECHNO GRAVITY / FRONTAGE",x:0,z:-11,yaw:0},{name:"DIY ALLEY",x:1,z:14,yaw:0}];
export function selectPark(id: string) {
  ACTIVE_MAP = id;
  OUTDOOR = id === "outdoor";
  SPAWNS = OUTDOOR ? outdoorSpawns : id==="techno_gravity"?shopSpawns:warehouseSpawns;
}
export class Park {
  benches: {
    id: string;
    x: number;
    z: number;
    seat: number;
    base: number;
    yaw: number;
    width: number;
    length: number;
  }[] = [];
  bench(id: string, x: number, base: number, z: number, width = 1, length = 4) {
    const seat = base + 0.55;
    this.benches.push({ id, x, z, seat, width, length, base, yaw: 0 });
    benchPlanks(this.scene,x,seat,z,width,length);
    const seatCollider = this.box(
      new THREE.Vector3(x, seat - 0.06, z),
      new THREE.Vector3(width, 0.12, length),
      0xa17f55,
      true,
    );
    seatCollider.visible=false;
    for (const dz of [-length * 0.34, length * 0.34])
      this.box(
        new THREE.Vector3(x, base + 0.24, z + dz),
        new THREE.Vector3(width * 0.65, 0.48, 0.12),
        0x39483e,
        true,
      );
    for (const side of [-1, 1])
      this.rail(
        id + " coping " + side,
        new THREE.Vector3(
          x + side * (width / 2 - 0.025),
          seat + 0.012,
          z - length / 2,
        ),
        new THREE.Vector3(
          x + side * (width / 2 - 0.025),
          seat + 0.012,
          z + length / 2,
        ),
        "ledge",
      );
  }
  rails: Rail[] = [];
  railHandles = new Set<number>();
  solids: THREE.Object3D[] = [];
  constructor(
    public scene: THREE.Scene,
    public world: RAPIER.World,
  ) {
    this.terrain();
    if (OUTDOOR) {
      buildOutdoor(this);
      return;
    }
    if(ACTIVE_MAP==="warehouse")this.warehouse();
    if(ACTIVE_MAP==="techno_gravity")shopBuilder?.(this);
  }
  legacyObstacles() {
    const scene=this.scene;
    // Distinct, square stair treads replace the visually ramp-like sampled edges.
    for (let i = 0; i < 5; i++) {
      const height = 1.5 - i * 0.3,
        z = -12.4 + i * 1.2;
      this.box(
        new THREE.Vector3(15, height / 2, z),
        new THREE.Vector3(6, height, 1.2),
        0x697a77,
        true,
      );
      this.box(
        new THREE.Vector3(15, height + 0.009, z),
        new THREE.Vector3(6, 0.018, 1.18),
        0xbdc4b8,
      );
      this.box(
        new THREE.Vector3(15, height + 0.022, z + 0.54),
        new THREE.Vector3(6, 0.015, 0.11),
        0xeee1aa,
      );
    }
    this.floorLabel("05   FIVE STAIR", 15, -3.8, 7, 1.2);
    this.rail(
      "Flat rail",
      new THREE.Vector3(-14, 0.6, 8),
      new THREE.Vector3(-14, 0.6, 18),
      "rail",
    );
    this.rail(
      "Down rail",
      new THREE.Vector3(15, 2.04, -13),
      new THREE.Vector3(15, 0.6, -6.5),
      "rail",
    );
    this.box(
      new THREE.Vector3(-5, 0.3, 15),
      new THREE.Vector3(1.8, 0.6, 9),
      0x788a86,
      true,
    );
    this.rail(
      "West ledge",
      new THREE.Vector3(-5.87, 0.63, 10.5),
      new THREE.Vector3(-5.87, 0.63, 19.5),
      "ledge",
    );
    this.rail(
      "East ledge",
      new THREE.Vector3(-4.13, 0.63, 10.5),
      new THREE.Vector3(-4.13, 0.63, 19.5),
      "ledge",
    );
    this.sign(
      "SCOOT WITH FRIENDS",
      new THREE.Vector3(-10, 6, 43.4),
      Math.PI,
      13,
      3,
      "#f05a36",
      "#ede8db",
    );
    this.sign(
      "WAREHOUSE 01  /  RIDE THE LINE",
      new THREE.Vector3(-31.35, 4, 0),
      Math.PI / 2,
      19,
      1.4,
      "#ede8db",
      "#233c3c",
    );
    this.sign(
      "PUSH. POP. REPEAT.",
      new THREE.Vector3(31.35, 5, -14),
      -Math.PI / 2,
      13,
      1.6,
      "#ede8db",
      "#233c3c",
    );
    this.floorLabel("01   FLAT", -18, -24, 7, 1.8);
    this.floorLabel("02   STREET", -10, 5, 7, 1.6);
    this.floorLabel("03   TRANSITION", -19, 29, 10, 1.4);
    this.floorLabel("04   BOWL", 20, 16, 6, 1.5);
    // Restrained lane markings and floor joints, kept away from riding collisions.
    const mat = new THREE.LineBasicMaterial({
      color: 0x8e9990,
      transparent: true,
      opacity: 0.28,
    });
    for (let x = -28; x <= 28; x += 8) {
      const g = new THREE.BufferGeometry().setFromPoints(
        Array.from(
          { length: 177 },
          (_, i) =>
            new THREE.Vector3(
              x,
              terrainHeight(x, -44 + i * 0.5) + 0.008,
              -44 + i * 0.5,
            ),
        ),
      );
      scene.add(new THREE.Line(g, mat));
    }
    for (let z = -32; z <= 32; z += 8) {
      const g = new THREE.BufferGeometry().setFromPoints(
        Array.from(
          { length: 129 },
          (_, i) =>
            new THREE.Vector3(
              -32 + i * 0.5,
              terrainHeight(-32 + i * 0.5, z) + 0.008,
              z,
            ),
        ),
      );
      scene.add(new THREE.Line(g, mat));
    }
  }
  private terrain() {
    const make = (step: number, colors: boolean) => {
      const nx = Math.round(64 / step),
        nz = Math.round(88 / step),
        p: number[] = [],
        c: number[] = [],
        idx: number[] = [];
      const base = new THREE.Color();
      for (let j = 0; j <= nz; j++)
        for (let i = 0; i <= nx; i++) {
          const x = -32 + i * step,
            z = -44 + j * step,
            y = brushHeight(x, z, baseTerrainHeight(x, z));
          p.push(x, y, z);
          base.set(
            OUTDOOR
              ? y > 0.015
                ? 0xcba368
                : Math.abs(x) > 24 || Math.abs(z) > 33
                  ? 0x719253
                  : 0xb6b8ad
              : y > 0.12
                ? 0xb8b8a7
                : 0x9daaa1,
          );
          const shade = 1 + 0.025 * Math.sin(x * 1.2 + z * 0.7);
          base.multiplyScalar(shade);
          c.push(base.r, base.g, base.b);
        }
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          const a = j * (nx + 1) + i,
            b = a + 1,
            d = a + nx + 1,
            e = d + 1;
          idx.push(a, d, b, b, d, e);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      if (colors)
        g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
      return { g, p, idx };
    };
    const step = OUTDOOR ? 0.125 : 2;
    const { g } = make(step, true);
    const uv:number[]=[];const vertices=g.getAttribute('position');for(let i=0;i<vertices.count;i++)uv.push(vertices.getX(i),vertices.getZ(i));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const terrainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91,map:surfaceTexture('concrete')});
    terrainMaterial.onBeforeCompile=shader=>{
      shader.uniforms.woodGrain={value:surfaceTexture('wood')};
      shader.fragmentShader='uniform sampler2D woodGrain;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec4 groundSample=texture2D(map,vMapUv*.55);\n#ifdef USE_COLOR\nif(vColor.r>vColor.g*1.12 && vColor.g>vColor.b*1.16)groundSample=texture2D(woodGrain,vec2(vMapUv.x*3.3,vMapUv.y*.5));\n#endif\ndiffuseColor*=groundSample;`);
    };
    const mesh = new THREE.Mesh(g,terrainMaterial);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.solids.push(mesh);
    const collision = make(step, false);
    mesh.userData.collider = this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(collision.p),
        new Uint32Array(collision.idx),
      )
        .setFriction(0)
        .setRestitution(0)
        .setCollisionGroups(GROUPS.surface),
    ).handle;
    collision.g.dispose();
  }
  box(
    pos: THREE.Vector3,
    size: THREE.Vector3,
    color: number,
    collision = false,
  ) {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(size.x, size.y, size.z, 2, Math.min(.035,size.x*.08,size.y*.08,size.z*.08)),
      Math.max(size.x,size.z)>2 && size.y<.5 ? surfaceMaterial(color,((color>>16)&255)>((color>>8)&255)*1.12?'wood':'concrete',size.x,size.z) : new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
    );
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (collision) {
      mesh.userData.collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
          .setTranslation(pos.x, pos.y, pos.z)
          .setFriction(0.1)
          .setCollisionGroups(GROUPS.surface),
      ).handle;
      this.solids.push(mesh);
    }
    return mesh;
  }
  private warehouse() {
    this.scene.background = new THREE.Color(0xc5cfca);
    this.scene.fog = new THREE.Fog(0xc5cfca, 45, 115);
    this.scene.add(new THREE.HemisphereLight(0xe9f4ec, 0x697873, 2.3));
    const sun = new THREE.DirectionalLight(0xffeed9, 3.0);
    sun.position.set(-18, 32, -12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);
    this.box(
      new THREE.Vector3(-32.4, 6, 0),
      new THREE.Vector3(0.8, 12, 89),
      0x536f6d,
      true,
    );
    this.box(
      new THREE.Vector3(32.4, 6, 0),
      new THREE.Vector3(0.8, 12, 89),
      0x536f6d,
      true,
    );
    this.box(
      new THREE.Vector3(0, 6, 44.4),
      new THREE.Vector3(65, 12, 0.8),
      0x4b6664,
      true,
    );
    this.box(
      new THREE.Vector3(0, 6, -44.4),
      new THREE.Vector3(65, 12, 0.8),
      0x4b6664,
      true,
    );
    for (const x of [-31.8, 31.8]) {
      for (let z = -36; z <= 36; z += 12) {
        this.box(
          new THREE.Vector3(x, 6, z),
          new THREE.Vector3(0.45, 12, 0.45),
          0x243c3d,
        );
        const w = this.box(
          new THREE.Vector3(x + (x < 0 ? 0.04 : -0.04), 9, z + 4),
          new THREE.Vector3(0.12, 2.3, 6),
          0xddeae0,
        );
        (w.material as THREE.MeshStandardMaterial).emissive.set(0x80968d);
      }
      this.box(
        new THREE.Vector3(x, 1.05, 0),
        new THREE.Vector3(0.12, 0.12, 88),
        0xf05a36,
      );
    }
    for (let z = -36; z <= 36; z += 12) {
      this.box(
        new THREE.Vector3(0, 11.8, z),
        new THREE.Vector3(64, 0.45, 0.35),
        0x2c4545,
      );
      for (const x of [-20, 0, 20]) {
        const l = this.box(
          new THREE.Vector3(x, 11.4, z),
          new THREE.Vector3(6, 0.08, 0.45),
          0xeef3d8,
        );
        (l.material as THREE.MeshStandardMaterial).emissive.set(0xa6b9a5);
      }
    }
    this.box(
      new THREE.Vector3(0, 12.5, 0),
      new THREE.Vector3(65, 0.15, 89),
      0x778b84,
    ).castShadow = false;
    for (const z of [-18, -12]) this.bench("Warehouse bench " + z, -29, 0, z);
  }
  rail(id: string, a: THREE.Vector3, b: THREE.Vector3, kind: "rail" | "ledge", coping = /(?:quarter|spine).*coping/i.test(id)) {
    this.rails.push({ id, a, b, kind, coping });
    const direction = b.clone().sub(a);
    const length = direction.length();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const mesh = new THREE.Mesh(
      lathe([[0,-length/2],[.04,-length/2],[.045,-length/2+.005],[.045,length/2-.005],[.04,length/2],[0,length/2]],32),
      // Muted oxide red-brown: worn satin painted steel, not scarlet. Defined
      // only here, inside rail(), so no scooter part, garment or sign shares it.
      // Colour only - collider size, friction and grind behaviour are untouched.
      new THREE.MeshStandardMaterial({
        color: 0x8c4a33,
        metalness: 0.45,
        roughness: 0.58,
      }),
    );
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    mesh.castShadow = true;
    this.scene.add(mesh);
    mesh.name = id;
    this.railHandles.add(
      (mesh.userData.collider = this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(length / 2, 0.045)
          .setTranslation(mid.x, mid.y, mid.z)
          .setRotation(mesh.quaternion)
          .setFriction(0.05)
          .setCollisionGroups(coping ? GROUPS.coping : GROUPS.rail),
      ).handle),
    );
    this.rails[this.rails.length-1].colliderHandle = mesh.userData.collider;
    if (kind === "rail")
      for (const t of [0.1, 0.9]) {
        const p = a.clone().lerp(b, t),
          floor = terrainHeight(p.x, p.z);
        this.box(
          new THREE.Vector3(p.x, (p.y + floor) / 2, p.z),
          new THREE.Vector3(0.08, p.y - floor, 0.08),
          0x344b49,
        ).name = id + " support";
      }
  }
  private sign(
    text: string,
    pos: THREE.Vector3,
    yaw: number,
    w: number,
    h: number,
    fg: string,
    bg: string,
  ) {
    const c = document.createElement("canvas");
    c.width = 1536;
    c.height = Math.round((1536 * h) / w);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${c.height * 0.7}px Impact, "Arial Narrow", sans-serif`;
    ctx.fillText(text, c.width / 2, c.height * 0.53, c.width * 0.92);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.copy(pos);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    return mesh;
  }
  private floorLabel(text: string, x: number, z: number, w: number, h: number) {
    const m = this.sign(
      text,
      new THREE.Vector3(x, terrainHeight(x, z) + 0.014, z),
      0,
      w,
      h,
      "#ebecd9",
      "#9daaa1",
    );
    m.rotation.x = -Math.PI / 2;
  }
}
