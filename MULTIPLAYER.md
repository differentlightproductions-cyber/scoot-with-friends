# Private free-ride checkpoint

Branch: feature/private-multiplayer. GitHub remains on hold.

## Local play
Node 22. npm ci, then npm run rooms in one terminal and npm run dev -- --port 5182 in another. Open http://127.0.0.1:5182 in separate browser profiles. Main menu > Private Free-ride > Create Private Room. The friend chooses Join Room and enters the copied invite/code. Solo remains available.

The room owner can choose Techno Gravity Shop from Maps or Shops during a Sesh. The room changes together; old-generation movement is rejected. Local rack storage and live park editing are explicitly unavailable in rooms. Warehouse rooms are not enabled yet.

## Configuration and production preparation
ROOM_HOST defaults to 127.0.0.1; ROOM_PORT to 8787; ROOM_CAPACITY to 2. ROOM_ORIGINS is a comma-separated exact browser-origin allowlist (default local port 5182). VITE_ROOM_SERVER_URL is the browser-visible ws/wss service address, set before building. It contains no secrets.

npm run build builds the website. npm run build:rooms and npm run start:rooms build/start the separate Node service. GET /health returns non-sensitive health status. SIGINT/SIGTERM closes connections. Use a TLS reverse proxy for wss on HTTPS sites. Do not expose this development server directly or change DNS without a separately approved deployment arrangement.

The existing Sites Worker does not host this persistent Node service. No live internet room URL is deployed or verified. Existing public solo game remains available. Private invites do not protect the whole website.

## Authority and limits
Server owns identities, room membership, owner controls, reconnect credentials, map generation and message routing. Movement/tricks are client-reported, unranked, not cheat-proof. Local physics never waits for packets. Remotes run presentation only, with no rider-to-rider collisions. Appearance IDs are validated; ownership and Credit are never granted from remote packets.

20 Hz snapshots, interpolation with a 100 ms arrival buffer, no unbounded extrapolation. 16 KiB message cap, finite bounded poses, validated catalog IDs, room isolation, origin checks, creation/join rates, chat limits, bounded send backlog, heartbeat and 30-second reconnect/loading grace. Secrets are not logged.

## Verified
45 unit tests, TypeScript checks, production frontend build. Desktop Windows Chrome, same-machine independent browser contexts: two riders, separate-room isolation, walking, Bri, bail/recovery, wave, plain-text chat, reconnect same identity, owner transfer and travel to Techno Gravity Shop. Eight simulated WebSocket clients pass membership/capacity tests; this is not eight rendered/device-tested riders. Default cap remains two.

## Remaining
Warehouse shared read-only layouts; fuller animation/latency/security regression coverage; controller-only room dialogs; distant avatar performance and sound limits; four/eight rendered-player measurements; physical mobile/controller tests; different-device/LAN and internet tests; approved persistent host and TLS deployment. Map fingerprints reject mismatched park content rather than synchronizing a host's edited park. Accounts are an isolated tested data layer, not a completed sign-in/admin flow.
