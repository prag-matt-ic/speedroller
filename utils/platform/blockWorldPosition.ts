import type { PillarPlacement } from './architecture'
import { courseToWorld, surfaceRadius, type CourseSurface } from './courseSurface'

export function blockWorldPosition(block: PillarPlacement, surface: CourseSurface, target: { x: number; y: number; z: number }) {
  const [x, y, z] = block.position
  const frameX = block.frameX ?? x
  courseToWorld(frameX, y + block.dimensions[1] / 2, z, surface, target)
  const angle = surface.topology === 'cylinder' ? frameX / surfaceRadius(surface) : 0
  target.x += (x - frameX) * Math.cos(angle)
  target.y += (x - frameX) * Math.sin(angle)
  return target
}
