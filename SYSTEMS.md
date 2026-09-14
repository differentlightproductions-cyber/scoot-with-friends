# Established systems

## Riding and tricks

`src/physics/simulation.ts` owns fixed-step Rapier movement and state. `src/input/riding.ts` owns contextual RS preload/pop, and `src/input/input.ts` owns actual button mapping. Pro uses stance-specific A/X whip/push; Arcade uses A hop, B whip and X push/airborne bars. Preserve both. RS down loads an analog crouch; a completed upward return triggers the hop. Neutral release eases out. LS steers on ground and controls spin/counterweight in air. Stance changes natural whip direction. Fakie preserves backward momentum and scores held time. Pumping/transition launch and coping clearance must preserve entry angle and player intent.

`src/tricks` separates deck, bar, bri and body rotations. Bri/inward follow shoulder-side scooter flips; tailwhip, fingerwhip, barspin, contextual rewinds and kickless retain distinct raw components. Buttercup requires the ordered completed whip/bri/whip sequence. Spin names use accumulated yaw and tolerant 90-degree increments; naming must never snap physics. Live attempts are provisional; completed landings score components, quality, combo and recent-trick variety. Bails discard unbanked points. Grind logic lives in `src/grind`: close contact/intent, no long-distance magnets. Rail exits must not recapture immediately.

## World

Veterans Memorial Park is the flagship outdoor environment. `src/park/outdoor.ts` defines wood transitions; `memorial.ts` defines grounds, metal park and BMX areas. Small box stays x=-4..1, big box left, spine right. Preserve the wood layout. Y toggles walking/riding, LS click runs carrying the scooter. Markers are contextual and support drop-in positions. Deep water splashes/bails then recovers to safe shore. Benches support sitting and grindable/rideable surfaces. `src/editor` is explicitly IN TESTING.

Phase 1 additions in progress: modular outfit products are selectable; rack/consumable/fountain and day/night modules exist but are not yet integrated into the gameplay loop at the repository safety baseline. The empty-warehouse quick builder is requested and pending. Do not describe unfinished features as available.

## Social

`src/ui/social.ts`: on-foot D-pad Left hold opens emotes, LS selects, release performs. D-pad Right hold opens local chat; messages are limited and rendered as text above the rider. Animations interrupt on movement. Events have local player IDs for future networking. No online chat, networking, matchmaking or multiplayer is implemented.

## Customization

`src/data/outfits.ts`, `riders.ts`, `scooterParts.ts`, `loadout.ts`: authored products/colorways, same physical rider skeleton. Head includes helmet/beanie/cap/no hat; tops, trousers and shoes share modular geometry. Scooter parts include deck, bars, fork, grips, clamp, wheels, bearings, headset and brake. First brand remains Lazer; future Mafioso content and currency are planned only. All current gear is unlocked. Versioned browser-local profile migrates v1 to v2, preserving settings/loadout.

## Architecture and performance

`src/main.ts` orchestrates input, simulation, rendering, menu, audio, editor and local social. `src/scooter` builds procedural rider and parts. Three.js instancing/LOD support the landscape. Keep render loops allocation-light and avoid many shadow lights. `server/worker.ts` provides the optional authenticated park-layout publishing API. `portable` provides a local-only server; credentials are unnecessary for normal play.
