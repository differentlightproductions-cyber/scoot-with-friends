# Release progress — 2026-09-21

## Current physics pass

- User authorized a new independent maximum of 15 percentage points. Baseline weekly usage 42%; absolute ceiling 57%. Aim to finish below 56% to allow reporting delay and final saving.
- Brief: Downloads/01_Scooter_Physics_Research_and_Implementation.md. Work follows M0 evidence, M1 quarter/box baseline, then contact/rotation/griptape gates.
- Smaller agents assigned read-only acceptance audit (Sol) and griptape audit (Luna); integration owner retains physics/source edits.
- No new GitHub push or deployment permission inferred from the physics document. Existing publication remains blocked by embedded music payload.
- M0/M1 repair: reset now clears the previous Bri takeoff timestamp. The stale-contact guard requires a nonnegative age and an airborne rider; restart support timestamps use the restarted clock. Previously, a Bri followed by a restarted Inward run could lose support and fail even though the standalone Inward passed.
- Acceptance tightened: same-quarter touchdown; alternating halfpipe walls and center crossings without bails; real box clearance, part movement and catch; Bri/Inward signed progress, continuity and confirmed result. After repair: 53/53 automated scenarios pass (headless Windows Chrome, software rendering, fixed-step replay). Physical controller/device tests remain unverified.
- Diagnostic history now retains actual equipment/orientation and release/analog input state, plus the latest 30 landings before velocity/part reset.
- Read-only follow-up: longboard grip is correctly hidden below raised truck mounting hardware; no geometry change warranted. Coping collision filtering still has overly broad rail exemptions; investigate pair-specific contact and wrong-side descent before claiming M2 complete. M0's full contact-pair/catch geometry contract is not yet complete.
- Existing-site music delivery is being moved to the already provisioned PARKS storage, with owner-authenticated upload and byte-range playback. No new resource, DNS change, or GitHub push is authorized by this work.
- Music delivery implementation passes focused range/auth/upload checks (3/3), the existing music UI journey passes 24/24, and the full unit/service suite and TypeScript pass. Server output is now 11,705,060 bytes; local/Windows copies retain all seven tracks. Upload and hosted playback verification follow deployment.
- Real pre-reset catch angles are now used by acceptance assertions; all 53 physics checks still pass. Windows copy refreshed; root backup is `releases/Scoot-with-Friends-Windows.pre-physics-20260921.zip`.

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

## Latest release status (supersedes earlier delivery blockers)
- Sites version 22 successfully published clamp/physics updates and all seven music files. Static hosting serves audio directly; no R2 upload needed. Removed unused experimental music routes/uploader.
- Hosted MP3 Range requests return full bodies; active-track Blob playback fixes seeking. All seven hosted tracks passed playback/seek checks; local music UI 24/24 passed. Full unit suite, TypeScript, client/server builds passed after this change.
- Tripo prompt/color pack prepared with original reference photos. Both wooden quarters requested. Original Tripo geometry and UVs preserved in Blender derivative; final visual integration pending verification.
- Usage latest 53% against 42% baseline and 57% ceiling. No GitHub push.

- Both fitted original Tripo quarters are opt-in only via ?map=outdoor&tripoQuarter=1. Default visuals preserved. Final fit/overlap/rail-height visual review remains before enabling by default; original vertices and UVs retained. Fit report and Blender script/source are in artifacts/ramp-import. Updated client/server build and Windows package pass.
- Version23 deployed successfully: appgdep_6ab1948cb0f881918d6adf33b4bfcb62, commit69f36666c7b295ff8739efec117d788fe83cf231. Live URL unchanged. Windows root copy refreshed, previous preserved. Reported usage54% (12 points above42 baseline, below15-point cap). Both quarters remain opt-in pending visual approval. GitHub untouched.

## Ramp replacement repair
- New user limit: remaining3 percentagepoints. Verified start55%; hardceiling58%, preserve release before ceiling.
- Priority: remove old visible terrain in replaced footprints, correct facing, inspect small-box source, test and publish. Day/night and accumulating reflective snow requested but not yet implemented; don't claim them complete.

- Owner added10 further percentagepoints: task ceiling now68% from55 baseline. Use margin for packaging/publication. Blender inspection must reject overlap, backwards-facing profiles, holes/missingwood, and material artifacts before normalrelease.

## September 21 fitted ramp release (supersedes opt-in status)
- Original Tripo quarter, small box, large box and hub sources retained untouched in Downloads. Blender derivatives preserve source textures/UVs; profiles fit existing colliders. Both wooden quarters enabled by default; old riding skins hidden only after successful model loads. Correct opposing orientations. Small box remains middle, large left, spine right; hub beside small box.
- Browser derivatives: quarter 101,988 triangles; small 116,012; large 116,790; hub 117,186. Large-source decimation occurs before deformation to preserve its roof. Source-detail limits remain: stretched source texture on the elongated large landing is not newly authored high-resolution artwork.
- Day/Sunset/Night/Sunrise/Snow available through Settings > Time of Day. Snow accumulates visually with flakes and surface glints. Existing riding physics unchanged.
- Validation: full unit/service suite, TypeScript, client/server builds pass. Physics acceptance 53/53. Five fitted instances pass sampled vertical surface checks, max discrepancy 0.086m; visual review found and repaired the open quarter-side appearance. Desktop Chrome software rendering only; physical mobile/controller tests unverified.
- Original prior Windows release preserved; refreshed player ZIP and existing Sites publication follow. No GitHub push authorized or performed. Current rounded usage65%, task ceiling68%; reserve remaining margin for delivery.
- Owner follow-up: removed both temporary quarter access stairsets and handrails, including stair terrain support. Former stair samples now return ground height zero. Other park stairs are preserved.
- Final quarter-edge repair: mask includes the 0.125m terrain interpolation fringe; flat apron strips replace that visual sliver. Screenshot verified no remaining gray slope at the quarter side. Usage66% before publication, below68% ceiling.
