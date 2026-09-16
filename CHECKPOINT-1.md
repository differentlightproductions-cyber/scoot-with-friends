# Checkpoint 1 — speed consistency and jump-on mounting

Automated input traces against the real `Simulation` (`tests/checkpoint1.browser.mjs`,
16 checks). No physical-controller playtest has been run.

## What actually caused inconsistent speed

Three distinct causes, none of which was "the maxSpeed constant is too low".

**1. Surface projection preserved speed on some maps and not others.**
Each grounded step projects velocity onto the support plane, removing the
into-surface component. The magnitude was then restored — but only under
`if (this.rampWorld && ...)`. `rampWorld` is true outdoors and in Techno Gravity
(which has layout objects) and false in the warehouse, so the *same slope* bled
speed on one map and preserved it on another. This is the single largest source
of the complaint. The restore now applies on every map. On flat ground the
projection removes nothing, so it remains a no-op there.

**2. The protective ceiling scaled the whole velocity vector.**
`if (this.velocity.length() > 28) this.velocity.setLength(28)` rescaled X, Y and
Z together. Measured before the fix, an airborne `(0, 12, 26)` became
`(0, 11.61, 25.42)` — a third of a metre per second of climb removed in a single
step, mid-flight. It is now applied to horizontal travel only and eased rather
than clamped, so it cannot shorten a jump or bend a trajectory.

**3. One constant served three unrelated jobs.**
`TUNE.maxSpeed` set the push ceiling *and* the running-mount cap. They are now
separate, named values. `maxSpeed` no longer exists.

Frame dependence was **not** a cause: the simulation runs on a fixed 1/120 step
behind an accumulator, and identical input produced identical speed to within
1e-6 across repeated runs.

## Measured values

| Measurement | Before | After |
|---|---|---|
| Flat-ground pushing asymptote (40 pushes, lakeside trail) | 11.31 m/s | **13.72 m/s** (+21.3%) |
| First five pushes from rest | 2.45 / 4.39 / 5.93 / 7.14 / 8.10 | unchanged early, higher ceiling |
| Coasting loss | 0.1 m/s per second | unchanged |
| Repeatability, identical input | exact | exact |
| Airborne `(0, 12, 34)` after one step | Y pulled to 11.61 by the clamp | Y = 11.875 (gravity only) |
| Ordinary running mount | 7.29 m/s | 7.29 m/s (unchanged) |
| Running jump-on | — | **8.30 m/s** |

Rolling drag is a constant deceleration (0.1 m/s²), not proportional to speed.
That is unchanged, and is why coasting barely slows; noted rather than altered,
since changing the drag model would move ramp and pump feel.

**Downhill is not separately capped.** The gravity-earned tier is limited by drag
against slope rather than a third constant, so a legitimate descent is never
abruptly erased. The current maps contain no sustained descent to measure —
the steepest existing drop-in peaked at **9.8 m/s**. This tier will only be
properly exercised by B Hill.

## Speed tuning — single source of truth

All values in `src/core/config.ts`, metres per second. Only the HUD converts.

| Constant | Value | Meaning |
|---|---|---|
| `pushMaxSpeed` | 14.6 | Push contribution falls to zero here, so this *is* the usable pushing maximum |
| `extremeSpeed` | 30 | Protective ceiling on horizontal travel |
| `extremeSpeedResponse` | 2.4 | How quickly travel eases back under that ceiling |
| `mountSpeedCap` | 8.6 | Running-mount cap; identical in effect to the old `maxSpeed * 0.72` |
| `push` / `pushCadence` | 2.5 / 0.46 | Unchanged |
| `rollingDrag` | 0.1 | Unchanged, constant deceleration |

Minimum speed is zero. Braking reaches a complete stop and a stopped rider is
not pushed back into motion. There is no positive minimum-speed clamp, and
signed backward travel still registers as `Fakie`.

## Jump-on mounting

Walk or run carrying the scooter, jump with the existing on-foot jump, come down
on the deck, ride away. No new button.

Jumping while carrying releases **that same scooter instance** ahead of the rider
as a rolling deck; `hasScooter` stays true throughout and nothing is duplicated.
The deck rolls at `jumpOnRoll` (0.8) of the rider's speed, so the gap closes
during the jump — releasing it at the rider's exact speed held it permanently out
of reach, which is why the first implementation armed but never caught.

A jump near the scooter is not a mount. All of these must hold:

- the rider is **descending** (never at the apex)
- horizontal distance to the deck within `jumpOnCaptureRadius` (0.8)
- the deck is within `jumpOnCaptureHeight` (0.55) below the feet, and not above them
- travel broadly agrees with the deck's heading (`jumpOnAlignment`, 0.55)
- the deck is unobstructed
- `jumpOnRearm` (0.45 s) has elapsed, so each attempt needs a fresh approach and jump

| Constant | Value |
|---|---|
| `jumpOnLead` | 0.55 |
| `jumpOnRoll` | 0.8 |
| `jumpOnWindow` | 1.6 s |
| `jumpOnCaptureRadius` | 0.8 |
| `jumpOnCaptureHeight` | 0.55 |
| `jumpOnAlignment` | 0.55 |
| `jumpOnRunSpeed` | 3.4 |
| `jumpOnBoost` | 2.3 |
| `jumpOnRearm` | 0.45 s |

The bonus is fed by **horizontal approach only** — falling faster never becomes
forward speed — is applied once per attempt, and is capped at `pushMaxSpeed`.

| Case | Result |
|---|---|
| Running jump-on (approach 6.4) | mounts at **8.30** |
| Ordinary running mount (approach 6.4) | 7.29 |
| Walking jump-on (approach 3.2) | mounts at 3.2, no bonus |
| Standing hop | mounts at 0, no bonus |
| Jumping away from the deck | misses, stays on foot |

A released deck and its rearm timer are cleared on respawn.

## Not done in this checkpoint

- No physical-controller or device playtest; automated traces only.
- The rider pose on a successful jump-on reuses the existing landing compression
  (`landTimer` / `landingCompression`). A dedicated feet-to-deck, hands-to-grips
  animation is not yet authored; `jumpOnLanded` is exposed for it.
- Downhill tier unmeasured for want of a sustained descent.
