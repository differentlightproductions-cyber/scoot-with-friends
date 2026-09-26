// The hologram mini editor (#66): in a session, the phone's RIDES and RIDER
// apps project a small see-through panel beside the rider instead of opening
// the full editors (those stay in the main menu, outside a session). One row
// per part or look; LS up/down picks a row, LS left/right cycles it and the
// rider in the world changes at once; A applies and saves, B puts everything
// back as it was. The camera swings round to face the rider while it is up.
import { AVATAR_CHOICES, AVATAR_PRESETS, type AvatarConfig } from "../avatar/config";
import { uiSound } from "../audio/audio";
import { inventoryItems } from "../data/inventory";
import { LONGBOARD_CATEGORIES } from "../data/longboardParts";
import { CATEGORIES } from "../data/scooterParts";
import { loadProfile, type LocalProfile } from "../data/loadout";
import type { InputFrame } from "../input/input";
import "./hologram.css";

export type HoloMode = "ride" | "rider";
interface Row { label: string; value: (d: LocalProfile) => string; swatch?: (d: LocalProfile) => number | undefined; cycle: (d: LocalProfile, dir: 1 | -1) => boolean }
export interface HoloDeps {
  /** The profile the game is using now. */
  profile(): LocalProfile;
  /** Shows a draft on the rider in the world. */
  preview(draft: LocalProfile): void;
  /** Saves a finished draft; returns '' or why it could not. */
  save(draft: LocalProfile, mode: HoloMode): string;
}

const REPEAT_FIRST = 0.34, REPEAT_NEXT = 0.12;
const words = (id: string) => id.replace(/[-_]/g, " ");
const wrapIndex = (i: number, n: number) => ((i % n) + n) % n;

/** Rider looks worth changing mid-session, in the creator's order. */
const RIDER_FIELDS: [keyof AvatarConfig, string][] = [
  ["hairStyle", "HAIR"], ["hairColor", "HAIR COLOR"], ["facialHair", "FACIAL HAIR"],
  ["top", "TOP"], ["topColor", "TOP COLOR"], ["bottom", "BOTTOMS"], ["bottomColor", "BOTTOMS COLOR"],
  ["shoes", "SHOES"], ["shoeColor", "SHOE COLOR"], ["headwear", "HEADWEAR"], ["headwearColor", "HEADWEAR COLOR"],
  ["eyewear", "EYEWEAR"], ["wristband", "WRISTBAND"], ["wristbandColor", "WRISTBAND COLOR"],
];

export class HologramEditor {
  readonly root: HTMLElement;
  active = false;
  mode: HoloMode = "ride";
  private draft: LocalProfile | null = null;
  private rows: Row[] = [];
  private focus = 0;
  private heldDir = "";
  private repeat = 0;
  private notice = "";
  private age = 0;
  /** Called when the panel closes (applied or cancelled). */
  onClose: () => void = () => {};

  constructor(private deps: HoloDeps, parent: HTMLElement) {
    this.root = document.createElement("section");
    this.root.id = "holo";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "Hologram editor");
    parent.append(this.root);
    this.root.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-holo]");
      if (!target) return;
      const [kind, index] = target.dataset.holo!.split(":");
      if (kind === "apply") this.apply();
      else if (kind === "cancel") this.close(false);
      else if (kind === "prev" || kind === "next") { this.focus = Number(index); this.cycle(kind === "next" ? 1 : -1); }
      else if (kind === "row") { this.focus = Number(index); uiSound("move"); this.render(); }
    });
  }

  open(mode: HoloMode) {
    this.mode = mode;
    this.draft = structuredClone(this.deps.profile());
    this.rows = mode === "ride" ? this.rideRows() : this.riderRows();
    this.focus = 0; this.heldDir = ""; this.notice = ""; this.age = 0;
    this.active = true;
    this.root.hidden = false;
    this.root.classList.remove("holo-out");
    this.root.dataset.mode = mode;
    uiSound("select");
    this.render();
  }

  /** Controller input while open: the panel owns it all, the rider gets nothing. */
  step(f: InputFrame, dt: number): boolean {
    if (!this.active) return false;
    this.age += dt;
    // Ignore the press that opened it from the phone.
    if (this.age < 0.12) return true;
    if (f.pressed.brakeBars || f.pressed.pause) { this.close(false); return true; }
    if (f.pressed.hop) { this.apply(); return true; }
    if (f.pressed.pushDeck) { this.open(this.mode === "ride" ? "rider" : "ride"); return true; }
    const x = f.steer, y = f.lean;
    const dir = Math.abs(x) > 0.5 && Math.abs(x) >= Math.abs(y) ? (x > 0 ? "right" : "left") : Math.abs(y) > 0.5 ? (y > 0 ? "down" : "up") : "";
    if (!dir) { this.heldDir = ""; return true; }
    if (dir === this.heldDir) { this.repeat -= dt; if (this.repeat > 0) return true; this.repeat = REPEAT_NEXT; }
    else { this.heldDir = dir; this.repeat = REPEAT_FIRST; }
    if (dir === "left" || dir === "right") this.cycle(dir === "right" ? 1 : -1);
    else {
      const next = Math.max(0, Math.min(this.rows.length - 1, this.focus + (dir === "down" ? 1 : -1)));
      if (next !== this.focus) { this.focus = next; uiSound("move"); this.render(); }
    }
    return true;
  }

  private cycle(dir: 1 | -1) {
    const row = this.rows[this.focus];
    if (!row || !this.draft) return;
    if (row.cycle(this.draft, dir)) { uiSound("move"); this.notice = ""; this.deps.preview(this.draft); }
    this.render();
  }

  private apply() {
    if (!this.draft) return;
    const error = this.deps.save(this.draft, this.mode);
    if (error) { this.notice = error; uiSound("back"); this.render(); return; }
    uiSound("select");
    this.close(true);
  }

  /** Closes; a cancel puts the saved look back on the rider. */
  close(applied: boolean) {
    if (!this.active) return;
    this.active = false;
    if (!applied) { uiSound("back"); this.deps.preview(this.deps.profile()); }
    this.root.classList.add("holo-out");
    window.setTimeout(() => { if (!this.active) this.root.hidden = true; }, 220);
    this.draft = null;
    this.onClose();
  }

  // ---- rows -----------------------------------------------------------------
  private rideRows(): Row[] {
    const wallet = loadProfile().wallet;
    const board = this.draft!.activeRideable === "longboard";
    if (board) {
      return LONGBOARD_CATEGORIES.map((category) => {
        const owned = inventoryItems(wallet, "owned", { rideable: "longboard", category });
        const at = (d: LocalProfile) => owned.findIndex((i) => i.partId === d.longboard[category].partId && i.variantId === d.longboard[category].variantId);
        return {
          label: category.toUpperCase(),
          value: (d) => { const i = owned[at(d)]; return i ? `${i.partName} / ${i.variantName}` : "—"; },
          cycle: (d, dir) => {
            if (owned.length < 2) return false;
            const next = owned[wrapIndex(at(d) + dir, owned.length)];
            (d.longboard as Record<string, { partId: string; variantId: string }>)[category] = { partId: next.partId, variantId: next.variantId };
            return true;
          },
        };
      });
    }
    return CATEGORIES.map((category) => {
      const owned = inventoryItems(wallet, "owned", { rideable: "scooter", category });
      const slot = category === "wheels" ? "frontWheel" : category;
      const at = (d: LocalProfile) => { const s = d.scooter[slot]; return owned.findIndex((i) => i.partId === s.partId && i.variantId === s.variantId); };
      return {
        label: category === "griptape" ? "GRIP TAPE" : category.toUpperCase(),
        value: (d) => { const i = owned[at(d)]; return i ? `${i.brand} ${i.partName} / ${i.variantName}` : "—"; },
        cycle: (d, dir) => {
          if (owned.length < 2) return false;
          const next = owned[wrapIndex(at(d) + dir, owned.length)], selection = { partId: next.partId, variantId: next.variantId };
          if (category === "wheels") { d.scooter.frontWheel = { ...selection }; d.scooter.rearWheel = { ...selection }; }
          else d.scooter[category] = selection;
          return true;
        },
      };
    });
  }

  private riderRows(): Row[] {
    const presets: Row = {
      label: "PRESET",
      value: (d) => AVATAR_PRESETS.find((p) => JSON.stringify(p.config) === JSON.stringify(d.avatar))?.name.toUpperCase() ?? "YOUR RIDER",
      cycle: (d, dir) => {
        const i = AVATAR_PRESETS.findIndex((p) => JSON.stringify(p.config) === JSON.stringify(d.avatar));
        d.avatar = structuredClone(AVATAR_PRESETS[wrapIndex((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir, AVATAR_PRESETS.length)].config);
        return true;
      },
    };
    return [presets, ...RIDER_FIELDS.map(([field, label]): Row => {
      const list = (AVATAR_CHOICES as Record<string, readonly { id: string; name: string; hex?: number }[]>)[field];
      const at = (d: LocalProfile) => list.findIndex((o) => o.id === d.avatar[field]);
      return {
        label,
        value: (d) => list[at(d)]?.name.toUpperCase() ?? words(String(d.avatar[field])).toUpperCase(),
        swatch: (d) => list[at(d)]?.hex,
        cycle: (d, dir) => { (d.avatar as unknown as Record<string, string>)[field] = list[wrapIndex(at(d) + dir, list.length)].id; return true; },
      };
    })];
  }

  // ---- drawing --------------------------------------------------------------
  private render() {
    const d = this.draft;
    if (!d) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const board = d.activeRideable === "longboard";
    const title = this.mode === "ride" ? (board ? "LONGBOARD" : "SCOOTER") : "RIDER";
    // Rows in view: a window of 9 around the focus.
    const first = Math.max(0, Math.min(this.rows.length - 9, this.focus - 4));
    const rows = this.rows.slice(first, first + 9).map((row, k) => {
      const i = first + k, swatch = row.swatch?.(d);
      const chip = swatch === undefined ? "" : `<i class="holo-chip" style="background:#${swatch.toString(16).padStart(6, "0")}"></i>`;
      return `<li class="${i === this.focus ? "on" : ""}" data-holo="row:${i}"><b>${esc(row.label)}</b><span><button type="button" data-holo="prev:${i}" aria-label="Previous">‹</button>${chip}<em>${esc(row.value(d))}</em><button type="button" data-holo="next:${i}" aria-label="Next">›</button></span></li>`;
    }).join("");
    this.root.innerHTML = `<div class="holo-panel"><header><small>HOLO EDIT</small><strong>${title}</strong><small class="holo-swap">X · ${this.mode === "ride" ? "RIDER" : "RIDE"}</small></header>
<ol>${rows}</ol>${this.notice ? `<p class="holo-note">${esc(this.notice)}</p>` : ""}
<footer><span>LS ↕ PICK · LS ↔ CHANGE</span><button type="button" data-holo="apply">A · APPLY</button><button type="button" data-holo="cancel">B · CANCEL</button></footer></div><div class="holo-beam" aria-hidden="true"></div>`;
  }
}
