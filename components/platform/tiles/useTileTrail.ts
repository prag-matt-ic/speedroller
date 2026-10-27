import { surfaceDeltaX, wrapColumn } from '@/utils/platform/courseSurface'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { InstancedBufferAttribute } from 'three'
import { useRef } from 'react'

import { useGameFrame } from '@/hooks/useGameFrame'
import { usePlayerCoursePosition } from '@/hooks/usePlayerCoursePosition'
import type { TileBatch } from '@/utils/platform/terrainBatches'
import {
  PLATFORM_BATCH_ROWS,
  TILE_SIZE,
  TILE_SURFACE_Y,
  TRAIL_BRUSH_RADIUS,
  TRAIL_FADE_SECONDS,
  TRAIL_MAX_PLAYER_HEIGHT,
  colToX,
  rowToWorldZ,
  worldXToColumn,
  worldZToRowIndex,
} from '@/utils/tiles'

const TRAIL_CELL_RADIUS = Math.ceil(TRAIL_BRUSH_RADIUS / TILE_SIZE)
const TRAIL_BRUSH_RADIUS_SQ = TRAIL_BRUSH_RADIUS * TRAIL_BRUSH_RADIUS
const TRAIL_CONTACT_CAPACITY = (TRAIL_CELL_RADIUS * 2 + 1) ** 2

// Older than any visible trail, so an untouched tile starts fully faded.
const TRAIL_UNTOUCHED = -TRAIL_FADE_SECONDS

export type TileTrailEntry = {
  batch: TileBatch
  /** Per-instance contact-entry time in seconds, shared with `attribute`. */
  timestamps: Float32Array
  attribute: InstancedBufferAttribute
}

export type TileTrail = {
  entries: readonly TileTrailEntry[]
  byStartRow: ReadonlyMap<number, TileTrailEntry>
}

/**
 * One timestamp attribute per batch. `Tiles.tsx` attaches each attribute to its batch geometry;
 * the buffer stays shared with this entry so `useTileTrail` can update it in place.
 */
export const createTileTrail = (batches: readonly TileBatch[]): TileTrail => {
  const entries = batches.map((batch) => {
    const timestamps = new Float32Array(batch.positions.length).fill(TRAIL_UNTOUCHED)
    return {
      batch,
      timestamps,
      attribute: new InstancedBufferAttribute(timestamps, 1),
    }
  })

  return {
    entries,
    byStartRow: new Map(entries.map((entry) => [entry.batch.startRow, entry])),
  }
}

/**
 * Stamps each tile once on contact entry. The shader finishes its fade even if the ball stays;
 * leaving the tile or eligible height range allows another flash on return.
 */
export const useTileTrail = (trail: TileTrail, rowCount: number) => {
  const surface = useCourseSurface()
  const COLUMNS = surface.columns
  const { playerPosition } = usePlayerCoursePosition()
  const contactsRef = useRef<{
    trail: TileTrail
    previous: Int32Array
    current: Int32Array
  } | null>(null)

  useGameFrame((state) => {
    // Allocate only on initialization or when the course replaces its trail buffers.
    if (contactsRef.current?.trail !== trail) {
      contactsRef.current = {
        trail,
        previous: new Int32Array(TRAIL_CONTACT_CAPACITY).fill(-1),
        current: new Int32Array(TRAIL_CONTACT_CAPACITY).fill(-1),
      }
    }
    const contacts = contactsRef.current
    const previous = contacts.previous
    contacts.previous = contacts.current
    contacts.current = previous
    contacts.current.fill(-1)
    let contactCount = 0

    const [playerX, playerY, playerZ] = playerPosition.current
    const heightAboveSurface = playerY - TILE_SURFACE_Y

    // Ignore the ball while it is falling, airborne, or below the tiles (out of bounds).
    if (heightAboveSurface < 0 || heightAboveSurface > TRAIL_MAX_PLAYER_HEIGHT) return

    const playerRow = worldZToRowIndex(playerZ, rowCount)
    const playerColumn = worldXToColumn(playerX, COLUMNS)

    for (let row = playerRow - TRAIL_CELL_RADIUS; row <= playerRow + TRAIL_CELL_RADIUS; row++) {
      if (row < 0 || row >= rowCount) continue

      const batchStartRow = Math.floor(row / PLATFORM_BATCH_ROWS) * PLATFORM_BATCH_ROWS
      const entry = trail.byStartRow.get(batchStartRow)
      if (!entry) continue

      let hasStampedTiles = false

      for (
        let rawColumn = playerColumn - TRAIL_CELL_RADIUS;
        rawColumn <= playerColumn + TRAIL_CELL_RADIUS;
        rawColumn++
      ) {
        const column = surface.topology === 'cylinder' ? wrapColumn(rawColumn, COLUMNS) : rawColumn
        if (column < 0 || column >= COLUMNS) continue

        const offsetX = surfaceDeltaX(playerX, colToX(column, COLUMNS), surface)
        const offsetZ = rowToWorldZ(row) - playerZ
        if (offsetX * offsetX + offsetZ * offsetZ > TRAIL_BRUSH_RADIUS_SQ) continue

        const instanceIndex =
          entry.batch.cellToInstance[(row - entry.batch.startRow) * COLUMNS + column]
        if (instanceIndex < 0) continue

        const cell = row * COLUMNS + column
        contacts.current[contactCount++] = cell
        if (contacts.previous.includes(cell)) continue

        entry.timestamps[instanceIndex] = state.elapsed
        entry.attribute.addUpdateRange(instanceIndex, 1)
        hasStampedTiles = true
      }

      if (hasStampedTiles) entry.attribute.needsUpdate = true
    }
  })
}
