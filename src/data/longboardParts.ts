// Sometimes Summer longboards. A separate rideable family from the Lazer
// scooters: its own parts, slots and compatibility, sharing only the catalog,
// wallet and ownership services. Colour and graphic variants never change the
// board's geometry, so one set of dimensions below describes every build.

export const LONGBOARD_BRAND = { id: "sometimes_summer", name: "Sometimes Summer" } as const;

/**
 * Measured assembly dimensions in metres, board-local: +z is the nose, +y up,
 * the origin is the ground point midway between the axles.
 */
export const LONGBOARD_DIMENSIONS = {
  length: 0.965, // 38 in drop-through
  width: 0.25, // widest point, between the wheel flares
  thickness: 0.012, // 9-ply laminate
  wheelbase: 0.72, // axle to axle
  wheelDiameter: 0.07,
  wheelWidth: 0.051,
  hangerWidth: 0.18, // axle nut to axle nut is axleSpan
  axleSpan: 0.25,
  concave: 0.005, // rail height above the centreline
  rocker: 0.006, // centre sits this far below the axle stations
  /** Deck underside at the truck stations; drop-through puts it below the baseplate. */
  deckBottom: 0.09,
  kingpinAngle: 50, // degrees from the deck plane
} as const;

export const LONGBOARD_CATEGORIES = [
  "deck",
  "trucks",
  "wheels",
  "bushings",
  "bearings",
  "grip",
  "hardware",
] as const;
export type LongboardCategory = (typeof LONGBOARD_CATEGORIES)[number];

export interface LongboardVariant {
  id: string;
  name: string;
  color: number;
  accent?: number;
}
export interface LongboardPart {
  id: string;
  brandId: typeof LONGBOARD_BRAND.id;
  brand: typeof LONGBOARD_BRAND.name;
  name: string;
  category: LongboardCategory;
  /** How many physical pieces one purchase covers. */
  set: "single" | "pair" | "set-of-4" | "set-of-8" | "kit";
  unlockType: "free" | "credit";
  creditPrice: number;
  variants: LongboardVariant[];
}
export interface LongboardSelection {
  partId: string;
  variantId: string;
}
export type LongboardLoadout = Record<LongboardCategory, LongboardSelection>;

const part = (
  category: LongboardCategory,
  id: string,
  name: string,
  set: LongboardPart["set"],
  creditPrice: number,
  variants: LongboardVariant[],
): LongboardPart => ({
  id,
  brandId: LONGBOARD_BRAND.id,
  brand: LONGBOARD_BRAND.name,
  name: `${LONGBOARD_BRAND.name} ${name}`,
  category,
  set,
  unlockType: "credit",
  creditPrice,
  variants,
});

export const LONGBOARD_PARTS: LongboardPart[] = [
  part("deck", "ss-drop-through-deck", "Drop-Through Deck", "single", 220, [
    { id: "classic", name: "Classic", color: 0xc79a62 },
    { id: "horizon", name: "Horizon", color: 0x1f3342 },
    { id: "palms", name: "Palms", color: 0x151a1c },
    { id: "ridgeline", name: "Ridgeline", color: 0xd3a36c },
  ]),
  part("trucks", "ss-rkp-trucks", "180 mm Reverse-Kingpin Trucks", "pair", 140, [
    { id: "matte-black", name: "Matte Black", color: 0x1e2224 },
    { id: "gunmetal", name: "Gunmetal", color: 0x4e5559 },
    { id: "silver", name: "Silver", color: 0xb9c0c2 },
    { id: "olive", name: "Olive", color: 0x55603a },
  ]),
  part("wheels", "ss-cruiser-wheels", "70 mm Cruiser Wheels", "set-of-4", 90, [
    { id: "blue", name: "Blue", color: 0x1f7fd0 },
    { id: "purple", name: "Purple", color: 0x7a3bc4 },
    { id: "lime", name: "Lime", color: 0xa9d62c },
    { id: "red", name: "Red", color: 0xd8342d },
    { id: "white", name: "White", color: 0xe8e6de },
    { id: "black", name: "Black", color: 0x222526 },
  ]),
  part("bushings", "ss-barrel-bushings", "Barrel Bushings", "kit", 25, [
    { id: "green", name: "Green", color: 0x2f9a45 },
    { id: "black", name: "Black", color: 0x202324 },
    { id: "red", name: "Red", color: 0xc42f2a },
    { id: "blue", name: "Blue", color: 0x2d62b8 },
  ]),
  part("bearings", "ss-precision-bearings", "Precision Bearings", "set-of-8", 35, [
    { id: "steel", name: "Steel", color: 0xb4bcbd, accent: 0x1c1f20 },
  ]),
  part("grip", "ss-grip", "Coarse Grip Tape", "single", 15, [
    { id: "black", name: "Black", color: 0x1b1d1e },
    { id: "charcoal", name: "Charcoal", color: 0x3a3f41 },
    { id: "sand", name: "Sand", color: 0x8a7a5e },
    { id: "sea-glass", name: "Sea Glass", color: 0x4f7d78 },
  ]),
  part("hardware", "ss-mounting-hardware", "Mounting Hardware", "set-of-8", 10, [
    { id: "black", name: "Black", color: 0x1c1e1f },
  ]),
];

export function defaultLongboard(): LongboardLoadout {
  return {
    deck: { partId: "ss-drop-through-deck", variantId: "classic" },
    trucks: { partId: "ss-rkp-trucks", variantId: "matte-black" },
    wheels: { partId: "ss-cruiser-wheels", variantId: "blue" },
    bushings: { partId: "ss-barrel-bushings", variantId: "green" },
    bearings: { partId: "ss-precision-bearings", variantId: "steel" },
    grip: { partId: "ss-grip", variantId: "black" },
    hardware: { partId: "ss-mounting-hardware", variantId: "black" },
  };
}

export function longboardPart(selection: LongboardSelection) {
  const found = LONGBOARD_PARTS.find((p) => p.id === selection.partId);
  if (!found) throw Error(`Unknown longboard part ${selection.partId}`);
  const variant =
    found.variants.find((v) => v.id === selection.variantId) ?? found.variants[0];
  return { part: found, variant };
}

/** A saved loadout with every slot checked against the catalog. */
export function validLongboard(saved: unknown): LongboardLoadout {
  const loadout = defaultLongboard();
  const source = saved && typeof saved === "object" ? (saved as Record<string, LongboardSelection>) : {};
  for (const category of LONGBOARD_CATEGORIES) {
    const s = source[category];
    const found = LONGBOARD_PARTS.find((p) => p.id === s?.partId && p.category === category);
    if (found?.variants.some((v) => v.id === s?.variantId))
      loadout[category] = { partId: s.partId, variantId: s.variantId };
  }
  return loadout;
}
