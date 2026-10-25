import type { PointLight, Vector3Tuple } from 'three'

import { RING_LIGHT_CONSTANTS, RING_POINT_LIGHTS } from '@/components/lighting/lightNodes'
import { RING_WORLD_Y } from '@/components/platform/rings/ringConfig'
import type { RingIndex } from '@/stores/types'
import { type CourseSurface, courseToWorld } from '@/utils/platform/courseSurface'
import { getRingKey } from '@/utils/rings'
import { colToX, type RowData, rowToWorldZ } from '@/utils/tiles'

/**
 * A ring and the shared light slot assigned to it. `light` is null only when an authored course
 * outgrows the pool; the ring still renders so a data change cannot silently remove gameplay.
 *
 * `coursePosition` is what `useCoursePlacement` consumes for the mesh; `worldPosition` is the same
 * point after the cylinder wrap, which is what the scene-root light needs. Keeping both here stops
 * the two from drifting or a world position being converted twice.
 */
export type RingLightPlacement = {
  key: string
  indexes: RingIndex
  coursePosition: Vector3Tuple
  worldPosition: Vector3Tuple
  light: PointLight | null
}

/**
 * Bakes every ring's course and world pose once the course is mounted. Rings never move, so the
 * light only follows its row and column; the ring mesh uses the same placement.
 *
 * Slots are assigned in row/column order, which is stable for as long as the course is mounted.
 */
export const createRingLightPlacements = (
  rows: readonly RowData[],
  surface: CourseSurface,
): RingLightPlacement[] => {
  const placements: RingLightPlacement[] = []
  let pooledLightIndex = 0

  rows.forEach((row, rowIndex) => {
    const ringColumns = row.rings
    if (!ringColumns) return

    ringColumns.forEach((hasRing, columnIndex) => {
      if (!hasRing) return

      const coursePosition: Vector3Tuple = [
        colToX(columnIndex, row.isRaised.length),
        RING_WORLD_Y,
        rowToWorldZ(rowIndex),
      ]
      const world = courseToWorld(
        coursePosition[0],
        coursePosition[1],
        coursePosition[2],
        surface,
        { x: 0, y: 0, z: 0 },
      )
      const indexes: RingIndex = [row.rowIndex ?? rowIndex, columnIndex]

      placements.push({
        key: getRingKey(indexes[0], indexes[1]),
        indexes,
        coursePosition,
        worldPosition: [world.x, world.y, world.z],
        light: RING_POINT_LIGHTS[pooledLightIndex] ?? null,
      })
      pooledLightIndex += 1
    })
  })

  return placements
}

/** Poses the pool at the rings. Intensity is owned by each ring, which knows if it was collected. */
export const poseRingLights = (placements: readonly RingLightPlacement[]): void => {
  for (const { light, worldPosition } of placements) {
    light?.position.set(worldPosition[0], worldPosition[1], worldPosition[2])
  }
}

/** Unmounting the rings must not leave the shared pool lit for whatever mounts next. */
export const extinguishRingLights = (): void => {
  for (const light of RING_POINT_LIGHTS) light.intensity = 0
}

/** The single intensity policy for a ring slot: lit while collectable, dark once collected. */
export const setRingLightLit = (light: PointLight | null, isLit: boolean): void => {
  if (!light) return
  light.intensity = isLit ? RING_LIGHT_CONSTANTS.intensity : 0
}
