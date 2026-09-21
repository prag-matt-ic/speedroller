import { uniformArray } from 'three/tsl'
import { Vector3 } from 'three'
import type { Node } from 'three/webgpu'

import { cosinePalette } from '@/resources/tsl/palette'

// Port of resources/glsl/playerPalette.glsl.
//
// The GLSL selected one of four parameter sets with `if (index == n) { ... return; }`. Rather than a
// per-fragment `select` chain (or divergent branches), the four palettes are packed into one flat
// vec3 uniform array indexed by `paletteIndex` — a single uniform-indexed load per channel.

export type CosinePaletteParams = {
  a: readonly [number, number, number]
  b: readonly [number, number, number]
  c: readonly [number, number, number]
  d: readonly [number, number, number]
}

// Index 0 is the default palette: it is what the GLSL falls through to for any unmatched index.
export const PLAYER_PALETTE_PARAMS: readonly CosinePaletteParams[] = [
  { a: [0.47, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 0.49], d: [0.75, 0.91, 0.3] },
  { a: [1.0, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [0.568, 1.0, 0.667], d: [0.8, 1.0, 0.333] },
  { a: [0.2, 0.47, 0.542], b: [0.731, 0.486, 0.4], c: [0.619, 0.864, 0.95], d: [0.38, 0.29, 0.28] },
  { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 0.7, 0.4], d: [0.0, 0.15, 0.2] },
]

/** Channels per palette (a, b, c, d), the stride of the flat parameter array. */
const PALETTE_CHANNEL_COUNT = 4

/** The four palettes flattened to `(palette * 4 + channel)` vec3 slots. */
const PALETTE_ARRAY = /*#__PURE__*/ uniformArray<'vec3'>(
  PLAYER_PALETTE_PARAMS.flatMap((params) => [
    new Vector3(...params.a),
    new Vector3(...params.b),
    new Vector3(...params.c),
    new Vector3(...params.d),
  ]),
  'vec3',
)

/**
 * Samples a player palette by index at position `t`, matching
 * `samplePlayerPalette(float t, int paletteIndex)` from the GLSL helper.
 * Call inside a `Fn`/`useLocalNodes` creator so `paletteIndex` is a shader node.
 */
export const samplePlayerPalette = (t: Node<'float'>, paletteIndex: Node<'int'>) => {
  // Clamp to the valid range so an unmatched index (e.g. -1 for "no confirming palette") still
  // resolves to the default palette, matching the GLSL's fall-through. The TSL types do not expose
  // int clamp/min/max, so round-trip through float.
  const base = paletteIndex
    .toFloat()
    .clamp(0, PLAYER_PALETTE_PARAMS.length - 1)
    .toInt()
    .mul(PALETTE_CHANNEL_COUNT)

  return cosinePalette(
    t,
    PALETTE_ARRAY.element(base),
    PALETTE_ARRAY.element(base.add(1)),
    PALETTE_ARRAY.element(base.add(2)),
    PALETTE_ARRAY.element(base.add(3)),
  )
}

/** GLSL `getColourFromPalette(int paletteIndex, float t)`. */
export const getColourFromPalette = (paletteIndex: Node<'int'>, t: Node<'float'>) =>
  samplePlayerPalette(t, paletteIndex)
