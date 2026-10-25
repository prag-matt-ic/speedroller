import { useGameStore } from '@/components/GameProvider'

export function useCourseSurface() {
  return useGameStore(state => state.courseSurface)
}
