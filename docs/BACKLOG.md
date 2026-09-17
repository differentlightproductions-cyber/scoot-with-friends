# Owner request backlog (Claude worktree `claude/bugfix-pass`)

Every owner request that is not finished, in working order. Updated as work lands.
Status: TODO / IN PROGRESS / DONE (commit).

## A0. Urgent regressions
- DONE (box pop) Big box no longer launches high enough for tricks after the bounded ramp pop (ec38321).
- PARTIAL (flip tuck) Flips combined with scooter tricks (tailwhip, barspin, grabs, Superman, rotating flips), worst on quarter airs: rider body clips through the scooter. Legs only wrap the bars in a tuck no-hander. Tuck no longer lifts the deck into the legs during whips/barspins/Bri/grabs/Superman; Superman scooter sits further ahead. Remaining: Superman inside a backflip still brushes the stem near the head late in the rotation.

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
- TODO Record coping failures with replay buffer; single arbitration of pop/grind/stall/re-entry; no stacked boosts; extreme-state guard with diagnostics.
- TODO Same-wall re-entry targets the transition below coping with logged small budgets.
- DONE (menus) Always-on grind assist: remove the player toggle, migrate stale Off saves, developer-only off baseline.
- TODO Angled deck-slide capture on rails, benches, ledges, small-box hub; hysteresis; same-feature recapture inhibit.

## D. Controls (Coping/Mobile prompt 10-15)
- DONE (presets) Presets: Normal (default) A push / X tailwhip / B barspin; Goofy X push / A tailwhip / B barspin; versioned migration; Arcade exception kept; hints/animations agree.
- TODO Controls -> Test Controller view; mobile controller mapping investigation (unconfirmed report).
- DONE (presets) Controller focus scrolls mobile menus (time-based repeat).
- TODO Mobile-only Xbox-style touch controls (Auto/On/Off, size, opacity, preview) through the same input pipeline.

## E. First-person mode (First-person prompt)
- DONE (first person; screenshots in artifacts/claude/first-person) Settings -> Camera: Third/First Person, FOV, Camera Motion Reduced/Full; local head hiding; camera follows body not scooter; crash camera policy; on-foot look; persistence; screenshots ZIP. Known limits: in a tucked backflip the open collar edge can show at the bottom of the view; no held-item-specific first-person animation beyond the shared rig; not tested on a phone.

## F. Earlier open items
- TODO Flip-video pass leftovers: camera jump diagnosis, frame-rate replays, Inward/Bri + flip continuity evidence.
- TODO Checkpoint 4 screenshots (longboard wall, rack storage, preview) and Checkpoint 4 tests.
- TODO Checkpoint 5: B Hill downhill map (always named "B Hill").
- TODO Checkpoint 6: cross-system regression pass.
- TODO '90s Camcorder filter (Settings -> Graphics), works with first person.
- TODO Physics acceptance: remaining 35 NOT_RUN scenarios.
- KNOWN Pre-existing failing suites: browser, advanced, addendum, memorial, polish.

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
