# Browser regression report — 24 September 2026

The initial local browser pass attempted all 79 `tests/*.browser.mjs` suites present then: **54 pass, 22 fail, 2 timeout, 1 unverified** after targeted reruns. The later Claude integration added two browser suites; the combined checkout now has 81, and its six affected suites passed. The other 75 were not rerun after that integration. Every sweep process had a 65-second cap. Detailed output is in `artifacts/regression/*.browser.mjs.log`; `summary.json` records the initial sweep and `summary-integrated.json` records the combined-source checks.

The tests ran in headless Windows Chrome against the local game on port 5184. The 79-suite sweep used two workers; the final four affected suites passed again sequentially after localization was complete. Chrome reported **ANGLE / NVIDIA GeForce RTX 4060 Ti / Direct3D11** in the replay suite. The sweep used temporary same-directory test copies to route old hardcoded dev ports to 5184 and remove flags forcing SwiftShader. Those temporary copies were removed after each run; original test logic remained otherwise intact. The server had HMR disabled during the final sweep. Live-account coverage is a separate production-site probe.

With the local game running, repeat the bounded pass using `node scripts/test-browser-sweep.mjs`; pass suite names to run a subset, for example `node scripts/test-browser-sweep.mjs replay weather`. It runs one browser at a time by default; `BROWSER_WORKERS=2` opts into two workers. Use `node scripts/replay-memory.browser.mjs` for the 60/120/180-second buffer measurement. Both scripts accept `LAZER_URL` and `BROWSER_EXECUTABLE`. The sweep writes per-suite logs and JSON results under `artifacts/regression/`.

## Combined-source affected checks

The existing game on port 5184 and room service on 8789 were tested sequentially after integrating Claude's `eb8759d` update. The runner confirmed **ANGLE / NVIDIA GeForce RTX 4060 Ti / Direct3D11** and all six processes exited successfully. This checks the combined code without changing gameplay or art.

| Suite | Result | Checks |
| --- | --- | --- |
| `weather.browser.mjs` | PASS | 21/21, including new sky weather checks and visible setting values |
| `underwater.browser.mjs` | PASS | 7/7, swimming and underwater view |
| `litter.browser.mjs` | PASS | 8/8, binning, prompts, and local litter cap |
| `early-quarter-pop.browser.mjs` | PASS | Charged pop matrix completed with exit code 0 |
| `i18n.browser.mjs` | PASS | Locale switching completed with exit code 0 |
| `network-playful.browser.mjs` | PASS | Remote shove, opt-out, and NPC-local behavior completed with exit code 0 |

## Replay performance

- Real riding sequence: the compact buffer measured approximately **997 KB per minute** by extrapolating from a short first/third-person ride. This is below the suite's 3 MB target.
- Browser simulation of an idle outdoor session with a 60-second history: **305,282 bytes / 1,800 samples** at 60 seconds; **312,180 bytes / 1,801 samples** at 120 seconds; **314,638 bytes / 1,801 samples** at 180 seconds. These are the buffer's approximate retained-byte counts, not total JavaScript heap measurements; movement can make a larger delta stream.
- On RTX 4060 Ti in the final source rerun, saving a trimmed replay with thumbnail took **61 ms**. Exporting a four-second, 2,297,353-byte WebM took **5,463 ms**. Replay passed 17/17 with a clean process exit. No replay production-code change was warranted.

After localization settled, sequential direct runs of replay (17/17), settings-ui, ui-polish, and weather (18/18) all exited successfully. The preceding two-worker retry reached its checks but its Chrome processes exceeded the 65-second shutdown cap; `artifacts/regression/summary-final-direct.json` records the clean sequential outcomes. The PNG/JPG evidence is bundled in `artifacts/regression/browser-screenshots.zip`.

## Test repairs and remaining work

- `settings-ui.browser.mjs` now waits for destination loading before pressing Escape and checks the current gradient backdrop. It passes; the pause overlay did open once loading finished.
- `ui-polish.browser.mjs` follows the starter RIDE IT flow, opens the current RIDER screen, checks seven current presets, and keeps the pause state frozen. Direct rerun passes.
- `weather.browser.mjs` checks stored weather/time values and the visible selected values in the menu rows. It passed 18/18 after locale edits and 21/21 after the later weather integration.
- `surfaces.browser.mjs` now restores the original renderer method correctly, allowing the full suite to finish. It still fails three surface/friction/track assertions; no physics or art code was changed.
- `friends-phone.browser.mjs` passed after its stale room-port expectation was repaired by the networking test owner. The sweep's earlier failure is superseded.
- `build3.browser.mjs` now claims the starter setup before the menu checks; 42 menu/save assertions pass. A legacy quarter-spin assertion still fails. That fixture never calls `Simulation.pop`, so it does not exercise the new early-pop path.

Remaining failed suites include legacy physics and world assumptions (addendum, advanced, bri-integration, build2, checkpoint1, memorial, pitch-reach, polish, stage2-quarter), art/contact assertions (avatar-pose-review, art-direction, rider-contact), and old UI/editor/shop expectations (bumper-attempts, editor, mobile, menu-focus, music, riding-focus, shop). The report records the failures without weakening the checks or changing gameplay. `music-stream` requires `MUSIC_BASE_URL`. `bri-motion` and `ramp-assets` exceeded the 65-second cap. The live account test timed out waiting for cloud-save confirmation on the existing public site; that result does not test this local branch. The handoff mentioned `minimap.browser.mjs` and `trick-tracker.browser.mjs`, but those files were absent and could not be run.

## Per-suite result

| Suite | Result | Follow-up |
| --- | --- | --- |
| account-unavailable.browser.mjs | PASS |  |
| accounts-live.browser.mjs | UNVERIFIED | Live site reached login, then timed out waiting for cloud save; local branch not exercised. |
| addendum-controls.browser.mjs | PASS |  |
| addendum.browser.mjs | FAIL |  |
| advanced.browser.mjs | FAIL |  |
| art-direction.browser.mjs | FAIL |  |
| asset-swap.browser.mjs | PASS |  |
| avatar-pose-review.browser.mjs | FAIL |  |
| bhill.browser.mjs | PASS |  |
| box-seam.browser.mjs | PASS |  |
| bri-air-return.browser.mjs | PASS |  |
| bri-integration.browser.mjs | FAIL |  |
| bri-motion.browser.mjs | TIMEOUT |  |
| build2.browser.mjs | FAIL |  |
| build3.browser.mjs | FAIL | Starter fixture repaired; 42 menu/save checks pass, later 180° quarter-spin assertion still fails. |
| bumper-attempts.browser.mjs | FAIL |  |
| character-poses.browser.mjs | PASS |  |
| checkpoint1.browser.mjs | FAIL |  |
| checkpoint3.browser.mjs | PASS |  |
| clamp-grab.browser.mjs | PASS |  |
| cloud-save.browser.mjs | PASS |  |
| complete-update.browser.mjs | PASS |  |
| crash-items.browser.mjs | PASS |  |
| decade-visual.browser.mjs | PASS |  |
| decade.browser.mjs | PASS |  |
| display-mode.browser.mjs | PASS |  |
| early-quarter-pop.browser.mjs | PASS |  |
| editor.browser.mjs | FAIL |  |
| first-person-view.browser.mjs | PASS |  |
| fit-camera.browser.mjs | PASS |  |
| flip-landings.browser.mjs | PASS |  |
| flip-spin-quarter.browser.mjs | PASS |  |
| footprints.browser.mjs | PASS |  |
| friends-phone.browser.mjs | PASS | 8 stages on local 5184/8789; separate agent rerun. |
| friends.browser.mjs | PASS |  |
| headlamp.browser.mjs | PASS |  |
| i18n.browser.mjs | PASS |  |
| item-world.browser.mjs | PASS |  |
| items-input.browser.mjs | PASS |  |
| lip-launch.browser.mjs | PASS |  |
| memorial.browser.mjs | FAIL |  |
| menu-focus.browser.mjs | FAIL |  |
| mobile.browser.mjs | FAIL |  |
| music-stream.browser.mjs | FAIL |  |
| music.browser.mjs | FAIL |  |
| network-playful.browser.mjs | PASS |  |
| network.browser.mjs | PASS |  |
| new-riding.browser.mjs | PASS |  |
| novelties.browser.mjs | PASS |  |
| now-playing.browser.mjs | PASS |  |
| outdoor-art.browser.mjs | PASS |  |
| phone.browser.mjs | PASS |  |
| physics-acceptance.browser.mjs | PASS |  |
| pitch-reach-visual.browser.mjs | PASS |  |
| pitch-reach.browser.mjs | FAIL |  |
| polish.browser.mjs | FAIL |  |
| pop-flow.browser.mjs | PASS |  |
| ramp-assets.browser.mjs | TIMEOUT |  |
| repair-pass.browser.mjs | PASS |  |
| replay.browser.mjs | PASS |  |
| rewards.browser.mjs | PASS |  |
| rider-contact.browser.mjs | FAIL |  |
| rider-shadow.browser.mjs | PASS |  |
| rides-screen.browser.mjs | PASS |  |
| riding-focus.browser.mjs | FAIL |  |
| sesh.browser.mjs | PASS |  |
| settings-ui.browser.mjs | PASS |  |
| shop-fit.browser.mjs | PASS |  |
| shop.browser.mjs | FAIL |  |
| snow.browser.mjs | PASS |  |
| stage2-quarter.browser.mjs | FAIL |  |
| stance-push.browser.mjs | PASS |  |
| surfaces.browser.mjs | FAIL | 3/6 after restoring real renderer; all five surfaces retain 5.8 m/s and no tracks appear. |
| ui-polish.browser.mjs | PASS | Current starter flow and seven rider presets; direct rerun. |
| visual-detail.browser.mjs | PASS |  |
| warehouse-build.browser.mjs | PASS |  |
| warehouse-room.browser.mjs | PASS |  |
| water-tricks.browser.mjs | PASS |  |
| weather.browser.mjs | PASS | 21/21 on combined source; stored and visible setting values checked. |
