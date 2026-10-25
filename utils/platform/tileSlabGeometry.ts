import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

import { TILE_SIZE, TILE_THICKNESS } from '../tiles'

export const TILE_SLAB_DEPTH = 0.18
export const TILE_JOINT_WIDTH = 0.02
export const TILE_BEVEL_WIDTH = 0.008
export const TILE_RECESS_DEPTH = 0.025
export const TILE_SLAB_RADIUS = Math.hypot(TILE_SIZE / 2, TILE_SIZE / 2,
  Math.max(TILE_THICKNESS / 2, TILE_SLAB_DEPTH - TILE_THICKNESS / 2))

/** One closed slab, pivoted at the existing collider centre. Surface: graphite=0, ivory=1, top=2. */
export function createTileSlabGeometry() {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], surfaces: number[] = []
  const topY = TILE_THICKNESS / 2
  const ivoryHalf = (TILE_SIZE - TILE_JOINT_WIDTH) / 2
  const topHalf = ivoryHalf - TILE_BEVEL_WIDTH
  const ring = (half: number, y: number) => [
    new Vector3(-half, y, half), new Vector3(half, y, half),
    new Vector3(half, y, -half), new Vector3(-half, y, -half),
  ]
  const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3, surface: number) => {
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize()
    for (const point of [a, b, c, a, c, d]) {
      positions.push(point.x, point.y, point.z)
      normals.push(normal.x, normal.y, normal.z)
      uvs.push(Math.max(0, Math.min(1, point.x / (2 * topHalf) + 0.5)),
        Math.max(0, Math.min(1, 0.5 - point.z / (2 * topHalf))))
      surfaces.push(surface)
    }
  }
  const rings = [ring(topHalf, topY), ring(ivoryHalf, topY - TILE_BEVEL_WIDTH),
    ring(ivoryHalf, topY - TILE_RECESS_DEPTH), ring(TILE_SIZE / 2, topY - TILE_RECESS_DEPTH),
    ring(TILE_SIZE / 2, topY - TILE_SLAB_DEPTH)]
  quad(...rings[0] as [Vector3, Vector3, Vector3, Vector3], 2)
  for (let level = 0; level < rings.length - 1; level++) {
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4
      quad(rings[level][side], rings[level + 1][side], rings[level + 1][next], rings[level][next], level < 2 ? 1 : 0)
    }
  }
  quad(rings[4][3], rings[4][2], rings[4][1], rings[4][0], 0)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('slabSurface', new Float32BufferAttribute(surfaces, 1))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
