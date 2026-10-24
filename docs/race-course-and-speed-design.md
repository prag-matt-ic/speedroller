# Race Course and Speed Design

Status: **Course layout, bitmap artwork and race-flow foundation integrated on 24 October 2026; a headless desktop smoke test reached the live race; Stage 2 handling, full traversal and device acceptance pending.**

Updated: **24 October 2026**

Build a longer, faster course that is easy to read and increasingly challenging to drive.
Players race automatically forwards, steer, and brake to manage their line. The route can
split into up to three simultaneous paths, with ring placement making those choices matter.
Target **45–60 seconds for a clean run after the speed stage**.

This design supersedes the original plan's preserved-course layout, 281-row/59-ring
requirements, unchanged movement tuning, and unrestricted reverse movement. The lobby,
colour selection, physical start, countdown, finish, results, and persistence requirements
in `docs/race-first-experience-plan.md` still apply.

## Confirmed decisions

| Area | Decision |
| --- | --- |
| Run duration | 45–60 seconds for a clean run with the faster movement |
| Course | Longer than the existing course; clearer navigation |
| Difficulty | Fairly challenging, with a harder later portion |
| Route choices | Up to three paths available at one time |
| Rings | Deliberately placed to support racing lines and route choices |
| Forward movement | Automatic during the race, even while terrain is flat |
| Braking | Can stop completely; cannot reverse |
| Terrain | Flat for the course and speed stages |
| Future direction | The Fold: stylised stone architecture, assembly effects and TSL height fog on flat terrain |
| Delivery order | Course, then speed/handling, then larger 3D changes |
| Authoring | Continue using copied, versioned PNG terrain and the existing generator |

The approved visual baseline is Course draft C, including the six holes, side decorations,
and true 1:1 grid scale. Its exact geometry and placements are the Stage 1 starting point.
Speed, braking, camera framing, route balance, and clean-run duration remain tuning targets;
visual approval is not physics or device acceptance.

## Design principles

**Clear navigation does not mean low difficulty.** The next turn and available branches
must be visible early. Difficulty comes from committing to a line, managing speed, and
choosing a more demanding route for a better boost sequence.

Use continuous floor through every legal route. Avoid mandatory jumps, detached stepping
stones, sudden untelegraphed sideways shifts, and hidden dead ends. A route can narrow,
bend, or demand braking without becoming visually ambiguous.

Use open edges as the initial prototype default, retaining falls and recovery. Guardrails
are not part of the first course prototype. The user's requested progressive challenge
and branching routes take priority over making every section wide and forgiving.

Keep the lobby slow and manually controlled in all directions. Auto-forward and no-reverse
apply only to an active race. Returning to the lobby uses the existing Back to lobby action;
the course does not require a new barrier behind the player.

## Stage 1 Course layout

### Approved layout and durable references

**Bitmap artwork approved on 24 October 2026:** [bitmap handoff](race-course/bitmaps/README.md).
Seven terrain PNGs and seven separate scenery masks now reproduce the approved layout,
with bright edge lights, chevrons, hazard brackets and start/finish checker details.
They remain outside the active asset directory. Use these approved files for Stage 1;
no further artwork approval is needed to begin implementation. In-game contrast and
high-speed readability still require acceptance checks.

Read this document first, then [the race-flow plan](race-first-experience-plan.md) for
lobby, lifecycle, timing, persistence, and result contracts. Use these checked-in references:

- [Approved layout data](race-course/approved-layout.json): exact section boundaries,
  path control points, six holes, avoidance guides, all 60 ring coordinates and IDs,
  and all 682 decorative tile coordinates.
- [Approved interactive preview](race-course/course-paths-and-rings.html): source fragment
  with section and racing-line selectors. Horizontal and vertical scales are equal;
  square cells and the resulting long vertical view are intentional.
- [Layout self-check](race-course/course-paths-and-rings.test.cjs): run
  `node docs/race-course/course-paths-and-rings.test.cjs` from the repository root.

The approved PNGs are already authored in the copied version under `race-course/bitmaps/1.2.0/`.
Use the [bitmap manifest](race-course/bitmaps/manifest.json) and
[staged file handoff](race-course/bitmaps/README.md#staged-implementation-handoff), rather than
repainting the layout. The JSON and HTML remain design references. Generate runtime rows/minimap through
`npm run build-platform`. Do not replace PNG authoring with the preview or JSON at runtime.
The preview is a fragment, so use a fragment-capable viewer or the visualization skill's
`render.py` wrapper for standalone review. No live localhost server or chat history is
required to recover the design.

When prose gives an approximate width, the exact JSON paths and raster rules below win.
Keep the approved layout as the reproducible baseline. Record later changes needed for
handling, sensor clearance, or route balance with the reason and new measurements.

### Coordinates and bitmap translation

`x` is a tile-centre coordinate in -16…16. `s` is forward distance in tile rows from START;
forward is up in the preview and negative world Z. One tile is currently one world unit.
Map to source column `x + 16`, global bottom-up row `s + 32`, then use `colToX` and
`rowToWorldZ` for runtime positions. For a section bitmap of height H and first global
row R, PNG Y is `H - 1 - (globalRow - R)`. Never flip the assembled course twice.

| Source chunk | Inclusive s rows | Height | Global rows |
| --- | --- | --- | --- |
| Lobby | -32…-1 | 32 | 0…31 |
| Launch | 0…179 | 180 | 32…211 |
| Broad sweeps | 180…379 | 200 | 212…411 |
| Branching slalom | 380…599 | 220 | 412…631 |
| Recovery | 600…759 | 160 | 632…791 |
| Technical finale | 760…1019 | 260 | 792…1051 |
| Finish sprint including run-out | 1020…1214 | 195 | 1052…1246 |

This yields 1,247 source rows, with 1,200 units between marker centres. START is at
`(x=0,s=0)`, global row 32; FINISH is at `(0,1200)`, row 1232. Run-out extends to s=1214.
Do not duplicate shared boundary rows when concatenating source files. Both sensors keep
the existing nine-by-five footprint even though the preview uses symbolic line strokes.
Measured contact-to-contact racing distance still depends on sensor footprint and grid placement.

Paths contain `[s, centreX, width]` control points. Between neighbouring points, clamp
`t=(s-a.s)/(b.s-a.s)` to 0…1 and interpolate centre/width with `t*t*(3-2*t)`.
For each integer row, round centre with JavaScript `Math.round`; set half-width to
`Math.round((width-1)/2)`. Fill integer columns centre−half through centre+half inclusive.
Union all paths covering that row, then subtract the inclusive hole rectangles. Do not
round interpolation early or substitute a different language's rounding for negative ties.
At shared endpoints, union the paths rather than adding another row. Keep all pixels exact
RGB, without antialiasing. Guide paths describe driving/highlight lines, not extra floor.

The JSON ring coordinates already include technical-line offsets and hole avoidance;
paint those exact cells rather than regenerating rings at geometric branch centres.
The Paint Shop symbols in the preview are illustrative: use the existing four-tile component
and the lobby marker at global row 12, validating its actual footprint as required in the
race-flow plan. Lobby cancellation remains global row 22 (s=-10), clear of START.

### Scale and sequence

Prototype approximately **1,200 rows of timed-course terrain**, excluding the lobby. This
is approximately five times the existing 249-row map. Start/finish inset positions determine
the exact timed distance; derive it from generated markers rather than treating row count
as a timer distance constant.

Retain the 33-column bitmap width for the first prototype. The narrower late branches use
that width to create distinct routes without expanding the whole world. Copy the current
versioned asset directory before authoring; preserve historical source files, but do not
preserve the old playable course's geometry or ring arrangement.

| Section | Approximate length | Route design | Intended challenge |
| --- | --- | --- | --- |
| Launch | 180 rows | One 13–15-tile-wide route; straight opening followed by a gentle bend | Learn the faster steering and follow the first ring sequence |
| Broad sweeps | 200 rows | 11–13-tile route with an introductory two-way split | Read turns and choose a line without heavy braking |
| Branching slalom | 220 rows | Two routes: a wider flowing line and a narrower technical line | Trade steering effort and braking against a better ring sequence |
| Recovery straight | 160 rows | Routes merge into an 11–15-tile-wide section with three avoidable holes | Rebuild speed while following a gentle right–left–right line |
| Technical finale | 260 rows | Up to three routes, with roughly 5–7 tiles per branch at the split | Commit early, control speed, and hold a more demanding line |
| Finish sprint | 180 rows | Short final two-way choice, three avoidable holes, then a shared 9–11-tile approach | Carry boost through the final hazards and finish cleanly |

Merge the final branches at least 50 rows before the finish. All routes must cross the same
finish sensor. Keep a supported run-out beyond it. Keep the existing start footprint as a
short throat after the lobby, then widen smoothly into the launch section.

The section names describe authoring chunks, not a new runtime level framework. Use the
existing ordered bitmap source list and section/row metadata.

### Visual review additions

The review layout now includes **three holes in the recovery straight and three in the
finish sprint**, plus decorative checker grids and forward-facing chevrons on both sides
of straighter sections. These are design additions requested during review; the coordinates
below are approved layout placements, not yet implemented terrain.

Distances increase forwards from START; X = 0 is the course centre. The holes remove the
listed integer tile columns and rows, inclusively. Keep a connected passage around each.

| Hole | Section | Forward distance | X columns | Ring guidance |
| --- | --- | --- | --- | --- |
| H1 | Recovery | 622–632 | -2 through 2 | Pass right at X = 4 |
| H2 | Recovery | 668–679 | 3 through 6 | Move left to X = 0 |
| H3 | Recovery | 720–731 | -3 through 1 | Return right to X = 4 |
| H4 | Finish sprint, before split | 1026–1036 | -1 through 1 | Pass right at X = 3 |
| H5 | Finish sprint, wider path A | 1086–1096 | -10 through -9 | Pass left at X = -12 |
| H6 | Finish sprint, after merge | 1168–1178 | -1 through 1 | Pass right at X = 3, then return towards centre |

Leave the last 21 units before FINISH clear. The wider sprint branch receives H5; the
narrow technical branch retains its steering challenge without another narrow hole passage.
Keep no more than three simultaneous floor passages, including temporary passages created
by a hole splitting one branch.

The current review contains 60 rings in total: 35 on the wider-route combination, 47 on the
technical-route combination, and 37 when choosing the outside finale with wider routes
elsewhere. Nearby ring positions have been moved off the holes to lead along the avoidance
lines. These counts describe the review draft and still require high-speed playtesting.

Decorative checker grids sit beside the launch, recovery, and shared finish approach.
Repeated chevrons point forwards beside the straighter sections. Keep these tiles visually
subdued, **non-driveable**, and separated from playable floor by at least two empty columns.
They must not form extra routes, bridge a hole, carry rings, or enter safe-respawn selection.
Store and render decoration separately from the collidable floor mask during implementation;
do not accidentally classify decorative marker colours as raised playable tiles.

- [x] Approve all six hole positions and the ring-guided avoidance lines in the visual layout.
- [ ] Validate hole passages at target speed with keyboard and joystick controls.
- [x] Keep the final clear run-in and the three-path maximum after adding holes.
- [x] Preserve visible separation between decorative tiles and playable floor.
- [x] Exclude decorative tiles from collisions, ring placement, and safe-respawn searches.

### Branching rules

Allow one, two, or three simultaneous routes; never require a choice between more than
three. Introduce the first split gently and reserve three-way choices for the later course.
Branches rejoin before the next major split. Do not create a maze or nested side paths.

At a three-way split, a workable initial cross-section is three 5–7-tile lanes centred near
X = -10, 0, and 10. These are layout guides, not permanent lane constraints: the ball still
steers freely. Check the actual floor intervals and gaps on each row as the branches bend.

Within each branch, show a continuous route using floor shape and cyan highlights. Place
rings along an achievable driving line. Establish branch separation gradually; do not
remove the floor immediately under a player who has not yet reached the decision point.

Use at least two seconds of visible approach at target maximum speed for each significant
split or lateral commitment. At 28 units/sec, this means roughly 56 units of visible road.
Rings that announce a branch must be visible before that branch's turn-in point.

Route identities should differ in handling, not just decoration:

| Route | Geometry | Ring reward |
| --- | --- | --- |
| Forgiving | Wider turns and more room to correct mistakes | Enough rings to maintain useful speed, but fewer dense boost sequences |
| Technical | Narrower floor and stronger changes in direction | Denser sequences that reward accurate steering and well-timed braking |
| Third option | A different turn rhythm or more exposed outside line | A distinct sequence with a comparable risk/reward tradeoff |

Do not claim that a branch is shorter merely because its drawn line looks more direct.
With automatic forward travel and independent sideways steering, branches spanning the
same forward rows have the same forward distance. Their times differ through braking and
boosts. A true distance-saving shortcut would require a different movement/layout model.

### Ring placement

Use the exact route-and-ring data in `race-course/approved-layout.json` before painting
markers. Preserve its spacing and avoidance placements for the first implementation.
Compare complete start-to-finish routes, not just individual clusters.

Implement the approved **60 placed rings across the entire course**, including alternative
branches. This is not a requirement to collect every ring in one run. The current
submission schema caps collected rings at 60; keep the first prototype within that limit
and preserve all existing submission validation.

- Put early rings near the middle of the intended line; teach steering before demanding precision.
- Use rings to lead into a bend, through its line, and onto its exit.
- Place stronger reward sequences after technical turns so successful players can rebuild speed.
- Leave useful boost opportunities on the forgiving path; it must remain competitive for learners.
- Keep branch rewards far enough apart that a player cannot collect two routes' rewards without committing.
- Do not place rings over void, against an unavoidable edge, or immediately before an unseen hazard.
- Avoid requiring all placed rings for completion or rewarding an impossible all-branches collection.

Tune placement so the technical line can produce a faster clean result, but a mistake can
erase that advantage. Do not make one branch both easier and consistently faster than all
alternatives. The 45–60-second target is for representative clean runs, not a mandatory
time for every route or a theoretical speedrun record.

### Approved ring distribution and decoration

| Section | Shared | A branch | B branch | C branch | Total placed |
| --- | ---: | ---: | ---: | ---: | ---: |
| Launch | 8 | 0 | 0 | 0 | 8 |
| Broad sweeps | 4 | 2 | 4 | 0 | 10 |
| Branching slalom | 2 | 3 | 7 | 0 | 12 |
| Recovery | 6 | 0 | 0 | 0 | 6 |
| Technical finale | 2 | 2 | 6 | 4 | 14 |
| Finish sprint | 4 | 2 | 4 | 0 | 10 |

A at every split gives 35 rings; B gives 47. C means the outside finale with A elsewhere,
for 37. Players may mix branch choices. Rings announce choices and reward technical lines;
collecting all 60 in one run is not the goal. Final sprint branches merge at s=1150, 50 units
before FINISH. H6 ends at row 1178; rows 1179…1199 provide the clear final run-in.

Checker candidates occupy side columns ±12…±16 over s=16…58, 606…628, 734…752,
and 1152…1164, alternating column/row parity. Chevron tips occur at s=84,108,132,156,
650,674,698,722,1170,1182,1194 and point towards increasing s. The checked-in JSON
contains the final 682 cells after filtering for two empty columns of separation from floor.
Keep them faint and non-driveable. Use a separate decoration mask/metadata channel in the
copied bitmap workflow; document any new encoding, preserve existing playable marker
semantics, and exclude decoration from collisions and safe-respawn searches.

### Stage 1 checklist

- [x] Create the copied bitmap version, lobby and six course sections with approved artwork.
- [x] Integrate the approved PNGs in manifest order and ingest scenery separately.
- [x] Keep the lobby, colour picker, separate start, and common finish from the race-flow plan.
- [x] Validate all intended routes are continuous and connect from start to finish.
- [x] Confirm there are never more than three simultaneous paths or unexplained dead ends.
- [ ] Make the later course materially more demanding than the opening.
- [ ] Document each branch's ring sequence and intended risk/reward.
- [x] Validate source colours, floor support, branch widths, ring support, and generated counts.
- [x] Regenerate rows and minimap; verify deterministic output and untouched historical assets.
- [ ] Traverse every branch at current movement speed to inspect geometry.
- [ ] Review the layout using projected faster-speed approach distances before calling it ready.

The 45–60-second goal does not apply to Stage 1 at the old 8–11 units/sec. This stage is a
local layout milestone, not a claim that the final handling or duration is already achieved.

## Stage 2 Speed and handling on flat terrain

### Starting tuning targets

Use these values to begin playtesting, then record the actual chosen values and results.

| Parameter | Initial target |
| --- | --- |
| Lobby movement | Keep current base speed of 8 units/sec and manual movement |
| Race cruise | Trial 18–20 units/sec |
| Race maximum with rings | Trial 28 units/sec |
| Sideways steering | Tune separately from forward speed; start near the existing 8 units/sec |
| Forward acceleration | Smooth acceleration after GO and after releasing the brake |
| Braking | Progressive reduction to a complete stop, never negative forward speed |
| Ring boost | Trial +2 units/sec per collection, capped at race maximum |
| Boost decay | Start with the existing six-second decay concept and tune against ring spacing |

For a roughly 1,200-unit timed distance, a 20-unit/sec average gives 60 seconds; 24 gives
50 seconds; about 26.7 gives 45 seconds. These are distance/speed estimates, not simulated
run times. Acceleration, braking, falls, and the final marker positions change the result.

Keep forward propulsion separate from sideways steering. Reuse `PlayerInput` for steer
and brake intent, but do not treat zero input as zero race movement. Neutral input means
cruise while `RUNNING`; outside that phase there is no automatic propulsion.

Keyboard: A/D or left/right steer; S/down brakes. W/up is not required and does not add an
extra acceleration advantage. Mobile: joystick horizontal displacement steers, downward
displacement brakes, and neutral returns to cruise. Preserve normal joystick movement in
the lobby. Show the active control explanation at the starting grid.

The brake must win over automatic acceleration and ring boost while held. A ring cannot
push the ball through a deliberate stop. Releasing the brake accelerates smoothly toward
the currently allowed cruise/boost speed. At a full stop, sideways steering must remain
usable for corrections without any reverse forward velocity.

After a fall, retain normal safe respawn and lost boost. Automatic movement resumes only
after placement and the existing respawn lock complete, then accelerates from rest. Keep
the race clock running. On Retry, reset velocity, boost, raw intent, and smoothed input.

### Visibility and high-speed correctness

The current terrain fade reaches zero at an 18-unit radial distance, and element fading
uses a 23-unit distance. At the proposed speeds these can conceal decisions until there
is less than a second to react. Increasing speed alone would make navigation worse.

Tune forward camera framing, terrain visibility, ring visibility, and camera clipping
together to provide at least two seconds of useful forward preview at maximum speed.
Test landscape mobile framing separately. Keep the countdown at the normal gameplay
camera and avoid using visual effects that hide route boundaries.

High speed also changes sensor reliability. Verify ring/start/finish intersections at the
lowest supported simulation FPS. Use swept contact detection or bounded movement substeps
if the prototype can cross a sensor between updates; do not assume that a collision-aware
character controller guarantees pickup sensors will report every crossing.

Longer and wider terrain means more instances and colliders. Measure on the actual generated
map before adding chunk streaming or a new terrain architecture. Keep current batching and
object reuse unless measurement shows they are insufficient.

### Stage 2 checklist

- [ ] Add automatic propulsion only for the live race; retain manual lobby movement.
- [ ] Add steering and complete-stop braking with no reverse.
- [ ] Preserve accurate elapsed timing through braking, falls, menus, and hidden tabs.
- [ ] Reset all velocity and boost state on restart, retry, and lobby return.
- [ ] Ensure menu/hidden-tab freezes suppress automatic propulsion as well as input.
- [ ] Verify neutral joystick, downward brake, and combined steer/brake gestures.
- [ ] Tune camera and visibility for at least two seconds of forward decision preview.
- [ ] Verify sensors at maximum speed and minimum supported simulation FPS.
- [ ] Measure clean times on each complete route with both input methods.
- [ ] Tune ring placement and braking demands until clean representative runs take 45–60 seconds.
- [ ] Ensure the late technical routes reward skill without making the opening intimidating.
- [ ] Check that no branch is both easier and consistently faster than the others.
- [ ] Check frame time, collision workload, and startup/warmup on desktop and mobile.
- [ ] Record chosen tuning values and acceptance results before releasing the course.

## Stage 3 The Fold visual world

Replace the previous downhill experiment with a visual/background/material update on flat
terrain. Keep course geometry, bitmap artwork, ring positions, collision surfaces, handling,
timing and selectable ball colours unchanged. No downhill or physics-controller rewrite is
part of this stage. Implement after the flat race and Stage 2 handling are accepted.

Confirmed direction: **stylised stone**, warm ivory tops, graphite undersides, dusty-blue
atmosphere and restrained copper seams. Preserve every approved bright-tile pattern as
lighter stone with restrained glow. Reduce incidental material variation on ordinary tiles,
not the authored markings. The main assembling gateway is on the **recovery straight**,
framing the approach to the technical finale.

### 3A Track and sphere finish

- [ ] Add small tile bevels, shaded undersides and subtle stone texture/roughness variation.
- [ ] Preserve approved cyan-highlight locations and keep rings/hazards visually distinct.
- [ ] Refine the existing contact shadow and short trail; add a restrained sphere-coloured
  light pool on actual tile surfaces, respecting holes and the selected ball palette.
- [ ] Review one recovery-straight scene before extending the style across the whole course.

### 3B Architecture and WebGPU TSL atmosphere

Start with five reusable procedural modules: bevelled slab, tapered pillar, long beam,
thick plate with offset pivot, and stepped block. Use sparse nearby geometry for parallax,
larger middle-distance assemblies for scale, and simplified distant silhouettes. Keep
scenery non-collidable and outside driving, camera and hazard sightlines. Compose an open
launch, sweeping towers, tighter slalom framing, the recovery gateway, a framed finale and
an open finish. Bespoke modelling is deferred unless the modular silhouette proves inadequate.

Use the official [Three.js height-fog example](https://threejs.org/examples/webgpu_fog_height.html)
and [source](https://github.com/mrdoob/three.js/blob/master/examples/webgpu_fog_height.html)
as the implementation reference. It assigns `fog(colour, exponentialHeightFogFactor(density,
height))` to `scene.fogNode`. The project's installed Three.js and type declarations already
export this helper from `three/tsl`; no dependency upgrade is required for it.

The installed helper uses fragment world Y and view depth: fragments at or above the height
threshold receive no height fog, while lower, more distant surfaces receive more. It is
analytic surface fog, not volumetric cloud geometry or light scattering. Do not promise the
reference image's cloud banks from this effect alone.

Use a single scene-owned fog graph with stable uniforms for colour, density, height and
far-distance haze. Set height initially to the playable top-surface Y, so low pillars and
undersides sink into dusty-blue haze while the racing surface stays clear. Begin density
at 0.01 as a tuning seed, not an accepted final value; do not copy the example's scene-scale
values blindly. Add a gentle distance term for above-track architecture, combined as
`1 - (1 - heightFactor) * (1 - distanceFactor)`, clamped to 0…1.

Protect the full decision area: start distance haze beyond the camera-to-player distance
plus two seconds at the Stage 2 maximum speed, with an additional ten-unit margin. Use
that same maximum-speed-based rule across quality levels rather than varying visibility
with momentary speed. Begin the distance ramp over a further 100 units, capped at 0.35;
tune only after checking branches, holes, rings and the landmark in the actual camera.
Keep the near track, bright markings, sphere contact and ring silhouettes readable.

Match the sky's horizon colour to the fog colour and blend towards a restrained blue sky
above it. Surface fog cannot itself fill empty background pixels. Keep background and fog
under one atmosphere owner, restore previous scene nodes on teardown, and rebuild their
TSL graphs through the existing renderer-generation lifecycle. Reuse shared uniforms;
create no per-frame nodes or temporary math objects. Check fog participation in existing
custom node materials instead of assuming every shader inherits it correctly.

- [ ] Build and compose the five-module kit, with the recovery gateway as the main landmark.
- [ ] Add scene-level TSL height fog and the protected far-distance haze ramp.
- [ ] Coordinate background/horizon colour with fog, retaining visible negative space at holes.
- [ ] Check terrain, ring, sphere, scenery and emissive-seam materials under fog and bloom.
- [ ] Validate atmosphere during lobby play, countdown, racing, falls, respawns and retries.

### 3C Assembly, lighting and performance

Drive assembly from course progress and per-instance timing, without physical block
simulation. Finish track animation before it enters the two-second decision-preview area;
visible surfaces and colliders must agree there. Align gateway plates well ahead of the
player. Trigger restrained seam pulses at existing section boundaries, not new gameplay
checkpoints. Use environment illumination, one directional key, and the existing local
contact-shadow approach; emissive seams do not each need a light.

Instance scenery in spatial chunks with bounds covering animated movement. Preserve
existing terrain batching and add chunk recycling only if profiling shows a need. Lower
quality may reduce scenery density, atmosphere embellishments, shadow detail and render
resolution; it must retain identical fog parameters, track visibility and reveal timing.

- [ ] Add distant assembly and seam pulses; reset their progress correctly on retry/respawn.
- [ ] Verify no architecture or fog hides upcoming branches or holes at maximum speed.
- [ ] Test keyboard and landscape-mobile framing across supported quality settings.
- [ ] Check straight and downward camera views, low geometry, horizon continuity and fog-free
  surfaces above the height threshold; confirm the distance term behaves independently.
- [ ] Measure frame time and GPU cost before/after atmosphere and scenery on desktop/mobile.
- [ ] Check scene remount and renderer recreation for stale fog nodes or uniform references.
- [ ] Record accepted material, fog and reveal settings plus device evidence before release.

## Release and handoff

Implement the lobby/start/results foundation alongside Stage 1. Treat Stages 1 and 2 as
local milestones, then release their combined validated experience as the new course.
Keep `1.2.0` available for that first release if it has not already been published.

If an intermediate course or different movement rules have already received public times,
use a fresh version for the next release. The existing leaderboard key is the platform
version, so speed-only changes that materially affect times also require a new identity.
Never merge flat/manual, flat/automatic, and downhill results into the same board.

- [ ] Reconcile the final measured layout/tuning with the race-flow plan before implementation signoff.
- [ ] Record final section dimensions, route/ring counts, timed distance, and chosen speed/brake values.
- [ ] Record route times for keyboard and mobile joystick, including beginner and practised runs.
- [ ] Retain old bitmap versions, leaderboard records, and user preferences.
- [ ] Publish only after both the race-flow acceptance and Stage 2 checks pass.

## Approval and verification record

- [x] Agree on race-first lobby, colour selection, physical start, and countdown flow.
- [x] Agree on staged delivery: course, speed on flat terrain, then The Fold visual update.
- [x] Agree on automatic forward racing, complete-stop braking, and no reverse.
- [x] Agree on a 45–60-second clean-run target, increasing challenge, and up to three paths.
- [x] Approve Course draft C paths and ring placements, recovery/sprint holes, and side decoration.
- [x] Approve the preview with true 1:1 square cells.
- [x] Preserve the approved preview and exact placement data in this repository.
- [x] Approve the generated bitmap artwork: bright edges, chevrons, hazard accents and checker details.
- [x] Run design checks: 60 supported rings, six holes, 682 separated decorative tiles,
  17,683 connected floor cells, and no more than three floor intervals on any row.
- [ ] Implement and verify Stage 1 plus the race-flow foundation.
- [ ] Complete Stage 2 handling, timing, visibility, device acceptance, and route balancing.
- [ ] Record measured values and release the combined course/speed version.
- [ ] Evaluate Stage 3 separately after the flat race is accepted.

### Stage 1 integration record (24 October 2026)

The approved seven-chunk course and scenery copy is integrated from
`docs/race-course/bitmaps/1.2.0/` into `assets/platform/1.2.0/`. The public source list is the
seven `race-*.png` chunks in manifest order, each with its aligned decoration mask. The
generator now emits explicit START and FINISH markers, scenery columns, and both minimaps.

`npm run build-platform` validates, then writes 1,247 rows, 17,683 floor cells, 2,581
highlighted cells, 60 rings, six holes, 682 separated decoration cells, one START, one FINISH,
and one colour picker. Two consecutive runs produced byte-identical `resources/rowsData.ts`
and minimap SVGs. The generated-data test also checks full floor connectivity, at most three
paths per row, marker ordering, line-footprint support, ring support, hole voiding, lobby
respawn bounds, decoration isolation, byte-for-byte source copies, and both minimap markers.

The race-flow foundation (continuous lobby, physical lines, grid hold, readiness-gated
countdown with hidden-tab restart, exact finish snapshot, single submission, retry, lobby
return, attempt resets, persistence migration, HUD/copy/audio/minimap updates) is implemented.
Automated store tests cover the main transitions and stale callbacks. A headless
Chrome/WebGPU smoke test reached the lobby, physical start, name setup, countdown, live race,
and first ring, and observed the hidden-tab countdown pause/restart. Full-course traversal,
results, mobile acceptance, Stage 2 handling, and high-speed sensor/camera checks remain
pending. The existing ~18-unit terrain fade is visible in the smoke-test screenshots and is
part of the Stage 2 visibility work.

The design checks validate the reference geometry, not generated PNGs, collider clearances,
sensor reliability, or playable speed. The generated counts and connectivity above were
re-checked after integration. Speed/acceleration/braking values and camera framing still
require measurement; Stage 3 changes presentation while keeping the course flat.
