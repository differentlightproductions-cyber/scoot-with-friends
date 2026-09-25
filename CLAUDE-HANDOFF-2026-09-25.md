# Claude handoff — 2026-09-25

Branch `claude/relaxed-pasteur-g89vqc`. Tested release commit: **52e4193** (the commit before this note; this note changes docs only).
It already merges `codex/claude-handoff-2` (79a4083).

## What it contains
- #69 swimming sinks/dives, #70 gentle-slope sliding fix, #72 quarter air-outs stay in the quarter
- #71 sound mixer (master/music/UI/effects) + mourning doves with 3D audio, #78 real litter models
- #73 shadow stutter fixed (light-space texel snapping; shadow camera 70 m back so roofs cast again), shader pre-warm after loading
- #74 night-lit weather particles, real moon phase/position, live wind + dust devils (Open-Meteo + NWS KBVU)
- #75 real park lamp light (no painted circles), shaped headlamp beam with shadows (off on Low) and bounce light

## Checks run on 52e4193
- `npx tsx --test tests/*.test.ts`: 225/225 pass; `npx tsc --noEmit -p .`: clean; `npm run build`: passes
- Browser: lamps 10/10, weather 21/21, shadows 5/5, doves 16/16, sound-settings 7/7 (SwiftShader)

## Publishing (not done by Claude)
Sites tools were not available to Claude, so **the website was NOT updated**. For Codex: build 52e4193, package
`.openai/` (from `dist/.openai`), `dist/server/`, `dist/client/`, save to Sites project appgprj_6aa66922745c81918111d622cae1d66c
with the exact commit SHA, deploy, and verify `/api/account/session` returns `emailReady:true`. No server/account-schema changes
in this range; do not rerun migration 0002. Railway room server: no server changes in this range.

## In progress, not pushed
- #76 economy (Coins = the existing Credit renamed for display; Bucks premium balance in the same wallet, 5 per 5 levels,
  Mafioso priced in Bucks 1–6, two crate types, rarer crates/coins, pricier parts; real-money buying stays disabled).
  Held back: 7 unit tests still expect the old numbers. Kept locally as a stash/patch in Claude's session.
- Next: #77 phone camera app, #78 remainder, then the 31-step final audit and the five-stage social play update.
