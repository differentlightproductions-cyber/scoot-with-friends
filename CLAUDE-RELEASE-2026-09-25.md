# Published account, phone and private-room update — Claude handoff

Published September 25, 2026 UTC. Continue from private branch codex/claude-handoff-2; do not restart from the older codex/claude-handoff-1 branch.

Game/server source: 367e76987f7e4f89e6938dfa7f37c835dbf047e2.
Live game: https://scootwithfriends.online/
Sites version 37, deployment appgdep_6ab5fd22a3bc81919e86efaecdd59c51 succeeded with environment revision 3.
Railway source now tracks codex/claude-handoff-2. Room server: wss://scoot-with-friends-production.up.railway.app.

Included: room join/save-payload crash fix and visible invite controls; recovery email signup, verification, password reset, promotional consent; phone scrolling, app pages/order; Default/Grayscale/Earth palettes; angled quarter-air intent while preserving forward deck exits.

Resend domain verified. Sending-only replacement key is stored as Sites RESEND_API_KEY (secret); never put it in source/client configuration. ACCOUNT_EMAIL_FROM and ACCOUNT_SITE_ORIGIN are configured. Resend accepted the approved setup-test email. Inbox arrival and a real user's full reset-link flow remain unverified. Existing users must add and verify their email in Account before email recovery can work. Recovery codes remain supported.

Critical hosting detail: packaged Drizzle migrations were NOT applied automatically by Sites. Version 36 exposed this in a live reset-request test. Version 37 adds an idempotent additive schema initializer before auth queries (server/account-schema.ts). It preserves existing account credentials and handles concurrent isolates. Do not manually re-run 0002 SQL against an already-upgraded database.

Verified: full npm test and production build passed after migration fix; live session returns emailReady:true; live unknown-email reset request returns 200/ok (no email sent). Public Chrome smoke matched /assets/index-DkSZkwR6.js, all six main tabs navigated, zero page errors. Two simulated clients against the real Railway endpoint passed create/join, correct chat sender and reconnect without duplicate identity. This is an internet server check from one machine, not a two-device gameplay test. Local two-browser large-save/UI test passed previously; that dev harness cannot run unchanged on production because __LAZER is intentionally dev-only. Twelve focused quarter-air cases passed. Legacy Stage 2 browser script has nine unchanged baseline failures; see QUARTER-AIR-INTENT.md.

Windows release ZIP refreshed; older ZIP preserved. Detailed source changes: RELEASE-NOTES-ACCOUNT-PHONE.md and EMAIL-RECOVERY.md. Phone touchscreen viewport checks are simulated desktop tests, not physical phone/controller tests.