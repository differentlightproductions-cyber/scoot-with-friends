// Cloud save: while signed in, the player's saved profile (Credit, parts,
// level, missions, crates, rider and settings) is copied to their account so
// it follows them to any device. It also stays on this device, and the game
// never needs the network to play.
//
// Each device remembers which account revision it last matched. The server
// refuses an upload that is not based on its current copy, so two devices can
// never silently overwrite each other; when both changed, the player chooses.
import { PROFILE_KEY, profileSaved } from "./loadout";
import { levelFor } from "./progress";

const SYNC_KEY = "swf-cloud-sync-v1";
const BACKUP_KEY = "lazer-profile-before-cloud-v1";
const CLOUD_BACKUP_KEY = "lazer-cloud-before-device-v1";
export interface SyncState { accountId: string; revision: number; hash: string }
export interface CloudCopy { data: any; revision: number; updated: number }
export type Plan = "push" | "pull" | "ask" | "none";

/** What to do with this device's save and the account's copy. */
export function reconcile(o: { accountId: string; local: { text: string; dirty: boolean; empty?: boolean }; synced: { accountId: string; revision: number } | null; server: { revision: number } | null }): Plan {
  if (!o.server) return "push";
  if (o.local.empty) return "pull";
  if (!o.synced || o.synced.accountId !== o.accountId) return "ask";
  if (o.server.revision === o.synced.revision) return o.local.dirty ? "push" : "none";
  return o.local.dirty ? "ask" : "pull";
}

/** A save at a glance, for choosing between two of them. */
export function saveSummary(data: any) {
  return { level: levelFor(Number(data?.progress?.xp) || 0).level, credit: Number(data?.wallet?.credit) || 0, parts: Array.isArray(data?.wallet?.owned) ? data.wallet.owned.length : 0 };
}

const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };

/** One request to the account API; throws a readable message. */
export async function accountRequest(action: string, data?: unknown, keepalive = false) {
  const response = await fetch("/api/account/" + action, { credentials: "same-origin", cache: "no-store", keepalive, ...(data ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : {}) });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Accounts are available on the published website. This local copy remains playable without sign-in.");
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error ?? "Please try again."), { status: response.status, result });
  return result;
}

export class CloudSync {
  account: { id: string; username: string } | null = null;
  /** Short status for the account screen. */
  status = "";
  onStatus = (_status: string) => {};
  /** The player chooses between this device and the account copy. */
  onAsk = (_device: ReturnType<typeof saveSummary>, _cloud: ReturnType<typeof saveSummary> & { updated: number }): Promise<"cloud" | "device"> => Promise.resolve("device");
  /** Called just before the page reloads onto the account copy. */
  onApply = () => {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** True while a sync is talking to the account. */
  busy = false;

  constructor() {
    profileSaved.add(() => this.changed());
    addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void this.upload(true); });
  }
  private set(status: string) { this.status = status; this.onStatus(status); }
  private state(): SyncState | null { try { return JSON.parse(read(SYNC_KEY) ?? "null"); } catch { return null; } }
  private remember(state: SyncState | null) { try { if (state) localStorage.setItem(SYNC_KEY, JSON.stringify(state)); else localStorage.removeItem(SYNC_KEY); } catch { /* private mode */ } }

  /** At startup: find out whether this browser is signed in, then sync. */
  async start() {
    try { const { account } = await accountRequest("session"); if (account) await this.signedIn(account); }
    catch { /* offline or a local copy: play on */ }
  }
  async signedIn(account: { id: string; username: string }) { this.account = account; await this.sync(); }
  signedOut() { this.account = null; this.set(""); }

  /** Brings this device and the account into agreement. */
  async sync() {
    if (!this.account || this.busy) return;
    this.busy = true;
    try {
      this.set("Checking your cloud save…");
      const { save } = (await accountRequest("save")) as { save: CloudCopy | null };
      const text = read(PROFILE_KEY) ?? "", synced = this.state();
      const plan = reconcile({ accountId: this.account.id, local: { text, dirty: !synced || synced.hash !== hash(text), empty: !text }, synced, server: save });
      if (plan === "push") await this.push(save?.revision ?? 0, false);
      else if (plan === "pull") this.apply(save!);
      else if (plan === "ask") {
        const choice = await this.onAsk(saveSummary(text ? JSON.parse(text) : null), { ...saveSummary(save!.data), updated: save!.updated });
        if (choice === "cloud") this.apply(save!);
        else {
          // The account copy is set aside on this device, not lost.
          try { localStorage.setItem(CLOUD_BACKUP_KEY, JSON.stringify(save!.data)); } catch { /* private mode */ }
          await this.push(save!.revision, true);
        }
      } else this.set("Progress saved to your account.");
    } catch (e) { this.set((e as Error).message); }
    finally { this.busy = false; }
  }
  private async push(base: number, force: boolean, keepalive = false) {
    const text = read(PROFILE_KEY);
    if (!text || !this.account) return;
    try {
      const { revision } = await accountRequest("save", { data: JSON.parse(text), base, force }, keepalive);
      this.remember({ accountId: this.account.id, revision, hash: hash(text) });
      this.set("Progress saved to your account.");
    } catch (e) {
      // Another device moved on: settle it properly rather than overwrite.
      if ((e as { status?: number }).status === 409 && !keepalive) { this.busy = false; await this.sync(); }
      else this.set((e as Error).message);
    }
  }
  /** Replaces this device's save with the account copy (the old one is kept as a backup) and restarts. */
  private apply(save: CloudCopy) {
    const text = JSON.stringify(save.data), old = read(PROFILE_KEY);
    try {
      if (old) localStorage.setItem(BACKUP_KEY, old);
      localStorage.setItem(PROFILE_KEY, text);
    } catch { this.set("Could not load your cloud save on this device."); return; }
    this.remember({ accountId: this.account!.id, revision: save.revision, hash: hash(text) });
    this.set("Loading your cloud save…");
    this.onApply();
    location.reload();
  }
  /** After local saves: upload within 20 s (sooner when the tab is hidden). */
  private changed() {
    if (!this.account || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.upload(); }, 20000);
  }
  private async upload(keepalive = false) {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const synced = this.state(), text = read(PROFILE_KEY) ?? "";
    if (!this.account || !synced || synced.accountId !== this.account.id || synced.hash === hash(text) || this.busy) return;
    await this.push(synced.revision, false, keepalive);
  }
}
