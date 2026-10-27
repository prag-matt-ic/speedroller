/* eslint-disable react-hooks/immutability */
'use client'

import { useFrame } from '@react-three/fiber'
import { useLocalNodes } from '@react-three/tsl'
import { type FC, type RefObject, useCallback, useLayoutEffect, useMemo } from 'react'
import { float, modelWorldMatrix, vec4, vertexStage } from 'three/tsl'
import { type Mesh, type MeshBasicNodeMaterial } from 'three/webgpu'
import {
  clampPaletteIndexSafe,
  createPaletteStops,
  PLAYER_PALETTE_STOPS,
} from '@/components/palette'
import { worldCourseNode } from '@/resources/tsl/courseSurface'
import type { CourseSurface } from '@/utils/platform/courseSurface'
import {
  GALAXY_DEFAULTS,
  GALAXY_SAMPLE_COUNT,
  GALAXY_LIGHT_DIRECTION,
  type GalaxySettings,
  type GalaxyQuality,
} from './galaxySettings'
import { createGalaxyNodes, createGalaxyUniforms } from './createGalaxyNodes'

export type GalaxyMarbleProps = {
  radius?: number
  settings?: GalaxySettings
  animationTime: RefObject<number>
  opacity?: number
  samples?: GalaxyQuality['samples']
  starCount?: GalaxyQuality['starCount']
  rotation?: number
  lightDirection?: readonly [number, number, number]
  ref?: RefObject<Mesh | null>
  segments?: number
  visible?: boolean
  colour?: string
  surface?: CourseSurface
  confirmingPaletteIndex?: number
  confirmationProgress?: RefObject<number>
  speed?: RefObject<number>
}

export const GalaxyMarble: FC<GalaxyMarbleProps> = ({
  radius = 0.45,
  settings = GALAXY_DEFAULTS,
  animationTime,
  opacity = 1,
  samples = GALAXY_SAMPLE_COUNT,
  starCount = 24,
  rotation,
  lightDirection = GALAXY_LIGHT_DIRECTION,
  ref,
  segments = 64,
  visible = true,
  colour,
  surface,
  confirmingPaletteIndex = -1,
  confirmationProgress,
  speed,
}) => {
  const uniforms = useMemo(() => createGalaxyUniforms(), [])
  useLayoutEffect(() => {
    for (const key of [
      'density',
      'cloudScale',
      'driftSpeed',
      'starBrightness',
      'reflection',
      'sharpness',
      'refraction',
    ] as const)
      uniforms[key].value = settings[key]
    for (const key of ['glass', 'clouds', 'stars'] as const)
      uniforms[key].value = Number(settings[key])
    const [, base, highlight] = colour
      ? createPaletteStops(colour)
      : PLAYER_PALETTE_STOPS[clampPaletteIndexSafe(settings.paletteIndex)]
    const [, nextBase, nextHighlight] =
      PLAYER_PALETTE_STOPS[clampPaletteIndexSafe(confirmingPaletteIndex)]
    uniforms.confirmingColour.value.setRGB(...nextBase)
    uniforms.confirmingHighlight.value.setRGB(...nextHighlight)
    uniforms.cloudColour.value.setRGB(...base)
    uniforms.highlightColour.value.setRGB(...highlight)
    uniforms.opacity.value = opacity
    uniforms.light.value.set(...lightDirection).normalize()
  }, [settings, opacity, lightDirection, uniforms, colour, confirmingPaletteIndex])

  useFrame(() => {
    uniforms.time.value = animationTime.current
    uniforms.speed.value = speed?.current ?? 0
    uniforms.confirmation.value =
      confirmingPaletteIndex < 0 ? 0 : (confirmationProgress?.current ?? 0)
  })

  const { colorNode, opacityNode, emissiveNode } = useLocalNodes(() => {
    const respawnFade = surface
      ? vertexStage(
          float(3.5)
            .sub(worldCourseNode(modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz, surface).y)
            .div(2)
            .clamp(0, 1),
        )
      : float(1)
    return {
      ...createGalaxyNodes(uniforms, samples, starCount, 'sphere'),
      opacityNode: uniforms.opacity.mul(respawnFade),
    }
  }, [uniforms, samples, starCount, surface])

  // Publish only the interior to the game's selective-bloom attachment.
  const attachMaterial = useCallback(
    (material: MeshBasicNodeMaterial | null) => {
      if (!material) return
      Object.assign(material, { emissiveNode })
      material.needsUpdate = true
    },
    [emissiveNode],
  )

  return (
    <mesh
      ref={ref}
      visible={visible}
      rotation={rotation === undefined ? undefined : [0, rotation, 0]}
    >
      <sphereGeometry args={[radius, segments, Math.min(segments, 48)]} />
      <meshBasicNodeMaterial
        ref={attachMaterial}
        colorNode={colorNode}
        opacityNode={opacityNode}
        transparent
        alphaTest={0.001}
        depthWrite={opacity > 0}
      />
    </mesh>
  )
}
