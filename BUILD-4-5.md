# Sunset refinement, traversal and advanced tricks

Implemented in the existing game; original maps, menus, markers and customization remain.

## Sunset Plaza 02

Both quarter pipes share the same 26 m width and exact centerline, with 3.6 m high circular transitions. The connected center is now **small box / spine / large transfer**: the spine and small box physically exchanged lanes. Their profiles, coping, collision and practice starts moved together. The large transfer has a steep north launch, a short top and a long gradual south landing. The spine has two coping edges only 0.25 m apart.

Natural lip departure rotates existing momentum instead of adding a fixed hop impulse. Low-speed approaches roll back; speed determines air height. A narrow transition-only rail clearance window prevents valid uphill crossings snagging coping while terrain and ordinary rail collisions remain active. Ground-normal projection retains speed through clean transitions; gravity supplies drop-in momentum. Full-height drops clear all three central features without pushing when aligned; slower approaches can land short and faster ones can overshoot. Actual A-button bunny hops remain separate player input.

## Traversal and drop-ins

- On foot, A immediately jumps with current running momentum and limited air steering. Surface-aligned running slows on steep transitions.
- A near a reachable platform uses a short upward/forward mantle, with a safe destination check. It does not send the rider to arbitrary high decks.
- Near quarter coping, face the transition and press Y. The scooter perches in **DropInReady**. Gentle forward LS changes balance without releasing. Pulling back restores balance; B returns to standing with the scooter.
- Strong forward input crosses the commitment threshold. The scooter tips continuously into the ramp and hands movement back to normal gravity-driven riding. No fixed exit speed is assigned.
- Main-menu Settings selects and locally saves Regular or Goofy. Feet, pushing foot, preview stance, natural whip direction, trick names and rewind foot contacts respond to stance.

## Trick controls

| Input in air | Result |
|---|---|
| X / LB+X | Existing positive/negative whip directions; stance determines Tailwhip versus Heelwhip |
| LT or RT + X | Fingerwhip with hand reach and slower initiation |
| LB/RB during 65–90% of an active whip/bar rotation | Contextual reversal, only opposite the current direction; LB left, RB right |
| Repeat alternating bumpers in later windows | Further Whip, Heel or Bar Rewinds |
| RS circle/sweep, clockwise or counterclockwise | Bri Flip / Inward Bri, interpreted relative to stance |
| RS side → lower half-circle → opposite side → neutral | Kickless scoop |
| Y | No-hander |
| Y + RS up / down | Tuck No-hander / Superman |
| Y + RS left/right | Can Can to that side |
| RB+Y / both bumpers+Y | One Foot / No Foot |
| LT+Y | Deck Grab |

Release body poses in time to recover before landing. Incomplete scooter rotations and unreturned poses affect landing quality or bail. Hold X/B still allows continuous rotations; taps and caught sequences retain their existing behavior.

The resolver stores signed angles, actual reversal points/directions/sides, stance, independent bri/kickless angles, completed motion order and body poses. It recognizes Whip/Heel/Bar Rewind chains and actual whip → bri → whip as Buttercup. Existing Truck Driver and Downside rules remain; unmatched combinations retain component names. F3 includes stance, leading foot, natural direction, current channels, reversal counts/windows and gesture diagnostics. H contains the control reference.

## Validation and scope

Real-browser tests cover both directions through every central lane, speed-dependent quarters, gravity-only transfers, running jump, climb, drop-in preparation/abort/commit, 180/540 returns, live repeated rewind inputs, gesture tricks, body-pose recovery, reset cleanup and local stance persistence. Unit tests cover angular deceleration/reversal, five repeated rewinds, invalid inputs, gesture tolerance and naming.

Run `npm test`, `npm run test:browser`, `npm run test:build2`, `npm run test:build3`, and `npm run test:advanced` with the preview running on port 5174. Reports are in `artifacts/`.

Umbrella, Rotor Whip and Bartwist are not claimed as implemented: these were optional in the earlier expansion brief and need distinct, verified mechanics. Rider flips remain deferred under the counterweight brief. No fake aliases were added for these tricks. Physical controller hardware feel and rumble still need hands-on testing; browser checks exercise the standard Gamepad API.

Terminology references: [Scooter Resource trick dictionary](https://forum.scooterresource.com/threads/trick-dictionary.4917/) describes finger initiation, bri rotation and rewind reversal; [INDO rewind tutorial](https://indotrickscooter.com/blogs/indo-trick-school/how-to-rewind) builds on tailwhip/heelwhip; [Scooter Resource origin discussion](https://forum.scooterresource.com/threads/invented-tricks.7041/page-8) identifies Buttercup as whip–bri–whip. Heelwhip remains the familiar name for the opposite whip direction rather than prefixing every trick with “Opposite.”
