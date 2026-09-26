import { type FC, useEffect } from 'react'

import { type RowData, rowToWorldZ, TILE_SIZE } from '@/utils/tiles'

import SpeedRunLine from './SpeedRunLine'

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

const SpeedRunElements: FC<Props> = ({ rows, onReadyChange }) => {
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return rows.map((row, rowIndex) => {
    if (!row.finishLinePosition) return null
    const [x, y, relativeZ] = row.finishLinePosition
    return (
      <SpeedRunLine
        key={rowIndex}
        position={[x, y, rowToWorldZ(rowIndex) + relativeZ]}
        width={9 * TILE_SIZE}
        height={5 * TILE_SIZE}
      />
    )
  })
}

export default SpeedRunElements
