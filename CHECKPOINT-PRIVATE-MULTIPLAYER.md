# Crash recovery checkpoint — 2026-09-14

Working branch: feature/private-multiplayer. GitHub push remains on hold.

Crash changes: bounded fall rotation, protective arm/knee pose, contact-based damping, resting without automatic recovery, A after rider support, two fresh A presses within 650 ms skip crash and get-up delay using existing local safe recovery. A new bail clears an older get-up timer.

Also staged from preceding repair work: narrower grind assist, natural close contacts, LS grind balance, RS pop exits with same-rail release filtering, body flips from all valid airborne origins, larger feedback. Full riding attachment acceptance (especially locomotion) remains unfinished.

Checks: baseline 40/40 unit tests and production build pass. Updated unit suite 40/40 passes. Browser crash-items regression passes flat, quarter, box, rail and slope rest/recovery; rapid A skip after repeated crashes; held-item persistence. Windows desktop Chrome only. No physical controller/mobile/network tests claimed.

Stage 2 multiplayer is NOT implemented. Worktree prepared and ws dependency installed only; no room service or online UI exposed. Checkpoints A–F remain pending. Next: implement validated room protocol/server and two-client remote actors before adding social, reconnects, claims or extra maps. No live network service provisioned. Existing solo release remains playable.
