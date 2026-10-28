import { colToX, ON_TILE_Y, rowToWorldZ } from '../tiles'

export const LOBBY_PODIUM = { row: 20, column: 48 }
export const LOBBY_PODIUM_SENSOR = { row: 15, column: 48, halfWidth: 2, halfDepth: 1 }
export const LOBBY_INFO_ZONES = [
  { row: 4, column: 77, halfWidth: 2, halfDepth: 2 },
  { row: 20, column: 77, halfWidth: 2, halfDepth: 2 },
] as const
export const LOBBY_LOOP_START_ROW = 12
export const LOBBY_LOOP_END_ROW = 16
export const LOBBY_FEATURE_FOOTPRINTS = [LOBBY_PODIUM_SENSOR, ...LOBBY_INFO_ZONES]

export const lobbyPosition = ({ row, column }: { row: number; column: number }, columns: number): [number, number, number] =>
  [colToX(column, columns), ON_TILE_Y, rowToWorldZ(row)]
