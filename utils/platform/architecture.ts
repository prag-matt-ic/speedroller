import type { Vector3Tuple } from 'three'

export type PillarPlacement = {
  id: string
  module: 'pillar'
  /** Bottom centre; model origins use this anchor when replacing the cuboid. */
  position: Vector3Tuple
  dimensions: Vector3Tuple
  /** Shared tangent frame for assembled structures on the cylinder. */
  frameX?: number
  distance: number
}
