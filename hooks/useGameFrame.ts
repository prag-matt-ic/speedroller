import { type FrameTimingState, type WebGPURootState, useFrame } from '@react-three/fiber'

import { useGameStore } from '@/components/GameProvider'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { Overlay } from '@/stores/types'

// R3F v10 supplies frame timing (`elapsed`, `delta`, `frame`) alongside the WebGPU root state, and
// no longer exposes `clock`. Callers read `state.elapsed` for shader time.
type GameFrameState = WebGPURootState & FrameTimingState

// Runs the callback on the shared game frame at the target simulation FPS (0 = uncapped).
// - `priority` follows v10's direction: higher runs earlier within the update phase.
// - The scheduler owns the throttle: `fps` skips frames until 1/fps has elapsed and hands the
//   callback the real time since its last run, so callers integrate over wall-clock time instead of
//   a fixed step — a slow frame runs the callback once with the full delta, never a backlog.
// - Modal overlays pause jobs; the non-modal spectator controls keep the scene live.
// - `drop: true` keeps a slow frame from queueing catch-up runs.
export function useGameFrame(
  callback: (state: GameFrameState, delta: number) => void,
  priority = 0,
) {
  const isOverlayOpen = useGameStore((s) => s.overlay !== Overlay.NONE && s.overlay !== Overlay.SPECTATING)
  const simFps = usePerformanceStore((s) => s.simFps)

  useFrame(callback, {
    priority,
    fps: simFps === 0 ? undefined : simFps,
    drop: true,
    enabled: !isOverlayOpen,
  })
}

export default useGameFrame
