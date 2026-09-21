# Tripo ramp replacement prompts

## Start the image chat

Upload the three original park photos included in the ZIP. Paste this instruction first, then one object prompt below:

```text
Help me prepare isolated reference renders for Tripo, using these park photos. Generate only the single object I request, not an entire park or a sheet of multiple views. Preserve the real ramp profile and construction. Use detailed stylized realism, warm amber plywood, charcoal side panels and muted steel coping. Keep lighting neutral and diffuse, every edge visible, the full object inside the image, and the background transparent or plain white. No floor, scenery, people, adjacent obstacles, floating parts, text, labels or cast shadows. The three middle ramps must be separate modular assets: large transfer left, small box middle, spine right. Ask before changing their shape. Do not generate foliage yet.
```

Dimensions below guide proportions; an image cannot guarantee exact dimensions, UVs, origin, or collision alignment. Those are checked on the imported model. Keep existing Tripo models and their textures when fitting them.

Use the supplied park photos as visual references when available. Generate one isolated object per prompt. Keep the camera at a readable 3/4 front view, with the object centered and fully inside frame. Use a transparent background; if unavailable, use plain white. No people, scooters, boards, ground plane, cast shadow, neighboring objects, text, annotations, brand marks, or logos. Preserve the ramp as a mechanically plausible wooden skatepark construction with clean bevels, visible plywood layers, subtle fasteners, and one continuous rideable surface.

Apply the shared material direction from `PARK-COLOR-BIBLE.md`: warm amber plywood riding surfaces, charcoal/dark green-black sides and support structure, and muted galvanized steel coping. Keep the asset’s origin at the center of its footprint, Y up, and the rideable top at the stated height. Do not bake collision geometry into the render asset.

## Large transfer, left lane

```text
Isolated stylized-realistic wooden skatepark large transfer ramp, a single connected object for a game park. Match these game dimensions: 12.0 m across X, 17.0 m along Z, 2.30 m maximum height; transfer run 4.0 m; flat deck 1.65 m. The ramp occupies the left lane and must leave its right long edge cleanly connectable to the existing middle small-box surface. Use an asymmetric profile: one 4.0 m curved launch transition, a 1.65 m flat crest, then an 11.35 m long, gently rounded sloped landing back to ground. Do not make two opposing quarter pipes or a halfpipe. Keep a continuous plywood riding skin, charcoal side panels, tidy support structure, and one straight steel coping on the launch lip. Warm amber wood top, charcoal side/support structure, muted steel coping. 3/4 front view, centered isolated object, transparent background or plain white fallback, no people, scooters, boards, ground, cast shadow, neighbors, text, annotations, logos, or brand marks.
```

## Small center box, middle lane

```text
Isolated stylized-realistic wooden skatepark small center transfer box, a single connected object for a game park. Match these game dimensions: 5.0 m across X, 13.0 m along Z, 1.40 m maximum height; transition run 2.75 m; flat deck 1.75 m. Keep it in the original middle lane with its connected riding surface intact. Use an asymmetric profile: a 2.75 m curved launch transition, a 1.75 m flat crest, then an 8.50 m long, gently rounded sloped landing back to ground. It is not a halfpipe. Use a continuous amber plywood top, charcoal side panels and supports, and steel coping on the launch lip. Keep the lateral connection edges clean; do not add stairs, rails, fences, or detached platforms. 3/4 front view, centered isolated object, transparent background or plain white fallback, no people, scooters, boards, ground, cast shadow, neighbors, text, annotations, logos, or brand marks.
```

## Right spine

```text
Isolated stylized-realistic wooden skatepark spine ramp, a single connected object for a game park. Match these game dimensions: 7.0 m across X, 6.25 m along Z, 2.20 m maximum height; each transition run 3.0 m; narrow central spine/deck 0.25 m. Keep the opposing transitions mechanically connected at the center crest, with a continuous rideable surface and no gap or hidden collision slab. Use warm amber plywood riding surfaces, charcoal/dark green-black side panels and supports, and muted galvanized-steel coping along both central spine lips. The spine stays to the right of the middle small-box lane and must retain clear side clearance for connected park travel. 3/4 front view, centered isolated object, transparent background or plain white fallback, no people, scooters, boards, ground, cast shadow, neighbors, text, annotations, logos, or brand marks.
```

### Negative prompt

```text
people, rider, scooter, skateboard, longboard, bicycle, ground plane, floor, grass, environment, neighboring ramps, duplicate ramp, cast shadow, floating parts, disconnected surfaces, paper-thin geometry, toy proportions, low-poly faceting, melted wood, broken coping, collision markers, measurements, labels, text, watermark, logo, brand name
```
