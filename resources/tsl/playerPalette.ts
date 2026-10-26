import { mix, uniformArray } from 'three/tsl'
import { Vector3 } from 'three'
import type { Node } from 'three/webgpu'

import { PALETTE_COUNT, PLAYER_PALETTE_STOPS } from '@/components/palette'

const PALETTE_STOP_COUNT = 3

/** Shared sampling position for the player light and touched-tile afterglow. */
export const PLAYER_LIGHT_PALETTE_T = 0.8

const PALETTE_ARRAY = /*#__PURE__*/ uniformArray<'vec3'>(
  PLAYER_PALETTE_STOPS.flatMap(stops => stops.map(stop => new Vector3(...stop))),
  'vec3',
)

export const samplePlayerPalette = (t: Node<'float'>, paletteIndex: Node<'int'>) => {
  const position = t.clamp(0, 1).mul(2)
  const segment = position.floor().min(1)
  const base = paletteIndex.toFloat().clamp(0, PALETTE_COUNT - 1).toInt()
    .mul(PALETTE_STOP_COUNT).add(segment.toInt())
  return mix(PALETTE_ARRAY.element(base), PALETTE_ARRAY.element(base.add(1)), position.sub(segment))
}

export const getColourFromPalette = (paletteIndex: Node<'int'>, t: Node<'float'>) =>
  samplePlayerPalette(t, paletteIndex)
