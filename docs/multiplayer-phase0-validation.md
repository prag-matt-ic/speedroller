# Multiplayer Phase 0 validation

Recorded **25 October 2026**, on branch `speedroller`, baseline commit
`7cd5d3246aae4217ab98a10a7dd919d03ebbc26e`. No branch switch or historical multiplayer
code import. Changes for this work are limited to this report, the plan, measurement
JSON, and the isolated `server/multiplayer/` spike. Concurrent renderer edits were
observed and left untouched.

**Decision: proceed with the WebSocket room service in Phase 1.** Five racers and 20
external spectators fit comfortably in this local relay test, and late arrivals can
bootstrap the current race without replaying its history. This validates the transport
shape, not production capacity or the rendered latency target. Keep the existing Phase 4
latency gate: the 150 ms RTT model estimates **315 ms p95 displayed-state age**, above
the proposed **300 ms** target. Tune and measure in the real client before accepting it.

Phase 0 transport research is complete. The combined solo-baseline checklist item remains
open because a fresh-user manual run could not get past loading on an isolated origin.

## Reproducible test and measurements

Run commands are in [the spike README](../server/multiplayer/README.md).
[Raw measurements](multiplayer-phase0-results.json) preserve all values and assertions.
Environment: Apple M4 Pro, macOS arm64, Node 24.22.1. Each scenario runs a separate relay
process with five synthetic racers publishing at 20 Hz and 20 external spectators;
the relay broadcasts at 20 Hz to all 25 clients. Ten spectators join after movement
starts. Each steady-state measurement lasts 30 seconds.

The client harness uses actual loopback TCP/WebSocket connections. Delay scenarios add
ordered, seeded application delay independently in each direction: 75 ±15 ms or
150 ±30 ms. They do not simulate TCP packet loss, bandwidth limits, or an actual WAN.
The delay scheduler was corrected to preserve FIFO ordering before the recorded run.

| Measurement | Loopback | 150 ms RTT model | 300 ms RTT model |
| --- | ---: | ---: | ---: |
| Measured RTT p50 / p95 | 1.0 / 14.9 ms | 153.0 / 173.0 ms | 305.8 / 340.8 ms |
| Source-to-receive age p95 | 53.3 ms | 215.4 ms | 376.2 ms |
| Estimated age with 100 ms interpolation | 153.3 ms | **315.4 ms** | 476.2 ms |
| Join acknowledgement/bootstrap p95 | 11.7 ms | 171.8 ms | 332.5 ms |
| Mean pose / five-racer batch payload | 218 / 1,554 B | 218 / 1,556 B | 219 / 1,559 B |
| Relay outbound payload | 0.764 MB/s | 0.774 MB/s | 0.773 MB/s |
| Relay CPU, fraction of one core | 3.35% | 3.75% | 3.93% |
| Post-GC heap start → end | 14.89 → 15.24 MB | 14.99 → 15.24 MB | 15.02 → 15.21 MB |
| Peak relay RSS | 111.43 MB | 111.62 MB | 111.54 MB |
| Event-loop delay p99 | 17.8 ms | 11.7 ms | 12.0 ms |
| Maximum nominal outgoing queue | 0 B | 0 B | 0 B |
| Nominal skipped batches / congestion disconnects | 0 / 0 | 0 / 0 | 0 / 0 |

MB is decimal. Payload totals exclude framing, TLS, and network overhead. CPU excludes
clients and rendering. Join timing excludes game asset loading. Pose timestamps are
round-tripped from the common harness clock, so these ages do not validate clock sync.
The interpolation row simply adds 100 ms to received-state age; no rendered interpolation
was implemented. Brief post-GC heap changes do not establish long-session memory safety.

At this rate, a continuously full room sends roughly **2.8 GB of JSON payload per hour**
before overhead. Spectator bandwidth, rather than local CPU, deserves attention during
Railway staging. This is a traffic estimate, not a hosting price or a multi-room capacity
promise.

Assertions passed in all three scenarios:

- Owner cannot start alone; a non-owner cannot start. Five racer slots are accepted;
  the sixth is rejected. New racers are rejected after entry closes.
- Twenty external spectators are accepted; the twenty-first is rejected. A spectator
  cannot submit a finish.
- The first accepted join message is the complete snapshot, before live pose batches.
  Ten mid-race spectators each receive all five current racer poses.
- A replacement spectator receives cached stationary poses and an already accepted
  finish without waiting for movement. Another joins directly into results with all
  five finishes; existing watchers agree on those racer records.
- Sustained nominal traffic has no unexpected disconnects or congestion drops.

A separate loopback stress test pauses a real spectator socket and injects artificial
8 KiB packets to exhaust its receive path. The relay shed 28,694 replaceable sends,
observed 65,824 queued bytes, then disconnected that spectator after sustained congestion.
All five racer sockets remained open. This runs after the results checks and proves the
queue guard activates; it is not a measurement of in-race latency under a slow watcher.

## Current integration map

These are named integration points for later phases, not changes made in Phase 0.

| Current code | Observed behaviour / required integration |
| --- | --- |
| `stores/timeSlice.ts` (`getAttemptStartPhase`, `beginAttempt`) | Saved valid names enter COUNTDOWN directly. START must offer mode choice for both saved and missing names; preserve direct solo retry. |
| `stores/timeSlice.ts` (`finishSpeedRun`, retry/reset actions) | Attempt IDs reject stale callbacks; finish snapshots once and submits solo results. Preserve guards and keep multiplayer finishes out of solo persistence. |
| `components/platform/speedRun/SpeedRunLine.tsx` | Physical start requires lobby state; finish requires RUNNING and a local `player` collider. Remote marbles and spectators must never trigger these sensors. |
| `components/ui/speedRun/SpeedRunCountdownOverlay.tsx` | Local GSAP countdown waits for readiness, warmup, safe placement, and visibility; hiding the page can restart it. Multiplayer needs the absolute server GO deadline after local loading. |
| `hooks/usePlayerPosition.ts` | Ref subscriptions provide world positions without per-frame React updates. Reuse this pattern for outbound sampling and render buffers. |
| `hooks/useGameFrame.ts` | Overlays suppress the game frame callback. Room networking and spectator interpolation need a lifecycle independent of that pause gate. |
| `components/Camera.tsx` | Flat/cylinder follow logic reads the local player's position. Add a separate view target rather than rewriting gameplay position. |
| `components/platform/Platform.tsx` | Visible row/stage follows local position and player recovery is mounted here. Spectators need view-driven visibility without recovery or local physics. |
| `components/GameUniforms.tsx` | `uPlayerWorldPos` follows the player and `uTime` uses local frame time. Separate view context from authoritative race timing. |
| `components/platform/tiles/Tiles.tsx`, `useTileTrail.ts` | Fade, ghost/drop visuals, shadow and trail depend on local position/time. Physical floor remains static. Spectator camera and fades must agree; private trail history can remain deferred. |
| `components/floatingTiles/FloatingTiles.tsx` | Cosmetic GPU tiles use camera/frustum and local-player distance. No shared collider motion is required for these effects. |
| `components/platform/rings/Rings.tsx` | Fixed collider placements and per-attempt collection; rotation/exit effects are visual. Keep collection local; shared ring consumption is unnecessary. |
| `components/lighting/SceneLights.tsx` | The current player light follows `usePlayerPosition` and palette. Include it in the spectator view-target audit after renderer work settles. |
| `components/platform/scenery/Pillars.tsx` | Instanced static scenery with route fade. Verify the selected spectator view keeps these fades coherent. |
| `components/ui/miniMap/MiniMap.tsx` | Reads local course position/row/status. Spectator progress must follow the selected entrant. |

The inspected flat-course gameplay uses fixed world geometry. Cosmetic animation does
not require deterministic lockstep physics. This does not establish cross-build course
compatibility: Phase 1 still needs explicit course/rules versions, and cylinder
multiplayer remains outside v1 acceptance. Renderer consumers may change concurrently;
recheck this map immediately before Phase 4 integration.

## Solo baseline and checks

- `npm test`: **92 passed, 0 failed** at the start of this work. Existing lifecycle tests
  cover valid-name countdown, missing-name setup/cancel, finish idempotency, retry/stale
  saves, lobby return, wrong-phase contacts, and failed persistence. Fixed-world/course
  tests cover coordinates, static physics/sensors, position subscriptions, and map paths.
- Manual returning-user baseline: entered the lobby, crossed START, observed countdown
  and active timer, and returned to the lobby. A later baseline run completed and the UI
  reported **“Time saved”**, **96.15 s**, under the existing **CylinderTest** name. This
  was the app's automatic solo submission; no score cleanup was attempted.
- Manual fresh-user baseline: tried the isolated `127.0.0.1:3000` origin in Chrome and
  the in-app browser. Both remained at the loading/landing screen without an Enter
  control. Root cause is unverified. The missing-name path passes its automated test,
  but the manual fresh-user journey remains outstanding. Test tabs were closed.
- Isolated relay typecheck passed. The full 30-second-per-profile benchmark and a
  three-second-per-profile assertion smoke run passed.
- Root TypeScript file enumeration did not include the spike `.mts`/`.mjs` sources.
  Root dependencies, application code, and renderer configuration were not edited.

## Research decisions and remaining gates

| Source checked | Decision / evidence still required |
| --- | --- |
| [Railway networking specifications](https://docs.railway.com/networking/public-networking/specs-and-limits) | WSS is supported and WebSockets are exempt from the documented HTTP duration/inactivity limits. Still test the deployed frontend upgrade and real network latency in Phase 5. |
| [Railway regions](https://docs.railway.com/deployments/regions#region-options) | Select **Amsterdam, EU West Metal (`europe-west4-drams3a`)** for the initial UK/EU trial. This is a planned placement, not a deployed or measured endpoint. Reconsider if testers are elsewhere. |
| [Railway healthchecks](https://docs.railway.com/deployments/healthchecks), [deployment teardown](https://docs.railway.com/deployments/deployment-teardown) | Production service will bind `0.0.0.0:$PORT`; `/health` is deployment readiness, not continuous uptime monitoring. One replica, in-memory rooms, explicit socket closure on replacement; verify actual restart behaviour in staging. |
| [Official ws documentation](https://github.com/websockets/ws#usage-examples) | Use HTTP upgrade + `ws` with compression off. The spike validates this service shape; heartbeat, origin checks and production connection limits remain Phase 1 work. |
| [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) | No automatic backpressure: retain explicit queue bounds and latest-state buffers. The paused-reader test exercised the server queue guard. Browser queues remain untested. |
| [Snapshot interpolation](https://gafferongames.com/post/snapshot_interpolation/) | Keep 20 Hz as the starting rate. Tune interpolation delay from measured jitter/underruns instead of treating 100 ms as a proven optimum. |
| [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) | Use common elapsed time through hidden tabs. Test resume and physics clamping on real mobile devices; a local browser check is insufficient. |

Keep the **p95 rendered-state age <300 ms under the tested 150 ms RTT conditions** and
**start skew ≤100 ms** targets. Neither is passed by this spike. Before changing transport,
measure actual browser buffers and independent device clocks, tune the interpolation
window and batching cadence, and test packet loss plus constrained bandwidth. If fresh
poses remain trapped behind reliable-stream retransmissions, compare a WebRTC movement
channel with its TURN/signaling and spectator-distribution costs. There is no evidence
here requiring that extra infrastructure yet.

Do not deploy the spike as-is: it has one placeholder room, immediate start, no countdown
readiness/clock synchronization, no DNF/reconnect/rematch lifecycle, and only local-test
security limits. Phase 1 should extend the same service and replace its temporary test
protocol. Real WSS/WAN testing, rendered interpolation, shared start timing, 30-minute
soak, multi-room capacity, and the fresh-user manual baseline are still outstanding.
