import { useCallback, useRef } from 'react'
import { Vector3, type Vector3Tuple } from 'three'

import { worldToCourse } from '@/utils/platform/courseSurface'

import { useCourseSurface } from './useCourseSurface'
import { usePlayerPosition } from './usePlayerPosition'

/** Bitmap coordinates derived from the world-position subscription, without React updates. */
export function usePlayerCoursePosition() {
  const surface = useCourseSurface()
  const playerPosition = useRef<Vector3Tuple>([0, 0, 0])
  const position = useRef(new Vector3())
  const update = useCallback((world: Vector3Tuple) => {
    position.current.fromArray(world)
    worldToCourse(position.current, surface, position.current)
    position.current.toArray(playerPosition.current)
  }, [surface])
  usePlayerPosition(update)
  return { playerPosition }
}
