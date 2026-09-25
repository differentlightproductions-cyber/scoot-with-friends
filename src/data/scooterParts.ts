export const CATEGORIES = [
  "deck",
  "bars",
  "fork",
  "clamp",
  "wheels",
  "bearings",
  "grips",
  "headset",
  "brake",
  "compression",
  "griptape",
] as const;
export type Category = (typeof CATEGORIES)[number];
export interface PartVariant {
  id: string;
  name: string;
  color: number;
  accent?:number;
  /** Crate exclusive: only ever found in a parts crate, at this rarity; never sold. */
  exclusive?: "common" | "rare" | "epic" | "legendary";
}
export interface ScooterPart {
  id: string;
  productId: string;
  brandId: string;
  brand: string;
  name: string;
  category: Category;
  shape: string;
  model: string;
  material: 'metal'|'rubber';
  thumbnail: string | null;
  unlocked: boolean;
  priceFuture: number | null;
  variants: PartVariant[];
  /** How it is bought (#76): Coins ("credit", earned by riding) or Bucks (premium, Mafioso). */
  unlockType: "free"|"credit"|"bucks";
  creditPrice?:number;
  /** Premium parts only: their price in Bucks (1-20). */
  bucksPrice?:number;
  premium: false;
  priceId: null;
  owned: boolean;
  compatibility: {
    wheelDiameter?: number;
    barDiameter?: number;
    compressionType?: string;
    permissive: true;
  };
}
/**
 * Lazer is the starter brand, but only the starter build is given away (see
 * STARTER below); every other Lazer part and colourway costs Coins (#76:
 * two and a half times the old prices, so parts are something to save for).
 * Prices are per colourway. Tune here.
 */
export const LAZER_PRICE: Record<Category, number> = {
  deck: 150, bars: 110, fork: 100, clamp: 60, wheels: 90, bearings: 40,
  grips: 30, headset: 40, brake: 40, compression: 50, griptape: 30,
};
const colors = {
  black: 0x263333,
  red: 0xe65330,
  blue: 0x4281aa,
  silver: 0xb8cbc6,
  gum: 0xb8945e,
  white: 0xe9e5d9,
  'oil-slick': 0x71989b,
};
const make = (
  category: Category,
  id: string,
  name: string,
  shape: string,
  variants: (keyof typeof colors)[],
  diameter?: number,
): ScooterPart => ({
  id,
  productId: id,
  brandId: "lazer",
  brand: "Lazer",
  name: "Lazer " + name,
  category,
  shape,
  model: shape,
  material: category==='grips'?'rubber':'metal',
  thumbnail: null,
  unlocked: false,
  priceFuture: null,
  variants: variants.map((color) => ({
    id: color,
    name: color[0].toUpperCase() + color.slice(1),
    color: colors[color],
  })),
  unlockType: "credit",
  creditPrice: LAZER_PRICE[category],
  premium: false,
  priceId: null,
  owned: false,
  compatibility: {
    permissive: true,
    ...(diameter ? { wheelDiameter: diameter } : {}),
  },
});
export const PARTS: ScooterPart[] = [
  make("deck", "pro-deck", "Pro Deck", "pro", ["red", "black", "oil-slick"]),
  make("deck", "street-deck", "Street Deck", "street", ["silver", "blue"]),
  make("deck", "light-deck", "Light Deck", "light", ["white", "red"]),
  make("bars", "classic-bars", "Classic T-Bar", "t", ["silver", "black"]),
  make("bars", "y-bars", "Y-Bar", "y", ["black", "blue"]),
  make("bars", "oversized-bars", "Oversized T-Bar", "oversized", [
    "silver",
    "red",
  ]),
  make("fork", "core-fork", "Core Fork", "standard", ["silver", "black"]),
  make("fork", "light-fork", "Light Fork", "light", ["red", "silver"]),
  make("fork", "reinforced-fork", "Reinforced Fork", "reinforced", [
    "black",
    "blue",
  ]),
  make("clamp", "double-clamp", "Double Clamp", "double", ["black", "red"]),
  make("clamp", "triple-clamp", "Triple Clamp", "triple", ["silver", "blue"]),
  make(
    "wheels",
    "100-wheels",
    "100 Wheels",
    "100",
    ["black", "red", "blue"],
    100,
  ),
  make(
    "wheels",
    "110-wheels",
    "110 Wheels",
    "110",
    ["red", "white", "black", "blue"],
    110,
  ),
  make(
    "wheels",
    "120-wheels",
    "120 Wheels",
    "120",
    ["blue", "white", "black"],
    120,
  ),
  make("bearings", "abec-bearings", "ABEC Bearings", "standard", ["silver"]),
  make("bearings", "speed-bearings", "Speed Bearings", "speed", ["red"]),
  make("grips", "classic-grips", "Classic Grips", "classic", [
    "black",
    "red",
    "blue",
  ]),
  make("grips", "ribbed-grips", "Ribbed Grips", "ribbed", ["black", "gum"]),
  make("grips", "soft-grips", "Soft Grips", "soft", ["gum", "blue"]),
  make("headset", "integrated-headset", "Integrated Headset", "integrated", [
    "silver",
    "red",
  ]),
  make("headset", "sealed-headset", "Sealed Headset", "sealed", [
    "black",
    "blue",
  ]),
  make("brake", "flex-fender", "Flex Fender", "flex", ["silver", "black"]),
  make("brake", "street-fender", "Street Fender", "street", ["black", "red"]),
  make("compression", "ihc-compression", "IHC Compression", "ihc", ["black"]),
  make("compression", "scs-compression", "SCS Compression", "scs", ["silver"]),
];
/**
 * Mafioso is the high-end brand (#76): never sold for Coins. Its parts come
 * from a very lucky crate pull, or for Bucks (1-20; the premium currency,
 * earned slowly by levelling up; buying Bucks with money is not available).
 */
const mafioso=(category:Category,id:string,name:string,shape:string,bucksPrice:number,variants:PartVariant[]):ScooterPart=>({...make(category,id,name,shape,['black'],category==='wheels'?110:undefined),brand:'Mafioso',brandId:'mafioso',name:'Mafioso '+name,unlockType:'bucks',creditPrice:undefined,bucksPrice,owned:false,unlocked:false,variants});
PARTS.push(
 mafioso('bars','mafioso-bars-y','Crown Y Bars','mafioso-y',6,[{id:'mafioso_bars_y_black_gold',name:'Black / Gold',color:0x171b1e,accent:0xc5a653},{id:'mafioso_bars_y_neochrome',name:'Neochrome',color:0x71989b},{id:'mafioso_bars_y_chrome',name:'Chrome',color:0xb8cbc6}]),
 mafioso('wheels','mafioso-wheels-petal','Petal 110 Wheel Pair','petal',5,[{id:'mafioso_wheels_petal_oilslick',name:'Oil Slick / Black',color:0x71989b},{id:'mafioso_wheels_petal_green_gold',name:'Green / Gold',color:0x638845,accent:0xc4a24f}]),
 mafioso('wheels','mafioso-wheels-broad','Broad Spoke 110 Wheel Pair','broad',5,[{id:'mafioso_wheels_broad_rainbow',name:'Rainbow / Black',color:0x71989b}]),
 mafioso('clamp','mafioso-clamp-segmented','Segmented Double Clamp','segmented',3,[{id:'mafioso_clamp_segmented_neochrome',name:'Neochrome',color:0x71989b},{id:'mafioso_clamp_segmented_chrome',name:'Chrome',color:0xb8cbc6},{id:'mafioso_clamp_segmented_black',name:'Black',color:0x171b1e}])
);
// Griptape is cosmetic: it changes the deck's top sheet only, never grip,
// friction, weight, speed or pop.
const griptape = (id: string, name: string, shape: string, variants: PartVariant[]): ScooterPart => ({
  ...make("griptape", id, name, shape, ["black"]),
  variants,
});
PARTS.push(
  griptape("standard-griptape", "Standard Grip Tape", "plain", [
    { id: "black", name: "Black", color: 0x2b3133 },
    { id: "smoke", name: "Smoke Grey", color: 0x4d5558 },
  ]),
  griptape("stripe-griptape", "Twin Stripe Grip Tape", "stripe", [
    { id: "black-red", name: "Black / Red", color: 0x2b3133, accent: 0xe65330 },
    { id: "black-blue", name: "Black / Blue", color: 0x2b3133, accent: 0x4281aa },
  ]),
  griptape("logo-griptape", "Logo Grip Tape", "logo", [
    { id: "black-white", name: "Black / White", color: 0x2b3133, accent: 0xe9e5d9 },
    { id: "smoke-red", name: "Smoke / Red", color: 0x4d5558, accent: 0xe65330 },
  ]),
  mafioso("griptape", "mafioso-griptape-crown", "Crown Grip Tape", "crown", 1, [
    { id: "mafioso_grip_black_gold", name: "Black / Gold", color: 0x1d2022, accent: 0xc5a653 },
    { id: "mafioso_grip_frost", name: "Frosted / White", color: 0x8c9496, accent: 0xe9e5d9 },
  ]),
);
// Crate exclusives: colourways found only in parts crates (data/progress.ts).
// Colour only; the part's shape, weight and handling never change.
const GOLD = 0xd6a93c;
const exclusives: [string, PartVariant[]][] = [
  ["pro-deck", [{ id: "x-gold-rush", name: "Gold Rush", color: GOLD, exclusive: "legendary" }, { id: "x-galaxy", name: "Galaxy", color: 0x2c2a5c, accent: 0x9b6bff, exclusive: "epic" }, { id: "x-mint", name: "Mint Chip", color: 0x9fd8c0, exclusive: "rare" }]],
  ["street-deck", [{ id: "x-sunset", name: "Sunset", color: 0xf07f4f, exclusive: "rare" }, { id: "x-toxic", name: "Toxic", color: 0x9be33a, exclusive: "epic" }]],
  ["light-deck", [{ id: "x-bubblegum", name: "Bubblegum", color: 0xf28cc0, exclusive: "rare" }]],
  ["classic-bars", [{ id: "x-24k", name: "24K Gold", color: 0xdcb24c, exclusive: "legendary" }, { id: "x-ice", name: "Ice Blue", color: 0x9ad7ee, exclusive: "rare" }]],
  ["y-bars", [{ id: "x-hot-pink", name: "Hot Pink", color: 0xe2508f, exclusive: "rare" }, { id: "x-purple-haze", name: "Purple Haze", color: 0x7b4bb3, exclusive: "epic" }]],
  ["oversized-bars", [{ id: "x-lime", name: "Lime Rush", color: 0xb5e61d, exclusive: "epic" }]],
  ["light-fork", [{ id: "x-gold", name: "Gold", color: GOLD, exclusive: "legendary" }]],
  ["110-wheels", [{ id: "x-glow", name: "Glow", color: 0xd8f35a, exclusive: "epic" }, { id: "x-gold", name: "Gold Core", color: GOLD, exclusive: "legendary" }]],
  ["120-wheels", [{ id: "x-purple", name: "Purple", color: 0x8052c9, exclusive: "rare" }]],
  ["classic-grips", [{ id: "x-neon", name: "Neon Green", color: 0x6fe05a, exclusive: "rare" }, { id: "x-candy", name: "Candy Pink", color: 0xf07fb2, exclusive: "rare" }]],
  ["double-clamp", [{ id: "x-gold", name: "Gold", color: GOLD, exclusive: "epic" }]],
  ["triple-clamp", [{ id: "x-teal", name: "Teal", color: 0x2fbfb0, exclusive: "rare" }]],
  ["sealed-headset", [{ id: "x-rainbow", name: "Rainbow Anodized", color: 0x9b6bff, exclusive: "epic" }]],
  ["stripe-griptape", [{ id: "x-flame", name: "Flame", color: 0x2b3133, accent: 0xff6a1f, exclusive: "epic" }, { id: "x-galaxy", name: "Galaxy Stripe", color: 0x1a1a3a, accent: 0x9b6bff, exclusive: "epic" }]],
  ["logo-griptape", [{ id: "x-gold-foil", name: "Black / Gold Foil", color: 0x1d2022, accent: GOLD, exclusive: "legendary" }]],
];
for (const [partId, variants] of exclusives) PARTS.find((p) => p.id === partId)!.variants.push(...variants);

export type PartSelection = { partId: string; variantId: string };
export type ScooterLoadout = Record<
  Exclude<Category, "wheels">,
  PartSelection
> & { frontWheel: PartSelection; rearWheel: PartSelection };
export function defaultScooter(): ScooterLoadout {
  const result = {} as ScooterLoadout;
  for (const category of CATEGORIES) {
    const part = PARTS.find(
      (p) =>
        p.category === category &&
        (category !== "wheels" || p.id === "110-wheels"),
    )!;
    const selection = { partId: part.id, variantId: part.variants[0].id };
    if (category === "wheels") {
      result.frontWheel = { ...selection };
      result.rearWheel = { ...selection };
    } else result[category] = selection;
  }
  return result;
}
/**
 * The one-time starter scooter. A new rider picks one Lazer part and colourway
 * in each STARTER_PICKS category (wheels go on both ends); the STARTER_INCLUDED
 * hardware comes with it. Only those parts become owned (credit.ts claimStarter).
 */
export const STARTER_PICKS = ["deck", "bars", "fork", "clamp", "wheels", "grips", "griptape"] as const satisfies readonly Category[];
export const STARTER_INCLUDED = ["bearings", "headset", "brake", "compression"] as const satisfies readonly Category[];
/** Lazer parts a starter build may use in a category: any stock (non-crate) colourway. */
export function starterOptions(category: Category) {
  return PARTS.filter((p) => p.brandId === "lazer" && p.category === category).flatMap((part) =>
    part.variants.filter((v) => !v.exclusive).map((variant) => ({ part, variant })),
  );
}
/** Checks a starter build: Lazer stock parts only, matching wheels, the included hardware as standard. */
export function validStarter(build: unknown): ScooterLoadout | null {
  const b = build as Partial<ScooterLoadout> | null;
  if (!b || typeof b !== "object") return null;
  const defaults = defaultScooter(), result = {} as ScooterLoadout;
  const ok = (s: PartSelection | undefined, category: Category) =>
    !!s && starterOptions(category).some((o) => o.part.id === s.partId && o.variant.id === s.variantId);
  for (const category of STARTER_PICKS) {
    if (category === "wheels") {
      if (!ok(b.frontWheel, "wheels") || b.rearWheel?.partId !== b.frontWheel!.partId || b.rearWheel?.variantId !== b.frontWheel!.variantId) return null;
      result.frontWheel = { ...b.frontWheel! }; result.rearWheel = { ...b.frontWheel! };
    } else {
      if (!ok(b[category], category)) return null;
      result[category] = { ...b[category]! };
    }
  }
  for (const category of STARTER_INCLUDED) result[category] = { ...defaults[category] };
  return result;
}
export function selectedPart(selection: PartSelection) {
  const part = PARTS.find((p) => p.id === selection.partId)!;
  return {
    part,
    variant:
      part.variants.find((v) => v.id === selection.variantId) ??
      part.variants[0],
  };
}
