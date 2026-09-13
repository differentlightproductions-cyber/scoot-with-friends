import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Park, terrainHeight } from "../park/park";
import { InputFrame } from "../input/input";
import {
  CATALOG,
  LIMIT,
  LayoutHistory,
  ParkLayout,
  STORAGE,
  blankLayout,
  clone,
  makeObject,
  validateLayout,
} from "./layout";
import { MATERIALS } from "./assets";
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export class ParkEditor {
  active = false;
  testing = false;
  owner = false;
  ownerMode = false;
  history = new LayoutHistory();
  selected = "";
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
  root = document.createElement("section");
  returnButton = document.createElement("button");
  orbit: OrbitControls;
  gizmo: TransformControls;
  helper: THREE.Object3D;
  highlight = new THREE.BoxHelper(new THREE.Object3D(), 0xffc34f);
  mode: "select" | "place" | "raise" | "lower" | "smooth" | "flatten" =
    "select";
  asset = "Quarter Pipe";
  grid = 0.25;
  angle = 15;
  brushRadius = 4;
  brushStrength = 0.5;
  showDebug = false;
  publishing = false;
  slot = "";
  notice = "Create a line, save it, then test ride.";
  dragging = false;
  private ray = new THREE.Raycaster();
  private objects: THREE.Object3D[] = [];
  private baseObjects: THREE.Object3D[] = [];
  private stroke: { x: number; z: number }[] = [];
  private keys = new Set<string>();
  private pathPoints: THREE.Vector3[] = [];
  pathMode = false;
  pathMaterial = "dirt";
  pathWidth = 3;
  onBuild = (_layout: ParkLayout) => {};
  onTest = () => {};
  onExit = () => {};
  getPark = (): Park => {
    throw Error("Editor not connected");
  };
  constructor(
    public renderer: THREE.WebGLRenderer,
    public scene: THREE.Scene,
  ) {
    this.camera.position.set(25, 24, 32);
    this.camera.lookAt(0, 0, 0);
    this.orbit = new OrbitControls(this.camera, renderer.domElement);
    this.orbit.enabled = false;
    this.orbit.target.set(0, 0, 0);
    this.orbit.mouseButtons = {
      LEFT: null as any,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.gizmo = new TransformControls(this.camera, renderer.domElement);
    this.gizmo.enabled = false;
    this.gizmo.setTranslationSnap(0.25);
    this.gizmo.setRotationSnap(Math.PI / 12);
    this.helper = this.gizmo.getHelper();
    this.gizmo.addEventListener("dragging-changed", (e) => {
      this.dragging = !!e.value;
      this.orbit.enabled = this.active && !this.dragging;
      if (!e.value) this.commitTransform();
    });
    this.gizmo.addEventListener("objectChange", () => this.highlight.update());
    this.root.id = "park-editor";
    this.root.hidden = true;
    document.body.append(this.root);
    this.returnButton.id = "return-editor";
    this.returnButton.textContent = "RETURN TO EDITOR";
    this.returnButton.hidden = true;
    document.body.append(this.returnButton);
    this.returnButton.onclick = () => this.open(false);
    renderer.domElement.addEventListener("pointerdown", (e) => {
      if (!this.active || e.button !== 0 || this.gizmo.axis) return;
      this.pointer(e);
    });
    renderer.domElement.addEventListener("pointermove", (e) => {
      if (this.active && e.buttons & 1 && this.stroke.length) this.pointer(e);
    });
    window.addEventListener("pointerup", () => {
      if (!this.stroke.length) return;
      const points = this.stroke.splice(0);
      this.change((l) => {
        for (const p of points)
          l.terrain.push({
            ...p,
            radius: this.brushRadius,
            strength: this.brushStrength,
            mode: this.mode as any,
            target:
              this.mode === "smooth"
                ? [
                    [-1, 0],
                    [1, 0],
                    [0, -1],
                    [0, 1],
                  ].reduce(
                    (sum, d) =>
                      sum +
                      terrainHeight(
                        p.x + d[0] * this.brushRadius * 0.5,
                        p.z + d[1] * this.brushRadius * 0.5,
                      ),
                    0,
                  ) / 4
                : terrainHeight(points[0].x, points[0].z),
          });
      });
    });
    window.addEventListener("keydown", (e) => {
      if (
        !this.active ||
        /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName)
      )
        return;
      this.keys.add(e.code);
      if (e.ctrlKey && (e.code === "KeyZ" || e.code === "KeyY")) {
        e.preventDefault();
        this.undo(e.code === "KeyY" || e.shiftKey);
      }
      if (e.code === "Delete") this.remove();
      if (e.code === "KeyG") this.setTool("translate");
      if (e.code === "KeyT") this.setTool("rotate");
      if (e.code === "KeyJ") this.setTool("scale");
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    if (["127.0.0.1", "localhost"].includes(location.hostname))
      fetch("/local-admin")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          this.owner = d?.enabled === true;
          if (this.active) this.ui();
        })
        .catch(() => {});
  }
  async publish() {
    if (!this.owner || this.publishing) return;
    this.save();
    this.publishing = true;
    this.notice = "Publishing your park…";
    this.ui();
    try {
      const response = await fetch("/local-publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ layout: validateLayout(this.layout) }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Publishing failed.");
      this.notice =
        "Published! Players get this park when they next start a session.";
    } catch (e) {
      this.notice = (e as Error).message;
    } finally {
      this.publishing = false;
      this.ui();
    }
  }
  get layout() {
    return this.history.layout;
  }
  open(fresh = false) {
    if (fresh) {
      this.history = new LayoutHistory();
      this.selected = "";
    }
    this.active = true;
    this.testing = false;
    this.returnButton.hidden = true;
    this.root.hidden = false;
    document.body.classList.add("editing");
    this.orbit.enabled = true;
    this.gizmo.enabled = true;
    this.onBuild(this.safeLayout());
    this.ui();
  }
  safeLayout() {
    const l = clone(this.layout);
    if (!this.owner) l.baseEdits = {};
    return l;
  }
  bind(objects: THREE.Object3D[], baseObjects: THREE.Object3D[]) {
    this.objects = objects;
    this.baseObjects = baseObjects;
    this.scene.add(this.helper, this.highlight);
    this.gizmo.detach();
    this.highlight.visible = false;
    const selected = [...objects, ...baseObjects].find(
      (o) => (o.userData.editorId ?? o.userData.baseId) === this.selected,
    );
    if (selected) this.attach(selected);
  }
  change(fn: (l: ParkLayout) => void) {
    try {
      this.history.commit(fn);
      this.onBuild(this.safeLayout());
      this.notice = "Unsaved changes";
      this.ui();
    } catch (e) {
      this.notice = (e as Error).message;
      this.ui();
    }
  }
  undo(redo = false) {
    redo ? this.history.redo() : this.history.undo();
    this.onBuild(this.safeLayout());
    this.ui();
  }
  attach(o: THREE.Object3D) {
    this.selected = o.userData.editorId ?? o.userData.baseId;
    this.gizmo.attach(o);
    this.highlight.setFromObject(o);
    this.highlight.visible = true;
    this.ui();
  }
  setTool(mode: "translate" | "rotate" | "scale") {
    this.mode = "select";
    this.gizmo.setMode(mode);
    this.gizmo.setTranslationSnap(this.grid || null);
    this.gizmo.setRotationSnap(
      this.angle ? (this.angle * Math.PI) / 180 : null,
    );
    this.gizmo.setScaleSnap(0.05);
    this.ui();
  }
  private commitTransform() {
    const o = this.gizmo.object;
    if (!o) return;
    const id = this.selected;
    if (id.startsWith("base-")) {
      if (!this.ownerMode) return;
      const d = o.userData.originalPosition as number[];
      this.change((l) => {
        l.baseEdits[id] = {
          x: o.position.x - d[0],
          y: o.position.y - d[1],
          z: o.position.z - d[2],
          rotation: o.rotation.y - (o.userData.originalRotation ?? 0),
          hidden: false,
          scale: o.scale.toArray() as [number, number, number],
          ...(l.baseEdits[id]?.color ? { color: l.baseEdits[id].color } : {}),
        };
      });
    } else
      this.change((l) => {
        const v = l.objects.find((x) => x.id === id);
        if (!v) return;
        v.x = o.position.x;
        v.y = o.position.y;
        v.z = o.position.z;
        v.rotation = o.rotation.y;
        v.width *= o.scale.x;
        v.height *= o.scale.y;
        v.length *= o.scale.z;
        if (v.points)
          v.points = v.points.map((p) => [p[0] * o.scale.x, p[1] * o.scale.z]);
      });
  }
  add(type = this.asset, x = 30, z = 0) {
    if (this.layout.objects.length >= LIMIT) {
      this.notice = "Object limit reached. Remove objects before adding more.";
      this.ui();
      return;
    }
    const o = makeObject(type, this.snap(x), this.snap(z));
    o.y = terrainHeight(x, z);
    this.selected = o.id;
    this.change((l) => l.objects.push(o));
  }
  duplicate() {
    const o = this.layout.objects.find((o) => o.id === this.selected);
    if (!o) return;
    const next = { ...o, id: makeObject(o.type).id, x: o.x + 1, z: o.z + 1 };
    this.selected = next.id;
    this.change((l) => l.objects.push(next));
  }
  remove() {
    if (this.selected.startsWith("base-")) {
      if (this.ownerMode)
        this.change((l) => {
          l.baseEdits[this.selected] = {
            ...(l.baseEdits[this.selected] ?? {
              x: 0,
              y: 0,
              z: 0,
              rotation: 0,
            }),
            hidden: true,
          };
        });
    } else
      this.change((l) => {
        l.objects = l.objects.filter((o) => o.id !== this.selected);
      });
    this.selected = "";
  }
  snap(v: number) {
    return this.grid ? Math.round(v / this.grid) * this.grid : v;
  }
  private point(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = this.ray.intersectObjects(this.getPark().solids, true)[0];
    return (
      hit?.point ??
      this.ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        new THREE.Vector3(),
      )
    );
  }
  private pointer(e: PointerEvent) {
    if (this.mode === "select" && !this.pathMode) {
      this.ray.setFromCamera(
        new THREE.Vector2(
          (e.clientX / innerWidth) * 2 - 1,
          1 - (e.clientY / innerHeight) * 2,
        ),
        this.camera,
      );
      const hit = this.ray.intersectObjects(
        [...this.objects, ...(this.ownerMode ? this.baseObjects : [])],
        true,
      )[0];
      if (hit) {
        let o = hit.object;
        while (o.parent && !o.userData.editorId && !o.userData.baseId)
          o = o.parent;
        this.attach(o);
      }
      return;
    }
    const p = this.point(e);
    if (!p) return;
    if (this.pathMode) {
      this.pathPoints.push(p.clone());
      this.notice = `Path: ${this.pathPoints.length} points. Add points, then Finish Path.`;
      this.ui();
      return;
    }
    if (this.mode === "place") {
      this.add(this.asset, p.x, p.z);
      return;
    }
    if (Math.abs(p.x) < 24 && Math.abs(p.z) < 33) {
      this.notice =
        "Terrain brushes protect the wooden park. Edit the surrounding grounds.";
      this.ui();
      return;
    }
    if (
      !this.stroke.length ||
      Math.hypot(p.x - this.stroke.at(-1)!.x, p.z - this.stroke.at(-1)!.z) >
        this.brushRadius * 0.6
    )
      this.stroke.push({ x: this.snap(p.x), z: this.snap(p.z) });
  }
  finishPath() {
    if (this.pathPoints.length < 2) {
      this.notice = "Place at least two path points.";
      this.ui();
      return;
    }
    const points = this.pathPoints.splice(0);
    this.pathMode = false;
    const center = points
        .reduce((a, p) => a.add(p), new THREE.Vector3())
        .multiplyScalar(1 / points.length),
      o = makeObject("Path", center.x, center.z);
    o.width = this.pathWidth;
    o.height = 0.05;
    o.y = 0;
    o.material = this.pathMaterial;
    o.coping = o.grindable = false;
    o.points = points.map((p) => [p.x - center.x, p.z - center.z]);
    this.selected = o.id;
    this.change((l) => l.objects.push(o));
  }

  save(asNew = false) {
    try {
      const slots = this.slots();
      const id = asNew || !this.slot ? "park-" + Date.now() : this.slot;
      slots[id] = validateLayout(this.layout);
      localStorage.setItem(STORAGE, JSON.stringify(slots));
      this.slot = id;
      this.notice = "Park saved on this device.";
    } catch (e) {
      this.notice = "Save failed: " + (e as Error).message;
    }
    this.ui();
  }
  slots(): Record<string, ParkLayout> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE) || "{}");
    } catch {
      return {};
    }
  }
  load(id: string) {
    try {
      const value = validateLayout(this.slots()[id]);
      if (!this.owner) value.baseEdits = {};
      this.history.commit((l) => Object.assign(l, value));
      this.slot = id;
      this.selected = "";
      this.onBuild(this.safeLayout());
      this.notice = "Saved park loaded.";
    } catch (e) {
      this.notice = (e as Error).message;
    }
    this.ui();
  }
  export() {
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(this.layout, null, 2)], {
        type: "application/json",
      }),
    );
    a.href = url;
    a.download = this.layout.title.replace(/[^a-z0-9 -]/gi, "") + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async import(file: File) {
    try {
      if (file.size > 2_000_000) throw Error("Park file is too large.");
      const l = validateLayout(JSON.parse(await file.text()));
      if (!this.owner) l.baseEdits = {};
      this.history.commit((v) => Object.assign(v, l));
      this.slot = "";
      this.selected = "";
      this.onBuild(this.safeLayout());
      this.notice = "Imported park. Save to keep it here.";
    } catch (e) {
      this.notice = (e as Error).message;
    }
    this.ui();
  }
  testRide() {
    this.active = false;
    this.testing = true;
    this.root.hidden = true;
    this.returnButton.hidden = false;
    document.body.classList.remove("editing");
    this.gizmo.detach();
    this.gizmo.enabled = false;
    this.highlight.visible = false;
    this.orbit.enabled = false;
    this.onTest();
  }
  update(f: InputFrame, dt: number) {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    if (!this.dragging) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      const right = new THREE.Vector3().crossVectors(
        dir,
        new THREE.Vector3(0, 1, 0),
      );
      const speed = (this.keys.has("ShiftLeft") ? 25 : 12) * dt;
      const move = dir
        .multiplyScalar(-f.lean * speed)
        .addScaledVector(right, f.steer * speed);
      move.y =
        (f.held.pumpGrind -
          f.held.brake +
          (this.keys.has("KeyE") ? 1 : 0) -
          (this.keys.has("KeyQ") ? 1 : 0)) *
        speed;
      this.camera.position.add(move);
      this.orbit.target.add(move);
      if (Math.abs(f.rx) + Math.abs(f.ry) > 0.05) {
        const offset = this.orbit.target.clone().sub(this.camera.position);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -f.rx * dt * 1.8);
        offset.y -= f.ry * dt * offset.length();
        this.orbit.target.copy(this.camera.position).add(offset);
      }
      this.orbit.update();
    }
    this.renderer.render(this.scene, this.camera);
  }
  ui() {
    if (!this.active) return;
    const o = this.layout.objects.find((o) => o.id === this.selected),
      base = this.baseObjects.find((o) => o.userData.baseId === this.selected);
    this.root.innerHTML = `<header><strong>PARK EDITOR</strong><button data-do="new">New</button><button data-do="save">Save</button><button data-do="saveAs">Save As</button><select id="editor-load"><option value="">Load a saved park…</option>${Object.entries(
      this.slots(),
    )
      .map(([id, p]) => `<option value="${esc(id)}">${esc(p.title)}</option>`)
      .join(
        "",
      )}</select><button data-do="deleteSlot">Delete Save</button><button data-do="export">Export JSON</button><label class="file-button">Import JSON<input id="editor-import" type="file" accept=".json,application/json"></label><button data-do="undo" ${!this.history.past.length ? "disabled" : ""}>Undo</button><button data-do="redo" ${!this.history.future.length ? "disabled" : ""}>Redo</button><button data-do="test">TEST RIDE</button>${this.owner ? `<button data-do="publish" ${this.publishing ? "disabled" : ""}>${this.publishing ? "Publishing…" : "PUBLISH TO PUBLIC GAME"}</button>` : ""}<button data-do="exit">Main Menu</button></header><aside class="editor-library"><h2>Build your line</h2><label>Park name<input id="editor-title" value="${esc(this.layout.title)}" maxlength="64"></label><p>${this.ownerMode ? "OWNER MODE · Existing assets can be moved. Changes stay in this copy." : "Overlay mode · Original park preserved. Add your own objects and reshape surrounding terrain."}</p>${this.owner ? `<button data-do="owner">${this.ownerMode ? "Disable" : "Enable"} Owner Editing</button>` : ""}${Object.entries(
      CATALOG,
    )
      .map(
        ([cat, types]) =>
          `<details ${cat === "Ramps" ? "open" : ""}><summary>${cat}</summary>${types.map((t) => `<button data-asset="${t}" class="${this.asset === t && this.mode === "place" ? "chosen" : ""}">${t}</button>`).join("")}</details>`,
      )
      .join(
        "",
      )}<details open><summary>Terrain / Paths</summary><p class="terrain-help">The BMX sand is terrain, not an item. Pick a brush, then drag directly over it. Raise/lower changes the sand and collision. The wooden park remains protected.</p><button data-do="focusBmx">Focus BMX terrain</button>${["raise", "lower", "smooth", "flatten"].map((t) => `<button data-brush="${t}">${t}</button>`).join("")}<label>Brush radius<input id="brush-radius" type="number" min="0.5" max="20" step="0.5" value="${this.brushRadius}"></label><label>Strength<input id="brush-strength" type="number" min="0.05" max="3" step="0.1" value="${this.brushStrength}"></label><label>Path surface<select id="path-material">${["dirt", "asphalt", "concrete", "gravel"].map((m) => `<option ${m === this.pathMaterial ? "selected" : ""}>${m}</option>`).join("")}</select></label><label>Path width<input id="path-width" type="number" min="0.5" max="15" step="0.5" value="${this.pathWidth}"></label><button data-do="path">Draw Path</button><button data-do="finishPath">Finish Path</button></details></aside><aside class="editor-inspector"><h2>${o ? esc(o.type) : base ? "Existing asset" : "Select / Place"}</h2><button data-do="select">Select</button><button data-tool="translate">Move (G)</button><button data-tool="rotate">Rotate (T)</button><button data-tool="scale">Resize (J)</button><label>Grid snap<select id="editor-grid">${[0, 0.1, 0.25, 0.5].map((v) => `<option ${this.grid === v ? "selected" : ""} value="${v}">${v || "Free"}</option>`).join("")}</select></label><label>Angle snap<select id="editor-angle">${[0, 5, 15, 45].map((v) => `<option ${this.angle === v ? "selected" : ""} value="${v}">${v || "Free"}</option>`).join("")}</select></label>${
      o
        ? [
            "x",
            "y",
            "z",
            "rotation",
            "width",
            "height",
            "length",
            "radius",
            "deck",
          ]
            .map(
              (k) =>
                `<label>${k === "radius" ? "Transition radius" : k === "deck" ? "Deck depth" : k}<input data-prop="${k}" type="number" step="${k === "rotation" ? 5 : 0.1}" value="${Number((k === "rotation" ? (o.rotation * 180) / Math.PI : (o[k as keyof typeof o] as number)).toFixed(2))}"></label>`,
            )
            .join("") +
          `<label>Surface<select data-prop="material">${Object.keys(MATERIALS)
            .map(
              (m) =>
                `<option ${m === o.material ? "selected" : ""}>${m}</option>`,
            )
            .join(
              "",
            )}</select></label><label><input data-prop="coping" type="checkbox" ${o.coping ? "checked" : ""}> Coping</label><label><input data-prop="grindable" type="checkbox" ${o.grindable ? "checked" : ""}> Grindable edges</label><button data-do="duplicate">Duplicate</button><button data-do="remove">Delete object</button>`
        : base
          ? `<p>Move, rotate, or resize with the handles. Collision follows the asset.</p><label>Asset color<input id="base-color" type="color" value="${this.layout.baseEdits[this.selected]?.color ?? "#889977"}"></label><button data-do="remove">Hide asset</button>`
          : "<p>Choose an asset on the left, then click the park to place it.</p>"
    }<button data-do="debug">${this.showDebug ? "Hide" : "Show"} collision / grind paths</button><h3>Objects (${this.layout.objects.length}/${LIMIT})</h3>${this.ownerMode ? `<label>Existing park assets<select id="base-select"><option value="">Select existing scenery…</option>${this.baseObjects.map((b) => `<option value="${b.userData.baseId}">${esc(b.name)} · ${b.position.x.toFixed(0)}, ${b.position.z.toFixed(0)}</option>`).join("")}</select></label>` : ""}<select id="editor-object"><option value="">Select an object…</option>${this.layout.objects.map((v) => `<option value="${v.id}" ${v.id === this.selected ? "selected" : ""}>${esc(v.type)} · ${v.x.toFixed(1)}, ${v.z.toFixed(1)}</option>`).join("")}</select></aside><footer role="status">${esc(this.notice)}${this.layout.objects.length > 200 ? " · Many objects: performance may drop." : ""}<small>Right drag: orbit · Wheel: zoom · Middle drag: pan · WASD: fly · Q/E: down/up · Controller LS: fly, RS: look, triggers: vertical · Ctrl+Z / Ctrl+Y: undo / redo</small></footer>`;
    const commands: Record<string, () => void> = {
      new: () => {
        this.history.commit((l) => Object.assign(l, blankLayout()));
        this.slot = "";
        this.onBuild(this.safeLayout());
        this.ui();
      },
      publish: () => {
        void this.publish();
      },
      save: () => this.save(),
      saveAs: () => this.save(true),
      export: () => this.export(),
      undo: () => this.undo(),
      redo: () => this.undo(true),
      test: () => this.testRide(),
      exit: () => {
        this.active = false;
        this.root.hidden = true;
        this.gizmo.detach();
        this.orbit.enabled = false;
        document.body.classList.remove("editing");
        this.onExit();
      },
      select: () => {
        this.mode = "select";
        this.pathMode = false;
        this.ui();
      },
      duplicate: () => this.duplicate(),
      remove: () => this.remove(),
      owner: () => {
        this.ownerMode = !this.ownerMode;
        this.onBuild(this.safeLayout());
        this.ui();
      },
      path: () => {
        this.pathMode = true;
        this.mode = "select";
        this.notice = "Click points along your path.";
        this.ui();
      },
      focusBmx: () => {
        this.mode = "lower";
        this.pathMode = false;
        this.brushRadius = 6;
        this.brushStrength = 0.35;
        this.gizmo.detach();
        this.orbit.target.set(-62, 0, 3);
        this.camera.position.set(-48, 19, 34);
        this.notice =
          "BMX terrain ready. Drag over the sand to lower it away from the sidewalk.";
        this.ui();
      },
      finishPath: () => this.finishPath(),
      debug: () => {
        this.showDebug = !this.showDebug;
        this.onBuild(this.safeLayout());
        this.ui();
      },
      deleteSlot: () => {
        if (!this.slot) {
          this.notice = "Load a saved park first.";
          this.ui();
          return;
        }
        const slots = this.slots();
        delete slots[this.slot];
        try {
          localStorage.setItem(STORAGE, JSON.stringify(slots));
          this.slot = "";
          this.notice = "Saved slot deleted. Current layout remains editable.";
        } catch {
          this.notice = "Could not delete the saved slot.";
        }
        this.ui();
      },
    };
    this.root
      .querySelectorAll<HTMLElement>("[data-do]")
      .forEach((b) => (b.onclick = () => commands[b.dataset.do!]()));
    this.root.querySelectorAll<HTMLElement>("[data-asset]").forEach(
      (b) =>
        (b.onclick = () => {
          this.asset = b.dataset.asset!;
          this.mode = "place";
          this.gizmo.detach();
          this.notice = "Click the park to place " + this.asset;
          this.ui();
        }),
    );
    this.root
      .querySelectorAll<HTMLElement>("[data-tool]")
      .forEach((b) => (b.onclick = () => this.setTool(b.dataset.tool as any)));
    this.root.querySelectorAll<HTMLElement>("[data-brush]").forEach(
      (b) =>
        (b.onclick = () => {
          this.mode = b.dataset.brush as any;
          this.gizmo.detach();
          this.notice =
            "Drag on the park ground. This reshapes the BMX sand too; wooden ramps stay protected.";
          this.ui();
        }),
    );
    this.root.querySelectorAll<HTMLInputElement>("[data-prop]").forEach(
      (e) =>
        (e.onchange = () =>
          this.change((l) => {
            const v = l.objects.find((v) => v.id === this.selected)!;
            const key = e.dataset.prop!;
            (v as any)[key] =
              e.type === "checkbox"
                ? e.checked
                : key === "material"
                  ? e.value
                  : Number(e.value) * (key === "rotation" ? Math.PI / 180 : 1);
          })),
    );
    const baseSelect =
      this.root.querySelector<HTMLSelectElement>("#base-select");
    if (baseSelect)
      baseSelect.onchange = () => {
        const b = this.baseObjects.find(
          (b) => b.userData.baseId === baseSelect.value,
        );
        if (b) {
          this.attach(b);
          this.orbit.target.copy(b.position);
          this.camera.position
            .copy(b.position)
            .add(new THREE.Vector3(10, 8, 10));
        }
      };
    const color = this.root.querySelector<HTMLInputElement>("#base-color");
    if (color)
      color.onchange = () =>
        this.change((l) => {
          l.baseEdits[this.selected] = {
            ...(l.baseEdits[this.selected] ?? {
              x: 0,
              y: 0,
              z: 0,
              rotation: 0,
              hidden: false,
            }),
            color: color.value,
          };
        });
    const bind = (id: string, fn: (e: HTMLInputElement) => void) => {
      const el = this.root.querySelector<HTMLInputElement>("#" + id)!;
      el.onchange = () => fn(el);
    };
    bind("path-material", (e) => (this.pathMaterial = e.value));
    bind(
      "path-width",
      (e) =>
        (this.pathWidth = Math.max(0.5, Math.min(15, Number(e.value) || 3))),
    );
    bind("editor-title", (e) =>
      this.change((l) => {
        l.title = e.value;
      }),
    );
    bind("editor-load", (e) => {
      if (e.value) this.load(e.value);
    });
    bind("editor-import", (e) => {
      if (e.files?.[0]) void this.import(e.files[0]);
    });
    bind("editor-grid", (e) => {
      this.grid = Number(e.value);
      this.gizmo.setTranslationSnap(this.grid || null);
    });
    bind("editor-angle", (e) => {
      this.angle = Number(e.value);
      this.gizmo.setRotationSnap((this.angle * Math.PI) / 180 || null);
    });
    bind(
      "brush-radius",
      (e) =>
        (this.brushRadius = Math.max(0.5, Math.min(20, Number(e.value) || 4))),
    );
    bind(
      "brush-strength",
      (e) =>
        (this.brushStrength = Math.max(
          0.05,
          Math.min(3, Number(e.value) || 0.5),
        )),
    );
    bind("editor-object", (e) => {
      const obj = this.objects.find((o) => o.userData.editorId === e.value);
      if (obj) {
        this.attach(obj);
        this.orbit.target.copy(obj.position);
        this.camera.position
          .copy(obj.position)
          .add(new THREE.Vector3(8, 7, 10));
      }
    });
  }
}
