import type { Vector3Tuple } from 'three'

import { COLUMNS, colToX, ON_TILE_Y, rowToWorldZ } from '@/utils/tiles'

const TILE_TEXT_CLEARANCE = 0.02

export type TileTextCharacter = {
  character: string
  column: number
  position: Vector3Tuple
}

export const createTileTextLayout = (
  text: string,
  rowIndex: number,
  centerColumn: number,
  columns = COLUMNS,
): TileTextCharacter[] => {
  const characters = Array.from(text)
  const startColumn = Math.floor(centerColumn - (characters.length - 1) / 2)
  const z = rowToWorldZ(rowIndex)

  return characters.map((character, index) => {
    const column = startColumn + index
    return {
      character,
      column,
      position: [colToX(column, columns), ON_TILE_Y + TILE_TEXT_CLEARANCE, z],
    }
  })
}
