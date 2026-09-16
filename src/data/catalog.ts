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
  unlockType: "free" | "credit";
  creditPrice: number;
  variants: { id: string; name: string }[];
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
      variants: board.variants,
    };
  return undefined;
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

/** Free parts are always owned; everything else needs its colourway in the wallet. */
export function ownsSelection(wallet: AlphaWallet, s: { partId: string; variantId: string }) {
  return catalogEntry(s.partId)?.unlockType === "free" || wallet.owned.includes(ownershipKey(s));
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
