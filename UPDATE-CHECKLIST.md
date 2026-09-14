# Scoot with Friends 0.9.0-alpha.1

Implemented in the existing game (no GitHub push):
- Full upward RS stroke survives the quarter-pipe lip; timed quarter and box launches favor height over excessive forward carry. Early / late pops still work.
- Manual-hop-gated body flips, supported fastplants, short Bri/inward scoops, fresh RS Kickless continuation, and motion-validated rewinds.
- Existing pending Warehouse builder, racks, drinks, day phases, HUD/repetition/manual/grind and mount-camera integrations connected and regression checked.
- Three anatomical adult character identities, continuous weighted bodies and fitted garments, new hands/eyes/hair, semantic grip / grab attachment, selectable Character Quality and distance-detail park visitors. CC0 source provenance and rebuild scripts are in assets-source/humans.
- Techno Gravity is a separate, lazily loaded walkable shop with connected frontage and DIY alley. Veterans remains the default; Warehouse remains the empty build space.
- Nine authored Mafioso variants across bars, wheel pairs and clamps use the same assembly in displays, preview and equipped scooters. Lazer remains the original brand.
- Device-local Credit: 100 confirmed banked points = 1 Credit. Explicit purchase confirmation, ownership checks, atomic saving, duplicate protection, equip/keep choices, and separate owner-copy test Credit. Cash unavailable.
- Mobile controller activation / supported mapping guidance, controller-owned menus, disconnect pause, held-input clearing, portrait guidance and readable layouts. No touch riding controls.

Validation evidence in artifacts/complete-update:
- 37 unit tests pass, including migration, duplicate purchases and failed-write rollback.
- 130 prior integration checks and 38 new riding checks pass.
- Quarter/box launch traces; controlled front/backflip, 360 and 720 landings.
- Shop entry, buy/equip, duplicate confirm, map changes and saved ownership checked.
- All three character IDs at three geometry / texture qualities; ten pose mesh checks and screenshots.
- Eight automated mobile-controller/lifecycle/layout checks. These are simulated Gamepad API checks on desktop Chrome, NOT physical Bluetooth phone tests.
- Matched 1440x900 desktop route on RTX 4060 Ti / Chrome 153: previous release median 4.2 ms, Character Low 4.5, Medium 4.5, High 4.6. Same final position and fixed timestep. Short controlled workload; not a sustained phone benchmark.

Limits to retain in release communication:
- Physical Android/iPhone/controller combinations were not available for testing. Do not claim all phones/controllers are verified.
- Park editor remains marked TESTING.
- Saves and alpha inventory remain local to each device; no paid wallet, cloud synchronization or online multiplayer.
- AAA is an aspiration, not a certification or an objective result of these tests. Further visual polish can still be judged by the user.
