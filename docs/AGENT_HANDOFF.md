# Scoot With Friends: agent handoff

Last updated 2026-09-26 by Claude Code (cloud session). This is the canonical handoff. Update it in place; do not start a second one.

Read these first: `CLAUDE.md`, `AGENTS.md`, `DEVELOPMENT.md`, `SYSTEMS.md` and `ART-DIRECTION.md`.

The owner also named a brief called `Next_Agent_Veterans_Fixes_Wear_and_Starter_Home.txt`. **It is not in the repository or in this session's uploads.** Ask the owner for it. Section 5 covers its items (ADD-01 to ADD-09) as far as they were described to this session.

---

## 0. Rules that still apply

These are verbatim or near-verbatim owner rules:

- **GitHub pushes:** each push needs a specific owner request and a fresh "yes". Earlier approval does not cover later pushes.
- **Sites:** the public Sites game is a separate, authorized workflow. A GitHub push does **not** publish the website. If Sites tools are unavailable, prepare the tested commit and deployment archive for Codex to publish. Never claim the website was updated.
- **Things this handoff does not authorize:** publishing, DNS, registrar, payment or account-management changes. Do not create another Sites project. Preserve all Sites secrets, DNS, database records and access settings.
- **Credentials:** keep the repo private. Never commit `.env*`, `owner-private.json`, tokens, keys or owner ZIPs. Never put credentials in Git or in browser code.
- **Account migrations:** `server/account-schema.ts` handles them. Do not blindly rerun the SQL migrations.
- **Riding controls and physics:** preserve them unless a task explicitly targets them. ADD-01 does target the fastplant.
- **Visual changes:** never claim a visual fix without rendering it.
- **Cash purchases:** they stay disabled.
- **Branches:**
  - Claude works on `claude/relaxed-pasteur-g89vqc`; Codex works on `codex/…` branches in its own checkout.
  - Never edit the same checkout concurrently.
  - Commits carry no model names.
- **Art direction:** detailed stylized realism, not low-poly. Reuse the shared manufactured scooter and the weighted clothing pipeline.

## 1. Baseline

| | |
|---|---|
| Repo | `differentlightproductions-cyber/scoot-with-friends` (private) |
| Branch | `claude/relaxed-pasteur-g89vqc` |
| Code commit | `9c399eb` "Boulder City, NV: lake and field east of the park, barrier fixed, one map, laptop perf" (pushed) |
| Previous | `71d85be` (lake north, B Hill life, distance LOD, hologram editor) |
| Uncommitted | none after this doc's commit |
| Task scope (owner, latest) | Finish the map implementation: lake/field east of the skatepark and BMX via the winding road, the invisible barrier, only "Boulder City, NV" on a list called "Maps". Optimize for a laggy laptop. Push. Write this handoff. |
| Parallel work | Codex works on its own `codex/` branches. Nothing from Codex was merged here this session. `main`/`develop` were not touched. |
| Deployment | **Sites NOT updated** by this session (no Sites tools here). Project `appgprj_6aa66922745c81918111d622cae1d66c`, https://scootwithfriends.online/. Publishing `9c399eb` needs the owner's Sites workflow (Codex). |

## 2. This session's work, by status

### Verified working

**Lake, pond and field east of the park.**
- Rendered at ground level from the junction, along Lakeside Drive, at the lake and at the dock. The screenshots are in the ZIP (section 12).
- Probe results: the lake at (325,-54) and the pond at (290,-76) are water; the field at (224,-66) is dry.
- The dock's ladders are in the water; the rack and gangway foot are dry.
- The bed is about 1.9 m deep under the springboard.

**Invisible barrier fixed.**
- `outOfVeterans()` in `src/physics/simulation.ts` follows `VETERANS_BOUNDS`.
- Probe results:
  - lake: not out;
  - field: not out;
  - park centre: not out;
  - x 371: out;
  - z -168: out.
- `tests/underwater.browser.mjs` passed **13/13**. It places a swimmer in the moved lake and swims, dives and climbs there with no reset. Before this fix, the same test would have been reset.

**Build and unit tests.**
- `npx tsc --noEmit -p .` is clean.
- `npx tsx --test tests/*.test.ts`: **253/253** pass. That includes the updated `tests/world.test.ts`, which checks that the fast-travel list is Boulder City only and that each spot's spawn matches.
- `npm run build` succeeds.

### Implemented but untested in a browser

**Menus.**
- The map is named **"Boulder City, NV"**.
- The list title is **"MAPS"** ("CHOOSE WHERE TO RIDE"), with only Boulder City on it. `PARK_MAPS` in `src/ui/menu.ts` filters to `outdoor`.
- The HUD location label and the online subtitle read BOULDER CITY, NV.
- The phone SPOTS (fast travel) list has four entries:
  - VETERANS MEMORIAL PARK
  - BMX TRACK
  - LAKESIDE DRIVE / FIELD
  - LAKE / DIVE DOCK
- Church and B Hill spots are kept in `HIDDEN_SPOTS` in `src/data/world.ts`. The city drawing shows only listed districts.
- The phone BUILD app's button is now **GO TO THE WAREHOUSE** (new key `phone.ui.open_warehouse`, translated in all 6 locales). It fast travels straight to the Warehouse, because the Warehouse is off the Maps list and Build lives there.
- Browser tests were updated for the new name but **not run**: `tests/memorial.browser.mjs`, `tests/replay.browser.mjs`, `tests/ui-polish.browser.mjs` and `tests/release-smoke.mjs`.
- **Superseded:** the memorial test "Park name contains no city or state" is replaced by "Location reads Boulder City, NV".

**Laptop performance.** None of this is measured on real hardware. Only headless SwiftShader was used.
- **Minimap and compass.**
  - A map over 300 m (Veterans) now takes one 2048 px overhead photo when the map loads.
  - Before, it retook a rider-centred photo roughly every 50 m. Each retake re-rendered the whole scene with every instance visible and stalled on `readRenderTargetPixels`. This was the likely "compass lag".
  - Redraws are capped at 10 per second, and happen only when the rider moved at least 0.08 m or turned at least 0.006 rad (plus one per second anyway).
  - Files: `src/phone/map.ts` (`capture`, `miniPhoto`, `pose`), `src/ui/minimap.ts`.
- **HUD.** `src/ui/hud.ts` `update()` used to rewrite about ten text and style values every frame. It now writes only on change (`text()` and `style()` helpers), and the Coins suffix moved into the HUD (`hud.coins`).
- **High preset.** It renders at 1.15× the screen's pixel ratio instead of 1.35× (`src/render/fidelity.ts`).
- **Auto step-down.** In `src/main.ts` (`autoGraphics`), sustained riding under 30 fps for about 8 s drops one preset (High to Medium, then Low), saves it and shows a HUD message. It is skipped when `navigator.webdriver` is set.

**From `71d85be`, still unverified:**
- The hologram editor (#66) checks after the first four: B cancel, A save, RIDE rows, X swap, phone RIDES opens the hologram.
- The Low preset dropping bump maps on a rebuilt rider (`fidelity.refresh`).

### Partially done

- **Lakeside Drive decoration.** The owner allowed this to wait. The road, dashed centre line, edge lines and tree rows are in. The street views show the rest, which is **not built**: planted islands with curbs at the junction, lamp posts, sidewalks, benches, ballfield fences, and "See Spot Run" (the owner's 3D view labels it next to the lot).
- **Elevation.** The drive and grounds are flat. The owner said the road "goes upward and windy" and that a better elevation map is coming. **Waiting on the owner.**
- **Unified world (#43).** Church and B Hill connections are designed, not built. The plan: gates at road ends that load the next district and carry speed; yellow route Church to B Hill top, about 600 m; red route B Hill bottom to Veterans, about 880 m. Details are in `docs/reports/BOULDER-CITY-WORLD.md` and `src/data/world.ts`. The districts are hidden from the lists for now.

### Still reproducible or not investigated

See ADD-01 to ADD-09 in section 5. All of them are open.

### Blocked on owner input

- The elevation map.
- The `Next_Agent_…txt` brief.
- The meaning of ADD-02's "road moved south".
- Exact placements for volleyball and concessions.
- The Buchanan orientation question in section 4.

## 3. World-axis convention and layout numbers

**Axes.** North is **-z**, east is **+x**, up is +y, in metres. Yaw 0 faces +z. Forward is `(sin yaw, cos yaw)`, so yaw π/2 faces east.

**Map id.** Veterans is map id `outdoor` (menu name "Boulder City, NV"), with its origin at the park centre.

**Rotation from the owner's photos.** The owner's aerial photo (Google Maps, photo-north up) is turned a quarter to the game:

| Photo direction | Game direction |
|---|---|
| North | east (+x) |
| East | south (+z) |
| West | north (-z) |

Scale is about 0.44 of real.

**Layout numbers.** Code is in `src/park/memorial.ts` unless noted.

**Site and streets:**
- **Site:** `VETERANS_BOUNDS` = x -116..372, z -170..80. That is the park rectangle (x ±115) plus the east grounds (x 115..372).
- **Park structures:**
  - Ballfields at about z -123 (x -3 and 57).
  - Ballfield DIY lot at x -90..-35, z -140..-110.
  - Parking lot at x -38..92, z -89..-49; its drive aisle at x 92..98.5, z -69.5..-60.5.
  - BMX track at x 46..84, z -22..22.
- **Streets:**
  - The east street ("Buchanan" in code) is x 98.5..107.5, z -99.125..69.5.
  - The south street is z 60.5..69.5.
  - Walks are 2.1 m wide. The far walk (x 107.5..109.6) is split for both drive ends.

**East grounds:**
- **Lakeside Drive:** `LAKESIDE_DRIVE`, 7 m wide.
  - It starts at stub streets x 107.5..112 at z -69.5..-60.5 (opposite the drive aisle) and z -29.5..-20.5 (opposite the BMX track).
  - Each stub has a `streetEnd` ramp at x 112..115, then a flat ribbon from x 115.
  - Centreline: (115,-65) → (137,-79) → (153,-110) → (205,-114) → (258,-106) → (270,-66) → (259,-26) → (205,-19) → (126,-25) → (115,-25).
- **Field:** `EAST_FIELD` = x 186..262, z -104..-28 (lawn; a future soccer pitch).
- **Water:** `LAKES` in `src/park/water.ts`.
  - Lake centre (325.3,-53.7); extent x 310.5..345.3, z -105..-11.1; 3.2 m deep.
  - Model Boat Pond centre (290.4,-75.9); extent x 283..297.9, z -96.9..-54.1; 1.1 m deep.
  - The bowl exponent is 0.5.
- **Dive dock:** `DIVE_DOCK` in `src/park/dive-dock.ts`. It sits at the lake's north tip: deck x 321.7..324.3, z -106.35..-98.55, gangway foot z -107.75, rack at (319,-106.35).
- **Paths:**
  - (256,-104) → (264,-111) → (314,-111): to the dock.
  - (272,-72) → (279.5,-72): to the pond trail.
  - (257,-24) → (268,-20) → (307,-20): to the lake's south trail.
- **Lake-shore NPC:** (304.5,-27), facing east (`src/social/npcs.ts`).

**Spawns** (`outdoorSpawns` in `src/park/outdoor.ts`):

| Index | Name | Position |
|---|---|---|
| 11 | BMX TRACK GATE | |
| 12 | LAKESIDE DRIVE / FIELD | (117,-65), facing east |
| 13 | LAKE / DIVE DOCK | (312,-111), facing east |

## 4. Placement check against the owner's guide, and missing references

Checked against the owner's 8 images (the aerial overlay with the purple junction and blue roads, a 3D view, and 6 street views at the junction):

- **Matches:**
  - The winding road leaves the lot's junction and climbs "eastward" (photo-north) to the field.
  - It rings the field on three sides and returns to Buchanan.
  - The pond lies between the field's far end and the lake.
  - The lake is long and footprint-shaped, and runs along the photo's east-west axis. In the game it runs north-south.
- **Conflicts, flagged for the owner:**
  - **Buchanan.** In the photo, Buchanan runs along the photo's east side, which is game **south** after the turn. The game's east street (called Buchanan in code) runs north-south at x ≈ 103 along the park's east side. The drive meets that street at two points; it does not cross a Buchanan beyond the lake. **Ask:** should the game's east street stay as Buchanan, or should the south street become Buchanan and the layout turn?
  - **Junction.** The photo junction is at the lot's photo-north end, which is game east. The game junction is the lot's drive aisle across the east street at z -65.
- **Missing, not guessed:**
  - The elevation map (the owner is sending a better one).
  - Exact volleyball court placement. The photo shows a sand court near the lot, west of the junction. It is not built.
  - Concession stand placement.
  - Lamp model and spacing.
  - Island dimensions at the junction.
  - Whether the field needs goals or markings now.
- **Four ballfields.** The photo shows **four** fields in a cloverleaf around a central plaza. The game has **two** (ADD-03).

## 5. Owner addendum ADD-01 to ADD-09

None of these were started in this session unless stated.

### ADD-01: Moving Fastplant without a sticky or frozen stop

- **Status:** Not started. Root cause located, from code reading only.
- **Symptom:** A fastplant while moving freezes the rider in place briefly.
- **Evidence:** In `src/physics/simulation.ts` `updateFastplant()` (about line 1176), during the contact phase: `this.velocity.set(0,0,0); …setGravityScale(0)` for `TUNE.fastplantContactTime` (0.18 s in `src/core/config.ts`). The entry velocity is restored only on launch. That is the frozen stop.
- **Files:**
  - `src/physics/simulation.ts`: `updateFastplant`, `fastplantOpportunity`, and `pop(…,'fastplant')`.
  - `src/core/config.ts`: `fastplantContactTime`, `fastplantPop`, `fastplantMinAirtime`.
  - `src/tricks/tricks.ts`.
- **Earlier work:**
  - #28: armed with RT+A in the air; plants at the next valid contact.
  - #84: works on flat and up ramps.
- **Dependencies:** none.
- **Next smallest action:**
  1. During the contact phase, keep the horizontal entry velocity (slightly damped) and zero only the vertical.
  2. Let `world.step` carry the rider.
  3. Keep the foot anchor visual.
- **Acceptance:**
  - Probe at 6 m/s on flat and up a quarter: horizontal speed never drops to 0 during the plant and is at least 85% of the entry speed at launch (or the owner's figure).
  - Existing tests still pass: `tests/fastplant-anywhere.browser.mjs`, `tests/new-riding.browser.mjs`, `tests/pop-flow.browser.mjs`, `tests/curbs.browser.mjs` and `tests/body-flip.test.ts`.
- **Owner questions:** Keep full speed or lose a little? Is the stop reported on flat, on ramps, or both?

### ADD-02: East-side expansion with correct cardinal directions; road moved south

- **Status:** Partly done by #100. The east grounds, field, lake, drive and directions follow section 3.
- **Symptom:** The owner reported the lake and field "north" instead of east. That is fixed in `9c399eb`.
- **Evidence:** screenshots in the ZIP.
- **Files:** `src/park/memorial.ts`, `water.ts`, `dive-dock.ts`, `outdoor.ts` and `simulation.ts`.
- **Earlier attempt:** #99 put everything north. That is **superseded**: any "north of the ballfields" wording in older notes is wrong.
- **Dependencies:** owner answers.
- **Next smallest action:** ask what "road moved south" means. Candidates: the south street moves further south, or the drive's return leg moves south.
- **Acceptance:** the owner confirms directions against the street views.
- **Owner questions:** "road moved south": which road, and by how much? Also the Buchanan question in section 4.

### ADD-03: Four outward-facing baseball fields around a walkable central plaza

The request also includes concessions, trees, volleyball and incidental street spots.

- **Status:** Not started. The game has 2 ballfields at about z -123 (x -3 and 57, radius 25).
- **Evidence:** the owner's aerial photo shows a cloverleaf of four fields, with home plates facing a central plaza that has buildings (concessions) and trees.
- **Files:**
  - `src/park/memorial.ts`: ballfield build, `PAVILIONS`, benches around line 784, the ballfield DIY lot around line 786.
  - `src/park/surfaces.ts`: sand infield zones.
  - `src/park/tracks.ts`: wheel marks.
- **Dependencies:** the north edge of `VETERANS_BOUNDS` (z -170) and the ballfield DIY lot (x -90..-35) may need to move.
- **Next smallest action:**
  1. Lay out 4 diamonds (home plates inward) around a plaza centred near the current ballfields.
  2. Add a concrete plaza with a concession building, trees, benches and a sand volleyball court.
  3. Keep the DIY lot reachable.
- **Acceptance:**
  - Top-down render matches the cloverleaf.
  - The plaza is ridable.
  - Infields register as sand.
  - No riders are blocked.
- **Owner questions:** field sizes, fence heights, and whether the volleyball court goes west of the junction as in the photo.

### ADD-04: Align the opposing wooden quarters and the central big-box/spine arrangement

- **Status:** Not started.
- **Evidence (current modules in `src/park/outdoor.ts` `modules`):**
  - front-quarter: x -13..13, z -30..-22, h 3.6
  - back-quarter: x -13..13, z 22..30
  - spine: x 0.61..8, z -2.625..3.625
  - small-box: x -4..0.61, z -7.5..5.5
  - large-transfer: x -16..-4, z -9..8
- **Files:**
  - `src/park/outdoor.ts`: modules, `rampLips`, coping.
  - `src/park/wood-ramps.ts`.
  - Physics reads the same profiles.
- **Dependencies:** owner reference for the intended alignment. Quarter launch tests: `tests/lip-launch.browser.mjs` and `tests/physics-acceptance.browser.mjs`.
- **Next smallest action:** get the owner's reference, then shift module x/z only. Profiles stay as they are.
- **Acceptance:**
  - Quarters are face to face on one axis, and the box/spine are centred between them.
  - Lip-launch and physics-acceptance tests pass.
- **Owner questions:** which is the reference: centre the big box on the spine line, or shift the spine?

### ADD-05: Fullscreen activation and viewport repair

- **Status:** Not investigated.
- **Files:**
  - `src/ui/display.ts`: `DisplayController`. Browsers need a click, tap or key press, and a gamepad press does not count. Leaving fullscreen resets the setting to Windowed.
  - `src/ui/menu.ts` settings.
  - The resize handling in `src/main.ts`.
- **Next smallest action:** reproduce in a real browser. Check whether the canvas is resized on `fullscreenchange` (`renderer.setSize` plus camera aspect) and whether a gamepad-only player can ever enter fullscreen.
- **Acceptance:** entering and leaving each mode leaves the canvas filling the viewport with a correct aspect. It works from keyboard, mouse and touch.
- **Owner questions:** which browser and device show the problem, and what exactly is wrong (black bars, a stretched image, or no activation)?

### ADD-06: Solid, climbable gazebo roofs; a throw, climb and retrieve scooter route

- **Status:** Not started.
- **Files:**
  - `src/park/props.ts` `pavilion()` (about line 305). The roof is visual only; posts and benches have colliders via `solid()`.
  - On-foot climb and vault: #18, in `src/physics/simulation.ts`, validated destinations.
- **Next smallest action:**
  1. Add roof colliders: a pyramid hip roof, as 4 sloped cuboids or a convex hull.
  2. Mark the eave as a climb target.
  3. Let a thrown scooter land and stay on the roof.
- **Acceptance:**
  - You can walk up and stand on the roof.
  - A thrown scooter can land on it.
  - Climbing up and retrieving it works.
  - The rain shelter (`scene.userData.shelters`) is unchanged.
- **Owner questions:** How is the scooter thrown today (is there a throw action)? Which pavilions?

### ADD-07: More readable, grindable gray, red, yellow and blue curbs

- **Status:** Not started. Curbs exist and are grindable from #87 (`src/park/streets.ts`, `CURB`, and curb grind in the simulation), but they are uniformly concrete.
- **Next smallest action:** add per-segment curb paint in `StreetPlan`: red for fire lanes, yellow for loading, blue for accessible parking, gray for plain. Use a slightly brighter top edge for readability.
- **Acceptance:**
  - The colours render at the lot and streets.
  - Grinds are unchanged (`tests/curbs.browser.mjs`).
- **Owner questions:** which curbs get which colour?

### ADD-08: Deck wear, paint transfer, inspection, restoration and home display

The owner wants contact-based deck wear and paint transfer, inspection, confirmed restoration, and a link to a personal-home display.

- **Status:** Not started. No wear system exists; grep finds only unrelated "wear" (clothing).
- **Files that would be involved:**
  - `src/scooter/model.ts`: deck materials.
  - `src/data/loadout.ts`: profile persistence.
  - The shop/parts UI.
  - The hologram editor, `src/ui/hologram.ts`, for inspection.
- **Dependencies:** ADD-09 (home display), and the save schema (old saves must still load).
- **Next smallest action:** design the data first: a per-deck wear map (low-res canvas texture or decal list) updated on grind and slide contacts with the colour of the surface ground on.
- **Acceptance:**
  - Grinding a red curb leaves red marks where the deck touched.
  - Marks persist across a reload.
  - Restoration asks for confirmation.
- **Owner questions:** does restoration cost Coins? Is wear per deck or per ride?

### ADD-09: One free 12 × 12 ft white-brick starter basement, decorated through Build

- **Status:** Not started. There is no home or basement code.
- **Files:**
  - The Warehouse Build system: `src/editor/*`, `src/phone/apps.ts` BUILD, `src/data/builds.ts`.
  - Map registration: `src/park/park.ts`, `registerMap`, `loadDestination` in `src/main.ts`.
- **Next smallest action:** add a small interior map (3.66 m × 3.66 m, white brick) that reuses the Warehouse's Build placement with its own layout key. Reach it from the phone.
- **Acceptance:**
  - Every account gets one free.
  - Build places items there and they persist.
  - It does not appear on the Maps list unless the owner says so.
- **Owner questions:** entry point (phone app or door)? Ceiling height? Does ADD-08's display go on its wall?

## 6. Other unfinished items

- **#37:** fix the bri air / inward air visuals on quarter pipes. Pending.
- **#39:** Veterans props graphics pass. Lamps, gazebo ceilings and the sign are done. Vending, rack and fountain need a final look.
- **#43:** unified world connectors (above).
- **#46:** ballfield DIY lot is built, and surface drag and wheel marks exist. Needs a final verify render and run.
- **#66:** hologram editor remaining checks (section 2).
- **#67:** Techno Gravity as a visual shop menu, with a crates page inside the shop. Pending.
- **#79:** Sites deployment archive and Windows ZIP refresh for `9c399eb`. Needs the owner and Codex publish workflow.
- **#81:** five-stage social play update. Pending.
- **#92:** B Hill scenery and life audit. Mostly done in `71d85be`.
- **#93:** final integration check and final report.
- **#97:** skates and roller hockey (BarDown inlines, Wheelhouse quads, a rink at Veterans). Spec in the owner's upload.
- **#98:** distance LOD. Tune after measuring on the owner's laptop.
- **Presets browser test:** rerun `tests/graphics-presets.browser.mjs`. It was 15/16 before the `fidelity.refresh` fix.

## 7. Commands and environment

```
npm ci
npm run dev                  # Vite at 127.0.0.1
npx tsc --noEmit -p .        # typecheck
npx tsx --test tests/*.test.ts   # unit tests (253)
npm run build                # dist/client (+ dist server/publisher); "Built browser game and secure park publisher."
npm run preview              # serves dist/client
# Browser tests (Playwright, headless; software GL is slow, about 5 s per frame at High):
LAZER_URL=http://127.0.0.1:<dev port> BROWSER_EXECUTABLE=<chromium path> OUT=artifacts/<name> node tests/<name>.browser.mjs
```

**Environment variable names** (values are never in Git):
- Game and tests: `ACCOUNT_EMAIL_FROM`, `ACCOUNT_SITE_ORIGIN`, `BROWSER_EXECUTABLE`, `BROWSER_WORKERS`, `CHROME_PATH`, `GAME_URL`, `LAZER_URL`, `MUSIC_BASE_URL`, `MUSIC_FIRST_ONLY`, `NO_IMAGES`, `OUT`, `PARKS`, `PARK_PUBLISH_KEY`, `PORT`, `QUARTERS_ONLY`, `RESEND_API_KEY`
- Review, rooms and rendering: `REVIEW_OUT`, `ROOM_CAPACITY`, `ROOM_HOST`, `ROOM_ORIGINS`, `ROOM_PORT`, `ROOM_SOCIAL_FILE`, `ROOM_URL`, `SHOTS`, `SOFTWARE_GL`, `SWEEP_SUMMARY`, `VITE_ROOM_SERVER_URL`

**Output paths:**
- Builds go to `dist/client`, plus `dist/rooms` from `npm run build:rooms`.
- Test screenshots go to `artifacts/…`, which is gitignored.

## 8. Files changed in `9c399eb`

**Map:**
- `src/park/memorial.ts`: bounds, `EAST_FIELD`, `LAKESIDE_DRIVE` with `buildLakesideDrive()`, stub streets, walk ramps, paths, trees, edited-ground grid sized from the bounds.
- `src/park/water.ts`: `turn()`, new centres, depth 3.2, bowl exponent 0.5.
- `src/park/dive-dock.ts`: moved to the lake's north tip.
- `src/park/outdoor.ts`: spawns, desert keep-out as two rectangles, mow curbs, desert centre.
- `src/physics/simulation.ts`: `outOfVeterans()`.
- `src/social/npcs.ts`: the lake-shore NPC.

**Menus:**
- `src/data/maps.ts`: the name.
- `src/ui/menu.ts`: `PARK_MAPS`, MAPS title, subtitle.
- `src/ui/hud.ts` and `src/main.ts`: location label.
- `src/data/world.ts`: `SPOTS` and `HIDDEN_SPOTS`.
- `src/phone/apps.ts`: SPOTS city view and BUILD button.
- `src/i18n/locales/*`.

**Performance:**
- `src/phone/map.ts`, `src/ui/minimap.ts`, `src/ui/hud.ts`, `src/render/fidelity.ts`, `src/main.ts` (`autoGraphics`).

**Tests and docs:**
- `tests/world.test.ts`, `tests/memorial.browser.mjs`, `tests/replay.browser.mjs`, `tests/ui-polish.browser.mjs`, `tests/release-smoke.mjs`.
- `SYSTEMS.md`: the "Boulder City, NV east grounds (#100)" and "Laptop performance (#100)" paragraphs.

**Pending migrations:** none. Nothing touches the account or database schema.

**Save compatibility:**
- The saved `fidelity` may now be lowered automatically by `autoGraphics`.
- There are no new profile fields.

## 9. Reproduction locations

| What | Where |
|---|---|
| Barrier (fixed) | Ride east from the lot's drive aisle (spawn 12) toward x 200+. Before, a reset hit at x 113. |
| Lake / swim | Spawn 13 (312,-111), or `sim.position` = (325, 0.4, -54). |
| Dock | (323,-107) facing south (+z). |
| Pond | (290,-76). |
| Fastplant stop (ADD-01) | Any flat ground; RT+A in the air with at least 0.8 s airtime while moving. |
| Minimap cost | Ride anywhere on Veterans. Before, frame spikes came every ~50 m of travel. |

## 10. Asset and collider versions

- **Lake water shader:** cache key `swf-lake-water-v3`. The surface is `lakeSurfaceGeometry()` (polar meshes with a `rim` attribute). The basin and underside are built in `src/park/underwater.ts`.
- **Colliders:**
  - Ground: flat cuboids from `VETERANS_STREETS.colliders(world, VETERANS_BOUNDS)`. Streets are sunk by `CURB`, with ramps at street ends.
  - Lakeside Drive: no collider of its own (flat, on the slab).
  - Trees: one trunk cylinder each, radius 0.28 m.
  - Dive dock: its own colliders in `buildDiveDock`, plus the swimmer footprint via `dockBlocks`/`dockClear`.
- **Minimap photos:**
  - 2048 px for maps over 300 m.
  - 1024 px otherwise.
  - Software GL: ÷4.

## 11. Tested devices

- Linux cloud container only: headless Chromium 1194 with SwiftShader (software WebGL), Node 22.
- **Not tested:** real GPUs, the owner's laptop, phones, controllers or Windows.

## 12. Screenshots

`artifacts/east100-screenshots.zip` (PNG only) contains:
- `junction.png`: the lot's drive aisle across Buchanan into Lakeside Drive.
- `drive.png`: the winding drive with tree rows and the field.
- `lakeView.png`: the pond and the lake with trails.
- `dock.png`: the dive dock at the lake's north tip.
- `east.png` and `whole.png`: overhead views. At that height the perspective render's depth precision muddies the flat ground; judge the ground from the level views.

## 13. Approvals the next agent needs

- **Sites publish of `9c399eb`:** the owner's authorized Sites workflow (Codex). Not done.
- **Any further GitHub push:** a new, specific owner request and an explicit yes.
- **Nothing** in DNS, registrar, payment or account management.

## 14. Recommended next checkpoint

1. Get the owner's answers (Buchanan orientation, "road moved south", the elevation map, the `Next_Agent_…txt` brief).
2. Run the browser tests updated here: memorial, replay, ui-polish, the hologram checks and presets.
3. Ask the owner to try the build on the laptop. Watch for the auto step-down message and whether the minimap still hitches.
4. ADD-01, which has a one-function fix site.
5. ADD-03 (four fields and plaza). Then dress Lakeside Drive: junction islands, lamps, walks.
