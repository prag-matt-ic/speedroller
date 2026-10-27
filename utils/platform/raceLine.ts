import { clamp, RACE_LINE_ROW_SPAN, type RowData, worldXToColumn } from '@/utils/tiles'

import { findRaceMarker, type RaceMarkerKind } from './raceMarkers'

export type RaceLineKind = RaceMarkerKind

export type RaceLineCell = {
  rowIndex: number
  column: number
}

/**
 * The floor band a race line covers. The line is painted onto the tiles themselves, so the band is
 * whole tiles: the marker row plus the rows either side of it, across every solid tile of the run
 * the marker sits on. The sensor uses the same cells, which keeps trigger and paint identical.
 */
export type RaceLineBand = {
  kind: RaceLineKind
  /** The authored marker row, at the band's centre. */
  anchorRowIndex: number
  /** Unwrapped column the marker sits on. */
  anchorColumn: number
  /** Centre of the marker row's run, in columns (may be fractional for an even run). */
  centreColumn: number
  /** Band rows, nearest the approaching player first. */
  firstRowIndex: number
  lastRowIndex: number
  cells: readonly RaceLineCell[]
}

const collectFloorRun = (row: RowData, anchorColumn: number): number[] => {
  const columnCount = row.isRaised.length
  const column = clamp(anchorColumn, 0, columnCount - 1)
  if (row.isRaised[column] !== 1) return []

  const run = [column]
  for (const step of [-1, 1]) {
    let next = column + step
    while (next >= 0 && next < columnCount && row.isRaised[next] === 1) {
      run.push(next)
      next += step
    }
  }
  return run.sort((a, b) => a - b)
}

/** Resolves the painted band for one race line, or null when the course has no such marker. */
export const findRaceLineBand = (
  rows: readonly RowData[],
  kind: RaceLineKind,
): RaceLineBand | null => {
  const columnCount = rows[0]?.isRaised.length ?? 0
  if (columnCount === 0) return null

  const marker = findRaceMarker(rows, kind)
  if (!marker) return null

  const anchorRowIndex = marker.rowIndex
  const anchorColumn = worldXToColumn(marker.position[0], columnCount)
  const halfSpan = Math.floor(RACE_LINE_ROW_SPAN / 2)
  const firstRowIndex = Math.max(0, anchorRowIndex - halfSpan)
  const lastRowIndex = Math.min(rows.length - 1, firstRowIndex + RACE_LINE_ROW_SPAN - 1)

  const cells: RaceLineCell[] = []
  let anchorRun: readonly number[] = []
  for (let rowIndex = firstRowIndex; rowIndex <= lastRowIndex; rowIndex++) {
    const run = collectFloorRun(rows[rowIndex], anchorColumn)
    if (rowIndex === anchorRowIndex) anchorRun = run
    for (const column of run) cells.push({ rowIndex, column })
  }
  if (cells.length === 0) return null

  const centreColumn = anchorRun.length > 0
    ? (anchorRun[0] + anchorRun[anchorRun.length - 1]) / 2
    : anchorColumn

  return { kind, anchorRowIndex, anchorColumn, centreColumn, firstRowIndex, lastRowIndex, cells }
}

/** Every race line the course defines, start first. */
export const findRaceLineBands = (rows: readonly RowData[]): RaceLineBand[] =>
  (['start', 'finish'] as const)
    .map((kind) => findRaceLineBand(rows, kind))
    .filter((band): band is RaceLineBand => band !== null)
