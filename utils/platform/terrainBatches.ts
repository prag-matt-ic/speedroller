import type { Vector3Tuple } from 'three'

import { COLUMNS, PLATFORM_BATCH_ROWS, RAISED_Y, type RowData, TILE_SIZE, colToX } from '@/utils/tiles'

export type TileBatch = {
  startRow: number
  positions: Vector3Tuple[]
  seeds: Float32Array
  highlights: Float32Array
}

// Stable per-cell seeds keep the same tile's appearance after reset and quality changes.
const tileSeed = (row: number, column: number) => {
  const value = Math.sin((row * COLUMNS + column + 1) * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

export const createTileBatches = (rows: readonly RowData[]): TileBatch[] => {
  const batches: TileBatch[] = []
  for (let startRow = 0; startRow < rows.length; startRow += PLATFORM_BATCH_ROWS) {
    const positions: Vector3Tuple[] = []
    const seeds: number[] = []
    const highlights: number[] = []
    const endRow = Math.min(startRow + PLATFORM_BATCH_ROWS, rows.length)

    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      const row = rows[rowIndex]
      for (let column = 0; column < COLUMNS; column++) {
        if (row.isRaised[column] !== 1) continue
        positions.push([colToX(column), RAISED_Y, -(rowIndex - startRow) * TILE_SIZE])
        seeds.push(tileSeed(rowIndex, column))
        highlights.push(row.isHighlighted?.[column] ?? 0)
      }
    }

    if (positions.length > 0) {
      batches.push({
        startRow,
        positions,
        seeds: new Float32Array(seeds),
        highlights: new Float32Array(highlights),
      })
    }
  }
  return batches
}

