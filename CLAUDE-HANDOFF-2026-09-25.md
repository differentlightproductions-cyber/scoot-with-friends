# Claude handoff — 2026-09-25 (updated)

Branch `claude/relaxed-pasteur-g89vqc`. Tested release commit: **72407db** (the commit before this note; this note changes docs only).
It contains everything since the live build (367e769, Sites version 37) and supersedes the earlier 52e4193 handoff.

## What it contains (since the live build)
- #69 swimming sinks/dives, #70 gentle-slope sliding fix, #72 quarter air-outs stay in the quarter
- #71 sound mixer (master/music/UI/effects) + mourning doves with 3D audio; #78 real litter models, chip-bag crumbs
- #73 shadow stutter fixed, shader pre-warm; #74 night-lit weather, real moon, live wind and dust devils
- #75 real park lamp light; #83 amber on every lamp pole, the pre-#75 headlamp back, headlamp on every map
- #76 Coins and Bucks: rarer crates and coins, pricier parts, Mafioso for Bucks or a lucky crate (cash purchases stay disabled)
- #82 quarter airs land under the coping at every speed; #84 fastplants on the flat and up ramps, T-bog reach and grab holds
- #85 weather on every open-air map, everything loads behind the loading screen, fewer draw calls
- #86 phone home: a full screen of apps, X rearranges, no page buttons; #77 phone CAMERA app (photos and clips, SAVE TO DEVICE)
- #77 photos, clips and saved replays now live in memory for the session only (the old `swf-replays` IndexedDB is deleted)
- #87 raised sidewalks with crashable curbs, gutters, drainage, water flow, icy curb snow; faster longboard on B Hill
- #88 real vending machine (keypad, tap the phone to pay, PUSH bin); #89 B Hill rebuilt from the owner's aerial photos
- #78 review of Codex UI: crate results frame the part won; clearer grayscale/earth palettes

## Checks run on 72407db
- `npx tsx --test tests/*.test.ts`: 244/244 pass; `npx tsc --noEmit -p .`: clean; `npm run build`: passes
- Browser (SwiftShader) on the final tree: camera 13/13, replay 18/18, phone 31/31, phone-home, litter 9/9, doves 16/16,
  crate-inventory 13/13, part-preview, menu-tabs, ui-palette, mobile-portrait: all pass
- Earlier in the range, each feature's own suite passed when it landed (B Hill 25/25, curbs, lamps, weather maps, vending,
  fastplant, quarter landings). Physics acceptance keeps the same 5 failures it had before this range (Q03, R03, R04, R07, T04).
- Test harness notes: software rendering takes seconds per full frame, so browser tests stub the GPU draw where they only
  check logic; the replay test needs the room server (`npx tsx server/start-rooms.ts`, ROOM_ORIGINS set) for a clean console.

## Publishing (not done by Claude)
Sites tools were not available to Claude, so **the website was NOT updated**. For Codex: build 72407db with Node 22
(`npm ci && npm run build`), package `.openai/` (from `dist/.openai`), `dist/server/`, `dist/client/`, save to the existing Sites
project appgprj_6aa66922745c81918111d622cae1d66c with the exact commit SHA, deploy, and verify `/api/account/session` returns
`emailReady:true`. No `server/` or `drizzle/` changes since 367e769: no migration to apply, do not rerun 0002. Railway room
server: no changes. Claude's own build of this commit is `releases/sites-72407db.zip` in Claude's session
(sha256 49549a247c677bb302779a6cdbf75087b15869f8a628c31f76c3f9a5b72d8599), for comparison only; publish from your own build.

## Windows ZIP
`releases/Scoot-with-Friends-Windows.zip` (player package, sha256 52e52c555577fd967312dd3c0bce6714b16c02c603ca653dfedd80d11221eeeb)
was built in Claude's Linux session following `scripts/package-windows.ps1` step for step, with the official Node v22.22.2
win-x64 `node.exe` (checked against nodejs.org SHASUMS256). The previous ZIP is kept beside it (`.previous`). No owner package:
there is no owner configuration in that session. Smoke test: unzipped, `server.cjs` started, the menu (six tabs), the starter
build and Veterans Memorial Park load with no page errors; the only 404 is `/api/account/session`, which the offline package
does not serve. Not yet run on a Windows PC.

## Next
The 31-step final audit and FINAL REPORT (#80), then the five-stage social play update (#81).
