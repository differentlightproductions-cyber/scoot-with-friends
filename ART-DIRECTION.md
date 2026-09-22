# Scoot with Friends — detailed stylized 3D

This replaces older low-poly, primitive, block-character or polygon-count visual restrictions. Use convincing silhouettes, construction details, UVs, normals and smooth deformation. Optimize measured costs; browser delivery does not justify unfinished shapes. Keep colorful comic-inspired styling and readable lighting, without gameplay blur or heavy bloom.

## Reference and reproducible assets

The owner supplied `dist.jpg`, `envy.webp`, `mgp.webp` and `rzr.jpg` as mechanical references. Study their continuous neck/headtube, paired fork blades with wheel clearance, slim deck extrusion, clamp proportions and curved brake. Do not reproduce their trade names or logos. Initial products are **Lazer**. No reference photo is used as a model, billboard or copied texture.

`src/scooter/assembly.ts` authors the actual shared gameplay/customization/rack assembly. `surfaces.ts` provides beveled extrusions, curved tubes, revolved profiles and fine material textures. Product colorways use the same geometry. Preserve deck/bar animation pivots and wheel centers. Change visual proportions independently of Rapier shapes, mass, timing and scoring.

`character-skin.ts` generates weighted clothing around the existing animation drivers. Those hidden drivers are not the rendered character. Keep continuous hips/crotch/knees and shoulders/elbows/wrists. `model.ts` supplies current-frame grip targets, shoes, fingers, face and authored outfits. Preserve Fingerwhip routes when refining other grabs.

`src/park/art.ts` authors planks, brackets, grain, layered foliage and stone silhouettes. Cosmetics must never create additional collision snags or move a riding line.

## Rendering and acceptance

Low retains the same player silhouettes, with cheaper surfaces, shorter vegetation distance and reduced resolution. Medium enables material detail and shadows. High adds nearby foliage geometry, texture filtering and larger shadow maps. Fidelity changes must not rebuild colliders or change simulation state. `render/fidelity.ts` controls these features and uses a single generated reflection environment.

Use `scripts/art-review.mjs before` and `after` for actual gameplay comparisons. Inspect front, side, underside, hardware, shoes/hands, standing, crouch, grab and riding views. Inspect matching Low/Medium/High and furniture views. Report device, browser, resolution, draw calls, geometry, loading and frame/animation timing. Headless software rendering is not a physical phone/controller or hardware GPU test. Do not claim either without testing it.

No external 3D assets were imported for this pass; the TypeScript sources are the reproducible modeling pipeline. The unfinished Techno Gravity map must eventually use this same assembly, not a second shop-only model.
