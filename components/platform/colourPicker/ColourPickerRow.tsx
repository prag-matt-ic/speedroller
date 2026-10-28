import { type FC, useEffect } from 'react'

import { useGameStore } from '@/components/GameProvider'
import ColourTile from '@/components/platform/colourPicker/ColourTile'
import { COLOUR_PICKER_COLUMN_OFFSETS, colourPickerRowIndex } from '@/utils/platform/homeSection'
import { type RowData, rowToWorldZ, TILE_SIZE } from '@/utils/tiles'

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

const ColourPickerRow: FC<Props> = ({ rows, onReadyChange }) => {
  const paletteIndex = useGameStore((s) => s.paletteIndex)
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return rows.map((row, rowIndex) => {
    if (!row.colourPickerPlacement) return null
    const [x, y, relativeZ] = row.colourPickerPlacement
    const worldZ = rowToWorldZ(colourPickerRowIndex(rowIndex, relativeZ))
    return (
      <group key={rowIndex}>
        {COLOUR_PICKER_COLUMN_OFFSETS.map((offset, index) => (
          <ColourTile
            key={index}
            option={{
              index,
              position: [x + offset * TILE_SIZE, y, worldZ],
              userData: { type: 'colour-tile', paletteIndex: index },
            }}
            isActive={index === paletteIndex}
          />
        ))}
      </group>
    )
  })
}

export default ColourPickerRow
