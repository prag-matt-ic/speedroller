import { type FC, useEffect, useMemo } from 'react'
import type { Vector3Tuple } from 'three'

import { findRaceLineBands, type RaceLineBand, type RaceLineKind } from '@/utils/platform/raceLine'
import { colToX, ON_TILE_Y, type RowData, rowToWorldZ } from '@/utils/tiles'

import SpeedRunLine from './SpeedRunLine'

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

type RaceLine = {
  kind: RaceLineKind
  /** Group anchor: the band's centre column, its anchor row and the tile surface. */
  position: Vector3Tuple
  /** Tile centres the painted band and the sensor both cover, relative to the group. */
  cells: readonly Vector3Tuple[]
}

const createRaceLine = (band: RaceLineBand, columns: number): RaceLine => {
  const anchorZ = rowToWorldZ(band.anchorRowIndex)
  return {
    kind: band.kind,
    position: [colToX(band.centreColumn, columns), ON_TILE_Y, anchorZ],
    cells: band.cells.map(({ rowIndex, column }) => [
      colToX(column, columns),
      ON_TILE_Y,
      rowToWorldZ(rowIndex) - anchorZ,
    ]),
  }
}

const collectRaceLines = (rows: readonly RowData[]): RaceLine[] => {
  const columns = rows[0]?.isRaised.length ?? 0
  if (columns === 0) return []
  return findRaceLineBands(rows).map((band) => createRaceLine(band, columns))
}

const SpeedRunElements: FC<Props> = ({ rows, onReadyChange }) => {
  const raceLines = useMemo(() => collectRaceLines(rows), [rows])

  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return raceLines.map((line) => (
    <SpeedRunLine
      key={line.kind}
      kind={line.kind}
      position={line.position}
      cells={line.cells}
    />
  ))
}

export default SpeedRunElements
