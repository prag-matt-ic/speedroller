'use client'

import { type FC, useCallback, useLayoutEffect } from 'react'
import type { Vector3Tuple } from 'three'

import { useGameStore } from '@/components/GameProvider'
import {
  PLAYER_POINT_LIGHT,
  RING_POINT_LIGHTS,
  TILE_AMBIENT_LIGHT,
  TILE_KEY_LIGHT,
} from '@/components/lighting/lightNodes'
import { getPlayerLightColour } from '@/components/lighting/playerLight'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'

/**
 * Mounts the scene's lights once at the root. Tiles inherit the renderer's clustered node; the
 * player and ring pools are the shadowless point lights that node culls per cluster.
 *
 * The player light follows the published world position (the same value the tile shader reads) and
 * takes its colour from the selected palette. Ring positions are posed by `Rings`; ring intensity
 * belongs to each ring, so collection and retry stay ring-local.
 */
const SceneLights: FC = () => {
  const paletteIndex = useGameStore((s) => s.paletteIndex)

  const updatePlayerLightPosition = useCallback(([x, y, z]: Vector3Tuple) => {
    PLAYER_POINT_LIGHT.position.set(x, y, z)
  }, [])
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
      <primitive object={TILE_KEY_LIGHT} />
      <primitive object={PLAYER_POINT_LIGHT} />
      {RING_POINT_LIGHTS.map((light) => (
        <primitive key={light.uuid} object={light} />
      ))}
    </>
  )
}

export default SceneLights
