import { Vector3 } from 'three'
import { type UniformNode } from 'three/webgpu'

// Uniforms owned by the game loop and read by more than one component's node graph.
//
// The writer registers them (`GameUniforms`) and mutates `.value`; readers pick them up from
// `CreatorState` inside `useLocalNodes`, so nothing has to be threaded through props or imperative
// handles. Registration is staged until a layout effect, so the registrar must mount before any
// reader — `Game.tsx` renders `GameUniforms` above `Physics` for that reason.

export const CORE_UNIFORM_SCOPE = 'core'

export type CoreUniforms = {
  /** Player world position, written once by GameUniforms for every material. */
  uPlayerWorldPos: UniformNode<'vec3', Vector3>
}

export const createCoreUniforms = () => ({
  uPlayerWorldPos: new Vector3(),
})
