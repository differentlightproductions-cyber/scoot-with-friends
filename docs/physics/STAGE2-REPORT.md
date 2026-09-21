# Stage 2 quarter / halfpipe physics report

Date: 2026-09-21

## Status

| Area | Result |
| --- | --- |
| Coping extreme-launch bug | Verified existing behavior; no new fix in this pass |
| Upper-transition support | Verified existing behavior; no new fix in this pass |
| Takeoff trajectory | Verified existing behavior; no new fix in this pass |
| Same-wall re-entry | Verified existing behavior; no new fix in this pass |
| False landing crash | Verified existing behavior; no new fix in this pass |
| Halfpipe flow | Verified existing behavior in deterministic production-fixture replay |

No physics source was changed in this pass. The current checkout already contains the focused Stage 2 corrections, and all relevant production-fixture replays passed. Retuning a passing system would have violated the requirement to reproduce a failure before tuning.

## Baseline and implementation verified

- Physics engine: `@dimforge/rapier3d-compat` 0.19.3.
- Fixed simulation step: 1/120 second (`TUNE.step`), assigned to `world.timestep` before each Rapier step.
- Controller: a dynamic, rotation-locked, CCD-enabled Rapier rigid body. `Simulation` supplies surface following, launch ownership, contact filtering and landing classification.
- Ramp support: production `terrainHeight` / `terrainNormal` wheel-footprint sampling plus a downward Rapier support ray. Contact gap is measured relative to the local support normal, including steep upper transitions.
- Coping: physical park rails remain enabled. Only the rider's coarse rail guard is filtered during a valid lip crossing or same-wall air; terrain and real case contacts remain physical.
- Launch: `Simulation.recordLaunch()` records one natural departure. A coyote-window pop replaces that recorded departure from its pre-redirect velocity and keeps the same launch ID; later launch writers are rejected.
- Re-entry: the current implementation does not use a landing magnet. Same-wall context retains the source quarter for receiving-surface attitude and coping clearance. Touchdown requires actual contact against the local surface.
- Landing: impact is `-velocity dot surfaceNormal`; pitch and body alignment are measured relative to the receiving surface. A successful landing removes only into-surface velocity and retains tangential speed (GOOD keeps 97%; SKETCHY keeps 86%).
- Mounted RS remains on the existing riding/trick input path; this pass did not edit input.

## Reproduction and demonstrated causes

The three reported failures did **not** reproduce in the current checkout. The deterministic replay ran the current production rider against the current Veterans Memorial Park geometry. The diagnostic guard recorded zero extreme-state incidents, ordinary and charged RS airs had one launch ID and one pop event, same-wall returns touched the transition below coping, and valid re-entries graded PERFECT/GOOD. This pass verifies existing behavior; it does not claim to have reproduced and newly fixed the owner's intermittent failure.

Repository history identifies the source-level failures that produced the old behavior:

1. **Excessive outward quarter launch:** both natural departure paths independently allowed outward velocity up to 35% of normal-plane speed and increased it by 0.04 per m/s above the normal band. The shared `quarterRollout()` now bounds ordinary outward share to 0..14% with a 0.022 speed gain while conserving normal-plane speed. This changes the outward/upward split at the source; it does not change gravity, globally cap air velocity, or add height.
2. **Duplicate / stale launch contribution:** a natural lip release followed by a coyote-window trick pop previously behaved as two velocity writers. Current launch records make the pop a replacement from the recorded natural state with the same launch ID, rather than an added impulse. The pop contribution is applied once.
3. **False crash / bad contact on re-entry:** older contact and grading paths used an overly broad airborne contact band and lacked a GOOD landing band. Current touchdown uses the distance the rider can close during the current 1/120-second tick, classifies impact and pose against the local transition frame, and accepts normal recoverable error as GOOD. First-wheel then second-wheel contact is covered by the production replay and does not create a second grade.

The first abnormal writer for the historical coping/launch failure was therefore the quarter departure redirect (and, for the intermittent stacked case, the subsequent pop writer), not Rapier restitution or the emergency speed guard. Coping restitution remains zero. The safety guard remains diagnostic-only for ordinary quarter riding and did not fire.

## Exact tuning present and verified

- `transitionLipReleaseDistance`: 0.26 m
- `quarterRolloutRatioMin`: 0
- `quarterRolloutRatioMax`: 0.14
- `quarterRolloutSpeedGain`: 0.022
- `quarterLeanRatio`: 0.06
- deliberate platform-exit ratio: 0.26
- quarter re-entry coping-clear time: 0.25 s
- contact-relative airborne touchdown gap: max of 0.02 m or one tick of closing speed
- fixed step: 1/120 s

No tuning values were changed during this verification pass.

## Tests actually run

Command (with the local dev server on port 5186):

```powershell
$env:LAZER_URL='http://127.0.0.1:5186'
node tests/physics-acceptance.browser.mjs --only=Q01,Q02,Q03,Q04,Q05,Q06,Q07,Q08,L01,L02,L03,L04,L05
```

Result: **13 scenarios passed, 0 failed or errored**, with zero page errors and zero guard activations. Artifact: `artifacts/physics/acceptance-unknown.json` (the test could not label the artifact with a Git SHA because Git was not on the child process PATH; this did not affect simulation execution).

A dedicated charged-RS probe also ran **9 attempts: 9 passed, 0 failed**, using the production `InputFrame.ry` preload/release path rather than calling `Simulation.pop()`:

```powershell
node tests/stage2-quarter.browser.mjs
```

The attempts were exactly three each at 10.2, 11 and 12 m/s. At every speed, releases occurred at 0.50 m from the lip, 0.36 m from the lip (0.10 m before the automatic 0.26 m transition departure), and on the first coyote tick after natural departure. A grounded release at 0.10 m is impossible because automatic departure has already occurred, so the coyote case is the meaningful post-departure coverage. All nine attempts retained one launch ID, emitted one pop, stayed between 10.37 and 12.08 m/s maximum total speed, returned below coping on the source transition, and graded PERFECT. The largest airborne per-tick speed increase was 2.15 m/s during the bounded natural-to-pop replacement; no diagnostic guard fired. Artifact: `artifacts/physics/stage2-quarter.json`.

The focused total was **22 scenario/attempt results**: 13 broader acceptance scenarios plus 9 charged RS attempts. Several acceptance scenarios contain multiple internal fixtures or halfpipe cycles, but those are not inflated into the stated attempt count.

Coverage included:

- plain, angled and low-amplitude same-wall airs;
- regular/goofy and opposing quarter walls;
- low/medium/high quarter speeds represented across 10.2, 11, 11.5 and 12 m/s fixtures;
- deliberate platform exit;
- spine/transfer isolation;
- passive and pumped opposing-wall halfpipe cycles in both directions;
- near-vertical wood transition, shallower box lip and metal quarter support;
- surface-relative steep re-entry versus an equivalent flat slam;
- front-wheel-first and rear-wheel-first recovery;
- fakie return;
- one simple 180 regression within the angled-air fixture.

Negative cases remained negative: a deliberate platform exit was not pulled back, a real broadside coping/deck-side strike did not grade clean, a nearby unreachable target received no rescue, and spine transfer behavior remained separate from same-wall quarter behavior.

## Known limits

- These are deterministic headless Chrome replays at the fixed simulation tick, not a hands-on controller feel test or variable-render-rate coverage.
- Advanced Flair, doubles and compound scooter/body tricks were intentionally not tuned in Stage 2.
- The new upper-platform safety fences were outside this agent's file scope. Quarter surfaces and coping were unchanged, and the current platform-exit fixture passed with the updated production geometry.

## Local launch

```powershell
cd "C:\Users\NickO\Documents\ChatGPT\Scooter Rider\work\claude-release-lan"
npm run dev -- --port 5186
```

Open `http://127.0.0.1:5186/?map=outdoor`.
