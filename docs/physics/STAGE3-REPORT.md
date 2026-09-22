# Stage 3 grind, box and manual physics report

Date: 2026-09-21

## Status

| Area | Result |
| --- | --- |
| Grind capture | IMPROVED — production rail/ledge captures, sweeps and clear misses passed |
| Angled grind tolerance | IMPROVED — angled/rotating-equipment fixtures passed without widening invalid capture |
| Obstacle penetration | FIXED — both sides of the full small-box ledge stayed clear in the sampled visual geometry |
| Coping grind vs air conflict | FIXED — verified existing Stage 2 behavior; no Stage 2 retune |
| Rail trick-out | FIXED — one pop, forward rail momentum retained, no same-edge recapture |
| Large-box charged pop | FIXED — verified existing production fixture |
| Large-box charged trick | FIXED — charged barspin, tailwhip, Bri and Inward fixtures passed |
| Manual | FIXED — broad gentle-RS entry, immediate response, catch and pop-out passed |
| Nose Manual | FIXED — entry, catch and pop-out passed |
| Trick → Manual | FIXED — hop and tailwhip catches passed |
| Manual → Trick | FIXED — Manual and Nose Manual each transitioned into exactly one pop |

## Demonstrated fix

The right small-box ledge reproduced one real failure. While RS was loading, a short contact at the joined incline/deck region made the rigid-body solver report reversed velocity. The blocked-grind guard released before the upward RS stroke, and the later exit had no pop and reversed momentum.

The fix keeps collision active. A transient joined-surface contact may persist for 0.2 seconds, still below the existing 0.3-second trapped-grind acceptance limit. When a rail pop begins, rail direction, grind speed and lateral speed are now the authoritative exit velocity. Grind exits skip box/quarter launch redirection and receive 0.12 m of vertical separation before ordinary collision resumes. This produced one pop and retained forward momentum on both ledge sides.

## Existing systems verified

- `findGrind` remains the single capture implementation. It filters speed, height, approach alignment, convergence, intent score and underside/wrong-side attempts.
- `Simulation.captureGrind` uses current and one-fixed-step-ahead probes, plus wheel-end probes for intentional attempts.
- Solid ledges use the existing scooter underside envelope and contact seat; G01 measured no penetrating sampled scooter vertex.
- Grind motion retains projected speed along the rail, slope gravity and gradual friction. G03 verified chained ledge segments, ends and low-speed release.
- Normal gameplay still forces grind assistance on in `src/main.ts`; the developer field remains available to tests only.
- Manual input retains separate deadzone, gentle manual band and deep preload band. No manual or input implementation rewrite was needed.

## Important tuning changed

- `grindBlockedTime`: 0.10 → 0.20 seconds.
- Grind pop clearance: 0.06 → 0.12 m for grind exits only.
- Grind exits now derive velocity from the active grind state and bypass ramp/box lip redirection.

## Files changed

- `src/core/config.ts`
- `src/physics/simulation.ts`
- `tests/physics-acceptance.browser.mjs`
- `tests/repair-pass.browser.mjs`
- `docs/physics/STAGE3-REPORT.md`

## Tests actually run

- Stage 2 quarter baseline: 9/9 charged RS quarter attempts passed at 10.2, 11 and 12 m/s; fakie coast/push/downhill checks passed.
- Focused Stage 3 production replay: B01-B08, G01-G06, L02 and L07 — 16 passed, 0 failed. Artifact: `artifacts/physics/acceptance-63ba1bb+dirty.json`.
- Manual/repair replay: 65 checks passed, including Manual/Nose Manual entry, balance response, hop catches, tailwhip catch, and Manual/Nose Manual pop-out.
- Focused G03/G06 iterations were run while isolating the joined-surface failure; the final consolidated run supersedes them.
- Integrator ran the complete npm test suite and npm run build after parallel edits: both passed.

## Known limits

- These were deterministic headless Chrome replays at the fixed 1/120-second physics tick, not a physical-controller feel test.
- Manual → grind and grind → Manual were not rerun in this focused pass. The state ownership paths were inspected, and no special combo scripting was added.
- A different legitimate rail capture after a rail pop remains outside G06; same-edge recapture rejection passed.
- Representative production fixtures were used rather than every park object.

## Local launch

```powershell
cd "C:\Users\NickO\Documents\ChatGPT\Scooter Rider\work\claude-release-lan"
npm run dev -- --port 5186
```

Open `http://127.0.0.1:5186/?map=outdoor`.
