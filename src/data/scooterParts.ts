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
] as const;
export type Category = (typeof CATEGORIES)[number];
export interface PartVariant {
  id: string;
  name: string;
  color: number;
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
  unlockType: "free";
  premium: false;
  priceId: null;
  owned: true;
  compatibility: {
    wheelDiameter?: number;
    barDiameter?: number;
    compressionType?: string;
    permissive: true;
  };
}
const colors = {
  black: 0x263333,
  red: 0xe65330,
  blue: 0x4281aa,
  silver: 0xb8cbc6,
  gum: 0xb8945e,
  white: 0xe9e5d9,
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
  unlocked: true,
  priceFuture: null,
  variants: variants.map((color) => ({
    id: color,
    name: color[0].toUpperCase() + color.slice(1),
    color: colors[color],
  })),
  unlockType: "free",
  premium: false,
  priceId: null,
  owned: true,
  compatibility: {
    permissive: true,
    ...(diameter ? { wheelDiameter: diameter } : {}),
  },
});
export const PARTS: ScooterPart[] = [
  make("deck", "pro-deck", "Pro Deck", "pro", ["red", "black"]),
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
export function selectedPart(selection: PartSelection) {
  const part = PARTS.find((p) => p.id === selection.partId)!;
  return {
    part,
    variant:
      part.variants.find((v) => v.id === selection.variantId) ??
      part.variants[0],
  };
}
