# Owner request backlog (Claude worktree `claude/bugfix-pass`)

Every owner request that is not finished, in working order. Updated as work lands.
Status: TODO / IN PROGRESS / DONE (commit).

## A. Riding feel (latest messages, 2026-09-17)
- DONE (ef9036a) Crooked/angled landings: ride away (absorb the angle) instead of sliding out.
- DONE (ef9036a) Fakie landings near max speed must need steady LS to hold; fakie steering feels reversed (camera sees the rider's front).
- DONE (ef9036a) Fakie steering keeps auto-reverting to forward; require a distinct LS input to revert.
- DONE (ef9036a) Drop-in / quarter entry with a light spin tap forces 360s/540s; spin guidance must not add turns the player did not ask for.
- DONE (ef9036a) Spin rate slightly slower (360 through 1080).

- DONE (ff23356) Quarter-pipe access stairs: remove the unwalkable connecting board; one simple stairset beside the left of the quarter nearest the big box and the right of the quarter nearest the parking lot.

## B. Customization and shop organization
- TODO Customize (pause Sesh menu) lists owned parts only; unowned parts are bought in the shop first.
- TODO Brand-first multipage menus: Brand -> category -> parts in readable columns; shop shows unowned, customize shows owned; no long scrolls.
- TODO Preview / draft / committed loadout separation; no preview leaking into equipment; apply without repeated refreshes; latest-request guards.

## C. Coping stability, re-entry, grinds (Coping/Mobile prompt 1-7, 16)
- TODO Record coping failures with replay buffer; single arbitration of pop/grind/stall/re-entry; no stacked boosts; extreme-state guard with diagnostics.
- TODO Same-wall re-entry targets the transition below coping with logged small budgets.
- TODO Always-on grind assist: remove the player toggle, migrate stale Off saves, developer-only off baseline.
- TODO Angled deck-slide capture on rails, benches, ledges, small-box hub; hysteresis; same-feature recapture inhibit.

## D. Controls (Coping/Mobile prompt 10-15)
- TODO Presets: Normal (default) A push / X tailwhip / B barspin; Goofy X push / A tailwhip / B barspin; versioned migration; Arcade exception kept; hints/animations agree.
- TODO Controls -> Test Controller view; mobile controller mapping investigation (unconfirmed report).
- TODO Controller focus scrolls mobile menus (time-based repeat).
- TODO Mobile-only Xbox-style touch controls (Auto/On/Off, size, opacity, preview) through the same input pipeline.

## E. First-person mode (First-person prompt)
- TODO Settings -> Camera: Third/First Person, FOV, Camera Motion Reduced/Full; local head hiding; camera follows body not scooter; crash camera policy; on-foot look; persistence; screenshots ZIP.

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
