import { atan, cos, float, length, sin, vec2, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'

import { type CourseSurface, surfaceRadius } from '@/utils/platform/courseSurface'
import { TILE_SURFACE_Y } from '@/utils/tiles'

export function coursePositionNode(position: Node<'vec3'>, surface: CourseSurface): Node<'vec3'> {
  if (surface.topology === 'flat') return position
  const radius = surfaceRadius(surface)
  const angle = position.x.div(radius)
  const distance = float(radius + TILE_SURFACE_Y).sub(position.y)
  return vec3(sin(angle).mul(distance), float(radius + TILE_SURFACE_Y).sub(cos(angle).mul(distance)), position.z)
}

export function courseNormalNode(normal: Node<'vec3'>, courseX: Node<'float'>, surface: CourseSurface): Node<'vec3'> {
  if (surface.topology === 'flat') return normal
  const angle = courseX.div(surfaceRadius(surface))
  return vec3(normal.x.mul(cos(angle)).sub(normal.y.mul(sin(angle))), normal.x.mul(sin(angle)).add(normal.y.mul(cos(angle))), normal.z)
}

export function worldCourseNode(position: Node<'vec3'>, surface: CourseSurface): Node<'vec3'> {
  if (surface.topology === 'flat') return position
  const radius = surfaceRadius(surface)
  const radialY = float(radius + TILE_SURFACE_Y).sub(position.y)
  return vec3(atan(position.x, radialY).mul(radius), float(radius + TILE_SURFACE_Y).sub(length(vec2(position.x, radialY))), position.z)
}
