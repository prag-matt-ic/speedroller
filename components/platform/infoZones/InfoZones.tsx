import { type FC, useEffect } from 'react'

import compassIcon from '@/assets/icons/info-compass.png'
import infoIcon from '@/assets/icons/info-general.png'
import ideaIcon from '@/assets/icons/info-idea.png'
import techIcon from '@/assets/icons/info-technologies.png'
import { InfoZone } from '@/components/platform/infoZones/infoZone/InfoZone'
import { INFO_ZONES_CARD_CONTENT } from '@/resources/content'
import { type RowData, rowToWorldZ } from '@/utils/tiles'

const ICONS = [compassIcon, ideaIcon, techIcon, infoIcon]

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

const InfoZones: FC<Props> = ({ rows, onReadyChange }) => {
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return rows.flatMap((row, rowIndex) =>
    (row.infoZonePlacements ?? []).map(([x, y, relativeZ, contentIndex]) => (
      <InfoZone
        key={`${rowIndex}-${contentIndex}`}
        zoneKey={`infoZone${rowIndex}_${contentIndex}`}
        position={[x, y, rowToWorldZ(rowIndex) + relativeZ]}
        infoContainerClassName="w-[360px] xl:w-[480px]"
        iconSrc={ICONS[contentIndex % ICONS.length].src}>
        {INFO_ZONES_CARD_CONTENT[contentIndex]}
      </InfoZone>
    )),
  )
}

export default InfoZones
