# Clustered scene lighting

The race floor is lit by one clustered scene-lighting node: a white ambient fill, a player light
that follows the marble, and one point light co-located with every ring. The setup mirrors the
Threenix landing flight, adapted to the cylinder course and its 60 authored rings.

A world-fixed directional key has been removed for now. The track wraps around the cylinder, so a
key fixed in world space loses the floor for long stretches of the course; a course-relative key rig
is the next decision. The ambient value below is the baseline that rig will be balanced against.

Before this pass the tiles owned a private light list (`lights([ambient, key])`) and the scene had
no lights. The new point lights are what makes clustered lighting necessary: the default Three
lighting node would unroll every one of the 61 point lights into every tile fragment.

## Files

| File | Owns |
| --- | --- |
| `components/lighting/lightNodes.ts` | light objects, pool capacity, `ClusteredLighting`, renderer factory |
| `components/lighting/SceneLights.tsx` | mounts the ambient, player and ring lights at the scene root, syncs player position and palette colour |
| `components/lighting/playerLight.ts` | clamps a palette sample into a usable light colour |
| `components/lighting/ringLights.ts` | ring course/world poses, pool posing, ring intensity policy |
| `components/platform/rings/ringConfig.ts` | ring radius, centre height and colours shared by mesh and light |
| `components/platform/rings/Rings.tsx` | places the rings and the shared light slot each one uses |
| `components/platform/tiles/Tiles.tsx` | inherits the renderer's clustered node; no material `lightsNode` |
| `components/WebGPUCanvas.tsx` | accepts the `createRenderer` factory used by `Game.tsx` |

## Renderer installation

`createSceneRenderer` constructs the `WebGPURenderer` and installs `renderer.lighting =
createSceneLighting()` in the same call, before R3F can create a render list. `Game.tsx` passes it
as `createRenderer` to `WebGPUCanvas`; every other canvas keeps R3F's default renderer.

`createSceneLighting` uses `ClusteredLighting(SCENE_POINT_LIGHT_COUNT, 64, 24,
SCENE_POINT_LIGHT_COUNT)`:

- 64-pixel screen tiles quarter the addon's 32-pixel default grid.
- 24 exponential depth slices match the landing scene and suit the 110-unit far plane.
- The per-cluster list capacity is the total, not a smaller guessed bound. Threenix's proposed
  16-entry cap depends on a CPU overlap probe; without that probe a smaller cap can silently drop a
  light for one cluster. Capacity equals the authored total so the failure mode cannot occur.

The addon's `create` method is not in its typings, so the node-creation hook wraps it to substitute
a 64-pixel drawing buffer when the real buffer has no usable size. That is the addon's only
un-defended input: an unsized buffer otherwise builds a zero-length index buffer and a `NaN` grid.

## Capacity is authored, not hand-written

```ts
MAX_RING_LIGHTS = max(totalCounts.rings across PLATFORM_DATA.modes) // 60 today
SCENE_POINT_LIGHT_COUNT = 1 + MAX_RING_LIGHTS                       // player + rings
```

The renderer sizes its light texture, view-depth scratch array and cluster loop from
`SCENE_POINT_LIGHT_COUNT`, and `ClusteredLightsNode.updateLightsTexture` writes lights in list order.
A mounted light beyond that total is silently lost. Deriving the capacity from the generated
platform data means a course rebuild moves the pool with the rings; the regression test also checks
that every mode's authored ring count matches `totalCounts.rings` and fits the pool.

Zero-intensity lights still occupy the pool. All 60 slots stay mounted in every mode, including the
14-ring `DEV` course; only their intensities and poses differ.

## Scene lights

`SceneLights` mounts:

- `TILE_AMBIENT_LIGHT` — white, intensity 1.0.
- `PLAYER_POINT_LIGHT` — shadowless, reach 6, decay 1.2.
- `RING_POINT_LIGHTS` — 60 shadowless slots, reach 5, decay 1.2, gold `#ffd43b`.

The ambient light is not clustered; `ClusteredLightsNode.setLights` keeps it in `materialLights` and
sends only the shadowless point lights to `clusteredLights`.

`Tiles.tsx` no longer passes a material `lightsNode`. `NodeMaterial.setupLighting` resolves
`this.lightsNode || builder.lightsNode`, so every tile batch inherits the renderer-owned clustered
node. The marble, gem, rings and other hand-lit surfaces remain `MeshBasicNodeMaterial` and are
unaffected.

### Directional key (removed)

The former key was a `DirectionalLight('#fff2df', 2.2)` fixed at world `(-3, 6, 4)` and aimed at the
origin. The cylinder's floor normal rotates with course position, so the key's `NdotL` fell from
about `0.78` at the start to zero and below over the middle of the course. With the ambient fill at
the 0.6 used during that test, those stretches were about 74% darker than the start. Ring lights did
not fill the gaps: their
5-unit reach left long ambient-only runs between rings.

Do not restore the same fixed light. Revisit this with a rig that follows the surface frame (or a
course-space key in the tile shader), and re-balance the ambient fill against it.

## Player light

`SceneLights` subscribes to the same published player position the tile shader reads
(`uPlayerWorldPos`) and copies it into the light with `position.set`. No frame allocation is added.
Using the store value rather than the marble mesh keeps the light, contact shadow and trail on one
clock; the published value leads the rendered body by at most one physics step.

The colour comes from the selected cosine palette at `t = 0.8`, clamped per channel. Palette values
are the linear values the marble shader consumes, so `Color.setRGB` is called without an sRGB
conversion. `getPaletteHex` is deliberately not used: it encodes those values as if they were sRGB,
which turned the palette-0 pool into a dark red and palette 3 nearly black. A regression test covers
all four palettes.

The tile shader samples the same palette position for its touched-tile afterglow, so the lingering
tile glow and the pool match in colour. The afterglow strengths are deliberately low (additive
`0.10`, emissive `0.06`): it reads as a fading reminder of where the ball has been, not as a second
light source competing with the pool.

## Ring lights

`createRingLightPlacements` walks the rows once and returns, for each ring:

- `coursePosition` — the tuple `Rings` feeds to `useCoursePlacement` for the mesh.
- `worldPosition` — the same point after the cylinder wrap, used by the scene-root light.
- `light` — the shared pool slot, or `null` if an edited course ever outgrows the authored pool.

Keeping both spaces in one object is deliberate: passing `worldPosition` back through
`useCoursePlacement` would wrap the cylinder a second time. `poseRingLights` copies
`worldPosition` into the light once per mount; rings never move.

Intensity is owned by each `PlacedRing`: `setRingLightLit(light, !isCollected)` on mount and on
collection, and the effect cleanup darkens the slot. A retry clears `isCollected`, so the same slot
relights without reposing. `Rings` extinguishes the whole pool on unmount.

Ring lights are not distance-faded. Their 5-unit reach cannot illuminate the part of the course the
tile fade removes, and a constant pool avoids another per-frame writer. They are not toggled when a
ring is behind the camera either; they only add a local pool next to the ring.

## Tuning

`PLAYER_LIGHT_CONSTANTS` and `RING_LIGHT_CONSTANTS` in `lightNodes.ts` are playtest targets, not
calibrated values. The course is at a much smaller world scale than the landing flight (1-unit
tiles, a 0.45-unit ball, ambient 1.0 with no directional key), so intensities are tens rather than
the hundreds of π-scaled units used there.

## Verification

`tests/clustered-lighting.test.mjs` checks:

- the pool covers every mode's authored ring count and the scene total is player + rings;
- the clustered node splits the ambient fill from the point pool, respects both capacities, and
  survives a zero-sized drawing buffer;
- every ring's course pose, world pose and light slot agree, including the cylinder wrap;
- ring intensity policy and null-slot safety;
- every palette produces a finite, non-negative light colour.

The tests run under Node with the repository's TypeScript loader. They do not render, so the first
visual pass still needs a browser: check the player pool against the contact shadow, ring pools
against the tile fade, and palette changes at each of the four colours. Frame-time claims are not
part of this pass.

## Follow-ups

- If profiling shows the cluster clear is material, run the Threenix overlap probe for this course
  and lower `maxLightsPerCluster` from 61; 16 is the landing target.
- A speed- or boost-driven player-light intensity would need a `useGameFrame` writer; the palette
  and position paths are already subscription-driven.
- Ring-light distance fade can wait for a visible case; the current reach keeps it out of the faded
  part of the course.
