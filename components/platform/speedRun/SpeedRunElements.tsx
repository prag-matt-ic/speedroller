import { type FC, useEffect } from 'react'

import { type RowData, rowToWorldZ, TILE_SIZE } from '@/utils/tiles'

import SpeedRunLine from './SpeedRunLine'

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

type RaceLine = {
  kind: 'start' | 'finish'
  key: string
  position: [number, number, number]
}

const LINE_WIDTH = 9 * TILE_SIZE
const LINE_HEIGHT = 5 * TILE_SIZE

const collectRaceLines = (rows: readonly RowData[]): RaceLine[] => {
  const lines: RaceLine[] = []
  rows.forEach((row, rowIndex) => {
    const rowZ = rowToWorldZ(rowIndex)
    if (row.startLinePosition) {
      const [x, y, relativeZ] = row.startLinePosition
      lines.push({ kind: 'start', key: 'start', position: [x, y, rowZ + relativeZ] })
    }
    if (row.finishLinePosition) {
      const [x, y, relativeZ] = row.finishLinePosition
      lines.push({ kind: 'finish', key: 'finish', position: [x, y, rowZ + relativeZ] })
    }
  })
  return lines
}

const SpeedRunElements: FC<Props> = ({ rows, onReadyChange }) => {
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return collectRaceLines(rows).map((line) => (
    <SpeedRunLine
      key={line.key}
      kind={line.kind}
      position={line.position}
      width={LINE_WIDTH}
      height={LINE_HEIGHT}
    />
  ))
}

export default SpeedRunElements
