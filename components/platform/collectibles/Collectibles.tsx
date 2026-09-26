import { type FC, useEffect } from 'react'

import Collectible from '@/components/platform/collectibles/collectible/Collectible'
import { COLLECTIBLE_IDS } from '@/model/schema'
import { INFO_ZONE_HEIGHT, INFO_ZONE_WIDTH } from '@/utils/platform/infoZoneDimensions'
import { type RowData, rowToWorldZ } from '@/utils/tiles'

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

const Collectibles: FC<Props> = ({ rows, onReadyChange }) => {
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return rows.flatMap((row, rowIndex) =>
    (row.collectiblePlacements ?? []).map(([x, y, relativeZ, contentIndex]) => (
      <Collectible
        key={`${rowIndex}-${contentIndex}`}
        position={[x, y, rowToWorldZ(rowIndex) + relativeZ]}
        id={COLLECTIBLE_IDS[contentIndex % COLLECTIBLE_IDS.length]}
        width={INFO_ZONE_WIDTH}
        height={INFO_ZONE_HEIGHT}
      />
    )),
  )
}

export default Collectibles
