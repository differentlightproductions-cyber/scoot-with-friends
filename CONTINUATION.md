# Current release — 0.8 complete

Scoot with Friends 0.9 is live at https://scoot-with-friends.nicsoundcloud22.chatgpt.site . Existing Sites project appgprj_6aa66922745c81918111d622cae1d66c only. Public audience authorized.
Source 0674bbf34ab12392ee8e0d759b6b846deecffde5 is deployed successfully. The current player and owner Windows ZIPs were refreshed after this build; the prior 0.7 ZIP remains preserved.

New behavior: a loaded RS bunny hop only pops after RS returns at least 90% up; sideways movement cannot trigger it. The main-menu Trick Book and H guide state the inputs for each implemented trick. The BMX dirt track now rebuilds its visible sand and collision shape from terrain brush edits. The editor keeps Terrain / Paths open, explains that BMX sand is terrain rather than a movable item, and includes Focus BMX terrain to frame it and select a safe lower brush for clearing the sidewalk.

Verified this update with the full 28 unit tests, the focused addendum browser check, TypeScript production build, and refreshed portable packages. The initial non-escalated build failed only because the sandbox denied esbuild access; the exact build passed with normal runtime permission.
Source pushed and deployed: 5d687d76be7813ac6796dea97df2fb221ed87088. Deployment appgdep_6aa73191d03c8191b2f735541280c8ef succeeded, environment revision 1.

Playable friend ZIP: releases/Scoot-with-Friends-Windows.zip. Private owner ZIP: releases/Scoot-with-Friends-Owner-Windows.zip. Extract and use Play Scoot with Friends.cmd or Owner Editor.cmd respectively. Previous 0.7 remains preserved at releases/Scoot-with-Friends-0.7-Windows.zip.

Implemented mandatory grounded/editor addendum: trick-initiated grounded pops, local crash recovery, Pro/Arcade profiles, water entry/recovery, full basic park editor, transforms and dimensions, undo/redo, named saves and JSON import/export, terrain brushes and curved paths, test ride/return. Owner edition can edit existing park assets including trees and dirt track; public players cannot publish. Owner Publish to Public Game uses local server-held permission and authenticated Worker/R2 storage, keeping prior layout backup. Never include owner-private.json in public files or friend ZIP; do not print its value.

Checks passed: 28 unit tests, 71 core browser checks, 67 Build 3 checks, 44 Memorial checks, 390 polish checks, 10 addendum checks, 21 editor checks, real packaged owner UI test. Actual owner Publish button successfully published unchanged baseline Veterans Memorial Park (zero added objects and zero base edits), and public saved layout was verified. The first attempt failed because the sandboxed local server had no network access; restarting the same packaged server with approved network access passed, no app changes needed. Public browser refresh queued through open_in_codex existing tab.

Current running owner edition localhost5199 (session20420), Vite5174 (session49986). Local owner server must have internet access to publish; local play remains available offline. Packages include bundled Node runtime. Friend edition contains no publishing permission.

Preserve wooden park geometry and lane arrangement: small box x=-4..1, large left, spine right. Brand remains Lazer. Solo game, no multiplayer claim.

Outstanding domain request: no custom domain attached or purchased; ownership question unanswered. Current public URL still includes account routing suffix. Do not claim scoot-with-friends.com is owned or live.
