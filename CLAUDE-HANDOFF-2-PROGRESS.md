# Claude handoff 2 — progress

Branch: codex/claude-handoff-2. Checkout: work/claude-handoff-1 (isolated from Claude).
Base: 86dcadfccec11ce7780d39302623f2ab8d384fc5, combining handoff 1 with Claude eb8759d.

## Published first, as requested
- GitHub: codex/claude-handoff-1, exact 86dcadf pushed after fresh owner yes.
- Existing Sites: version 34, deployment appgdep_6ab5d6e32af88191958b3beb74199a74 succeeded.
- Railway: db030913-a1f4-4890-a187-7d8c175ec7a2 active/successful; source codex/claude-handoff-1, automatic deploy remains disabled.
- Game: https://scoot-with-friends.nicsoundcloud22.chatgpt.site/
- Windows ZIP refreshed; previous copy retained.
- Combined unit suite/build and six affected GPU browser suites passed. Full prior regression limits remain in REGRESSION-REPORT.md.
- Public Railway WSS smoke passed: guest join/poses, room isolation, throws/impacts, shoves, opt-out and forged-field rejection. Two independent Sites browser contexts loaded without page errors. These are same-machine clients over the public internet, not physical-device tests; production omits the development-only interaction hook.

## Ordered work
1. Touch settings: complete. Mirror, optional haptics, sizes, opacity, reset and input-safe live preview. TypeScript and 13 profile/i18n tests pass; browser checks pass at 390x844 and 844x390, including persistence, unsupported haptics, no leaked input and >=44px rows. Screenshots inspected and bundled in artifacts/touch-settings/screenshots.zip.
2. Portrait layouts: complete; existing responsive CSS passed 50 screen-size cases at 390x844 and 360x740 (plus two clean page-error checks). No unnecessary CSS changes. Includes maps, trick book, settings, account forms, pause, unopened/revealed crates and shop. Screenshots bundled in artifacts/mobile-portrait/screenshots.zip. Desktop Chrome mobile emulation, not physical-device testing.
3. Main-menu tabs: complete. Six tabs reuse current pages; Locker exposes ride and rider editors; Shop browses Techno Gravity directly. Keyboard/controller navigation, draft locks, dialog ownership and backdrop hooks tested. TypeScript, three-size tab browser suite and touch regression pass. Review corrected a shop grid ordering issue and added coverage. Screenshots bundled in artifacts/menu-tabs/screenshots.zip.
4. Crate inventory flow: complete. Saved crates open from CRATES or the phone's ITEMS/MISSIONS pages. Earning crates shows a compact toast without forcing an opening. Explicit Open All serializes existing transactions, prevents duplicate opens, caches results for review and stops safely on failure. Actual authored part previews reuse the existing renderer without changing the loadout. Input stays owned by the overlay. Browser checks: 13/13 inventory cases, 9/9 existing rewards cases, six actual part previews; screenshots inspected and bundled in artifacts/crate-inventory/screenshots.zip.

## Final verification and delivery
- Full npm test, TypeScript, production build, LAN build and room-server build passed. Production build retains the existing large-chunk warning.
- Final portrait audit: 52 records, zero failures, including all six tabs. Desktop Chrome emulation only; physical phone/controller testing remains unverified.
- Windows ZIP refreshed after the final production changes; previous working ZIP retained.
- Riding/physics, models, materials and scene graphics unchanged. No edits in Claude's checkout. Historical unrelated browser regressions remain documented in REGRESSION-REPORT.md.
- Handoff 2 is ready for publication to the existing Sites project. GitHub push requires a new explicit yes for this completed update; the earlier approval was used for combined commit 86dcadf.
