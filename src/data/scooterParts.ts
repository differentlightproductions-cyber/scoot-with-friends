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
  unlockType: "free"|"credit";
  creditPrice?:number;
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
const mafioso=(category:Category,id:string,name:string,shape:string,creditPrice:number,variants:PartVariant[]):ScooterPart=>({...make(category,id,name,shape,['black'],category==='wheels'?110:undefined),brand:'Mafioso',brandId:'mafioso',name:'Mafioso '+name,unlockType:'credit',owned:false,unlocked:false,creditPrice,variants});
PARTS.push(
 mafioso('bars','mafioso-bars-y','Crown Y Bars','mafioso-y',75,[{id:'mafioso_bars_y_black_gold',name:'Black / Gold',color:0x171b1e,accent:0xc5a653},{id:'mafioso_bars_y_neochrome',name:'Neochrome',color:0x71989b},{id:'mafioso_bars_y_chrome',name:'Chrome',color:0xb8cbc6}]),
 mafioso('wheels','mafioso-wheels-petal','Petal 110 Wheel Pair','petal',55,[{id:'mafioso_wheels_petal_oilslick',name:'Oil Slick / Black',color:0x71989b},{id:'mafioso_wheels_petal_green_gold',name:'Green / Gold',color:0x638845,accent:0xc4a24f}]),
 mafioso('wheels','mafioso-wheels-broad','Broad Spoke 110 Wheel Pair','broad',55,[{id:'mafioso_wheels_broad_rainbow',name:'Rainbow / Black',color:0x71989b}]),
 mafioso('clamp','mafioso-clamp-segmented','Segmented Double Clamp','segmented',35,[{id:'mafioso_clamp_segmented_neochrome',name:'Neochrome',color:0x71989b},{id:'mafioso_clamp_segmented_chrome',name:'Chrome',color:0xb8cbc6},{id:'mafioso_clamp_segmented_black',name:'Black',color:0x171b1e}])
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
  mafioso("griptape", "mafioso-griptape-crown", "Crown Grip Tape", "crown", 20, [
    { id: "mafioso_grip_black_gold", name: "Black / Gold", color: 0x1d2022, accent: 0xc5a653 },
    { id: "mafioso_grip_frost", name: "Frosted / White", color: 0x8c9496, accent: 0xe9e5d9 },
  ]),
);
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
