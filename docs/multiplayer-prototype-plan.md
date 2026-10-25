# Player Versus Player Prototype Plan

Status: **Phase 2 mode choice and room UI implemented locally. Racing/spectator rendering
and deployment are still later phases; fresh-user manual baseline remains outstanding.** See the
[Phase 0 report](multiplayer-phase0-validation.md) for measurements and remaining gates.

Updated: **25 October 2026**

Build private races for **two to five racers**, including the owner, with live spectators
who can join before or after racing begins. Entering the physical start opens a choice
between Single player and Multiplayer. Multiplayer creates a room and a share URL;
the owner can start once at least one other racer has joined and the racers have loaded.

Use a small Node.js WebSocket service on Railway to coordinate rooms and distribute race
snapshots. Keep local movement and physics in the browser. This is a casual multiplayer
prototype: the server controls membership and race lifecycle, but does not verify physics
or provide cheat-resistant results.

This plan extends the [race experience](race-first-experience-plan.md) and
[course design](race-course-and-speed-design.md). It supersedes their exclusion of
multiplayer and the automatic countdown for returning players at first entry to START.
Preserve the existing course, handling, renderer, saved preferences, and solo results.
The historical `origin/feat/multiplayer` branch is reference material only; do not merge
or cherry-pick it wholesale, switch branches, or overwrite concurrent renderer work.

## Product requirements and prototype defaults

The player limit, owner start permission, share URL, mode choice, and late spectating are
requirements. The remaining policies below are proposed defaults to keep the prototype
small and testable.

| Area | Behaviour |
| --- | --- |
| Race capacity | Maximum five racers total, including the owner. Spectators do not consume racer slots. |
| Start permission | Only the room owner can start, with two to five connected racers. Each admitted racer must have loaded the matching course and completed clock sync. This is automatic readiness, not a separate Ready button. |
| Entry window | Opens in the waiting room. Closes atomically when the server accepts Start, before the countdown. No new racers enter during countdown or racing. |
| Shared link | Preserve the current supported game pathname and add `?room=<random-id>`. Opening it offers Join race and Watch; during countdown/racing or when five slots are occupied, only Watch is available. |
| Direct spectator link | A Watch link adds `&watch=1` and defaults to spectator entry after the existing landing/loading flow. Neither URL confers owner privileges. |
| Late spectators | Join the current race immediately after loading. Receive the roster, phase, timing, latest positions, and existing finishes without waiting for a new event or race. |
| Spectator capacity | Start with 20 external spectators per room as an explicit prototype resource limit. Finished racers watching the others retain their racer slots and do not count against this limit. Show a clear capacity message when full. |
| Racing | Local Rapier movement, falls, braking, boosts, and recovery. Other racers are non-colliding visual marbles. Rings and boosts remain per-player, not shared consumables. |
| Spectator controls | Follow the leading active racer by default; select another racer by name using pointer, touch, or keyboard. No free camera, movement input, local player collider, or race submission. |
| Finishing | A finished racer can watch remaining racers. Everyone sees the same final results when all entrants finish or receive DNF. End unfinished races at three minutes from GO. |
| Results | Order accepted client-reported elapsed times; equal centisecond times tie. Mark unfinished/disconnected racers DNF. Never submit multiplayer results to the solo leaderboard. |
| Rematch | Owner chooses New race after results, reopening entry under the same room URL. Connected racers retain their slots; spectators can explicitly request a vacant slot. A separate Start action begins the next race. |
| Menus and hidden tabs | No shared pause. Local movement may stop as it does today, but the common race clock continues. Resuming must not integrate the entire hidden interval into physics. |
| Racer disconnect | Once a closed/dead connection is detected during racing, mark that entrant DNF. A return visit can watch but cannot resume that race. Keep an already accepted finish. |
| Owner disconnect | In waiting/countdown, close the room with an explanation. During racing, the server lets the race finish; results remain viewable, but there is no rematch or owner transfer. Create a new room to race again. |
| Other countdown disconnect | Cancel countdown, invalidate its race ID, reopen entry, and let the owner start again once two racers remain ready. |
| Room lifetime | Delete empty rooms immediately. Expire waiting/results rooms after ten minutes without a membership change or owner action; spectator traffic does not keep them alive. Active races use the three-minute deadline. |

Entering START must show the choice even with a saved username. Single player then uses
the existing username validation and countdown. Multiplayer creates the room after name
validation and shows Copy link, the racer list, loading states, spectator count, and Start.
The owner need not wait for all five slots to fill. Cancel/Leave returns to the entrance
lobby and removes room parameters. Solo retry remains a direct solo retry.

Joining a shared room does not require walking to START. Preserve audio, orientation,
input-selection, and asset-loading gates before placing a racer on the grid or entering
spectator mode. A missing, expired, or incompatible room offers Back to lobby and Create
new room; never silently substitutes a different room.

## Architecture and reuse

### Railway relay instead of a WebRTC mesh

Use one secure WebSocket per participant, a native browser WebSocket client, and a Node.js
HTTP server with `ws`. Add `ws` as a direct server dependency; reuse the existing Zod
dependency for runtime schemas. Use TypeScript and the existing Node test-runner pattern.
Do not add Socket.IO, Redis, a database, an SFU, or a generic transport abstraction for v1.

```text
Racer browsers                         Spectator browsers
  local physics                          render received state
       |                                       |
       +------------ secure WebSockets --------+
                            |
                 Railway Node.js service
                 rooms, clock, race lifecycle
                 latest snapshots and results
```

This is an architectural recommendation for the expanded requirements, not a claim that
WebSockets always have lower latency. Five racers in a full peer mesh require ten peer
connections; direct feeds from every racer to S spectators add another 5S connections.
A relay gives each client one connection and provides the current state for late arrivals.
The cost is server bandwidth and the latency of the route through Railway. Reliable,
ordered transport can also delay fresh movement behind older data during packet loss.

WebRTC remains a possible later transport if measured movement latency is unacceptable.
It would require signaling, STUN/TURN, reconnect handling, and a spectator distribution
strategy. Its configurable ordering and retransmission are documented by
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel).
Do not build both transports in this prototype.

### Reference branch

The assessed branch tip is
[`f3475a8`](https://github.com/prag-matt-ic/speedroller/tree/f3475a823c40ca7f0b7fae41c4cecb6d4d17be48).
Borrow the concepts of bounded position broadcasts, interpolated remote marbles, shared
links, and explicit race events. Keep the current marble implementation and materials.

The historical server and tests can be inspected before
[`20d3b97`](https://github.com/prag-matt-ic/speedroller/commit/20d3b975ef91d420f90f10fdeaf8bf39e0ada3c8),
which removed them. Its `ws`/HTTP healthcheck shape is useful. Its client-supplied
identities, unchecked relay permissions, and room-name generation are not suitable for reuse.

Do not carry over overlay-owned sockets, the reactive message-history queue, two-player
host/guest assumptions, ignored start timestamps, or scrolling-platform coordinate math.
Today the player moves through world space, race attempts have invalidation IDs, and the
course surface helpers already handle flat/cylinder transforms.

### State ownership and interfaces

Keep server code in `server/multiplayer/` and browser-safe shared protocol definitions in
`shared/multiplayer/`. Compile the service separately from the Next.js app; the frontend
must never import Node/server modules. Build from the repository root so Railway can
include the shared protocol. Add dedicated server build/start/dev scripts rather than
changing the existing Next.js commands.

| Owner | Responsibility |
| --- | --- |
| Server | Random room/member/race IDs, owner authorization, racer slots, room phase, matching course configuration, common start time, accepted finishes, deadlines, and spectator bootstrap snapshots. |
| Persistent client session | One socket for the room's lifetime, parsing, clock sync, connection state, room subscriptions, and teardown. Mount above transient overlays and the game canvas. |
| Existing game lifecycle | Local movement, spawn/recovery, countdown presentation, finish detection, and attempt invalidation. Add explicit multiplayer branches without replacing the solo lifecycle. |
| Render buffers | Bounded per-racer position history in refs, interpolation, and spectator follow target. Never store every movement packet in reactive Zustand state. |

Model room phase as `waiting -> countdown -> racing -> results`, with countdown cancellation
back to waiting and owner-created rematches from results back to waiting. Track each
member's role separately from whether they own the room; track each entrant as loading,
ready, racing, finished, or DNF. The server is the only authority for those transitions.

Define a small discriminated message union with Zod validation on both ends:

| Direction | Messages and minimum information |
| --- | --- |
| Client to server | Create/join/watch/leave room; course-ready acknowledgement; owner Start/New race; clock ping; position sample; finish report; request current snapshot. |
| Server to client | Assigned identity; room snapshot; roster/phase changes; countdown/start time; batched positions; accepted finish/results; clock pong; typed errors and room closure. |
| Room snapshot | Protocol version, room revision, owner ID, member names/colours/roles/readiness, course version/topology/columns, current race ID, phase, server time/start time, entrant slots, latest poses, and accepted results. |
| Position sample | Race ID, increasing sequence, world position, world orientation, and respawn generation. Server stamps receipt time and attaches authenticated member identity. |
| Finish report | Race ID, final pose, and elapsed milliseconds from the synchronized start. One accepted finish per entrant and race. |

Course compatibility includes generated layout and gameplay-rules version, not just an
asset URL. Select the room's course from the owner's supported build and require exact
compatibility for racers and spectators. Start with the current public flat course;
preserve other routes and include topology in the protocol without promising cylinder
multiplayer acceptance in v1.

### Timing and movement

- Use a server monotonic clock. Estimate its offset from five ping/pong exchanges using
  the lowest round-trip sample and refresh periodically. Map to `performance.now()` in
  the browser; do not compare unsynchronized `Date.now()` values between players.
- Start is one atomic server transition: verify the owner and readiness, freeze two to
  five entrants, allocate a fresh race ID, close entry, and schedule GO three seconds
  ahead. The owner receives exactly the same event as everyone else. Duplicate Start
  requests cannot create another race.
- Render countdown and elapsed time from the shared start timestamp. A delayed browser
  uses the remaining countdown or current elapsed time; it does not restart a private
  three-second countdown or fast-forward its physics to catch up.
- Preserve local `attemptId` guards and also check the server race ID. Cancelled countdowns,
  old poses, delayed finishes, and rematch messages must not affect a newer attempt.
- Send poses at most 20 Hz, including stationary poses while racing. Batch the latest
  state for all entrants at 20 Hz on the server. Keep initial, respawn, and finish poses
  explicit so a late spectator never needs a racer to move before appearing.
- Start with a 100 ms render delay, bounded snapshot buffers, position interpolation,
  and quaternion slerp. Snap on respawn-generation changes. Freeze at the latest pose
  on buffer underrun rather than extrapolating into obstacles. Tune in Phase 4.
- Validate finish identity, phase, numeric bounds, and uniqueness. Reject negative times
  and times beyond the server's elapsed time plus 500 ms clock tolerance. Rank accepted
  client elapsed times, not network arrival order. This is sanity checking, not anti-cheat.

With no shared collisions, all entrants can use the existing centre spawn for equal
starting conditions. Add slot numbers and name labels so same-colour marbles remain
distinguishable. Do not redesign the course to accommodate five starting lanes.

### Spectator bootstrap and rendering

Join as a spectator through the same service. Atomically subscribe and send a complete
snapshot before subsequent live updates, tagged with room revision and race ID. While
assets load, retain only the latest relevant state; request a fresh snapshot when ready.
Handle a race ending or restarting during loading without showing an old countdown.

Use a separate view-target ref for camera, distance fades, visible terrain range, stage
effects, and HUD follow context. In racing it points at the local player; in spectating it
points at the chosen entrant. Audit the current `usePlayerPosition`, camera, platform row
tracking, and shared shader-uniform consumers. Do not fake spectators by overwriting the
local gameplay position: that can trigger collection, recovery, and finish logic.

Render at most five marbles for a spectator and four remote marbles for a racer. Suppress
the spectator's local player/controller and gameplay sensors. Follow the furthest active
entrant along the course by default; this is approximate live progress, not a final
placing. Preserve manual selection while its target is active; on finish/DNF, select the
next active racer, or show results when none remain. Switching targets must update terrain
visibility and camera together. Show names and status in addition to colour.

Keep the watch controls non-modal so remote interpolation continues. Existing
`useGameFrame` disables work when overlays open; network reception and spectator updates
must not depend on a racer-only or overlay-paused frame loop. Spectators see the shared
course and racer poses; per-racer collected-ring visuals and private effects are deferred.

### Limits and disconnect handling

Generate cryptographically random, unguessable room IDs on the server. Bind member IDs and
owner rights to the accepted socket, never to IDs supplied in a message or share URL.
Enforce room membership, role, and phase for every command; spectators cannot publish
poses, finish, start, or acquire a racer slot after entry closes. Validate usernames with
the existing rule and render them as text.

Set an allowed browser-origin list, an 8 KiB client-message limit, bounded message rates
(40 pose packets and 10 control messages per second per connection), and initial caps of
100 rooms and 500 total connections. Disable WebSocket compression initially. These are
prototype guardrails to revisit with measurements, not advertised capacity. Also limit
new connections/room creation per source IP; verify Railway's proxy headers before using
them for this purpose.

The browser WebSocket API has no automatic backpressure, so apply explicit queue bounds.
Skip new replaceable pose batches once a recipient's outgoing buffer exceeds 64 KiB;
close a connection that remains congested for five seconds or exceeds 256 KiB. Never
silently drop a control event: close and resynchronize instead. Keep only latest unsent
movement and bounded inbound interpolation history. See
[MDN WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API).

Ping sockets every five seconds and declare them dead after fifteen seconds without a
pong, with immediate handling for explicit close/leave. Do not rely on `beforeunload`.
Stale motion is labelled after one second; an idle pose alone does not prove disconnection.
On spectator reconnection, fetch a fresh snapshot with bounded backoff. Racer reconnection
during the current race becomes spectator entry; do not automatically replay Start or
Finish commands. Owner privileges are not restored after losing the owner connection in v1.

## Research and validation points

These references establish platform behaviour and techniques. The proposed rates, limits,
and latency targets above still need measurement on this game.

| Research | Documentation | Required evidence |
| --- | --- | --- |
| Railway WebSocket transport | [Public networking specifications](https://docs.railway.com/networking/public-networking/specs-and-limits) | Verify WSS upgrade from the deployed HTTPS frontend, selected region latency, and recovery after restart. Railway documents WebSocket support and exemption from its HTTP duration/inactivity limits. |
| Railway process readiness | [Healthchecks](https://docs.railway.com/deployments/healthchecks) | Bind `0.0.0.0:$PORT`, serve `/health`, and exercise failed deploy readiness. Deployment healthchecks do not provide continuous runtime monitoring. |
| Railway replacement deployments | [Deployment teardown](https://docs.railway.com/deployments/deployment-teardown) | Set zero overlap and a bounded drain; verify old sockets close and missing in-memory rooms produce an explicit error. A healthy replacement does not preserve existing rooms. |
| Node WebSocket service | [Official ws examples](https://github.com/websockets/ws#usage-examples) and [broken connection detection](https://github.com/websockets/ws#how-to-detect-and-close-broken-connections) | Verify HTTP upgrade, ping/pong, malformed-frame limits, slow consumers, and explicit shutdown of upgraded sockets. |
| Interpolation | [Glenn Fiedler on snapshot interpolation](https://gafferongames.com/post/snapshot_interpolation/) | Measure 20 Hz samples with 100 ms buffering under jitter; confirm respawn snaps and bounded underrun behaviour. This is a technique reference, not a performance prediction. |
| Browser lifecycle | [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) | Test hidden tabs, device lock, resume, and throttled frame callbacks. Preserve elapsed race time without large physics catch-up steps. |
| Transport alternative | [WebRTC data-channel options](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel) | Record whether measured WebSocket latency justifies a later unreliable movement channel and its extra signaling/relay infrastructure. |
| Current game integration | Existing `tests/race-lifecycle.test.mjs`, `tests/fixed-world.test.mjs`, and course-surface tests | Establish solo behaviour, saved-name entry, finish idempotency, and current coordinate conventions before changing them. Audit moving obstacles/effects for any shared race-time requirement. |

## Phased implementation checklist

Complete phases in order; tick an item only after its
behaviour or research result is verified. A phase exit is a working checkpoint, not a
request to deploy incomplete gameplay to public users.

### Phase 0 Validate the foundation

- [x] Read current code and repository instructions again; map start, countdown, finish,
  retry, position, camera, fade, and visibility consumers, including relevant tests.
- [ ] Record baseline solo tests and a manual fresh-user/returning-user run. Preserve
  concurrent renderer changes and keep the historical branch as a read-only reference.
  **92 automated tests passed; returning-user flow checked. Fresh-origin manual run
  remained at loading, so this item is not complete.**
- [x] Build a disposable local relay spike to measure five publishers plus 20 watchers;
  record message sizes, round-trip time, CPU, memory, and queue behaviour. Reuse the
  successful minimal service rather than retaining a second demo implementation.
- [x] Check primary documentation above; record the chosen Railway region and measured
  latency target. Flag any evidence requiring a transport change before game integration.

Evidence: [validation report](multiplayer-phase0-validation.md),
[raw results](multiplayer-phase0-results.json), and
[reproducible spike](../server/multiplayer/README.md). Selected Amsterdam for staging;
no Railway deployment yet. Five racers plus 20 spectators passed all three local profiles.
The 150 ms RTT model estimates 315 ms p95 age with 100 ms interpolation, above the 300 ms
target. Proceed with the room-service foundation; retain the Phase 4 rendered-latency
gate and finish the fresh-user manual baseline before changing entry behaviour.

Exit: transport and integration risks have concrete measurements and named call sites.

### Phase 1 Room service and protocol

- [x] Add shared validated message types, isolated server build scripts, one HTTP/WSS
  service, `/health`, and the in-memory room state machine.
- [x] Implement server-generated identity, random room links, five racer slots, spectator
  membership, readiness, owner-only Start, closed entry, and complete join snapshots.
- [x] Implement revision/race IDs, clock sync, three-second scheduled start, result
  collection, DNF/deadlines, rematch reopening, and room expiry.
- [x] Add role/phase checks, payload/rate/capacity limits, heartbeat, queue bounds, error
  responses, and shutdown that closes sockets and clears room timers.
- [x] Test these behaviours with real WebSocket clients and a controllable clock before
  connecting the 3D scene. Include simultaneous attempts at the fifth racer slot.

Implementation: [service and protocol guide](../server/multiplayer/README.md),
[shared schemas](../shared/multiplayer/protocol.mts), and
[clock estimator](../shared/multiplayer/clock.mts). The Phase 0 service was extended in
place; its old test protocol was replaced. Start now includes the latest room revision
to reject delayed requests after roster/readiness changes. Room URLs preserve the
supplied game pathname; actual entry/copy-link UI remains Phase 2.

Verification: **14 service tests and 92 existing game tests passed**; isolated typecheck,
targeted TypeScript lint, build, and a compiled-service healthcheck/shutdown smoke test
passed. The [30-second local load run](multiplayer-phase1-results.json) delivered 589
pose batches to each of 25 clients, accepted 2,945 poses, and used about 0.730 MB/s of
outbound JSON payload with zero observed outgoing queue bytes or skipped batches.
This is local transport evidence, not WAN latency or rendered-game acceptance.

The Node process provides HTTP/WebSocket upgrade; public WSS termination belongs to
Railway staging in Phase 5. IP limits currently use direct socket peers and ignore
forwarded headers; verify trusted proxy handling before deployment. Course identifiers
are validated and matched exactly, but the game must supply actual layout/rules versions
during frontend integration. Real device clock skew, rendered interpolation, and the
Phase 0 fresh-user loading baseline remain open. No renderer files were changed by this work.

Exit: headless clients can create, fill, start, watch late, finish, and reopen a room;
unauthorized commands and cross-room messages cannot change it.

### Phase 2 Start choice and room UI

- [x] Add Single player/Multiplayer at physical START for new and returning players;
  preserve the existing username component, controls, and solo retry behaviour.
- [x] Mount one persistent session owner; connect only on multiplayer/watch entry and
  tear down on room exit. Transient overlays must not own sockets.
- [x] Create a room on Multiplayer selection, display and copy its URL, and show racer
  readiness, spectators, owner label, and the correctly enabled Start button.
- [x] Resolve shared links after landing/loading. Offer Join race/Watch appropriately,
  including full rooms, countdown, active races, ended races, and invalid links.
- [x] Support cancellation, accessible status announcements, keyboard focus, copy failure,
  and mobile layout. Keep session state out of persisted solo preferences.

Implementation: the persistent `MultiplayerProvider` wraps the landing flow and game,
with a separate non-persisted session store. Physical START always offers the two modes;
solo Retry still enters its existing countdown directly. Native modal dialogs provide
focus containment, Escape/Leave, status announcements and a scrollable narrow-screen layout.
Copy failure leaves a selectable URL. Room state and poses never enter saved solo preferences.

Invite lookup uses the new validated `inspect`/`room-info` messages without claiming a
slot. Inspection respects course compatibility, connection/rate limits and room expiry.
The same connection becomes the room session after Join/Watch. `watch=1` auto-enters for
saved valid names; new names require explicit confirmation. Missing configuration,
connection failures, expired/invalid links and course mismatches offer a clear return path.

Current generated terrain is cylindrical. Room admission now supports both protocol
topologies with exact course matching; this does not extend gameplay acceptance to
cylinder racing. Layout identity is SHA-256 of the loaded rows and surface; rules use
`race-v1:<platformVersion>` and must be bumped when gameplay rules change. No terrain,
lighting, materials, cameras, or renderer files were edited for this phase.

Development defaults to `ws://<current-host>:8080`; production requires
`NEXT_PUBLIC_MULTIPLAYER_URL`. Start the separate relay with matching `ALLOWED_ORIGINS`.
Without configuration, solo still works and multiplayer explains its unavailability.
A started room remains in the room preview; the local solo attempt stays frozen, cannot
submit a solo score, and does not pretend to provide playable multiplayer yet.

Verification: 95 game tests and 18 service/client tests passed, along with root/service
typechecks, targeted lint, the service build, and the Next.js production build. Browser
checks confirmed mode choice with a saved name, create/share/copy, automatic readiness,
a second racer joining through the landing flow, owner-only enabled Start, and closed
entry after Start. A later watch-link browser check stalled in the loading screen and
browser inspection became unresponsive; no renderer changes were made to investigate.
Late-watch admission is covered by client/service tests. Mobile-device, copy-denial and
fresh-user manual checks remain unverified; see remaining Phase 0/4/6 checks.

Exit: two to five browser clients can enter a room and only the owner can close entry;
solo racing still works without contacting the multiplayer service.

### Phase 3 Racing and results

- [x] Bridge shared starts into the existing attempt lifecycle, holding racers on the
  grid until scheduled GO and rejecting stale countdown/finish callbacks.
- [x] Publish bounded 20 Hz poses, render remote marbles from reusable buffers, and keep
  all remote bodies out of local collision, collection, and finish sensors.
- [x] Reuse existing movement/recovery; freeze accepted local finish time and stop local
  racing input without pausing opponents. Route finish reports only to the room service.
- [x] Show shared results, ties, DNF, remaining-racer status, and owner-controlled rematch.
  Verify every client agrees and no multiplayer result reaches solo persistence.
- [x] Test two, three, and five entrants; simultaneous starts; disconnects in each phase;
  duplicate finishes; old messages after rematch; and owner departure mid-race.

Validation: 98 root tests and 21 service/controller tests pass, including actual
WebSocket sessions with two, three, and five racers, matching results/ties and rematch.
Root TypeScript, targeted ESLint, Next production build, and service build pass.
A two-tab Chrome smoke check verified room creation, invite join, shared countdown,
continued racing after GO, and moving labelled remote marbles on both clients.
It caught and fixed the owner reinterpreting its own share URL as an incoming invite.
The automated lifecycle checks cover late/hidden GO, stale callbacks, cancellation,
connection loss, and no solo persistence; interpolation checks cover bounded history,
respawn snapping, old sequences, and buffer underrun.

Renderer boundary: remote marbles borrow the local mesh geometry/material and carry
slot/name labels. They have no Rapier bodies. Individual palettes/effects and a camera
that follows remaining racers are deferred; the results dialog keeps live standings.
Spectator scene/camera are implemented in Phase 4 below; real-network latency remains unchecked.

Exit: five-controller finish/rematch is verified over real local WebSockets. Full
rendered five-player acceptance and cross-device testing remain unverified.

### Phase 4 Spectating including late entry

- [x] Mount a watch-only scene with no local racer/controller. Bootstrap from the current
  snapshot and resynchronize after asset loading or reconnect.
- [x] Add follow selection, approximate progress, names/status, elapsed time, and results.
  Feed the selected racer to camera, visible course range, stage effects, and fades.
- [x] Keep rendering/network updates active with watch UI visible. Handle target finish,
  DNF, respawn, long distances between racers, and all entrants becoming inactive.
- [x] Test spectators arriving in waiting, countdown, mid-race, after one finish, at final
  results, and while a rematch occurs during their loading screen.
- [x] Exercise five racers plus 20 watchers with controlled 50/150/300 ms RTT,
  ±20 ms jitter, TCP recovery stalls, and one paused TCP reader; measure sampled pose
  age, heap change, queue counters, and buffer bounds.
- [ ] Verify GPU-presented state age on real devices/networks and run a longer memory
  soak. The controlled interpolation test below does not establish this exit criterion.

Exit: late arrivals immediately see the correct race state after loading, and watching
does not change racer eligibility or affect physics. Under 150 ms RTT, target a p95
rendered-state age below 300 ms; treat failure as a tuning/transport decision, not a pass.

Implementation and validation (2026-10-25):

- A spectator mounts no local Rapier body, movement controller, sensors, or player HUD.
  The existing marble supplies hidden geometry/material resources for the five ghosts.
  Renderer setup, shaders, lighting and terrain implementation remain untouched.
- The watch bridge samples the selected racer at 20 Hz into the existing position
  subscription. Camera, course range, stage and fades follow that stream. Target changes
  and respawns snap the camera; the camera supports close and wide framing on either
  course topology. The non-modal watch overlay keeps scene updates running.
- The panel shows racer selection, approximate course progress, elapsed time, standings,
  ties/DNF and rematch state. A finished/DNF target falls back to a remaining racer;
  when none remain, the final pose stays visible. A lost connection offers an explicit
  spectator reconnect, which fetches a fresh snapshot without reclaiming a racer slot.
- 101 root tests and 22 service/controller tests cover loading gates, every entry phase,
  finish/DNF selection, new race IDs, reconnect snapshots, no ready/pose/finish commands
  from watchers, and return to the solo lobby. TypeScript, targeted lint and production
  build pass. Chrome smoke testing verified late entry against five synthetic racers,
  target selection, camera width, results, rematch and leaving the spectator view.

Reproduce the controlled load check with
`SPIKE_SECONDS=5 node server/multiplayer/validate-spectators.mjs`.
It uses real local WebSockets, applies delay/jitter in an ordered delivery wrapper,
models a lost TCP packet as a 100 ms stall every 100th inbound message, and pauses one
actual TCP reader for 3.5 seconds. It samples the production interpolation function at
16 ms intervals; it does **not** measure a browser/GPU frame or physical packet loss.

| Simulated RTT | p95 latest pose receipt age | p95 sampled capture age | p95 paused-reader capture age |
| --- | --- | --- | --- |
| 50 ms | 114 ms | 133 ms | 3,346 ms |
| 150 ms | 165 ms | 235 ms | 3,446 ms |
| 300 ms | 261 ms | 408 ms | 3,652 ms |

Each run held five racers and 20 watchers. Histories stayed at eight samples maximum,
server queued bytes peaked at zero and no server batches were skipped. The simulation
scheduler peaked at 227/248/278 pending deliveries. Heap changes were +9.6/-7.5/-10.1 MB;
these short, GC-dependent measurements are not a leak/soak proof. The paused reader
fell behind while normal watchers continued. Socket/kernel buffers absorbed this short
pause, so it does not prove sustained backpressure behavior. The 150 ms sampled-age
result meets 300 ms in this harness; the GPU-presented target remains unchecked.

### Phase 5 Railway staging and failure tests

- [ ] Deploy the standalone Node service with one replica, an explicit supported Node
  runtime, WSS domain, `/health`, and bounded shutdown. Disable service sleep for staging.
- [ ] Configure allowed frontend origins and `NEXT_PUBLIC_MULTIPLAYER_URL`; keep server
  settings separate from browser configuration. Include shared protocol sources in the
  server build and document local two-process startup.
- [ ] Use one region and in-memory rooms. Set deployment overlap to zero and draining to
  five seconds; close existing sockets on SIGTERM. Test the replacement window explicitly:
  no room continuity is promised across deployments. The UI must show room loss and offer
  a new room, never loop forever or attach to a similarly named room on another instance.
- [ ] Record connection count, rooms, publish/broadcast rates, queue drops, disconnect
  causes, CPU, memory, and outbound bytes without logging complete payloads or invite URLs.
- [ ] Test real devices on separate networks, WSS from the deployed frontend, background
  mobile tabs, server restart during a race, expired rooms, and protocol/course mismatch.

Exit: the documented staging URL supports five racers and late spectators across networks;
failure and restart paths are understandable to users. Continuous uptime monitoring must
be configured separately from Railway's deployment healthcheck.

### Phase 6 Acceptance and limited rollout

- [ ] Run `npm test`, targeted lint/type checks, the isolated server build/tests, and the
  Next.js production build. Add focused tests using the existing Node test runner rather
  than restoring the deleted legacy test framework.
- [ ] Verify Chrome, Firefox, and Safari where the current WebGPU game is supported,
  including a supported mobile device. Test keyboard and touch spectator controls.
- [ ] Complete a 30-minute session cycling races, rematches, arrivals, and departures;
  verify memory and queued messages do not grow without bound.
- [ ] Measure one and ten simultaneous full rooms with synthetic clients, including
  failure isolation when one spectator stops reading. Set the staging concurrency limit
  to the measured safe level before opening invitations more broadly.
- [ ] Record start-time skew across separate devices; target at most 100 ms under the
  tested 150 ms RTT conditions. Record actual results alongside the target.
- [ ] Release first to invited testers. Keep a frontend multiplayer enable flag so a
  failed trial can revert to solo entry; disabled invite links explain unavailability.
- [ ] Update this document with measured limits, known failures, and checked acceptance
  items. Revisit WebRTC or server-authoritative physics only when evidence demands them.

Exit: all required journeys pass, multiplayer is isolated from solo scores, and the
prototype's latency, capacity, and recovery limits are documented.

## Deferred work and known limits

No accounts, public matchmaking, chat/voice, video streaming, race recording, spectator
rewind, shared collisions, host migration, in-race racer reconnection, persistent rooms,
global leaderboards, or multi-region service are included. Spectating renders live game
state in the browser and therefore has the same basic device requirements as the game.

Client-reported positions and times remain forgeable. Server restarts lose rooms and
results. WebSocket congestion can delay motion; the research and load-test gates determine
whether this transport is sufficient. Twenty spectators is a proposed starting cap, not a
verified capacity promise. None of these limits should be hidden by the finished UI.
