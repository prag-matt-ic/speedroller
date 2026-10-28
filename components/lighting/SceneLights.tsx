'use client'

import { type FC, useCallback, useLayoutEffect } from 'react'
import type { Vector3Tuple } from 'three'

import { useGameStore } from '@/components/GameProvider'
import {
  PLAYER_POINT_LIGHT,
  RING_POINT_LIGHTS,
  TILE_AMBIENT_LIGHT,
  COURSE_SUN_LIGHT,
  poseCourseSun,
} from '@/components/lighting/lightNodes'
import { getPlayerLightColour } from '@/components/lighting/playerLight'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'
import { useCourseSurface } from '@/hooks/useCourseSurface'

/**
 * Mounts the scene's lighting once at the root: the ambient fill plus the clustered player and ring
 * pools, plus one shadowless course-relative sunset key.
 *
 * The player light follows the published world position (the same value the tile shader reads) and
 * takes its colour from the selected palette. Ring positions are posed by `Rings`; ring intensity
 * belongs to each ring, so collection and retry stay ring-local.
 */
const SceneLights: FC = () => {
  const paletteIndex = useGameStore((s) => s.paletteIndex)
  const surface = useCourseSurface()

  const updatePlayerLightPosition = useCallback(([x, y, z]: Vector3Tuple) => {
    PLAYER_POINT_LIGHT.position.set(x, y, z)
    poseCourseSun(x, y, z, surface)
  }, [surface])
  usePlayerPosition(updatePlayerLightPosition)

  useLayoutEffect(() => {
    const [red, green, blue] = getPlayerLightColour(paletteIndex)
    // Palette values are already linear (the marble passes them straight to its colour node);
    // `setRGB` defaults to the working colour space, so this needs no sRGB conversion.
    PLAYER_POINT_LIGHT.color.setRGB(red, green, blue)
  }, [paletteIndex])

  return (
    <>
      <primitive object={TILE_AMBIENT_LIGHT} />
      <primitive object={COURSE_SUN_LIGHT} />
      <primitive object={COURSE_SUN_LIGHT.target} />
      <primitive object={PLAYER_POINT_LIGHT} />
      {RING_POINT_LIGHTS.map((light) => (
        <primitive key={light.uuid} object={light} />
      ))}
    </>
  )
}

export default SceneLights
