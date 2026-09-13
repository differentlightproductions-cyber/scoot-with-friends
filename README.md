# Scoot with Friends

Play online: https://scoot-with-friends.nicsoundcloud22.chatgpt.site

Windows portable copy: releases/Scoot-with-Friends-Windows.zip. Extract all and double-click Play Scoot with Friends.cmd. This works independently of ChatGPT or coding credits.

A playable browser scooter game with Warehouse 01, the photo-inspired Sunset Plaza 02, controller menus, a modular Lazer scooter builder, three rider presets, session markers, and local loadout saving. TypeScript, Three.js, Rapier and Vite. Everything runs locally without an account or backend.

## Play

```sh
npm install
npm run dev
```

Open the address Vite prints. Choose **Ride**, choose a park, then ride. Connect an Xbox-style controller and press a button to expose it to the browser. Keyboard menus use W/S, Enter and Esc.

Current development preview: **http://127.0.0.1:5174/**. Local saving is specific to the browser and origin; another port or browser has a separate profile.

See [Sunset, traversal and advanced trick update](BUILD-4-5.md) for the new stance setting, on-foot A jump/climb, Y coping setup, analog drop-in, fingerwhips, repeated rewinds, bri/kickless gestures and body-pose controls.

## Controls

| Control | Behavior |
|---|---|
| Left Stick | Ground steering; horizontal yaw/spin in air |
| LS forward/back in air | Forward shifts body forward and nose down; back shifts rearward and nose up |
| A | Hold to preload, release to hop; also hop out of grinds/manuals |
| X | Ground: tap to push. Air: tap one tailwhip, hold continuous whips |
| LB + X | Heelwhips; tap or hold |
| B | Air: tap one barspin, hold continuous bars. No ground braking |
| RB + B | Reverse barspins |
| LT | Analog ground brake |
| RT | Transition compression/pumping; widen an intentional rail catch |
| Y | Ground: dismount/remount. Air: hold no-hander |
| LB + Y / RB + Y | Tuck no-hander / one-footer |
| LS click | Toggle running on foot, carrying the scooter at waist height |
| Right Stick | Camera; air trick speed; manual balance; grind lean |
| LB + RS down/up | Enter manual / nose manual |
| RS click | Recenter camera |
| D-pad Up | Hold 0.75 seconds to set a marker; tap/release to return |
| View | Reset rider at current practice start |
| Menu | Pause/resume |

Keyboard: A/D steer, W/S weight, Space hop, X push/whip, B bars, Shift LB, E RB, Ctrl LT, C RT, arrows RS, Y dismount/body, F run, M marker, V recenter, R reset, Esc pause. H shows controls; F3 shows diagnostics.

Menus: D-pad/LS selects, A confirms, B goes back. RS rotates/zooms previews. In Pause, selecting **Move to practice start** and pressing left/right changes the practice start without a mouse.

## Riding notes

- Tap X repeatedly to build momentum; holding it on the ground is not an accelerator.
- Soft horizontal input gives a slower spin; full input retains fast 540/720 capability. Countersteer to reduce spin. Spins never auto-complete.
- Light steering preserves fakie. Strong deliberate steering initiates a smooth revert without reversing travel velocity.
- Hold an air-trick button to keep spinning; release early enough to catch. Continuous doubles retain Double naming. A complete catch between separate rotations produces names such as **Barspin to Barspin**.
- Grind assist helps a nearby approach. Slides retain entry yaw and a contact offset; gentle steering adjusts the angle. Frontal rail impacts can bail; small clips can be recovered.
- Ride up Sunset's quarters to pop clear of coping. Natural launch strength depends on approach speed; release A for an additional player-controlled hop. Pulling back at takeoff increases the inward component; use yaw and forward/back weight in air to prepare the return. Landing position remains ballistic with only a small, capped drift adjustment.
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

