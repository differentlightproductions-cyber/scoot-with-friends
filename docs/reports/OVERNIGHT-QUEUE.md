# Overnight queue report

Reports for the queue items that asked for one, in the format each request
gave. Results are from runs on this branch in software rendering (SwiftShader),
so frame-rate numbers are not meaningful here. Behaviour and layout results are.

---

## INTEGRATION PASS: economy, longboard, traversal, minimap (+ menu overflow)

### ECONOMY

EXISTING MISSIONS FOUND:
22 (12 career chains, 10 daily missions)

TOTAL MISSIONS AFTER PASS:
52 (12 career chains with 52 stages, 10 daily, 30 one-time Starter missions
including the 7 new WATER missions)

CREDIT REWARDS:
Working. Starter missions pay once each, by tier (intro, basic, skill, big).
Levels pay their Credit and crate once, ever (`tests/starter.test.ts`).

EXISTING CHESTS:
Preserved. Crates, tiers and the Missions app were extended, not replaced.

STARTER LAZER SCOOTER:
Working. A new rider builds one free Lazer starter; only the picked parts
become owned, once, and survive a reload. Saves from before keep the Lazer
build they rode as their starter.

ALL LAZER PARTS NO LONGER FREE:
Working. Every Lazer part is priced; a new rider owns none before the starter.

NO FREE LONGBOARD:
Working. The Rides screen says "Buy a complete Sometimes Summer board at
Techno Gravity first" until one is owned (`tests/rides-screen.browser.mjs`).

Levelling: 600 + 300 XP per level; riding XP is a capped trickle, purposeful
missions pay more; mission stickers are shorter and at most two at a time.

### LONGBOARD

NORMAL STEERING:
Working. LS left / right turns the travel left / right at every speed.

FAKIE STEERING:
Working. Steering follows the travel direction, so it matches normal.

FAKIE TRANSITION:
Working. The body's lead eases between nose-first and tail-first instead of
snapping.

FAKIE PUSH:
Working. The push foot and pose follow the eased lead.

### TRAVERSAL

VAULT:
Working

MANTLE:
Working

RAMP PLATFORM CLIMBING:
Working

INVALID DESTINATION REJECTION:
Working. Destinations are checked for standing room, headroom and a floor
before a move starts; blocked ones do nothing.

### MINIMAP

TOP-LEFT MINIMAP:
Working. The HUD logo is gone.

PLAYER MARKER:
Working. Always centred; the map turns with the camera.

RIDE-TYPE ICON:
Working. Arrow on the scooter, board on the longboard, dot and view cone on foot.

COMPASS:
Working. The ring turns with the view; clockwise order N, E, S, W.

RAMP MARKERS:
Working

VENDING MARKERS:
Working. This pass adds merging: overlapping pins of one kind now draw as one
pin with a count. Techno Gravity's shop shelves were a pile of seven.

PHONE MAP DATA SHARING:
Working. The minimap is drawn by the phone MAP app's own `PhoneMap` from the
same photo and feature list; there is no second map database.

### INTEGRATION

RECENT WORK PRESERVED:
Yes. Every section extended the existing mission, crate, wallet, longboard,
mantle, phone and map systems. No parallel system was added.

CONFLICTS FOUND:
None needed an owner decision.

MENU UI POPPING OUT OF ITS BOXES:
Audited every menu screen at 1280x720, 1920x1080, 1024x600 and 390x844
(a local layout probe, not checked in: text past its box, a child past a
bordered parent, anything off screen). Fixed:
- "ACCESSIBILITY & TOUCH" ran 34 px past the panel. Titles with a single word
  longer than 10 letters now step down a size.
- The PRESET SAVED stamp overran the right edge on entry and covered the
  preview label. It now enters smaller, sits under the label, is capped to the
  viewport, and on phones sits under the menu rows.
- (Earlier in the queue) menu row text and chips were fitted in the UI rework.

FILES CHANGED:
See each commit: 3f957c8 (economy), 95cf4a3 (longboard), cac1a34 (traversal),
5eb7662 (minimap, phone hold and the rest of the checkpoint), and this pass's
`src/ui/theme.css`, `src/ui/menu.ts`, `src/phone/map.ts`.

TESTS ACTUALLY RUN:
PENDING

KNOWN REMAINING ISSUES:
PENDING

---

## PHONE: hold D-pad Down + emote hands (#23)

Format from `docs/briefs/PHONE-SYSTEM.md`, plus the two items this request added.

HOLD D-PAD DOWN TO TAKE OUT / PUT AWAY:
Working. A hold of 0.55 s (`src/phone/hold.ts`) takes the phone out and a
second hold puts it away. It fires once per press: a tap never opens it,
holding on after it opens never closes it again, and a tap inside the phone
still navigates. The press never reaches riding or trick input. A fill ring
shows the hold. The Starter mission "Check your phone" teaches it.

EMOTE HANDS WITH THE PHONE OUT:
Working. Each emote says how many hands it needs (`EMOTES` in
`src/ui/social.ts`). One-hand emotes (wave, point, facepalm, cheer) play on the
hand not holding the phone, so the phone stays out. Two-hand emotes (clap,
celebrate, sit, laugh, shrug) put the phone away first, then play. Head-only
emotes (nod, shake) leave both hands alone. It follows the phone-hand setting.

PHONE HOME: Working
FIRST-PERSON 3D PHONE: Working
THIRD-PERSON PHONE: Working
MUSIC: Working
EMOTES: Working
RIDES: Working
RIDER: Working
MAP: Working
ITEMS: Working
BUILD: Working
MESSAGES: Future Hook (records local chat; the room relay is ready for multiplayer)
OLD WHEEL REPLACEMENT: Complete

FILES CHANGED:
`src/phone/hold.ts` (new), `src/main.ts`, `src/ui/social.ts`,
`src/scooter/model.ts`, `src/ui/hud.ts`, `src/data/progress.ts`,
`tests/phone-hold.test.ts` (new), `tests/phone.browser.mjs`,
`tests/complete-update.browser.mjs`.

TESTS ACTUALLY RUN:
PENDING

KNOWN ISSUES:
PENDING

---

## FINAL REGRESSION (#31)

PENDING
