/* eslint-disable react-hooks/immutability */
'use client'

import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import { type FC, type RefObject, Suspense, useCallback, useRef } from 'react'
import {
  clamp,
  float,
  Fn,
  If,
  mix,
  modelWorldMatrix,
  mx_noise_float,
  normalView,
  positionGeometry,
  positionView,
  smoothstep,
  vec3,
  vec4,
  vertexStage,
} from 'three/tsl'
import { Mesh } from 'three'
import type { Node, UniformNode } from 'three/webgpu'

import { useGameStore } from '@/components/GameProvider'
import { SceneQuality, usePerformanceStore } from '@/components/PerformanceProvider'
import { PLAYER_RADIUS } from '@/components/player/PlayerHUD'
import { useConfirmationProgress } from '@/hooks/useConfirmationProgress'
import useGameFrame from '@/hooks/useGameFrame'
import { usePlayerInput } from '@/hooks/usePlayerInput'
import usePlayerSpeed from '@/hooks/usePlayerSpeed'
import { getColourFromPalette } from '@/resources/tsl/playerPalette'
import { PLAYER_SPEED_MAX } from '@/stores/playerSlice'
import { SPEED_SMOOTH_HALF_LIFE, stepSmoothedSpeed } from '@/utils/smoothedSpeed'

// Carried over from marble.vert / marble.frag.
const RESPAWN_FADE_START_Y = 3.5
const RESPAWN_FADE_RANGE = 2.0

const AMBIENT_STRENGTH = 0.8
const DIFFUSE_STRENGTH = 0.5
const SPECULAR_STRENGTH = 0.4
const NOISE_FREQUENCY = 0.2
const REVEAL_SMOOTHNESS = 0.12
const VEIN_NOISE_FREQUENCY = 0.7
const VEIN_ANIMATION_SPEED = 0.06
const VEIN_POWER = 2.5
const VEIN_INTENSITY = 0.25
const VEIN_BRIGHTEN_STRENGTH = 0.5
const SPEED_DARKEN_MAX = 0.1
const SPEED_VEIN_INTENSITY_BOOST = 0.35
const SPEED_VEIN_BRIGHTEN_BOOST = 0.25

// normalize(vec3(1, 1, 1)), which GLSL folds at compile time.
const LIGHT_DIR = /*#__PURE__*/ vec3(0.57735027, 0.57735027, 0.57735027).toConst()

const MARBLE_UNIFORM_SCOPE = 'marble'

// uIsFlat and uEnableVeins never animate, so they are graph constants rather than uniforms. The
// palette indices are store-driven and do change at runtime, so they stay uniforms.
export type MarbleShaderUniforms = {
  uTime: UniformNode<'float', number>
  uConfirmingProgress: UniformNode<'float', number>
  uSpeed: UniformNode<'float', number>
  uPaletteIndex: UniformNode<'int', number>
  uConfirmingPaletteIndex: UniformNode<'int', number>
}

const createMarbleUniforms = (paletteIndex: number, confirmingPaletteIndex: number) => () => ({
  uTime: 0,
  uConfirmingProgress: 0,
  uSpeed: 0,
  uPaletteIndex: paletteIndex,
  uConfirmingPaletteIndex: confirmingPaletteIndex,
})



type MarbleProps = {
  ref: RefObject<Mesh | null>
}

export const Marble: FC<MarbleProps> = ({ ref }) => {
  const config = usePerformanceStore((s) => s.sceneConfig.marble)
  const isLowQuality = usePerformanceStore((s) => s.sceneQuality === SceneQuality.LOW)
  const { segments, isFlat, enableVeins } = config
  const paletteIndex = useGameStore((s) => s.paletteIndex)
  const confirmingPaletteIndex = useGameStore((s) => s.confirmingPaletteIndex ?? -1)

  // Shader time accumulator
  const shaderTime = useRef(0)
  const { confirmationProgress } = useConfirmationProgress()
  const smoothedSpeed = useRef(0)
  const { input } = usePlayerInput()
  const { speedUnits } = usePlayerSpeed()

  const uniforms = useUniforms(
    createMarbleUniforms(paletteIndex, confirmingPaletteIndex),
    MARBLE_UNIFORM_SCOPE,
  )

  // Port of marble.vert + marble.frag.
  //
  // The varyings all recompute in-graph: the spherical base comes from the sphere's own geometry
  // normalised (a uniform scale does not change direction), the view direction from the view stage,
  // and the respawn fade from the model matrix's translation, which is exactly the GLSL's
  // `modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)`.
  const createNodes = useCallback(
    ({ uniforms: scopedUniforms }: CreatorState) => {
      const scoped = scopedUniforms.scope<MarbleShaderUniforms>(MARBLE_UNIFORM_SCOPE)

      const unitLocalPosition = positionGeometry.normalize()
      const animatedTime = scoped.uTime.mul(VEIN_ANIMATION_SPEED)

      // The GLSL used glsl-noise's Ashima simplex; this uses TSL's built-in MaterialX noise. Same
      // -1..1 range and the same frequency constants, but a different field, so the vein pattern
      // differs slightly. Taken deliberately to drop the glsl-noise dependency.

      const noiseValue = mx_noise_float(
        unitLocalPosition.mul(NOISE_FREQUENCY).add(animatedTime),
      )
        .mul(0.5)
        .add(0.5)
      const paletteT = clamp(noiseValue, float(0), float(1))

      const baseColor = getColourFromPalette(scoped.uPaletteIndex, paletteT)

      // applyConfirmingReveal: the GLSL early-returns when there is no confirming palette. The
      // confirming lookup is a cosine palette (3 cos + 4 uniform loads) per fragment, so it moves
      // behind a uniform branch: `hasConfirmingPalette` derives from uniforms, so the branch has no
      // per-fragment divergence and skips the whole reveal subtree the rest of the time.
      const hasConfirmingPalette = scoped.uConfirmingPaletteIndex
        .greaterThanEqual(0)
        .and(scoped.uConfirmingProgress.greaterThan(0))
      const baseMarbleColor = Fn(() => {
        const marble = baseColor.toVar()
        If(hasConfirmingPalette, () => {
          const confirmingColor = getColourFromPalette(scoped.uConfirmingPaletteIndex, paletteT)
          const clampedProgress = clamp(scoped.uConfirmingProgress, float(0), float(1))
          const height01 = unitLocalPosition.y.mul(0.5).add(0.5)
          const revealSmoothness = REVEAL_SMOOTHNESS * 1.35
          const revealEdgeLow = clamp(height01.sub(revealSmoothness), float(0), float(1))
          const revealEdgeHigh = clamp(height01.add(revealSmoothness), float(0), float(1))
          const reveal = smoothstep(revealEdgeLow, revealEdgeHigh, clampedProgress)
          marble.assign(mix(baseColor, confirmingColor, reveal))
        })
        return marble
      })()

      // enableVeins is a graph constant: branch at build time so disabling veins omits the noise
      // and pow instead of multiplying their result by zero.
      const speedAmount = clamp(scoped.uSpeed, float(0), float(1))
      let veinContribution: Node<'vec3'> = vec3(0)
      if (enableVeins) {
        const veinNoise = mx_noise_float(
          unitLocalPosition.mul(VEIN_NOISE_FREQUENCY).add(animatedTime),
        )
        const veinMask = clamp(float(1).sub(veinNoise.abs()), float(0), float(1)).pow(VEIN_POWER)
        const veinBrighten = float(VEIN_BRIGHTEN_STRENGTH).add(
          speedAmount.mul(SPEED_VEIN_BRIGHTEN_BOOST),
        )
        const veinIntensity = float(VEIN_INTENSITY).add(
          speedAmount.mul(SPEED_VEIN_INTENSITY_BOOST),
        )
        const veinColour = mix(baseMarbleColor, vec3(1), veinBrighten)
        veinContribution = veinColour.mul(veinMask).mul(veinIntensity)
      }

      const marbleColor = baseMarbleColor
        .mul(float(1).sub(speedAmount.mul(SPEED_DARKEN_MAX)))
        .add(veinContribution)

      // isFlat is a graph constant: when flat, skip the lighting work entirely rather than
      // computing it and then selecting it away.
      let litSurface: Node<'vec3'>
      if (isFlat) {
        litSurface = marbleColor
      } else {
        // Surface lighting, ported as-is: the scene has no three.js lights to hand this to.
        const viewDirection = positionView.negate().normalize()
        const diffuse = normalView.dot(LIGHT_DIR).max(0)
        const halfDirection = LIGHT_DIR.add(viewDirection).normalize()
        const specularBase = normalView.dot(halfDirection).max(0)
        // specularBase^10 by repeated squaring, as the GLSL did.
        const specular2 = specularBase.mul(specularBase)
        const specular4 = specular2.mul(specular2)
        const specular8 = specular4.mul(specular4)
        const specular = specular8.mul(specular2)
        litSurface = marbleColor
          .mul(float(AMBIENT_STRENGTH).add(diffuse.mul(DIFFUSE_STRENGTH)))
          .add(specular.mul(SPECULAR_STRENGTH))
      }

      // Respawn fade from the mesh's world-space height. The model matrix is one value for the
      // whole draw, so the clamp is a per-draw constant: hoist it to the vertex stage rather than
      // re-evaluating it per fragment.
      const worldCentre = modelWorldMatrix.mul(vec4(0, 0, 0, 1))
      const respawnFade: Node<'float'> = vertexStage(
        clamp(
          float(RESPAWN_FADE_START_Y).sub(worldCentre.y).div(RESPAWN_FADE_RANGE),
          float(0),
          float(1),
        ),
      )

      return {
        colorNode: litSurface,
        opacityNode: respawnFade,
      }
    },
    [enableVeins, isFlat],
  )

  const { colorNode, opacityNode } = useLocalNodes(createNodes)


  useGameFrame((_, deltaTime) => {
    // Update shader animation time
    shaderTime.current += deltaTime
    uniforms.uTime.value = shaderTime.current

    if (!isLowQuality) {
      const inputZ = input.current.up - input.current.down
      const targetSpeed = Math.min(
        1,
        Math.abs((inputZ * speedUnits.current) / PLAYER_SPEED_MAX),
      )
      uniforms.uSpeed.value = stepSmoothedSpeed(
        smoothedSpeed,
        targetSpeed,
        deltaTime,
        SPEED_SMOOTH_HALF_LIFE,
      )
    }

    if (confirmationProgress.current === 0 && uniforms.uConfirmingProgress.value === 0) return
    uniforms.uConfirmingProgress.value = confirmationProgress.current
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[PLAYER_RADIUS, segments, segments]} />
      <Suspense fallback={null}>
        <meshBasicNodeMaterial
          colorNode={colorNode}
          opacityNode={opacityNode}
          transparent
        />
      </Suspense>
    </mesh>
  )
}
