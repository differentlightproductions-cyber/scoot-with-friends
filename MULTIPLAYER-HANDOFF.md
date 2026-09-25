# Phone friends / private free-ride

Work branch: `codex/lobbies-domain-repair`. Keep separate from Claude's checkout.
Base: `576833d867a61b31ba57c44f600d2fe74b04ade9` (previous tested room service).

## Player flow
- Hold D-pad Down to open the existing phone. Choose FRIENDS.
- MY PROFILE shows your shareable friend code and lets you set a guest name.
- ADD FRIEND BY CODE sends a request; the other rider accepts inside FRIENDS.
- PRIVATE ROOM creates/joins a room. A friend detail page sends an invitation.
- Accepting an invite joins that room. It never pulls someone into a room automatically.
- Room riders and same-room friends offer TELEPORT. Only your own rider moves, onto a nearby clear, flat surface. Personal markers are preserved.
- Existing MESSAGES handles room chat. Friend detail/room controls include mute, lock and owner kick.

## Authority and persistence
- Local riding, inventory and currency remain unchanged. Movement is client-reported and unranked.
- Friends use a browser-local random 256-bit credential. Public codes are its SHA-256 digest, not display names or phone numbers.
- This is a guest friend identity, not account or cross-device synchronization. Clearing browser storage loses it.
- Server controls requests, mutual friendship, room membership, invitation validity and online status. Invite codes are delivered on explicit acceptance only.
- `ROOM_SOCIAL_FILE=/data/social.json` enables persistent friend links on a mounted volume. No credential is stored in this file.
- Without durable storage, phone explains contacts reset after service restart. Running rooms are always temporary.
- Railway uses the existing service and manual deployments. Do not enable automatic deploys or create paid resources without owner approval.

## Commands
- `npm test`
- `npm run build` (set public `VITE_ROOM_SERVER_URL` before building for internet rooms)
- `npm run build:rooms` / `npm run start:rooms`
- `npm run rooms` for development; see `.env.example`.
- New phone browser regression: `node tests/friends-phone.browser.mjs` (isolated local Vite 5183, room server 8788).

## Files
- `server/social.ts`, `server/rooms.ts`, `server/start-rooms.ts`: guest social service and room binding.
- `src/network/social.ts`, `client.ts`, `teleport.ts`: presence, invitations, room lifecycle and safe local relocation.
- `src/phone/friends.ts`, `apps.ts`, `src/main.ts`: existing phone integration; no physics or art changes.
- `tests/social.test.ts`, `tests/friends-phone.browser.mjs`: server security/persistence and two-browser flow.

Deployment and measured verification results are recorded in `DOMAIN-MULTIPLAYER-PROGRESS.md`.
