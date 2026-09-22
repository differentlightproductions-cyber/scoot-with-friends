# Build 01 implementation and first-run verification

Every item below has an implementation in the shipped source. “Browser tested” refers to the actual local application and its Rapier world, not just TypeScript compilation. Contact fixtures place the rider before a specific contact; they do not replace collision or trick evaluation. Controller tests inject the standard browser Gamepad shape because a physical Xbox device is not available to this test runner.

| Requested first-run interaction | Implementation and verification |
|---|---|
| 1. Start the dev server | `npm install` / `npm run dev`; local Vite application launched and loaded |
| 2. Open the browser | Chrome loads Three.js and Rapier; rendered screenshots inspected; no failed resource requests |
| 3. Connect Xbox-style controller | Native Gamepad API discovery, clear connection status, standard mapping; simulated-device test, physical hardware pending |
| 4. Enter skatepark | A, Enter, or Ride button; minimal startup, immediate spawn |
| 5. Push | Discrete cadence-limited impulses with diminishing effect; tap-vs-hold and coasting tests |
| 6. Steer/carve | Speed-dependent yaw, gradual lateral grip, lean, fakie-aware steering; browser motion test |
| 7. Pump transitions | Timed compression/extension, rider crouch, bounded momentum gain; paired pumped/unpumped downhill runs |
| 8. Hold/release bunny hop | Charge, quick/full hop differences, coyote/buffer windows; grounded preload and ballistic release tests |
| 9. Perform 180 | Actual yaw integration and completed movement naming; normal-input browser line |
| 10. Perform 360 | Same integrated system; normal-input browser line |
| 11. Tailwhip | Independent torque-limited deck pivot; clean landed browser test |
| 12. Heelwhip | Opposite deck direction; clean landed browser test |
| 13. Barspin | Independent bar/fork pivot; clean landed browser test |
| 14. Rotation + tailwhip | Simultaneous body/deck channels; normal-input 360 Tailwhip test |
| 15. Land correctly | Clean classification, continuous momentum, sound/rumble event; real falling contact test |
| 16. Sketchy landing and recovery | Tolerant classification, speed loss, wobble, recovery state; live contact and ride-away test |
| 17. Bail on terrible landing | Severe sideways/unfinished/high-impact contact; live failed contact, tumble/slide and reset test |
| 18. Manual with Right Stick balance | Front-wheel lift, rear support pivot, deterministic balance, player correction and overbalance tests |
| 19. Nose manual | Reversed supporting wheel and balancing direction; entry and correction tests |
| 20. Grind rail/ledge | Flat rail approached using ordinary push/hop/RT; actual ledge and down-rail contact tests; assist on/off proximity tests |
| 21. Completed trick names | Event-driven movement detection; all initial families tested, unfinished rotations rejected |
| 22. Combo display | Air → manual → hop, grind → air, grind → manual; ordinary timeout and bail termination; no score |
| 23. Reset after crashing | View/R and automatic reset; out-of-bounds recovery and post-bail tests |

## Additional requested systems

- **540 and 720**: measured rotations, including a normal-input quarter-pipe line that lands a 720. No named spin animation buttons.
- **Doubles and body tricks**: double tailwhip, double barspin, no-hander, tuck no-hander, one-footer are browser tested. Numerical channels allow further rotations without a hard double cap; unit tests cover triples.
- **Four initial grind categories**: generic 50-50, feeble, smith and deck slide, selected from contact orientation/pitch rather than a name-selecting button.
- **Camera**: fixed-step position interpolation, smooth velocity/facing follow, look-ahead, controlled orbit, raycast obstruction avoidance, one-tap smooth recenter. Manual and airborne trick contexts suppress camera orbit. The camera does not spin with every airborne body rotation.
- **Scooter**: original Lazer Pro identity, compact deck, independent steering-axis deck pivot, independent bar/fork pivot, T-bar and grips, fork, headtube, clamp, rear brake appearance and rolling wheels.
- **Rider**: lightweight neutral humanoid, articulated limbs, push/preload/jump/lean/body-trick/landing/manual/grind/bail poses. No detailed character or ragdoll work.
- **Park**: flat, quarter pipes, banks, funbox, ledges, flat rail, down rail, stairs, hip, spine and small bowl; the continuous riding surface avoids separate overlapping ramp-bottom colliders.
- **Audio and rumble**: local synthesized sounds and optional feature-detected actuator effects; no copyrighted or remotely hosted assets.
- **Debug/reset/pause**: F3 diagnostics, H control guide, reliable View/R reset, menu controls and required pause options. Browser focus loss and controller disconnection pause the game.
- **Extensibility**: separate input, physics, rider, scooter, camera, tricks, balance, grind, event, audio and UI responsibilities. Central tuning and mappings. Simultaneous trick channels remain independent.
- **Deliberately excluded**: accounts, scoring, multiplayer, leaderboards, shops, customization, park editing/sharing, large world, advanced ragdolls, mobile, and the future trick list.

## Scope of validation

The production build and mechanics tests pass. `npm run test:browser` produces the exact check list and state snapshots in `artifacts/browser-report.json`, including a two-minute simulated stress ride with no NaNs or physics explosions. Graphics screenshots were visually inspected after fixing indoor shadow occlusion.

No automated report can establish how satisfying a physical controller feels. The remaining validation limits are physical Xbox/rumble testing, a real gaming-PC 60 FPS benchmark, and Firefox/nonstandard-pad testing. These are stated explicitly rather than claimed as completed hardware tests.
