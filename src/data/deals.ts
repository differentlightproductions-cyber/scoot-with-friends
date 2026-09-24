// Today's deals: three colourways from a shop's paid stock, marked down for the
// day. The same three for everyone on a date (seeded by shop and day), so the
// economy can re-derive and verify a deal price instead of trusting the menu.
import { PARTS } from "./scooterParts";
import { LONGBOARD_PARTS } from "./longboardParts";
import { SHOPS } from "./shops";
import { dayKey } from "./progress";

export interface Deal { partId: string; variantId: string; price: number; was: number; off: number }

export function dailyDeals(shopId: string, day = dayKey()): Deal[] {
  const shop = SHOPS.find((s) => s.id === shopId);
  if (!shop) return [];
  const pool: Omit<Deal, "price" | "off">[] = [];
  for (const p of PARTS) if (p.unlockType === "credit" && shop.stock.includes(p.id)) for (const v of p.variants) if (!v.exclusive) pool.push({ partId: p.id, variantId: v.id, was: p.creditPrice ?? 0 });
  for (const p of LONGBOARD_PARTS) if (p.unlockType === "credit" && shop.stock.includes(p.id)) for (const v of p.variants) pool.push({ partId: p.id, variantId: v.id, was: p.creditPrice });
  const random = seeded(hash(shopId + ":" + day)), picks: Deal[] = [];
  while (picks.length < 3 && pool.length) {
    const item = pool.splice(Math.floor(random() * pool.length), 1)[0];
    // Three different parts, not three colours of one.
    if (picks.some((p) => p.partId === item.partId) && pool.some((p) => !picks.some((q) => q.partId === p.partId))) continue;
    const off = [25, 30, 40][picks.length];
    picks.push({ ...item, off, price: Math.max(1, Math.round(item.was * (1 - off / 100))) });
  }
  return picks;
}

/** Seconds until the deals change (local midnight). */
export function dealsRefreshIn(now = new Date()) {
  const next = new Date(now); next.setHours(24, 0, 0, 0);
  return Math.max(0, Math.round((next.getTime() - now.getTime()) / 1000));
}

function hash(text: string) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
