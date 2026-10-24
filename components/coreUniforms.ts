import { type RegisteredScopeUniforms } from '@react-three/tsl'
import { Vector3 } from 'three'

// Uniforms owned by the game loop and read by more than one component's node graph.
//
// The writer registers them (`GameUniforms`) and mutates `.value`; readers pick them up from
// `CreatorState` inside `useLocalNodes`, so nothing has to be threaded through props or imperative
// handles. Registration is staged until a layout effect, so the registrar must mount before any
// reader — `Game.tsx` renders `GameUniforms` above `Physics` for that reason.

export const CORE_UNIFORM_SCOPE = 'core'

export const createCoreUniforms = () => ({
  /** Player world position, written once by GameUniforms for every material. */
  uPlayerWorldPos: new Vector3(),
})

// Type-only registration: `uniforms.scope(CORE_UNIFORM_SCOPE)` is typed for every reader without a
// generic, and a misspelled uniform name within the scope is a compile error. The scope key and its
// node types derive from the creator, so they cannot drift. No runtime cost.
declare module '@react-three/tsl' {
  interface Register {
    scopes: {
      [CORE_UNIFORM_SCOPE]: ReturnType<typeof createCoreUniforms>
    }
  }
}

/** Exact node types for the core scope, for helpers that receive them as parameters. */
export type CoreUniforms = RegisteredScopeUniforms<typeof CORE_UNIFORM_SCOPE>
