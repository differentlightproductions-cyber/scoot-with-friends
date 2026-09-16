# Checkpoint 2 — re-entry, flip-completion assist, Flair naming

Verified by `tests/checkpoint2.test.ts` (11 unit tests) plus the existing
`flip-landings` browser suite. Automated only; no controller playtest.

## Flair and Front Flair

Naming now follows the movement the rider completed, not the obstacle they left.

| Movement | Name |
|---|---|
| Backflip + ~180 body turn | **Flair** |
| Frontflip + ~180 body turn | **Front Flair** |
| Backflip + 360 / 720 | Backflip 360 / Backflip 720 |
| Frontflip + 360 / 720 | Frontflip 360 / Frontflip 720 |

`flairContext` (the confirmed quarter return) is still recorded as metadata and
still gates `Bri Air` / `Inward Air`, but it no longer gates Flair. The existing
`flipNameTolerance` handles "approximately 180"; nothing is snapped to fit a
name. `recognized` reports `flair` / `front-flair` so the two are distinguishable
downstream.

The previous unit test asserted the old rule by name ("Flair labels need … a
confirmed quarter return context") and was rewritten, since the spec explicitly
supersedes it.

## Flip-completion assist

A nudge onto a landing the rider could actually have reached — never a rescue.

**It acts only when all of these hold:**

- predicted contact is within `flipAssistWindow` (0.55 s)
- the player has eased off — input below `flipAssistInput` (0.35), or released
- a whole revolution is genuinely reachable given the current rate
- budget remains

**It never acts when** the player is still driving the rotation (strong input in
the direction of travel) or deliberately braking it. A double flip remains fully
achievable on held input and draws nothing from the assist.

**How the target is chosen.** Progress is measured against the *receiving
surface*, not world level, so a banked ramp counts as level rather than as
rotation still owed. The assist then picks between the revolution in progress
and the one already completed — whichever the current rate can still arrive at.
It therefore never insists on stopping at the first revolution, and never
fabricates a missing half flip.

**Authority is deliberately small.** The correction the assist can apply is
`min(flipAssistRate × timeToContact, remaining budget)`. At a typical 0.3 s to
contact that is 0.72 rad/s against a maximum flip rate of 6.8 — about a tenth.
A landing further off than that is simply not reachable and is left alone.

The first implementation used `flipAssistRate` itself as the reachability
tolerance, which was wrong: the assist can only shift the rate by
`rate × time`, so it advertised authority it did not have.

| Constant | Value | Meaning |
|---|---|---|
| `flipAssistWindow` | 0.55 s | Only inside this long before predicted contact |
| `flipAssistRate` | 2.4 rad/s | Ceiling on the rate it may request |
| `flipAssistBudget` | 0.9 rad/s | Total rate adjustment one attempt may draw |
| `flipAssistInput` | 0.35 | Above this the player is still driving |

Position assistance (the re-entry envelope) and angular assistance (this) have
independent budgets and cannot stack: `reentryMaxCorrection` bounds one,
`flipAssistBudget` the other. The assist adjusts body rotation only and never
touches travel velocity, so the trajectory is unchanged.

Reset on every `begin()`, so nothing carries between attempts.

## Quarter re-entry

The bounded envelope from the earlier repair pass is retained: transition-
relative rather than a world sphere, requires descending into a real curved
support surface, rejects clear overshoots, hard-caps the correction at
`reentryMaxCorrection`, leaves tangential speed untouched, and yields to any
steer or lean input.

**Added this checkpoint:** the assist now requires the receiving surface to
belong to a **quarter** — either the one the rider left (`airQuarter`) or one
they are dropping into. Box clears and spine transfers previously satisfied the
generic "curved transition" test and could receive quarter-return behaviour;
they no longer do.

Takeoff itself was corrected in the earlier pass: both natural rollout paths
share one bounded calculation, cutting outward travel roughly in half at speed
(ratio 0.209 → 0.115 at 17 m/s) while the vertical share rose (0.978 → 0.993).
Plane speed is conserved, so this is redirection, not added height.

## Not done

- No physical-controller playtest.
- The assist is tuned against synthetic rates, not felt in play; `flipAssistRate`
  and `flipAssistBudget` are the two values to move if it feels weak or grabby.
- Flair/Front Flair naming is verified at the resolver. The in-game HUD path is
  covered indirectly by `flip-landings`, which still passes.
