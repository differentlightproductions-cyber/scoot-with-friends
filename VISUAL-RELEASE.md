> Superseded by [CURRENT-RELEASE.md](CURRENT-RELEASE.md). The active tested and publicly deployed source is now work/complete-update, version 0.9.0-alpha.1.

# Current playable art release — 2026-09-14

The public release is built from `work/art-release`, local branch `codex/stylized-art-release`, commit `a4200efed85b6f1384aafc87b4644404ea509f8a`, based on the previously published `3243805e96b890e3251340105df54505820c043f`. Version is 0.8.0-alpha.2. Sites saved version number 12 is `appgprj_6aa66922745c81918111d622cae1d66c~appgver_4c0ddec0122c819182a4d85e151f485f`; publication succeeded. Public page and the new hashed game bundle returned HTTP 200, and both new scooter/clothing revision markers were verified in the served bundle.

The main working directory on `codex/complete-riding-update` retains earlier unfinished gameplay changes. Do not reset or discard them. The art changes were also copied there, but the release intentionally excludes its pending physics/input/scoring/camera changes. Merge or reconcile the published art branch before the next Sites push so its history and art are preserved. Do not force-push past this release. There was no GitHub push. User requires a fresh request and explicit yes before any future GitHub push.

Public game: https://scoot-with-friends.nicsoundcloud22.chatgpt.site/?map=outdoor

Updated portable copies are `releases/Scoot-with-Friends-Windows.zip` and `releases/Scoot-with-Friends-Owner-Windows.zip`; previous copies remain backed up. The player copy serves successfully and reports local admin disabled. Never commit owner-private credentials or portable archives.

The complete comparison report is `artifacts/art-direction/index.html`. New reference-based Lazer scooter assembly, weighted rider clothing, detailed hands/face/shoes, park surface/furniture/foliage art and fidelity settings are in this release. Build, original 32 unit tests and 54 art integration checks passed. Shared assembly, colorway geometry, grip alignment, bounded deformation and unchanged collision identities/timestep were tested. All published physics/input/trick/grind/player/core/camera source remains unchanged from the prior public release.

Matched desktop test: Windows Chrome 153 headless, NVIDIA RTX 4060 Ti / Direct3D11, i5-13500, 1440x900, 90 steps including 10 warm-up, blocking GPU pixel read. Before / Low / Medium / High medians 4.3 / 4.7 / 4.8 / 5.0 ms; 95th 7.1 / 6.4 / 7.0 / 7.7 ms. This is a short local controlled comparison, not a sustained phone/controller test. SwiftShader software rendering was substantially slower. Earlier `art-review.mjs` submission timings and its drifting quality screenshots are not appropriate matched performance evidence; use `scripts/art-paired-review.mjs` and `artifacts/art-direction/paired/metrics.json`.

Known separate gameplay issue: published RS gesture recognition can misclassify an instantaneous down-to-up sample with no intermediate neutral sample as a sweep. The art acceptance test uses a physically sampled neutral transition. Do not claim this existing gesture issue is fixed by the art release. Earlier Techno Gravity, mobile, currency and broader gameplay backlog is also not claimed complete.

