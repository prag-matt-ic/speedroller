import type { Vector3Tuple } from 'three'

import { type RowData, colToX, rowToWorldZ, worldZToRowIndex } from '@/utils/tiles'

import { type CourseSurface, courseToWorld, FLAT_SURFACE, surfaceDeltaX } from './courseSurface'
const MIN_RESPAWN_ROW = 1

export type RespawnRowRange = {
  startRow: number
  endRow: number
}

type SafeRowSelection = {
  rowIndex: number
  safeX: number
}

function findSafeColumnX(row: RowData, preferredX: number, surface: CourseSurface): number | null {
  const targetX = Number.isFinite(preferredX) ? preferredX : 0
  let nearestX: number | null = null
  let nearestDistance = Infinity
  for (let column = 0; column < row.isRaised.length; column++) {
    if (row.isRaised[column] !== 1) continue
    const x = colToX(column, row.isRaised.length)
    const distance = Math.abs(surfaceDeltaX(targetX, x, surface))
    if (distance >= nearestDistance) continue
    nearestX = x
    nearestDistance = distance
  }
  return nearestX
}

function selectSafeRow(
  rows: readonly RowData[],
  rowIndex: number,
  preferredX: number,
  surface: CourseSurface,
): SafeRowSelection | null {
  const row = rows[rowIndex]
  if (!row) return null
  const safeX = findSafeColumnX(row, preferredX, surface)
  return safeX === null ? null : { rowIndex, safeX }
}

export function findSafeRespawnPosition(
  rows: readonly RowData[],
  playerX: number,
  playerZ: number,
  spawnHeight: number,
  rowRange?: RespawnRowRange,
  surface: CourseSurface = FLAT_SURFACE,
): Vector3Tuple | null {
  if (rows.length === 0) return null
  const lastRowIndex = rows.length - 1
  const firstSafeRowIndex = rowRange
    ? Math.max(0, rowRange.startRow)
    : Math.min(MIN_RESPAWN_ROW, lastRowIndex)
  const lastSafeRowIndex = rowRange ? Math.min(lastRowIndex, rowRange.endRow) : lastRowIndex

  if (firstSafeRowIndex > lastSafeRowIndex) return null

  const currentRowIndex = Math.min(
    lastSafeRowIndex,
    Math.max(firstSafeRowIndex, worldZToRowIndex(playerZ, rows.length)),
  )

  // Keep the current row when possible, then try the next row before a bounded search.
  let selection =
    selectSafeRow(rows, currentRowIndex, playerX, surface) ??
    selectSafeRow(rows, Math.min(currentRowIndex + 1, lastSafeRowIndex), playerX, surface)

  if (!selection) {
    let closestDistance = Infinity
    for (let rowIndex = firstSafeRowIndex; rowIndex <= lastSafeRowIndex; rowIndex++) {
      const candidate = selectSafeRow(rows, rowIndex, playerX, surface)
      if (!candidate) continue
      const distance = Math.abs(rowToWorldZ(rowIndex) - playerZ)
      if (distance >= closestDistance) continue
      closestDistance = distance
      selection = candidate
    }
  }

  if (!selection) return null
  const position = courseToWorld(selection.safeX, spawnHeight, rowToWorldZ(selection.rowIndex), surface, { x: 0, y: 0, z: 0 })
  return [position.x, position.y, position.z]
}

