# Build 2 completion

| Request | Implemented result |
|---|---|
| Fakie/revert | Velocity-relative states, light-steer preservation, deliberate smooth revert, preserved momentum |
| Analog slow/fast spins | Nonlinear torque and driven ceiling, modest airtime scaling, retained 540/720 capability |
| Stationary camera | Automatic yaw follows meaningful travel, not stationary rider spins |
| Rail physics | Physical colliders and rail-only rider guard; recoverable clips, severe-impact bails, valid-grind priority |
| Named combos | Central Truck Driver and Downside resolver; retained raw signed rotations, states and catches |
| Trick-line animation | Fast component reveal followed by resolved name; reduced-motion support |
| Walking/running | Y ground dismount/remount; LS walking; LS click runs while carrying scooter |
| Held tricks | Continuous X/B spins, single-tap rotations, release-to-catch, names for separately caught sequences |
| Fakie points | Actual Fakie label, held duration, stacking base points, banking and bail loss |
| Ramp physics | Rearward stance, bounded center-of-mass energy exchange, lean-directed takeoff retaining motion along coping |
| Softer grinds | Help entering contact; retained entry yaw and offset; gentle angle adjustment |
| Brake mapping | LT is the ground brake; B controls air barspins |
| Stairs/pushing | Five square physical treads with contrasting risers/nosings; smooth lift/plant/push/recovery foot path |
| Walking camera | Corrected orbit axes; no forced recenter while walking |
| Secondary map | Photo-inspired outdoor quarters, split central ramp and ledge, dark sides, wooden fences, coping, landscaping |
| Sunset coping | Transition-aware pop before collision; charged/uncharged launches return into the same quarter with 180/540s |

Tuning is centralized in `src/core/config.ts`. Actual movement/contact checks are recorded in the three browser reports under `artifacts/`.

Opposite body/deck motion uses Downside naming, including 360 Downside variants. Hurricane is treated as grind terminology, not an aerial synonym. Sources: [Paul's scooter trick guide](https://www.paulsbicycleshop.com/Scooter-Tricks.html), [Scooter Resource grind dictionary](https://forum.scooterresource.com/threads/the-grind-dictionary-and-discussion-thread.71658/), [360 downside discussion](https://forum.scooterresource.com/threads/decade-vs-360-whip.10114/).

Continuous rotations retain Double/Triple naming. Complete catches followed by new rotations use readable “to” sequences, not special names inferred solely from button counts. Rider usage includes repeated Bar Bar combinations: [Taj Shambrook biography](https://tajtajtaj.co/pages/about-taj). Conventions vary; raw measured components remain available for refinement.

The brief made second-wave tricks and full flips conditional on time after core fixes. They remain deferred. The later counterweight addendum explicitly reserves full flips for a future update.
