import { type FC, useEffect } from 'react'

import { FloatingHeading } from '@/components/platform/floatingHeadings/floatingHeading/FloatingHeading'
import { HEADINGS_CONTENT } from '@/resources/content'
import { HEADING_HEIGHT, HEADING_POSITION_OFFSET_Z, HEADING_WIDTH } from '@/utils/platform/floatingHeading'
import { type RowData, rowToWorldZ } from '@/utils/tiles'

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

const FloatingHeadings: FC<Props> = ({ rows, onReadyChange }) => {
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return rows.flatMap((row, rowIndex) =>
    (row.floatingHeadingPlacements ?? []).map(([x, y, relativeZ, contentIndex]) => {
      const heading = HEADINGS_CONTENT[contentIndex]
      return (
        <FloatingHeading
          key={`${rowIndex}-${contentIndex}`}
          text={heading?.text ?? ''}
          position={[x, y, rowToWorldZ(rowIndex) + relativeZ + HEADING_POSITION_OFFSET_Z]}
          width={HEADING_WIDTH}
          height={HEADING_HEIGHT}
          textCanvasOptions={heading?.textCanvasOptions}
        />
      )
    }),
  )
}

export default FloatingHeadings
