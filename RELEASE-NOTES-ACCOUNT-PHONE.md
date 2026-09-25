# Claude handoff — email recovery, phone home, UI palettes

Status: LOCAL, NOT PUSHED OR PUBLISHED. Owner explicitly held the GitHub/server update. Do not infer approval from older pushes. Current branch: `codex/claude-handoff-2`.

## Changes in this pass

- Account signup collects a recovery email and a clearly optional, initially checked game-news preference. Existing accounts default to no promotional consent. Players can opt out in Account. No promotional email is sent.
- Resend verification/reset integration: verified email ownership, 30-minute hashed one-use tokens, rate limits, background reset delivery, fixed HTTPS link origin, token removal from the address bar, and transactional password/session rotation. Changing verified email invalidates old-address reset links. Recovery codes remain a fallback. No live email delivery is claimed.
- Phone home has six apps per page, previous/next controls, horizontal swipe and controller edge navigation. Edit Apps lets players move an app earlier/later; ordering persists on that device. Manual scrolling back to the clock/date no longer gets overridden by focus on each redraw.
- Settings → Graphics → UI Colors selects Default, Grayscale or Earth. Saves immediately in the main menu or Sesh, survives reload, and updates phone colors. World rendering and product colorways are untouched.

## Earlier local fix included in this branch

`7662d85` fixes oversized multiplayer appearance packets, server WebSocket error handling, and the room-connected/code/invite screen. It remains unpushed under the same owner hold. See `ROOM-CONNECTION-FIX.md`. Railway still needs this source update; these local UI changes do not fix the running room server by themselves.

## Verification

- Full `npm test`: passed; `npm run build`: passed.
- `tests/ui-palette.browser.mjs`: passed in desktop Chrome, including saved reload and paused Sesh setting.
- `tests/phone-home.browser.mjs`: passed in Chrome with a simulated 390×844 touch viewport; pages, swipe, controller-style input, return-to-top persistence, app ordering and grayscale phone rendering.
- Auth tests use SQLite and mocked Resend; include verification/reuse, old-session revocation, old-email invalidation, provider failure preserving prior token, and transactional rollback.
- Focused auth/cloud checks: 4/4 passed, including a delayed-send `waitUntil` test. `tests/account-email.browser.mjs` passed: default checkbox/uncheck submission, token removal retaining map, reset recovery-code display, usable return-to-login, and signed-out verification completed after login. Browser account responses were mocked; no live email was sent.
- Broader legacy phone browser test passed its first four checks, then stalled in software rendering and was stopped. No physical phone/controller or live email delivery test was performed.
- Palette screenshots: `artifacts/ui-palettes/screenshots.zip`.
- Windows playable copy: `releases/Scoot-with-Friends-Windows.zip`; previous ZIP preserved. Hosted email accounts are not provided by the offline launcher.

## Resend / deployment requirements

Owner chose “Prepare Resend setup” and then explicitly approved email DNS, a restricted key, secret storage in Sites and one setup-test email. Resend is now signed in; `scootwithfriends.online` is verified using the provider's TXT `resend._domainkey` and CNAME `rsend` / `send` records. Website records and existing mail forwarding were preserved. A sending-only key scoped to this domain was created. No paid service was purchased and no test email has been sent yet.

The two non-secret Sites settings (`ACCOUNT_EMAIL_FROM`, `ACCOUNT_SITE_ORIGIN`) are saved in environment revision 2. The key itself is NOT stored yet: automatic approval review blocked revealing/exporting it, so the next step is direct secret entry in Sites settings. The owner has been asked to sign into ChatGPT in the browser for that handoff. Keep the existing Resend key dialog open; do not create duplicate keys or paste credentials into chat/Git.

Remaining provider step: store the existing domain-restricted key as the secret `RESEND_API_KEY` in the existing Sites project, then send the approved setup-test email to differentlightproductions@gmail.com without exposing the key. Domain creation and DNS verification are already complete; do not repeat them. Details: `EMAIL-RECOVERY.md`.

The additive `drizzle/0002_account_email.sql` migration is required before the new Worker handles accounts. Build copies migrations to `dist/.openai/drizzle`; ensure the release archive includes that migration directory (the repository's root `.openai` contains only hosting.json). Verify migration/deployment support before publishing. Never publish the new Worker against the old schema.

After authorized deployment: test real verification/reset delivery using an owner's chosen test account, confirm old sessions stop working, and confirm legacy account login/cloud saves still work. Keep the current live release available until those checks pass.

## Follow-up: quarter-pipe air intent

See `QUARTER-AIR-INTENT.md`. Deck rollout used forward speed/lean but ignored diagonal approach. A small alignment fade now preserves straight forward deck exits and turns diagonal approaches back toward the wall. Sustained side input during rise/near apex can redirect a deck-bound quarter air toward the transition. Focused browser checks passed 12/12 across both opposing wood quarters, including real flip/turn input. The old Stage 2 browser script fails 9/9 identically on unchanged HEAD and on this patch; its baseline was tested and restored byte-for-byte. No model, UI controls or unrelated physics change in this follow-up.
