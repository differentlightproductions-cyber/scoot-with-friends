# Domain and multiplayer pass — 2026-09-24

## Source / baseline
- Source: Claude branch `claude/relaxed-pasteur-g89vqc`, commit `9ec44843687b28f7769ab8c8507ea1b69a89df7e`.
- Working branch: `codex/lobbies-domain-repair`; isolated checkout. Original user changes preserved.
- Baseline: 184 unit tests passed. Production build passed (existing large-chunk warning).
- GitHub repository reports PUBLIC before this pass; visibility was not changed. Older private-repository notes are stale.

## Domain repair
- Before: Pages legacy/Jekyll, `main:/`, errored at Build with Jekyll. Main code older than current Claude branch.
- Changed: added manual `deploy-pages.yml` to main (commit `9cf1e496b3d4cf4329746462955b9025623ccb7f`); Pages source set to Actions.
- No automatic push deployment. Workflow accepts an explicit source ref, runs tests/build, publishes only `dist/client`, preserves CNAME and records source SHA in build-info.json.
- Deployment run 36071311844 succeeded. HTTP build-info confirms exact source 9ec4484.
- Namecheap account inspected: four @ A records 185.199.108.153–185.199.111.153; www CNAME differentlightproductions-cyber.github.io.; automatic TTL. No wildcard, parking, redirects or conflicting AAAA/CAA. DNSSEC off. Email Forwarding and SPF unchanged. DNS BEFORE = AFTER; no registrar edits required.
- Public DNS: five eforward MX records, SPF `v=spf1 include:spf.efwd.registrar-servers.com ~all`; preserved.
- GitHub UI: DNS check successful; exact HTTPS warning: “Unavailable for your site because your domain is not properly configured to support HTTPS (scootwithfriends.online)”.
- API DNS health conflicts with authoritative/public DNS (reports Cloudflare IPs); do not treat that stale/contradictory result as proof Namecheap is wrong.
- HTTPS currently certificate-name mismatch; no validation bypass. One documented custom-domain remove/re-save performed after successful deploy to retry provisioning. No repeated resets.
- HTTP www redirects to apex. HTTPS verification pending certificate issuance.

## Multiplayer
- Existing standalone Node/ws room server; Pages cannot run it. No repository or github-pages environment variable/secret configured for a room URL.
- Two independent Chrome clients passed movement, trick, bail, emote, chat, map transfer, reconnect. Third room isolation passed. No browser page errors.
- Implemented: capacity 8/default/LAN consistency, ninth-player rejection, swim/mantle/flip state replication, online Warehouse build synchronization and local Solid/Ghost.
- Missing from current code: shove/water-gun/throwable social gameplay itself; cannot claim network support for absent gameplay.
- Owner asked for inexpensive backend recommendation; Railway trial/Hobby recommendation given with current official pricing. No provider created or paid service activated.

## Remaining verification
- Certificate/Enforce HTTPS and HTTPS production browser checks.
- Final networking tests and build; 3/4/8 simulated load with honest device limits.
- Deploy room server only after provider authorization; internet multiplayer not yet proven.
- Preserve screenshots in ZIP; update this record with final results.

## Verified checkpoint
- Final post-clear unit suite: 185/185 passed; room TypeScript check and bundle passed. Production game build passed (existing chunk-size warning). Windows/LAN package rebuilt successfully.
- Two browser clients plus late join passed Warehouse placement, movement/rotation, owner-only deletion/clear, server rejection of unauthorized edits, Ghost visual-only collision/height behavior, Solid restoration, and personal save restoration on leaving.
- Phone D-pad hold, BUILD toggle and room chat in MESSAGES passed in desktop Chrome.
- Eight simulated WebSocket clients at 20 Hz each received 40 full snapshots; about 694 KiB/s aggregate localhost downstream. Ninth rejected. This is not an eight-browser frame-time or internet test.
- Hardware: Windows 10.0.26200, Intel i5-13500, 32 GB RAM, Chrome 153.0.8010.53. No physical phone/controller or different-network test performed.
- Evidence: artifacts/network/load-results.json and artifacts/network/network-browser-screenshots.zip.

## Account availability
- Existing Sites /api/account/session returns JSON 200. Its DB binding and existing account/save/session tables remain intact.
- Live disposable-account check passed registration, session, logout, login and session. Test cleanup failed because the simple test client replaced its session cookie with an unrelated response cookie; one random check_ test account remains. No player account was altered. Test cookie handling corrected afterward; do not claim deletion passed.
- New GitHub Pages domain /api/account/session returns HTML 404. Static Pages cannot execute the existing D1 account service. Do not treat a room-server deployment alone as fixing accounts.
- Replaced misleading local-copy error with a truthful service-unavailable state. Account UI offers the existing account-enabled game and retry, and explains that device-only progress does not transfer between origins automatically.
- Browser check passed unavailable state and successful retry restoring the sign-in form. This is a temporary route to the existing service, not new-domain account integration.
- Domain HTTPS still fails certificate-name validation. No credentials should be entered on its HTTP address. Existing Sites HTTPS remains available.
- Owner chose Railway and created a Trial account. Repository-scoped GitHub App authorization is prepared for confirmation; no paid plan activated. Proper new-domain account integration and internet room hosting remain outstanding.

## Railway deployment (completed after owner setup)
- Owner approved pushing tested commit 576833d867a61b31ba57c44f600d2fe74b04ade9; branch codex/lobbies-domain-repair pushed successfully. This report's subsequent operational notes remain local.
- Reused owner's Railway project adaptable-hope, service scoot-with-friends. Project fcebfd33-3841-4955-97bc-13cb89fee7bf, service d1ae1cf2-17c3-4300-be14-55aa4b3f9800, production environment 43339096-68cf-4cb7-b1ab-2ccfcdac001e.
- Build npm run build:rooms; start npm run start:rooms; /health; ROOM_HOST=0.0.0.0; PORT=8787; ROOM_CAPACITY=8. Allowed origins: canonical HTTP/HTTPS and existing Sites HTTPS. Remove canonical HTTP after HTTPS works.
- One US West replica, serverless off. Automatic GitHub deploys disabled and verified after selecting tested branch. No paid plan or billing activated; dashboard says 30 days/$5 trial credit.
- Deployment 92d74832-f7bb-4dd9-8411-5130a95077e9 ACTIVE; public https://scoot-with-friends-production.up.railway.app/health returns 200/protocol2.
- Real public WSS check passed with simulated Node clients: create/join, correct chat sender, other-room isolation, emote and pose snapshots, eight members, ninth rejected. Chat observed at 45 ms in this short test. Temporary rooms cleaned. See artifacts/network/railway-results.json.
- GitHub Pages VITE_ROOM_SERVER_URL configured to wss://scoot-with-friends-production.up.railway.app. Manual publication requested for exact full SHA; initial abbreviated-SHA checkout failed before any build/deployment, retried with full SHA.
- The room server intentionally does not implement account registration. Account integration on the custom domain is still separate unfinished work.
- Corrected Pages run 36074447349 succeeded, publishing exact commit 576833d867a61b31ba57c44f600d2fe74b04ade9 with the Railway endpoint. Previous working Sites release remains unchanged.

## Play / operate
- Current Windows/LAN copy: releases/Scoot-with-Friends-Windows.zip (84,093,974 bytes). This is the built game with its bundled local/LAN runtime. Its ordinary local browser mode does not use production accounts.
- Internet frontend: http://scootwithfriends.online (HTTPS still blocked by certificate mismatch). PLAY → PRIVATE FREE-RIDE → CREATE PRIVATE ROOM, then COPY INVITE; friend chooses JOIN ROOM. Account service is absent on this origin.
- Existing account-enabled game: https://scoot-with-friends.nicsoundcloud22.chatgpt.site/ . Existing Sites build has not yet received the new protocol/room endpoint, so do not advertise internet rooms there.
- Railway dashboard: https://railway.com/project/fcebfd33-3841-4955-97bc-13cb89fee7bf/service/d1ae1cf2-17c3-4300-be14-55aa4b3f9800?environmentId=43339096-68cf-4cb7-b1ab-2ccfcdac001e
- No payment is currently needed. Trial stops after its time/credit allowance; paid Hobby is optional and remains the owner's action. Do not promise a hard $5/month spending cap.
- Controller/mobile public acceptance remains incomplete while the canonical origin lacks HTTPS. Do not disable browser security or weaken secure account cookies to work around it.
- Production browser automation confirmed the exact published build with no page errors, but its first-time starter/menu navigation did not yet establish a two-browser room. Public backend socket tests passed; full production browser invite flow remains unverified. Local two-browser game tests passed separately.

## Phone friends checkpoint � September 24
- Added FRIENDS inside the existing phone: guest profile/code, requests, online/offline presence, explicit lobby invites, room controls, mute and local-player teleport.
- Reused existing chat and marker safety checks; personal marker remains unchanged. No riding physics, art, accounts, inventory or currency changes.
- Full suite: 188 tests passed (185 previous + 3 social). Production game and room builds passed. Existing large-chunk warning remains.
- Two isolated Chrome clients at localhost:5183 / room port 8788 passed complete phone flow: requests, accept, presence, create/invite/join, one remote rider each, teleport, chat, leave/rejoin without duplicates, offline detection. No page errors. Evidence artifacts/network/friends-phone.json and screenshot ZIP.
- New server social test verifies persistent links without stored credentials, invite permissions/locking/removal, and eight social+room client pairs behind one IP.
- Internet device testing remains outstanding for this social update. Desktop browser tests are not physical phone tests.
- Storage creation was blocked by automatic approval review as potentially billable; requested owner approval. Without ROOM_SOCIAL_FILE on a persistent volume, contacts reset on server restart and phone states this explicitly.
- Earlier port-8787 process was left untouched after review rejection. All current tests use separate 5183/8788 ports; Claude's work remains isolated.
- Windows/LAN player ZIP refreshed with previous copy preserved. GitHub and production service publication follow fresh owner confirmation; automatic deployment remains disabled.
