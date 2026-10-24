# Race First Experience Implementation Plan

Status: **Race flow, Course draft C layout and bitmap artwork approved; runtime integration not started.**

Decision date: **24 October 2026**

Make Speedroller primarily a single-player time trial. Replace the public Explore flow with
a compact entrance lobby where players can practise movement and choose their ball colour.
A physical start line begins the countdown, and a separate finish line ends the race.
The lobby and race occupy one continuous, bitmap-generated map.

This is the race-flow implementation handoff for a new agent. Read
`docs/race-course-and-speed-design.md` alongside it: that design supersedes the original
preserved-course layout and introduces a longer branching course, 45–60-second runs,
automatic forward movement, and braking to a complete stop with no reverse. Terrain
remains flat for the course and speed stages; downhill work is deferred.

The approved layout, exact ring/hole/decorative placements, coordinate mapping, and staged
acceptance are in [the course design](race-course-and-speed-design.md). Its checked-in
references under `docs/race-course/` are the visual baseline.

The lobby/start/results product choices below remain settled.
Unchecked items describe work still to do; check them only after implementing and verifying
the corresponding behaviour. Follow the repository's `AGENTS.md`, preserve unrelated work,
and re-read touched files before editing because renderer work may continue independently.

## Agreed product decisions

| Decision | Agreed behaviour |
| --- | --- |
| Primary experience | One continuous lobby and timed course; no public Explore mode |
| Lobby location | Place the new lobby before the redesigned timed course |
| Terrain authoring | Edit copied PNG bitmaps and run the existing generator |
| Course content | Longer, progressively challenging course with up to three paths; deliberate ring placement; no educational/bonus stops |
| Learning movement | Optional free practice with input-specific hints; no required tutorial |
| Colour selection | Existing four-colour Paint Shop in the lobby; selection is optional |
| First start | Request a valid username at the line only if one is missing |
| Returning player | A valid saved username allows the line to start the countdown immediately |
| Starting position | Centre the ball on a fixed grid position, clear boost, and hold until GO |
| Countdown presentation | Show 3–2–1–GO over the visible track, without the blurred menu backdrop or raised camera |
| Retry and Restart | Return directly to the grid and start another countdown |
| Leaving an attempt | Separate Back to lobby action |
| Falls during a race | Nearby safe respawn, lost boost, continuing timer, recorded fall count |
| Dashboard or browser interruption | Movement stops; elapsed race time continues |
| Race movement | Automatic forward movement, steering, braking to a complete stop, and no reverse; manual movement in the lobby |
| Menu race shortcut | Remove it; first entry into racing is through the physical line |
| Leaderboard | New course version 1.2.0; retain old records without mixing them into the new board |

Keep the existing landing screen for loading, audio, input selection, and mobile orientation.
Retain the current visual style and flat terrain for the first two stages; movement tuning
and course difficulty follow the companion design. Keep dashboard settings, credits,
subscription, feedback, and sharing features.

Do not add multiplayer, checkpoints, mandatory tutorials, time penalties, an editor,
dependency upgrades, or a new rendering architecture.

## Player journey

```text
Landing screen
  -> Lobby: practise and optionally choose a colour
  -> Touch START: centre and hold on the grid
       -> Missing username: enter name, or cancel back into the lobby
       -> Valid username: countdown immediately
  -> 3 -> 2 -> 1 -> GO
  -> Race: timer, rings, boost, normal fall recovery
  -> Touch FINISH: freeze the result and submit once
  -> Results
       -> Retry: starting grid and countdown
       -> Back to lobby: entrance and free movement
```

- [ ] A fresh visit enters the lobby after the existing landing screen.
- [ ] A returning visit also enters the lobby, regardless of a previously saved game mode.
- [ ] Players can reach the start without choosing a colour or completing tutorial steps.
- [ ] Name setup occurs only when the saved username fails the existing validation rule.
- [ ] Retry and Restart bypass the lobby walk; no other public UI bypasses the physical line.
- [ ] Every exit from an attempt has an explicit destination and leaves no active countdown.

## Terrain assets and generated data

### Versioned source copy

The approved copy is already prepared at `docs/race-course/bitmaps/1.2.0/`. Use its seven
`race-*.png` files in [manifest order](race-course/bitmaps/manifest.json), with the matching
non-collidable masks in `docs/race-course/bitmaps/decoration/`. Follow the
[staged file handoff](race-course/bitmaps/README.md#staged-implementation-handoff).
Leave historical assets untouched. Use `1.2.0` for the combined course/speed release if it
has not already received public times; otherwise choose a fresh release version.
Do not include copied legacy filenames in the new public source list.

Keep the existing bitmap colour conventions and generator. The lobby uses `Stage.HOME`;
the public finish retains its finish marker and appropriate terrain stage. Keep `test.png`
available for development. Public information, bonus collectible, and promotional-heading
markers are absent; the only colour picker is in the lobby. The old course's geometry and
ring locations no longer constrain the new design.

- [x] Prepare and approve a source copy without modifying historical assets.
- [ ] Integrate that approved copy when the generator and marker support are ready.
- [ ] Add the new lobby before the redesigned course in the generator's source list.
- [x] Author and approve the longer branching course, ring placements and bright-tile details.
- [ ] Remove obsolete public interaction markers from the new playable layout.
- [ ] Keep the development map available through developer controls.

### Lobby pixel layout

The lobby is **33 columns by 32 rows**. Coordinates are zero-based and use the generator's
**bottom-up row order**, not top-down PNG coordinates. Column 16 is the centre column.
All unspecified pixels are black void. Use exact RGB colours without antialiasing.

| Element | Columns | Rows | Definition |
| --- | --- | --- | --- |
| Practice floor | 8–24 inclusive | 0–23 inclusive | White floor, 17 tiles wide |
| Exit corridor | 12–20 inclusive | 24–31 inclusive | White floor, nine tiles wide |
| Paint Shop | 16 | 12 | One orange marker, `#FF8000` |
| Guidance path | 16 | 16–24 inclusive | Cyan highlight pixels, `#00FFFF` |
| Start line | 16 | 32 (first launch row) | One new purple marker, `#8000FF` |

Retain the initial world spawn `[0, 4, 0]` above the practice floor. The existing four colour
tiles fit across the broad floor. Do not add lobby rings or obstacles. The nine-tile exit
corridor supports the start line's complete footprint and connects to the new launch section.

The approved preview places START at s=0, global row 32, immediately after the 32-row lobby.
This supersedes the earlier row-27 proposal. The nine-tile corridor continues across the
section boundary so the complete nine-by-five line footprint has floor support.
The start marker is at world X = 0 and Z = `rowToWorldZ(32)`, currently -28.5. Derive this
from generated data at runtime rather than duplicating the coordinate in race logic.

- [ ] Author the lobby floor, corridor, colour marker, highlights, and start marker.
- [ ] Verify the spawn, each colour tile, and the entire starting grid have supporting floor.
- [ ] Verify a connected walkable route from spawn through the exit into the launch section.
- [ ] Verify no floor route bypasses the start sensor in the exit corridor.

### Generator and marker interfaces

Extend `scripts/buildPlatformRows.ts` using its existing marker parsing and placement
conventions. Add `START_LINE: [128, 0, 255]` and optional
`startLinePosition?: [number, number, number]` to `RowData`. Preserve the meaning of
`finishLinePosition` and the existing yellow `#FFFF00` marker.

Update the shared line component to accept `kind: 'start' | 'finish'`. Render its material
and dispatch its interaction from this explicit role, never from the current game mode.
Reuse the current line materials and sensor setup, including kinematic/fixed collision
support. Both line footprints remain **nine tiles wide by five tiles deep**. Add readable
START and FINISH labels using the existing text component.

Derive the grid and finish positions once from generated row data. Missing or duplicate
markers must fail generation/validation with a useful error rather than create a playable
public map with ambiguous race boundaries.

- [ ] Add start-marker parsing and the new row field.
- [ ] Render exactly one explicitly typed start and finish line in the public course.
- [ ] Validate start-before-finish ordering and marker counts for the public map only.
- [ ] Generate the redesigned course with one start, one finish, one colour picker, and counts matching its final bitmap layout.
- [ ] Confirm public information, collectible, and promotional-heading placement counts are zero.
- [ ] Generate `resources/rowsData.ts` and the new minimap assets with `npm run build-platform`.
- [ ] Run generation twice and confirm that the second run produces identical output.

Do not hand-edit generated rows or replace the build-time PNG parser with runtime parsing.

## Race lifecycle and store changes

Retain `GameMode.SPEEDRUN` as the public map identifier and `GameMode.DEV` for development.
Remove `GameMode.LEARN` and its callers, fallback branches, generated map entry, and debug
option. Keep terrain `Stage` values still used for camera and section behaviour.

Add `SpeedRunStage.LOBBY`. Reuse `START` for missing-name setup rather than adding another
setup state. Gameplay phase and overlay visibility are separate concerns: opening a
dashboard must not rewrite the race phase.

| State | Player movement | Timer | UI and transition |
| --- | --- | --- | --- |
| `LOBBY` | Enabled during unobstructed play | Stopped at zero | Guidance and Paint Shop; start contact enters setup/countdown |
| `START` | Held on grid | Stopped at zero | Username form; confirm or cancel |
| `COUNTDOWN` | Held on grid | Stopped at zero | Visible-track countdown; GO enters `RUNNING` |
| `RUNNING` | Enabled during unobstructed play | Running | Race HUD; finish contact enters `SUBMITTING` |
| `SUBMITTING` | Disabled | Frozen final time | Current result and saving status |
| `END` | Disabled | Frozen final time | Current result, save outcome, leaderboard, retry/lobby actions |

Define explicit store actions for entering the start line and returning to the lobby.
Retain `startCountdown`, `onCountdownComplete`, and `finishSpeedRun` where useful, updating
their contracts to match this lifecycle. Each action validates the current phase; delayed
callbacks must not transition an unrelated attempt.

Keep an ephemeral attempt identifier, timing origin, and current result snapshot. These are
not persisted. Increment/invalidate the attempt identifier when beginning another attempt
or abandoning one, so countdown, collection, and submission callbacks can be rejected
when stale.

- [ ] Add `LOBBY` and implement the transition table.
- [ ] Make initial public state and default public row data use the continuous race map.
- [ ] Remove the overlay setter's implicit mutation of `speedRunStage`.
- [ ] Add phase guards for start, GO, finish, retry, cancellation, and lobby return.
- [ ] Keep developer layout resets separate from public race transitions.

### Start line and username setup

On player contact in `LOBBY`, atomically leave that phase before doing any asynchronous
work. Ignore contacts from other bodies and all contacts while an attempt is already
being prepared or run. Remove the current delayed Explore-to-start-panel trigger.

Place the ball at the marker's X/Z, resting just above the floor using the player radius
and existing character-controller clearance. Use the same resting placement for first
starts and retries; the elevated lobby drop-in position would otherwise consume race time.

Use the existing username validation rule of 6–12 characters and existing form components.
A valid saved name starts the countdown immediately. A missing/invalid name opens setup;
confirming a valid name starts the countdown. Cancelling returns the player to lobby
column 16, row 22, outside the start sensor, with free movement and the timer reset.

- [ ] Trigger on initial contact without the current 500 ms delay.
- [ ] Centre the player, clear attempt state, and hold it before displaying setup/countdown.
- [ ] Validate the current form value and saved name consistently.
- [ ] Confirm keyboard typing cannot move the ball behind the name form.
- [ ] Cancel setup to row 22 without immediately reopening the form or countdown.
- [ ] Ignore repeated contacts and later race crossings of the start line.

### Countdown and input

Begin the visual countdown only after platform readiness, scene warmup, and grid placement
are complete. Keep the normal gameplay camera and clear view of the first section.
Countdown itself must not use the menu backdrop or camera offsets. Retain the sound effect
and show a Back to lobby action; ordinary dashboard access is unavailable in setup/countdown.

If the document becomes hidden during countdown, cancel that sequence and start again
from three when visible. Do not start a run unattended. At GO, release movement and set
the timing origin together. Controls held during countdown may take effect at GO, but no
raw or smoothed input may displace the ball before then.

- [ ] Implement readiness-gated countdown and guarded completion.
- [ ] Exclude countdown from menu backdrop and raised-camera styling.
- [ ] Make countdown cancellation stop its animation, sound, and completion callback.
- [ ] Restart an interrupted countdown from three after visibility returns.
- [ ] Verify held keyboard and joystick input takes effect only at GO.

## Resetting attempts without replacing terrain

Starting, restarting, retrying, and returning to the lobby operate on the already mounted
map. Do not change rows or remount the whole `Course` merely to reset an attempt. Keep
platform readiness and warmup intact unless the actual layout changes.

Use a reset notification scoped to attempt-dependent behaviour. Reset ring collection
guards, visibility, exit progress, and pending animation callbacks. Cancel boost and decay
tweens and reset their internal targets, not just the exposed speed value. Reset both raw
input and the smoother's buffered input. Cancel colour confirmation and its sound.

| Reset destination | Position and phase | State to clear |
| --- | --- | --- |
| Start or Retry | Resting grid position, then countdown | Timer, rings, boost, race falls, result, transient input |
| Back to lobby | Initial entrance spawn, `LOBBY` | Attempt state and pending countdown/interaction callbacks |
| Cancel name setup | Lobby row 22, `LOBBY` | Setup/attempt state and transient input |

All three retain username, chosen colour, input preferences, audio settings, subscription
state, total experience time, and saved history. A race reset must no longer assign the
default palette over the user's selection.

- [ ] Separate the current `resetPlatformTick`/course remount path from attempt resets.
- [ ] Reset ring state and animation refs without rebuilding static terrain.
- [ ] Cancel/reset all boost tween state to the existing base speed.
- [ ] Clear transient movement and confirmation state on every reset path.
- [ ] Preserve preferences and saved data across all reset destinations.
- [ ] Verify several consecutive retries restore every ring and give identical starting conditions.

## Falls and interruptions

Keep current nearest-safe-tile respawning and boost loss. During `RUNNING`, falls increment
the attempt's fall count and never pause or reset its timer. Before a race, falls do not
enter race statistics; restrict lobby safe-respawn searches to lobby rows so falling near
the exit cannot place the player beyond the start without an attempt.

The continuous map needs no barrier behind the starting grid, but active race movement
cannot reverse. Braking can stop the ball completely. Disable colour confirmation outside
lobby play, and ignore start-line intersections outside `LOBBY`. Back to lobby remains the
explicit way to abandon an attempt and return to manual lobby movement.

Dashboard opening and tab hiding stop movement and clear held input, while race elapsed
time continues. On return, do not integrate the whole hidden duration into one movement
frame. Lock username and input-method changes from countdown through the live attempt;
audio remains adjustable through the existing controls.

- [ ] Keep race fall recovery, fall statistics, and boost loss intact.
- [ ] Bound lobby recovery to the lobby and exclude its falls from race statistics.
- [ ] Allow braking to a complete stop without reverse; prevent start retriggers and race-time colour changes.
- [ ] Freeze movement for overlays/hidden tabs and clear keyboard and joystick intent.
- [ ] Prevent a movement jump from an accumulated delta after visibility returns.
- [ ] Keep username/input method stable for an active attempt.

## Timing and submission

Measure elapsed duration from a monotonic start timestamp. Keep the current centisecond
display, but use periodic updates only to refresh that display. At finish contact, compute
the final duration from the same timing origin rather than the last displayed tick. Menu
and hidden-tab time must be included.

Accept finish contact only during `RUNNING`. Transition atomically to `SUBMITTING` before
starting the request, so duplicate physics events cannot submit multiple times. Snapshot
username, input method, platform version, final time, race falls, and collected rings.

Record a ring when contact is accepted. Its exit animation is cosmetic and must not delay
the result credit or boost until a callback that can race with finish/reset. Preserve the
exit effect while ensuring old callbacks cannot award rings to another attempt.

The result screen owns the current attempt's snapshot independently of saved history. A
failed save still displays that attempt's time with **Time not saved**. It must not use an
older saved run as the current result or make an automatic repeat submission.

Retry and Back to lobby remain usable during submission. A late successful response may
append its captured result to the appropriate version's history, but may only update the
visible result/phase when its attempt identifier is still current. Capture results before
any reset can clear their values.

- [ ] Use one timing origin for HUD updates and exact finish time.
- [ ] Stop timing atomically and submit once per completed attempt.
- [ ] Award rings at contact and separate award logic from exit animation completion.
- [ ] Display the current result immediately, including while saving.
- [ ] Show saving, saved, and failed outcomes without substituting historical results.
- [ ] Allow retry/lobby actions during submission and ignore stale phase updates.
- [ ] Reuse existing server actions, request schemas, ranking, and sharing.

Do not change the database schema or delete any records. New runs use `level_id: '1.2.0'`
through the generated platform version. Keep keyboard and joystick boards separate.

## Public UI and audio

Replace the collectibles HUD with lobby guidance in `LOBBY`, then race controls according
to phase. Keep the current timer, ring counter, boost dial, and result statistics. Preserve
the four-colour Paint Shop's existing appearance and dwell-to-confirm duration.

Lobby guidance is input-specific and stays visible during unobstructed lobby play:

- Keyboard: **Move with WASD or arrow keys.**
- Joystick: **Use the joystick to move.**
- Both: **Hold on a colour tile to choose your ball. Roll to START when ready.**

Keep guidance clear of movement controls. Remove public Explore labels, obsolete mode tabs,
collectible controls, and the leaderboard's Start speed run shortcut. Retain leaderboard
viewing and existing dashboard features. Use Back to lobby consistently instead of the
current ambiguous Finish/Cancel labels for abandoning or leaving an attempt.

Keep calm music in lobby/setup and race music from countdown through results, respecting
the saved mute setting. Decouple track selection from the obsolete Learn mode.

- [ ] Render lobby guidance and the Paint Shop in the continuous public map.
- [ ] Remove obsolete public Explore/collectible controls and direct-start shortcuts.
- [ ] Update controls, tooltip text, accessibility labels, and result actions consistently.
- [ ] Retain existing settings, credits, subscription, feedback, and sharing functionality.
- [ ] Switch background music by phase and keep sound/mute behaviour coherent.
- [ ] Account for removed scene elements in readiness checks so loading cannot wait on them.

### Minimap and progress

Keep the full map, including the lobby, and its live player marker. Update the SVG generator
to distinguish the start and finish and show the relocated colour picker. Race progress is
zero at the grid, excludes the lobby, and measures toward the generated finish position.
Clamp it to zero before the start and force 100% when finishing, since sensor contact can
occur before the ball reaches the finish marker's centre.

- [ ] Generate and load the new version's public minimap.
- [ ] Display both line markers and the lobby colour picker in their actual positions.
- [ ] Base race progress on generated boundaries rather than whole-map padding constants.
- [ ] Verify progress and the map marker after retries, falls, branch changes, and lobby return.

## Persistence and compatibility

Increment the persisted game-store version and migrate existing preferences/history.
Stop persisting game mode. Ignore old mode values on public startup and initialise the new
map in `LOBBY`, behind the landing screen. Developer map selection is transient.

Retain username, palette, input method, joystick side, subscription state, total experience
time, and all `completedSpeedRuns` version buckets. Do not persist active attempt state,
timestamps, submission status, or temporary results. Old records remain stored under their
original course versions; current leaderboard queries and submissions use 1.2.0.

- [ ] Add a migration preserving the existing persisted fields except mode.
- [ ] Verify old Learn, Speedrun, and developer mode values cannot change public startup.
- [ ] Preserve historical local runs and database records without relabelling their version.
- [ ] Confirm leaderboard queries, ranking queries, and query-cache keys use the new version.
- [ ] Keep developer controls operational after removing the Learn option.

## Implementation map and order

Use this inventory to find the affected code; verify callers again before editing.

| Area | Existing entry points |
| --- | --- |
| Bitmap pipeline | `scripts/buildPlatformRows.ts`, `scripts/utils/generateMiniMap.ts`, `utils/tiles.ts`, `resources/rowsData.ts` |
| State and persistence | `stores/types.ts`, `stores/gameSlice.ts`, `stores/timeSlice.ts`, `stores/playerSlice.ts`, `stores/inputSlice.ts`, `stores/overlaysSlice.ts`, `stores/createGameStore.ts` |
| Scene composition and markers | `components/platform/Platform.tsx`, `components/platform/useReadyState.ts`, `components/platform/speedRun/SpeedRunElements.tsx`, `components/platform/speedRun/SpeedRunLine.tsx` |
| Player and recovery | `components/player/Player.tsx`, `components/InputSmoother.tsx`, `components/ui/controls/Controls.tsx`, `hooks/useGameFrame.ts`, `components/platform/usePlayerRespawn.tsx`, `utils/platform/playerRespawn.ts` |
| Countdown and camera | `components/ui/speedRun/SpeedRunCountdownOverlay.tsx`, `components/Camera.tsx`, `components/SceneWarmup.tsx` |
| Attempt interactions | `components/platform/rings/Rings.tsx`, `components/platform/colourPicker/ColourPickerRow.tsx`, `components/platform/colourPicker/ColourTile.tsx` |
| Public UI | `components/ui/UI.tsx`, `components/ui/SpeedUI.tsx`, `components/ui/speedRun/SpeedRunStartOverlay.tsx`, `components/ui/speedRun/SpeedRunUI.tsx`, `components/ui/speedRun/SpeedRunEndOverlay.tsx` |
| Dashboard and minimap | `components/ui/dashboard/`, `components/ui/speedRun/LeaderboardTable.tsx`, `components/ui/miniMap/MiniMap.tsx` |
| Audio and content | `components/SoundProvider.tsx`, `resources/content.tsx`, `resources/content/hud.tsx` |
| Timing and submissions | `components/Timer.tsx`, `app/actions.ts`, `model/schema.ts` |
| Tests and documentation | `tests/fixed-world.test.mjs`, `README.md`, this plan |

These steps implement the race-flow foundation alongside Stage 1 of the course design.
Then complete Stage 2 speed/handling before public release; Stage 3 is a separate experiment.
Implement the foundation in this order so each phase has a concrete verification point:

1. Integrate the approved bitmaps in manifest order, extend line metadata, ingest scenery separately, and validate generated data.
2. Implement lifecycle, persistence, and attempt reset contracts with focused store tests.
3. Wire physical lines, grid placement, controls, countdown, recovery, and ring resets.
4. Implement timing/result guards and update HUD, camera, audio, minimap, and menu callers.
5. Run automated checks, complete desktop/mobile acceptance, and update documentation.

Use existing helpers, components, and dependencies. Keep state updates immutable, use
Zustand selectors, and subscribe through refs for rapidly changing values. Preallocate
temporary math objects used by frame/physics callbacks. Preserve instanced terrain and
fixed world coordinates. Avoid renderer refactors unrelated to the race flow.

## Verification checklist

The planning pass ran the original suite successfully: **10 tests passed**. That is a
baseline, not acceptance of the new experience. Re-run against the implementation and
record any pre-existing failures separately from regressions.

### Automated scenarios

Extend the existing Node test approach; no new test framework is required. Test behavioural
contracts with store fixtures, controlled timing, deferred promises, and small physics/data
checks rather than assertions that merely mirror source text.

- [ ] Historical asset files remain byte-for-byte unchanged.
- [ ] New public data matches the final redesigned layout and has one start, one finish, and one colour picker.
- [ ] Marker ordering, line footprints, spawn support, and lobby-to-course connectivity are valid.
- [ ] Public educational and bonus placements are absent, and all intended branches are connected.
- [ ] Generation is deterministic and minimap markers match generated positions.
- [ ] Fresh and migrated stores initialise in lobby with preferences/history preserved.
- [ ] Missing-name setup, valid-name immediate countdown, and cancellation behave correctly.
- [ ] Repeated start contacts and start crossings during a race do not restart the attempt.
- [ ] Every start/retry has the same grid position, base speed, empty race counters, and chosen colour.
- [ ] Held inputs cannot move during countdown, but work at GO on both control types.
- [ ] Countdown interruption/cancellation cannot leave a stale GO callback.
- [ ] Lobby recovery stays inside the lobby and does not affect race fall statistics.
- [ ] Race falls preserve elapsed time, record a fall, and clear boost.
- [ ] Hidden tabs and dashboards stop movement while elapsed time continues accurately.
- [ ] Finish contact before GO is ignored; repeated finish contacts submit only once.
- [ ] Finish time is computed at contact rather than from a stale display update.
- [ ] Ring contact immediately credits the attempt, and old animations cannot credit a later attempt.
- [ ] Save failure retains the current result and cannot display an older result as current.
- [ ] Deferred submission responses cannot change a new attempt's phase or visible result.
- [ ] Retry restores every ring, clears boost tween state, and leaves terrain mounted.
- [ ] Existing fixed-world movement, collision, and respawn tests remain green.

### Repository checks

- [ ] Run `npm run build-platform` twice and inspect the generated diff.
- [ ] Run `npm test`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Inspect the final diff for unrelated renderer changes, manual generated edits, and historical asset changes.

### Browser and device acceptance

- [ ] Complete landing → lobby → name setup → countdown → finish on desktop keyboard.
- [ ] Complete the same flow on a landscape mobile device with joystick controls.
- [ ] Check every ball colour and confirm it survives start, falls, Retry, and Back to lobby.
- [ ] Confirm lobby hints, Paint Shop text, and line labels remain readable and avoid control overlap.
- [ ] Confirm the countdown keeps the course visible with normal gameplay camera framing.
- [ ] Cancel name entry and countdown; verify neither retriggers immediately or starts later.
- [ ] Hold controls through countdown and verify no movement before GO.
- [ ] Retry several times and confirm no disappearing terrain, missing rings, or repeated warmup.
- [ ] Fall in the lobby and race; check respawn location, boost, time, and result statistics.
- [ ] Brake to a complete stop with no reverse; verify no start retrigger or race-time colour change.
- [ ] Open/close the dashboard and switch tabs during countdown and racing; verify the defined timing rules.
- [ ] Verify minimap position/progress at spawn, grid, finish, after a fall, and after a retry.
- [ ] Exercise successful, failed, and delayed submissions; retry/leave while a save is pending.
- [ ] Verify the new board stays separate from old results and uses the correct input category.
- [ ] Check sound, mute, result sharing, keyboard focus, and accessible action labels.

## Documentation and completion

- [ ] Update README onboarding and race instructions to describe the continuous lobby flow.
- [ ] Document the new start-marker colour and source version in the bitmap authoring reference.
- [ ] Correct the generator header's command to `npm run build-platform`.
- [ ] Remove obsolete Explore and menu quick-start instructions from public copy.
- [ ] Record final automated check results and desktop/mobile acceptance evidence below.
- [ ] Mark implementation complete only when the flow and required checks are satisfied.

### Implementation verification record

To be completed by the implementing agent:

| Verification | Result and evidence |
| --- | --- |
| Deterministic bitmap generation | Pending |
| Automated tests | Pending |
| TypeScript | Pending |
| Lint | Pending |
| Production build | Pending |
| Desktop keyboard acceptance | Pending |
| Mobile joystick acceptance | Pending |
| Submission and migration acceptance | Pending |
| Remaining limitations | Pending |

Live browser/mobile presentation and database submission were not verified during planning.
Lobby spacing and camera readability require the manual acceptance checks above.
