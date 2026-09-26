import { type FC, useEffect } from 'react'

import { useGameStore } from '@/components/GameProvider'
import { Text } from '@/components/platform/Text'
import ColourTile from '@/components/platform/colourPicker/ColourTile'
import { UNBOUNDED_FONT_FAMILY } from '@/components/platform/fonts'
import { type RowData, rowToWorldZ, TILE_SIZE } from '@/utils/tiles'

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

const OPTION_X_OFFSETS = [-4.5, -1.5, 1.5, 4.5].map((offset) => offset * TILE_SIZE)
const COLOUR_PICKER_Z_OFFSET = -TILE_SIZE * 0.5
const TEXT_HEIGHT = 2

const ColourPickerRow: FC<Props> = ({ rows, onReadyChange }) => {
  const paletteIndex = useGameStore((s) => s.paletteIndex)
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return rows.map((row, rowIndex) => {
    if (!row.colourPickerPlacement) return null
    const [x, y, relativeZ] = row.colourPickerPlacement
    const worldZ = rowToWorldZ(rowIndex) + relativeZ
    return (
      <group key={rowIndex}>
        {OPTION_X_OFFSETS.map((offset, index) => (
          <ColourTile
            key={index}
            option={{
              index,
              position: [x + offset, y, worldZ + COLOUR_PICKER_Z_OFFSET],
              userData: { type: 'colour-tile', paletteIndex: index },
            }}
            isActive={index === paletteIndex}
          />
        ))}
        <Text
          text="Paint Shop"
          position={[x, y + 0.005, worldZ + COLOUR_PICKER_Z_OFFSET + TEXT_HEIGHT]}
          width={5}
          height={TEXT_HEIGHT}
          textCanvasOptions={{ fontFamily: UNBOUNDED_FONT_FAMILY }}
        />
      </group>
    )
  })
}

export default ColourPickerRow
