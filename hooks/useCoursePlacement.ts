import { useMemo } from 'react'
import { Euler, Vector3, type Vector3Tuple } from 'three'

import { courseToWorld, surfaceRadius } from '@/utils/platform/courseSurface'

import { useCourseSurface } from './useCourseSurface'

/** Static placement: children retain their own local geometry and orientation. */
export function useCoursePlacement(position: Vector3Tuple, rotationX = 0) {
  const surface = useCourseSurface()
  const [x, y, z] = position
  return useMemo(() => ({
    position: courseToWorld(x, y, z, surface, new Vector3()) as Vector3,
    rotation: new Euler(rotationX, 0, surface.topology === 'cylinder' ? x / surfaceRadius(surface) : 0, 'ZYX'),
  }), [x, y, z, surface, rotationX])
}
