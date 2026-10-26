import { Color } from 'three'

import { ON_TILE_Y } from '@/utils/tiles'

// Shared ring geometry and colour. The torus, its sensor and its co-located point light all read
// these, so a ring and its light cannot drift apart.
export const RING_MAJOR_RADIUS = 0.32
export const RING_TUBE_RADIUS = 0.06
export const RING_WORLD_Y = ON_TILE_Y + RING_MAJOR_RADIUS * 2

export const RING_COLOR = new Color('#FCB11C')
export const RING_EMISSIVE = new Color('#FFCC02')
