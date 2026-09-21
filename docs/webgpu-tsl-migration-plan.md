# WebGPU + TSL Migration Plan

Refactor `components/` from WebGL (R3F v9 + raw GLSL) to **React Three Fiber v10 alpha** on the
**WebGPU renderer**, with every GLSL vertex/fragment shader ported to the **Three.js Shading
Language (TSL)**.

Status: **the port is complete, and the scene renders.** All 15 shader components are on TSL, **no
GLSL remains in the repo** (32 files and 1,592 lines deleted, including `resources/glsl/`), and the
shader-era dependencies are gone: `glsl-noise`, `glsl-rotate`, `glslify`, `glslify-loader`,
`raw-loader`, `shader.d.ts`, and the Turbopack loader rules.

`npx tsc --noEmit` is clean across the whole project and `npx eslint` reports no new errors. Three
pre-existing lint errors remain in files this migration never touched (`ConfettiRows.tsx`,
`FloatingMenu.tsx`).

The first run has happened. It surfaced six distinct root causes — several of them systemic to how TSL
statements, R3F's staged uniform registry and TSL's `positionNode` override work — all of which are
fixed and written up in "First run — runtime errors" below. The scene now boots, plays and renders
with an empty console.

The list of things only a browser could settle, and where each landed:

- **whether the two compute kernels produce valid WGSL and correct motion** — both compile and run.
  The floating-tile kernel was reached through a wiring bug that would have frozen it (see cause 3);
  the gem burst kernel was correct as written.
- **the `positionGeometry` vs `positionLocal` distinction** — surfaces land where they should, but the
  related trap was worse than anticipated: `positionNode` *replaces* the post-instancing local
  position, so any instanced mesh with a real transform silently loses it. See cause 4; this was the
  reason the platform floor was invisible.
- **that a `blurSamples` change reconfigures the render pipeline rather than needing a new pass** —
  not yet exercised interactively.
- **that `GameUniforms` really commits its scope before its readers mount** — it does not, for a
  reader using `useUniforms(scope)`; see cause 2. `CreatorState` is the route that works.
- **particle sizing, re-authored from pixels to world units** — not yet judged against the WebGL
  build.

What remains is visual parity with the WebGL build, not correctness: the palettes, the re-authored
particle sizing, and the MaterialX-for-simplex noise swap can only be signed off side by side.

---

## 1. Target stack

| Package | Current | Target | Why |
| --- | --- | --- | --- |
| `three` | 0.182.0 | **0.185.0** | R3F v10 alpha requires `>=0.185.0`. Ships `three/webgpu` + `three/tsl`. |
| `@react-three/fiber` | 9.4.2 | **10.0.0-alpha.5** | Provides the `/webgpu` entry point. |
| `@react-three/drei` | 10.7.7 | **11.0.0-alpha.6** | peers `three >=0.185`, `@react-three/fiber >=10.0.0-0`. |
| `@types/three` | 0.180.0 | **0.185.0** | Must track the runtime minor. |
| `@react-three/rapier` | 2.2.0 | **2.2.0 (unchanged)** | See risk R1. |

`react` is pinned at **19.2.3** and must stay there while R3F v10 is in alpha. It was briefly
bumped to 19.3.0 mid-migration; **every** published R3F v10 build, canary included, declares
`react >=19.0 <19.3`, as does drei 11 alpha. `.npmrc`'s `legacy-peer-deps` (R1) suppresses the
warning, so this constraint will not surface on its own — check it by hand on any React bump.

### Verified compatibility

Confirmed against the published tarballs (`@react-three/fiber@10.0.0-alpha.5`,
`three@0.185.0`, `@react-three/drei@11.0.0-alpha.6`):

- `three@0.185.0` exports `./webgpu` and `./tsl`.
- TSL provides everything the existing shaders need: `Fn`, `If`, `Loop`, `uniform`, `texture`,
  `smoothstep`, `mix`, `fract`, `fwidth`, `dFdx`, `dFdy`, `screenUV`, `screenCoordinate`,
  `interleavedGradientNoise`, `instanceIndex`, `positionLocal`, `normalView`, `modelWorldMatrix`.
- Node materials live in `three/webgpu` (`MeshBasicNodeMaterial`, `MeshStandardNodeMaterial`,
  `PointsNodeMaterial`, `SpriteNodeMaterial`), **not** in `three/tsl`.
- Post-processing nodes live in `three/addons/tsl/display/*`
  (`BloomNode`, `GaussianBlurNode`, `FXAANode`, `radialBlur`, `MotionBlur`, `AfterImageNode`).
- `RenderPipeline`, `PassNode`, `RTTNode`, `StorageInstancedBufferAttribute` are all exported
  from `three/webgpu`.
- drei 11 alpha still exports every API this repo uses: `shaderMaterial`, `useTexture`, `useFBO`,
  `ScreenQuad`, `Html`, `CameraControls`, `CameraControlsImpl`, `PerformanceMonitor`, `Stats`.
  (`Text` is gone but unused here — this repo draws text with its own `useTextCanvas`.)

### Reference implementation

`/Users/matthew/Documents/Code/threenix/apps/landing` runs this exact stack
(`three@0.185.0`, `@react-three/fiber@10.0.0-alpha.5`, `@react-three/drei@11.0.0-alpha.5`,
`@react-three/rapier@2.2.0`) with `InstancedRigidBodies` in production. Treat it as the
ground truth for API shape:

- `components/Scene.tsx` — Canvas with `renderer={createSceneCanvasRenderer}`.
- `components/scene/sceneCanvasConfig.ts` — renderer factory + `onCreated` configuration.
- `components/postProcessing/Postprocessing.tsx` — the advanced `RenderPipeline` example.
- `components/postProcessing/setPostprocessingOutput.ts` — tone-map/colour-space/FXAA ordering.
- `components/postProcessing/radialBlurPost.ts` — closest analogue to `effects.frag`.
- `components/postProcessing/blurPost.ts` — `GaussianBlurNode` + `mix` composition.

---

## 2. Starting point

### 2.1 The single canvas

`components/Game.tsx` is the only `<Canvas>` in the app. It currently uses the WebGL `gl` prop:

```tsx
<Canvas
  gl={{ alpha: false, antialias: !isMobile, powerPreference: ... }}
  camera={{ position: [...], far: ..., fov: 65 }}
  dpr={dpr}
>
```

### 2.2 Shader inventory — was 32 files

> **Historical.** This section records the starting point. 28 of these files have since been
> deleted and their components ported; the per-component table below is now a map of what *was*
> ported rather than a list of outstanding work. See the status table at the top for what remains.

Every `.frag`/`.vert` under `components/` was imported by a component; there was no dead shader
code to delete.

All **15** consumer components used the *identical* construction pattern —
`shaderMaterial()` from drei plus R3F `extend()`:

```tsx
const XShader = shaderMaterial(INITIAL_UNIFORMS, vertexShader, fragmentShader)
const XShaderMaterial = extend(XShader)
...
<XShaderMaterial key={XShader.key} {...} />
```

That uniformity is the migration's biggest asset: one shape to replace, applied 15 times.

| Component | Shader files |
| --- | --- |
| `postProcessing/Effects.tsx` | `effects.vert`, `effects.frag` |
| `backdrop/Backdrop.tsx` | `backdrop.vert`, `backdrop.frag` |
| `player/marble/Marble.tsx` | `marble.vert`, `marble.frag` |
| `platform/tiles/Tiles.tsx` | `tile.vert`, `tile.frag` |
| `platform/colourPicker/ColourTile.tsx` | `colourTile.vert`, `colourTile.frag` |
| `platform/collectibles/collectible/Collectible.tsx` | `collectibleTile.vert`, `collectibleTile.frag` |
| `platform/collectibles/collectible/gem/Gem.tsx` | `gemShell.vert`, `gemShell.frag` |
| `platform/collectibles/collectible/gem/particles/Particles.tsx` | `point.vert`, `point.frag` |
| `platform/confetti/ConfettiParticleEmitter.tsx` | `confettiPoint.vert`, `confettiPoint.frag` |
| `platform/floatingHeadings/floatingHeading/FloatingHeading.tsx` | `floatingHeading.vert`, `floatingHeading.frag` |
| `platform/infoZones/infoZone/InfoZone.tsx` | `infoZone.vert`, `infoZone.frag` |
| `platform/infoZones/infoZone/iconSphere/IconSphere.tsx` | `iconSphere.vert`, `iconSphere.frag` |
| `platform/rings/ring/Ring.tsx` | `ring.vert`, `ring.frag` |
| `platform/speedRun/SpeedRunLine.tsx` | `finishLine.vert`, `finishLine.frag`, `startLine.frag` |
| `floatingTiles/FloatingTiles.tsx` | `floatingTiles.vert`, `floatingTiles.frag`, `position.frag` |

### 2.3 Shared GLSL helpers — the keystone

`resources/glsl/` holds seven glslify modules that most shaders pull in. **Porting these first makes
every downstream port mechanical.** They are pure functions of their arguments — no uniforms, no
texture reads — so they translate to TSL directly and losslessly.

| Module | Exports | Notes |
| --- | --- | --- |
| `palette.glsl` | `palette(t, a, b, c, d)` | iq cosine palette. Foundation of the other two. |
| `playerPalette.glsl` | `samplePlayerPalette`, `getColourFromPalette` | 4 palettes selected by `int` index. |
| `tilesPalette.glsl` | `sampleTilesPalette(t)` | Fixed constants. |
| `sdBox.glsl` | `sdBox(position, bounds)` | 2D AABB signed distance. |
| `paintCorners.glsl` | `paintCorners(...)` | Corner-bracket mask; uses `dFdx`/`dFdy` → TSL `fwidth`. |
| `fadeDistance.glsl` | `fadeDistance(worldZ)` | 8→14 falloff. |
| `cameraFadeNear.glsl` | `cameraFadeNear(cameraZ, worldZ)` | 8→14 falloff. |

### 2.4 Classification (drives the porting strategy)

The right target material depends on what the shader actually does. Three buckets:

**A. Fullscreen post-processing** — `effects.vert/.frag`
Replaced wholesale by a `RenderPipeline` with a `pass()` node. No shader port at all.

**B. Unlit surfaces/particles** → `MeshBasicNodeMaterial` / `PointsNodeMaterial`
`backdrop`, `floatingTiles.frag`, `collectibleTile.frag`, `colourTile.frag`, `infoZone.frag`,
`ring.frag`, `finishLine.frag`, `startLine.frag`, `tile.frag`, `floatingHeading.frag`,
`confettiPoint.frag`, `point.frag`. Port each fragment `main` into `material.colorNode`.

**C. Fake-lit surfaces** → `MeshBasicNodeMaterial` keeping the existing lighting maths
`marble`, `gemShell`, `iconSphere`, `ring`. These hand-roll their own lighting against
`normalMatrix` / `vNormal`.

> **Correction — the scene contains zero three.js lights.** The only `ambientLight` is commented
> out at `Game.tsx:64`. So these four surfaces cannot hand lighting off to
> `MeshStandardNodeMaterial`: doing so *requires adding lights*, which would change all four looks
> simultaneously and break visual parity.
>
> **Port the hand-rolled lighting maths to TSL as-is** and keep the materials basic. For example
> `marble`'s `LIGHT_DIR = normalize(vec3(1,1,1))` + ambient `0.8` / diffuse `0.5` / specular `^10`
> becomes the same expressions with TSL `dot`/`pow`/`mix` nodes. Re-authoring the lighting to use
> real lights is a **separate, deliberate art decision** — not part of this migration.

**D. GPGPU positional pass** — `floatingTiles/shaders/position.frag`
Not a fragment shader at all: it reads `texturePosition`, packs `vec4(column, y, row, speed)` into
`gl_FragColor`, and relies on two uniforms that three's `GPUComputationRenderer` injects
(`texturePosition` for ping-pong self-reference, `resolution` for `gl_FragCoord.xy / resolution.xy`).
**`GPUComputationRenderer` is WebGL-only** — it imports `WebGLRenderTarget` and `FullScreenQuad`
from `examples/jsm/postprocessing/Pass.js` — so it cannot survive the port at all.

This becomes a true WebGPU compute pass: an `Fn()` writing a `storage()` buffer, which removes the
ping-pong render targets and the injected uniforms entirely. This is the single largest
simplification in the migration, and the hardest single item to land.

---

## 3. Risks

**R1 — `@react-three/rapier@2.2.0` peers `@react-three/fiber@^9.0.4`.**
There is no published rapier release for R3F 10 (checked `latest`, `rc`, `canary`). The Threenix
landing app runs rapier 2.2.0 against R3F 10 alpha in production, including
`InstancedRigidBodies`, so the runtime is proven. Mitigation: `.npmrc` with
`legacy-peer-deps=true`, matching the landing app. Revisit when rapier publishes a v10 line.

**R2 — React 19.3 breaks the drei pin. (materialised, resolved)**
This happened during the migration: React was bumped to 19.3.0, outside the `>=19.0 <19.3` range
that both drei 11 alpha and every R3F v10 build (canary included) declare. Reverted to 19.2.3.
Next 16.3.5 accepts any React 19, so the pin costs nothing. The lesson worth keeping: R1's
`legacy-peer-deps` hid the mismatch, so this class of error is invisible at install time.

**R3 — three 0.182 → 0.185 is a three-minor jump.**
Unrelated non-shader code may hit three API changes. Caught in Phase 0 verification.

**R4 — `legacy-peer-deps` is repo-wide.**
It disables peer checking for *all* packages, so genuine peer conflicts will no longer surface as
install errors. Compensate by relying on the type-check and build gates.

**R5 — Turbopack GLSL rules become dead weight.**
`next.config.ts` registers `raw-loader` + `glslify-loader` for `*.frag`/`*.vert`, and `shader.d.ts`
declares the module types. Once no `.frag`/`.vert` files remain, both are removable (Phase 7).

**R6 — No WebGL fallback after Phase 1.**
`@react-three/fiber/webgpu` is WebGPU-only by construction (`R3F_BUILD_LEGACY = false`; the bundled
`WebGLRenderer` throws). Browsers without WebGPU will fail to start the scene. Accepted
deliberately: every custom shader is being replaced, so a GLSL fallback path has nothing to fall
back to. Revisit only if untested-browser coverage becomes a requirement.

**R7 — WebGPU cannot render points larger than 1 pixel.**
three's own `PointsNodeMaterial.sizeNode` docs state it: *"WebGPU only supports point primitives
with 1 pixel size… If an application wants to render points with a size larger than 1 pixel, the
material should be used with `Sprite` and instancing."* Both particle systems
(`point.*`, `confettiPoint.*`) therefore **cannot** remain `Points`. They must become **instanced
sprites/quads**, re-implementing the fragment-side circular/soft mask against the quad's UV in
place of `gl_PointCoord`. This is a rewrite, not a port — see Phase 5.

**R8 — `drei`'s `useFBO` returns a `WebGLRenderTarget`.**
`node_modules/@react-three/drei/core/Fbo.js` hard-codes `new THREE.WebGLRenderTarget(...)`. Any
code left calling `useFBO` must be deleted, not adapted. The manual
`setRenderTarget`/`render` dance in `Effects.tsx` goes with it.

**R9 — the `key={Shader.key}` remount idiom.**
14 JSX sites use drei's generated `Shader.key` to force material remounts. That key disappears with
`shaderMaterial`. Any behaviour relying on the forced remount must be re-established deliberately
(usually by rebuilding the node material in a `useMemo` keyed on the real inputs).

---

## 4. Phases

### Phase 0 — Dependencies and build config ✅

1. Add `.npmrc` with `legacy-peer-deps=true` (R1).
2. Bump `three@0.185.0`, `@types/three@0.185.0`, `@react-three/fiber@10.0.0-alpha.5`,
   `@react-three/drei@11.0.0-alpha.6`.
3. Reinstall; confirm the three/R3F/drei versions actually resolved.
4. Type-check to surface R3 non-shader breakage.

**Exit criteria:** ✅ dependencies resolve; ✅ every remaining `tsc` error is either a
`shaderMaterial` reference scheduled for removal in Phases 3–5, or the one `clock` reference inside
the file Phase 3 replaces.

### Phase 1 — Swap the Canvas ✅

Uses the `add-webgpu-canvas` Threenix skill reference.

1. Add `components/WebGPUCanvas.tsx` from the skill's `assets/WebGPUCanvas.tsx`, unchanged in its
   public props. It supplies `renderer` defaults (`forceWebGL: false`, `powerPreference:
   'high-performance'`, `antialias: true`, `stencil: false`), a Suspense fallback and an
   `onContextMenu` suppressor.
2. Point `components/Game.tsx` at it, translating the old `gl` prop into `rendererProps`:
   - `alpha: false` → already in the defaults.
   - `antialias: !isMobile` → `rendererProps={{ antialias: !isMobile }}`.
   - `powerPreference` dev/prod switch → `rendererProps={{ powerPreference }}`.
3. Keep `dpr`, `camera`, `className`, `onContextMenu` behaviour identical.

**Exit criteria:** the scene boots on the WebGPU renderer.

> **Expected intermediate state.** After Phase 1 the gameplay geometry disappears until Phases 4–6
> land. Every `shaderMaterial` mesh compiles to nothing under WebGPU, because GLSL `ShaderMaterial`
> is a WebGL concept. This is the anticipated, accepted cost of the cutover — not a regression to
> chase.

### Phase 2 — Shared TSL helper library ✅

`resources/tsl/` mirrors `resources/glsl/`, one module per glslify module, ported in dependency
order:

| GLSL | TSL | Notes |
| --- | --- | --- |
| `palette.glsl` | `palette.ts` | `cosinePalette`. Mirrors the Threenix `createTSLFn` + `setLayout` idiom. |
| `playerPalette.glsl` | `playerPalette.ts` | The four `if (index == n) return` branches become `select` chains — branch-free. |
| `tilesPalette.glsl` | `tilesPalette.ts` | Constant params hoisted to `.toConst()`. |
| `sdBox.glsl` | `sdBox.ts` | |
| `paintCorners.glsl` | `paintCorners.ts` | `computeFwidth` collapses to TSL `fwidth`. |
| `fadeDistance.glsl` | `fadeDistance.ts` | Feeds 10 GLSL vertex stages — ported first for leverage. |
| `cameraFadeNear.glsl` | `cameraFadeNear.ts` | |
| — | `createTSLFn.ts` | Shared `Fn` + `setLayout` typing helper. |

**TSL authoring gotchas found while porting** — these cost real time, so do not rediscover them:

- `@types/three` types TSL loosely. `abs` returns a generic `Node`, which then fails the *overload*
  resolution of `smoothstep` and `select`. **Annotate params and returns explicitly** as
  `Node<'float'>` / `Node<'vec2'>` / `Node<'vec3'>`, and give `reduce` an explicit generic.
- `discard` is exported as **`Discard`** (capital D).
- `uv()` is a node factory: call it once, bind the result. Repeated calls build redundant
  sub-graphs.
- Node materials **are** valid JSX (`<meshBasicNodeMaterial colorNode={...} />`) — verified by
  compiling a probe inside this project. R3F v10's WebGPU entry auto-extends them.

**Exit criteria (revised):** ~~each helper pinned against the GLSL reference values with a test~~.
**Testing is deliberately deferred** — this repo has no test runner installed (no vitest/jest, no
`test` script, no existing `.test.*` files), and adding one is out of scope for the migration. The
palette helpers are therefore unverified against the GLSL numerically. Verification is visual,
per-port, against the WebGL build. If drift does surface in the palettes later, the reference
values are in `resources/glsl/*.glsl` and the port is a direct transliteration, so a retro-fit test
is cheap. Run `optimize-tsl` over the helpers when convenient.

### Phase 2a — The TSL component pattern (established)
Every port follows this shape, taken from the Threenix examples (`Garden.tsx`, `CurveDebris.tsx`,
`MotionUniforms.tsx`):

```tsx
// 1. Globally shared uniforms are REGISTERED once, by scope, from a provider component:
useUniforms(createThingUniforms, THING_UNIFORM_SCOPE)

// 2. Any component READS the shared scope (typed) and may mutate .value in useFrame:
const { uThing } = useUniforms<ThingUniforms>(THING_UNIFORM_SCOPE)

// 3. Per-component node graphs are built once and memoised:
const { colorNode } = useLocalNodes(() => ({ colorNode: /* TSL expressions */ }))

// 4. Nodes are handed to a node material as props — no shaderMaterial, no extend():
<meshBasicNodeMaterial colorNode={colorNode} transparent />
```

Rules for this codebase:

- **Shared / cross-component values → `useUniforms(create, SCOPE)`**, registered once, so N
  instances share one uniform (e.g. one `uScrollZ` for every tile) instead of each owning a copy.
- **Per-instance values that must not be shared → `useLocalNodes`**, which registers no global
  scope. This reproduces the old drei `shaderMaterial` per-material uniform-cloning semantics.
- **Never rebuild nodes per frame.** Build the graph in the creator and mutate `uniform().value` in
  `useFrame` (AGENTS.md).
- Colour and alpha split across `colorNode` + `opacityNode` (with `transparent`), replacing
  `gl_FragColor` including its alpha channel.

### Phase 2b — Noise: `mx_noise_*` is NOT simplex (parity decision)

TSL ships noise built in, so `glsl-noise` can eventually be dropped. But the replacement is **not
numerically equivalent**, and this is a visual-parity decision that must be made deliberately:

| | Current | TSL replacement |
| --- | --- | --- |
| Function | `noise(vec3)` from `glsl-noise/simplex/3d` | `mx_noise_float(position, amplitude?, pivot?)` |
| Algorithm | Ashima/Stefan Gustavson **simplex** noise | **MaterialX** noise (Perlin-family gradient) |
| Range | ≈ −1 … 1 | ≈ −1 … 1 (tunable via `amplitude`) |

Both return roughly ±1 at default `amplitude`, so the swap is *plausible* — but they are different
algorithms with different gradient tables and correlation lengths. Anything whose look is driven
directly by the noise field will shift visibly:

- `colourTile.frag` — uses **three** noise calls for domain warping. Warp is inherently
  high-sensitivity: a small field change produces a visibly different pattern, not a subtle one.
- `marble.frag` and `iconSphere.frag` — animated **veins**. The vein shapes are the effect.
- `tile.frag` — background detail noise, blended subtly. Lowest risk.
- `floatingTiles.frag` — noise into the palette lookup. Medium risk.

**Recommendation:** accept `mx_noise_float` and re-tune the frequency/amplitude constants to taste,
because it is one call per site and removes a dependency permanently. If the vein and warp looks
must survive unchanged, the alternative is to port Ashima simplex 3D into
`resources/tsl/simplexNoise.ts` as a TSL `Fn` — about 40 lines, exact numeric parity, and it still
removes `glsl-noise`. Decide per-shader during Phase 4; the two are not mutually exclusive.

### Phase 3 — Post-processing pipeline

Replace `components/postProcessing/Effects.tsx` entirely, including the drei `useFBO` render target
and the manual `setRenderTarget`/`gl.render` dance (R8).

1. Build the pipeline with `pass(scene, camera)` and a `RenderPipeline`, per the landing reference.
   The children no longer need `createPortal` into an offscreen `Scene` — the pass owns that.
2. Port `effects.frag`'s composition into TSL nodes:
   - `RenderPipeline.outputNode` runs on a fullscreen triangle, so `vUv` → `screenUV` and
     `gl_FragCoord.xy` → `screenCoordinate`. The custom `effects.vert` is **deleted**, not ported.
   - Radial blur → `Fn()` + `Loop(uBlurSteps)` + `If(...)`, mirroring
     `radialBlurPost.ts`. Keep `interleavedGradientNoise` (TSL ships it natively).
   - Vignette, edge mask, noise darkening → `smoothstep`/`mix` expressions.
   - `uBlurSteps` becomes a `Loop` count; if it must stay dynamic, use the
     `uBlurSteps == 0` early-out the GLSL already has.
3. `uSceneTexture` is supplied by `passes.scenePass.getTextureNode()`. `uNoiseTexture` becomes a
   `texture()` node; `uResolution` is usually replaceable with `screenSize`/`screenUV` ratios.
4. Drive `uTime`/`uSpeed` exactly as today — `usePlayerSpeed` + `stepSmoothedSpeed` into a
   `uniform()`, mutated in `useFrame`. Keep the existing smoothing helper; only the plumbing to
   the GPU changes.
5. Preserve the tone-map/colour-space/FXAA ordering from `setPostprocessingOutput.ts`.
6. Keep the store-driven on/off path (`blurSamples > 0`) working.
7. Adopt `scene-warmup` (`useRenderPipeline` + scene pass precompilation) to avoid first-reveal
   stutter now that the graph is compiled at runtime.

**Exit criteria:** speed blur, vignette and edge fade visually match the WebGL build; toggling
`blurSamples` at runtime still switches the pass on and off.

### Phase 4 — Unlit and surface shaders

One component per commit, easiest first, so each is independently revertable. Replace
`shaderMaterial(...)` + `extend(...)` with a node material built via `useMemo`, then attach with
`<primitive object={material} attach="material" />`.

Order (simplest → most entangled):

1. ~~`backdrop`~~ ✅ **done** — pure texture read × edge fade; now a `colorNode` on
   `meshBasicNodeMaterial`.
2. `speedRun` (`finishLine`, `startLine`) — texture/colour + fade.
3. `ring`
4. `floatingHeading` — texture + `cameraFadeNear` + `fadeDistance`.
5. `infoZone`
6. `collectibleTile` — `paintCorners`.
7. `colourTile` — `playerPalette` + simplex noise.
8. `tile` — `tilesPalette` + noise + three instanced attributes (`visibility`, `seed`,
   `isHighlighted`) via `instancedBufferAttribute` → `attribute('visibility')` etc.
9. `floatingTiles`
10. `marble` — fake-lit; the most complex port (spherical UVs, vein noise, palette, respawn alpha).
11. `gemShell` — the only shader using a barycentric attribute (`aBarycentric`) for edge work.
12. `iconSphere` — fake-lit + noise.

**Porting rules**

- Target `meshBasicNodeMaterial` with `colorNode` (+ `opacityNode` when the GLSL wrote alpha), per
  the Phase 2a pattern. This is the default for nearly every shader here, because none of them use
  real scene lighting.
- Vertex `main` disappears. `position` → `positionLocal`, `normal` → `normalLocal`,
  `modelViewMatrix * vec4(position,1)` → `modelViewMatrix.mul(positionLocal)`,
  `projectionMatrix * ...` → `cameraProjectionMatrix`.
- Positions that the vertex shader *moved* (the tile tilt, the icon sphere's scale animation,
  `floatingTiles`' placement) become a `positionNode` rather than a `colorNode`.
- Varyings disappear. A value needed in the fragment stage is either recomputed from
  `positionLocal`/`positionWorld`/`normalView`, or passed explicitly via `varying(...)` where
  recomputation would be wasteful.
- `gl_FragColor` → `colorNode`; `gl_FragColor.a` → `opacityNode` (plus `transparent`).
- `discard` → `Discard` inside an `If(...)`.
- **Do not** re-author the fake lighting (bucket C). There are no lights in the scene, and adding
  them would change all four surfaces at once. Port the existing maths to TSL nodes and keep the
  material basic.
- Share uniforms that are genuinely global (`uScrollZ`, `uPlayerWorldPos`, `uTime`) through a
  `useUniforms` scope; keep truly per-instance values (per-ring `uRotationSpeed`, per-collectible
  progress) in `useLocalNodes` so instances cannot leak into each other.
- Drop dead uniforms rather than porting them. Verified dead: `uOpacity` (`infoZone`, `iconSphere`,
  `finishLine`, `startLine`), `uGlowStrength` (`iconSphere`), `uMix` (`floatingTiles.frag`),
  `uAspect`/`uTilesX`/`uTilesY` (both speed-run fragments), `uTime` (`iconSphere.vert`), and the
  JS-only `uTime` in `Collectible.tsx` that no GLSL stage declares.
- Keep the AGENTS.md performance rules: no per-frame allocation. Build the graph in the
  `useLocalNodes` creator and mutate `uniform().value` in `useFrame` rather than rebuilding nodes.
- Run `optimize-tsl` on each completed port.

**Exit criteria per component:** visual parity with the WebGL build at the same camera position,
and no new allocation in the `useFrame` path.

### Phase 5 — Particles: points → instanced sprites

**This is a rewrite, not a port.** WebGPU caps point primitives at 1 pixel (R7), so
`PointsNodeMaterial` cannot reproduce either effect. Both emitters must change primitive type.

1. `confettiPoint` (`point.*`) — convert `<points>` to an instanced quad/sprite mesh. The
   custom attributes (`spawnPosition`, `driftVelocity`, `launchSpeed`, `seed`, `colour`) become
   instanced attribute nodes.
2. `point` (gem particles) — same, including `gemTarget`.
3. Replace `gl_PointSize` with the quad's world/model scale computed in the vertex node, and
   `gl_PointCoord` with the quad's own UV in the colour node. The existing fragment maths
   (circular mask, soft edges, `discard` below an alpha threshold) carries over almost verbatim —
   only the coordinate source changes.
4. Preserve the `vSoftness` sparkle flag (`seed > 0.9` picking a different particle shape) and the
   `#ifdef USE_DISTANCE_FADE` behaviour, which becomes a plain node branch on a uniform rather than
   a shader `defines` entry.
5. Additive blending and `depthTest={false}` carry over unchanged.
6. Verify the emitters still drive instance data through the existing `useDynamicMeshes` /
   `useDynamicRigidBodies` attribute writers.

**Exit criteria:** particle counts, spawn behaviour, per-particle colouring and burst timing
unchanged; particles still readable as soft round glows rather than squares.

### Phase 6 — GPGPU positional pass → compute

Replace `floatingTiles/shaders/position.frag` and the whole `GPUComputationRenderer` setup (R6/D).

1. Convert the ping-pong render-target loop into a WebGPU compute pass: an `Fn()` writing a
   `storage()` buffer of `vec4(column, y, row, speed)`.
2. Port `hash3`, `sampleSpawnMask`, `pickSpawnCell` with the TSL helper library.
   `pickSpawnCell`'s 12-iteration loop with an early return becomes `Loop(12)` + `If` + a break, or
   a stateless variant.
3. Replace `resolution` / `texturePosition` shader-chunk dependencies with explicit
   `screenSize`-equivalent and storage-buffer reads.
4. `uDeltaTime`, `uYMin`, `uYMax`, `uGridCols`, `uRowCount`, `uSpawnMask`, `uSpawnMaskSize` become
   uniforms/storage bindings as today.
5. Consume the result from `floatingTiles.vert`'s replacement via the storage buffer instead of a
   vertex texture fetch.

**Exit criteria:** tile respawn cadence and spawn-mask avoidance match the WebGL build; the
ping-pong render targets are gone.

### Phase 7 — Cleanup

Partly done already, because the ports made several of these items dead as they landed.

| Item | State |
| --- | --- |
| Delete the GLSL files | **28 of 32 deleted** with their ports. 4 remain: `point.frag`/`point.vert` and `effects.frag`/`effects.vert`. |
| `resources/glsl/` (7 files) | **Dead but not yet deleted.** Nothing imports it; the only remaining references are "Port of resources/glsl/x.glsl" comments in `resources/tsl/`. Delete with the last port. |
| Turbopack GLSL loader rules | ✅ **Removed by hand** from `next.config.ts`. |
| `shader.d.ts` | Still needed — the 4 remaining files are imported as raw strings. Delete with them. |
| `glsl-rotate` | ✅ **Removed.** Never imported; every rotation here is hand-rolled. |
| `glsl-noise` | ✅ **Removed.** All five consumers now use TSL's `mx_noise_float`. |
| `glslify`, `glslify-loader`, `raw-loader` | **Still in `package.json` and now unused** — `next.config.ts` has no rules referencing them. Remove. |
| `shaderMaterial` from drei | Gone from 14 of 15 components; `Particles.tsx` remains. |
| `ScreenQuad` / `useFBO` / `extend` | All three remain in `Effects.tsx` only. |
| `.github/prompts/clean-shader.prompt.md` | Live. Written entirely around GLSL concerns (precision qualifiers, `gl_FragColor`, varying precision matching, `mediump`/`highp` policy) that have no TSL equivalent. Retire or replace with a TSL review prompt. |
| Canvas entry | Still `@react-three/fiber/webgpu`. Revisit only if a WebGL fallback is wanted (R6). |
| `best-practices` pass | Not run. |

**Also worth doing:** `resources/tsl/particleQuad.ts` exports `softCircleMask`, `softEdgeRadius`
and `sparkleCircleMask`. The confetti uses the first two; `sparkleCircleMask` was written for the
gem particles and is currently unreferenced — it becomes live with that port, or should be deleted
with it if the port takes a different approach.

**Exit criteria:** no GLSL remains in the repo; `npm run build` and `npm run lint` pass; shader
count in the WebGPU renderer's pipeline cache matches the component count.

---

## 5. Verification strategy

- **Per phase:** `npx tsc --noEmit`, then `npm run dev` and exercise the scene.
- **Per shader port:** side-by-side against the WebGL build at a fixed camera position. Because the
  game is procedurally paced, add a temporary debug pose for comparison shots.
- **Colour parity:** the cosine palettes are the highest-risk drift area (buckets B/C/D all read
  them). The Phase 2 tests that would have pinned them were dropped — the repo has no test runner
  and adding one was judged out of scope — so palette drift can only be caught visually. The GLSL
  reference values remain in `resources/glsl/` until the last port, so a retro-fit test is cheap.
- **Performance:** the renderer change alters draw-call and pipeline-compile behaviour. Use
  `scene-warmup` and the existing `DebugControls`/`Stats` overlays to compare frame times before
  and after each wave.

## 6. Rollback

Each shader component is its own commit, so a regression in one is reverted in isolation:
`git revert <sha>` restores that component's GLSL **and** its `shaderMaterial` wiring together.

One caveat the commits do not protect against: **28 GLSL files are deleted across four commits**,
and the importer change is in the same commit as each deletion, so a partial revert is safe. What
is *not* independently revertable is the shared groundwork — `resources/tsl/`, `coreUniforms.ts` and
the Canvas swap are depended on by everything after them.

The original GLSL for any deleted file is recoverable from git history: the files were deleted in
the port commits, not squashed away.

## 7. Execution log

### Phase 0 — dependencies ✅

- Added `.npmrc` (`legacy-peer-deps=true`) for the stale rapier peer range (R1).
- Bumped `three` 0.182.0 → 0.185.0, `@types/three` 0.180.0 → 0.185.0,
  `@react-three/fiber` 9.4.2 → 10.0.0-alpha.5, `@react-three/drei` 10.7.7 → 11.0.0-alpha.6.
  All four resolved as pinned.

**Install note.** `npm install` failed with `EPERM` against `~/.npm/_cacache` under the session's
file sandbox. Worked around with a throwaway cache (`--cache /tmp/npm-cache-qr-install`). No repo
config was changed for this, and the workaround is not needed outside the sandbox.

**Unplanned scope — R3F v10 removed `clock`.** The bump surfaced `Property 'clock' does not exist
on type 'RootState'` at 11 sites. Frame timing now arrives as `FrameTimingState`
(`time`, `delta`, `elapsed`, `frame`), re-exported from `@react-three/fiber`. Fixes applied:

- `hooks/useGameFrame.ts` — callback state is now `RootState & FrameTimingState` so `state.elapsed`
  type-checks for every consumer. No runtime behaviour change, no per-frame allocation.
- Six call sites moved from `clock.elapsedTime` → `elapsed`: `Rings.tsx`,
  `IconSphere.tsx`, `Particles.tsx`, `ConfettiParticleEmitter.tsx`, `Collectible.tsx`,
  `ColourTile.tsx`.
- `InfoZone.tsx` — `HtmlProps` import moved from the removed `@react-three/drei/web/Html` to
  `@react-three/drei/webgpu`.

### Phase 1 — Canvas ✅

- Added `components/WebGPUCanvas.tsx` from the `add-webgpu-canvas` skill reference, public props
  unchanged.
- `components/Game.tsx` now renders it. The old `gl` props were translated to `rendererProps`
  (`antialias: !isMobile`, dev/prod `powerPreference`; `alpha: false` is already a default). The
  canvas-level `onContextMenu` moved into `WebGPUCanvas`, which already suppresses it. `dpr`,
  `camera` and `className` are unchanged.

### Phase 2 — shared TSL helpers ✅

Ported all seven glslify modules to `resources/tsl/`, plus the `createTSLFn` typing helper. Every
helper type-checks clean on first pass after two fixes: `abs` needed an explicit `Node<'float'>`
parameter to satisfy `smoothstep`'s overloads, and `select` needed explicit generics in the
`playerPalette` reduce chain.

`tsc` count unchanged at 16 — the helper library adds no errors and breaks nothing.

**Outstanding:** the Phase 2 exit criteria ask for tests pinning each helper against the GLSL
reference values. Not yet written; the palettes are the highest-drift risk in the whole migration.

### Phase 4 (item 1) — `backdrop` ✅ — the pattern proof

`components/backdrop/Backdrop.tsx` is now the reference port:

- `backdrop.vert` deleted outright — a `meshBasicNodeMaterial` supplies the vertex transform.
- `backdrop.frag` → a `colorNode` built in `useLocalNodes`, composing the texture read, the
  `DARKNESS` multiply and the `EDGE_FADE` smoothstep.
- `shaderMaterial` + `extend` + the `key={Shader.key}` remount idiom are gone.
- The curved-geometry `useLayoutEffect` is untouched; its local `uv` buffer variable was renamed
  `uvAttribute` so it no longer shadows the `uv` node factory from `three/tsl`.

`tsc` dropped **16 → 15**: the backdrop's `shaderMaterial` error is gone and nothing replaced it,
which is the first concrete evidence the pattern works end to end. `backdrop.frag`/`.vert` are now
orphaned files awaiting Phase 7.

The remaining 15 errors are 14 `shaderMaterial` imports (Phases 4–5) plus the one `clock` in
`Effects.tsx` (Phase 3). No error lies outside those categories, so risk R3 — three 0.182 → 0.185
breaking unrelated code — did not materialise beyond the `clock`/`Html` API changes recorded above.

### Phase 4/5 progress — shader ports

Ported to TSL so far — each is type-clean and lint-clean:

| Component | Shader(s) | Notes |
| --- | --- | --- |
| `backdrop` | `backdrop.*` | The reference port; `vert` deleted outright. |
| `infoZone` | `infoZone.*` | `paintCorners` helper; `uOpacity` (dead) dropped. |
| `collectibleTile` | `collectibleTile.*` | `paintCorners`; `vUv` varyings never read, so dropped. |
| `speedRun` | `finishLine.*`, `startLine.frag` | Two materials kept; `TILE_EPS` preserved. |
| `ring` | `ring.*` | All work in one graph; `Rings.tsx` tween contract preserved via uniform nodes on the material ref. |
| `floatingHeading` | `floatingHeading.*` | Varyings recomputed, so per-frame CPU writes dropped. |
| `iconSphere` | `iconSphere.*` | Scale via `positionNode`; `uOpacity`/`uGlowStrength` (dead) dropped. |
| `gemShell` | `gemShell.*` | `aBarycentric` read via `attribute<'vec3'>`. |
| `confetti` particles | `confettiPoint.*` | **Primitive change**: `<points>` → instanced quads (WebGPU's 1px point limit). |
| `marble` | `marble.*` | Varyings recomputed; fake lighting ported as-is. |
| `colourTile` | `colourTile.*` | Per-tile uniform scope so palette/active state cannot leak across the row. |
| `tile` | `tile.*` | Instanced; tilt moves geometry via `positionNode`, verified against three's instancing order. |
| `floatingTiles` | `floatingTiles.*`, `position.frag` | Simulation became a real compute kernel; the GPGPU renderer was WebGL-only. |

New shared helper: `resources/tsl/particleQuad.ts` holds the radial masks the two particle systems
share, in both soft-edge and sparkle form.

Helper library now also carries `fadeDistance`, `cameraFadeNear`, `palette`, `playerPalette`,
`tilesPalette`, `sdBox`, `paintCorners`, `createTSLFn`, `particleQuad`.

### Uniform consolidation (done alongside the ports)

Uniform creation and updating were tightened once the pattern had settled:

- **Animation time** comes from TSL's built-in `time` node wherever it was wall-clock. Ring,
  ColourTile, IconSphere and the gem shell each had a uniform the CPU wrote an `elapsed` value
  into every frame; all four writes, their uniforms and Ring's now-empty frame loop are gone. Only
  values that genuinely need clamped simulation time keep a uniform: `floatingTiles`' `uDeltaTime`,
  the two burst progresses and Marble's shader clock.
- **Two scope collisions fixed.** Ring and InfoZone are repeated components that registered every
  instance's uniforms under one fixed scope name, so instances shared palette, progress and
  visibility state. Ring now takes its scope from the pool slot, InfoZone from the zone index.
- **Config uniforms folded into their component's creator**, removing a second scope each from
  Marble and the platform tiles.
- **`useLocalNodes` creators are `useCallback`s.** The hook memoises on the creator's identity, so
  inline creators rebuilt every graph on every render. Dependency arrays list the values actually
  captured while building the graph; scope-read uniforms are deliberately excluded because a
  uniform value change does not rebuild a graph.
- **Shared per-frame state lives in `coreUniforms`**: `uScrollZ` and `uPlayerWorldPos`, both written
  by Platform from the subscriptions it already owns, read by the tile, floating-tile and heading
  graphs from `CreatorState`. This removed two duplicate store subscriptions.

### Phase 6 — GPGPU positional pass → compute ✅

`floatingTiles/shaders/position.frag` is now `floatingTilesSimulation.ts`, a compute kernel over an
instanced storage buffer.

The change was forced, not stylistic: the GLSL ran as a fragment pass under three's
`GPUComputationRenderer`, which is 508 lines built on `WebGLRenderTarget` and `FullScreenQuad`. Its
`compute()` ends in `renderer.setRenderTarget(webGLRenderTarget)`, so under the WebGPU renderer the
simulation could not run at all. Keying particle state by `instanceIndex` also deleted the entire
texel-addressing apparatus: the instance-to-texel uv map, the padded slot count, the double-buffered
position textures and the per-frame read-back.

`renderer.compute(simulation.update)` drives it, matching the landing app's `Fireflies`.

### Phase 5 (completed) — gem particles → compute ✅

`point.vert` (167 lines) and `point.frag` became `gemParticleSimulation.ts`, following the shape of
Threenix's `Fireflies`: storage buffers created once, a compute kernel advancing them, and node
graphs reading the buffers back through `toAttribute()`.

The per-particle data splits by how often it changes. Spawn, gem-interior target, seed and palette
index are constant and seeded on the CPU when the buffers are created. Only the burst position
advances per frame. The settled float is a pure function of time, so the kernel parks it once the
burst completes and the render nodes take over.

The palette became graph constants indexed by a per-particle slot rather than a colour attribute,
dropping a `vec3` per particle from the buffers.

### Remaining

**Rendered, and the first run is clean.** See "First run — runtime errors" below: the scene boots,
renders and plays with an empty console. Phase 7 is otherwise complete — see the table above for the
few items that are not code.

**Noise decision — settled.** All ports use TSL's built-in `mx_noise_float`. A hand-written Ashima
simplex port was written and then deleted: TSL's MaterialX noise has the same −1..1 range, the
frequency constants carry over unchanged, and the code shape is identical, so the trade is a
slightly different noise field in exchange for no custom code and no `glsl-noise` dependency.
Marble's veins and colourTile's domain warp shift subtly as a result; this is accepted.

✅ **`glsl-noise` is removed.** `floatingTiles` was the last consumer; all five now use
`mx_noise_float`.

### First run — runtime errors

The port was type-clean but had never executed. Working through the browser console top-down turned
up four distinct root causes. Two of them were systemic, and both are worth remembering because the
type-checker cannot see either.

**1. `Discard`/`toVar`/`assign`/`If` do not exist at React render time.**

`Node.assign()` and `If()` are *statement* APIs: they write into the current shader stack, and that
stack only exists while an `Fn()` callback is executing — which happens during shader generation,
not while a `useLocalNodes` creator builds the graph. Calling them in a creator therefore either
throws (`TSL: No stack defined for assign operation`, `currentStack.If` on `null`) or, for
`Discard`, silently returns an unconnected node — a no-op that drops the alpha cutout without a
sound.

- `Tiles`, `Ring`, `FloatingHeading`, `Marble`, `InfoZone` and `Collectible` were rewritten as pure
  expression graphs. `toVar`/`assign` chains became `mix`/`add`/`sub` compositions, and the
  build-time `If` flags (`useDistanceFade`, `useNoiseFade`, `shouldRotate`) became JavaScript
  conditionals, which is correct because the graph is rebuilt when those props change.
- `Discard(x <= eps)` became `alphaTest={eps}` on the material. `NodeMaterial` already emits
  `diffuseColor.a.lessThanEqual(alphaTest).discard()` inside its own `Fn`, so this needs no stack and
  is exactly the GLSL's `if (x <= eps) discard;`.
- `speedEffectsPost.ts` and both compute kernels were already correct — their statements live inside
  `Fn()`.

**2. `useUniforms(scope)` reads the committed store, not the staged registry.**

`GameUniforms` stages the `core` scope and only commits it in a layout effect. A reader in another
component therefore sees `{}` on the first render, while a creator reading `CreatorState` sees the
staged overlay. `Platform` read the scope with `useUniforms(CORE_UNIFORM_SCOPE)` and handed that
snapshot to `usePlayerPosition`, whose mount-only effect fires before the scope exists:
`Cannot read properties of undefined (reading 'value')`. `Platform` now reads it through
`useLocalNodes(readCoreUniforms)`, so `uScrollZ` and `uPlayerWorldPos` are real nodes from the first
render and the write contract (`uPlayerWorldPos.value.set(x, y, z)`) is unchanged.

**3. `floatingTiles` built its storage buffer after the graph that reads it.**

`createFloatingTilesSimulation` ran in an effect, but `createNodes` dereferenced
`simulationRef.current!.positions` during render. The buffers, kernel and render nodes now all come
out of one `useLocalNodes` creator — the shape `Particles.tsx` already used — so nothing has to
exist before the graph is built. Three further bugs fell out of that rewrite:

- `uDeltaTime` was a plain `{ value: 0 }` object, so `speed.mul(uniforms.uDeltaTime.value)` baked the
  constant `0` into the kernel and no tile would ever have moved. It is a registered uniform node
  now.
- The spawn mask had become a storage buffer snapshotted at creation, so the per-row updates the
  platform pushes through `setRowData` never reached the GPU. The kernel samples the mask texture
  again, which is what `spawnMaskTextureRef` was still there for.
- The `textureSize`/`instanceCount` padding, the `rowColumnSpawnable` mirror array, the unused empty
  `useEffect` and the `reset()` handle method (the platform resets by remounting on
  `resetPlatformTick`) were all dead and are gone. Its mount-time `reset()` call was also removed: it
  re-seeded a simulation that had just been seeded.

**4. `positionNode` silently discards the instance matrix — the platform floor never rendered.**

This is the one with the widest blast radius, and it is the one the type-checker and the console were
both silent about. `NodeMaterial.setupPosition` does:

```js
if ( object.isInstancedMesh ) instancedMesh( object );      // positionLocal = instanceMatrix * positionGeometry
if ( this.positionNode !== null ) positionLocal.assign( … ); // positionLocal = positionNode(...)
```

So a `positionNode` *replaces* the post-instancing local position: it has to re-apply the instance
transform itself. `Tiles.tsx` supplied `positionNode: rotate(positionGeometry, …)`, which dropped the
instance matrix, so all **1,320 platform tiles collapsed onto the origin**, drawn as one banded stack
of coincident boxes, while their Rapier colliders stayed in the right places. The marble rolled on an
invisible floor. `positionWorld` was wrong for the same reason, so the contact shadow and the noise
field read a collapsed position too.

The original `tile.vert` made this explicit — it rotated about `modelInstanceMatrix[3].xyz`, the
instance centre. Three folds the instance matrix into `positionLocal` before the override runs, so
that centre is recoverable as `positionLocal - positionGeometry`, and that is what the node now adds
back. Threenix's `ThornWake.tsx` solves the same problem the other way, by reading
`mesh.instanceMatrix.array` through `buffer()` and applying the matrix by hand; that route is not open
here, because the tiles are moved every frame (a uniform buffer would not re-upload) and 1,320 `mat4`
exceeds the 64 KB uniform limit.

`FloatingTiles`, the gem particles and the confetti all use `positionNode` on an `instancedMesh` too,
but their instance matrices are identity (or, for the quads, never written at all), so discarding them
is harmless. Anything that later gives one of those meshes a real transform must re-apply it.

**5. `Effects.tsx` read its own uniform scope before registering it.**

`useUniforms<EffectsUniforms>(SCOPE)` on the line above `useUniforms(createEffectsUniforms, SCOPE)`.
The reader form sees only the committed store, so it returned `{}` on the first render and both the
pipeline callback and the frame callback closed over an undefined node — an intermittent
`Cannot set properties of undefined (setting 'value')` that only fired when a frame beat the layout
effect that commits the scope. Registration and read are now one call. This was the last reader-form
call site; `Platform` (cause 2) was the other.

**6. Pre-existing lint errors.** The three errors in `ConfettiRows.tsx` and `FloatingMenu.tsx` are
untouched by this work and still stand.

**Also known, not fixed:** the UI hook `useSurfaceAttractor` logs `GSAP target null not found` from
`gsap.quickTo` when a `Button`/`Panel` mounts. That is DOM-side code the migration never touched, it
predates the port, and it is a warning rather than an error — recorded here so it is not mistaken for
a WebGPU regression.

**Gates after the above:** `npx tsc --noEmit` clean; `npx eslint components hooks resources app
stores utils` reports 3 errors, all the pre-existing ones, and no new warnings on any file this
migration touched. In Chrome the scene boots, plays and renders the platform floor, floating tiles,
headings, rings, info zones, the gem and the HUD with **zero console errors** across a sweep of every
quality tier, both game modes, an overlay open/close, a DPR change and sustained play. The remaining
warnings are the debug logs that `IS_DEV_ENV` is supposed to emit.

### Commit log

All work is on `speedroller-webgpu`. The commits are ordered so each is independently reviewable and
revertable; the shader ports are one component-group per commit.

| Area | Commits |
| --- | --- |
| Phase 0 — dependencies | `Upgrade to three 0.185 and React Three Fiber v10 alpha` |
| Phase 1 — canvas | `Render the scene on a WebGPU canvas` |
| Phase 2 — TSL helpers | `Add shared TSL helper library` |
| Phase 4 — surface shaders | `Port the backdrop shader to TSL`; `Port the ring, heading, info zone and collectible shaders to TSL`; `Port the marble and colour tile shaders to TSL`; `Port the platform tile shader to TSL` |
| Phase 5 — particles | `Port the confetti particles to instanced quads` |
| Phase 6 — compute | `Port the floating tiles to TSL and run their simulation as compute` |
| Uniform work | `Share uScrollZ through a registered core uniform`; `Consolidate uniform creation and drop per-frame time writes`; `Share the player's world position through the core scope`; `Drive the gem's pulse from TSL time` |
| This document | `Add the WebGPU and TSL migration plan`, plus the plan-revision commits |

`npx tsc --noEmit` is **clean**. Every `shaderMaterial` reference and the `clock` call went with the
phases that replaced them, so the type-check gate the plan opened Phase 0 with now passes outright.

`npx eslint` is clean on every file touched. The only errors repo-wide are pre-existing ones in
files this migration has not touched (`ConfettiRows.tsx`, `FloatingMenu.tsx`). There is no CI
workflow in the repo (`.github/` holds only prompt files), so both checks are run by hand.

The scene **has now been rendered** — see "First run — runtime errors" for what that surfaced and
what was fixed. Everything else in this document is the port as it was written.
