# Owner request backlog (Claude worktree `claude/bugfix-pass`)

Every owner request that is not finished, in working order. Updated as work lands.
Status: TODO / IN PROGRESS / DONE (commit).

## A0. Urgent regressions
- DONE (box pop) Big box no longer launches high enough for tricks after the bounded ramp pop (ec38321).
- DONE (flip tuck, superman in flip) Flips combined with scooter tricks (tailwhip, barspin, grabs, Superman, rotating flips), worst on quarter airs: rider body clips through the scooter. Legs only wrap the bars in a tuck no-hander. Tuck no longer lifts the deck into the legs during whips/barspins/Bri/grabs/Superman; Superman scooter sits further ahead. Inside a flip, Superman holds the scooter further out and lower so the stem stays clear of the head (hands may sit slightly off the grips late in the rotation).

## A. Riding feel (latest messages, 2026-09-17)
- DONE (ef9036a) Crooked/angled landings: ride away (absorb the angle) instead of sliding out.
- DONE (ef9036a) Fakie landings near max speed must need steady LS to hold; fakie steering feels reversed (camera sees the rider's front).
- DONE (ef9036a) Fakie steering keeps auto-reverting to forward; require a distinct LS input to revert.
- DONE (ef9036a) Drop-in / quarter entry with a light spin tap forces 360s/540s; spin guidance must not add turns the player did not ask for.
- DONE (ef9036a) Spin rate slightly slower (360 through 1080).

- DONE (ff23356) Quarter-pipe access stairs: remove the unwalkable connecting board; one simple stairset beside the left of the quarter nearest the big box and the right of the quarter nearest the parking lot.

## B. Customization and shop organization
- DONE (menus) Customize (pause Sesh menu) lists owned parts only; unowned parts are bought in the shop first.
- DONE (menus) Brand-first multipage menus: Brand -> category -> parts in readable columns; shop shows unowned, customize shows owned; no long scrolls.
- DONE (menus) Longboard deck preview: stand the board on its tail with the graphic facing out so it can be spun around and seen whole.
- DONE (menus) Preview / draft / committed loadout separation; no preview leaking into equipment; apply without repeated refreshes; latest-request guards.

## B2. Longboard and rides (2026-09-17 message)
- DONE (menus) Sesh Music: add "Promise" by Keeto (Downloads MP3) as the first song.
- DONE (longboard) Longboard carry: hand actually holds the board, knuckles wrapped round the top truck while walking, tucked under the arm standing still.
- DONE (longboard) Longboard push animation: front foot forward on the board, kicking foot pushes out to the side and forward; carving turns the feet sideways as now.
- DONE (menus) Menu: a "RIDES" section to switch between the customized scooter and board, with customization submenus under it instead of Customization as the main header.

- DONE (longboard) Longboard fakie/switch: ride backwards down quarters and ramps; pressing kick while rolling backwards switches to switch stance and pushes with the other foot, like Skate.
- DONE (longboard) Longboard power slide: scrub some speed while bombing, then settle straight back into the line.
- DONE (longboard) Longboard foot brake at extreme speed: rider crashes rolling forward, the board runs away; Y calls it back.
- DONE (presets) Sesh Music controller: up/down moves between rows, left/right within a row or adjusts sliders.
- DONE (genres) Sesh Music genres/channels: Rock (Promise), Hip-Hop (Stacks), Punk, Electronic (Hollow), Chill (Scraped My Knee), AI Music. Artist names for the three new beats are unknown.

## C. Coping stability, re-entry, grinds (Coping/Mobile prompt 1-7, 16)
- DONE (diagnostics; guard never fired across 53 scenarios and the coping launch scan) Record coping failures with replay buffer; single arbitration of pop/grind/stall/re-entry; no stacked boosts; extreme-state guard with diagnostics.
- DONE (diagnostics) Same-wall re-entry targets the transition below coping with logged small budgets: quarter rollout ratio and launch-guide angle are logged per launch; Q01-Q08, R03/R04 and L03 verify returns onto the transition.
- DONE (menus) Always-on grind assist: remove the player toggle, migrate stale Off saves, developer-only off baseline.
- DONE (angled capture; artifacts/claude/angled-grind.mjs) Angled deck-slide capture on rails, benches, ledges, small-box hub; hysteresis; same-feature recapture inhibit.

## D. Controls (Coping/Mobile prompt 10-15)
- DONE (presets) Presets: Normal (default) A push / X tailwhip / B barspin; Goofy X push / A tailwhip / B barspin; versioned migration; Arcade exception kept; hints/animations agree.
- DONE (touch; emulated only, no real phone tested) Controls -> Test Controller view; mobile controller mapping investigation (unconfirmed report).
- DONE (presets) Controller focus scrolls mobile menus (time-based repeat).
- DONE (touch; emulated only, no real phone tested) Mobile-only Xbox-style touch controls (Auto/On/Off, size, opacity, preview) through the same input pipeline.

## E. First-person mode (First-person prompt)
- DONE (first person; screenshots in artifacts/claude/first-person) Settings -> Camera: Third/First Person, FOV, Camera Motion Reduced/Full; local head hiding; camera follows body not scooter; crash camera policy; on-foot look; persistence; screenshots ZIP. Known limits: in a tucked backflip the open collar edge can show at the bottom of the view; no held-item-specific first-person animation beyond the shared rig; not tested on a phone.

## F. Earlier open items
- DONE (camera; X01 render rates; R11/R12 Inward/Bri + flip) Flip-video pass leftovers: camera jump diagnosis, frame-rate replays, Inward/Bri + flip continuity evidence.
- DONE (artifacts/claude/checkpoint4: longboard wall, board in a rack, standing builder preview, board shop; covered by checkpoint3, shop, complete-update, menu-brands probe and T01-T05) Checkpoint 4 screenshots (longboard wall, rack storage, preview) and Checkpoint 4 tests.
- DONE (b hill; 1440 m, scripted descents: scooter 107 s / 17 m/s, longboard 132 s / 14.7 m/s, no bails) Checkpoint 5: B Hill downhill map (always named "B Hill").
- DONE (regression) Checkpoint 6: cross-system regression pass. 88 unit tests, 53/53 physics acceptance, and these browser suites pass: flip-landings, repair-pass, new-riding, pop-flow, bri-integration, bri-air-return, checkpoint1, checkpoint3, riding-focus, addendum-controls, complete-update, crash-items, items-input, shop, shop-fit, sesh, menu-focus, mobile, music, bumper-attempts, character-poses, character-quality, fit-appearance, fit-camera, fit-contracts, human-visual, item-world, network, rider-contact, rider-shadow, ui-polish, visual-detail.
- DONE (camcorder; shots in artifacts/claude/camcorder) '90s Camcorder filter (Settings -> Graphics), works with first person.
- DONE (acceptance) Physics acceptance: all 53 scenarios bound and passing (automated headless replays, not a human controller test).
- KNOWN Failing suites, none caused by this pass: browser (times out), advanced (timed bumper rewind), addendum (Arcade X barspin in the air), memorial (BMX side path), polish (hop off metal bench), build2 (passive fakie scoring), build3 (expects the carried scooter lifted; the owner asked for it to roll alongside), editor (park editor shelved). Not runnable here: art-direction (needs a server on :5177), bri-motion (needs Playwright ffmpeg), accounts-live.

## Done recently
- DONE Network shows each player's rideable and board (c086caf)
- DONE Griptape for scooters and longboards (707b3b1)
- DONE Jump-on pulls scooter under rider in the air (d7d6964)
- DONE Ramp pops bounded by height (ec38321)
- DONE Flip tuck without leg clipping (0d7981c)
- DONE Superman pose, no-hander inside flips, flip tuck (0ea8a93)
- DONE Flips/spins as one body, released spin settles on half turns (68bfd2a)
- DONE One-flip intent (f7bf926)
- DONE Sesh Music (aa1beb4)

## G. Session 2026-09-23 (branch `codex/claude-release-lan`, checkout `work/claude-release-lan`)

Done and verified in headless Chrome (software rendering; no real controller or GPU run):
- DONE (tests/nature-review, tests/asset-swap) Authored pine tree, camellia shrub and cloud models: baked (quantization applied), planted on the real terrain (0 buried / 0 floating of 30 trees, 79 shrubs), old procedural trees, canopy layers, bushes and clouds retired; the loading screen now waits for the authored ramps, trees, shrubs and clouds so the plain versions never flash.
- DONE Photographed lawn texture (ambientCG Grass004, CC0; credit in THIRD_PARTY_NOTICES.md) on grass slabs and the terrain grass band. Silver spine band trimmed/recoloured copper; coping colour; first-person mounted pitch.
- DONE (tests/christian-pose-review) Imported Christian rig: fixed-length IK for arms and legs, hands on grips (1.2 cm), soles on the deck, limb stretch <= 1.5%, per-bone-oriented arm frames. Everyday poses pass; see "Still open" for the tricks that do not.
- DONE (tests/lip-launch, tests/lip-landing.test.ts, physics acceptance 53/53) Ramp coping launch fixes: pop() used a stale lip after LS lean, the rail-guard capsule caught the rider's own coping, angled quarter-air landings were re-launched off the coping.
- DONE (tests/lan.test.ts) LAN hosting (Host LAN / Join LAN launchers, server/lan.ts) ported from `feature/private-multiplayer` (was uncommitted there).
- DONE (src/core/stance.ts, tests/stance-push.browser.mjs) Stance: one canonical place says which foot/hand a stance means. Regular: left foot forward, RIGHT foot pushes; Goofy: RIGHT forward, LEFT pushes. The model and fast-plant were reversed. Fakie and the return from fakie keep the configured stance and the push foot.
- DONE (tests/clamp-decade.test.ts, tests/clamp-grab.browser.mjs) #17 Clamp Grab: RT + RB in the air, same buttons in both stances; Regular right hand / Goofy left hand takes the clamp (ClampGrabAnchor on the scooter assembly), other hand stays on the bar; hold, release, lets go 0.17 s before touchdown; no extra jump or spin; names "Clamp Grab", "180 Clamp Grab", "Backflip + Clamp Grab".
- DONE (tests/decade.browser.mjs, tests/decade-visual.browser.mjs) #16 Decade: A in the air; rider and bars go once round the steering axis while the deck stays put; lifecycle START/ACTIVE/CATCH/CAUGHT tracked in `Tricks.decade`; hop, higher hop, quarter air, 180 + Decade, flips + Decade land clean; a late A bails ("Unaligned landing"); Regular/Goofy mirror.

Paused for the owner (the prompt conflicts with an existing rule, so it was left alone):
- DONE (dc855cb) Owner moved Decade to LB in the air (tap), same in every stance/style; never shares an air with Bri/Inward/Kickless; slower (paced to the air, 0.7-1.05 s); deck held still; tucked legs, no whip look. Superseded: PAUSED Decade on A in Goofy Pro: A is Goofy's tailwhip button (src/input/riding.ts swaps A/X between Normal and Goofy). #16 says A, #17/#18 say buttons never change with stance. Decade is wired to A wherever A is not the whip button (Regular Pro, both stances in Arcade); Goofy Pro has no Decade input yet.
- PAUSED #18 "the Push input must be the same button in both stances": the shipped Normal/Goofy control presets deliberately swap A (push) and X (push) with stance. Not changed. Only the push FOOT was fixed.
- PAUSED Off-scooter scooter side: the scooter is always held on the rider's left while walking; the prompt does not say which side each stance should use.

Still open:
- SUPERSEDED (the Christian model and its clips were removed with Avatar Part 1; emotes move to the phone Emotes app) Wire the 27 Tripo animation clips (walk/run/ride/sit...) and an Emotes customization tab (6 wheel slots, all clips selectable for testing). Source: Downloads "christian+model+with+animations.glb" (27 clips, 65 joints).
- TODO New mountain model (owner will supply); current mountains fade in and out. Female model not started.
- DONE (dc855cb, pose review 48/49; open: mid-Bri left wrist twist 86 deg) Trick poses whose hand cannot reach with Christian's 0.39 m arms: finger whip, Deck Grab, Superman (grab hand), Bri/Inward mid-spin. They need redesigning (deeper tuck / grab the front of the deck), not a new character.
- DONE (dc855cb, tests/box-seam) Small box: invisible sloped wall at x about -3.8 kicks riders sideways (~6 m/s) from the +-0.125 m margin in outdoorHeight (src/park/outdoor.ts).
- DONE 2026-09-23 (owner approved; extras sent to the Recycle Bin, unique work committed first; kept scooter-town, this checkout and Documents\Scoot-with-Friends-Windows) Consolidation: remove every extra copy of the game from the PC (work/, releases/, Desktop and Documents packaged copies; Documentsscooter-town is an unrelated Godot project, ask first), keeping one checkout in Documents and GitHub. Not done: needs the owner's go-ahead on the exact delete list.

## H. Owner requests 2026-09-23 (evening) - do in this order

Also done in dc855cb: rider leans with the scooter at steep pitch (hands stay on the bars, Bri catch pop gone); realistic snowfall (world-space flakes, terminal fall speed, wind/gusts/eddies, flutter), patchy slope-aware cover, wheel/landing powder, snowfall fog; http-safe startup (randomId / SHA-256 / clipboard fallbacks) for phones on the home network.

1. DONE (58eb6ce; tests/first-person-view) First-person camera (do FIRST): heads-up tilt -0.80 from the head with the eye 4 cm behind it (bars, hands and the front of the deck in frame, line ahead across the top), charge tilt while RS is held down, trick focus on the whole scooter in the air then an ease back after the catch, flip rotation unchanged, FOV 100-150 (default 135, old saves at or below 110 migrate). Re-check the deck framing with the new avatar (Christian's hips hid part of the deck).
   - The 70 FOV setting is WAY too close; you can't see anything useful.
   - The 110 FOV setting is not far enough; it should show much more.
   - The angle changed from the previous version, which the owner liked better: now the deck can't be seen at all and the bars are barely visible. Restore a view that shows the bars and the deck.
   - Flips look great (keep the camera rotation in flips).
   - During a trick, focus the camera on the trick being done, then return to the heads-up view.
   - Tilt the camera slightly down while the player charges the jump (holding RS down).
2. TODO Find or make new, better textures for the concrete, the sky backgrounds and other surfaces (credit any third-party assets in THIRD_PARTY_NOTICES.md).
3. SUPERSEDED by Avatar Part 1/2 (section I, docs/AVATAR-DESIGN.md) New character: the owner is done with the Christian model. Build a brand-new character designed around the existing physics and IK: one boy and one girl, Wii Mii-like (stylised, funny, fun) against the realistic scooter and park. Customisable: head size, eyebrows, eyes, hair, colours, "everything like that". Must hold the bars, stand on the deck, push, grab and flip correctly with the current physics.
4. TODO (carried over) "Play on Phone" launcher in the Windows package: serve the game on the home network, show the address and a QR code, so phones can open the browser version with the existing touch controls. The http-safe startup is already done.

## I. Cloud session 2026-09-24 (branch `claude/relaxed-pasteur-g89vqc`)

- DONE #19 Frontflip + spin off quarters (tests/flip-spin-quarter, physics acceptance 53/53, flip-landings, fit-camera, riding-focus). Root causes: (1) the flip guidance capped its rate at a smooth-stop curve even when that stop could not finish before contact, so a fast flip braked early and landed ~0.5 rad short; now it keeps the pace that arrives on the upright at contact and opens out harder (up to the brake rate) instead of sailing past; (2) at touchdown the flip orientation was turned back into yaw/pitch from the forward axis's horizontal shadow, which on a steep wall swings with any pitch error (an angled Front Flair read 1.27 rad off the wall instead of 0.47 and bailed); the heading now comes from the deck's line on the landing surface; (3) the third-person camera chased the travel direction in the air, which on an angled quarter air runs along the coping, so it orbited ~70-110 degrees while the rider flipped and spun; it now holds its takeoff heading in the air (world up, rider position still followed). Flight stays ballistic (no velocity change from body rotation) and flip + spin was already one composed orientation.
- DONE Avatar Part 1: the realistic rider is replaced by an original Mii-style avatar (src/avatar, docs/AVATAR-DESIGN.md); old model code and assets removed. tests/avatar-pose-review: every riding, trick and on-foot pose with hands on grips and soles on the deck (one-footer / can-can / no-foot now keep hold of the bars; held grips roll round the bar instead of being pulled off it).
- DONE (first pass) Avatar Part 2: rider creator (src/ui/creator.ts; docs/AVATAR-DESIGN.md §11): tabs, live preview with face/body/shoe framing, thumbnails, presets, randomize, save + unsaved-changes prompt, phone/landscape layout. Next: hair polish (short-messy lumps read as blobs up close), creator inside the phone Rider app.
- DONE (first pass) Outdoor art overhaul (owner, 2026-09-24): "the most aesthetic scooter game on a web browser ever". Riders stay Mii-style; the outdoors go realistic and magical, set in Boulder City, NV: desert landscape, creosote, pine trees at the park, better tree/plant/rock/mountain models, skies, better CC0 textures (absorbs H2), hot summer / cold winter moods (owner liked the snow). Voxel touches are welcome only if beautiful. B Hill (also Boulder City) must be built in the same look. Owner: "go crazy".
  - DONE (first pass, tests/outdoor-art) Memorial park outdoors, all generated in `src/art` (no downloads): sky dome (day/sunset/night/sunrise, clouds, stars, sun; lights the scene through a PMREM environment, fog follows the horizon), Mojave floor running out to rugged ranges with distance haze and far scrub, a landscaped rock border and mow curb around the lawn, desert scatter (creosote, white bursage, bunch grass, yucca, varnished boulders; thinned on lower fidelity), Aleppo pines (forked open crowns, needle puffs) replacing the old tree/shrub/cloud models, xeriscape beds. CC0 photo textures could not be fetched (dl.polyhaven.org / ambientcg.com blocked by this environment's network policy), so every texture is painted procedurally.
  - DONE B Hill in the same kit: procedural terrain around the route, asphalt road with gutters and gravel shoulders, desert scatter with roadside colliders, Boulder City stucco houses with under-yard garages. TODO summer/winter moods.
- DONE (first pass) Phone system / app hub (docs/briefs/PHONE-SYSTEM.md; SYSTEMS.md "Social"): D-pad Down phone replaces the radial wheel and the Sesh Music panel. Apps: Music, Emotes (+ Cheer, Shrug), Rides, Rider, Map (overhead photo + live markers), Items, Build, Messages (fictional 702-555-01xx numbers, room chat relay). Third person: phone in the rider's hand plus the hand-held bezel overlay; first person: close-up pass with the rider's own hand and forearm. Vending machines open the phone on a choice sheet. tests/phone.browser.mjs.
- DONE Settings (owner, 2026-09-24): Settings > Phone: Phone hand (left/right) and notifications. Camera: Third person FOV (75-115°, horizontal at 16:9, default 87° = the old fixed 56° vertical); the First person FOV setting never applied to the chase camera before.
- DONE (first pass) UI/menu rework (owner, 2026-09-24, repeated): "the UI of the character editor is beautiful ... reflect it across all of the UI ... with variety, not the exact thing on every screen". Carry the creator's 2000s scooter-mag look (grip tape, stickers, tape labels, chrome titles, Bungee/Marker) through the main menu, Sesh menus, pause, HUD, shops and loading, with a different treatment per screen. Done: home, play, Sesh/pause, help, settings, rider creator, shops (deals, shelves, counter, SOLD), rewards (stickers, level-up, crates), account dialog, destination loading card, riding HUD labels, phone apps. Next: B Hill run results card, multiplayer room screens.
- DONE H4 Play on Phone: `Play on Phone.cmd` in the Windows package serves the game on the PC's private network addresses (host-header allowlist: localhost plus this PC's 10/172.16-31/192.168 addresses; owner tools always off), prints the address and a QR code in the window and opens a local /phone page with a large QR. Dependency-free encoder portable/qr.cjs (tests/qr.test.ts; verified by decoding with OpenCV). READ ME has the steps.
- DONE (riding) #20 B Hill speed/steepness/downhill difficulty: keyed 10-16.5% grades, bombing-speed air drag, grip ceiling with wash-out, speed wobble, loose ground, camera look-ahead. Scripted controlled runs: scooter 56 s / top 28.7 m/s, longboard 72 s / 22.3 m/s, no bails; aggressive scooter crashes from wobble. Environment cleanup moves into the outdoor art overhaul (owner: build the new official models, do not reuse the old ones on B Hill).
- Order: Avatar Part 1 -> Avatar Part 2 -> phone system -> outdoor art overhaul (+H2) -> H4 -> #20 (phone after the creator because its Rider app hosts the creator and its hand pose uses the avatar rig).
- DONE Wood park ramps rebuilt (owner: "weird object gap around each ... pieces jagged ... resemble proper wood ... too dark ... spine plates only on one side"): Tripo skins (37 MB) and the finish shader removed; ramps built from the physics profiles with birch plywood, sheathed sides with fascia and battens, steel kick plates at every transition foot (both spine faces), steel-angle hubba; the terrain no longer drapes a skirt around each ramp.
- DONE (first pass) Missions, XP and crates (owner, 2026-09-24: "chests that open after passing certain missions, missions will grant currency and xp for levelling up"): SYSTEMS.md "Progression, shop and accounts"; tests/progress.test.ts, tests/rewards.browser.mjs. Next: more mission chains per map, crate art in 3D, a main-menu level card.
- DONE (first pass) Shop rework (owner: "should feel addictive like buying parts is fun ... fun and collective"): wallet strip with level and collection bar, three daily deals per shop, rarity frames, brand collection meters, crate-exclusive shelf, the counter and SOLD screens. Real-money cosmetics later must be server-authoritative.
- DONE Accounts: cloud save (owner: "sign in/create account works properly ... saving accounts and such"): the saved profile follows a signed-in account across devices with revision checks and an explicit choice when two devices both changed; tests/cloud-save.test.ts, tests/cloud-save.browser.mjs (stand-in API). Needs the 0001_game_saves migration applied to the D1 database before publishing.
