# Scoot with Friends

Play online: https://scoot-with-friends.nicsoundcloud22.chatgpt.site

Windows portable copy: releases/Scoot-with-Friends-Windows.zip. Extract all and double-click Play Scoot with Friends.cmd. This works independently of ChatGPT or coding credits.

A playable browser scooter game with Warehouse 01, the photo-inspired Veterans Memorial Park, controller menus, a modular Lazer scooter builder, three rider presets, session markers, and local loadout saving. TypeScript, Three.js, Rapier and Vite. Everything runs locally without an account or backend.

## Play

```sh
npm install
npm run dev
```

Open the address Vite prints. Choose **Ride**, choose a park, then ride. Connect an Xbox-style controller and press a button to expose it to the browser. Keyboard menus use W/S, Enter and Esc.

Current development preview: **http://127.0.0.1:5174/**. Local saving is specific to the browser and origin; another port or browser has a separate profile.

See [Earlier traversal and advanced trick update](BUILD-4-5.md) for the new stance setting, on-foot A jump/climb, Y coping setup, analog drop-in, fingerwhips, repeated rewinds, Bri gestures and contextual kickless and body-pose controls.

## Controls

The H guide updates automatically from the same stance mapping used by gameplay (src/input/riding.ts).

| Action | Regular | Goofy |
|---|---|---|
| Push on ground | X | A |
| Tailwhip in air (tap/hold) | A | X |
| Heelwhip | LT + A | LT + X |
| Fingerwhip | RT + A | RT + X |
| Opposite fingerwhip | LT + RT + A | LT + RT + X |

RS down hold/release loads and pops. Ramps launch naturally without preload; a timed pop adds a modest boost. Release LB before loading a manual hop; LB + RS remains manual entry/balance.

B taps/holds barspins; RB + B reverses the initial direction. In the 65-90% whip window, tap/release either bumper to rewind, or hold 0.18 seconds for a contextual kickless. Repeated windows allow longer sequences. A deck window consumes the bumper before the barspin/body systems; bar rewinds require the opposite current direction (LB left, RB right). Kickless cannot start from neutral air or a scoop gesture. RS circles perform Bri / Inward Bri immediately after pop.

Y is No-hander in air; RT + Y Tuck, LT + Y Deck Grab, both triggers + Y Superman. LB + Y Can Can (LS chooses side), RB + Y One Foot, both bumpers + Y No Foot. Release poses before contact. No face button requires simultaneous RS input.

LS steers/spins and shifts airborne weight. LT brakes on ground, RT pumps/requests a grind. Y dismounts/mounts, A jumps/climbs on foot, B sits by benches, LS click runs carrying scooter. D-pad Up tap returns to marker / hold sets it. View resets, Menu pauses. RS click recenters; RS orbits on foot.

Keyboard physical equivalents: Space=A, X=X, B=B, Y=Y; arrows=RS, A/D and W/S=LS, Shift=LB, E=RB, Ctrl=LT, C=RT. F run, M marker, V recenter, R reset, Esc pause, F3 debug.

The outdoor map is now Veterans Memorial Park. Its original wooden ramps are preserved; paths connect the separate metal street park, parking, BMX rollers, lakeside loop and recreation fields. Pause → practice start reaches each main riding area. The metal park includes opposing quarters, a pyramid with stairs/handrail, a ledge with two grind edges, a flat rail and a kicker.

## Riding notes

- Tap your stance-s push button repeatedly to build momentum; holding it on the ground is not an accelerator.
- Soft horizontal input gives a slower spin; full input retains fast 540/720 capability. Countersteer to reduce spin. Spins never auto-complete.
- Light steering preserves fakie. Strong deliberate steering initiates a smooth revert without reversing travel velocity.
- Hold an air-trick button to keep spinning; release early enough to catch. Continuous doubles retain Double naming. A complete catch between separate rotations produces names such as **Barspin to Barspin**.
- Grind assist helps a nearby approach. Slides retain entry yaw and a contact offset; gentle steering adjusts the angle. Frontal rail impacts can bail; small clips can be recovered.
- Ride up the wooden quarters to pop clear of coping. Natural launch strength depends on approach speed; release RS down for an additional player-controlled pop. Pulling back at takeoff increases the inward component; use yaw and forward/back weight in air to prepare the return. Landing position remains ballistic with only a small, capped drift adjustment.
- Counterweight affects posture, pitch and landing quality. It cannot generate flips or sustained air strafing. High drops can still be sketchy or bail.

## Sessions and customization

The main menu contains **Ride, Rider, Scooter, Settings**. Pause includes Return to Marker, Reset Rider, Grind Assist, Restart Session and Exit to Main Menu, plus practice starts, quick map switching and sound.

The builder includes 25 fictional Lazer products across all ten required categories. Variants are authored colorways, not a color picker. All products are included. Front/rear wheels have separate internal slots; the current UI applies a choice to both. All riders and parts share identical gameplay physics.

Loadout IDs and settings save in localStorage. New sessions/maps clear markers and active lines. Ordinary resets preserve the marker. Return restores exact saved position/heading, zero velocity and neutral trick channels; unsafe placement is rejected with feedback.

Base points: 100 per 180, 150 per deck turn, 100 per bar turn/body state, and 75 per manual/grind event. Fakie gives 50 entry points plus 30 per held second after recognition. Completed lines bank points; bails lose unbanked points. The multiplier remains 1 pending a later scoring expansion.

## Verification

```sh
npm run build
npm test
npm run test:browser
npm run test:build2
npm run test:build3
npm run test:advanced
```

The base browser suite starts Vite if needed. Build 2/3 suites use a running preview; set LAZER_URL to its address (their default is port 5174). Windows uses installed Chrome; set BROWSER_EXECUTABLE elsewhere. SOFTWARE_GL=1 enables software graphics in the base suite. Reports/screenshots are in artifacts/.

See [Build 2 completion](BUILD-2.md) and [Build 3 completion](BUILD-3.md). Original briefs remain for reference.

Tests exercise actual Rapier physics, menus, rendering and standard Gamepad inputs. Physical Xbox hardware/rumble feel have not been hands-on tested; software graphics runs are not a desktop-GPU frame-rate benchmark. This is a controlled scooter prototype with support probes and procedural animation, not an articulated ragdoll. Rider flips, optional umbrella/rotor/bartwist, replay, multiplayer and purchasing remain future work as permitted by the briefs.

