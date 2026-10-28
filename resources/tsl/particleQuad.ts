import { float, smoothstep, uv } from 'three/tsl'
import type { Node } from 'three/webgpu'

// Shared fragment maths for the two particle systems.
//
// Both were `<points>` with `gl_PointCoord` in the GLSL. WebGPU only rasterises point primitives
// at one pixel, so three's own PointsNodeMaterial docs direct sized points to sprites/instancing.
// The emitters therefore render instanced unit quads, and `gl_PointCoord` becomes the quad's own
// uv with the radial mask widened from the [-0.5, 0.5] point space to the [0, 1] uv space.
const QUAD_UV_CENTER = 0.5
const POINT_SPACE_RADIUS = 0.5

export type SoftCircleOptions = {
  /** Unit-space radius of the hard core, as in the GLSL's `0.5 - softEdge * 0.5`. */
  hardRadius: Node<'float'>
}

/**
 * Port of the fragment mask shared by point.frag and confettiPoint.frag:
 * `1.0 - smoothstep(hardRadius, 0.5, length(gl_PointCoord - 0.5))`.
 *
 * `hardRadius` is authored against the GLSL's 0.5-radius point space. The quad's centred uv spans
 * 0..1, so point space maps to uv space by scaling the radius by 2: the 0.5 point-space edge
 * becomes 1.0 in uv space.
 */
export const softCircleMask = ({ hardRadius }: SoftCircleOptions): Node<'float'> => {
  const centredDistance = uv().sub(QUAD_UV_CENTER).length()
  const scaledHardRadius = hardRadius.mul(2)

  return float(1).sub(smoothstep(scaledHardRadius, float(1), centredDistance))
}

/** Convenience for the common `hardRadius = 0.5 - softEdge * 0.5` shape used by both emitters. */
export const softEdgeRadius = (softEdge: Node<'float'>): Node<'float'> =>
  float(POINT_SPACE_RADIUS).sub(softEdge.mul(POINT_SPACE_RADIUS))
