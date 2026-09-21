import { cameraPosition, float, modelWorldMatrix, smoothstep, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'

import { ELEMENT_PLACEMENT_AHEAD_SPAN, TILE_PLAYER_FADE_FULL_RADIUS } from '@/utils/tiles'

// The fade-in is stated in the frame the row lifecycle is: distance ahead of the player, so it lines
// up with the platform with no camera offset folded in. It runs between the two distances that
// already bound an element's arrival — placed at ELEMENT_PLACEMENT_AHEAD_SPAN, and solid by the time
// the tiles under it are, at TILE_PLAYER_FADE_FULL_RADIUS.
export const FADE_IN_START = TILE_PLAYER_FADE_FULL_RADIUS
export const FADE_IN_END = ELEMENT_PLACEMENT_AHEAD_SPAN

// The fade-out is about the view rather than the track — signage getting out of the way as it
// reaches the lens — so it stays measured from the camera: still opaque FADE_OUT_START away, gone
// within FADE_OUT_END of it.
export const FADE_OUT_START = 8.0
export const FADE_OUT_END = 14.0

const OBJECT_ORIGIN = /*#__PURE__*/ vec4(0, 0, 0, 1).toConst()

/**
 * The world z of the drawn object's own origin.
 *
 * One value for the whole draw, which is the point: sampling `positionWorld.z` fades an element
 * across its own depth, leaving the near edge solid while the far edge is still invisible. Anything
 * parented to a scrolling row body reads that body's z, so nothing has to be plumbed through from
 * the update loop. Instanced draws (and anything whose geometry sits off its anchor) pass their own
 * z instead.
 */
export const objectWorldZ = (): Node<'float'> => modelWorldMatrix.mul(OBJECT_ORIGIN).z

export type FadeInOutOptions = {
  /** Also fade back out on the approach to the camera. Defaults to false. */
  fadeOut?: boolean
  fadeOutStart?: number
  fadeOutEnd?: number
}

/**
 * Distance fade along z: invisible where the platform places a row's elements, opaque by the time
 * the row's tiles are, and — when `fadeOut` is set — back down to nothing within FADE_OUT_END of the
 * camera.
 *
 * The anchor-based default reads the model matrix, so it belongs in the vertex stage: wrap it in
 * `vertexStage()` when the consumer is the fragment stage. An explicit z node is stage-agnostic.
 */
export const fadeInOut = (
  playerZ: Node<'float'>,
  worldZ: Node<'float'> = objectWorldZ(),
  {
    fadeOut = false,
    fadeOutStart = FADE_OUT_START,
    fadeOutEnd = FADE_OUT_END,
  }: FadeInOutOptions = {},
): Node<'float'> => {
  const aheadOfPlayer = playerZ.sub(worldZ)
  const fadeIn = float(1).sub(smoothstep(FADE_IN_START, FADE_IN_END, aheadOfPlayer))

  if (!fadeOut) return fadeIn

  const aheadOfCamera = cameraPosition.z.sub(worldZ)
  return fadeIn.mul(smoothstep(fadeOutStart, fadeOutEnd, aheadOfCamera))
}
