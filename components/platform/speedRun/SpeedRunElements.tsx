import { type FC, Fragment, useEffect, useMemo } from 'react'
import type { Vector3Tuple } from 'three'

import { TileText } from '@/components/platform/TileText'
import { findRaceLineBands, type RaceLineBand, type RaceLineKind } from '@/utils/platform/raceLine'
import { createTileTextLayout } from '@/utils/platform/tileText'
import { colToX, ON_TILE_Y, type RowData, rowToWorldZ } from '@/utils/tiles'

import SpeedRunLine from './SpeedRunLine'

const LINE_LABEL_ROW_OFFSET = 3
const FINISH_LABEL_COLOR = '#eafffb'

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
  label: { text: string; rowIndex: number; centerColumn: number } | null
}

const createRaceLine = (band: RaceLineBand, rows: readonly RowData[], columns: number): RaceLine => {
  const anchorZ = rowToWorldZ(band.anchorRowIndex)
  const text = band.kind === 'start' ? 'START' : 'FINISH'
  const labelRowIndex = band.anchorRowIndex - LINE_LABEL_ROW_OFFSET
  const labelRow = rows[labelRowIndex]
  const labelLayout = createTileTextLayout(text, labelRowIndex, band.centreColumn, columns)
  const hasLabelFloor = labelLayout.every(({ column }) =>
    labelRow?.isRaised[column] === 1 && !labelRow.decorationColumns?.includes(column),
  )

  return {
    kind: band.kind,
    position: [colToX(band.centreColumn, columns), ON_TILE_Y, anchorZ],
    cells: band.cells.map(({ rowIndex, column }) => [
      colToX(column, columns),
      ON_TILE_Y,
      rowToWorldZ(rowIndex) - anchorZ,
    ]),
    label: hasLabelFloor
      ? { text, rowIndex: labelRowIndex, centerColumn: band.centreColumn }
      : null,
  }
}

const collectRaceLines = (rows: readonly RowData[]): RaceLine[] => {
  const columns = rows[0]?.isRaised.length ?? 0
  if (columns === 0) return []
  return findRaceLineBands(rows).map((band) => createRaceLine(band, rows, columns))
}

const SpeedRunElements: FC<Props> = ({ rows, onReadyChange }) => {
  const raceLines = useMemo(() => collectRaceLines(rows), [rows])

  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return raceLines.map((line) => (
    <Fragment key={line.kind}>
      <SpeedRunLine kind={line.kind} position={line.position} cells={line.cells} />
      {line.label && (
        <TileText
          {...line.label}
          textCanvasOptions={{ color: line.kind === 'start' ? '#ffffff' : FINISH_LABEL_COLOR }}
        />
      )}
    </Fragment>
  ))
}

export default SpeedRunElements
