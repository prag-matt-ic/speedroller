/* eslint-disable react-hooks/immutability */
'use client'
import { useCourseSurface } from '@/hooks/useCourseSurface'

import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/tsl'
import { type FC, type RefObject, Suspense, useCallback, useRef } from 'react'
import { Mesh } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'

import { useGameStore } from '@/components/GameProvider'
import { SceneQuality, usePerformanceStore } from '@/components/PerformanceProvider'
import { PLAYER_RADIUS } from '@/utils/player'
import { useConfirmationProgress } from '@/hooks/useConfirmationProgress'
import useGameFrame from '@/hooks/useGameFrame'
import usePlayerSpeed from '@/hooks/usePlayerSpeed'
import { createMarbleNodes, type MarbleShaderUniforms } from './createMarbleNodes'
import { RACE_MAX_SPEED } from '@/utils/platform/raceSpeed'
import { SPEED_SMOOTH_HALF_LIFE, stepSmoothedSpeed } from '@/utils/smoothedSpeed'

const MARBLE_UNIFORM_SCOPE = 'marble'

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
  const surface = useCourseSurface()
  const config = usePerformanceStore((s) => s.sceneConfig.marble)
  const isLowQuality = usePerformanceStore((s) => s.sceneQuality === SceneQuality.LOW)
  const { segments, isFlat, enableVeins } = config
  const paletteIndex = useGameStore((s) => s.paletteIndex)
  const confirmingPaletteIndex = useGameStore((s) => s.confirmingPaletteIndex ?? -1)

  // Shader time accumulator
  const shaderTime = useRef(0)
  const { confirmationProgress } = useConfirmationProgress()
  const smoothedSpeed = useRef(0)
  const { speedUnits } = usePlayerSpeed()

  const uniforms = useUniforms(
    createMarbleUniforms(paletteIndex, confirmingPaletteIndex),
    MARBLE_UNIFORM_SCOPE,
  )

  const createNodes = useCallback(
    ({ uniforms: scopedUniforms }: CreatorState) => createMarbleNodes(
      scopedUniforms.scope<MarbleShaderUniforms>(MARBLE_UNIFORM_SCOPE),
      { enableVeins, isFlat, surface },
    ),
    [enableVeins, isFlat, surface],
  )

  const { colorNode, opacityNode, emissiveNode } = useLocalNodes(createNodes, [createNodes])

  // MeshBasicNodeMaterial does not declare `emissiveNode`, but NodeMaterial reads it when building
  // the lighting graph, so assign it at runtime and let the material recompile once.
  const attachMaterial = useCallback(
    (material: MeshBasicNodeMaterial | null) => {
      if (!material) return
      Object.assign(material, { emissiveNode })
      material.needsUpdate = true
    },
    [emissiveNode],
  )


  useGameFrame((_, deltaTime) => {
    // Update shader animation time
    shaderTime.current += deltaTime
    uniforms.uTime.value = shaderTime.current

    if (!isLowQuality) {
      // The player publishes forward speed for both phases, so the shader no longer has to infer
      // it from input — which is neutral during the automatic race.
      const targetSpeed = Math.min(1, Math.abs(speedUnits.current) / RACE_MAX_SPEED)
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
          ref={attachMaterial}
          colorNode={colorNode}
          opacityNode={opacityNode}
          transparent
        />
      </Suspense>
    </mesh>
  )
}
