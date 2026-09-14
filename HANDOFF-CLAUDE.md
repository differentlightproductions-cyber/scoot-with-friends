# September 14 UI alpha handoff

Start a separate clone/worktree from the updated GitHub main branch. Do not reuse this agent's working checkout while it is running. The user explicitly authorized this upload; it does not grant blanket permission for future GitHub pushes.

This pass changes menu presentation, loading, static shop display generation and cosmetic accessory fit only. No riding physics/input thresholds/scoring rules changed.

Implemented: Play/Solo/private-room submenu; Shops as a distinct destination list; Techno Gravity excluded from Parks; Customization > Rider > Mathew/Justin/Rey > clothing/accessories; Settings > Help & Controls > Trick Book, also from paused play. Opaque readable menu panels, isolated preview rendering, hidden gameplay HUD under menus, clean map previews, speedometer removed and trick display lowered. Mount/dismount toasts removed; remaining feedback smaller/higher/translucent. Park editor and Warehouse Build wheel entry shelved. Backpack preview now follows the torso, with pocket/flat shoulder straps; closer-fit headwear without underlying hair protruding.

Loading: first-load and destination stage bar, input suspension, shader preparation. Shop variants reuse geometry and no longer construct a complete default scooter before constructing their display product. Same desktop Chrome local load measured 7984 ms before / 2202 ms after (single-run indicative measurement, not a phone or internet benchmark). No visual quality setting changes physics.

Validation: 47 unit/service tests, production build, browser menu traversal, paused simulation, HUD invisibility, no speedometer, silent mount events, three character choices, hidden editor, smaller-screen layout. Headwear inspected on three riders and three hat styles. Map previews recaptured without HUD. Pending shop visual-defect photos were not supplied during this pass; do not invent which defects they show.

Multiplayer is NOT verified internet play. Existing Sites host serves the frontend/Worker, not the persistent Node room service. User still needs to select an existing always-on server or temporary PC host. No paid hosting, DNS changes, account signup or internet tunnel provisioned. See MULTIPLAYER.md for implemented same-machine checks and remaining Warehouse/controller/performance work. Account onboarding remains a separate incomplete layer.
