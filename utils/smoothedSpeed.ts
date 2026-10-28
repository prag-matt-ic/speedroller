import { type RefObject } from 'react'

export const SPEED_SMOOTH_HALF_LIFE = 0.5

export function stepSmoothedSpeed(
  smoothedSpeed: RefObject<number>,
  targetSpeed: number,
  deltaTime: number,
  halfLife = SPEED_SMOOTH_HALF_LIFE,
): number {
  const smoothingFactor = 1 - Math.exp(-deltaTime / halfLife)
  smoothedSpeed.current += (targetSpeed - smoothedSpeed.current) * smoothingFactor
  return smoothedSpeed.current
}
