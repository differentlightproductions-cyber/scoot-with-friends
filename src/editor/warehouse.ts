import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Park, ACTIVE_MAP, SPAWNS } from '../park/park';
import { buildObject } from './assets';
import { blankLayout, LayoutHistory, localXZ, makeObject, setActiveLayout, validateLayout, type ParkObject, type ParkLayout } from './layout';
import { emptyInput, type InputFrame } from '../input/input';
import type { Simulation } from '../physics/simulation';
import { BUILD_BOUNDS, BUILD_CATALOG, BUILD_LIMITS, PILLAR_HALF, WAREHOUSE_FIXTURES, WAREHOUSE_PILLARS, buildAsset, savedPiece, type BuildAsset, type SavedBuild } from '../data/builds';
import { saveProfile, type LocalProfile } from '../data/loadout';

/** Grid snap (clean parks), a fine step, or free placement (creative lines); Y cycles them. */
export const SNAP_MODES = [
  { name: 'GRID 1 M', step: 1, turn: Math.PI / 4 },
  { name: 'FINE 25 CM', step: 0.25, turn: Math.PI / 12 },
  { name: 'FREE', step: 0, turn: Math.PI / 36 },
] as const;
const LEGACY_KEY = 'swf-warehouse-v1';
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A layout object for a catalog piece: the same object the layout editor and asset factory use. */
export function pieceObject(a: BuildAsset, x: number, z: number, rotation: number, id?: string): ParkObject {
  const o = makeObject(a.type, x, z);
  Object.assign(o, {
    y: 0, rotation, width: a.width, height: a.height, length: a.length, asset: a.id,
    radius: a.radius ?? (a.type === 'Quarter Pipe' ? a.length - 1 : 2),
    deck: a.deck ?? (a.type === 'Spine' ? 0.2 : 1),
    material: a.material ?? o.material,
  });
  if (id) o.id = id;
  return o;
}
/** The catalog piece an object was made from (older saves and raw objects carry none). */
export function matchAsset(o: ParkObject): BuildAsset | undefined {
  if (o.asset) return buildAsset(o.asset);
  const same = BUILD_CATALOG.filter((a) => a.type === o.type);
  return same.find((a) => Math.abs(a.height - o.height) < 0.05 && Math.abs(a.length - o.length) < 0.05) ?? same[0];
}
type Corner = [number, number];
function corners(o: ParkObject, pad: number): Corner[] {
  const hw = Math.max(0.02, o.width / 2 + pad), hl = Math.max(0.02, o.length / 2 + pad), c = Math.cos(o.rotation), s = Math.sin(o.rotation);
  return ([[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]] as Corner[]).map(([x, z]) => [o.x + x * c + z * s, o.z - x * s + z * c]);
}
/** Separating-axis test for two convex quads on the floor plan. */
function overlaps(a: Corner[], b: Corner[]) {
  for (const poly of [a, b])
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % 4], nx = z0 - z1, nz = x1 - x0;
      const span = (p: Corner[]) => { let lo = Infinity, hi = -Infinity; for (const [x, z] of p) { const d = x * nx + z * nz; lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi]; };
      const [a0, a1] = span(a), [b0, b1] = span(b);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  return true;
}

/**
 * Warehouse build mode, driven from the phone's BUILD app: pick a catalog
 * piece, move and turn its ghost (green valid, red not), place it, then edit,
 * duplicate or delete placed pieces. Pieces are ordinary layout objects built
 * by the same asset factory as authored ones, so they ride, grind and collide
 * identically the moment they are placed. The layout editor's LayoutHistory
 * gives undo and redo; the build saves compactly on the player's profile.
 */
export class WarehouseBuilder {
  layout: ParkLayout = blankLayout();
  placement: ParkObject | null = null;
  selected: string | null = null;
  prompt = document.createElement('div');
  saveError = '';
  /** Last save or edit message for the BUILD app. */
  notice = '';
  snap = 0;
  /** Why the ghost cannot be placed where it is ('' when it can). */
  reason = '';
  private history: LayoutHistory;
  private built = new Map<string, { group: THREE.Group; handles: number[]; json: string }>();
  private ghost: THREE.Group | null = null;
  private ghostMaterial: THREE.MeshStandardMaterial | null = null;
  private ghostEdges: THREE.LineBasicMaterial | null = null;
  private cursor = new THREE.Vector3();
  private angle = 0;
  private turnDelay = 0;
  private editing: string | null = null;
  private viewYaw = 0;
  private view = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false };
  private pendingView = true;
  /** Called after the placed pieces change (the map retakes its overhead photo). */
  onChange: (() => void) | null = null;
  constructor(private park: Park, private profile: () => LocalProfile | null = () => null) {
    this.prompt.className = 'world-prompt build-prompt';
    this.prompt.hidden = true;
    document.body.append(this.prompt);
    this.history = new LayoutHistory(blankLayout());
    if (ACTIVE_MAP !== 'warehouse') return;
    const stored = this.profile()?.builds?.warehouse, saved = stored ?? this.legacy();
    this.history = new LayoutHistory(this.fromSaved(saved));
    this.layout = this.history.layout;
    setActiveLayout(this.layout);
    this.sync();
    // A build from the old local-only save moves onto the profile once.
    if (!stored && saved?.pieces.length) this.persist();
  }
  dispose() { this.cancel(); this.prompt.remove(); }

  // ---- Catalog, budget and saved form --------------------------------------
  get used() { return this.layout.objects.reduce((sum, o) => sum + (matchAsset(o)?.cost ?? 0), 0); }
  get canUndo() { return this.history.past.length > 0; }
  get canRedo() { return this.history.future.length > 0; }
  /** Add a catalog piece a few metres ahead of the rider. */
  add(a: BuildAsset, s: Simulation) {
    const d = 3 + a.length / 2, x = s.position.x + Math.sin(s.yaw) * d, z = s.position.z + Math.cos(s.yaw) * d;
    const turn = SNAP_MODES[this.snap].turn;
    this.begin(pieceObject(a, x, z, Math.round(s.yaw / turn) * turn));
  }
  /** Kept for callers of the earlier builder: one action per catalog piece. */
  options(s: Simulation) { return BUILD_CATALOG.map((a) => ({ label: a.label, asset: a, action: () => this.add(a, s) })); }
  private fromSaved(saved: SavedBuild | undefined) {
    const layout = blankLayout();
    layout.title = 'Warehouse build';
    layout.objects = (saved?.pieces ?? []).flatMap(([id, x, z, r]) => { const a = buildAsset(id); return a ? [pieceObject(a, x, z, r)] : []; });
    return layout;
  }
  private legacy(): SavedBuild | undefined {
    try {
      const d = localStorage.getItem(LEGACY_KEY);
      if (!d) return undefined;
      const l = validateLayout(JSON.parse(d));
      return { version: 1, pieces: l.objects.flatMap((o) => { const a = matchAsset(o); return a ? [savedPiece(a.id, o.x, o.z, o.rotation)] : []; }) };
    } catch { this.saveError = 'The old warehouse save could not be read; it was left untouched.'; return undefined; }
  }
  private persist() {
    const p = this.profile();
    if (!p) return false;
    const pieces = this.layout.objects.flatMap((o) => { const a = matchAsset(o); return a ? [savedPiece(a.id, o.x, o.z, o.rotation)] : []; });
    p.builds = { ...p.builds, warehouse: { version: 1, pieces } };
    const ok = saveProfile(p);
    this.saveError = ok ? '' : 'Save unavailable · the build stays until you leave the Warehouse';
    return ok;
  }
  /** SAVE BUILD: every edit already saves; this confirms it for the player. */
  save() { const ok = this.persist(); this.notice = ok ? 'BUILD SAVED · ' + this.layout.objects.length + ' PIECES' : this.saveError; return ok; }

  // ---- Layout changes (undoable) --------------------------------------------
  private commit(change: (l: ParkLayout) => void) {
    this.history.commit(change);
    while (this.history.past.length > BUILD_LIMITS.history) this.history.past.shift();
    this.apply();
  }
  private apply() { this.layout = this.history.layout; setActiveLayout(this.layout); this.sync(); this.persist(); this.onChange?.(); }
  undo() { if (!this.canUndo) return; this.history.undo(); this.apply(); this.notice = 'UNDONE'; }
  redo() { if (!this.canRedo) return; this.history.redo(); this.apply(); this.notice = 'REDONE'; }
  /** CLEAR BUILD (after the app's confirmation): the warehouse back to empty; UNDO still restores it. */
  reset() { this.cancel(); if (this.layout.objects.length) this.commit((l) => { l.objects = []; }); this.notice = 'WAREHOUSE CLEARED'; }
  deletePiece(id: string) { this.commit((l) => { l.objects = l.objects.filter((o) => o.id !== id); }); this.notice = 'PIECE DELETED'; }
  move(id: string) {
    const o = this.layout.objects.find((v) => v.id === id);
    if (!o) return;
    const b = this.built.get(id);
    if (b) b.group.visible = false;
    this.begin(structuredClone(o), id);
  }
  duplicate(id: string) {
    const o = this.layout.objects.find((v) => v.id === id);
    if (!o) return;
    const copy = structuredClone(o);
    copy.id = makeObject(o.type).id;
    copy.x += Math.cos(o.rotation) * (o.width + 0.5);
    copy.z -= Math.sin(o.rotation) * (o.width + 0.5);
    this.begin(copy);
  }
  /** Placed pieces, nearest first, for the app's edit list. */
  placed(s: Simulation) {
    return this.layout.objects
      .map((o) => ({ o, asset: matchAsset(o), distance: Math.hypot(o.x - s.position.x, o.z - s.position.z) }))
      .sort((a, b) => a.distance - b.distance);
  }
  /** The earlier builder's nearest-piece actions, kept for its callers. */
  editOptions(s: Simulation) {
    const near = this.placed(s)[0];
    if (!near || near.distance > Math.max(near.o.width, near.o.length) / 2 + 3) return [];
    const name = near.asset?.label ?? near.o.type;
    return [
      { label: 'Move / Rotate ' + name, action: () => this.move(near.o.id) },
      { label: 'Duplicate ' + name, action: () => this.duplicate(near.o.id) },
      { label: 'Delete ' + name, action: () => this.deletePiece(near.o.id) },
    ];
  }

  // ---- Built pieces ------------------------------------------------------------
  /** Make the world match the layout: rebuild what changed, remove what went. */
  private sync() {
    const want = new Map(this.layout.objects.map((o) => [o.id, JSON.stringify(o)]));
    for (const [id, b] of [...this.built]) if (want.get(id) !== b.json) this.remove(id);
    for (const o of this.layout.objects) if (!this.built.has(o.id)) this.build(o, want.get(o.id)!);
    this.park.world.step();
  }
  private build(o: ParkObject, json: string) {
    const before = new Set<number>();
    this.park.world.forEachCollider((c) => before.add(c.handle));
    const group = buildObject(this.park, o), handles: number[] = [];
    this.park.world.forEachCollider((c) => { if (!before.has(c.handle)) handles.push(c.handle); });
    this.built.set(o.id, { group, handles, json });
  }
  private remove(id: string) {
    const b = this.built.get(id);
    if (!b) return;
    for (const handle of b.handles) { const c = this.park.world.getCollider(handle); if (c) this.park.world.removeCollider(c, true); this.park.railHandles.delete(handle); }
    this.park.rails = this.park.rails.filter((r) => !b.handles.includes(r.colliderHandle ?? -1));
    this.park.benches = this.park.benches.filter((v) => v.id !== id && !v.id.startsWith(id));
    const objects = new Set<THREE.Object3D>();
    b.group.traverse((o) => objects.add(o));
    this.park.solids = this.park.solids.filter((o) => !objects.has(o));
    b.group.removeFromParent();
    b.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!m.userData.shared) m.dispose(); } });
    this.built.delete(id);
  }

  // ---- Placement -----------------------------------------------------------------
  begin(o: ParkObject, editing: string | null = null) {
    this.cancel();
    const piece = structuredClone(o);
    piece.asset ??= matchAsset(piece)?.id;
    piece.y = 0;
    this.placement = piece;
    this.editing = editing;
    this.cursor.set(piece.x, 0, piece.z);
    this.angle = piece.rotation;
    this.pendingView = true;
    this.view.ready = false;
    // The exact asset factory, in an isolated temporary world: the ghost has no live colliders.
    const temp = Object.assign(Object.create(Park.prototype), { scene: new THREE.Scene(), world: new RAPIER.World({ x: 0, y: 0, z: 0 }), rails: [], railHandles: new Set(), solids: [], benches: [] }) as Park;
    this.ghost = buildObject(temp, piece);
    temp.world.free();
    // Lit and outlined so the piece reads as a solid shape from any build-camera angle.
    this.ghostMaterial = new THREE.MeshStandardMaterial({ color: 0x5fd38a, emissive: 0x5fd38a, emissiveIntensity: 0.3, roughness: 0.7, transparent: true, opacity: 0.55, depthWrite: false });
    this.ghostEdges = new THREE.LineBasicMaterial({ color: 0xcaffdc, transparent: true, opacity: 0.9, depthWrite: false });
    const meshes: THREE.Mesh[] = [];
    this.ghost.traverse((p) => { if (p instanceof THREE.Mesh) meshes.push(p); });
    for (const p of meshes) {
      for (const m of Array.isArray(p.material) ? p.material : [p.material]) if (!m.userData.shared) m.dispose();
      p.material = this.ghostMaterial; p.castShadow = false;
      p.add(new THREE.LineSegments(new THREE.EdgesGeometry(p.geometry, 35), this.ghostEdges));
    }
    this.park.scene.add(this.ghost);
  }
  cancel() {
    if (this.editing) { const b = this.built.get(this.editing); if (b) b.group.visible = true; }
    if (this.ghost) { this.ghost.removeFromParent(); this.ghost.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose(); }); this.ghostMaterial?.dispose(); this.ghostEdges?.dispose(); }
    this.ghost = null; this.ghostMaterial = null; this.ghostEdges = null; this.placement = null; this.editing = null; this.prompt.hidden = true; this.reason = '';
  }
  /** Why `o` cannot go where it is, or '' when it can. */
  check(o: ParkObject, s?: Simulation) {
    const others = this.layout.objects.filter((v) => v.id !== o.id && v.id !== this.editing);
    if (others.length + 1 > BUILD_LIMITS.pieces) return `Piece limit reached (${BUILD_LIMITS.pieces})`;
    const cost = others.reduce((sum, v) => sum + (matchAsset(v)?.cost ?? 0), 0) + (matchAsset(o)?.cost ?? 0);
    if (cost > BUILD_LIMITS.budget) return `Over the build budget (${cost}/${BUILD_LIMITS.budget})`;
    const outline = corners(o, 0);
    if (outline.some(([x, z]) => Math.abs(x) > BUILD_BOUNDS.x || Math.abs(z) > BUILD_BOUNDS.z)) return 'Inside a wall';
    for (const [x, z] of WAREHOUSE_PILLARS) {
      const h = PILLAR_HALF + 0.05;
      if (overlaps(outline, [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]])) return 'Hits a pillar';
    }
    for (const [x, z, w, l] of WAREHOUSE_FIXTURES)
      if (overlaps(outline, [[x - w, z - l], [x + w, z - l], [x + w, z + l], [x - w, z + l]])) return 'Hits the benches';
    const inside = (x: number, z: number, pad: number) => { const p = localXZ(o, x, z); return Math.abs(p.x) <= o.width / 2 + pad && Math.abs(p.z) <= o.length / 2 + pad; };
    if (SPAWNS.some((p) => inside(p.x, p.z, 1))) return 'Blocks a spawn point';
    if (s && inside(s.position.x, s.position.z, 0.45)) return 'Move clear of the rider';
    // Pieces may meet or overlap slightly (to connect); not sit inside each other.
    const hit = others.find((v) => overlaps(corners(o, -0.12), corners(v, -0.12)));
    if (hit) return 'Overlaps the ' + (matchAsset(hit)?.label ?? hit.type).toLowerCase();
    return '';
  }
  /**
   * Modular connection: near another piece turned the same way (or a quarter
   * turn), snap flush against its side or end and line the edges up, so a
   * quarter + platform + bank or a box + ledge meet without gaps.
   */
  private connect(o: ParkObject) {
    // Reaches half a grid cell, so a grid-rounded piece can always join flush.
    let best: { v: ParkObject; x: number; z: number } | null = null, bestGap = 0.55;
    const align = (p: number, own: number, other: number) => {
      for (const t of [0, other - own, own - other]) if (Math.abs(p - t) < 0.35) return t;
      return p;
    };
    for (const v of this.layout.objects) {
      if (v.id === o.id || v.id === this.editing) continue;
      const d = wrap(o.rotation - v.rotation), quarter = Math.round(d / (Math.PI / 2));
      if (Math.abs(d - quarter * (Math.PI / 2)) > 0.02) continue;
      const swap = Math.abs(quarter) % 2 === 1, hw = (swap ? o.length : o.width) / 2, hl = (swap ? o.width : o.length) / 2;
      const p = localXZ(v, o.x, o.z), vw = v.width / 2, vl = v.length / 2;
      if (Math.abs(p.x) < vw + hw - 0.05)
        for (const side of [-1, 1]) { const gap = Math.abs(p.z - side * (vl + hl)); if (gap < bestGap) { bestGap = gap; best = { v, x: align(p.x, hw, vw), z: side * (vl + hl) }; } }
      if (Math.abs(p.z) < vl + hl - 0.05)
        for (const side of [-1, 1]) { const gap = Math.abs(p.x - side * (vw + hw)); if (gap < bestGap) { bestGap = gap; best = { v, x: side * (vw + hw), z: align(p.z, hl, vl) }; } }
    }
    if (!best) return false;
    const c = Math.cos(best.v.rotation), s = Math.sin(best.v.rotation);
    o.x = best.v.x + best.x * c + best.z * s;
    o.z = best.v.z - best.x * s + best.z * c;
    return true;
  }
  /** The build camera: frames the ghost from the view angle LT/RT turn. */
  frame(cam: THREE.Camera, dt: number) {
    const o = this.placement;
    if (!o) return;
    if (this.pendingView) {
      const dir = cam.getWorldDirection(new THREE.Vector3());
      this.viewYaw = Math.atan2(dir.x, dir.z);
      this.pendingView = false;
    }
    const size = Math.max(o.width, o.length, 2), dist = 5 + size * 0.9, height = 3.2 + size * 0.45;
    const look = new THREE.Vector3(o.x, Math.min(o.height, 1.5) * 0.5, o.z);
    const pos = look.clone().add(new THREE.Vector3(-Math.sin(this.viewYaw) * dist, height, -Math.cos(this.viewYaw) * dist));
    pos.set(clamp(pos.x, -31.4, 31.4), Math.min(pos.y, 11.2), clamp(pos.z, -43.4, 43.4));
    if (!this.view.ready) { this.view.pos.copy(cam.position); this.view.look.copy(look); this.view.ready = true; }
    const k = 1 - Math.exp(-6 * dt);
    this.view.pos.lerp(pos, k);
    this.view.look.lerp(look, k);
    cam.position.copy(this.view.pos);
    cam.lookAt(this.view.look);
  }
  /** While placing, build mode owns the controls; gameplay receives nothing. */
  update(s: Simulation, f: InputFrame, dt: number) {
    this.prompt.hidden = true;
    if (!this.placement) return f;
    const o = this.placement;
    if (f.pressed.body) {
      this.snap = (this.snap + 1) % SNAP_MODES.length;
      const turn = SNAP_MODES[this.snap].turn;
      this.angle = Math.round(this.angle / turn) * turn;
    }
    const mode = SNAP_MODES[this.snap];
    // LT / RT turn the view around the piece.
    this.viewYaw += (f.held.pumpGrind - f.held.brake) * 1.8 * dt;
    // LS moves the piece relative to the view (as walking does); the D-pad nudges one step.
    const h = this.viewYaw, fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), right = new THREE.Vector3(-Math.cos(h), 0, Math.sin(h));
    const speed = mode.step === 1 ? 6 : 3;
    this.cursor.addScaledVector(fwd, -f.lean * speed * dt).addScaledVector(right, f.steer * speed * dt);
    // On a grid the D-pad moves exactly one cell along the world axis nearest to screen up / right.
    const nudge = mode.step || 0.1, q = mode.step ? Math.round(h / (Math.PI / 2)) * (Math.PI / 2) : h;
    const up = new THREE.Vector3(Math.round(Math.sin(q) * 1e6) / 1e6, 0, Math.round(Math.cos(q) * 1e6) / 1e6), side = new THREE.Vector3(-up.z, 0, up.x);
    if (f.pressed.marker) this.cursor.addScaledVector(up, nudge);
    if (f.pressed.menuDown) this.cursor.addScaledVector(up, -nudge);
    if (f.pressed.menuRight) this.cursor.addScaledVector(side, nudge);
    if (f.pressed.menuLeft) this.cursor.addScaledVector(side, -nudge);
    this.cursor.x = clamp(this.cursor.x, -BUILD_BOUNDS.x, BUILD_BOUNDS.x);
    this.cursor.z = clamp(this.cursor.z, -BUILD_BOUNDS.z, BUILD_BOUNDS.z);
    // LB / RB (and RS) turn it by the mode's step.
    this.turnDelay = Math.max(0, this.turnDelay - dt);
    if (f.pressed.leftModifier) this.angle += mode.turn;
    if (f.pressed.rightModifier) this.angle -= mode.turn;
    if (this.turnDelay === 0 && Math.abs(f.rx) > 0.5) { this.angle -= Math.sign(f.rx) * mode.turn; this.turnDelay = 0.18; }
    const snap = (v: number) => (mode.step ? Math.round(v / mode.step) * mode.step : v);
    o.x = snap(this.cursor.x);
    o.z = snap(this.cursor.z);
    o.rotation = wrap(this.angle);
    o.y = 0; // Stands on the warehouse floor: never floating, never buried.
    const joined = mode.step ? this.connect(o) : false;
    this.reason = this.check(o, s);
    const valid = !this.reason;
    if (this.ghost) { this.ghost.position.set(o.x, o.y, o.z); this.ghost.rotation.y = o.rotation; }
    this.ghostMaterial?.color.set(valid ? 0x5fd38a : 0xe0564a);
    this.ghostMaterial?.emissive.set(valid ? 0x5fd38a : 0xe0564a);
    this.ghostEdges?.color.set(valid ? 0xcaffdc : 0xffc4bd);
    const name = (matchAsset(o)?.label ?? o.type).toUpperCase();
    this.prompt.hidden = false;
    this.prompt.classList.toggle('invalid', !valid);
    this.prompt.innerHTML =
      `<b>${name}</b> · ${mode.name}${joined ? ' · JOINED' : ''} · ${this.used}/${BUILD_LIMITS.budget}` +
      `<br>LS move · D-pad nudge · LB RB turn · LT RT view · Y snap · A place · X place + another · B ${this.editing ? 'cancel edit' : 'cancel'}` +
      (valid ? '' : `<br><span class="build-invalid">${this.reason}</span>`);
    if (f.pressed.brakeBars) this.cancel();
    else if ((f.pressed.hop || f.pressed.pushDeck) && valid) {
      const piece = structuredClone(o), again = f.pressed.pushDeck, editing = this.editing;
      if (editing) { const b = this.built.get(editing); if (b) b.group.visible = true; }
      this.commit((l) => { const i = l.objects.findIndex((v) => v.id === piece.id); if (i >= 0) l.objects[i] = piece; else l.objects.push(piece); });
      this.notice = (editing ? 'MOVED ' : 'PLACED ') + name;
      this.editing = null;
      if (again) {
        // X keeps building: the same piece again, ready to move off the one just placed.
        const next = structuredClone(piece);
        next.id = makeObject(piece.type).id;
        const view = this.view.ready, yaw = this.viewYaw;
        this.begin(next);
        this.pendingView = false; this.viewYaw = yaw; this.view.ready = view;
      } else this.cancel();
    }
    return emptyInput();
  }
}
