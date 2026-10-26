## Overview

Speedroller is a proof of concept game built to showcase the potential of 3D web for educational experiences.

You play as a marble in one continuous, bitmap-generated world: a small entrance lobby, a physical start line, and a longer branching race course. There is no public Explore mode any more.

1. **Lobby** — practise movement, choose a marble colour, then roll onto the start line.
2. **Race** — a 3–2–1–GO countdown starts a timed run. Chain rings for speed, survive the later technical branches, and cross the finish line.
3. **Results** — retry straight from the grid or return to the lobby. Every saved run goes to the **global leaderboard**, with keyboard and joystick runs ranked separately.

The public course is version **1.2.0**: 1,247 generated rows, 60 placed rings, six holes, six course sections, and detached non-driveable scenery.

**[👉 How far can you roll? 👈](https://speedroller.vercel.app)**

![Game home stage](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/home.webp?raw=true)

## How it plays

### The lobby 🏁

The game opens on a 33-column entrance lobby after the landing screen. A 17-tile-wide practice floor gives you room to try the controls, and a nine-tile corridor leads to the start line.

- **Colour tiles** sit on the practice floor. Hold on one to repaint the marble and the whole scene (see [Palette Switching](#palette-switching)).
- **Movement is manual.** Desktop uses WASD or the arrow keys; mobile uses the virtual joystick. There are no required tutorial steps.
- **The start line is physical.** Roll into it at the end of the corridor to begin setup. If no valid username is saved, a name form opens; otherwise the countdown starts immediately. Cancelling returns you to the lobby at row 22, clear of the line.

The lobby uses the calm background track and disables race-only actions. A fall in the lobby respawns you inside the lobby only, so it cannot place you beyond the start line by accident.

### Rings and speed ⚡

Rings are the skill of the game. Each one you roll through gives you a **+0.5 units/second** speed bump, ramped in over 0.25s:

| | |
| --- | --- |
| Base speed | `8.0` units/second |
| Maximum speed | `11.0` units/second |
| Gain per ring | `+0.5` units/second |
| Decay back to base | `6.0` seconds |

The current handling is the **Stage 1 manual model**: you hold forward to roll and steer with the same input. Automatic forward racing, complete-stop braking with no reverse, and the 45–60-second speed/handling tuning are the next stage (see the course design document). The course is already built at that longer scale.

The 60 rings are distributed across shared and alternative branches. A complete run does not require collecting all of them; rings announce route choices and reward the technical line. Branch choices with the same forward rows have the same forward distance — their times differ through steering, braking, and boosts.

The HUD carries a **ring count** and a **boost dial** during a live race.

### Falling off 🕳️

Roll off the platform and you are put straight back on it — no lives, no game over. The respawn finds the **nearest safe tile to where you fell** and keeps the course in place.

What it costs you is speed. Falling **resets your boost to base** — the chain you had built is wiped out. Ring contact is credited to the attempt immediately, so a fall does not take rings back. During a race the clock keeps running, and each fall is recorded in the result's accident count.

A lobby fall is recovered inside the lobby rows and is cleared from race statistics when the next attempt begins.

### The race ⏱️

Rolling onto the start line in the lobby leaves the lobby phase immediately. The marble is centred on the grid and held there. If a username is missing or invalid (6–12 characters), the setup form opens; confirming starts the countdown. A valid saved username skips the form.

Then it is a **3–2–1–GO** countdown over the visible track, at the normal gameplay camera. There is no blurred menu backdrop and the countdown cannot start an unattended run: if the tab is hidden, the sequence stops and restarts from three when the tab is visible again. Input held through the countdown takes effect only at GO, together with the timing origin.

Crossing the **finish line** freezes the exact time, snapshots the attempt, and shows the results screen immediately. Submission happens once; Retry and Back to lobby remain usable while it is saving. A failed save still shows the current time with **Time not saved** and never substitutes an older run.

### The leaderboard 🏆

Runs are stored in Postgres and ranked by **fastest time**, scoped to the current map version (**1.2.0**) so a course change starts a clean board. Historical `1.x` results remain stored under their original version.

The board is **filtered by input type**. Keyboard and joystick runs are ranked as two separate tables.

Each entry records the time, the player, the **accident count**, and **rings collected** for that run. The results screen includes the current leaderboard, feedback, and sharing actions.

## Tech Stack 💻

- **Next.js** _as the web framework_
- **React Three Fiber** _for 3D rendering_
- **WebGPU** _as the renderer, with_ **TSL** _node materials_
- **Rapier** _for physics simulation and collision events_
- **Zustand** _for state management_
- **GSAP** _for animations_
- **Tailwind** _for UI styling_
- **Postgres** _(Neon) for the leaderboard and feedback_

The renderer runs on Three.js' **WebGPU** backend with materials written in **TSL** rather than GLSL. The migration is very nearly complete — see [`docs/webgpu-tsl-migration-plan.md`](https://github.com/prag-matt-ic/speedroller/blob/main/docs/webgpu-tsl-migration-plan.md) for the full write-up. Two components still sit on the legacy GLSL path: the gem particles and the post-processing pass.

## CodeGraph

[CodeGraph](https://github.com/colbymchenry/codegraph) is installed as a pinned development dependency. After `npm ci`, build the local code index once:

```sh
npm run codegraph -- init --yes
npm run codegraph -- status
npm run codegraph -- explore "How does the player respawn?"
```

The index lives in `.codegraph/` and is ignored by Git. The project-scoped Codex MCP configuration is in `.codex/config.toml`; restart Codex in this trusted project to load it. The MCP server automatically syncs source changes while running, with telemetry disabled. To update the index outside an agent session, run `npm run codegraph -- sync`.

## Colour Palette 🌈

![Palette](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/palette.webp?raw=true)

Colours are driven by a [cosine gradient palette](https://iquilezles.org/articles/palettes/).

The entire theme of the app can be changed by changing the 4 gradient input vectors!

There are helpers in TSL and TypeScript to retrieve colours using an input value of 0-1.

### Backdrop

The backdrop is a single baked texture, tinted through the palette in a TSL node graph and faded at both edges.

Baking it offline keeps fractal noise out of the runtime entirely — the texture costs one sample per fragment instead of a noise evaluation.

<!-- TODO: screenshot — the backdrop beneath the platform (public/screenshots/background.webp is now stale; it showed the old Leva generator controls) -->

## State Management

Most of the game logic is encapsulated within the [`GameProvider`](https://github.com/prag-matt-ic/speedroller/blob/main/components/GameProvider.tsx) which is a Zustand store initialised into React Context.

The Game Store handles the current stage, race lifecycle (lobby, setup, countdown, running, submitting, results), platform speed, ring state, player positioning, the exact timing origin, and collision/intersection events. Attempt-scoped state is ephemeral: it is never persisted, and an incrementing attempt id rejects late countdown or submission callbacks from a previous run.

### Fast Value Subscriptions 💨

I've avoided setting React State as much as possible to keep the experience snappy.

For frequently updated values such as the player position, the value is captured in a ref, and then read inside `useFrame`.

The following pattern is utilised a few times:

```ts
import { useEffect, useRef } from 'react'
import { type Vector3Tuple } from 'three'

import { useGameStoreAPI } from '@/components/GameProvider'

export function usePlayerPosition(onPlayerPositionChange?: (pos: Vector3Tuple) => void) {
  const gameStoreAPI = useGameStoreAPI()

  // Capture current value in a ref to avoid re-renders
  const playerPosition = useRef<Vector3Tuple>(gameStoreAPI.getState().playerPosition)

  useEffect(() => {
    // Subscribe to store updates and update ref only when playerPosition changes
    const unsubscribe = gameStoreAPI.subscribe(
      (s) => s.playerPosition,
      (newPosition) => {
        const [newX, newY, newZ] = newPosition
        const [prevX, prevY, prevZ] = playerPosition.current

        if (newX === prevX && newY === prevY && newZ === prevZ) return

        playerPosition.current = newPosition
        onPlayerPositionChange?.(newPosition)
      },
    )

    return unsubscribe
  }, [gameStoreAPI, onPlayerPositionChange])

  // Fire once on mount so consumers can initialize uniforms/refs immediately.
  useEffect(() => {
    onPlayerPositionChange?.(playerPosition.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { playerPosition }
}
```

## Player

The player is a Rapier kinematic sphere with a `BallCollider`, driven by Rapier's `KinematicCharacterController` with autostep and snap-to-ground enabled so it stays planted on raised tiles.

### Making it roll! 🕹️

Depending on whether the device is mobile or not, different controls are rendered:

- Desktop: WASD/Arrow keys
- Mobile: a virtual touch joystick

Movement is applied each frame, with gravity keeping the marble planted on raised tiles.
The rotation animation is derived from the player velocity and helps the movement feel natural.

### Collisions and Confirmations ⏳

Rapier sensors mark every interactive surface on the public course: the physical start and finish lines, rings, the lobby colour tiles, and out-of-bounds. The developer map still contains info zones and collectibles, which use the same sensor and confirmation patterns.

Collectibles and colour tiles use a GSAP-driven hold timer. Stay on the tile for 1.5 seconds and it confirms; roll off early and the progress bar unwinds and cancels. Colour confirmation is accepted only in the lobby phase, and attempt resets cancel the timer and its sound.

When the player enters an info zone on the developer map, HTML content is animated in using React Transition Group + GSAP.

The start and finish lines share one component but dispatch from an explicit `kind` role rather than the current game mode. Both are nine tiles wide by five tiles deep and are derived from the generated marker rows.

If the player falls off the platform, they intersect with out-of-bounds and are respawned onto the nearest safe tile (see [Falling off](#falling-off)).

### Palette Switching 🎨

![Player colour selection](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/player-colour.webp?raw=true)

The user can change the theme by rolling over one of the four colour picker tiles in the lobby, with their selection persisted in the game store. The tiles keep their dwell-to-confirm behaviour.

Because the palette drives the marble, the tiles, the rings and the backdrop at once, picking a colour is really picking a look for the whole scene. Starting, retrying, and returning to the lobby all preserve the chosen colour.

### Marble Shading 🔮

The marble uses a custom TSL material that samples the palette using the chosen colour.

It supports textured and flat modes depending on the quality mode.

## Platform 🏃

![Platform](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/platform.webp?raw=true)

The main `Platform` is a fixed world generated from the approved bitmaps. The public course is 33 tiles wide and 1,247 rows long, including the 32-row lobby. Terrain is drawn in instanced batches of 16 rows, with one static collider per raised tile.

### Fixed world

Row coordinates are permanent: forward travel decreases world Z. The store wraps no rows and moves no terrain at runtime; the camera follows the marble through the fixed course. Attempt resets (start, retry, lobby return) keep the terrain and its compiled materials mounted.

The longer map means more terrain instances and colliders than the previous 249-row course. Instancing and collider batching are unchanged; the measured costs and any streaming decision belong to the speed/performance stage.

### Course sections ⚠️

The approved Course draft C is authored as seven PNG chunks, in manifest order:

| Chunk | Rows | Role |
| --- | ---: | --- |
| Lobby | 32 | Entrance floor, colour picker, corridor to START |
| Launch | 180 | Straight opening and first gentle bend |
| Broad sweeps | 200 | Turns and the first two-way split |
| Branching slalom | 220 | Wider flowing line versus narrower technical line |
| Recovery | 160 | Merge, three avoidable holes, right–left–right line |
| Technical finale | 260 | Up to three routes with the tightest choices |
| Finish sprint | 195 | Final split, three holes, shared finish approach and run-out |

There are never more than three simultaneous floor passages. The recovery and sprint holes are part of the floor mask, so collisions and safe-respawn searches naturally treat them as void.

### Surface Elements 🏠

Each generated row owns its surface placements. The public course contains:

- one physical START marker at global row 32,
- one physical FINISH marker at global row 1232,
- one colour picker in the lobby at row 12,
- 60 ring markers, and
- 682 detached decoration cells rendered from separate scenery masks.

Info zones, collectibles, floating promotional headings, and confetti remain supported for the developer map, but are absent from the public course. Start and finish lines are always rendered from explicit start/finish marker data, never inferred from the current mode.

### Tile Shader 🧊

The platform tiles use a custom TSL node material to colour the tiles, fade in/out and highlight those near the player. The 2,581 bright authored floor cells are parsed through the existing highlight channel, not through the decoration masks.

## Authoring the Course 📐

The course is drawn, not scripted. Each section is a PNG bitmap where one pixel is one tile, and the pixel's colour decides what belongs there:

| Colour | Meaning |
| --- | --- |
| `#000000` | void — the tile is lowered, leaving a gap |
| `#ff0000` | ring |
| `#00ff00` | info zone (developer map only) |
| `#0000ff` | bonus collectible (developer map only) |
| `#ff8000` | colour picker |
| `#8000ff` | physical START marker |
| `#ffff00` | physical FINISH marker |
| `#808080` | floating heading (developer map only) |
| `#00ffff` | highlighted tile |
| `#ff0080` | confetti (developer map only) |

The approved `1.2.0` sources are copied into `assets/platform/1.2.0/` from `docs/race-course/bitmaps/1.2.0/`, with aligned black/white scenery masks in `assets/platform/1.2.0/decoration/`. Legacy PNGs stay in the copy for reference but are not part of the public source list; `test.png` remains available for the developer map.

`npm run build-platform` finds the highest version folder in `assets/platform/`, reads the seven race chunks in manifest order, and writes:

- `resources/rowsData.ts` — the pre-computed row data, marker positions, scenery columns, and totals, so the client never parses a bitmap at runtime.
- `public/maps/<version>/speedrun.svg` and `dev.svg` — the minimap, generated from the same rows, including distinct start and finish markers.

The generator validates the public course against the approved counts before writing: 1,247 rows, 17,683 floor cells, 2,581 highlighted tiles, 60 supported rings, six holes, 682 separated decoration cells, one START, one FINISH, one colour picker, no more than three floor passages per row, and a fully connected floor. It also verifies that the complete nine-by-five start and finish footprints have floor support.

The generator reads rows from a JSON payload rather than inlining a 1,200-row object literal: TypeScript otherwise builds an unrepresentable union over the row literals. Laying out a course is still done in a pixel editor; bumping the version folder starts a fresh leaderboard.

## Confetti ✨

Confetti bursts punctuate the course, fired from paired emitters either side of the platform as each confetti row comes into view.

## Floating Background Tiles ✨

![Floating background tiles powered by GPU](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/floating-tiles.webp?raw=true)

Decorative floating tiles add depth and motion around the course. They are rendered as a single instanced mesh and simulated entirely on the GPU by a **WebGPU compute kernel**.

- Tiles are placed in a grid formation around the platform, they spawn at a low Y value and float upward, respawning at the bottom once they hit a threshold.
- Because the simulation runs as compute rather than a ping-pong fragment pass, there are no position textures and no per-frame read-back.
- The whole effect is disabled at low quality by setting the instance count to zero.

## Performance: Adaptive Quality 🏎️

The earlier 249-row course held good frame rates on desktop and mobile.

![Stats fps display](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/stats.webp?raw=true)

- The earlier course held a consistent 120fps on a Macbook Pro M4 at high quality.
- It held a steady 60fps on an iPhone 15 Pro at high quality.

_(Those are top-of-the-range devices; lower-powered machines also held >30fps on that course.)_

Course version **1.2.0** is roughly five times longer, with more terrain colliders, scenery instances and floating-tile batches. The measurements above are historical and have not yet been re-run against the new map. The speed/performance stage includes profiling warmup, frame time, collision workload, and mobile performance on the actual generated course before public release.

Visual quality is managed by a small Zustand store `PerformanceProvider`. It exposes a `sceneQuality` mode (High/Medium/Low) and a derived `sceneConfig` which is used across components to scale the detail and reduce GPU work.

The main scene is wrapped in Drei's `PerformanceMonitor`. It monitors FPS and calls `onIncline`/`onDecline`, which in turn invokes `onPerformanceChange` from the provider to step the quality up or down.

The canvas renders at a maximum device pixel ratio of 1.5× by default, with a hard ceiling of 2×. That value is a cap rather than a fixed ratio, so a 1× display still renders at 1×. When frames drop, the monitor spends resolution before detail: at medium quality it lowers the cap by 0.5× (to a floor of 1×) before stepping down to the low tier.

Physics can also run on a fixed timestep via `useGameFrame`, which accumulates real frame time and steps the simulation at a target rate, capped at 5 substeps to avoid a spiral of death on slow frames. Frame updates pause entirely while an overlay is open.

### Debug Mode 🐞

Adding `?debug=true` to the URL inserts the Drei `Stats` component for displaying FPS, and exposes manual quality and DPR controls. The DPR selector offers 0.5×–2×, with 1.5× as the default.

If you manually change quality or DPR in debug tools, auto‑adjustments are paused.

## Audio 🎧

Eight sound effects cover the moments that matter — the countdown, ring pickups, colour changes, info reveals, confetti bursts and falling off.

There are two background tracks, and they switch with the mode: a looser track for exploring, and a faster one once the clock is running.

## Bonus: AI Prompts 🤖

I used AI to speed up the development of this project _(who isn't these days!?)_.

When it comes to AI-generated code the quality varies - but by giving the LLM specific guidelines to follow (such as documentation and examples) we can dramatically improve the output.

**The right context** is often the difference between the solution working or not - especially when using new versions of packages that won't be in the training data. Fetching documentation is my go-to method when setting up new projects.

### Threenix Developer Resources

The prompt checklists I refined during this build are packaged up as the **Threenix Agent Skill** — free, open source, and aimed squarely at Three.js work:

**[Three.js Optimization Prompts](https://github.com/prag-matt-ic/threenix-plugin/tree/main#review--refactor)**
_Catch performance problems, remove unnecessary complexity, and make Three.js, R3F, and TSL code easier to maintain._

There are also component references and guides for WebGPU and TSL at **[developers.threenix.io](https://developers.threenix.io/)**.

## Closing Thoughts

### The Biggest Challenge 🏔️

The most challenging aspect of building Speedroller was definitely the platform logic, and in particular the positioning and movement of elements that sit on top of it - because these elements need to line up correctly, appear on time, move in sync and be recycled efficiently.

The setup for this went through a number of iterations, and a lot of back-and-forth with AI assistants.

I landed on a solution in which the row data is pre-computed, and acts as the single source of truth for what's currently visible. This is flexible too, as new surface elements can be added to the `RowData` type:

```ts
export type RowData = {
  isRaised: (0 | 1)[] // 1 = tile raised to player height, 0 = lowered
  stage: Stage
  isSectionStart: boolean
  isSectionEnd: boolean
  rowIndex?: number
  rings?: (0 | 1)[]
  isHighlighted?: number[]
  infoZonePlacements?: IndexedPlacement[]
  collectiblePlacements?: IndexedPlacement[]
  floatingHeadingPlacements?: IndexedPlacement[]
  startLinePosition?: [number, number, number]
  finishLinePosition?: [number, number, number]
  confettiPlacements?: ConfettiPlacement[]
  colourPickerPlacement?: IndexedPlacement
  decorationColumns?: number[] // detached, non-collidable scenery
}
```

Take a look at the [`Platform` Component](https://github.com/prag-matt-ic/speedroller/blob/main/components/platform/Platform.tsx) to understand how it all comes together.

## Limitations / Wishlist 👀

- **Times are client-reported.** The board is only as honest as the client. There is no server-side timing, no plausibility check on a submitted time, and nothing verifying which input type was actually used — a run is trusted as sent. Accounts, or a server-issued run token, would be the fix.
- **Handling is still the Stage 1 model.** The new 1,200-unit course is integrated with the old 8–11 units/sec manual movement. Automatic forward racing, complete-stop braking with no reverse, 18–28 units/sec tuning, and 45–60-second clean runs are the next stage. Nothing in the race flow depends on manual movement; the speed slice can change independently.
- **The new course has not had full device acceptance.** The generated data is validated, but desktop/mobile traversal, high-speed sensor reliability, camera preview distance, and large-map warmup/frame time still need the Stage 2 acceptance passes.
- **Respawns are forgiving.** The nearest-safe-tile recovery keeps runs flowing, but a stricter checkpoint system could make accidents a more interesting risk.
- **Two components are still on the legacy GLSL path.** The gem particles and the post-processing pass have not been ported to TSL yet.

If you're reading this and want to help develop the concept further, please get in touch.

### Collaborations 🤝

Interested in working together on a new immersive learning experience?
Let's chat!

### Links

[Demo](https://speedroller.vercel.app)

[Debug Mode](https://speedroller.vercel.app?debug=true)
