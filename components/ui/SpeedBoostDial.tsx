'use client'

import { type FC, useCallback, useEffect, useRef } from 'react'
import { twMerge } from 'tailwind-merge'

import usePlayerSpeed from '@/hooks/usePlayerSpeed'
import { PLAYER_SPEED_BASE, PLAYER_SPEED_MAX } from '@/stores/playerSlice'

type SpeedBoostDialProps = {
  progressOverride?: number
  strokeWidth?: number
  className?: string
}

export const SpeedBoostDial: FC<SpeedBoostDialProps> = ({
  progressOverride,
  strokeWidth = 5,
  className,
}) => {
  const pathRef = useRef<SVGPathElement | null>(null)
  const pathLength = useRef(0)
  const targetProgress = useRef(0)
  const pendingFrame = useRef<number | null>(null)
  const hasProgressOverride = progressOverride !== undefined

  const applyDraw = useCallback(() => {
    pendingFrame.current = null
    const path = pathRef.current
    if (!path) return

    const length = pathLength.current
    const drawLength = length * targetProgress.current
    path.style.strokeDashoffset = `${length - drawLength}`
  }, [])

  const scheduleDraw = useCallback(() => {
    if (pendingFrame.current !== null) return
    pendingFrame.current = requestAnimationFrame(applyDraw)
  }, [applyDraw])

  const onPlayerSpeedChange = useCallback(
    (speed: number) => {
      if (hasProgressOverride) return
      const speedBoost = speed - PLAYER_SPEED_BASE
      const maxBoost = PLAYER_SPEED_MAX - PLAYER_SPEED_BASE
      targetProgress.current = clamp01(maxBoost > 0 ? speedBoost / maxBoost : 0)
      scheduleDraw()
    },
    [hasProgressOverride, scheduleDraw],
  )

  usePlayerSpeed(onPlayerSpeedChange)

  useEffect(() => {
    const path = pathRef.current
    if (!path) return

    const length = path.getTotalLength()
    pathLength.current = length
    path.style.strokeDasharray = `${length} ${length}`
    path.style.strokeDashoffset = `${length}`

    return () => {
      if (pendingFrame.current !== null) {
        cancelAnimationFrame(pendingFrame.current)
        pendingFrame.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (progressOverride === undefined) return
    targetProgress.current = clamp01(progressOverride)
    applyDraw()
  }, [applyDraw, progressOverride])

  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twMerge('size-14', className)}>
      <g clipPath="url(#clip0_1259_7128)">
        <path
          d="M8.31278 30.9407C6.07514 28.703 4.55129 25.8521 3.93393 22.7484C3.31656 19.6447 3.63342 16.4276 4.84442 13.504C6.05542 10.5804 8.10618 8.08154 10.7374 6.32344C13.3686 4.56534 16.462 3.62695 19.6265 3.62695C22.791 3.62695 25.8844 4.56534 28.5156 6.32344C31.1468 8.08154 33.1976 10.5804 34.4086 13.504C35.6196 16.4276 35.9364 19.6447 35.3191 22.7484C34.7017 25.8521 33.1778 28.703 30.9402 30.9407"
          stroke="#ffffff4d"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          ref={pathRef}
          d="M8.31278 30.9407C6.07514 28.703 4.55129 25.8521 3.93393 22.7484C3.31656 19.6447 3.63342 16.4276 4.84442 13.504C6.05542 10.5804 8.10618 8.08154 10.7374 6.32344C13.3686 4.56534 16.462 3.62695 19.6265 3.62695C22.791 3.62695 25.8844 4.56534 28.5156 6.32344C31.1468 8.08154 33.1976 10.5804 34.4086 13.504C35.6196 16.4276 35.9364 19.6447 35.3191 22.7484C34.7017 25.8521 33.1778 28.703 30.9402 30.9407"
          stroke="url(#speed-boost-dial-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </g>
      <defs>
        <linearGradient
          id="speed-boost-dial-gradient"
          x1="4"
          y1="20"
          x2="36"
          y2="20"
          gradientUnits="userSpaceOnUse">
          <stop stopColor="#fbbf24" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <clipPath id="clip0_1259_7128">
          <rect width="40" height="40" fill="none" />
        </clipPath>
      </defs>
    </svg>
  )
}

export default SpeedBoostDial

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}
