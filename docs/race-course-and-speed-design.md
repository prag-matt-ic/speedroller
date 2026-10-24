# Race Course and Speed Design

Status: **Course concept and staged approach; numerical tuning requires playtesting.**

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
| Future direction | Explore a gentle downhill course and free rolling as a later stage |
| Delivery order | Course, then speed/handling, then larger 3D changes |
| Authoring | Continue using copied, versioned PNG terrain and the existing generator |

The proposed dimensions, section lengths, ring counts, and speed values below are prototype
targets, not measured results. Do not describe them as validated until the acceptance
checks have been completed.

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
| Recovery straight | 160 rows | Routes merge into an 11–15-tile-wide section | Recover, build speed, and see the next split early |
| Technical finale | 260 rows | Up to three routes, with roughly 5–7 tiles per branch at the split | Commit early, control speed, and hold a more demanding line |
| Finish sprint | 180 rows | Short final two-way choice, then a shared 9–11-tile approach | Carry boost through the last turn and finish cleanly |

Merge the final branches at least 50 rows before the finish. All routes must cross the same
finish sensor. Keep a supported run-out beyond it. Keep the existing start footprint as a
short throat after the lobby, then widen smoothly into the launch section.

The section names describe authoring chunks, not a new runtime level framework. Use the
existing ordered bitmap source list and section/row metadata.

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

Build a route-and-ring table before painting all markers. For each branch, record the ring
count, spacing, required steering, and expected opportunities to brake/reaccelerate.
Compare complete start-to-finish routes, not just individual clusters.

Begin with **48–60 placed rings across the entire course**, including alternative branches.
This is a prototype budget, not a requirement to collect every ring in one run. The current
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

### Stage 1 checklist

- [ ] Create a copied bitmap version and six authoring sections with the proposed pacing.
- [ ] Keep the lobby, colour picker, separate start, and common finish from the race-flow plan.
- [ ] Validate all intended routes are continuous and connect from start to finish.
- [ ] Confirm there are never more than three simultaneous paths or unexplained dead ends.
- [ ] Make the later course materially more demanding than the opening.
- [ ] Document each branch's ring sequence and intended risk/reward.
- [ ] Validate source colours, floor support, branch widths, ring support, and generated counts.
- [ ] Regenerate rows and minimap; verify deterministic output and untouched historical assets.
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

## Stage 3 Downhill and larger 3D changes

Defer this stage until the flat course and automatic movement feel good. The current ball
is kinematic: its controller computes explicit movement and applies it with
`setNextKinematicTranslation`. Rotating floor meshes alone does not provide natural
gravity-driven rolling, and rotating only visuals would separate them from collision data.

The first experiment should be a short downhill section outside the released course.
Trial a gentle 2–4 degree slope as a starting range. Keep the lobby level and use a smooth
transition into the descent. Over 1,200 units even a 3-degree slope drops roughly 63 units,
so a fixed horizontal out-of-bounds plane cannot be retained unchanged.

Start by testing controlled downhill acceleration with the existing kinematic ball, keeping
steering and braking predictable. Treat that as arcade downhill movement, not physical
free rolling. Only compare a dynamic rigid-body prototype if genuine gravity, momentum,
and rolling contact are still needed after the controlled version is judged.

Keep the bitmap as the course-local footprint. Any elevation/rotation layer must apply the
same transform to floor meshes, colliders, rings, markers, respawns, and other placements.
Course progress and minimap coordinates must be derived in course-local space. The camera,
out-of-bounds detection, player rolling axis, and height-dependent shader effects also need
review. Do not rotate the whole existing scene as an isolated visual tweak.

- [ ] Prototype a short slope and level-to-slope transition without changing the released course.
- [ ] Compare controlled downhill motion against the flat automatic race for steering/braking feel.
- [ ] Decide whether dynamic physical rolling adds enough value to justify a controller change.
- [ ] Apply consistent course transforms to graphics, physics, sensors, and respawn positions.
- [ ] Adapt camera framing, course progress, minimap mapping, fall detection, and shader height assumptions.
- [ ] Validate every branch, transition, complete stop, fall, and retry on sloped terrain.
- [ ] Give any released physics/elevation change a new leaderboard identity.

Stage 3 is a research milestone, not an approved wholesale physics rewrite. A final slope,
controller model, and elevation format should follow the prototype results.

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

No terrain or gameplay changes are included in this design document. Ring counts, exact
route widths, speed/acceleration/braking values, and camera framing remain prototype targets
until measured. The downhill controller decision intentionally remains deferred to Stage 3.
