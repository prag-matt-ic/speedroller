# AGENTS

## Project overview

This is an educational 3D runner game built with Next.js, React Three Fiber, and Rapier physics.

## Performance rules

- Avoid per‑frame allocations in render/update loops. In particular, do not construct new `THREE.Vector3`, `THREE.Quaternion`, arrays, or temp objects inside `useFrame` or physics tick handlers. Pre‑allocate and reuse objects via `useRef` and mutate them in place.
- Prefer in‑place math operations (`set`, `copy`, `add`, `multiplyScalar`, etc.) over methods that allocate (e.g. `clone`).
- When reading world transforms each frame, reuse target objects: pass a preallocated vector/quaternion/matrix into methods like `getWorldScale`, `getWorldPosition`, and `getWorldQuaternion`.

Example pattern:

```ts
const tmpV = useRef(new Vector3())

useFrame((_, dt) => {
  tmpV.current.set(ax, ay, az)
  tmpV.current.multiplyScalar(dt)
  // ... use tmpV.current without creating new Vector3s
})
```

## Clean Code guidelines

Use meaningful names – variable and function names should clearly communicate what the code does. Avoid abbreviations or cryptic identifiers; clear naming makes the code self‑documenting.

Be consistent – use the same vocabulary for the same type of entity (e.g. always call the current player position playerPos instead of mixing currentPos, position, and pos).

Write small, pure functions – each function should have a single responsibility. Break complex logic into smaller helpers rather than nesting conditionals.

Prefer early returns over deep nesting – return early to avoid if/else pyramids.

Prefer immutability – never mutate objects or arrays directly. When updating state, return new objects instead of modifying existing ones.

Avoid magic numbers and strings – declare constants (e.g. LANE_COUNT = 3) so that values are descriptive and changeable.

Comment judiciously – write code that is self‑explanatory; when comments are needed, make them precise and consider using // TODO to mark work that should be improved later.

## Tailwind Styling

Use `size-[x]` for square/circle shapes instead of separate `h-[x]` and `w-[x]`.

**When concatenating class strings**, use `twJoin` or `twMerge` from 'tailwind-merge'. Prefer `twJoin` when all classes are defined within a component (no conflicts). Use `twMerge` when merging external props with internal classes that might conflict.

Examples:

```tsx
// Square/circle shapes
<div className="size-12 rounded-full" />

// Class concatenation
<div className={twJoin('size-12', isActive && 'ring-2')} />
<div className={twMerge('size-12 bg-blue-500', externalClassName)} />
```

## Zustand best practices

Use selectors – when consuming state in a component, call the hook with a selector (useStore((state) => state.someValue)) so that the component re‑renders only when that slice changes.

Never retrieve the entire store in a component.

Subscribe to frequently changing values – for values that update every frame (e.g. game time or physics ticks), subscribe to the value and set it in a ref, like `useTimeSubscription`.

Keep state immutable – always use functional updates (set((prev) => {…})) and avoid mutating nested objects.

Avoid derived state in the store – compute derived values (like isRunning) in components or hooks rather than storing them.

## Architecture & Core Systems

### Physics & collision

Physics are powered by Rapier (React version)

### Performance patterns

Instanced rendering – obstacles are drawn with instanced meshes (InstancedRigidBodies) to render hundreds of objects efficiently.

Refs for mutable state – time‑sensitive or mutable values that should not trigger React re‑renders (like world positions) are stored in useRef. Components read and update these refs in requestAnimationFrame loops or subscriptions.

Object pooling – physics bodies are reused rather than created and destroyed each time. When adding new obstacles or gates, reuse existing instances if possible.

### Input handling

Player movement is discrete: arrow keys or WASD trigger movement.

## Additional notes

The project deliberately avoids a traditional game engine. It is built on web standards (Three.js, React).

Use functional components and hooks; avoid class components.

There is no server state. All game logic runs client‑side.

When writing new TypeScript, favour type aliases to describe shapes and prefer generics where appropriate.

By following these guidelines and patterns, you can generate code that fits naturally into the repository and remains easy for developers to understand and maintain.

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell**: `npm run codegraph -- explore "<symbol names or question>"` uses the project-local CLI and prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
