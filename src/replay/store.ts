import type { ReplayClip, ReplayView } from "./buffer";

/**
 * Saved replays (#41). A replay is editable data, not video: the captured clip
 * (compact rider state) plus the edit on top of it (trim, camera, name). The
 * clip is never changed by editing, so a replay can be re-trimmed later.
 *
 * The library lasts for this session only (#77): nothing is written to the
 * browser, so it can never run into a storage limit, and reopening the game
 * starts it empty. EXPORT VIDEO saves a replay to the player's device. The
 * IndexedDB library earlier builds kept is cleared once, to give that space back.
 */
export interface ReplayMeta {
  id: string;
  name: string;
  createdAt: number;
  map: string;
  mapName: string;
  rideable: "scooter" | "longboard";
  /** Seconds into the clip where the saved replay starts and ends. */
  trimIn: number;
  trimOut: number;
  camera: ReplayView;
  /** A small JPEG data URL of the first frame, when one could be taken. */
  thumbnail: string | null;
}
export interface SavedReplay { meta: ReplayMeta; clip: ReplayClip }

/** The IndexedDB database earlier builds kept replays in. */
export const LEGACY_REPLAY_DB = "swf-replays";
export class ReplayStore {
  private memory = new Map<string, SavedReplay>();
  constructor(indexedDb: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB) {
    try { indexedDb?.deleteDatabase(LEGACY_REPLAY_DB); } catch { /* storage blocked: nothing kept there either */ }
  }
  /** Every saved replay's summary, newest first. */
  async list(): Promise<ReplayMeta[]> {
    return [...this.memory.values()].map((r) => r.meta).sort((a, b) => b.createdAt - a.createdAt);
  }
  async get(id: string): Promise<SavedReplay | null> {
    return this.memory.get(id) ?? null;
  }
  /** Saves (or replaces) a replay. */
  async put(replay: SavedReplay) {
    this.memory.set(replay.meta.id, structuredClone(replay));
  }
  /** Changes only the summary (a rename, a new trim or camera); the clip is untouched. */
  async update(meta: ReplayMeta) {
    const r = this.memory.get(meta.id);
    if (r) r.meta = { ...meta };
  }
  async remove(id: string) {
    this.memory.delete(id);
  }
  /** "Veterans Memorial Park - Replay 03": the next free number for that map. */
  async defaultName(mapName: string) {
    const taken = new Set((await this.list()).map((m) => m.name));
    for (let n = 1; ; n++) { const name = `${mapName} - Replay ${String(n).padStart(2, "0")}`; if (!taken.has(name)) return name; }
  }
}
export const newReplayId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
