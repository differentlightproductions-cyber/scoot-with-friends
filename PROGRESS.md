# Release progress — 2026-09-21

- Source: GitHub `origin/claude/bugfix-pass`, ea8c5856480b21c19ab8bc115dc47c7446c68eb2. User confirmed this matches their local game.
- Working branch: `codex/claude-release-lan`. Other checkouts remain untouched.
- User budget: maximum 3 percentage points from reported weekly usage 38%; stop before 41%, allowing for delayed reporting. No other project's budget applies.
- Efficiency: Caveman-lite and Ponytail active. RTK 0.49.0 filters verified (Git-log sample: 14 estimated tokens saved). Headroom MCP 0.37.0 sample: 3909 to 2421 tokens, 1488 saved; exact original retrieved. These are tool measurements, not account savings. Headroom proxy unreachable; no authenticated traffic rerouted.
- Claude baseline unit/service suite: passed via RTK. Read-only review found no other high-confidence save/catalog/network blocker.
- Clamp repair: closed continuous split sleeve with inner wall and slit caps; same shared assembly for shop previews and equipped scooters. Physics untouched.
- Publishing blocker: music adds about 38 MB of already-compressed MP3s; current build embeds every asset into the Worker as base64. Requires supported external/static media delivery with MIME/range handling before safe publication. Do not publish an oversized Worker or silently remove music.
- LAN implementation remains preserved in `../private-multiplayer`: two-client relay/unit checks passed previously; not yet a packaged or physical-device-tested release. Do not advertise internet multiplayer.
- Final checks: unit/service suite passed after clamp change; TypeScript passed; Vite and server builds passed. Server output measured 62,140,786 bytes, unsuitable for this existing embedded-asset deployment design. Double/triple clamp renders inspected successfully; PNGs bundled in artifacts/clamps/Clamp-previews.zip.
- Windows ZIP built with Claude's features and clamp fix. Root release ZIP refreshed with prior copy preserved. No LAN integration in this ZIP; earlier LAN source remains intact.
- Usage closeout: reported 40% weekly, versus 38% baseline. Stopped with margin before 41%; reporting is rounded and may lag.
- Next: move music to supported static/object delivery with audio MIME and Range support, then publish existing Sites project. Live site remains version 21. GitHub push is not authorized for this pass.
