// Brand-first browsing for Customization and the shop. Customization only ever
// lists colourways the rider owns; a shop only lists what it stocks and the
// rider does not own yet. Both views share this one lookup so they can never
// disagree about ownership.
import { PARTS, CATEGORIES } from "./scooterParts";
import { LONGBOARD_BRAND, LONGBOARD_CATEGORIES, LONGBOARD_PARTS } from "./longboardParts";
import { ownsSelection, priceOf, type Currency, type RideableKind } from "./catalog";
import type { AlphaWallet } from "./credit";
import { SHOPS } from "./shops";
import { partRarity, priceRarity, type Rarity } from "./progress";

export type BrowseMode = "owned" | "shop";

export interface InventoryItem {
  partId: string;
  variantId: string;
  /** Part name without its brand prefix, e.g. "Crown Y Bars". */
  partName: string;
  variantName: string;
  brandId: string;
  brand: string;
  category: string;
  rideable: RideableKind;
  price: number;
  /** What `price` is in (#76): Coins, or Bucks for Mafioso. */
  currency: Currency;
  owned: boolean;
  /** Crate-only colourway: never for sale. */
  exclusive: boolean;
  rarity: Rarity;
}

export interface BrandSummary {
  brandId: string;
  brand: string;
  rideable: RideableKind;
  count: number;
  categories: string[];
}

const strip = (name: string, brand: string) => (name.startsWith(brand + " ") ? name.slice(brand.length + 1) : name);

function allItems(wallet: AlphaWallet): InventoryItem[] {
  const scooter = PARTS.flatMap((p) =>
    p.variants.map((v) => ({
      partId: p.id, variantId: v.id, partName: strip(p.name, p.brand), variantName: v.name,
      brandId: p.brandId, brand: p.brand, category: p.category, rideable: "scooter" as const,
      price: priceOf(p).amount, currency: priceOf(p).currency, owned: ownsSelection(wallet, { partId: p.id, variantId: v.id }),
      exclusive: !!v.exclusive, rarity: v.exclusive ?? partRarity(p),
    })),
  );
  const board = LONGBOARD_PARTS.flatMap((p) =>
    p.variants.map((v) => ({
      partId: p.id, variantId: v.id, partName: strip(p.name, p.brand), variantName: v.name,
      brandId: p.brandId, brand: p.brand, category: p.category, rideable: "longboard" as const,
      price: p.creditPrice, currency: "coins" as const, owned: ownsSelection(wallet, { partId: p.id, variantId: v.id }),
      exclusive: false, rarity: priceRarity(p.creditPrice),
    })),
  );
  return [...scooter, ...board];
}

const categoryOrder = (item: InventoryItem) =>
  item.rideable === "scooter"
    ? CATEGORIES.indexOf(item.category as (typeof CATEGORIES)[number])
    : 100 + LONGBOARD_CATEGORIES.indexOf(item.category as (typeof LONGBOARD_CATEGORIES)[number]);

export function inventoryItems(
  wallet: AlphaWallet,
  mode: BrowseMode,
  filter: { shopId?: string; rideable?: RideableKind; brandId?: string; category?: string } = {},
): InventoryItem[] {
  const stock = mode === "shop" ? SHOPS.find((s) => s.id === (filter.shopId ?? SHOPS[0].id))?.stock ?? [] : null;
  return allItems(wallet)
    .filter((item) => (mode === "owned" ? item.owned : !item.owned && !item.exclusive && stock!.includes(item.partId)))
    .filter((item) => !filter.rideable || item.rideable === filter.rideable)
    .filter((item) => !filter.brandId || item.brandId === filter.brandId)
    .filter((item) => !filter.category || item.category === filter.category)
    .sort((a, b) => categoryOrder(a) - categoryOrder(b));
}

/** Brands with something to show in this mode, scooters first, in catalog order. */
export function inventoryBrands(wallet: AlphaWallet, mode: BrowseMode, filter: { shopId?: string; rideable?: RideableKind } = {}): BrandSummary[] {
  const brands = new Map<string, BrandSummary>();
  for (const item of inventoryItems(wallet, mode, filter)) {
    const entry = brands.get(item.brandId) ?? { brandId: item.brandId, brand: item.brand, rideable: item.rideable, count: 0, categories: [] };
    entry.count++;
    if (!entry.categories.includes(item.category)) entry.categories.push(item.category);
    brands.set(item.brandId, entry);
  }
  return [...brands.values()];
}

export const BOARD_BRAND_ID = LONGBOARD_BRAND.id;

/** Splits a list into fixed pages; the page index is clamped into range. */
export function paginate<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(current * size, current * size + size), page: current, pages };
}
