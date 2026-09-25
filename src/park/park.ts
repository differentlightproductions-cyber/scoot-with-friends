import { brushHeight, objectHeight, editedHeightQuery } from "../editor/layout";
import { clearSurfaces, surfaceAt, type Surface } from "./surfaces";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { grainTexture } from "./materials";
import { benchPlanks, lawnTexture, surfaceMaterial, surfaceTexture } from './art';
import { lathe } from '../scooter/surfaces';
import RAPIER from "@dimforge/rapier3d-compat";
import { GROUPS } from "../physics/groups";
import { clamp } from "../core/config";
import { buildOutdoor, outdoorHeight, outdoorSpawns, modules, surfaceSpan } from "./outdoor";
import { buildBHill, bHillHeight, bHillSurface, B_HILL_SPAWNS } from "./bhill";
import { PILLAR_HALF, WAREHOUSE_PILLARS } from "../data/builds";
export let OUTDOOR =
  typeof window !== "undefined" &&
  !["warehouse","shop","urban-gravity","techno-gravity","techno_gravity","b_hill","church"].includes(new URLSearchParams(window.location.search).get("map") ?? "outdoor");
export let ACTIVE_MAP = OUTDOOR ? "outdoor" : (typeof window!=="undefined" && /b_hill/.test(location.search) ? "b_hill" : typeof window!=="undefined" && /church/.test(location.search) ? "church" : typeof window!=="undefined" && /shop|gravity/.test(location.search) ? "techno_gravity" : "warehouse");
export interface Rail {
  id: string;
  a: THREE.Vector3;
  b: THREE.Vector3;
  kind: "rail" | "ledge";
  coping?: boolean;
  colliderHandle?: number;
  /**
   * For a pipe capping an edge (ledge, box, quarter or spine coping): the
   * horizontal direction from the pipe toward the solid it caps. The scooter
   * seats with its deck on the pipe and its wheels hanging on the other side.
   */
  solid?: THREE.Vector3;
}
const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const transition = (t: number, r: number) =>
  r - Math.sqrt(Math.max(0.1, r * r - t * t));
export function terrainHeight(x: number, z: number): number {
  // B Hill has no editor layers; their brush clamp is for the flat parks only.
  if (ACTIVE_MAP === "b_hill") return bHillHeight(x, z);
  if (editedHeightQuery) return editedHeightQuery(x, z);
  return objectHeight(x, z, brushHeight(x, z, baseTerrainHeight(x, z)));
}
/**
 * What the wheels roll on at ground level: B Hill's road, shoulders and
 * hillside, and the lawns, infields and pads a map registered (surfaces.ts).
 */
export function terrainSurface(x: number, z: number): Surface {
  return ACTIVE_MAP === "b_hill" ? bHillSurface(x, z) : surfaceAt(x, z) ?? "road";
}
export function baseTerrainHeight(x: number, z: number): number {
  if (OUTDOOR) return outdoorHeight(x, z);
  if (ACTIVE_MAP === "b_hill") return bHillHeight(x, z);
  const map = mapBuilders.get(ACTIVE_MAP);
  if (map?.height) return map.height(x, z);
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
export let SPAWNS = OUTDOOR ? outdoorSpawns : ACTIVE_MAP === "b_hill" ? B_HILL_SPAWNS : warehouseSpawns;
let shopBuilder:((park:Park)=>void)|null=null;
export function registerShop(build:(park:Park)=>void){shopBuilder=build;}
/**
 * Maps authored in their own module (the Church): the builder, the analytic
 * ground height the riding physics reads (plazas, stairs, banks), and spawns.
 * Registered by the module itself before the park is built, as the shop is.
 */
export interface MapModule { build(park: Park): void; height?(x: number, z: number): number; spawns: { name: string; x: number; z: number; yaw: number }[] }
const mapBuilders = new Map<string, MapModule>();
export function registerMap(id: string, map: MapModule) { mapBuilders.set(id, map); if (ACTIVE_MAP === id) SPAWNS = map.spawns; }
/**
 * A step down in an authored map's own ground just ahead (a stair nosing, a
 * plaza edge): more drop over `reach` than the slope the rider is already on
 * would explain. Only the map's height counts, so layout ramps and quarters
 * (dropping in) never trigger it, nor does riding on top of one.
 */
export function authoredDropAhead(x: number, z: number, dx: number, dz: number, reach: number) {
  const h = mapBuilders.get(ACTIVE_MAP)?.height;
  if (!h || ACTIVE_MAP === "b_hill") return false;
  const here = h(x, z);
  if (terrainHeight(x, z) - here > 0.05) return false;
  const slope = Math.max(0, (h(x - dx * 0.1, z - dz * 0.1) - here) / 0.1);
  return here - h(x + dx * reach, z + dz * reach) > 0.12 + slope * reach;
}
const shopSpawns=[{name:"TECHNO GRAVITY / FRONTAGE",x:0,z:-11,yaw:0},{name:"DIY ALLEY",x:1,z:14,yaw:0}];
export function selectPark(id: string) {
  ACTIVE_MAP = id;
  OUTDOOR = id === "outdoor";
  SPAWNS = OUTDOOR ? outdoorSpawns : id==="techno_gravity"?shopSpawns:id==="b_hill"?B_HILL_SPAWNS:mapBuilders.get(id)?.spawns??warehouseSpawns;
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
    scene.userData.parkGeneration = (scene.userData.parkGeneration ?? 0) + 1;
    scene.userData.assetLoads = [];
    clearSurfaces();
    // B Hill builds its own continuous road and hillside collision.
    if (ACTIVE_MAP === "b_hill") {
      buildBHill(this);
      return;
    }
    // Authored maps lay their own ground (the Church's lot, plaza and stair).
    const authored = mapBuilders.get(ACTIVE_MAP);
    if (authored) {
      authored.build(this);
      return;
    }
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
      shader.uniforms.lawnGrain={value:lawnTexture(1,1)};
      shader.fragmentShader='uniform sampler2D woodGrain;\nuniform sampler2D lawnGrain;\nvarying float vTerrainY;\n'+shader.fragmentShader;
      shader.vertexShader='varying float vTerrainY;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainY=transformed.y;');
      // The wood park's built ramps draw themselves (wood-ramps.ts). Under each
      // one the ground is hidden, and so is any ground raised by the ramp's
      // height just outside it - the grid cell that stepped from deck height
      // down to the ground drew a slanted skirt around every ramp.
      if(OUTDOOR){
        const f=(v:number)=>v.toFixed(3);
        const hide=modules.map((m,i)=>{const [x0,x1]=surfaceSpan[i],pad=.14;
          return `(vMapUv.x>=${f(x0-pad)}&&vMapUv.x<=${f(x1+pad)}&&vMapUv.y>=${f(m.z0-pad)}&&vMapUv.y<=${f(m.z1+pad)}&&(vTerrainY>.004||(vMapUv.x>=${f(x0)}&&vMapUv.x<=${f(x1)}&&vMapUv.y>=${f(m.z0)}&&vMapUv.y<=${f(m.z1)})))`;}).join('||');
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>\nif(${hide}) discard;`);
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec4 groundSample=texture2D(map,vMapUv*.55);\n#ifdef USE_COLOR\nif(vColor.r>vColor.g*1.12 && vColor.g>vColor.b*1.16)groundSample=texture2D(woodGrain,vec2(vMapUv.x*3.3,vMapUv.y*.5));\nelse if(vColor.g>vColor.r*1.1 && vColor.g>vColor.b*1.25)groundSample=vec4(texture2D(lawnGrain,vMapUv*.33).rgb/max(vColor.rgb,vec3(.05))*.92,1.0);\n#endif\ndiffuseColor*=groundSample;`);
    };
    const mesh = new THREE.Mesh(g,terrainMaterial);
    mesh.name = "Terrain surface";
    mesh.userData.terrainSurface = true;
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
      Math.max(size.x,size.z)>2 && size.y<.5 ? surfaceMaterial(color,((color>>8)&255)>((color>>16)&255)*1.1&&((color>>8)&255)>(color&255)*1.25?'grass':((color>>16)&255)>((color>>8)&255)*1.12?'wood':'concrete',size.x,size.z) : new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
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
    this.buildShop();
  }
  /**
   * The Warehouse as a build floor (data/builds.ts, editor/warehouse.ts): a
   * painted 1 m / 4 m floor grid to line pieces up by, structural pillars the
   * placement check keeps pieces clear of, hazard striping, two roll-up loading
   * doors and stencilled bay numbers. The floor itself stays open.
   */
  private buildShop() {
    const scene = this.scene;
    const paint = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      draw(c.getContext("2d")!, w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    const decal = (map: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry: number, flat = false) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
      if (flat) mesh.rotation.x = -Math.PI / 2; else mesh.rotation.y = ry;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    // Floor grid: faint metre lines, stronger 4 m lines, aligned to the world grid.
    const grid = paint(512, 512, (g, w) => {
      g.strokeStyle = "rgba(236,241,233,.2)"; g.lineWidth = 2;
      for (let i = 1; i < 4; i++) { const p = (i * w) / 4; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, w); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
      g.strokeStyle = "rgba(243,211,92,.5)"; g.lineWidth = 5; g.strokeRect(0, 0, w, w);
    });
    grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
    grid.repeat.set(64 / 4, 88 / 4);
    decal(grid, 64, 88, 0, 0.006, 0, 0, true).name = "Warehouse floor grid";
    const stripes = (w: number, h: number, repeat: number) => {
      const t = paint(256, 64, (g, cw, ch) => { g.fillStyle = "#e7b52c"; g.fillRect(0, 0, cw, ch); g.fillStyle = "#23262a"; for (let x = -ch; x < cw; x += 64) { g.beginPath(); g.moveTo(x, ch); g.lineTo(x + 32, ch); g.lineTo(x + 32 + ch, 0); g.lineTo(x + ch, 0); g.fill(); } });
      t.wrapS = THREE.RepeatWrapping; t.repeat.set(repeat, 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, name: "Hazard stripes" + w + h });
    };
    // Structural pillars: steel columns with a striped guard and a keep-clear box painted round them.
    const column = new THREE.MeshStandardMaterial({ color: 0x3c4c4b, metalness: 0.55, roughness: 0.5, name: "Steel column" });
    const guard = stripes(0.9, 1.2, 2);
    const keep = paint(256, 256, (g, w) => { g.strokeStyle = "rgba(231,181,44,.85)"; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, w - 16); g.lineWidth = 6; for (let i = -w; i < w; i += 48) { g.beginPath(); g.moveTo(i, w); g.lineTo(i + w, 0); g.stroke(); } });
    for (const [x, z] of WAREHOUSE_PILLARS) {
      const s = PILLAR_HALF * 2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(s * 0.8, 12, s * 0.8), column);
      post.position.set(x, 6, z); post.castShadow = post.receiveShadow = true; scene.add(post);
      const wrap = new THREE.Mesh(new THREE.BoxGeometry(s, 1.2, s), guard);
      wrap.position.set(x, 0.6, z); wrap.castShadow = wrap.receiveShadow = true; scene.add(wrap);
      decal(keep, s + 0.8, s + 0.8, x, 0.008, z, 0, true);
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(PILLAR_HALF, 6, PILLAR_HALF).setTranslation(x, 6, z).setCollisionGroups(GROUPS.surface));
    }
    // Hazard striping along the foot of the long walls.
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(88, 0.45), stripes(88, 0.45, 60));
      band.position.set(side * 31.97, 0.23, 0); band.rotation.y = -side * Math.PI / 2; band.receiveShadow = true; scene.add(band);
    }
    // Two roll-up loading doors on the far wall, with a painted apron in front.
    const slats = paint(512, 512, (g, w, h) => {
      g.fillStyle = "#8f989a"; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) { g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(0, y, w, 3); g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(0, y + 12, w, 4); }
      g.fillStyle = "rgba(60,50,40,.25)"; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, h * 0.7 + Math.random() * h * 0.3, 2 + Math.random() * 30, 2);
    });
    const frame = new THREE.MeshStandardMaterial({ color: 0x2f3a3a, metalness: 0.5, roughness: 0.55, name: "Door frame" });
    const apron = paint(512, 256, (g, w, h) => { g.strokeStyle = "rgba(231,181,44,.8)"; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = "rgba(236,238,230,.55)"; g.font = "900 64px Impact, sans-serif"; g.textAlign = "center"; g.fillText("KEEP CLEAR", w / 2, h / 2 + 22); });
    [-14, 14].forEach((x, i) => {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshStandardMaterial({ map: slats, metalness: 0.4, roughness: 0.6, name: "Roll-up door" }));
      door.position.set(x, 2.5, 43.97); door.rotation.y = Math.PI; door.receiveShadow = true; scene.add(door);
      for (const dx of [-3.1, 3.1]) { const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5.3, 0.16), frame); jamb.position.set(x + dx, 2.65, 43.92); scene.add(jamb); }
      const head = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 0.4), frame); head.position.set(x, 5.4, 43.8); head.castShadow = true; scene.add(head);
      const label = paint(512, 128, (g, w, h) => { g.fillStyle = "#e7b52c"; g.fillRect(0, 0, w, h); g.fillStyle = "#23262a"; g.font = "900 84px Impact, sans-serif"; g.textAlign = "center"; g.fillText("DOCK " + (i + 1), w / 2, h / 2 + 30); });
      decal(label, 2.4, 0.6, x, 6.1, 43.96, Math.PI);
      decal(apron, 6, 3, x, 0.008, 42.4, 0, true);
    });
    // Stencilled bay numbers on the long walls and the shop name on the near wall.
    const stencil = (text: string, w: number) => paint(1024, 256, (g, cw, ch) => { g.fillStyle = "rgba(233,236,228,.82)"; g.font = "900 190px Impact, 'Arial Narrow', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, cw / 2, ch / 2, cw * 0.95); void w; });
    [-30, -10, 10, 30].forEach((z, i) => {
      decal(stencil("BAY 0" + (i + 1), 4), 4, 1, -31.96, 4.2, z, Math.PI / 2);
      decal(stencil("BAY 0" + (i + 5), 4), 4, 1, 31.96, 4.2, z, -Math.PI / 2);
    });
    decal(stencil("WAREHOUSE 01 · BUILD FLOOR", 14), 14, 3.5, 0, 6.5, -43.96, 0);
  }
  /** The real ground height here (editor terrain edits included), so props
   * sit on the surface instead of an assumed y = 0. Exposed on the park so
   * scenery builders need not import this module and form an import cycle. */
  groundHeight(x: number, z: number) {
    return terrainHeight(x, z);
  }
  /**
   * Lengthens a pipe `rail()` built from `a` to `b` by `before` metres past `a`
   * and `after` past `b`: the mesh only, never its grind collider (#68).
   */
  extendPipe(pipe: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, before: number, after: number) {
    const length = a.distanceTo(b), direction = b.clone().sub(a).normalize();
    pipe.scale.y = (length + before + after) / length;
    pipe.position.copy(a).addScaledVector(direction, -before).add(b.clone().addScaledVector(direction, after)).multiplyScalar(0.5);
  }
  /** `floor` is where the support posts stand: given for a layout piece, whose points are local to it (its base is 0). */
  rail(id: string, a: THREE.Vector3, b: THREE.Vector3, kind: "rail" | "ledge", coping = /(?:quarter|spine).*coping/i.test(id), solid?: THREE.Vector3, floor?: number) {
    this.rails.push({ id, a, b, kind, coping, solid: solid?.clone().setY(0).normalize() });
    const direction = b.clone().sub(a);
    const length = direction.length();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const mesh = new THREE.Mesh(
      lathe([[0,-length/2],[.04,-length/2],[.045,-length/2+.005],[.045,length/2-.005],[.04,length/2],[0,length/2]],32),
      // Muted oxide red-brown for street rails: worn satin painted steel, not
      // scarlet. Coping (the ramp-edge lip riders grind) is a separate dark
      // copper, not the rusty oxide tone - it reads as worn metal trim rather
      // than a rusted-out rail. Colour only - collider size, friction and grind
      // behaviour are untouched.
      new THREE.MeshStandardMaterial({
        color: coping ? 0x6e4326 : 0x8c4a33,
        metalness: coping ? 0.55 : 0.45,
        roughness: coping ? 0.42 : 0.58,
      }),
    );
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    mesh.castShadow = true;
    mesh.name = id;
    this.scene.add(mesh);
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
          ground = floor ?? terrainHeight(p.x, p.z);
        this.box(
          new THREE.Vector3(p.x, (p.y + ground) / 2, p.z),
          new THREE.Vector3(0.08, p.y - ground, 0.08),
          0x344b49,
        ).name = id + " support";
      }
    return mesh;
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
