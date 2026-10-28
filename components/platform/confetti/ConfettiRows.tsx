import { type FC, useEffect } from 'react'

import ConfettiRow from '@/components/platform/confetti/ConfettiRow'
import { type RowData, rowToWorldZ } from '@/utils/tiles'

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

const ConfettiRows: FC<Props> = ({ rows, onReadyChange }) => {
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return rows.flatMap((row, rowIndex) =>
    (row.confettiPlacements ?? []).map(({ position: [x, y, relativeZ], width, depth, contentIndex }) => (
      <ConfettiRow
        key={`${rowIndex}-${contentIndex}`}
        position={[x, y, rowToWorldZ(rowIndex) + relativeZ]}
        width={width}
        depth={depth}
        index={contentIndex}
      />
    )),
  )
}

export default ConfettiRows
