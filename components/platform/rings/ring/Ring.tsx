import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/tsl'
import { type FC, type RefObject, useCallback } from 'react'
import {
  color,
  cos,
  float,
  mat2,
  mix,
  normalLocal,
  positionGeometry,
  sin,
  time,
  vec3,
  vertexStage,
} from 'three/tsl'
import { Sphere, type TorusGeometry, Vector3 } from 'three'
import type { MeshBasicNodeMaterial, Node, UniformNode } from 'three/webgpu'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE } from '@/components/coreUniforms'
import { RING_COLOR, RING_EMISSIVE } from '@/components/platform/rings/ringConfig'
import { fadeInOut } from '@/resources/tsl/fadeInOut'

// Normalized direction from (0.46, 0.8, 0.5) — carried over from ring.vert.
const LIGHT_DIR = /*#__PURE__*/ vec3(0.4383, 0.7622, 0.4764).toConst()

// Strong enough to bloom clearly through the emissive MRT pass; the ring still keeps its base colour.
const RING_EMISSIVE_STRENGTH = 1.25

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

  const createNodes = useCallback(
    ({ uniforms }: CreatorState) => {
      const scoped = uniforms.scope<AllRingUniforms>(uniformScope)
      const { uPlayerWorldPos } = uniforms.scope(CORE_UNIFORM_SCOPE)

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
      // The ring's own z, so it ramps in as a whole. Rings fade over the floating tiles' longer
      // window, so they are already at full strength by the time they are near enough to read.
      // uExitProgress and the fade toggle are uniforms, so the whole product is a per-draw
      // constant and evaluates alongside the fade in the vertex stage.
      const finalFade: Node<'float'> = vertexStage(
        float(1).sub(scoped.uExitProgress).mul(
          mix(float(1), fadeInOut(uPlayerWorldPos.z), scoped.uDistanceFadeEnabled),
        ),
      )

      // Bloom is fed from the emissive MRT attachment, so this glow is separate from the base colour
      // and does not need to survive the speed post pass. Opacity (collection fade) is applied by
      // the MRT setup, so the emissive node stays a flat per-draw colour.
      const emissiveNode = color(RING_EMISSIVE).mul(RING_EMISSIVE_STRENGTH)

      return {
        positionNode: rotatedPosition,
        colorNode: color(RING_COLOR).mul(lighting).add(color(RING_EMISSIVE).mul(0.4)),
        opacityNode: finalFade,
        emissiveNode,
      }
    },
    [uniformScope],
  )

  const { colorNode, opacityNode, positionNode, emissiveNode } = useLocalNodes(createNodes, [
    createNodes,
  ])

  // Rings.tsx tweens `shaderRef.current.uExitProgress` with gsap on collect, so hang that uniform
  // node off the material rather than changing the contract. MeshBasicNodeMaterial does not declare
  // `emissiveNode`, but NodeMaterial reads it when building the lighting graph, so assign it at runtime.
  const attachUniforms = useCallback(
    (material: MeshBasicNodeMaterial | null) => {
      if (material) {
        Object.assign(material, {
          uExitProgress: uniforms.uExitProgress,
          emissiveNode,
        })
        material.needsUpdate = true
      }
      shaderRef.current = material as RingMaterial | null
    },
    [shaderRef, uniforms.uExitProgress, emissiveNode],
  )

  const setAnimationBounds = useCallback((geometry: TorusGeometry | null) => {
    if (!geometry) return
    // Includes every rotation and the two-unit collection lift.
    geometry.boundingSphere = new Sphere(new Vector3(0, 1, 0), radius + tubeRadius + 1)
  }, [radius, tubeRadius])

  return (
    <mesh visible={isVisible}>
      <torusGeometry
        ref={setAnimationBounds}
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
