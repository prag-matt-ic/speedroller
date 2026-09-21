import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import { type FC, type RefObject, useCallback } from 'react'
import {
  color,
  cos,
  float,
  mat2,
  mix,
  normalLocal,
  positionGeometry,
  positionWorld,
  sin,
  time,
  vec3,
  vertexStage,
} from 'three/tsl'
import { Color } from 'three'
import type { MeshBasicNodeMaterial, Node, UniformNode } from 'three/webgpu'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import { fadeDistance } from '@/resources/tsl/fadeDistance'

// Normalized direction from (0.46, 0.8, 0.5) — carried over from ring.vert.
const LIGHT_DIR = /*#__PURE__*/ vec3(0.4383, 0.7622, 0.4764).toConst()

export const RING_COLOR = new Color('#ffe066')
export const RING_EMISSIVE = new Color('#ffd43b')

// The only value Rings.tsx drives is `uExitProgress`, tweened by gsap on collect. Animation time
// comes from TSL's built-in `time` node, which the renderer updates itself, so it needs no uniform.
export type RingUniforms = {
  uExitProgress: UniformNode<'float', number>
}

type RingConfigUniforms = {
  uRotationSpeed: UniformNode<'float', number>
  uRotationPhase: UniformNode<'float', number>
  uDistanceFadeEnabled: UniformNode<'float', number>
}

type AllRingUniforms = RingUniforms & RingConfigUniforms

export type RingMaterial = MeshBasicNodeMaterial & RingUniforms

const createRingUniforms =
  (rotationSpeed: number, rotationPhase: number, useDistanceFade: boolean) => () => ({
    uExitProgress: 0,
    uRotationSpeed: rotationSpeed,
    uRotationPhase: rotationPhase,
    uDistanceFadeEnabled: useDistanceFade ? 1 : 0,
  })

type Props = {
  isVisible: boolean
  shaderRef: RefObject<RingMaterial | null>
  rotationSpeed: number
  rotationPhase: number
  radius: number
  tubeRadius: number
  /** Stable, unique per ring slot: the uniforms are registered under this scope. */
  uniformScope: string
}

const Ring: FC<Props> = ({
  isVisible,
  shaderRef,
  rotationSpeed,
  rotationPhase,
  radius,
  tubeRadius,
  uniformScope,
}) => {
  const ringConfig = usePerformanceStore((s) => s.sceneConfig.ring)
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)

  const uniforms = useUniforms(
    createRingUniforms(rotationSpeed, rotationPhase, useDistanceFade),
    uniformScope,
  )

  // Port of ring.vert + ring.frag. The GLSL did all its work in the vertex stage and the fragment
  // merely passed vColor through, so rotation, lift, lighting and fade all live in one node graph.
  const createNodes = useCallback(
    ({ uniforms }: CreatorState) => {
      const scoped = uniforms.scope<AllRingUniforms>(uniformScope)

      const angle = time
        .mul(scoped.uRotationSpeed)
        .add(scoped.uRotationPhase)
        .add(scoped.uExitProgress.mul(4))

      // mat2(c, -s, s, c) is column-major, matching the GLSL constructor.
      const sine = sin(angle)
      const cosine = cos(angle)
      const rotation = mat2(cosine, sine.negate(), sine, cosine)

      // Rotation about the ring's own centre. The lift touches Y only, so it cannot feed back into
      // the XZ rotation the GLSL computed from the untouched position.
      const rotatedPositionXZ = rotation.mul(positionGeometry.xz)
      const rotatedPosition = vec3(
        rotatedPositionXZ.x,
        positionGeometry.y.add(scoped.uExitProgress.mul(2)),
        rotatedPositionXZ.y,
      )

      const rotatedNormalXZ = rotation.mul(normalLocal.xz)
      const rotatedNormal = vec3(rotatedNormalXZ.x, normalLocal.y, rotatedNormalXZ.y)

      // The GLSL computed lighting and fade per-vertex and passed them as varyings; wrap both in
      // vertexStage() so the fragment stage reads interpolated varyings instead of re-deriving them.
      const lighting = vertexStage(
        float(0.5).add(rotatedNormal.dot(LIGHT_DIR).max(0).mul(0.5)),
      )
      // positionWorld already accounts for the mesh transform.
      const fade = vertexStage(fadeDistance(positionWorld.z))
      const finalFade: Node<'float'> = mix(float(1), fade, scoped.uDistanceFadeEnabled)

      return {
        positionNode: rotatedPosition,
        colorNode: color(RING_COLOR).mul(lighting).add(color(RING_EMISSIVE).mul(0.4)),
        opacityNode: float(1).sub(scoped.uExitProgress).mul(finalFade),
      }
    },
    [uniformScope],
  )

  const { colorNode, opacityNode, positionNode } = useLocalNodes(createNodes)


  // Rings.tsx tweens `shaderRef.current.uExitProgress` with gsap on collect, so hang that uniform
  // node off the material rather than changing the contract.
  const attachUniforms = useCallback(
    (material: MeshBasicNodeMaterial | null) => {
      if (material) {
        Object.assign(material, { uExitProgress: uniforms.uExitProgress })
      }
      shaderRef.current = material as RingMaterial | null
    },
    [shaderRef, uniforms.uExitProgress],
  )

  return (
    <mesh visible={isVisible}>
      <torusGeometry
        args={[radius, tubeRadius, ringConfig.radialSegments, ringConfig.tubularSegments]}
      />
      <meshBasicNodeMaterial
        ref={attachUniforms}
        colorNode={colorNode}
        opacityNode={opacityNode}
        positionNode={positionNode}
        transparent={true}
        alphaTest={0.001}
      />
    </mesh>
  )
}

export default Ring
