import { ON_TILE_Y } from '@/utils/tiles'

export const PLAYER_RADIUS = 0.45

/** Extra clearance above the resting ball so the character controller settles onto the tiles. */
export const PLAYER_GRID_CLEARANCE = 0.02

/** Ball-centre height when parked on the starting grid or a lobby tile. */
export const PLAYER_RESTING_Y = ON_TILE_Y + PLAYER_RADIUS + PLAYER_GRID_CLEARANCE
