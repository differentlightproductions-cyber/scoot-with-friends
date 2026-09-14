# Scoot with Friends — 0.9.0-alpha.2

This update continues the existing game and saved profiles. Lazer remains the initial scooter brand. The wooden park layout is unchanged.

## Implemented

- Regional Skinny / Regular / Chunky builds, garment fit, folded clothing edges, fitted headwear and curled fingers. The existing human identities and physical contact dimensions remain shared across character quality levels.
- Improved stance, preload, push, landing and grip/deck contacts. RT + Y Superman extends the rider off the scooter while the supporting hand grips the bar and the other holds the deck. LT + Y Deck Grab and LT + LB + Y Tuck No-hander are documented in the Trick Book and controls panel.
- Mounted RS always controls riding/tricks, including at a stop. On-foot RS controls the camera; L3 Run and R3 Recenter retain their roles. Menus own input exclusively.
- Collision-aware bail bodies for the rider and assembled scooter. They tumble/slide, settle on real support, remain down, and permit A recovery to nearby clear ground. A restrained head shake follows resting. The get-up transition returns to an on-foot stance. Invalid motion uses local/last-safe recovery instead of ordinary map-spawn resets.
- Bounded analog body-flip rates. LT + RT plus LS up/down controls front/back flips after an eligible hop; diagonals combine pitch and yaw. Neutral slows established rotation, opposite input brakes, and released triggers damp motion. Launch contribution occurs only within the existing takeoff calculation.
- Persistent Pockets/Backpack inventory, vending selection/confirmation, controller Hold/Use/Stow/Discard, sealed/opened/empty states, interruption-safe use and map/reload persistence. The backpack changes appearance and label, not ownership or capacity. X uses a held item on foot; Settings can remap it to LB or RB. Mounting stows items. Cash remains disabled.
- One-button drinking/eating, a retained empty container/wrapper, opening sound, fountain stance/water arc/splash/audio, and clean interruption. On-foot idle arm swing now depends on actual walking speed.
- Compact neutral shop previews of the selected real part, fitted focus bounds, orbit/pan/zoom, fuller display details and preserved catalog/ownership transactions.
- Chain-link BMX enclosure with posts, rails, braces, caps and open hinged entrance leaves; a timber BMX sign inspired by the supplied entrance reference. Vegetation exclusions protect paths, signs, entrances and interactions. Two outward-facing park signs read correctly. Connected irregular desert ridges replace the cone skyline.

## Validation

- 40 unit tests passed; TypeScript and production build passed.
- 38 riding/fastplant checks across Pro/Arcade and regular/goofy, 24 quarter/box pop routes, and 15 diagonal-flip/Superman input checks passed.
- Six controlled front/back flip landings, including 360 and 720 yaw combinations, passed with sketchy-but-valid landings. All four diagonals retained pitch and yaw. Full-rate double flips remain covered by deterministic integration tests; release damping never automatically completes rotation.
- Five crash surfaces (flat, quarter, box, rail approach and BMX slope) settled, stayed down and recovered locally. Item acquisition/use/stow and persistence tests passed without duplicates.
- Twelve inventory/controller/idle checks passed, including interrupted opening/consumption, map/save reload, controller confirmation isolation and backpack presentation. Idle hand movement was below 0.003 m in mounted, on-foot, carry and held-item cases.
- 27 rider/build/quality combinations retained matching contact positions, headwear fits and mass with progressively more geometry; 33 pose/build views and 12 headwear views were reviewed. Final Superman and Deck Grab palm targets matched the intended sockets in the contact check.
- Seven shop category previews retained authored materials; ten shop purchase/equip/map/reload checks passed.
- Eleven camera/context checks and eight simulated mobile startup/disconnect/reconnect/orientation checks passed. Fountain activation/cancellation, two sign views and passage through the physical BMX opening passed.
- Compiled release smoke passed: compressed assets match the build, shop and park navigation work, no runtime exceptions, and the development harness is absent.

## Performance and limits

Actual desktop: Intel Core i5-13500, NVIDIA RTX 4060 Ti through Direct3D11, Windows, Chrome 153. At 1440 × 900 and pixel ratio 1, the short controlled route measured median frame workloads of 6.6 / 6.4 / 6.5 ms for Character Low / Medium / High, versus 5.2 / 5.3 / 5.0 ms before this pass. These vary character detail while holding the scene/render conditions fixed. They are sampled workloads with a blocking GPU read, not sustained FPS or a phone benchmark. Visual fidelity presets remain available separately.

Physical Android/iPhone and Bluetooth-controller combinations were not available for testing. The mobile checks use desktop browser emulation and injected Gamepad API input. This is still an alpha with stylized animation and simplified crash collision, not a fully articulated ragdoll or a claim of AAA certification. Park editor remains IN TESTING. Saves, inventory and alpha Credit are local to the device; real-money payments, cloud synchronization and multiplayer are not implemented.

Actual screenshots and detailed measurements are in `artifacts/fit-pass/index.html` and its adjacent JSON reports. The current public site and Windows copies are tracked by the outer workspace's `CURRENT-RELEASE.md`. GitHub synchronization is on hold at the owner's request.
