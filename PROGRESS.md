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
- New spinebc.glb received (original untouched); repair missing metal entry strip, optimize and fit spine next. Source inspection began, not published.
- Owner reports green pieces below ramps, small-box side overhang, and messy wood. Requests consistent clean wood finish, overriding prior preserve-all-texture preference. Next: inspect vegetation/base-ground showing through masked footprint; close correct concrete base; bound source side protrusions; apply consistent wood while retaining metal and source geometry.
- Existing usage ceiling68% reached. Work paused pending requested additional allowance. Existing public version24 and Windows copy remain intact. No new repair claimed complete.
- Spine/clean-finish continuation authorized: baseline68%; target70%; hard ceiling71.5%. Reuse supplied models, repair entry metal, eliminate visible substrate/side overhang, consistent plywood finish; publish only after checks.
- Continuation: repaired spine source entry plates, optimized ~98k triangles; corrected axis-conversion winding. Original source remains untouched. Six-instance browser acceptance required before release.
- Consistent clean plywood shader removes source normal/AO discoloration, uses common grain/panel spacing, preserves neutral metal/hardware. Box normals follow existing analytic surfaces to avoid stretched shading.
- Root verified/fixed actual terrain masking: added independent spine mask, expanded box masks by .125m fringe, placed continuous concrete substrate beneath wood park. This removes green base showing through and procedural box-edge protrusions; physics unchanged.
- Full unit/service suite and TypeScript pass. Final asset/browser review, build, packaging, publication pending. No GitHub push.
- Final: all six imported ramp instances pass browser surface checks (spine0 missing/max0.084m), no shader errors; unit/service suite, TypeScript and production builds pass. Original sources unchanged. Christian (Human Model 1).glb received for next main-character replacement; deferred at71% against71.5% ceiling pending allowance. No GitHub push.
- Christian phase authorized: baseline71%, maximum76% (5 additional percentagepoints). Source54bone Mixamo rig,23188vertices/3.9MB; preserve source and reuse full rig. Version25 ramp release succeeded: appgdep_6ab1ad52d1088191bf12d8e7e1998513. New adapter plus concrete pose/contact validation before character publication.
- Christian SOURCE BLOCKER verified against original and identical copied SHA256 524A95C6CFDFF2D00BEDC86F72C6DBFCAC847C7A4CB4F6251321D6A6404D86B9: all55 inverse-bind matrices fail finite/affine checks; all67 nodes omit rest transforms. A second JSON fragment overwrites binary data from byte3927732 through truncated tail. Original is untouched. Do not invent/re-rig the character or publish it as valid.
- ImportedHuman adapter draft exists and type-checks but is UNWIRED/UNTESTED; expects valid skeleton bind pose. Await fresh rigged GLB export. Unusable served copy removed from public and kept in artifacts/christian. Source validation JSON/script and preview PNGs retained there; live game/Windows remain tested version25.
- Usage last73% vs71% baseline: 2 reported percentagepoints used, ~3 remain in authorized5-point maximum (rounded). Stop character work pending replacement file.

- Replacement human figure export passes all52 bind matrices; rest pose recovered with Skeleton.pose. Runtime skin validation:23,019 of23,188 vertices have hips as primary influence; moving limbs creates spikes while body stays T-posed. Source preserved artifacts/christian/replacement-source.glb; adapter remains unwired. No character asset served.
- Visual advisor report artifacts/ramp-import/VISUAL-REVIEW.md identifies pale linear shader color, removed material maps, curled source silhouettes and exposed substrate. HD texture/mesh repair NOT completed.
- Small box corrected to x=-4..0.61, matching hub outer wall; terrain/module width follows, hub center remains0.3. Six-instance browser surface checks pass (small max0.027m), screenshot reviewed; unit suite, TypeScript and production builds pass. Budget latest75%, ceiling76%. Sites publication pending; GitHub not authorized.

- Version26 requested for commit5f441ae72c8e139918d13ed761af5ee670a366d3, deployment appgdep_6ab1b52dc3dc8191acf93c4a7937628f. Windows root ZIP refreshed; previous retained as pre-hub-alignment-20260921.zip. GitHub untouched. Source visual advisor findings also saved at VISUAL-REVIEW.md. Reported usage75%,4 points since71 baseline, maximum76%.

- Version26 successfully published: https://scoot-with-friends.nicsoundcloud22.chatgpt.site, deployment appgdep_6ab1b52dc3dc8191acf93c4a7937628f. Small-box alignment only; character and HD material repairs remain disabled/pending.

## Connected park / Christian / settings pass
Owner authorizes15 percentagepoints, baseline76%, hardceiling91%. Preserve testedversion26 until replacementpasses. Parallelownership: humanoid_repair Blenderasset; settings_pause UI; ramp_visual_advisor rampgeometry/materials; root rig/runtime/integration. Scope: connectedspine-hub, amberwood, Christianonly withfixedskinweights, categorizedsettings, frozen/translucentpause, cleartime/weathercontrols. NoGitHubpush.

## Stage2 quarter physics addendum
Read attachment38c2d0fc. LatestownerrequiresLOCALONLY: noSite/GitHub/releasepublication. Continueparallelart/UI/character; deliverbuiltlocaltestcopy. At77%newstagebaseline, target83-85%, softstop85%, hardstop87% (conservativecombinedaccountusageincludingparallelwork; stricterthanprior91). Reproducecurrentquarterfailuresbeforetuning; noinputrewrite, noadvancedFlairtuning, noengineglobalclamps. Currentliveversion26 remainsunchanged.

- LatestownerexplicitlyreauthorizesLIVEWEBSITEupdates, overridingStage2local-onlypublicationrestriction. PublishtestedbuildtoexistingSiteandrefreshlocalcopy. GitHubremainsnotauthorized. Combinedusageceiling87%unchanged.

- Current pass: source Tripo meshes retained; amber grading restores source material maps. Small box/hub/spine share x=.61. Added six full quarter safety-fence envelopes. Christian imported with repaired bind/weights and anatomical driver mapping; sole rider selection, signature outfit, legacy inventory preserved. Six settings categories with Time & Weather, transparent paused game backdrop; freeze test passes. Eleven simulated character pose checks, full unit suite, TypeScript and production builds pass. Stage2 physics: 22 existing-behavior results pass, no physics source change. Final spine boundary clamp and rider-fence crossing checks pending before release. Current usage83%, soft85/hard87; no GitHub push.

- Final checks: six actual production rider approaches into quarter back/side fences all stop inside their planes; six asset-surface checks pass with zero missing samples. Root identified the remaining cream spine sail as old Terrain surface at x8.198, not the Tripo asset. Terrain grid fringe mask correction is the final release change. Full npm test/npm run build and Windows packaging pass; final rebuild will include fringe fix. Physics code unchanged. Rounded usage85% at soft stop; only verification/publication/closeout remain, hard87%.

- Final duplicate-surface fix verified visually: expanded old terrain mask to cover complete spine grid fringe; cream sail gone, charcoal derivative wall visible. Latest npm run build and Windows package pass, root ZIP refreshed, pre-Christian backup preserved. Full tests pass before this render-only mask edit; six ramp surface checks pass afterward. Ready for existing Site publication. Original Downloads models unchanged; no GitHub push.

- Version27 submitted for e8f1f061555c5350aac890966e02bc39b59eb9c9, deployment appgdep_6ab1c39136648191982182f5a9e9dd10 pending. Source uploaded to existing Site only; GitHub untouched. Current Windows copy includes final fringe fix. Status and known visual limitations recorded in root CURRENT-RELEASE.md.

Version27 SUCCEEDED: https://scoot-with-friends.nicsoundcloud22.chatgpt.site, deployment appgdep_6ab1c39136648191982182f5a9e9dd10. Published source e8f1f061555c5350aac890966e02bc39b59eb9c9; root Windows copy includes identical build. GitHub untouched. Final account meter86% (+10 reported points from visual-pass baseline76; below15-point allowance and conservative87 hard stop). Pending: source texture stretching and extreme sleeve/finger pose refinement; no new hardware/mobile validation. Stop new work at this checkpoint.

## September21 follow-up: all ramp edges / anatomy / Stage2
New explicit allowance9 percentagepoints, baseline86%, hard95%, aimfinish93% reserving2points for release. Root owns imported-human/model contacts; all_ramp_edges owns ramp visuals/masks; skin_refinement owns direct skin repair/GLB; stage2_completion owns physics audit/tests. Preserve original assets and version27 backup. Live updates remain authorized, GitHub remains on hold.

Follow-up verified: quarter/small/large terrain fringe removed; original Tripo maps retained with darker amber grading and reduced baked atlas noise. Christian outsole weights corrected and measured ankle offset applied (standing sole ~0m, riding .105m), sleeve weights/frame and Bri/Superman contacts improved. 47 pose/contact samples pass; six ramp surface checks pass. Stage2 charged RS 9/9, 30/60/120/144Hz and hitch cases pass; fakie now has +.4m/s2 rolling scrub and no backwards push. Flat fakie8?6.5m/s in3s; downhill gravity preserved. Unit suite and full build pass. Headless desktop software rendering only; no new device/controller tests. Original assets preserved. Source mesh wrinkles and extreme compound-pose fidelity remain limits, not claimed perfect. Usage91% from86 baseline, below95 ceiling. Existing Site publication next; GitHub untouched.
Version28 SUCCEEDED: https://scoot-with-friends.nicsoundcloud22.chatgpt.site; source cc662a5089b41db2e6eaadf4e74ae6fa6e9000c4; deployment appgdep_6ab1d163ffe481919a0b72196352adf4. Windows root ZIP refreshed, version27 preserved. GitHub untouched. Account last reported91% (+5points from86 baseline, under9point allowance).
