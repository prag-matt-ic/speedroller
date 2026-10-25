import { type IndexedPlacement, ON_TILE_Y, type RowData } from '@/utils/tiles'

const placePositionOnTile = ([x, , z]: readonly [number, number, number]): [number, number, number] =>
  [x, ON_TILE_Y, z]

const placeIndexedElementOnTile = ([x, , z, index]: IndexedPlacement): IndexedPlacement =>
  [x, ON_TILE_Y, z, index]

// Generated course heights can predate tile thickness changes; resolve floor anchors at load time.
export function placeRowElementsOnTiles(row: RowData): RowData {
  return {
    ...row,
    infoZonePlacements: row.infoZonePlacements?.map(placeIndexedElementOnTile),
    collectiblePlacements: row.collectiblePlacements?.map(placeIndexedElementOnTile),
    colourPickerPlacement: row.colourPickerPlacement
      ? placeIndexedElementOnTile(row.colourPickerPlacement)
      : undefined,
    startLinePosition: row.startLinePosition
      ? placePositionOnTile(row.startLinePosition)
      : undefined,
    finishLinePosition: row.finishLinePosition
      ? placePositionOnTile(row.finishLinePosition)
      : undefined,
    confettiPlacements: row.confettiPlacements?.map((placement) => ({
      ...placement,
      position: placePositionOnTile(placement.position),
    })),
  }
}
