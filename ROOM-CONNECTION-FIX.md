# Room connection repair — 2026-09-25

The join handshake and appearance updates previously sent the entire saved profile. A progressed save with 500 reward receipts exceeds the room server's 16 KB message limit. An unhandled WebSocket error could also crash the service after an oversized frame.

- Send only the existing validated visual appearance; do not send wallet, inventory or progress.
- Keep the server message limit; handle malformed/oversized socket failures per connection.
- Preserve useful connection errors; stop retries after explicit rejection and handle preparation failures.
- Main-menu joins now show ROOM CONNECTED, the copyable room code, COPY INVITE and ENTER PARK. The confirmation owns input and suspends local movement.
- Railway allowed origins now include the secure www variant. Apex accounts and HTTPS verified; owner confirmed the phone had been showing an older deployment. No account code or credentials changed.

Verification: full unit suite and production build passed; four focused client/server regressions passed, including >16 KB -> close 1009 followed by successful creation on the same server. Room server build passed. Two actual desktop Chrome contexts with 500-receipt saves created/joined and displayed the code; join packets 2120/2152 bytes, appearance update 1911 bytes; no private save data, page errors or input leakage. Physical mobile multiplayer and separate-network devices are not tested.

Tests: tests/network-client.test.ts; tests/room-connect.browser.mjs.
GitHub and public deployment receipts live in ignored artifacts/handoff to avoid changing the published commit after release.
