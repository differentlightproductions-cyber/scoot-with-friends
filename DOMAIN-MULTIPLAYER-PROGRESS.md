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
