# Rider and Bri update — 2026-09-14

Changes: rider-centered sunlight shadows on all fidelity levels (512/1024/2048), less washed-out daytime fill, stable thigh/shin orientation, reachable lower-stem carry contact in rider space, finite finger curl with grip clearance, correct handle tube diameter, continuous Bri/Inward motion and valid quarter-return Air names.

Verified: 47 unit/service tests; frontend production build; 43 browser Bri gesture/mid-flip/tilted-catch checks; four real simulated quarter returns (Bri Air/Inward Air, regular/goofy); 38 riding regressions; standing/running arm reach; close-up rendered hands; actual rider-shadow pixel differences at two locations across all three graphics presets. Previous 12 side/front/gameplay Bri motion captures remain under artifacts/bri-motion. Browser automation uses desktop Chrome on this Windows machine, not physical mobile/controller testing.

Scope limits: this is a targeted repair, not completion of all historical requests. Private multiplayer remains same-machine tested with no approved internet room host. Warehouse networking, full controller room dialogs and account onboarding are still pending as documented in MULTIPLAYER.md. No GitHub push authorized or performed.
