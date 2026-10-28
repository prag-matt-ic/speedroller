import { abs, float, mix, smoothstep, step } from 'three/tsl'
import type { Node } from 'three/webgpu'

import { GHOST_DROP_DEPTH, GHOST_DROP_END, GHOST_DROP_START, GHOST_ROTATION_MAX } from '@/utils/platform/ghostTiles'

/** Tile-centre distance keeps each slab rigid and gives every speed the same clear approach. */
export function ghostTileMotion(ahead: Node<'float'>, isGhost: Node<'float'>, signedNoise: Node<'float'>) {
  const progress = float(1).sub(smoothstep(GHOST_DROP_END, GHOST_DROP_START, ahead)).mul(isGhost)
  return {
    offsetY: progress.mul(progress).mul(-GHOST_DROP_DEPTH),
    angle: progress.mul(GHOST_ROTATION_MAX)
      .mul(mix(0.5, 1, abs(signedNoise)))
      .mul(mix(-1, 1, step(0, signedNoise))),
    opacity: float(1).sub(smoothstep(0.65, 1, progress)),
  }
}
