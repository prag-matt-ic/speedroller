# Multiplayer transport spike

Phase 0 evidence for a **single room with five racers and 20 spectators**. This is a
loopback-only validation service, not a deployable multiplayer backend. Extend this
service in Phase 1; do not retain a second demo server alongside it.

Requires Node 24+, root project dependencies (for TypeScript), and this package's
isolated dependencies. The root package and lockfile are unchanged. The `.mts` source
uses Node's native type stripping and is outside the app's current TypeScript include
patterns.

```sh
cd server/multiplayer
npm ci
npm run typecheck
npm run validate
# Save a fresh report; overwrites the named output file:
node --expose-gc validate.mjs ../../docs/multiplayer-phase0-results.json
# Short assertion smoke test, not a capacity measurement:
SPIKE_SECONDS=3 npm run validate
```

The harness starts and stops its own child relay on an ephemeral `127.0.0.1` port.
Each scenario measures 30 seconds after joining; the complete run takes roughly two
minutes. No game server, browser, credentials, Railway service, or database is needed.

The relay uses real WebSockets, validated commands, server-assigned membership,
owner-only start, cached join snapshots, 20 Hz pose batching, and bounded outgoing
queues. The harness asserts capacity and role rules, late joins with stationary poses
and prior finishes, final snapshots, and isolation of a non-reading spectator.

Delay profiles preserve message order and add seeded application delay in each
direction. They do **not** emulate packet loss, constrained bandwidth, TCP retransmission,
TLS, or Railway routing. The separate pressure test uses synthetic traffic to fill a
paused socket; its skipped-message count is not normal gameplay traffic.

CPU measurements cover the relay process only. Bytes are JSON payload bytes, excluding
WebSocket/TCP/TLS overhead. Heap is sampled after explicit GC. State age uses the harness's
common clock; adding 100 ms is an interpolation estimate, not a browser rendering test.

Before deployment, Phase 1 must add real rooms/course compatibility, readiness and
scheduled countdown, clock sync, disconnect/DNF policy, deadlines, rematches, expiry,
origin checks, pre-join/connection limits, heartbeat, and production shutdown/config.
The placeholder course and protocol version 0 are deliberately incompatible with a
future game client. There is no frontend connection or solo-score integration.

See [the validation report](../../docs/multiplayer-phase0-validation.md) and
[implementation plan](../../docs/multiplayer-prototype-plan.md).
