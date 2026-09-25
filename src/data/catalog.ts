// One lookup across every rideable's parts, so the wallet, ownership and shop
// services treat a longboard deck exactly like a scooter deck: same Credit,
// same ownership keys, same receipts. Compatibility stays explicit through
// `rideable`, so a scooter part can never be equipped on a board or the reverse.
import { PARTS } from "./scooterParts";
import type { AlphaWallet } from "./credit";
import {
  LONGBOARD_CATEGORIES,
  LONGBOARD_PARTS,
  type LongboardLoadout,
  type LongboardSelection,
} from "./longboardParts";

export type RideableKind = "scooter" | "longboard";

export interface CatalogEntry {
  id: string;
  name: string;
  rideable: RideableKind;
  category: string;
  unlockType: "free" | "credit" | "bucks";
  creditPrice: number;
  /** Premium parts only (#76): the price in Bucks. */
  bucksPrice: number;
  variants: { id: string; name: string; exclusive?: string }[];
}

export function catalogEntry(partId: string): CatalogEntry | undefined {
  const scooter = PARTS.find((p) => p.id === partId);
  if (scooter)
    return {
      id: scooter.id,
      name: scooter.name,
      rideable: "scooter",
      category: scooter.category,
      unlockType: scooter.unlockType,
      creditPrice: scooter.creditPrice ?? 0,
      bucksPrice: scooter.bucksPrice ?? 0,
      variants: scooter.variants,
    };
  const board = LONGBOARD_PARTS.find((p) => p.id === partId);
  if (board)
    return {
      id: board.id,
      name: board.name,
      rideable: "longboard",
      category: board.category,
      unlockType: board.unlockType,
      creditPrice: board.creditPrice,
      bucksPrice: 0,
      variants: board.variants,
    };
  return undefined;
}

/**
 * The two currencies (#76). Coins are earned by riding (banked points and
 * missions; stored as the wallet's `credit`). Bucks are the premium currency:
 * earned very slowly (5 every 5 levels) and, one day, bought with money
 * (not available: see docs/PAYMENTS-PLAN.md). Mafioso parts cost Bucks.
 */
export type Currency = "coins" | "bucks";
export const CURRENCY_LABEL: Record<Currency, string> = { coins: "COINS", bucks: "BUCKS" };
/** What a part costs, and in which currency. */
export function priceOf(entry: { unlockType: string; creditPrice?: number; bucksPrice?: number }): { amount: number; currency: Currency } {
  return entry.unlockType === "bucks" ? { amount: entry.bucksPrice ?? 0, currency: "bucks" } : { amount: entry.creditPrice ?? 0, currency: "coins" };
}

/**
 * A complete Sometimes Summer board: the chosen deck graphic with the starter
 * trucks, wheels, bushings, bearings, grip and hardware, sold together for less
 * than the parts. Buying it grants each part once; nothing already owned is
 * charged again because the price only counts parts still missing.
 */
export const COMPLETE_BOARD_ID = "ss-complete-board";
export const COMPLETE_BOARD_DISCOUNT = 0.8;

export function completeBoardSelections(deckVariant: string, starter: LongboardLoadout): LongboardSelection[] {
  return LONGBOARD_CATEGORIES.map((category) =>
    category === "deck" ? { partId: starter.deck.partId, variantId: deckVariant } : { ...starter[category] },
  );
}

export const ownershipKey = (s: { partId: string; variantId: string }) => s.partId + ":" + s.variantId;

/**
 * Free parts are always owned, except their crate-exclusive colourways;
 * everything else needs its colourway in the wallet.
 */
export function ownsSelection(wallet: AlphaWallet, s: { partId: string; variantId: string }) {
  const entry = catalogEntry(s.partId);
  if (entry?.unlockType === "free" && !entry.variants.find((v) => v.id === s.variantId)?.exclusive) return true;
  return wallet.owned.includes(ownershipKey(s));
}

/** A rider owns a longboard when every slot of that build is theirs. */
export function ownsBoard(wallet: AlphaWallet, loadout: LongboardLoadout) {
  return LONGBOARD_CATEGORIES.every((category) => ownsSelection(wallet, loadout[category]));
}

export function bundlePrice(selections: LongboardSelection[], owned: (s: LongboardSelection) => boolean) {
  const missing = selections.filter((s) => !owned(s));
  const full = missing.reduce((sum, s) => sum + (catalogEntry(s.partId)?.creditPrice ?? 0), 0);
  return { missing, price: Math.round(full * COMPLETE_BOARD_DISCOUNT) };
}
