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

## 2. Proportions (standard body, metres, rider space, sole on the deck)

The rider root sits on the ground under the scooter. Deck top ≈ 0.11, grips at y 1.01,
z 0.26, x ±0.24 (±0.30 oversized bars). Front foot z +0.04, rear (push) foot z −0.19.

| Joint / point            | Rest position (x, y, z)        | Segment to next        |
|--------------------------|--------------------------------|------------------------|
| sole                     | (±0.08, 0.11, …)               | ankle 0.07 above sole  |
| ankle                    | (±0.08, 0.18, …)               | shin 0.36              |
| knee                     | (±0.085, 0.54, …)              | thigh 0.36             |
| hip joint                | (±0.09, 0.90, 0)               |                        |
| pelvis centre            | (0, 0.93, 0)                   | spine 0.34             |
| chest / shoulder line    | (0, 1.27, 0)                   |                        |
| shoulder joint           | (±0.165, 1.25, 0)              | upper arm 0.26         |
| elbow                    |                                | forearm 0.24           |
| wrist                    |                                | mitten 0.10 to tip     |
| neck base → head pivot   | (0, 1.30) → (0, 1.36)          |                        |
| head centre / crown      | (0, 1.51) / (0, 1.67)          | head 0.31 tall         |

- Height ≈ 1.56 m sole to crown, head ≈ 1/5 of height (stylised, not realistic 1/7.5).
- Arm reach shoulder→wrist 0.50 m: the riding shoulders (≈1.25–1.30 m, just behind the
  bars) reach the grips with bent elbows; no pose may ask for more than 0.50 m.
- Leg hip→ankle 0.72 m: standing on the deck the knees stay soft (~25°).
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

| Anchor        | Bone     | Used by                                   |
|---------------|----------|-------------------------------------------|
| `crown`       | head     | hair, beanie, cap, helmet                 |
| `face`        | head     | face features, glasses, sunglasses        |
| `wrist.L/R`   | forearm  | wristband                                 |
| `grip.L/R`    | hand     | palm centre that meets a bar/deck/clamp   |
| `sole.L/R`    | foot     | shoe sole that meets the deck or ground   |
| `back`        | spine    | backpack                                  |
| `eye`         | head     | first-person camera                       |

## 4. Body types (same skeleton)

| Type     | Torso w × d | Limb radius | Stance data                         |
|----------|-------------|-------------|-------------------------------------|
| slim     | 0.28 × 0.17 | ×0.85       | feet ±0.075                         |
| standard | 0.32 × 0.20 | ×1.00       | feet ±0.08                          |
| stocky   | 0.38 × 0.25 | ×1.22       | feet ±0.09, shoulders ±0.175        |

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

Early-2000s scooter / skate / punk. Curated clothing palette (16 colours), no free RGB.

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

Rider → Customize Rider → Face, Hair, Eyes, Brows, Nose, Mouth, Body, Outfit,
Accessories → Save ("RIDER SAVED"). Large live 3D preview, rotate/zoom/reset, head framing
for face categories and full body for body/outfit. Controller-first (D-pad/LS navigate,
A select, B back, LB/RB category, RS rotate, triggers zoom), mouse and touch friendly
(large targets, drag to rotate, no hover), randomize, presets.

## 12. Performance

One shared vertex-coloured material for all body/garment/hair geometry, merged per bone
(about 16 draw calls a rider plus the face), one small face texture, no skinning. Low
quality uses fewer segments. First person hides head, hair, neck, chest and upper arms
from the colour pass only; the full body still casts its shadow.

## 13. Verification

Five visibly different test riders (skin, head, hair, eyes, brows, body type, clothing)
through idle, walk, push, ride, turn, bunny hop, plus the trick poses the old rider was
reviewed in (grabs, whips, Bri, flips, Superman, Decade, Clamp Grab, sitting, crash).
Screenshots are looked at, not only measured.
