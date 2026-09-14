# Anatomical rider source assets

The base topology, shape targets, default skeleton and skin weights were downloaded from the official MakeHuman Community repository on 2026-09-14:
https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data

Graphical assets are CC0, independently of the MakeHuman application's AGPL source-code license. We use asset data only. The downloaded license documents are included here.

Clothing, hair and skin maps originate from the official CC0 MakeHuman system-assets pack:
https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip

The selected original source files remain under `system/`; the downloaded archive is excluded from version control and the game. No MakeHuman application code is copied into this project.

`scripts/build-human-assets.mjs` applies three adult shape targets and identity refinements, fits the garments using their authored barycentric references, remaps skin weights to semantic rider targets, and exports reusable runtime mesh data. Runtime garments and materials use the existing authored outfit IDs and colors. The game uses original fictional rider identities, not shop-photo likenesses.

Rebuild: `node scripts/build-human-assets.mjs`.

The game-specific pose adapter, material setup and quality reduction are in `src/scooter/human.ts`. Character rendering never changes physics bodies, collision dimensions or trick timing.
