# Scoot with Friends

**ALPHA 0.8.0-alpha.1 — NOT READY FOR PUBLIC RELEASE**

A browser-based 3D freestyle scooter game built with TypeScript, Vite, Three.js and Rapier. This repository is PRIVATE alpha source. An existing public test build remains available with the owner's authorization; it is not a finished commercial release. Solo freestyle only; multiplayer is not implemented. First scooter parts brand: **Lazer**.

## Start

Node 22 and npm:

```sh
git clone https://github.com/differentlightproductions-cyber/scoot-with-friends.git
cd scoot-with-friends
npm ci
npm run dev
```

Open Vite's printed local URL. Choose Ride and a park. Connect an Xbox-style controller and press a button. No keys or environment variables are needed to play locally.

```sh
npm test
npm run build
npm run preview
```

The build checks TypeScript and produces browser assets in `dist/client` and an optional Workers-compatible park-publishing service in `dist/server`. Preview serves the browser build. Tests cover controls, tricks, scoring, ground/air mechanics, editor data and publishing authorization. `npm run test:riding` runs the focused browser regression against a dev server on port 5174; see DEVELOPMENT.md for browser prerequisites. There is no separate lint task.

## Controls and state

Settings preserve Pro/Arcade and regular/goofy stance. LS steers, controls airborne spin and counterweight. RS down preloads; complete the upward return to hop. Neutral release stands back up. LT brakes on flat and asks for a coping stall. RT asks for a close rail catch. Tap or hold the stance whip button/B for deck/bar rotations. The in-game Trick Book describes advanced gestures. Y mounts/dismounts; LS click runs on foot. B sits near a bench; movement stands up. A recovers after a crash settles. D-pad Left hold selects local emotes on foot; D-pad Right hold opens a local chat bubble. No online chat exists.

Veterans Memorial Park contains the wooden park, metal area, BMX terrain and connecting grounds. The park editor remains **IN TESTING**. Outfits/helmets and scooter colorways save locally. Rack, fountain and lighting foundations are preserved in source but are not wired into gameplay in this safety baseline. The empty warehouse quick builder and remaining Phase 1 features are pending; see SYSTEMS.md.

## Playable backup

Existing test site: https://scoot-with-friends.nicsoundcloud22.chatgpt.site

The local `releases/Scoot-with-Friends-Windows.zip` contains the player build, local-only server and bundled Node runtime. Extract all and run **Play Scoot with Friends.cmd**. It works without coding credits. Release ZIPs are ignored by Git. `npm run package:windows` regenerates them after a build and preserves timestamped backups. Never share the owner ZIP or ignored owner-private.json; they contain park publishing permission.

## Collaboration

Read [DEVELOPMENT.md](DEVELOPMENT.md), [SYSTEMS.md](SYSTEMS.md), [AGENTS.md](AGENTS.md) and [DEPLOYMENT.md](DEPLOYMENT.md). Use separate clones/task branches for Codex and Claude Code. `main` is tested alpha, `develop` is integration. GitHub Actions only builds/tests; no automatic public deployment or DNS changes. The source remains private.
