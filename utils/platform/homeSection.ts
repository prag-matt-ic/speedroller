import { PALETTE_COUNT } from '../../components/palette'
import { TILE_SIZE } from '../tiles'

export const COLOUR_TILE_SIZE = TILE_SIZE
export const COLOUR_PICKER_COLUMN_OFFSETS = Array.from(
  { length: PALETTE_COUNT }, (_, index) => index - Math.floor(PALETTE_COUNT / 2),
)
export const colourPickerRowIndex = (rowIndex: number, relativeZ: number): number =>
  Math.round(rowIndex - relativeZ / TILE_SIZE)
