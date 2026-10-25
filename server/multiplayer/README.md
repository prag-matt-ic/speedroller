# Multiplayer room service

Room service for Phases 1–2 of the [prototype plan](../../docs/multiplayer-prototype-plan.md). One Node.js
HTTP/WebSocket service holds private rooms in memory. Each room admits **2–5 racers**
and **20 external spectators**. The server coordinates membership, timing and results;
physics remain local and remote racers do not collide. The frontend now connects room
entry, readiness, and start controls; playable racing and spectator rendering are later phases.

The Phase 0 relay was extended here, not retained as a second server. Its recorded
[measurements](../../docs/multiplayer-phase0-results.json) are historical evidence;
`validate.mjs` now exercises protocol v1 against this service.

## Run and build

Requires Node 24+ and the repository's root dependencies for resolving shared Zod
sources. Service dependencies and build output are isolated; root scripts/lockfile and
renderer files are unchanged.

```sh
# From the repository root (after the normal root dependency install):
npm ci --prefix server/multiplayer
npm run dev --prefix server/multiplayer
npm run typecheck --prefix server/multiplayer
npm test --prefix server/multiplayer
npm run build --prefix server/multiplayer
npm start --prefix server/multiplayer
```

Run dev OR start on the selected port, not both. `dev` runs source with Node's native
TypeScript stripping; `build` compiles the service and browser-safe shared `.mts` files
into `dist/`, and `start` runs compiled JavaScript. Nothing imports server modules into
Next.js. Build from the checkout with shared sources present; deployment packaging is
Phase 5.

| Variable | Default / meaning |
| --- | --- |
| `PORT` | `8080`; listen on `0.0.0.0`. `/health` returns 200 while serving. |
| `ALLOWED_ORIGINS` | `http://localhost:3000`; comma-separated exact HTTP(S) frontend origins, no trailing slash. Missing or mismatched WebSocket Origin gets HTTP 403. |

Locally connect to `ws://localhost:8080`. Railway will terminate TLS for public WSS in
Phase 5; this process does not provision certificates or a Railway service. SIGTERM
and SIGINT notify rooms, close sockets, and force remaining connections shut after one
second. A restart loses all rooms. There is no database or solo leaderboard access.

## Protocol v1

[Shared protocol](../../shared/multiplayer/protocol.mts) exports Zod schemas and inferred
types for both directions, limits, course matching and `roomUrl()`. Browser consumers
must parse incoming messages with `serverMessageSchema`. Every client command includes
`protocolVersion: 1`; unknown properties are rejected. No command accepts a client-
supplied owner or member identity. Commands operate only on the socket's current room.

| Client command | Payload / behaviour |
| --- | --- |
| `create` | `profile: {name, colour}`, `course`. Returns a full snapshot with server-generated room/member IDs and owner. |
| `inspect` | Room ID and course. Returns `room-info` phase and capacity without taking a slot or refreshing room expiry. |
| `join` | `roomId`, `role: racer / spectator`, profile, course. Exact course match required for either role. |
| `ping` | `clientTime` from `performance.now()`. Returns `pong` with echoed time, server monotonic time and a one-use token. |
| `sync` | Five distinct tokens from recent pongs (within 30 s). Returns `synced`; required before readiness. Tokens are socket-bound. |
| `ready` | Matching course and initial pose. Send only after assets/course and clock sync are ready. No Ready button is needed. |
| `start` | Latest snapshot `revision`. Owner-only, 2–5 connected ready racers; atomically closes entry and schedules GO 3 seconds ahead. Stale revision requires a fresh snapshot and explicit retry. |
| `pose` | Current `raceId`, pose. Racer-only during racing; at most 40/s accepted, clients should send 20/s. |
| `finish` | Current race ID, elapsed milliseconds and a final pose with a newer sequence. Accepted once; no later pose changes that finish. |
| `snapshot` | Request fresh complete state; useful after asset loading. Does not extend room lifetime. |
| `new-race` | Completed race ID, owner-only. Reopens the same room URL and resets readiness/poses; needs another explicit Start. |
| `claim-slot` | Spectator explicitly takes a vacant racer slot while waiting, then completes readiness. |
| `leave` | Removes membership and acknowledges `left`. Owner departure before GO closes the room. |

Course fields are `layoutVersion`, `rulesVersion`, `topology`, `columns`. The owner
provides the supported build's versions. The UI hashes loaded rows/surface with SHA-256
and sends `race-v1:<platformVersion>` for rules; bump this identifier with rule changes.
Room admission accepts flat/cylinder courses with exact matching, because the current
game's default course is cylindrical. This is lobby compatibility, not a promise of
completed cylinder multiplayer physics or spectating.

Profile names use the existing 6–12 character rule, contract-tested against the solo
schema without importing game modules. Colours are six-digit hex strings. UI must render
names as text. Room IDs are unguessable UUIDs, not owner credentials. `roomUrl(baseUrl,
roomId, watch)` preserves the game pathname/query and adds `room` and optional `watch=1`.

A pose has increasing integer `sequence`, bounded world `position`, unit quaternion
`rotation`, and nondecreasing `respawn` generation. The server timestamps receipt; no
client timestamp is treated as authoritative. Keep initial, respawn and finish samples
explicit. No physics correctness or anti-cheat verification is claimed.

`estimateClockOffset()` in [clock.mts](../../shared/multiplayer/clock.mts) uses the
lowest-RTT sample from at least five exchanges. Record the receipt time locally, apply
the returned offset to `performance.now()`, and refresh periodically in the future client.
The sync acknowledgement verifies receipt of pongs, not honesty or measured device skew.
Display `startAt - synchronizedNow`, and use elapsed time from the same deadline after
resuming; never restart a private countdown.

Every admission receives a `snapshot` before live updates: self/owner identity, owner
connection status, room revision, course, phase, race ID, GO time, current members and
frozen entrant slots with poses/status/finishes. Spectators can join waiting, countdown,
racing or results. The server broadcasts `poses` at up to 20 Hz during racing. The client
must ignore obsolete race IDs/revisions and use bounded interpolation buffers.

Finishes are sorted by accepted elapsed time rounded to centiseconds; ties share place
and subsequent places skip tied entrants (1, 1, 3). Finish arrival order is irrelevant.
The server rejects elapsed time beyond its clock +500 ms. Remaining entrants become DNF
at three minutes after GO. A disconnect after an accepted finish preserves it.

During countdown, a racer leaving cancels the race ID and reopens waiting; owner leaving
closes the room. During racing, a disconnected racer gets DNF and can return only as a
spectator. Owner loss allows the race to finish but prevents rematch. No owner transfer
or session recovery is implemented. Empty rooms disappear immediately; waiting/results
expire after ten minutes without membership changes or successful Start/New race.
Spectator pings, snapshots and pose traffic do not refresh that deadline.

## Limits and failure handling

The service validates all input, limits inbound messages to 8 KiB, separates 40 pose/s
and 10 control/s fixed windows, and caps 100 rooms/500 connections. Each direct peer IP
gets 60 upgrades and ten room creations per minute. Source counters expire and are bounded.
Unjoined sockets close after ten seconds; native ping runs every five seconds and a
connection without pong for fifteen seconds is removed. Missing/mismatched origins are
rejected even for native clients; test clients set the allowed Origin explicitly.

Above 64 KiB queued output, replaceable poses are skipped. A blocked control event,
queue above 256 KiB, or congestion lasting five seconds closes that connection. The next
visit must bootstrap afresh. Compression is disabled. Typed error codes and room closure
reasons are exported in the protocol; clients should show them rather than blindly
replaying lifecycle commands.

**Proxy limit:** IP limits currently use the actual socket peer and deliberately ignore
forwarded headers. Behind Railway this may group users under a proxy address. Verify
Railway's trusted proxy chain and configure validated source-IP handling in Phase 5
before exposing the service. Origin checks do not authenticate non-browser clients.

## Verification

```sh
npm test --prefix server/multiplayer
npm run validate --prefix server/multiplayer
# From server/multiplayer, save a new 30-second capacity result:
node validate.mjs ../../docs/multiplayer-phase1-results.json
# Fast smoke run, not capacity evidence:
SPIKE_SECONDS=3 npm run validate --prefix server/multiplayer
```

Tests use real WebSocket connections with a controllable monotonic clock. They cover
simultaneous fifth-slot attempts, separate spectator capacity, readiness/sync, owner-only
start, countdown cancellation, stale/cross-room messages, late snapshots, finish/tie/DNF
rules, rematch, expiry, heartbeat, validation, connection/message limits and shutdown.
Queue policy boundaries and the solo username contract have focused checks.

The load harness uses this same service with a real clock, five publishers and 20 late
spectators; it asserts sustained updates for **every** client. Its traffic is synthetic
and excludes rendering/TLS/WAN. The Phase 0 latency gate and fresh-user manual loading
baseline remain outstanding; they do not block this isolated backend work.


## Frontend room UI

In development the UI defaults to `ws://<browser-host>:8080`; production needs
`NEXT_PUBLIC_MULTIPLAYER_URL=wss://<service-domain>` at frontend build time. Match
`ALLOWED_ORIGINS` to the actual game origin, including port. Solo entry does not connect
or depend on this service. Restart the service after protocol changes; hot-refreshing
the persistent provider ends its current room connection and requires re-entry.

The loaded game's layout hash includes rows and surface metadata. Serve both clients
from the same build; course edits during development can correctly produce a mismatch.
The UI only sends `ready` after existing loading/warmup/placement gates and clock sync.
Phase 3 connects the shared GO time to the local attempt, sends poses at up to 20 Hz,
and displays interpolated remote marbles without physics bodies. Finishes go only to
the room service; results include ties/DNF and the owner can reopen the room for a
rematch. Countdown cancellation and rematch both require fresh grid readiness.
Spectators now receive a watch-only scene, racer selection, close/wide camera controls,
live progress/results and an explicit reconnect action. They never mount a local physics
body or send racer updates. Late arrivals and rematches bootstrap from the newest snapshot. Remote marbles temporarily share the local palette/effects to keep this
integration separate from renderer work. Results remain client-reported, not anti-cheat.


Phase 4 controlled spectator load check:

```sh
SPIKE_SECONDS=5 node server/multiplayer/validate-spectators.mjs
```

Runs five racers and 20 watchers at 50/150/300 ms simulated RTT with jitter,
ordered TCP-recovery stalls and one paused TCP reader. Reports interpolation capture
age, latest-pose age, heap deltas, scheduler queues and server buffer counters.
This is not a GPU presentation or real-network benchmark; see the prototype plan
for measured results and remaining device/soak checks.
