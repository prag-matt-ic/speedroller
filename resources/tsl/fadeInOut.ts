import { cameraPosition, float, modelWorldMatrix, smoothstep, vec4 } from 'three/tsl'
import type { Node } from 'three/webgpu'

import {
  FADE_OUT_START,
  FADE_OUT_END,
  TILE_PLAYER_FADE_FULL_RADIUS,
  TILE_PLAYER_FADE_MIN_RADIUS,
} from '@/utils/sceneDistances'

const OBJECT_ORIGIN = /*#__PURE__*/ vec4(0, 0, 0, 1).toConst()

/**
 * The world z of the drawn object's own origin.
 *
 * One value for the whole draw, which is the point: sampling `positionWorld.z` fades an element
 * across its own depth, leaving the near edge solid while the far edge is still invisible. Anything
 * parented to a fixed row body reads that body's z. Instanced draws (and anything whose geometry sits off its anchor) pass their own
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
 * Distance fade along z: invisible beyond the reveal distance, opaque by the time
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
  const fadeIn = float(1).sub(smoothstep(TILE_PLAYER_FADE_FULL_RADIUS, TILE_PLAYER_FADE_MIN_RADIUS, aheadOfPlayer))

  if (!fadeOut) return fadeIn

  const aheadOfCamera = cameraPosition.z.sub(worldZ)
  return fadeIn.mul(smoothstep(fadeOutStart, fadeOutEnd, aheadOfCamera))
}
