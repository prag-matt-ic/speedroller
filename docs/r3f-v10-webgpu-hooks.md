# React Three Fiber v10 WebGPU Hooks

Purpose: Define Threenix conventions for React Three Fiber v10 WebGPU hooks and prop utilities when building TSL uniforms, material nodes, compute nodes, postprocessing nodes, and mount-only setup.

Read this before touching:

- WebGPU/R3F components that import from `@react-three/fiber/webgpu`
- TSL node materials using `colorNode`, `opacityNode`, `positionNode`, `scaleNode`, `emissiveNode`, or compute nodes
- `uniform(...)` calls inside React components
- repeated WebGPU components that need per-instance uniforms
- postprocessing code that may adopt newer R3F WebGPU hook APIs
- `once` or `fromRef` prop usage, geometry transforms, or mount-only imperative prop setup

Keywords: React Three Fiber v10, R3F v10, WebGPU hooks, TSL hooks, useUniform, useUniforms, useLocalNodes, useNodes, uniforms, nodes, shader nodes, compute nodes, once, mount-only props, geometry transforms, fromRef

## Source References

- R3F v10 migration guide: https://github.com/pmndrs/react-three-fiber/blob/v10/docs/migration/v10.mdx
- WebGPU overview: https://github.com/pmndrs/react-three-fiber/blob/v10/docs/webgpu/overview.mdx
- TSL hooks: https://github.com/pmndrs/react-three-fiber/blob/v10/docs/webgpu/tsl-hooks.mdx
- Render pipeline hook: https://github.com/pmndrs/react-three-fiber/blob/v10/docs/webgpu/render-pipeline.mdx
- TSL HMR: https://github.com/pmndrs/react-three-fiber/blob/v10/docs/webgpu/hmr.mdx
- Additional exports (`once`, `fromRef`): https://github.com/pmndrs/react-three-fiber/blob/v10/docs/API/additional-exports.mdx
- Release notes: https://github.com/pmndrs/react-three-fiber/releases

The upstream docs are the conceptual source of truth, but this project may run an alpha package that is behind the docs. Before using a hook not already used in the repo, confirm it exists in `node_modules/@react-three/fiber/dist/webgpu/index.d.ts`, and confirm what it actually does in `dist/webgpu/index.mjs` — the docs describe a ref-counted lifecycle for the registered-resource hooks that the installed alpha does not implement. The installed package (`10.0.0-alpha.5`) exports `CreatorState`, `useUniform`, `useUniforms`, `useNodes`, `useLocalNodes`, `useBuffers`, `useGPUStorage`, `useTextures`, `useTexture`, `useRenderPipeline`, the `rebuildAll*` helpers for each resource kind, and the prop utilities `once`/`isOnce`/`ONCE`/`OnceValue` plus `fromRef`/`isFromRef`. `useThree` and `useFrame` imported from `/webgpu` are typed against `WebGPURootState`, whose `renderer` (and the deprecated `gl` alias) is already `WebGPURenderer`. Both `once` and `fromRef` are also exported from the plain `@react-three/fiber` entry, so either import path typechecks.

## Hook Choice

Use `useUniform` for one named root uniform that is intentionally shared or read by name:

```tsx
const uProgress = useUniform('uProgress', 0)
```

Use `useUniforms` for related uniforms, or for repeated components where a scope prevents name collisions:

```tsx
const createGemUniforms = useCallback(
  () => ({
    uAttractorPosition: new Vector3(),
    uProgress: 0,
  }),
  [],
)
const uniforms = useUniforms(createGemUniforms, `flightGem_${definition.id.replace(/-/g, '_')}`)
```

Inline objects are fine for simple singleton uniforms. In repeated components, or when values allocate Three objects, prefer a stable creator so uniform registration does not rebuild during unrelated renders.

When deriving a uniform scope from React `useId()`, strip non-alphanumeric characters instead of replacing them with underscores. React IDs can otherwise produce consecutive underscores in generated WGSL identifiers, which Safari rejects.

Use `useLocalNodes` for component-local TSL node bundles that feed JSX material props or compute passes. Creator callbacks receive a `CreatorState` with scoped `uniforms` and `nodes`, so node graphs can read registered uniforms inside the callback instead of closing over them directly. The upstream `useLocalNodes` docs support returning non-node values, but do not add setter wrappers when the hook-returned uniform can be updated directly. Keep CPU data, Three objects, layout data, and instanced buffers in normal `useMemo` when they are not shader-node composition:

```tsx
import {
  type CreatorState,
  useFrame,
  useLocalNodes,
  useUniforms,
} from '@react-three/fiber/webgpu'

const PARTICLE_UNIFORM_SCOPE = 'flightParticles'

const particleBuffers = useMemo(() => createParticleBuffers(count), [count])
const createParticleUniforms = useCallback(() => ({ uProgress: 0 }), [])
const { uProgress } = useUniforms(createParticleUniforms, PARTICLE_UNIFORM_SCOPE)

const { opacityNode, positionNode } = useLocalNodes(({ uniforms }: CreatorState) => {
  const { uProgress } = uniforms.scope(PARTICLE_UNIFORM_SCOPE)
  const positionNode = particleBuffers.positionBuffer.toAttribute()
  const opacityNode = smoothstep(0, 1, uProgress)

  return { opacityNode, positionNode }
})

useFrame(({ elapsed }) => {
  uProgress.value = Math.sin(elapsed) * 0.5 + 0.5
})
```

Use `useNodes` only when the node is expensive and genuinely shared by multiple components. `useLocalNodes(({ nodes }: CreatorState) => ...)` can then read shared root nodes directly or use `nodes.scope('scopeName')` for scoped shared nodes. Do not promote one-off material expressions into global nodes.

### Buffers, GPU Storage, Textures, and Render Pipelines (alpha.4+)

`useBuffers` and `useGPUStorage` are the registered-resource equivalents of `useUniforms` for compute buffers and storage textures. They add scoping, atomic rebuild during fast refresh, and `dispose*` utilities on top of the raw Three objects. Prefer them for buffers or storage textures that must be shared across components, survive HMR, or need explicit GPU disposal.

Their deciding use in this repo is not sharing — it is **disposal of GPU storage that nothing else can free**. Three releases a storage buffer's GPU memory only through `BufferAttribute.dispose()`, and the one path that calls it is `Geometries.onGeometryDispose → attributes.delete() → backend.destroyAttribute()`. A compute-owned buffer created with `instancedArray(...)` is reachable from no geometry, so no renderer path ever destroys it, and disposing its compute node frees only the pipeline, bind groups and node data. `useBuffers` keeps a live, name-addressable handle to those buffers so a component can dispose them itself. Migrate a component when it owns compute buffers **and** its churn is reachable (it unmounts, or the tier changes its buffer size); leave a component-local CPU attribute registered nowhere, as `Lasers` does.

Three measured caveats in the installed alpha decide how the migration has to be written:

- **No ref-counted lifecycle.** `useScopedResource` has no unmount effect. Buffers and storage survive `root.unmount()`; only an explicit `disposeBuffers`/`disposeStorage` in your own cleanup releases them. Measured: a name-keyed scope still holds its entries after unmount.
- **A rebuild does not free the old generation.** `useScopedResource` reuses existing entries by name, so the previous generation is only released if something disposes it first. `disposeBuffer` is reachable solely from `disposeBuffers`. Drive recreation from an `input` (the creator's dependency array) and dispose the outgoing generation in the same effect.
- **Registering buffers costs one extra mount render**, from the staging flush in `flushStagedScope` (`store.setState` → `usePrimaryStore` subscription). Harmless where materials are stable, but a component that keys a material on a node's `uuid` remounts that material on every render — that is the pattern in `Lasers.tsx`, where the keys come from an inline `useLocalNodes` creator, so an extra render rebuilds the beam material. Do not add a render to a component built that way.

  What that remount costs is allocation, not compilation, and the distinction is worth keeping straight when weighing a fix. `RenderObject.getMaterialCacheKey()` skips `uuid`, `version`, `name`, `opacity` and `userData` outright and collapses every node-valued property to `'{}'`, so a remounted material with the same graph shape produces the same node-builder cache key and reuses the cached shader; the renderer's `programs.vertex`/`programs.fragment` caches are keyed on the cached shader object, so no pipeline is rebuilt either. Fixing the key is still worth doing — it is one string returned from the creator, as `Rings.tsx` and `CurveRings.tsx` do — but it saves object allocations per re-render, not a shader compile. `RingPulses.tsx` was the material still keyed on a node uuid after that pattern was adopted elsewhere.

**Scope names must pin the data size.** A remount that reuses a scope name adopts the previous mount's buffers, and it does so *during render* — verified: with `useBuffers(creator, 'batch0')` the second mount received the first mount's `Float32Array` (length 32) after its own creator asked for length 12, and the stale entry was still committed. Cleanup effects cannot fix this, because the wrong buffer is already bound by the time they run. Namespace the scope with every input that shapes the allocation (`getMeteorBufferScope(index, count)` in `components/meteors/meteorBuffers.ts`), so a size change lands in a fresh scope. `removeBuffers`/`disposeBuffers` do not clear the scope's `valid` flag either, so removal alone is not a way out.

**The `dispose*` utilities want a mutable `string[]`.** `DisposeBuffersFn` and `DisposeStorageFn` are typed `(names: string | string[], scope?: string)`, so a `readonly`/`as const` name tuple is rejected even though the implementation only reads it; spread it (`[...NAMES]`) rather than casting.

`RingParticles` remains a migration candidate. `InvertedMeteorFalls` uses per-batch scopes. `Fireflies` now uses instance/count-specific scopes, explicitly passes the scope to `disposeBuffers`, and disposes outgoing compute graphs. Its four buffers also feed rendering attributes, so geometry cleanup owns their GPU attributes. Count changes are checked with production compute/readback and render calls. `hooks/pointerTrail/usePointerTrail.ts` is the reference for the manual approach it already uses — it disposes its three compute nodes and both `StorageTexture`s in an effect — so it needs no migration.

`useTextures` exposes the reactive, ref-counted texture registry that `useTexture` already enrolls in; use it when a texture needs to be shared by key without passing refs through the tree. `useRenderPipeline` replaces `usePostProcessing` with a declarative render-pipeline and MRT setup on the WebGPU entry. Adopt it for a new, single pipeline whose node graph is fixed after mount; it is not a drop-in for the flight post pass (see the next subsection).

#### Why `Postprocessing.tsx` Stays on Raw `RenderPipeline` (installed alpha.5)

The flight post pass was audited against `useRenderPipeline` and rejected. The mismatch is structural, not about dynamic values, and comes from the hook's own contract:

- **One pipeline per root.** The hook writes a single `renderPipeline` entry into root state, and upstream documents it as "one `useRenderPipeline` per app ... Multiple setups overwrite each other and risk race conditions". The flight post owns three pipelines (direct, motion/radial blur, overlay) because changing `outputNode` requires `pipeline.needsUpdate = true`, which rebuilds the full-screen node material; separate instances plus one warm-up render each keep every graph compiled. Moving only the direct pipeline would leave two ownership models in one component.
- **Its automatic rendering is inert here.** R3F's default render job renders `state.renderPipeline`, but it returns early when any non-system job is registered in the `render` phase (`hasUserJobsInPhase`). `Postprocessing`'s `useFrame(..., { phase: 'render' })` is that job, and the per-frame choice between direct, motion, and overlay frames is why it exists. The hook's main benefit does not apply, so the component would still call `render()` itself.
- **Callbacks do not re-run on render.** `setupCB`/`mainCB` run on first creation, on a scene/camera change, and on explicit `rebuild()`. Closure-driven graph changes (`sceneMrt` following `isBloomEnabled`, `pointerTrail.isInitialized`, the overlay blur flag) would need a mirror effect calling `rebuild()`, swapping the current dependency array for a store round-trip rather than deleting it.
- **No teardown.** Upstream states the hook persists across unmounts with no auto-cleanup, and `reset()` disposes the cached scene pass but not the `RenderPipeline` instance. A long-lived, app-critical pass would still own its disposal, so the migration would remove `new RenderPipeline(renderer)` and almost nothing else.

This is the pattern the shared `@repo/threenix-developers/bloom-post-processing` component follows: one root pipeline, a graph fixed after mount, numeric controls written to the bloom node's own uniforms, `isEnabled` driving `rebuild()`, and no manual render call. Revisit the flight post when the hook gains per-pipeline instances or an explicit unmount cleanup, or when it collapses to a single graph.

Inline `useLocalNodes` creators are valid and match the upstream examples. In the installed alpha, `useLocalNodes` memoizes the returned object with the creator function, uniforms, nodes, and textures as dependencies, so an inline creator can recompute on normal component renders. That is acceptable for simple material composition and keeps the uniform access local and readable. Use `useCallback` only around creator functions that are expensive enough to justify stabilizing their identity.

`useUniforms` and `useNodes` return `remove*`, `clear*`, and `rebuild*` utilities for explicit lifecycle management. A rebuild invalidates the cache and atomically replaces the resource generation, so long-lived callbacks that captured the previous uniforms or nodes can become stale. Avoid hiding those resources in refs and ensure callbacks are recreated after a rebuild. See the upstream [TSL HMR guide](https://github.com/pmndrs/react-three-fiber/blob/v10/docs/webgpu/hmr.mdx).

## Mount-Only Props: `once` and `fromRef`

`once` marks one prop as a mount-time side effect. The marker is a fresh object on every render, so `once` does not avoid R3F's prop diff; it avoids re-application. The runtime records the prop name in `instance.appliedOnce` on first application and skips the method call on every later `applyProps` pass, which is a single set lookup:

```tsx
import { once } from '@react-three/fiber/webgpu'

// In-place geometry transform, applied exactly once.
<planeGeometry args={[10, 10]} translate={once(0, 0, 5)} center={once()} />

// Static transform values that only need one write on a re-rendering object.
<mesh position={once(0, 8, 0)} />
```

Typing follows the prop, so no cast is needed. `once(x)` is typed as `x`, `once(x, y, z)` as the argument tuple, and `once()` as `true` (`OnceValue` in the package types). Argument arity is checked against `GeometryTransformProps`: `once(0, 0)` and `once(1, 2, 3)` do not satisfy `translate`, `center` accepts only the bare `once()`, and `applyQuaternion` requires a real `Quaternion` — an `Euler` typechecks but produces a blank geometry at runtime because it has no `x`/`y`/`z` fields.

The installed alpha.5 typings do not accept `once` on the generic `<bufferGeometry>` element. `GeometryTransformProps` overwrites the class's own transform methods with data props only for `BufferGeometry` itself, so `center={once()}` there resolves against `() => this` and fails to typecheck. Every concrete geometry element (`planeGeometry`, `boxGeometry`, `cylinderGeometry`, `torusGeometry`, `ringGeometry`, `circleGeometry`, `sphereGeometry`, `coneGeometry`, `icosahedronGeometry`, `octahedronGeometry`, and the rest) accepts `once` correctly, so use a concrete element instead of `<bufferGeometry>` when a mount-only transform is needed. The upstream doc's `<bufferGeometry center={once()} />` and `<bufferGeometry applyMatrix4={once(matrix)} />` examples predate this typing and do not compile here.

Resolution rules:

- The prop must already resolve to a method or a property path on the object. `once` calls `object[prop](...)` when the target is a function; otherwise it assigns `args[0]`, and a bare `once()` on a non-function target does nothing.
- `once` only runs on a target R3F creates. It cannot be attached to a geometry, material, or texture built with `new` in a module or `useMemo` and passed by reference, because that object never enters the R3F graph as an element and never receives props.
- When `args` change, R3F reconstructs the instance and deletes `appliedOnce`, so the transform re-runs against the fresh object. The marker's declared type never participates in the `args` diff.

### `once` Is Not a `useMemo` Replacement

`useMemo` preserves a value's identity across renders. `once` suppresses prop re-application on an object that R3F already created. They fix different problems and one does not imply the other:

- `useMemo` does not stop R3F from reapplying props. A memoized `new Vector3()` used as `position={vec}` still gets `target.copy(value)` on every commit.
- `once` does not stop allocation. The array literal or Three instance on the right-hand side is still constructed on every render.

Rule of thumb: keep `useMemo` when the concern is allocation or identity (scratch vectors, instance buffers, layout data, curves, matrices). Reach for `once` when the concern is application:

- The transform mutates the geometry in place and would compound per render (`rotateX`, `translate`, `scale`, `center`, `applyMatrix4`, `applyQuaternion`). Here `once` is a correctness requirement, not an optimization: re-applying `center()` recentres an already-centred geometry, and `translate()` compounds additively on every re-render.
- The prop is an object-typed value that a parent recreates each render, or an array longer than nine elements — `diffProps` falls back to reference comparison past length 9. Neither applies to a three-number transform, so see the audit below before adding `once` to `position`/`rotation`/`scale`.
- Use `once` with `args` that are computed once (a `useMemo`-ed `Matrix4`) when the object itself must stay declarative. Compute the matrix in `useMemo` and mark the prop `once(matrix)`.

`fromRef` is the complement: it defers a prop until a ref is populated and has no once-only behaviour (`<spotLight target={fromRef(targetRef)} />`). `once` handles mount-time work; `fromRef` handles ordering. Never use either to smuggle per-frame values into props.

### No Duplicate Application from Reuse

`appliedOnce` lives on the R3F instance, not on the Three object. When one prebuilt geometry instance is shared by several elements (the `useMemo`-ed geometry in `SunProminences`, or `args={[geometry]}` reuse), each element is still its own instance, and no `once` marker is involved — prebuilt objects never receive props. The only replay that can happen is on instance reconstruction, when `args` change and R3F deletes `appliedOnce` before reapplying the element's props. That replay is the intended behaviour, so keep mount-time transforms on the declarative element that owns the `args`, never on a module-level singleton that the whole scene shares.

### Fast Refresh

Mount-time work keyed to the R3F instance re-runs when the element is reconstructed, not when the module is hot-swapped, which makes `once` more predictable than a module-level imperative transform. Prefer it for new mount-time geometry setup; the existing module-level factories stay as they are because they are shared singletons with no per-render application to suppress.

### Audit Findings (installed alpha.5)

A repo-wide scan for geometry transforms found no site that is currently broken and none where a `useMemo` can be deleted outright:

- Every imperative transform in this repo runs inside a geometry factory, before the object is attached (`geometry.center()` in `ControlPanel`, `ThreeMeshText`, `Heading`; `TorusGeometry(...).rotateZ().translate()` in `pendulumMotion`; `setFromPoints`/`computeBoundingSphere` in `CurveDebugHelper`; attribute and interleaved-buffer writes in `SunProminences`, `InvertedMeteorFalls`, `LucideIcon`, `LinkedParticles`). They cannot compound and `once` does not apply to them.
- Scratch object reuse (`useMemo(() => new Vector3(), [])` in `MotionRuntime`, `CrescentPendulums`, `Button`, `CurveDebugHelper`) is correct `useMemo` usage: hot-loop allocation, not prop application.
- Constant literal transform props (`position={[0, 8, 0]}` in `LastCrownGate`, `CrescentPendulums`, `Lasers`, and the rest) need no `once`. `diffProps` compares arrays structurally, so a fresh three-number literal already compares equal and is dropped before `applyProps` runs. Reused `Vector3`/`Quaternion` props are reference-equal and are dropped too. `once` cannot prevent work that the diff already prevents.

`apps/landing/components/oncePropDiff.test.ts` pins this behaviour against the installed alpha: equal array literals and reused vectors are dropped by the diff, a fresh `once()` marker is always seen as changed, and only the runtime `appliedOnce` guard prevents re-application. If a future R3F release changes how `diffProps` compares arrays, that test fails and the mount-only guidance above needs revisiting.

Use this scan before and after a `once` migration to re-check the ground truth:

```bash
grep -rn "\.center()\|\.translate(\|\.rotate[XYZ](\|\.applyMatrix4(\|\.applyQuaternion(" apps packages --include=*.ts --include=*.tsx
```

## Runtime Rules

TSL graph creation runs in JavaScript while React renders. Uniform value changes happen later on the GPU side. Do not branch on `.value` while building a graph if the branch needs to react at runtime; use TSL `If`, `select`, `step`, `smoothstep`, or similar node operations.

Good:

```tsx
const { colorNode } = useLocalNodes(({ uniforms }: CreatorState) => {
  const { uMode } = uniforms.scope('exampleMode')
  const colorNode = select(uMode.equal(1), activeColor, inactiveColor)

  return { colorNode }
})
```

Bad:

```tsx
const { colorNode } = useLocalNodes(({ uniforms }: CreatorState) => {
  const { uMode } = uniforms.scope('exampleMode')

  return { colorNode: uMode.value === 1 ? activeColor : inactiveColor }
})
```

### Vertex-Stage Nodes Must Read `positionGeometry`, Not `positionLocal`

`positionLocal` is a varying, not the vertex attribute, and the node material assigns its position output
from it *after* custom nodes run. A vertex-stage expression that reads `positionLocal` therefore compiles
to a use-before-assign of an uninitialized `var<private>` in WGSL, so the mesh rasterizes at garbage
positions. In `Heading.tsx` this collapsed the text to a point, which reads as a transparent heading even
though the geometry, material, and colors were all correct:

```wgsl
// Heading.tsx before the fix: the color node is evaluated before this assignment exists.
nodeVar0 = getStepColourFromPalette( mx_worley_noise_float_1( positionLocal - vec3<f32>( 0.0, 0.05, 0.0 ) ) );
// ...
positionLocal = position;
v_positionView = ( modelViewMatrix * vec4<f32>( positionLocal, 1.0 ) ).xyz;
```

Use `positionGeometry` for geometry-space input read from a `colorNode`, `opacityNode`, `vertexStage(...)`,
or any node that is not the material's `positionNode`. The same caution applies to `positionWorld` and
`positionView`, which other setup stages compute. `normalLocal` is the exception: the node material
assigns it from the `normal` attribute up front for lighting, so it is safe to read anywhere. A material
that *does* set `positionNode` assigns `positionLocal` itself in `setupPosition`, before its own position
output.

Update uniforms imperatively through values returned by `useUniform` or `useUniforms` in `useFrame`, effects, event handlers, or animation callbacks. Setter helpers returned from `useLocalNodes` are optional when they provide meaningful encapsulation; do not add them only to wrap `uniform.value = value`. Node creator callbacks should read uniforms from `CreatorState`, but should not update them while building nodes. Do not route per-frame uniform values through React state.

`onFrameUpdate` and `onRenderUpdate` only run for nodes included in a compiled material or compute graph. If a value never enters that graph, keep it in a regular ref and read it from `useFrame` instead of creating a uniform.

Good:

```tsx
const { uAspectRatio } = useUniforms({ uAspectRatio: 1 }, 'label')

const { colorNode } = useLocalNodes(({ uniforms }: CreatorState) => {
  const { uAspectRatio: uAspectRatioNode } = uniforms.scope('label')

  return { colorNode: createTextShimmerNode(shimmerTexture, uAspectRatioNode) }
})

useLayoutEffect(() => {
  uAspectRatio.value = width / height
}, [height, uAspectRatio, width])
```

Bad:

```tsx
const { uAspectRatio } = useUniforms({ uAspectRatio: 1 }, 'label')
const uAspectRatioRef = useRef(uAspectRatio)

useLayoutEffect(() => {
  uAspectRatioRef.current.value = width / height
}, [height, width])
```

If React's hooks lint reports `react-hooks/immutability` for assigning `uniform.value`, add a file-level disable:

```tsx
/* eslint-disable react-hooks/immutability */
'use client'
```

## Deferred Registration

Uniform, node, buffer, and storage registration happens during React render, but the scoped store is committed in a layout effect. Consumers that read a scope before the registering component commits see an empty scope. Two consequences follow:

- Components that read a scope registered elsewhere should not assume the scope exists on their first render. The repo pattern is the `/dev/sun` panel: it mounts the registering component first and only renders the tuning UI once the first scoped uniform appears (`uniforms.uEmber ? <SunTuningControls .../> : null`).
- Do not read a scope in module scope or during render of an unrelated tree. Keep registration in an always-mounted component (`MotionUniforms` registers the shared scopes before suspending consumers) and read in `useLocalNodes` creators, `useFrame`, or effects.

## TypeScript Notes

Direct `useUniform` and `useUniforms` return values keep three's exact `UniformNode<TNodeType, TValue>` generics and the input's exact keys, so they need no casts:

```tsx
const uScrollSpeed = useUniform('uScrollSpeed', 0) // UniformNode<'float', number>
const { uScrollVelocity } = useUniforms(createFlightInteractionUniforms, 'interaction')
```

Scoped reads accept an explicit schema generic instead of a whole-store cast:

```tsx
import type { InteractionUniforms } from '@/components/flightUniforms'

const { uContentProgress } = uniforms.scope<InteractionUniforms>(INTERACTION_UNIFORMS_SCOPE)
```

Reader-mode hooks (`useUniforms`, `useNodes`, `useBuffers`, `useGPUStorage`) accept the same schema generic for values registered elsewhere:

```tsx
const sunUniforms = useUniforms<SunUniforms>(SUN_UNIFORM_SCOPE)
```

When an exact Three.js `UniformNode<TNodeType, TValue>` type crosses a project or helper boundary, import the library type and use it as the schema generic at that boundary only. Do not redefine `UniformNode` or create local schema-like aliases when the imported Three type works. `useThree` and `useFrame` from `@react-three/fiber/webgpu` already narrow `renderer` to `WebGPURenderer`, and Three TSL accessors such as `materialEmissive` are typed as `Node<'vec3'>`, so none of those need `as unknown as` casts.

## Migration Checklist

- Replace component-local `useMemo(() => uniform(...), [])` with `useUniform` or scoped `useUniforms`.
- Replace `useMemo` blocks that compose material or compute nodes from props or shared stores with `useLocalNodes`. Keep static nodes in `useMemo` or create them directly.
- Keep non-TSL memoization as `useMemo`: curves, vectors, matrices, random particle source data, Yoga layout, instance buffers, and expensive CPU setup.
- Use `once` for geometry transforms and other mount-only method calls on declaratively created objects. Do not treat it as a `useMemo` replacement, do not apply it to geometries built with `new` or shared by reference, and use a concrete geometry element rather than `<bufferGeometry>`.
- Scope uniforms in repeated components using stable ids to avoid sharing state accidentally.
- Register compute buffers with `useBuffers` when the component owns GPU storage that must be freed and its churn is reachable. Wrap the creator in `useCallback` so recreation is driven by the data, namespace the scope with every input that shapes the allocation, and dispose the current scope in an unmount effect. Do not register component-local CPU attributes that R3F already owns, and do not add a registration render to a component that keys a material on a node `uuid`.
- Write simple `useLocalNodes` creators inline. Use `useCallback` only when the creator itself is expensive or render churn proves the identity change is a problem.
- Do not store `UniformNode` objects in refs or React state. Update hook-returned uniforms directly; add setters only when they provide meaningful encapsulation.
- Verify with `npx tsc --noEmit --pretty false`, targeted lint, and the smallest visual/runtime check for the affected WebGPU scene.
