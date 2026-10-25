import type { Vector3Tuple } from 'three'

import { samplePaletteColour } from '@/components/palette'

// The cosine palette's lightest usable band for every authored palette. The same values feed the
// marble shader as linear colour, so the light uses them directly rather than a CSS hex.
export const PLAYER_LIGHT_PALETTE_T = 0.8

const clampChannel = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * Player-light colour for a palette. Cosine palettes can undershoot zero, which a light would
 * subtract from the tiles, so the channels are clamped before they become a light colour.
 */
export const getPlayerLightColour = (paletteIndex: number): Vector3Tuple => {
  const [red, green, blue] = samplePaletteColour(paletteIndex, PLAYER_LIGHT_PALETTE_T)
  return [clampChannel(red), clampChannel(green), clampChannel(blue)]
}
