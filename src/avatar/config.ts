/**
 * Rider avatar data: the saved configuration, every catalogue the creator
 * offers, the shared colour palettes, presets and randomize. A rider is only
 * this small object (docs/AVATAR-DESIGN.md §9); meshes are rebuilt from it.
 */
export const AVATAR_VERSION = 1;

export type BodyType = 'slim' | 'standard' | 'stocky';
export type AvatarCategory = 'face' | 'hair' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'body' | 'outfit' | 'accessories';

/** One selectable item. `unlocked` is ready for shop cosmetics and events. */
export interface CatalogItem {
  id: string;
  name: string;
  category: AvatarCategory;
  /** Takes a colour from a palette. */
  colors: boolean;
  unlocked: boolean;
  bodyTypes?: BodyType[];
  thumbnail?: string;
}
export interface Swatch { id: string; name: string; hex: number }

const items = (category: AvatarCategory, colors: boolean, list: [string, string][]): CatalogItem[] =>
  list.map(([id, name]) => ({ id, name, category, colors, unlocked: true }));

export const HEAD_SHAPES = items('face', false, [['round', 'Round'], ['oval', 'Oval'], ['narrow', 'Narrow'], ['wide', 'Wide'], ['square', 'Square-ish'], ['soft-jaw', 'Soft Jaw']]);
export const EAR_STYLES = items('face', false, [['round', 'Round Ears'], ['small', 'Small Ears'], ['pointed', 'Pointed Ears']]);
export const FACIAL_HAIR = items('face', true, [['none', 'None'], ['mustache', 'Mustache'], ['short-beard', 'Short Beard'], ['goatee', 'Goatee'], ['stubble', 'Stubble'], ['full-beard', 'Full Beard']]);
export const EYE_STYLES = items('eyes', true, [['round', 'Round'], ['relaxed', 'Relaxed'], ['narrow', 'Narrow'], ['cheerful', 'Cheerful'], ['sleepy', 'Sleepy'], ['wide', 'Wide'], ['angled', 'Angled'], ['dot', 'Dot'], ['oval', 'Oval'], ['sparkle', 'Sparkle']]);
export const LASH_STYLES = items('eyes', false, [['none', 'No Lashes'], ['short', 'Short'], ['medium', 'Medium'], ['long', 'Long'], ['outer', 'Outer Corner'], ['thick', 'Thick']]);
export const BROW_STYLES = items('brows', true, [['straight', 'Straight'], ['curved', 'Curved'], ['thick', 'Thick'], ['thin', 'Thin'], ['raised', 'Raised'], ['angled', 'Angled'], ['soft', 'Soft'], ['dramatic', 'Dramatic'], ['arched', 'Arched'], ['short', 'Short Flat']]);
export const NOSE_STYLES = items('nose', false, [['tiny', 'Tiny Round'], ['line', 'Short Line'], ['triangle', 'Soft Triangle'], ['button', 'Button'], ['bridge', 'Small Bridge'], ['long', 'Longer']]);
export const MOUTH_STYLES = items('mouth', false, [['smile', 'Smile'], ['neutral', 'Neutral'], ['smirk', 'Smirk'], ['open-smile', 'Open Smile'], ['frown', 'Small Frown'], ['grin', 'Grin'], ['flat', 'Flat Line'], ['surprised', 'Surprised'], ['tongue', 'Tongue Out'], ['toothy', 'Toothy']]);
export const HAIR_STYLES = items('hair', true, [['short-messy', 'Short Messy'], ['buzz', 'Buzz Cut'], ['side-part', 'Side Part'], ['fluffy', 'Fluffy'], ['shag', 'Medium Shag'], ['long-straight', 'Long Straight'], ['ponytail', 'Ponytail'], ['bun', 'Bun'], ['curly', 'Curly'], ['afro', 'Afro'], ['swept', 'Swept Fringe'], ['spiky', 'Spiky'], ['undercut', 'Undercut'], ['shoulder', 'Shoulder Length']]);
export const BODY_TYPES = items('body', false, [['slim', 'Slim'], ['standard', 'Standard'], ['stocky', 'Stocky']]);
export const TOPS = items('outfit', true, [['tee', 'Basic Tee'], ['oversized-tee', 'Oversized Tee'], ['long-sleeve', 'Long Sleeve'], ['hoodie', 'Hoodie'], ['zip-hoodie', 'Zip Hoodie'], ['jacket', 'Simple Jacket']]);
export const BOTTOMS = items('outfit', true, [['loose-jeans', 'Loose Jeans'], ['straight-jeans', 'Straight Jeans'], ['cargo', 'Cargo Pants'], ['shorts', 'Shorts'], ['skate-shorts', 'Skate Shorts']]);
export const SHOES = items('outfit', true, [['skate', 'Skate Shoe'], ['chunky', 'Chunky Skate Shoe'], ['sneaker', 'Simple Sneaker'], ['high-top', 'High-top']]);
export const HEADWEAR = items('accessories', true, [['none', 'No Headwear'], ['helmet', 'Helmet'], ['beanie', 'Beanie'], ['cap', 'Cap']]);
export const EYEWEAR = items('accessories', true, [['none', 'No Eyewear'], ['glasses', 'Glasses'], ['sunglasses', 'Sunglasses']]);
export const WRISTBANDS = items('accessories', true, [['none', 'No Wristband'], ['wristband', 'Wristband']]);

const swatches = (list: [string, string, number][]): Swatch[] => list.map(([id, name, hex]) => ({ id, name, hex }));
/** Light to deep natural tones. */
export const SKIN_TONES = swatches([
  ['skin-1', 'Porcelain', 0xfbe2cf], ['skin-2', 'Fair', 0xf5d2b6], ['skin-3', 'Light', 0xeec29f], ['skin-4', 'Light Warm', 0xe4ae88],
  ['skin-5', 'Medium Light', 0xd89b71], ['skin-6', 'Medium', 0xc88a60], ['skin-7', 'Tan', 0xb67650], ['skin-8', 'Medium Deep', 0x9f6444],
  ['skin-9', 'Deep Warm', 0x8a5236], ['skin-10', 'Deep', 0x72432c], ['skin-11', 'Rich', 0x5c3423], ['skin-12', 'Espresso', 0x46291c],
]);
export const HAIR_COLORS = swatches([
  ['black', 'Black', 0x1e1b1b], ['dark-brown', 'Dark Brown', 0x3b2719], ['brown', 'Brown', 0x5e3b22], ['light-brown', 'Light Brown', 0x8c6139],
  ['blonde', 'Blonde', 0xd9b56b], ['platinum', 'Platinum', 0xebe2c7], ['red', 'Red', 0xb9462a], ['auburn', 'Auburn', 0x7f3522],
  ['gray', 'Gray', 0x8f8f8f], ['white', 'White', 0xeceae4], ['blue', 'Blue', 0x2f5fb8], ['green', 'Green', 0x3f8f4a],
  ['purple', 'Purple', 0x7446a8], ['pink', 'Pink', 0xe27aa6],
]);
export const EYE_COLORS = swatches([
  ['brown', 'Brown', 0x5b3a22], ['dark-brown', 'Dark Brown', 0x2f1f15], ['hazel', 'Hazel', 0x7e6a2e], ['green', 'Green', 0x3f7a45],
  ['blue', 'Blue', 0x3a6fb0], ['gray', 'Gray', 0x6d7b86], ['amber', 'Amber', 0xa8741e], ['black', 'Black', 0x1c1c1c],
]);
/** One palette for clothing and accessories; no free RGB, so every rider stays readable. */
export const CLOTH_COLORS = swatches([
  ['white', 'White', 0xeeeee9], ['black', 'Black', 0x242527], ['charcoal', 'Charcoal', 0x4a4d52], ['gray', 'Gray', 0x9a9ea3],
  ['red', 'Red', 0xc8372d], ['orange', 'Orange', 0xe8742a], ['yellow', 'Yellow', 0xe8c23a], ['lime', 'Lime', 0x9ac43a],
  ['green', 'Green', 0x2f8a4a], ['teal', 'Teal', 0x22908f], ['sky', 'Sky', 0x5aaee0], ['blue', 'Blue', 0x2d5bb5],
  ['navy', 'Navy', 0x243a66], ['purple', 'Purple', 0x6e45a8], ['pink', 'Pink', 0xe27aa6], ['brown', 'Brown', 0x7a5236],
  ['denim', 'Denim', 0x3d5a85], ['light-denim', 'Light Denim', 0x7d9cc2], ['khaki', 'Khaki', 0xb8a47a],
]);

export interface AvatarConfig {
  version: number;
  skinTone: string;
  headShape: string;
  /** -1 small, 0 normal, 1 large (head mesh and head anchors only). */
  headSize: number;
  eyeStyle: string; eyeColor: string;
  /** Small integer offsets, -3..3 (size -2..2), kept inside the face. */
  eyeY: number; eyeSpacing: number; eyeSize: number;
  lashStyle: string;
  browStyle: string; browColor: string; browY: number; browAngle: number; browSpacing: number;
  noseStyle: string; noseY: number;
  mouthStyle: string; mouthSize: number; mouthY: number;
  hairStyle: string; hairColor: string;
  facialHair: string; earStyle: string;
  bodyType: BodyType;
  top: string; topColor: string;
  bottom: string; bottomColor: string;
  shoes: string; shoeColor: string;
  headwear: string; headwearColor: string;
  eyewear: string; eyewearColor: string;
  wristband: string; wristbandColor: string;
}

/** Numeric sliders and their ranges. */
export const AVATAR_RANGES = {
  headSize: [-1, 1], eyeY: [-3, 3], eyeSpacing: [-3, 3], eyeSize: [-2, 2],
  browY: [-3, 3], browAngle: [-3, 3], browSpacing: [-3, 3], noseY: [-3, 3], mouthSize: [-2, 2], mouthY: [-3, 3],
} as const satisfies Partial<Record<keyof AvatarConfig, readonly [number, number]>>;

/** Which list each text field is validated against. */
export const AVATAR_CHOICES = {
  skinTone: SKIN_TONES, headShape: HEAD_SHAPES, eyeStyle: EYE_STYLES, eyeColor: EYE_COLORS, lashStyle: LASH_STYLES,
  browStyle: BROW_STYLES, browColor: HAIR_COLORS, noseStyle: NOSE_STYLES, mouthStyle: MOUTH_STYLES,
  hairStyle: HAIR_STYLES, hairColor: HAIR_COLORS, facialHair: FACIAL_HAIR, earStyle: EAR_STYLES, bodyType: BODY_TYPES,
  top: TOPS, topColor: CLOTH_COLORS, bottom: BOTTOMS, bottomColor: CLOTH_COLORS, shoes: SHOES, shoeColor: CLOTH_COLORS,
  headwear: HEADWEAR, headwearColor: CLOTH_COLORS, eyewear: EYEWEAR, eyewearColor: CLOTH_COLORS, wristband: WRISTBANDS, wristbandColor: CLOTH_COLORS,
} as const satisfies Partial<Record<keyof AvatarConfig, readonly (CatalogItem | Swatch)[]>>;

const base: Omit<AvatarConfig, 'version'> = {
  skinTone: 'skin-4', headShape: 'round', headSize: 0,
  eyeStyle: 'round', eyeColor: 'brown', eyeY: 0, eyeSpacing: 0, eyeSize: 0, lashStyle: 'none',
  browStyle: 'soft', browColor: 'dark-brown', browY: 0, browAngle: 0, browSpacing: 0,
  noseStyle: 'button', noseY: 0, mouthStyle: 'smile', mouthSize: 0, mouthY: 0,
  hairStyle: 'short-messy', hairColor: 'dark-brown', facialHair: 'none', earStyle: 'round',
  bodyType: 'standard', top: 'hoodie', topColor: 'red', bottom: 'loose-jeans', bottomColor: 'denim', shoes: 'skate', shoeColor: 'black',
  headwear: 'none', headwearColor: 'red', eyewear: 'none', eyewearColor: 'black', wristband: 'none', wristbandColor: 'black',
};
const rider = (name: string, fields: Partial<AvatarConfig>) => ({ name, config: { version: AVATAR_VERSION, ...base, ...fields } as AvatarConfig });

/** The five brief presets and the default boy and girl, all ordinary configurations. */
export const AVATAR_PRESETS = [
  rider('Rider Boy', {}),
  rider('Rider Girl', { skinTone: 'skin-5', headShape: 'oval', eyeStyle: 'cheerful', eyeColor: 'hazel', lashStyle: 'medium', browStyle: 'arched', browColor: 'auburn', hairStyle: 'ponytail', hairColor: 'auburn', mouthStyle: 'open-smile', noseStyle: 'tiny', bodyType: 'slim', top: 'long-sleeve', topColor: 'purple', bottom: 'straight-jeans', bottomColor: 'light-denim', shoes: 'sneaker', shoeColor: 'white' }),
  rider('Classic Skater', { skinTone: 'skin-3', eyeStyle: 'relaxed', eyeColor: 'blue', browStyle: 'straight', browColor: 'brown', hairStyle: 'shag', hairColor: 'brown', top: 'tee', topColor: 'white', bottom: 'loose-jeans', bottomColor: 'denim', shoes: 'skate', shoeColor: 'black', headwear: 'cap', headwearColor: 'red', mouthStyle: 'smirk' }),
  rider('Punk Rider', { skinTone: 'skin-2', headShape: 'narrow', eyeStyle: 'angled', eyeColor: 'green', browStyle: 'dramatic', browColor: 'black', hairStyle: 'spiky', hairColor: 'pink', mouthStyle: 'grin', bodyType: 'slim', top: 'zip-hoodie', topColor: 'black', bottom: 'cargo', bottomColor: 'charcoal', shoes: 'high-top', shoeColor: 'red', wristband: 'wristband', wristbandColor: 'red', eyewear: 'none' }),
  rider('Clean Street Rider', { skinTone: 'skin-8', headShape: 'square', eyeStyle: 'oval', eyeColor: 'dark-brown', browStyle: 'thick', browColor: 'black', hairStyle: 'side-part', hairColor: 'black', mouthStyle: 'neutral', noseStyle: 'bridge', top: 'jacket', topColor: 'navy', bottom: 'straight-jeans', bottomColor: 'charcoal', shoes: 'sneaker', shoeColor: 'white', eyewear: 'glasses', eyewearColor: 'black' }),
  rider('Retro Scooter Kid', { skinTone: 'skin-1', headShape: 'wide', eyeStyle: 'wide', eyeColor: 'blue', browStyle: 'raised', browColor: 'blonde', hairStyle: 'fluffy', hairColor: 'blonde', mouthStyle: 'toothy', noseStyle: 'tiny', top: 'oversized-tee', topColor: 'orange', bottom: 'skate-shorts', bottomColor: 'teal', shoes: 'chunky', shoeColor: 'white', headwear: 'helmet', headwearColor: 'yellow', wristband: 'wristband', wristbandColor: 'teal' }),
  rider('Casual Rider', { skinTone: 'skin-10', headShape: 'soft-jaw', eyeStyle: 'sleepy', eyeColor: 'dark-brown', browStyle: 'curved', browColor: 'black', hairStyle: 'afro', hairColor: 'black', facialHair: 'short-beard', mouthStyle: 'smile', noseStyle: 'triangle', bodyType: 'stocky', top: 'hoodie', topColor: 'green', bottom: 'straight-jeans', bottomColor: 'denim', shoes: 'sneaker', shoeColor: 'gray', eyewear: 'sunglasses', eyewearColor: 'black' }),
] as const;

export const defaultAvatar = (): AvatarConfig => structuredClone(AVATAR_PRESETS[0].config);

/** Any stored or received value to a valid rider: unknown fields fall back, numbers are clamped. */
export function sanitizeAvatar(value: unknown): AvatarConfig {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out = defaultAvatar() as unknown as Record<string, unknown>;
  for (const [key, list] of Object.entries(AVATAR_CHOICES)) {
    const chosen = input[key];
    if (typeof chosen === 'string' && (list as readonly { id: string }[]).some(item => item.id === chosen)) out[key] = chosen;
  }
  for (const [key, [min, max]] of Object.entries(AVATAR_RANGES)) {
    const n = input[key];
    if (typeof n === 'number' && Number.isFinite(n)) out[key] = Math.max(min, Math.min(max, Math.round(n)));
  }
  // Brows default to the hair colour when a save only names the hair.
  if (typeof input.browColor !== 'string' && typeof input.hairColor === 'string') out.browColor = out.hairColor;
  out.version = AVATAR_VERSION;
  return out as unknown as AvatarConfig;
}

/** Headwear sits over the hair; these styles would poke through a shell. */
export const TALL_HAIR = new Set(['afro', 'bun', 'spiky', 'fluffy']);

/** A valid, readable random rider: matched brows, no hair clashing with headwear. */
export function randomAvatar(random: () => number = Math.random): AvatarConfig {
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length) % list.length];
  const unlocked = (list: readonly CatalogItem[]) => list.filter(item => item.unlocked);
  const int = (min: number, max: number, spread = 1) => Math.round((min + random() * (max - min)) * spread);
  const hairColor = random() < .8 ? pick(HAIR_COLORS.slice(0, 10)).id : pick(HAIR_COLORS).id;
  const hairStyle = pick(unlocked(HAIR_STYLES)).id;
  const headwear = random() < .35 ? pick(unlocked(HEADWEAR).filter(h => h.id !== 'none')).id : 'none';
  const config: AvatarConfig = {
    version: AVATAR_VERSION,
    skinTone: pick(SKIN_TONES).id, headShape: pick(unlocked(HEAD_SHAPES)).id, headSize: int(-1, 1),
    eyeStyle: pick(unlocked(EYE_STYLES)).id, eyeColor: pick(EYE_COLORS).id, eyeY: int(-1, 1), eyeSpacing: int(-1, 1), eyeSize: int(-1, 1), lashStyle: random() < .5 ? 'none' : pick(unlocked(LASH_STYLES)).id,
    browStyle: pick(unlocked(BROW_STYLES)).id, browColor: hairColor, browY: int(-1, 1), browAngle: int(-1, 1), browSpacing: 0,
    noseStyle: pick(unlocked(NOSE_STYLES)).id, noseY: 0, mouthStyle: pick(unlocked(MOUTH_STYLES)).id, mouthSize: int(-1, 1), mouthY: 0,
    hairStyle: headwear !== 'none' && TALL_HAIR.has(hairStyle) ? 'short-messy' : hairStyle, hairColor,
    facialHair: random() < .75 ? 'none' : pick(unlocked(FACIAL_HAIR)).id, earStyle: pick(unlocked(EAR_STYLES)).id,
    bodyType: pick(BODY_TYPES).id as BodyType,
    top: pick(unlocked(TOPS)).id, topColor: pick(CLOTH_COLORS).id,
    bottom: pick(unlocked(BOTTOMS)).id, bottomColor: pick(['denim', 'light-denim', 'charcoal', 'black', 'khaki', 'navy', 'brown', 'gray']),
    shoes: pick(unlocked(SHOES)).id, shoeColor: pick(['black', 'white', 'gray', 'red', 'navy', 'brown']),
    headwear, headwearColor: pick(CLOTH_COLORS).id,
    eyewear: random() < .2 ? pick(['glasses', 'sunglasses']) : 'none', eyewearColor: pick(['black', 'brown', 'red', 'navy', 'white']),
    wristband: random() < .25 ? 'wristband' : 'none', wristbandColor: pick(CLOTH_COLORS).id,
  };
  return sanitizeAvatar(config);
}

export const swatchHex = (list: readonly Swatch[], id: string) => (list.find(s => s.id === id) ?? list[0]).hex;
