## Overview

Speedroller is a proof of concept game built to showcase the potential of 3D web for educational experiences.

You play as a marble rolling across a long, wrapping platform. The experience has two halves:

1. **Explore** at your own pace — learn the course, read the info zones, unlock the bonus collectibles and choose a colour for your marble.
2. **Race the clock** — roll onto the start line to begin a timed run, then chain rings to hold your speed all the way to the finish.

Every completed run is submitted to a **global leaderboard**, where keyboard and joystick runs are ranked on separate boards.

**[👉 How far can you roll? 👈](https://speedroller.vercel.app)**

![Game home stage](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/home.webp?raw=true)

## How it plays

### Explore 🌍

The map opens in **learn** mode. Nothing is timed, you can wander, and the course introduces itself as you go:

- **Info zones** turn the camera towards a panel and explain what you are looking at as you roll through.
- **Bonus collectibles** sit off the main line. Rolling onto one and holding your ground for 1.5 seconds unlocks it, and a gem lights up in the HUD.
- **Colour tiles** let you repaint the entire scene (see [Palette Switching](#palette-switching)).

<!-- TODO: screenshot — exploring the map, ideally with the minimap and an info zone open (suggested: public/screenshots/explore.webp) -->

A **minimap** gives you the shape of the course. It is a pre-rendered SVG of the whole map — raised tiles, every point of interest and the finish line — with a live marker for your position and a progress bar, so exploring has a sense of direction rather than being a wander.

### Rings and speed ⚡

Rings are the whole skill of the game. Each one you roll through gives you a **+0.5 units/second** speed bump, ramped in over 0.25s:

| | |
| --- | --- |
| Base speed | `8.0` units/second |
| Maximum speed | `11.0` units/second |
| Gain per ring | `+0.5` units/second |
| Decay back to base | `6.0` seconds |

Speed is a multiplier, not an autopilot — you hold forward to roll, and your speed decides how fast the course comes at you. At base you are covering 8 tiles a second; at the cap, 11.

The catch is the decay. Once a ring's boost has ramped in, your speed bleeds linearly back to the base value over six seconds — and because the decay always runs to `8.0`, the faster you are going, the faster you lose it. At the `11.0` cap you are shedding `0.5` units/second, which is exactly one ring's worth per second.

So the cap is not the goal; **sustaining** it is. The boost is capped at `11.0`, which is only six rings above base, so a big stack is worth no more than a fresh one. What matters is the rhythm: keep finding the next ring before the last one drains away.

<!-- TODO: screenshot — marble mid-ring with the boost dial climbing (suggested: public/screenshots/rings.webp) -->

The HUD carries a **boost dial** and your collected ring count, and it grows larger in speedrun mode. There are **59 rings** on the course.

### Falling off 🕳️

Roll off the platform and you are put straight back on it — no lives, no game over, no countdown. The respawn finds the **nearest safe tile to where you fell**, both along the course and across it, then scrolls the platform to line up behind you so the recovery is seamless.

What it costs you is speed. Falling **resets your boost to base** — the entire chain you had built is wiped out. The rings you have already collected are kept, because they are a record of the run rather than fuel, but the speed they bought you is gone. On a course where a good line keeps you at `11.0` and a fall drops you to `8.0`, that is a long climb back, and it is where runs are won and lost.

The clock does not pause for any of it. The speedrun timer runs on wall-clock time and keeps counting straight through the fall and the respawn.

The respawn is near-instant, so the real damage is not the seconds spent falling — it is the seconds spent slow afterwards, rebuilding a chain that took the whole course to assemble.

<!-- TODO: screenshot — the moment of a respawn, marble reappearing on a safe tile (suggested: public/screenshots/respawn.webp) -->

In explore mode a fall also earns you a wry message from a pool of seven. In speedrun mode those are suppressed — you have a clock to worry about.

### The speedrun ⏱️

Rolling onto the start line in explore mode opens the race panel. You need a **username (6–12 characters)** before you can go, and you choose keyboard or joystick so your run is filed against the right board.

Then it is a **3–2–1–GO** countdown and you are off. The timer runs in centiseconds and displays to two decimal places.

The same line does double duty: in explore mode it is the start, in speedrun mode it is the **finish**. Crossing it while a run is live submits your time, and the end screen tells you where you landed — world record, podium, top ten, or how many seconds you need to shave.

<!-- TODO: screenshot — finish line crossing or the end screen with the performance summary (suggested: public/screenshots/finish.webp) -->

### The leaderboard 🏆

Runs are stored in Postgres and ranked by **fastest time**, scoped to the current map version so a course change starts a clean board.

The board is **filtered by input type**. Keyboard and joystick runs are ranked as two separate tables, because a virtual thumbstick is a different instrument from a keyboard and a single mixed table would not say much about either.

Each entry records the time, the player, plus the **accident count** and **rings collected** for that run — so a fast time with a clean sheet is on the record as such.

**Top ten is a real target.** The board is sorted on time alone, and the podium is marked with medals. Every accident costs you your speed chain, so the runs at the top are the ones with no falls and an unbroken ring line. It will take a flawless run to get there.

<!-- TODO: screenshot — the global leaderboard with medals and flags (suggested: public/screenshots/leaderboard.webp) -->

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

The Game Store handles the current stage, platform speed, ring and collectible state, player positioning, timing and collision/intersection events.

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
        const [newX, newY] = newPosition
        const [prevX, prevY] = playerPosition.current

        if (newX === prevX && newY === prevY) return

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

Rapier sensors mark every interactive surface: info zones, rings, collectibles, colour tiles, the start/finish line and out-of-bounds.

Collectibles and colour tiles use a GSAP-driven hold timer. Stay on the tile for 1.5 seconds and it confirms; roll off early and the progress bar unwinds and cancels.

When the player enters an info zone, HTML content is animated in using React Transition Group + GSAP.

If the player falls off the platform, they intersect with out-of-bounds and are respawned onto the nearest safe tile (see [Falling off](#falling-off)).

### Palette Switching 🎨

![Player colour selection](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/player-colour.webp?raw=true)

The user can change the theme by rolling over one of the four colour picker tiles, with their selection persisted in the game store.

Because the palette drives the marble, the tiles, the rings and the backdrop at once, picking a colour is really picking a look for the whole scene.

### Marble Shading 🔮

The marble uses a custom TSL material that samples the palette using the chosen colour.

It supports textured and flat modes depending on the quality mode.

## Infinite Platform 🏃

![Platform](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/platform.webp?raw=true)

The main `Platform` is a grid of instanced rigid bodies that endlessly wrap forward and backwards. The course is 33 tiles wide and 249 rows long, with 40 rows rendered at a time.

### Row Recycling ♻️

When a row passes behind the camera, it wraps to the back and is assigned new row data. This approach means the camera can stay fixed looking at the player, with the floor moving like a conveyor beneath it.

Optimal performance is achieved by limiting the number of rendered rows, and using instanced meshes for the repeated tiles.

### Obstacle Course ⚠️

The course alternates obstacle runs with info sections. Each obstacle section is a drawn pathway of safe tiles — gaps to thread, and lines that reward committing early rather than hesitating. The layout comes straight from the section bitmap, so it is authored rather than generated (see [Authoring the Course](#authoring-the-course)).

### Surface Elements 🏠

Each stage has its own set of elements which are positioned atop the tiles. These elements include the rings, info zones, collectibles, floating headings and the player colour picker.

Their positioning is defined within the row data. When their corresponding row is raised, the element is positioned.

The translation (Z movement) of surface elements is synced with the movement of the underlying tiles so they appear fixed to the tiles.

### Tile Shader 🧊

The platform tiles use a custom TSL node material to colour the tiles, fade in/out and highlight those near the player.

## Authoring the Course 📐

The course is drawn, not scripted. Each section is a PNG bitmap where one pixel is one tile, and the pixel's colour decides what belongs there:

| Colour | Meaning |
| --- | --- |
| `#000000` | void — the tile is lowered, leaving a gap |
| `#ff0000` | ring |
| `#00ff00` | info zone |
| `#0000ff` | bonus collectible |
| `#ff8000` | colour picker |
| `#ffff00` | finish line |
| `#808080` | floating heading |
| `#00ffff` | highlighted tile |
| `#ff0080` | confetti |

`npm run build-platform` finds the highest version folder in `assets/platform/`, reads its bitmaps in order, and writes two things:

- `resources/rowsData.ts` — the pre-computed row data and per-mode totals, so the client never parses a bitmap at runtime.
- `public/maps/<version>/<mode>.svg` — the minimap, generated from the same rows.

Both LEARN and SPEEDRUN are built from the same eight section bitmaps. Only the final section differs, mapping to `Stage.CTA` in learn mode and `Stage.SPEED_RUN_FINISH` in speedrun mode — which is why the two maps have identical ring counts.

So laying out a level is done in any pixel editor, and the collision layout, the element placements and the minimap all fall out of that one source. Bumping the version folder is also what starts a fresh leaderboard.

## Confetti ✨

Confetti bursts punctuate the course, fired from paired emitters either side of the platform as each confetti row comes into view.

## Floating Background Tiles ✨

![Floating background tiles powered by GPU](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/floating-tiles.webp?raw=true)

Decorative floating tiles add depth and motion around the course. They are rendered as a single instanced mesh and simulated entirely on the GPU by a **WebGPU compute kernel**.

- Tiles are placed in a grid formation around the platform, they spawn at a low Y value and float upward, respawning at the bottom once they hit a threshold.
- Because the simulation runs as compute rather than a ping-pong fragment pass, there are no position textures and no per-frame read-back.
- The whole effect is disabled at low quality by setting the instance count to zero.

## Performance: Adaptive Quality 🏎️

The site achieves great performance even on mobile.

![Stats fps display](https://github.com/prag-matt-ic/speedroller/blob/main/public/screenshots/stats.webp?raw=true)

- My Macbook Pro M4 gets a consistent 120fps on high quality mode.
- My iPhone 15 Pro gets a steady 60fps also on high quality mode.

_(I appreciate these are top-of-the-range devices, but lower powered machines can also hit >30fps.)_

Visual quality is managed by a small Zustand store `PerformanceProvider`. It exposes a `sceneQuality` mode (Ultra/High/Medium/Low) and a derived `sceneConfig` which is used across components to scale the detail and reduce GPU work.

The main scene is wrapped in Drei's `PerformanceMonitor`. It monitors FPS and calls `onIncline`/`onDecline`, which in turn invokes `onPerformanceChange` from the provider to step the quality up or down.

Physics can also run on a fixed timestep via `useGameFrame`, which accumulates real frame time and steps the simulation at a target rate, capped at 5 substeps to avoid a spiral of death on slow frames. Frame updates pause entirely while an overlay is open.

### Debug Mode 🐞

Adding `?debug=true` to the URL inserts the Drei `Stats` component for displaying FPS, and exposes manual quality and DPR controls.

If you manually change quality in debug tools, auto‑adjustments are paused.

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
  finishLinePosition?: [number, number, number]
  confettiPlacements?: ConfettiPlacement[]
  colourPickerPlacement?: IndexedPlacement
}
```

Take a look at the [`Platform` Component](https://github.com/prag-matt-ic/speedroller/blob/main/components/platform/Platform.tsx) to understand how it all comes together.

## Limitations / Wishlist 👀

- **Times are client-reported.** The board is only as honest as the client. There is no server-side timing, no plausibility check on a submitted time, and nothing verifying which input type was actually used — a run is trusted as sent. Accounts, or a server-issued run token, would be the fix.
- **The course is a single line.** Learn and speedrun are built from the same eight sections, so the speedrun is the exploration map run fast rather than a purpose-built course.
- **The terrain/obstacles stage is basic.** I'd love to introduce new challenges such as jumps, wall runs and moving hazards.
- **Respawns are forgiving.** The nearest-safe-tile recovery keeps runs flowing, but a stricter checkpoint system could make accidents a more interesting risk.
- **Two components are still on the legacy GLSL path.** The gem particles and the post-processing pass have not been ported to TSL yet.

If you're reading this and want to help develop the concept further, please get in touch.

### Collaborations 🤝

Interested in working together on a new immersive learning experience?
Let's chat!

### Links

[Demo](https://speedroller.vercel.app)

[Debug Mode](https://speedroller.vercel.app?debug=true)
