# Build 3 completion

## Session and menus

- One session marker: hold D-pad Up for 0.75 seconds to set/replace; tap/release returns. Progress, success and invalid-state feedback are visible.
- Markers save map ID, exact position, yaw, scooter pitch/roll and support normal. Returning clears tricks, manuals, grinds, bails, walking/running and velocity. Collision clearance is checked.
- Airborne, bailing, unstable, out-of-bounds and obstructed placement is rejected. Safe grounded positions are supported; unsafe grinding placement is rejected.
- Ordinary resets preserve the marker; new sessions, restarts, menu exits and map changes clear it. Pause return is disabled until a marker exists.
- Exit to Main Menu resets gameplay without reloading. Main sections are Ride, Rider, Scooter, Settings.
- Both parks have data-driven metadata, descriptions and previews. Map switching creates a fresh physics world without reloading and disposes the previous world/resources.
- D-pad/LS, A and B navigate new menus. RS rotates/zooms previews. Mouse/keyboard alternatives work.

## Riders and scooter builder

- Three neutral presets vary skin, clothing, helmet and proportions with identical gameplay physics.
- Live rider/scooter presentation in the main menu; scooter-only inspection in the builder.
- 25 Lazer products: three decks, three bars, three forks, two clamps, three wheel diameters, two bearings, three grips, two headsets, two fenders and two compression products.
- Authored colorways and actual interchangeable meshes. Bearings have a small visible detail. No color wheel, store, currency, locks or purchases.
- Definitions include brand/product/category IDs, variants, free ownership metadata, premium=false, priceId=null and extensible permissive compatibility fields.
- Separate front/rear wheel slots; current UI applies wheel choice to both.
- Validated rider/outfit/part IDs and settings persist in localStorage; invalid stored data falls back to defaults. Parts never alter gameplay physics.

## Airborne counterweight

- Horizontal LS retains analog yaw/spin. Vertical LS controls independent, damped weight and pitch: forward moves body forward/nose down; back moves rearward/nose up.
- Pitch bias is limited to ±0.48 radians with bounded angular acceleration/speed. No full flips.
- Takeoff pitch decays smoothly in its entry plane. Landing normals inform evaluation; no automatic snapping to the landing slope.
- Horizontal drift influence is capped at 0.3 m/s² and a total 0.4 m/s per air. Gravity remains authoritative; no lift or sustained air strafing.
- Landing quality includes scooter pitch, rider pitch, weight bias, normal-relative impact, surface angle and yaw. Incorrect weight can downgrade an aligned landing.
- Coping launch redirection retains motion along the rail. Subsequent return is ballistic and player-controlled.

## Verification

Production build, mechanics tests and three browser suites cover the actual game. Reports under `artifacts/` record original gameplay preservation, menus, every part category/mesh, persistence, marker replacement/bail return/invalid placement, running/carry, continuous and separately caught spins, weight reversal/bounded drift, and charged/uncharged 180/540 re-entry into Sunset's quarter.

High drops can remain sketchy; clean landings are not guaranteed. Physical controller/rumble feel and desktop-GPU frame rate remain hands-on validation limits.
