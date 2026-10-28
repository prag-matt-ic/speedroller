import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { Float32BufferAttribute, Vector3 } from 'three/webgpu'

const BLOCK_BEVEL_RADIUS = 0.01
const MIN_SHADE = 0.72
const LIGHT_DIRECTION = new Vector3(-0.4, 0.85, 0.35).normalize()

export function createStoneBlockGeometry() {
  const geometry = new RoundedBoxGeometry(1, 1, 1, 1, BLOCK_BEVEL_RADIUS)
  const normals = geometry.getAttribute('normal')
  const shades = new Float32Array(normals.count)
  const normal = new Vector3()
  for (let index = 0; index < normals.count; index++) {
    normal.fromBufferAttribute(normals, index)
    // Local normals keep the baked light consistent as instances wrap around the course.
    shades[index] = MIN_SHADE + (1 - MIN_SHADE) * Math.max(0, normal.dot(LIGHT_DIRECTION))
  }
  geometry.setAttribute('stoneShade', new Float32BufferAttribute(shades, 1))
  return geometry
}
