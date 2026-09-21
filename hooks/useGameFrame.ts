import { type FrameTimingState, type RootState, useFrame } from '@react-three/fiber/webgpu'

import { useGameStore } from '@/components/GameProvider'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { Overlay } from '@/stores/types'

// R3F v10 supplies frame timing (`elapsed`, `delta`, `frame`) alongside RootState, and no longer
// exposes `clock`. Callers read `state.elapsed` for shader time.
type GameFrameState = RootState & FrameTimingState

// Runs the callback on the shared game frame at the target simulation FPS (0 = uncapped).
// - The scheduler owns the throttle: `fps` skips frames until 1/fps has elapsed and hands the
//   callback the real time since its last run, so callers integrate over wall-clock time instead of
//   a fixed step — a slow frame runs the callback once with the full delta, never a backlog.
// - An open overlay disables the job outright, so paused frames cost nothing.
// - `drop: true` keeps a slow frame from queueing catch-up runs.
export function useGameFrame(
  callback: (state: GameFrameState, delta: number) => void,
  priority = 0,
) {
  const isOverlayOpen = useGameStore((s) => s.overlay !== Overlay.NONE)
  const simFps = usePerformanceStore((s) => s.simFps)

  useFrame(callback, {
    priority,
    fps: simFps === 0 ? undefined : simFps,
    drop: true,
    enabled: !isOverlayOpen,
  })
}

export default useGameFrame
