# Current release — September 21, 2026 — version 30

- Website: https://scoot-with-friends.nicsoundcloud22.chatgpt.site
- Publication: succeeded; version 30 verified live on September 21, 2026 (01:52 UTC September 22).
- Source: c35915ee0af5c97d72f675fe7fa14a18508bf13c
- Private GitHub branch: codex/claude-release-lan (pushed with owner approval).
- Checkout: work/claude-release-lan.
- Deployment: appgdep_6ab1dea8218c8191a6f5d91f6d029a5c
- Windows copy: releases/Scoot-with-Friends-Windows.zip
- ZIP SHA256: 46E88AE73DA4AE2756A22E87676F8C2606F60E81E507A29EECC0D853BDF18318
- Previous version 28 and 29 Windows ZIPs preserved.

Includes Stage 3 grind-exit fixes, foot-contact whip rewinds, clearer owned colorways, lighter wood/clean silver, arm hinge improvements, and first-person body masking with 110-degree default FOV and crouch framing.

Verification: unit suite and production build pass; Stage 3 16/16 targeted cases and 65 repair checks; 48 anatomy poses; first-person Chrome/SwiftShader mounted/crouch/tailwhip/bri/on-foot pass at 1280x720. Real controller/device tests not performed this pass. Bri deck can naturally leave the camera overhead. Full-body shadows and third-person geometry preserved. First-person screenshot ZIP: work/claude-release-lan/artifacts/first-person-view/first-person-view-images.zip.

Remaining: ramp outlines; source character sleeve/finger/clothing fidelity, including visible sleeve cutoff edges in first person; manual-to-grind/grind-to-manual crossings not rerun. Online lobbies deferred by owner. Do not call art finished.

## Prior release record
# Current playable release â€” September 21, 2026

Game: Scoot with Friends. Parts brand: Lazer.
Play: https://scoot-with-friends.nicsoundcloud22.chatgpt.site/?map=outdoor
Source: work/claude-release-lan, branch codex/claude-release-lan.
Release commit: cc662a5089b41db2e6eaadf4e74ae6fa6e9000c4.
Sites version28: deployment appgdep_6ab1d163ffe481919a0b72196352adf4 SUCCEEDED; version28 is live.

## This update
- Removed terrain fringe and redundant pale aprons beside imported ramps. Original Tripo geometry, UVs and material maps preserved. Wood graded darker amber; baked atlas noise reduced.
- Christian: sole skin weights and measured ankle placement repaired; sleeve weights and stable arm frames repaired. Rigid scooter clearance applied before hand IK for Bri/Inward, Kickless and grab poses. Superman reach corrected. No riding-physics changes from visual corrections.
- Fakie: natural +0.4 m/s2 rolling scrub, no backward push impulse. Downhill gravity unchanged.
- Stage2 quarter / halfpipe production replays pass; no speculative quarter retuning.

## Verification
- npm test and complete npm run build passed. Existing Vite chunk-size warning remains.
- 47 pose samples: stationary soles at terrain; minimum tested torso/head/scooter clearance .006m; attached grip targets met in Bri/Inward/Kickless samples.
- Six imported ramp surface checks: no missing samples, maximum .086m deviation.
- Nine charged-RS quarter attempts pass; render-rate/hitch tests pass. Flat fakie8â†’6.5m/s in3s with/without push; downhill fakie gains speed normally.
- Headless Windows Chrome, software rendering. No new physical-controller or mobile-device testing. Source mesh wrinkles and extreme compound-pose fidelity remain limits; not claiming perfect art or universal animation coverage.

## Playable copy and rollback
Windows: releases/Scoot-with-Friends-Windows.zip (extract; run Play Scoot with Friends.cmd).
SHA256: F53CD977D0F3E341DEB511B9F698663884AB348280C88C8A27E395E8B7A65082.
Previous version27: releases/Scoot-with-Friends-Windows.version27-20260921.zip.
Review images: work/claude-release-lan/artifacts/anatomy-contact/Anatomy-contact-review.zip and artifacts/ramp-review/Ramp-dark-amber-review.zip.
Original Downloads models untouched. GitHub not pushed. Internet room/LAN hosting remain separate unfinished work.

Usage: baseline86%, latest91%, maximum95% for this run. Deployment succeeded; no further feature work planned.

