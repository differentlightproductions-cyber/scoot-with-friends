import type { ReplayClip, ReplayView } from "./buffer";

/**
 * Saved replays (#41). A replay is editable data, not video: the captured clip
 * (compact rider state) plus the edit on top of it (trim, camera, name). The
 * clip is never changed by editing, so a replay can be re-trimmed later. Clips
 * run to a few hundred kilobytes, beyond what localStorage should hold, so they
 * live in IndexedDB; a list of small summaries sits beside them for the library.
 * Without IndexedDB (a private window, blocked storage) replays last until reload.
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

const DB = "swf-replays", META = "meta", CLIPS = "clips";
export class ReplayStore {
  private db: Promise<IDBDatabase | null> | null = null;
  private memory = new Map<string, SavedReplay>();
  constructor(private indexedDb: IDBFactory | undefined = typeof indexedDB === "undefined" ? undefined : indexedDB) {}

  private open() {
    this.db ??= new Promise((resolve) => {
      if (!this.indexedDb) return resolve(null);
      try {
        const req = this.indexedDb.open(DB, 1);
        req.onupgradeneeded = () => { const db = req.result; db.createObjectStore(META, { keyPath: "id" }); db.createObjectStore(CLIPS); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return this.db;
  }
  private async run<T>(stores: string[], mode: IDBTransactionMode, work: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = await this.open();
    if (!db) return undefined;
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const req = work(t);
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  /** Every saved replay's summary, newest first. */
  async list(): Promise<ReplayMeta[]> {
    const rows = (await this.run<ReplayMeta[]>([META], "readonly", (t) => t.objectStore(META).getAll())) ?? [...this.memory.values()].map((r) => r.meta);
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }
  async get(id: string): Promise<SavedReplay | null> {
    const db = await this.open();
    if (!db) return this.memory.get(id) ?? null;
    const [meta, clip] = await Promise.all([
      this.run<ReplayMeta>([META], "readonly", (t) => t.objectStore(META).get(id)),
      this.run<ReplayClip>([CLIPS], "readonly", (t) => t.objectStore(CLIPS).get(id)),
    ]);
    return meta && clip ? { meta, clip } : null;
  }
  /** Saves (or replaces) a replay. */
  async put(replay: SavedReplay) {
    const db = await this.open();
    if (!db) { this.memory.set(replay.meta.id, structuredClone(replay)); return; }
    await this.run([META, CLIPS], "readwrite", (t) => { t.objectStore(META).put(replay.meta); t.objectStore(CLIPS).put(replay.clip, replay.meta.id); });
  }
  /** Changes only the summary (a rename, a new trim or camera); the clip is untouched. */
  async update(meta: ReplayMeta) {
    const db = await this.open();
    if (!db) { const r = this.memory.get(meta.id); if (r) r.meta = { ...meta }; return; }
    await this.run([META], "readwrite", (t) => { t.objectStore(META).put(meta); });
  }
  async remove(id: string) {
    const db = await this.open();
    if (!db) { this.memory.delete(id); return; }
    await this.run([META, CLIPS], "readwrite", (t) => { t.objectStore(META).delete(id); t.objectStore(CLIPS).delete(id); });
  }
  /** "Veterans Memorial Park - Replay 03": the next free number for that map. */
  async defaultName(mapName: string) {
    const taken = new Set((await this.list()).map((m) => m.name));
    for (let n = 1; ; n++) { const name = `${mapName} - Replay ${String(n).padStart(2, "0")}`; if (!taken.has(name)) return name; }
  }
}
export const newReplayId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
