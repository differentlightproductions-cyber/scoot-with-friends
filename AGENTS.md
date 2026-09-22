# Project continuity

- Art direction: detailed stylized realism replaces every older low-poly restriction. Read ART-DIRECTION.md. Build convincing human anatomy, smoothly deforming clothing and mechanically coherent Lazer scooters; never revert to visibly primitive placeholders.

- Game title: **Scoot with Friends**. The first scooter parts brand remains **Lazer**.
- Preserve a working playable release before further changes. The user wants a way to play even when coding credits run out.
- Public game: https://scoot-with-friends.nicsoundcloud22.chatgpt.site
- Windows download: `releases/Scoot-with-Friends-Windows.zip`. It contains the built game, local-only server, launcher and bundled Node runtime. Keep the previous working ZIP when updating it.
- After requested changes pass appropriate checks, refresh the Windows copy and publish the requested update to the existing Sites project. Never create a second Sites project for this game.
- Small box stays in the original middle lane, x=-4..1. Large transfer is to its left; spine is to its right. Preserve connected surfaces.
- This is currently a solo freestyle game. Do not imply that the name means multiplayer is implemented.

# Private alpha workflow

- GitHub source of truth: `https://github.com/differentlightproductions-cyber/scoot-with-friends` (PRIVATE). Never change visibility to public.
- `main` is tested alpha; `develop` is integration. Use task branches for larger work. Separate clones/worktrees for Codex and Claude; never concurrent edits in one checkout.
- Preserve working physics, RS contexts, stance, Pro/Arcade mapping and browser performance unless explicitly targeted. Do not rewrite functioning systems for cleanup.
- Read DEVELOPMENT.md and SYSTEMS.md for architecture, commands and known pending features. Inspect status/diff, preserve uncommitted user work, and run `npm test` and `npm run build` before completion.
- Never commit credentials, `.env`, owner-private.json, or owner ZIPs. Keep environment examples placeholder-only.
- The owner corrected the repository brief: public updates to the EXISTING game are authorized after tests. Do not enable automatic production deployment, create a second Sites project, or change domain/DNS without explicit authorization. GitHub remains private.
- Latest owner rule: NEVER push to GitHub unless the user asks for that push and explicitly answers yes first. Earlier push approval does not authorize future pushes. Keep the latest tested version active on the existing public website and refresh playable copies; Sites publishing is separate from GitHub synchronization.

- Final camera rule (September 14 update): mounted RS ALWAYS controls riding/tricks, including stopped. On-foot RS controls camera. No stationary trick-setup toggle. L3 Run and R3 Recenter remain.
- Current active checkout: work/complete-update; release details and playable copies are listed in CURRENT-RELEASE.md. GitHub update is on hold at the owner?s latest request.
