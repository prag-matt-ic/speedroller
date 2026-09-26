import { float, fwidth, max, Fn,smoothstep, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'

import { sdBox } from '@/resources/tsl/sdBox'

// Port of resources/glsl/paintCorners.glsl (which itself glslifies sdBox.glsl).
//
// Corner-bracket mask utility. The GLSL defines `computeFwidth(v)` as
// `abs(dFdx(v)) + abs(dFdy(v))`; TSL's `fwidth` is exactly that, so the helper collapses away.

const MIN_AA = 1e-4

export const paintCorners = /*#__PURE__*/ Fn(
  ([
    heightSpacePosition,
    aspect,
    tileCounts,
    borderThicknessTiles,
    cornerLengthTiles,
  ]: readonly [
    heightSpacePosition: Node<'vec2'>,
    aspect: Node<'float'>,
    tileCounts: Node<'vec2'>,
    borderThicknessTiles: Node<'float'>,
    cornerLengthTiles: Node<'float'>,
  ]) => {
    const outerBounds = vec2(aspect.mul(0.5), 0.5).toVar()
    const tilesHalf = max(tileCounts.mul(0.5), vec2(MIN_AA)).toVar()
    const tilesPerUnit = tilesHalf.div(outerBounds).toVar()
    const borderThickness = max(
      vec2(borderThicknessTiles).div(tilesPerUnit),
      vec2(0),
    ).toVar()
    const innerBounds = outerBounds.sub(borderThickness).toVar()

    const dInner = sdBox(heightSpacePosition, innerBounds)
    const aa = fwidth(dInner)
    const borderMask = smoothstep(float(0), aa, dInner).toVar()

    const distToEdge = tilesHalf.sub(heightSpacePosition.abs().mul(tilesPerUnit)).toVar()
    const distAA = vec2(
      max(fwidth(distToEdge.x), MIN_AA),
      max(fwidth(distToEdge.y), MIN_AA),
    ).toVar()
    const edgeMask = float(1)
      .sub(
        smoothstep(
          vec2(borderThicknessTiles),
          vec2(borderThicknessTiles).add(distAA),
          distToEdge,
        ),
      )
      .toVar()

    const cornerLengths = vec2(cornerLengthTiles).toVar()
    const clampedDist = max(distToEdge, vec2(0)).toVar()
    const lengthMask = float(1)
      .sub(smoothstep(cornerLengths, cornerLengths.add(distAA), clampedDist))
      .toVar()

    const horizontalBracket = edgeMask.y.mul(lengthMask.x)
    const verticalBracket = edgeMask.x.mul(lengthMask.y)
    const cornerBrackets = max(horizontalBracket, verticalBracket)

    return borderMask.mul(cornerBrackets)
  },
).setLayout({
  name: 'paintCorners',
  type: 'float',
  inputs: [
    { name: 'heightSpacePosition', type: 'vec2', qualifier: 'in' },
    { name: 'aspect', type: 'float', qualifier: 'in' },
    { name: 'tileCounts', type: 'vec2', qualifier: 'in' },
    { name: 'borderThicknessTiles', type: 'float', qualifier: 'in' },
    { name: 'cornerLengthTiles', type: 'float', qualifier: 'in' },
  ],
})
