import { vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

import { cosinePalette } from '@/resources/tsl/palette'

// Port of resources/glsl/tilesPalette.glsl.
//
//   vec3 sampleTilesPalette(in float t) {
//     vec3 a = vec3(0.200, 0.542, 0.542);
//     vec3 b = vec3(0.970, 0.470, 0.430);
//     vec3 c = vec3(0.590, 0.950, 0.950);
//     vec3 d = vec3(0.400, 0.275, 0.275);
//     return palette(t, a, b, c, d);
//   }
const TILES_PALETTE_A = /*#__PURE__*/ vec3(0.2, 0.542, 0.542).toConst()
const TILES_PALETTE_B = /*#__PURE__*/ vec3(0.97, 0.47, 0.43).toConst()
const TILES_PALETTE_C = /*#__PURE__*/ vec3(0.59, 0.95, 0.95).toConst()
const TILES_PALETTE_D = /*#__PURE__*/ vec3(0.4, 0.275, 0.275).toConst()

export const sampleTilesPalette = (t: Node<'float'>) =>
  cosinePalette(t, TILES_PALETTE_A, TILES_PALETTE_B, TILES_PALETTE_C, TILES_PALETTE_D)
