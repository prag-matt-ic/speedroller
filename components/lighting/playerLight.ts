import type { Vector3Tuple } from 'three'

import { samplePaletteLinearColour } from '@/components/palette'
import { PLAYER_LIGHT_PALETTE_T } from '@/resources/tsl/playerPalette'

export const getPlayerLightColour = (paletteIndex: number): Vector3Tuple =>
  samplePaletteLinearColour(paletteIndex, PLAYER_LIGHT_PALETTE_T)
