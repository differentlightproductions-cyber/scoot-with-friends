# Established systems

## Riding and tricks

`src/physics/simulation.ts` owns fixed-step Rapier movement and state. `src/input/riding.ts` owns contextual RS preload/pop, and `src/input/input.ts` owns actual button mapping. Pro uses stance-specific A/X whip/push; Arcade uses A hop, B whip and X push/airborne bars. Preserve both. RS down loads an analog crouch; a completed upward return triggers the hop. Neutral release eases out. LS steers on ground and controls spin/counterweight in air. Stance changes natural whip direction. Fakie preserves backward momentum and scores held time. Pumping/transition launch and coping clearance must preserve entry angle and player intent.

`src/tricks` separates deck, bar, bri and body rotations. Bri/inward follow shoulder-side scooter flips; tailwhip, fingerwhip, barspin, contextual rewinds and kickless retain distinct raw components. Buttercup requires the ordered completed whip/bri/whip sequence. Spin names use accumulated yaw and tolerant 90-degree increments; naming must never snap physics. Live attempts are provisional; completed landings score components, quality, combo and recent-trick variety. Bails discard unbanked points. Grind logic lives in `src/grind`: close contact/intent, no long-distance magnets. Rail exits must not recapture immediately.

## World

Veterans Memorial Park is the flagship outdoor environment. `src/park/outdoor.ts` defines wood transitions; `memorial.ts` defines grounds, metal park and BMX areas. Small box stays x=-4..1, big box left, spine right. Preserve the wood layout. Y toggles walking/riding, LS click runs carrying the scooter. Markers are contextual and support drop-in positions. Deep water splashes/bails then recovers to safe shore. Benches support sitting and grindable/rideable surfaces. `src/editor` is explicitly IN TESTING.

Racks, persistent consumables, fountain drinking, and day/night controls are integrated. Warehouse has its existing quick builder. Techno Gravity is a separate lazy-loaded walkable shop and DIY spot; physical displays open the shared catalog and atomic Credit transaction flow.

## Social

`src/ui/social.ts`: on-foot D-pad Left opens the general wheel; RS selects, release/A confirms. Items, emotes, interaction and Warehouse building share its input ownership. D-pad Right opens local chat. Messages are rendered as text. Movement interrupts emotes. No online chat, networking, matchmaking or multiplayer is implemented.

## Customization

`src/data/outfits.ts`, `riders.ts`, `scooterParts.ts`, `loadout.ts`: authored products/colorways, anatomical human mesh and semantic pose rig. Helmet/cap/beanie shells fit each head. Skinny/Regular/Chunky use regional deformation shared with garments; contacts and gameplay scale remain unchanged. Lazer and Mafioso parts use the same catalog, ownership and loadout. Confirmed rewards grant Credit through the configured reward policy; Cash remains disabled. Version 3 browser-local profiles migrate older saves and add default body build and `pockets` without changing the storage key. Phones and PCs have separate saves.

`src/data/items.ts` stores specific consumable identities and sealed/opened/empty states. `src/park/interactions.ts` owns vending, item use and fountain actions; render props never create inventory entries. Backpack is cosmetic and labels the same Pockets inventory. On-foot Use Held Item is remappable (X default). Mount and bail stow items, and interrupted actions retain their completed consumption markers.

`src/player/crash.ts` owns two temporary CCD bodies for rider and assembled scooter during bail. Riding forces and IK release once; stable contact and low motion permit settling. A requests clearance-tested local recovery on real terrain/platforms. Invalid crash motion falls back locally or to last safe ground, not routinely to spawn. `src/player/body-flip.ts` uses bounded analog target rates, integrated pitch and independent yaw; neutral slows an established flip, opposing input brakes and released modifiers damp. Only eligible takeoffs unlock flips. The final camera rule is mounted RS always riding/tricks, on-foot RS camera. L3 Run and R3 Recenter remain intact.

## Architecture and performance

`src/main.ts` orchestrates input, simulation, rendering, menu, audio, editor and local social. `src/scooter` builds procedural rider and parts. Three.js instancing/LOD support the landscape. Keep render loops allocation-light and avoid many shadow lights. `server/worker.ts` provides the optional authenticated park-layout publishing API. `portable` provides a local-only server; credentials are unnecessary for normal play.
