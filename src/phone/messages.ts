/**
 * MESSAGES data: threads of short chat messages for this session only (never
 * saved), and in-game phone numbers. Numbers are fictional: 702-555-01xx is a
 * range set aside for fiction, so no real number is ever shown or used.
 */
export interface Message { from: string; text: string; mine: boolean; at: number }
const NUMBER_KEY = 'swf-phone-number';

export function fictionalNumber(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return '702-555-01' + String((h >>> 0) % 100).padStart(2, '0');
}

export class MessageStore {
  readonly threads = new Map<string, Message[]>();
  readonly unread = new Map<string, number>();
  readonly number: string;
  onChange = () => {};
  constructor() {
    let saved = '';
    try { saved = localStorage.getItem(NUMBER_KEY) ?? ''; } catch { /* private mode */ }
    if (!/^702-555-01\d\d$/.test(saved)) {
      saved = fictionalNumber(String(Math.random()));
      try { localStorage.setItem(NUMBER_KEY, saved); } catch { /* keep it for this session */ }
    }
    this.number = saved;
  }
  add(thread: string, from: string, text: string, mine: boolean) {
    const list = this.threads.get(thread) ?? [];
    list.push({ from, text: text.slice(0, 120), mine, at: Date.now() });
    if (list.length > 60) list.splice(0, list.length - 60);
    this.threads.set(thread, list);
    if (!mine) this.unread.set(thread, (this.unread.get(thread) ?? 0) + 1);
    this.onChange();
  }
  read(thread: string) { if (this.unread.delete(thread)) this.onChange(); }
  get unreadTotal() { let n = 0; for (const v of this.unread.values()) n += v; return n; }
}
