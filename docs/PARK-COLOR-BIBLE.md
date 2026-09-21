# Park ramp color bible

Use this palette for future imported wooden ramp assets so they sit with the authored park. Color is a visual material choice only; keep gameplay terrain, coping colliders, and rideable dimensions defined by the existing park systems.

| Part | Direction | Starting color | Material response |
| --- | --- | --- | --- |
| Riding plywood | warm amber/tan, slightly varied boards | `#B08A5F` to `#C59C65` | matte, roughness `0.82–0.95`, subtle grain and dark seams |
| Layered plywood edges | darker honey brown | `#8D6C46` | matte, roughness `0.88–0.98`, visible thin laminations |
| Side panels and framing | charcoal with a restrained green cast | `#303735` | matte, roughness `0.80–0.90` |
| Steel coping | muted galvanized blue-gray | `#606B6B` to `#8F9996` | roughness `0.35–0.55`, low metalness `0.65–0.85`, no mirror chrome |
| Fasteners/brackets | dark oxidized steel | `#3B4544` | roughness `0.45–0.65`, metalness `0.55–0.75` |

Keep riding surfaces brighter than sides so the playable line reads at a glance. Avoid saturated orange, red-brown plastic, black voids, polished chrome, neon paint, and strong color gradients. Wood grain should be fine and directional along the riding surface, with mild board-to-board variation; it must not look like a tiled image or noisy camouflage. Steel should read as worn galvanized metal with soft highlights.

Imported materials should use the project’s linear/sRGB handling: base color textures are sRGB, while normal and metallic/roughness textures remain data maps. Preserve normal detail at high fidelity and allow the existing fidelity system to reduce expensive maps at lower settings. Use a small visual offset or polygon bias for layered skins; never thicken the collision surface to solve z-fighting.

For consistency, every replacement asset should have the same Y-up convention, centered footprint origin, a clean rideable top, and no baked ground or cast shadow. Match the authored module dimensions and connection edges in `src/park/outdoor.ts`; imported render meshes do not replace the existing terrain and coping collision definitions until a separate collision review confirms alignment.
