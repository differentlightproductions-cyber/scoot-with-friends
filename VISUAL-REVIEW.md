# Ramp visual review

Reviewed the current gameplay captures in `artifacts/ramp-review`, the source inspection renders, `ART-DIRECTION.md`, `PARK-COLOR-BIBLE.md`, and the imported-ramp loading/finish code. The latest captures do not yet meet the requested realistic HD wood finish.

## What is causing the look

1. **The clean-finish shader makes the wood pale and flat.** In `src/park/cleanRampFinish.ts`, `vec3(.58, .405, .235)` is written after texture sampling, so it is interpreted in linear space and displays much lighter than the intended `#B08A5F`–`#C59C65` sRGB palette. The extremely narrow `warm` threshold (`.002`–`.008`) also classifies almost every slightly warm textured pixel as wood, while neutral/white source wood can escape recoloring. This explains inconsistent cream/white surfaces across assets.
2. **The shader removes the maps that supplied material depth.** It clears normal, roughness, AO, and metalness maps and recomputes every mesh's vertex normals. The result loses plywood grain, laminations, recess shading, fastener definition, and the distinct response of metal. The world-space sine grain is a regular banding pattern rather than believable directional wood grain.
3. **Residual damage is geometry/source detail, not lighting.** The latest `spine-close.png` shows peeled, curled lower corners, an uneven right edge, and raised dents/fasteners. The small/large box views show ragged perimeter silhouettes and irregular exposed edges. Recoloring cannot remove these features; they must be hidden or repaired in the render mesh while preserving the fitted rideable profile and collision.
4. **Some white/gray is exposed substrate and trim.** The broad pale slab around the modules and bright edge strips are separate concrete/apron/trim geometry. They visually merge with the pale plywood and make the ramps read as torn sheets over a white base.
5. **Day lighting only magnifies the issue.** ACES exposure `1.04`, hemisphere intensity `1.15`, and sun intensity `3.2` produce a bright outdoor scene, but the same light gives acceptable contrast elsewhere. Correct the ramp albedo/materials before changing global lighting.

## Exact correction order

1. Convert the desired plywood colors from sRGB to linear before assigning them in the shader, or set an actual `MeshStandardMaterial.color` in sRGB and retain the source base-color detail. Use the color-bible range; do not tune global exposure around the ramps.
2. Replace the warmth-only pixel test with explicit mesh/material assignment during import. Identify rideable plywood, plywood edges, charcoal side panels, coping, and hardware by the existing mesh/material structure. Do not let warm rails or rust become plywood, and do not let neutral source wood remain white.
3. Preserve authored normals and useful normal/AO/roughness information. Reduce only the excessive scuff contribution; retain fine wood relief, seams, fastener recesses, plywood laminations, and proper galvanized coping response. Remove the procedural world-space sine bands.
4. Repair or mask the spine's peeled lower lips and the box assets' ragged perimeter geometry in the fitted render meshes. Keep the current analytic collider, dimensions, lane order, connection edges, and source assets unchanged.
5. Darken/recess the visible substrate and edge closures so they read as intentional construction. Keep the riding line continuous and eliminate bright white strips protruding beyond the ramp footprints.

## Visual acceptance criteria

- In daylight gameplay, all riding skins read as warm amber plywood, with visible fine directional grain and mild panel variation; no large cream-white fields.
- Plywood tops, layered edges, charcoal sides, coping, and fasteners remain visually distinct at close range and in the middle-assembly view.
- No curled, peeled, jagged, or paper-thin silhouette appears at any spine or box entry, side, or lower corner.
- No white substrate/trim protrudes beyond the intended footprint or reads as a second torn skin.
- Coping reads as muted galvanized steel, not orange-painted wood or white plastic.
- The front/back quarters, large transfer, small box, and spine share one coherent finish while retaining their believable construction detail.
- Verify with the same five `artifacts/ramp-review` camera views plus one low grazing-angle view per module; inspect silhouettes and highlights at High, then confirm Medium does not lose the material separation.


## Alignment follow-up
The small-box skin and analytic module now end at x=0.61, matching the fixed hub side wall. Its left edge remains x=-4 and hub center x=0.3. Browser surface samples and production checks passed; broader texture and damaged-edge repairs remain pending.
