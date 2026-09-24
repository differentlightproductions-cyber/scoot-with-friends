# Owner brief — Phone system / app hub pass (2026-09-24)

Condensed from the owner's message; every requirement kept. Status report format at the end.

## Goal
Replace the old general-purpose options/utility wheel with an in-game smartphone: the main
quick-access place for rider utilities while playing. It does NOT replace the Sesh/Pause menu
(Resume, Maps, Settings, restart/reset, session actions stay there).

Apps: MUSIC, EMOTES, RIDES, RIDER, MAP, ITEMS, BUILD, MESSAGES. Each is a frontend into the
existing system (no duplicate systems). One phone model, one phone UI state, one app registry;
extensible for more apps later. Offline must work without multiplayer.

## Opening
- D-Pad DOWN opens/closes. Allowed: standing off the scooter, mounted and grounded, coasting on a
  normal surface. Not while airborne in a trick or crashing.
- Opening must not trigger riding/trick inputs; while the phone owns input, gameplay must not also
  receive those presses.

## Home screen
Large icon grid (clean Android-like, not a fake OS). Bottom nav: BACK, HOME. Optional cheap
status area (time, cosmetic battery).

## Apps
- MUSIC: the existing Sesh Music service: Now Playing, Tracks, Previous, Next, Play/Pause,
  progress bar, title, artist, music settings. Keeps playing when closed. No second player.
- EMOTES: the useful wheel emotes as a compact grid (wave, cheer, laugh, point, sit/chill,
  celebrate, shrug, others). Selecting closes/minimizes the phone and triggers the existing emote
  system (multiplayer-compatible). No duplicate animation logic.
- RIDES: SCOOTER / LONGBOARD: see the active ride, switch where allowed, open ride customization,
  inspect the current preset. Reuse existing loadout state.
- RIDER: route into the canonical avatar customization (face, hair, eyes, brows, skin, outfit,
  accessories as implemented).
- MAP: compact bird's-eye view of the CURRENT map: player, ramps/major features, vending machines,
  buildings/shops, spawns, later nearby friends. Reuse minimap data; more detailed than the
  minimap; pan/zoom if practical.
- ITEMS: quick-use items from the wheel, from current inventory (held, temporary, placed, session
  objects). No RPG inventory.
- BUILD: the existing builder, for all players where building is allowed: choose ramp/object,
  preview, rotate, place, cancel, delete/edit owned placements if supported. Replaces the wheel
  route. No duplicate builder.
- MESSAGES: connect if messaging works; otherwise clean UI/state hooks tied to the multiplayer
  roadmap. Long term: random fictional in-game phone numbers, message a lobby player or a number,
  lobby/group channel, receive while riding, small notifications. Never real numbers/personal data.

## Notifications
Lightweight, small, non-blocking (new message, preset saved, item unlocked, mission complete,
credit reward, later friend/lobby events). Never force the phone open.

## Old wheel
Move every useful wheel function to a phone app, verify each works, then remove/retire the wheel.

## Third person
Rider visibly takes out a simple lightweight 3D phone, holds it in one hand, looks at it; the
readable UI overlay may also show. Standing or safely coasting. Simple, stable pose.

## First person (especially important)
No floating detached menu. The rider raises the phone into view: hand/forearm enter the lower
camera, phone at a believable reading distance, the actual phone screen shows the app UI, readable
without filling the view, world visible around it. Camera stays the rider's eyes with a little
natural motion; never snaps to the phone. Use the avatar's hand/forearm with the right skin tone
and sleeve; hide head geometry; no body clipping.

## Screen implementation
Either render the app UI onto the 3D screen or mirror the main phone UI onto it — whichever is
simpler and more reliable. ONE authoritative phone UI state; no separate FP/TP app logic.

## Input while open
D-Pad/LS navigate, A select, B back, Menu/dedicated input closes. Optional RS small view movement
if it does not conflict. The phone clearly owns controller input.

## Movement while open
Standing: limited walking if clean. Mounted: conservative (keep coasting momentum, reduce trick
controls, basic steering if practical); no trick combos while using the phone. Airborne: does not
open. Crash: phone puts itself away.

## Animation states
PHONE_HIDDEN, PHONE_DRAWING, PHONE_OPEN, PHONE_PUTTING_AWAY: reach, raise, stable view, lower,
return. No finger animation needed.

## Settings (minimal)
Phone section if useful: notifications on/off, notification volume, UI scale, opacity/brightness,
later first-person phone position.

## Pause relationship
Pausing with the phone open suspends/closes it; Sesh becomes input owner; return to a clean
gameplay state; never two menu layers fighting.

## Multiplayer future-proofing
Messages, lobby contacts, friends, invites, session/lobby number, nearby players, notifications;
modular; offline-capable.

## Tests
1 standing TP open, 2 riding TP open, 3 FP open, 4 FP phone in hand, 5-12 each app (Messages
shell ok), 13 Back/Home, 14 close, 15 pause while open, 16 crash while open. Verify no unintended
gameplay input, consistent state, hand pose, believable FP view, TP rider holds phone, saved data
kept.

## Report
PHONE HOME, FIRST-PERSON 3D PHONE, THIRD-PERSON PHONE, MUSIC, EMOTES, RIDES, RIDER, MAP, ITEMS,
BUILD (Working/Partial/Blocked); MESSAGES (Working/Partial/Future Hook); OLD WHEEL REPLACEMENT
(Complete/Partial/Blocked); FILES CHANGED; KNOWN ISSUES.

Owner note: work on this opportunistically whenever already in related code (and the same for
other queued prompts), rather than digging for files again later.
