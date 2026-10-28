import { type CourseSurface, courseToWorld } from './courseSurface'
import { TILE_SIZE, TILE_THICKNESS } from '../tiles'

/** Fixed tile boxes share angular edge vertices, including at the circumference seam. */
export function createSurfaceColliders(positions: readonly (readonly [number, number, number])[], surface: CourseSurface, width = TILE_SIZE, height = TILE_THICKNESS, depth = TILE_SIZE) {
  const vertices = new Float32Array(positions.length * 8 * 3)
  const indices = new Uint32Array(positions.length * 36)
  const target = { x: 0, y: 0, z: 0 }
  const boxTriangles = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]
  positions.forEach(([x, y, z], instance) => {
    for (let corner = 0; corner < 8; corner++) {
      courseToWorld(
        x + ((corner & 1) ? 1 : -1) * width / 2,
        y + ((corner & 2) ? 1 : -1) * height / 2,
        z + ((corner & 4) ? 1 : -1) * depth / 2,
        surface, target,
      )
      const offset = (instance * 8 + corner) * 3
      vertices[offset] = target.x; vertices[offset + 1] = target.y; vertices[offset + 2] = target.z
    }
    for (let index = 0; index < boxTriangles.length; index++) indices[instance * 36 + index] = instance * 8 + boxTriangles[index]
  })
  return { vertices, indices }
}
