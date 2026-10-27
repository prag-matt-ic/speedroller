import type { Vector3Tuple } from 'three'

import { COLUMNS, PLATFORM_BATCH_ROWS, RAISED_Y, type RowData, TILE_SIZE, colToX } from '@/utils/tiles'

import { findRaceLineBands, type RaceLineKind } from './raceLine'

export type TileBatch = {
  columns: number
  startRow: number
  positions: Vector3Tuple[]
  solidPositions: Vector3Tuple[]
  ghosts: Float32Array
  seeds: Float32Array
  highlights: Float32Array
  /** Race-line paint: 0 = bare stone, 1 = white, 2 = black. */
  raceLinePaint: Float32Array
  /** 1 on finish-line tiles that carry the red leading edge. */
  raceLineEdge: Float32Array
  /** Instance index for each cell in the batch's row band, or -1 for empty/ghost cells. */
  cellToInstance: Int32Array
}

const RACE_LINE_WHITE = 1
const RACE_LINE_BLACK = 2

/** The parity carrying each line's main colour, so neighbouring band rows interlock. */
const isMainSquare = (rowIndex: number, column: number) => (rowIndex + column) % 2 === 0

type RaceLineRow = {
  kind: RaceLineKind
  columns: Set<number>
  hasEdge: boolean
}

/**
 * The start paints white squares over bare stone. The finish paints both parities — black on the
 * main one, white on the other — so the flag reads clearly against the dark floor.
 */
const paintForCell = (kind: RaceLineKind, isMain: boolean): number => {
  if (kind === 'finish') return isMain ? RACE_LINE_BLACK : RACE_LINE_WHITE
  return isMain ? RACE_LINE_WHITE : 0
}

/**
 * Indexes the painted band by row once, so the per-tile loop is a map and set lookup. Only the band
 * rows carry entries; every other row stays bare.
 */
const createRaceLineRows = (rows: readonly RowData[]): Map<number, RaceLineRow> => {
  const raceLineRows = new Map<number, RaceLineRow>()
  for (const band of findRaceLineBands(rows)) {
    for (let rowIndex = band.firstRowIndex; rowIndex <= band.lastRowIndex; rowIndex++) {
      const isLeadingRow = rowIndex === band.firstRowIndex
      const columns = new Set<number>()
      raceLineRows.set(rowIndex, {
        kind: band.kind,
        columns,
        hasEdge: band.kind === 'finish' && isLeadingRow,
      })
    }
    for (const cell of band.cells) raceLineRows.get(cell.rowIndex)?.columns.add(cell.column)
  }
  return raceLineRows
}


// Stable per-cell seeds keep the same tile's appearance after reset and quality changes.
const tileSeed = (row: number, column: number) => {
  const value = Math.sin((row * COLUMNS + column + 1) * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

export const createTileBatches = (rows: readonly RowData[], includeGhosts = false): TileBatch[] => {
  const batches: TileBatch[] = []
  const columns = rows[0]?.isRaised.length ?? COLUMNS
  const raceLineRows = createRaceLineRows(rows)
  for (let startRow = 0; startRow < rows.length; startRow += PLATFORM_BATCH_ROWS) {
    const positions: Vector3Tuple[] = []
    const seeds: number[] = []
    const ghosts: number[] = []
    const solidPositions: Vector3Tuple[] = []
    const highlights: number[] = []
    const raceLinePaint: number[] = []
    const raceLineEdge: number[] = []
    const cellToInstance = new Int32Array(PLATFORM_BATCH_ROWS * columns).fill(-1)
    const endRow = Math.min(startRow + PLATFORM_BATCH_ROWS, rows.length)

    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      const row = rows[rowIndex]
      const raceLineRow = raceLineRows.get(rowIndex)
      for (let column = 0; column < columns; column++) {
        const isGhost = row.decorationColumns?.includes(column) ?? false
        if (isGhost ? !includeGhosts : row.isRaised[column] !== 1) continue
        const position: Vector3Tuple = [colToX(column, columns), RAISED_Y, -(rowIndex - startRow) * TILE_SIZE]
        if (!isGhost) {
          cellToInstance[(rowIndex - startRow) * columns + column] = positions.length
          solidPositions.push(position)
        }
        positions.push(position)
        ghosts.push(Number(isGhost))
        seeds.push(tileSeed(rowIndex, column))
        highlights.push(row.isHighlighted?.[column] ?? 0)

        let paint = 0
        let edge = 0
        if (!isGhost && raceLineRow && raceLineRow.columns.has(column)) {
          paint = paintForCell(raceLineRow.kind, isMainSquare(rowIndex, column))
          edge = raceLineRow.hasEdge ? 1 : 0
        }
        raceLinePaint.push(paint)
        raceLineEdge.push(edge)
      }
    }

    if (positions.length > 0) {
      batches.push({
        columns,
        startRow,
        positions,
        solidPositions,
        ghosts: new Float32Array(ghosts),
        seeds: new Float32Array(seeds),
        highlights: new Float32Array(highlights),
        raceLinePaint: new Float32Array(raceLinePaint),
        raceLineEdge: new Float32Array(raceLineEdge),
        cellToInstance,
      })
    }
  }
  return batches
}

/**
 * Interleaves the per-instance state the tile shader reads into one vec4: x = ghost, y = highlighted,
 * z = race-line paint (0 bare, 1 white, 2 black), w = race-line red edge. One attribute rather than
 * four because WebGPU's default eight-vertex-buffer limit is already spent by the slab's vertices,
 * the seed and the trail timestamp.
 */
export const packTileState = (batch: TileBatch): Float32Array => {
  const state = new Float32Array(batch.positions.length * 4)
  for (let index = 0; index < batch.positions.length; index++) {
    const offset = index * 4
    state[offset] = batch.ghosts[index]
    state[offset + 1] = batch.highlights[index]
    state[offset + 2] = batch.raceLinePaint[index]
    state[offset + 3] = batch.raceLineEdge[index]
  }
  return state
}

