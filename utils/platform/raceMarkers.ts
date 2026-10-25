import type { Vector3Tuple } from 'three'

import { type RowData, rowToWorldZ } from '@/utils/tiles'
import { type CourseSurface, courseToWorld, FLAT_SURFACE } from './courseSurface'

export type RaceMarkerKind = 'start' | 'finish'

export type RaceMarker = {
  kind: RaceMarkerKind
  rowIndex: number
  /** Marker centre in world space, already resolved through `rowToWorldZ`. */
  position: Vector3Tuple
}

export type RaceMarkers = {
  start: RaceMarker
  finish: RaceMarker
}

type MarkerRow = {
  rowIndex: number
  position: Vector3Tuple
}

const findMarker = (
  rows: readonly RowData[],
  getPosition: (row: RowData) => [number, number, number] | undefined,
  kind: RaceMarkerKind,
): RaceMarker | null => {
  const matches: MarkerRow[] = []
  rows.forEach((row, rowIndex) => {
    const position = getPosition(row)
    if (!position) return
    const [x, y, relativeZ] = position
    matches.push({ rowIndex, position: [x, y, rowToWorldZ(rowIndex) + relativeZ] })
  })
  if (matches.length !== 1) return null
  const [match] = matches
  return { kind, rowIndex: match.rowIndex, position: match.position }
}

/** Resolves the unique physical start and finish markers from generated row data. */
export function findRaceMarkers(rows: readonly RowData[]): RaceMarkers | null {
  const start = findMarker(rows, (row) => row.startLinePosition, 'start')
  const finish = findMarker(rows, (row) => row.finishLinePosition, 'finish')
  if (!start || !finish) return null
  return { start, finish }
}

/** Ball-centre position on the starting grid, ignoring the marker's own surface offset. */
export function getStartGridPosition(
  rows: readonly RowData[],
  restingY: number,
  surface: CourseSurface = FLAT_SURFACE,
): Vector3Tuple | null {
  const markers = findRaceMarkers(rows)
  if (!markers) return null
  const position = courseToWorld(markers.start.position[0], restingY, markers.start.position[2], surface, { x: 0, y: 0, z: 0 })
  return [position.x, position.y, position.z]
}

export function getStartRowIndex(rows: readonly RowData[]): number | null {
  return findRaceMarkers(rows)?.start.rowIndex ?? null
}

// The physical line footprint is five rows deep, so a respawn must stay at least three rows
// before the marker to avoid being placed inside the start sensor.
const LOBBY_RESPAWN_CLEARANCE_ROWS = 3

export function getFinishRowIndex(rows: readonly RowData[]): number | null {
  return findRaceMarkers(rows)?.finish.rowIndex ?? null
}

/** Lobby recovery rows, kept clear of the five-row start sensor footprint. */
export function getLobbyRowRange(
  rows: readonly RowData[],
): { startRow: number; endRow: number } | null {
  const startRowIndex = getStartRowIndex(rows)
  if (startRowIndex === null) return null
  return {
    startRow: 0,
    endRow: Math.max(0, startRowIndex - LOBBY_RESPAWN_CLEARANCE_ROWS),
  }
}
