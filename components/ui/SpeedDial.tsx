'use client'

import { type FC, useCallback, useEffect, useRef } from 'react'
import { twMerge } from 'tailwind-merge'

import usePlayerSpeed from '@/hooks/usePlayerSpeed'
import { RACE_MAX_SPEED } from '@/utils/platform/raceSpeed'

type SpeedDialProps = {
  /** Static fill fraction for illustrations; the live dial follows the player's speed. */
  progressOverride?: number
  strokeWidth?: number
  className?: string
}

const DIAL_PATH =
  'M8.31278 30.9407C6.07514 28.703 4.55129 25.8521 3.93393 22.7484C3.31656 19.6447 3.63342 16.4276 4.84442 13.504C6.05542 10.5804 8.10618 8.08154 10.7374 6.32344C13.3686 4.56534 16.462 3.62695 19.6265 3.62695C22.791 3.62695 25.8844 4.56534 28.5156 6.32344C31.1468 8.08154 33.1976 10.5804 34.4086 13.504C35.6196 16.4276 35.9364 19.6447 35.3191 22.7484C34.7017 25.8521 33.1778 28.703 30.9402 30.9407'
/** Author-normalised path length: the SVG maps the real arc onto this value for dash drawing. */
const DIAL_LENGTH = 100
/** Gap longer than the path so an empty dial draws no stray round cap at the arc end. */
const DIAL_DASHARRAY = `${DIAL_LENGTH} ${DIAL_LENGTH * 2}`

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const getSpeedFraction = (speedUnits: number) => clamp01(Math.max(0, speedUnits) / RACE_MAX_SPEED)
const formatSpeed = (speedUnits: number) => `${Math.round(Math.max(0, speedUnits))}`

export const SpeedDial: FC<SpeedDialProps> = ({ progressOverride, strokeWidth = 5, className }) => {
  const pathRef = useRef<SVGPathElement | null>(null)
  const speedTextRef = useRef<HTMLSpanElement | null>(null)
  const targetSpeedUnits = useRef(0)
  const hasProgressOverride = progressOverride !== undefined

  const applyDraw = useCallback(() => {
    const path = pathRef.current
    if (!path) return

    const progress = hasProgressOverride
      ? clamp01(progressOverride)
      : getSpeedFraction(targetSpeedUnits.current)
    path.style.strokeDashoffset = `${DIAL_LENGTH * (1 - progress)}`

    const speedText = speedTextRef.current
    if (!speedText) return
    const displayedSpeed = formatSpeed(targetSpeedUnits.current)
    if (speedText.textContent !== displayedSpeed) speedText.textContent = displayedSpeed
  }, [hasProgressOverride, progressOverride])

  const onPlayerSpeedChange = useCallback(
    (speedUnits: number) => {
      if (hasProgressOverride) return
      targetSpeedUnits.current = speedUnits
      applyDraw()
    },
    [applyDraw, hasProgressOverride],
  )

  const { speedUnits } = usePlayerSpeed(onPlayerSpeedChange)

  useEffect(() => {
    if (progressOverride === undefined) return
    applyDraw()
  }, [applyDraw, progressOverride])

  return (
    <div
      className={twMerge(
        'relative flex size-14 items-center justify-center rounded-full border border-white/15 bg-black/70 shadow-lg',
        className,
      )}>
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className="size-full">
        <path d={DIAL_PATH} stroke="#ffffff4d" strokeWidth={strokeWidth} strokeLinecap="round" />
        <path
          ref={pathRef}
          d={DIAL_PATH}
          pathLength={DIAL_LENGTH}
          strokeDasharray={DIAL_DASHARRAY}
          strokeDashoffset={DIAL_LENGTH}
          stroke="url(#speed-dial-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]"
        />
        <defs>
          <linearGradient
            id="speed-dial-gradient"
            x1="4"
            y1="20"
            x2="36"
            y2="20"
            gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" />
            <stop offset="1" stopColor="#fcd34d" />
          </linearGradient>
        </defs>
      </svg>

      {!hasProgressOverride && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex items-baseline gap-0.5">
            <span
              ref={speedTextRef}
              className="font-mono text-3xl leading-none font-bold text-white tabular-nums xl:text-4xl">
              {formatSpeed(speedUnits.current)}
            </span>
            <span className="font-mono text-[10px] leading-none font-semibold text-white/50 xl:text-xs">
              /{RACE_MAX_SPEED}
            </span>
          </div>
          <span className="mt-1 text-[9px] leading-none font-semibold tracking-[0.2em] text-amber-200/80 uppercase xl:text-[10px]">
            Speed
          </span>
        </div>
      )}
    </div>
  )
}

export default SpeedDial
