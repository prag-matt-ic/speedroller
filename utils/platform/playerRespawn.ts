import type { Vector3Tuple } from 'three'

import { COLUMNS, type RowData, colToX, rowToWorldZ, worldZToRowIndex } from '@/utils/tiles'

const CENTER_COL_INDEX = Math.floor(COLUMNS / 2)
const MIN_RESPAWN_ROW = 1

type SafeRowSelection = {
  rowIndex: number
  safeX: number
}

function findSafeColumnX(row: RowData, preferredX: number): number | null {
  const targetX = Number.isFinite(preferredX) ? preferredX : colToX(CENTER_COL_INDEX)
  let nearestX: number | null = null
  let nearestDistance = Infinity
  for (let column = 0; column < COLUMNS; column++) {
    if (row.isRaised[column] !== 1) continue
    const x = colToX(column)
    const distance = Math.abs(x - targetX)
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
): SafeRowSelection | null {
  const row = rows[rowIndex]
  if (!row) return null
  const safeX = findSafeColumnX(row, preferredX)
  return safeX === null ? null : { rowIndex, safeX }
}

export function findSafeRespawnPosition(
  rows: readonly RowData[],
  playerX: number,
  playerZ: number,
  spawnHeight: number,
): Vector3Tuple | null {
  if (rows.length === 0) return null
  const firstSafeRowIndex = Math.min(MIN_RESPAWN_ROW, rows.length - 1)
  const currentRowIndex = Math.max(firstSafeRowIndex, worldZToRowIndex(playerZ, rows.length))

  // Keep the current row when possible, then try the next row before a course-wide search.
  let selection =
    selectSafeRow(rows, currentRowIndex, playerX) ??
    selectSafeRow(rows, currentRowIndex + 1, playerX)

  if (!selection) {
    let closestDistance = Infinity
    for (let rowIndex = firstSafeRowIndex; rowIndex < rows.length; rowIndex++) {
      const candidate = selectSafeRow(rows, rowIndex, playerX)
      if (!candidate) continue
      const distance = Math.abs(rowToWorldZ(rowIndex) - playerZ)
      if (distance >= closestDistance) continue
      closestDistance = distance
      selection = candidate
    }
  }

  if (!selection) return null
  return [selection.safeX, spawnHeight, rowToWorldZ(selection.rowIndex)]
}

