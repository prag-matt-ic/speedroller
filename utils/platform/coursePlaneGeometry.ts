import { PlaneGeometry, Vector3 } from 'three'

import { type CourseSurface, courseToWorld, surfaceRadius } from './courseSurface'

/** World X/Y, local Z: mount at [0, 0, z] so object-distance fades still use the real row. */
export function createCoursePlaneGeometry(width: number, depth: number, x: number, y: number, surface: CourseSurface, widthSegments = Math.max(1, Math.ceil(width * 2))) {
  const geometry = new PlaneGeometry(width, depth, widthSegments, 1)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.getAttribute('position')
  const point = new Vector3()
  for (let index = 0; index < positions.count; index++) {
    courseToWorld(x + positions.getX(index), y, positions.getZ(index), surface, point)
    positions.setXYZ(index, point.x, point.y, point.z)
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/** Curved floor panel in the local XY plane of a surface-aligned object. */
export function createLocalCoursePanelGeometry(width: number, depth: number, x: number, y: number, surface: CourseSurface) {
  const geometry = createCoursePlaneGeometry(width, depth, x, y, surface)
  const centre = courseToWorld(x, y, 0, surface, new Vector3())
  const angle = surface.topology === 'cylinder' ? x / surfaceRadius(surface) : 0
  geometry.translate(-centre.x, -centre.y, 0)
  geometry.rotateZ(-angle)
  geometry.rotateX(Math.PI / 2)
  return geometry
}
