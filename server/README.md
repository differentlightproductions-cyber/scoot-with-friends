# Private room service

The browser game uses a separate WebSocket room service. Static hosting cannot run it.

Build with `npm ci && npm run build:rooms`, then run `npm run start:rooms` under a process supervisor. The service listens on `ROOM_PORT`, or on the hosting platform's `PORT` when `ROOM_PORT` is unset. Set `ROOM_HOST=0.0.0.0` when the platform needs a public interface, `ROOM_ORIGINS=https://scootwithfriends.online`, and leave `ROOM_CAPACITY=8`. Put the service behind HTTPS/WSS and set the frontend build's public `VITE_ROOM_SERVER_URL=wss://<room-host>`. This URL is public configuration, not a secret. `/health` returns service availability and room count.

Rooms and builds currently live in memory. Restarting the service ends active rooms. Each room is private by its random invite code, has at most eight riders, and retains disconnected riders for 30 seconds. The server relays validated visual poses and Warehouse pieces; it does not simulate or authorize player physics, purchases, or account state.

Deploy the frontend and room service from the same tested revision. Protocol 2 rejects an older browser build and asks its rider to refresh.
