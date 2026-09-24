# Scoot with Friends — rider avatar design

The owner's two redesign briefs (Part 1 "Replace the current rider model direction" and
Part 2 "Simplified avatar creator / customization system", 2026-09-24) turned into one
buildable spec. This document is the source of truth for the rider. Code follows it;
where the scooter forces a change, this document changes first.

The realistic rider direction (Christian GLB, the anatomical rider-1/2/3 meshes and the
procedural proxy body) is **removed**, not paused. No old model code or asset stays.

## 1. Style

An original avatar in the spirit of the old console avatar makers: simple, charming,
readable, lightweight, easy to rig and animate, stable during tricks.

- Rounded head that carries the personality; features are flat, iconic shapes placed on
  the face (not sculpted anatomy).
- Simple torso, tube arms and legs, mitten hands with a thumb, chunky shoes.
- Clean silhouette readable from the chase camera at speed; slightly exaggerated poses.
- Smooth shading, clean materials, curated colours. Simple does not mean unfinished.
- Original shapes only: no Nintendo meshes, textures, proportions tables or names.

## 2. Proportions (standard body, metres, rider space)

The rider root sits on the ground under the scooter. Deck top ≈ 0.11, grips at y 1.01,
z 0.26, x ±0.24 (±0.30 oversized bars). Front foot z +0.04, rear (push) foot z −0.19.
Standing on the ground (sole at y 0), the implemented skeleton (`src/avatar/rig.ts`):

| Joint / point            | Rest position (x, y)  | Segment to next             |
|--------------------------|-----------------------|-----------------------------|
| sole                     | (±0.11, 0)            | ankle 0.075 above the sole  |
| ankle                    | (±0.11, 0.075)        | shin 0.38                   |
| knee                     | (±0.10, ≈0.45)        | thigh 0.38                  |
| hip joint                | (±0.09, 0.82)         |                             |
| pelvis centre            | (0, 0.835)            | 0.21 along the spine + 0.055 drop |
| chest bone               | (0, 1.10)             |                             |
| shoulder joint           | (±0.165, ≈1.29)       | upper arm 0.245             |
| elbow                    |                       | forearm 0.215               |
| wrist                    |                       | palm 0.055 to the bar centre |
| neck base                | (0, ≈1.315)           |                             |
| head centre / crown      | (0, ≈1.545) / (0, ≈1.745) | head 0.40 tall, 0.365 wide |

- Height ≈ 1.74 m sole to crown, head ≈ 1/4.4 of height: a big, readable head on a
  near-realistic torso and legs. The first draft (1.56 m, 0.31 head, 0.50 arms) could not
  reach the scooter's fixed 1.01 m grips with bent elbows *and* keep soft knees on the
  deck, so the body grew to fit the scooter and the head stayed large (§5).
- Arm reach shoulder→wrist 0.46 m. Riding at rest (chest 1.183 on the deck, leaning 0.15)
  the elbows bend about 120° and the knees about 30°; a full preload folds the chest
  over the bars at about 90° elbows and knees.
- Leg hip→ankle 0.76 m.
- **Everyone is the same height** (brief: skip height if it complicates scooter fitting).

## 3. Skeleton — one rig for every avatar

```
root
└ pelvis ─ spine(chest) ─ neck ─ head
           ├ shoulder.L ─ upperArm.L ─ forearm.L ─ hand.L
           └ shoulder.R ─ upperArm.R ─ forearm.R ─ hand.R
  pelvis ─ thigh.L ─ shin.L ─ foot.L
         └ thigh.R ─ shin.R ─ foot.R
```

16 bones. Every part, garment and accessory is built on these bones. Nothing needs its
own rig. Limbs are **rigid rounded segments** joined by ball caps: they rotate, they never
scale, so they cannot stretch, shear or explode. Arms and legs are placed by analytic
two-bone IK with the fixed lengths above (≤1.5 % invisible slack); the elbow/knee bends
toward a pole, never lengthens.

### Named anchors (attachments never position themselves per animation)

| Anchor / point | Bone   | Used by                                                 |
|----------------|--------|---------------------------------------------------------|
| `crown`        | head   | hair, beanie, cap, helmet (built on the head surface)   |
| `eye`          | head   | first-person camera                                     |
| `back`         | chest  | backpack                                                |
| palm           | hand   | `RIG.palm` ahead of the wrist: meets a bar, deck or clamp |
| sole           | foot   | `RIG.ankle` below the ankle: meets the deck or ground   |

The face decal, glasses and wristband are built directly on the head and forearm.

## 4. Body types (same skeleton)

| Type     | Torso w × d   | Limb radius | Shoulders / hips (x) | Belly |
|----------|---------------|-------------|----------------------|-------|
| slim     | 0.30 × 0.185  | ×0.86       | ±0.155 / ±0.082      | 0     |
| standard | 0.345 × 0.21  | ×1.00       | ±0.165 / ±0.09       | 0.01  |
| stocky   | 0.40 × 0.26   | ×1.20       | ±0.18 / ±0.10        | 0.035 |

Only girth and the small stance numbers change. Joint heights, arm/leg lengths, hand
targets and every physics dimension are identical, so a cosmetic change never alters
riding.

## 5. Scooter fitting (mechanics formed around the character)

`src/avatar/rig.ts` exports the numbers above; the pose drivers in `src/scooter/model.ts`
read them instead of per-model constants:

- shoulder joint in the chest frame, arm segment lengths and reach
- hip joint in the pelvis frame, leg segment lengths, ankle-above-sole
- palm length (wrist → grip anchor) and grip roll about a bar
- riding stance: chest height, fore-aft, lean, crouch drop/reach, push stroke keys,
  sitting feet, no-hander hand spots, all solved against these lengths
- per-body stance data (foot spread, shoulder width)

Checks (automated, every sample rider, every pose in §9): hands on grips ≤ 1.5 cm,
soles on the deck ≤ 1.5 cm, no segment longer than its rest length, no NaN, body clear of
the stem/bars/deck in tricks.

## 6. Face and head

The face is painted onto the front of the head from the saved configuration (one small
canvas texture per rider, shared features drawn as vector shapes), so a new eye or mouth
is a drawing function, not a mesh. Constrained ranges keep every combination on the face.

- **Head shape (6):** round, oval, narrow, wide, square-ish, soft jaw.
- **Head size (3):** small ×0.92, normal ×1, large ×1.1 (head mesh and head anchors only).
- **Skin (12 swatches):** light to deep natural tones.
- **Eyes (10):** round, relaxed, narrow, cheerful, sleepy, wide, angled, dot, oval, sparkle.
  Adjust: colour (8), vertical position (−3…+3), spacing (−3…+3), size (−2…+2).
- **Eyelashes (6):** none, short, medium, long, outer corner, stylised thick.
- **Eyebrows (10):** straight, curved, thick, thin, raised, angled, soft, dramatic, arched,
  flat-short. Adjust: colour (hair palette, defaults to hair), vertical, angle, spacing.
- **Nose (6):** tiny round, short line, soft triangle, button, small bridge, longer.
  Adjust: vertical. Drawn plus a small 3D bump for the button/round/bridge styles.
- **Mouth (10):** smile, neutral, smirk, open smile, small frown, grin, flat line,
  surprised, tongue out, toothy. Adjust: size, vertical.
- **Facial hair (6):** none, mustache, short beard, goatee, stubble, full beard.
- **Ears (3):** round, small, pointed-soft.
- Blink: an eyelid pass every few seconds (cheap; off on Low).

## 7. Hair (14 styles, 14 colours)

Styles: short messy, buzz cut, side part, fluffy, medium shag, long straight, ponytail,
bun, curly, afro, swept fringe, spiky, undercut, shoulder length. Built from a few chunky
rounded pieces on the `crown` anchor: rigid on the head, so stable in every trick.
Under a helmet or beanie the hair is trimmed to what shows below it.

Colours: black, dark brown, brown, light brown, blonde, platinum, red, auburn, gray,
white, blue, green, purple, pink.

## 8. Outfit and accessories

Early-2000s scooter / skate / punk. Curated clothing palette (19 colours), no free RGB.

- **Tops (6):** basic tee, oversized tee, long sleeve, hoodie, zip hoodie, simple jacket.
- **Bottoms (5):** loose jeans, straight jeans, cargo pants, shorts, skate shorts.
- **Shoes (4):** basic skate shoe, chunky skate shoe, simple sneaker, high-top.
- **Accessories (6):** helmet, beanie, cap (one headwear slot); glasses, sunglasses
  (one eyewear slot); wristband. Each has a colour from the accessory palette.

Garments are the body's own segments in the garment colour (sleeves, trouser legs,
cuffs, hood, pockets, zips as simple shapes), so clothing moves with the same bones.

## 9. Save data

A rider is a small versioned object in the existing local profile (`profile.avatar`),
never a mesh. It rebuilds the rider on load, and multiplayer can send it later.

```
{ version, skinTone, headShape, headSize,
  eyeStyle, eyeColor, eyeY, eyeSpacing, eyeSize, lashStyle,
  browStyle, browColor, browY, browAngle, browSpacing,
  noseStyle, noseY, mouthStyle, mouthSize, mouthY,
  hairStyle, hairColor, facialHair, earStyle,
  bodyType, top, topColor, bottom, bottomColor, shoes, shoeColor,
  headwear, headwearColor, eyewear, eyewearColor, wristband, wristbandColor }
```

Unknown or missing fields fall back to the default rider; values are clamped to their
ranges. Old profiles (riderId / outfit / bodyBuild) migrate once to the nearest avatar.

Every catalogue item: `id`, `name`, `category`, colour support, `unlocked` (all true for
now; ready for shop cosmetics and events), optional thumbnail.

## 10. Presets and sample riders

Classic Skater, Punk Rider, Clean Street Rider, Retro Scooter Kid, Casual Rider (brief),
plus a boy and a girl default (earlier brief). All are configurations of the same system.
Randomize picks a valid rider with matched brow/hair colours and no headwear/hair clash.

## 11. Creator (Part 2)

`src/ui/creator.ts` (styles in `creator.css`, backdrop in `creator-backdrop.ts`, tile
images from `src/avatar/thumbnails.ts`). Rider → **CUSTOMIZE RIDER** opens it from the
main menu and from the in-game Sesh menu (there SAVE also applies the Sesh draft).

- Tabs: PRESETS (the seven sample riders + Randomize), FACE (head shape, skin, head
  size, ears, facial hair), HAIR, EYES (style, colour, lashes, height, spacing, size),
  BROWS (style, colour, height, angle, spacing), NOSE, MOUTH, BODY, OUTFIT (top, bottoms,
  shoes, each with a colour), ACCESSORIES (headwear, eyewear, wristband, each with a
  colour; colour rows hide while the item is "none").
- Controls: LB/RB tab, D-pad/LS move (down walks the lines of a wrapped grid first),
  A pick, left/right on a fader row changes it, X randomize, Y save, B back, RS turn,
  LT/RT zoom, R3 reset view. Keyboard: arrows, Space, Shift/E, X, Y, B, Esc. Mouse and
  touch: tap any tile, fader notch or tab; drag the preview to turn it; wheel to zoom.
- Live preview: the draft is shown on the menu's preview rider; the camera frames the
  face (FACE CAM), the whole body (FULL BODY) or the shoes (KICKS CAM) for the focused row.
- Save: RIDER SAVED toast; leaving with unsaved changes asks SAVE & EXIT / DISCARD /
  KEEP EDITING. The saved rider is `profile.avatar` (§9).
- Thumbnails show each option on the rider being edited, in their colours: face features
  are cropped from a painted face, 3D items are rendered one per frame on a small
  off-screen renderer that exists only while the creator is open.
- Look: 2000s scooter-mag style. Grip-tape panel, sticker tabs and tiles with hard
  offset shadows, masking-tape row labels (Permanent Marker), chrome Bungee title,
  mixing-board faders, camcorder viewfinder round the preview over a Boulder City dusk.
  This is the style the phone and the Sesh menus will adopt.

## 12. Performance

Rigid meshes parented to the 16 bones (no skinning), about a dozen small materials per
rider (skin, hair, top, bottom, trims, shoe, sole, accessories) and one 512 px face canvas
with its blink twin. Low detail uses fewer segments; park visitors switch to low detail at
24 m and disappear at 80 m. First person swaps the head, hair, neck, chest and upper arms
to depth-less ghost materials, so they leave the colour pass but still cast their shadow.

## 13. Verification

Five visibly different test riders (skin, head, hair, eyes, brows, body type, clothing)
through idle, walk, push, ride, turn, bunny hop, plus the trick poses the old rider was
reviewed in (grabs, whips, Bri, flips, Superman, Decade, Clamp Grab, sitting, crash).
Screenshots are looked at, not only measured.
