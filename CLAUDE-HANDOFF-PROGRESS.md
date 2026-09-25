# Claude handoff — September 24, 2026

Base: `origin/claude/relaxed-pasteur-g89vqc` at `3c14a3f`.
Working branch: `codex/claude-handoff-1`. Claude's checkout is untouched.

## Changes

- Wire existing six-language tables into settings, pause, phone and playful prompts; persist the chosen language.
- Limit the early charged quarter-pipe correction to the upper transition. Preserve lower-transition behavior.
- Route player throws/shoves through the room service. Derive sender from the connection; validate proximity, launch velocity, readiness, map generation, cooldown, spawn protection, recovery and the receiver's contact preference.
- Remote throw visuals expire and cannot become inventory/pickups. Local NPC interactions stay local. Accepted hits reuse the existing reaction presentation.
- Preserve the stable guest friend code already merged in `c9c0dbe`; it remains browser-specific, not account-synchronized.
- Repair stale browser tests and measure replay storage/export on the available GPU. Detailed results belong in `REGRESSION-REPORT.md`.

## Verification

- Baseline unit suite passed. The first build overlapped an unfinished localization import; this is not recorded as a pre-existing failure. The final full unit suite and TypeScript check pass.
- New room-contact unit/socket tests pass, including isolation, forged senders, old-map rejection, opt-out and friends-only behavior.
- Production game, room-server and LAN builds pass. The built client opens in Chrome on port 5185 with Play visible and no page errors. Six-language key/placeholder tests and Spanish → Arabic (including saved reload/RTL) → English browser checks pass.
- Two actual Chrome contexts passed network throws, impacts, shoves, opt-out, and NPC isolation. Same-machine/local-server testing only; no new internet or physical phone multiplayer test is claimed.
- The early-pop GPU suite passed 36 approaches. The upper-zone scenarios land cleanly; lower-zone launch values remain unchanged. An older Build 3 spin-timing assertion still fails on natural quarter rollout, where the modified `pop()` path never runs.
- No graphics/model work. No DNS changes, live deployment or GitHub push performed in this checkout.

## Playable checkpoint

`releases/Scoot-with-Friends-Windows.zip` was refreshed (84,230,995 bytes). Older working copies in the other checkouts were preserved. This is the handoff checkpoint before the forthcoming Claude integration, not a live-site update.

## Local verification commands (PowerShell, two terminals)

```powershell
$env:VITE_ROOM_SERVER_URL='ws://127.0.0.1:8789'
npm run dev -- --port 5184
```

```powershell
$env:ROOM_PORT='8789'
$env:ROOM_ORIGINS='http://127.0.0.1:5184,http://localhost:5184'
npm run rooms
```

Run focused browser checks with `LAZER_URL=http://127.0.0.1:5184` and `ROOM_URL=ws://127.0.0.1:8789`: `tests/network-playful.browser.mjs`, `tests/friends-phone.browser.mjs`, `tests/i18n.browser.mjs`, and `tests/early-quarter-pop.browser.mjs`. Use the installed Chrome executable through `BROWSER_EXECUTABLE`/`CHROME_PATH` when needed.

## Room protocol addition

The existing protocol carries a generation-tagged `playful` envelope. Clients may request `ThrowItem` or `ShoveRequest`; the server derives identity and accepted strength, simulates a short throw trajectory, and emits `ItemImpact`. Client-reported impacts are ignored. `playful-contact` updates the receiver's preference; initial join/readiness also includes it. Old-map requests are rejected, and changing maps clears active throws and protection state.

## Boundaries

Room contact decisions use client-reported rider positions. This is unranked alpha networking, not cheat-proof physics. Throw flight is a short server trajectory against riders, not a full world collision simulation. NPCs, pickups and inventory remain local. Remote hits use existing brief reaction poses; no new combat or knockdown system.

Friend-list durability still requires an approved persistent Railway volume. Existing guest codes survive reloads; clearing browser storage creates a new guest identity.

The owner requested a push back, then explicitly asked us to wait for their "go": Claude is about to publish another GitHub update. Finish local verification, fetch that update only after the signal, integrate it in this isolated branch, and rerun affected checks before a push. The next task list has not arrived yet.

## Combined publication checkpoint

Owner gave go after Claude published eb8759d. Merged eb8759d without conflicts. Combined full unit suite, TypeScript and production build pass; affected weather (21/21), underwater (7/7), litter (8/8), early-pop, localization and network-playful browser suites all pass on RTX 4060 Ti. Windows package and Sites archive rebuilt. Owner requests GitHub plus live publication before starting codex-handoff-2.md; that second handoff is not started.
