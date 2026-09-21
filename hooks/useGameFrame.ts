import { type FrameTimingState, type RootState, useFrame } from '@react-three/fiber/webgpu'
import { useRef } from 'react'

import { useGameStore } from '@/components/GameProvider'
import { type RapierSimFPS, usePerformanceStore } from '@/components/PerformanceProvider'
import { Overlay } from '@/stores/types'

// R3F v10 supplies frame timing (`elapsed`, `delta`, `frame`) alongside RootState, and no longer
// exposes `clock`. Callers read `state.elapsed` for shader time.
type GameFrameState = RootState & FrameTimingState

// Calls the callback at a target simulation FPS (0 = uncapped).
// - Accumulates real frame time and steps the callback at fixed dt when capped.
// - Limits substeps per render to avoid spiral-of-death on slow frames.
// - Avoids per-frame allocations by reusing refs.
export function useGameFrame(
  callback: (state: GameFrameState, fixedDt: number) => void,
  priority = 0,
) {
  const isOverlayOpen = useGameStore((s) => s.overlay !== Overlay.NONE)

  const simFps = usePerformanceStore((s) => s.simFps)
  const accumulator = useRef(0)
  const maxSubsteps = 5

  useFrame((state, delta) => {
    if (isOverlayOpen) return
    // Uncapped: forward real delta
    if (simFps === 0) {
      callback(state, delta)
      return
    }

    // Fixed-step: accumulate and run at 1/fps increments
    const step = 1 / (simFps as Exclude<RapierSimFPS, 0>)

    // Clamp extremely large deltas (tab switch) to avoid huge catch-up
    const clamped = Math.min(delta, step * maxSubsteps)
    accumulator.current += clamped

    let steps = 0
    while (accumulator.current >= step && steps < maxSubsteps) {
      callback(state, step)
      accumulator.current -= step
      steps++
    }
  }, { priority: priority, fps: undefined, drop: true})
}

export default useGameFrame
