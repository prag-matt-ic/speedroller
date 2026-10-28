'use client'

import { type FC, useEffect, useRef } from 'react'

import { useGameStoreAPI } from '@/components/GameProvider'
import { getRaceTargetSpeed } from '@/utils/platform/raceSpeed'

const UPDATE_INTERVAL_MS = 100
// Movement updates run at the configured simulation FPS; these are the two values that matter for
// the ring-sensor sampling check.
const SAMPLE_FPS = [60, 30] as const

const format = (value: number): string => value.toFixed(2)

/**
 * Developer readout for the automatic race. "Step" is how far one movement update travels at each
 * sample rate: the ring sensor plus the ball overlap is about 0.8 units, so a step above that can
 * skip a ring between updates.
 */
const SpeedProbe: FC = () => {
  const gameStoreAPI = useGameStoreAPI()
  const speedRef = useRef<HTMLSpanElement>(null)
  const ceilingRef = useRef<HTMLSpanElement>(null)
  const boostRef = useRef<HTMLSpanElement>(null)
  const stepRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const update = () => {
      const { playerSpeedUnits, playerBoostUnits } = gameStoreAPI.getState()

      if (speedRef.current) speedRef.current.textContent = format(playerSpeedUnits)
      if (ceilingRef.current) {
        ceilingRef.current.textContent = format(getRaceTargetSpeed(playerBoostUnits))
      }
      if (boostRef.current) boostRef.current.textContent = format(playerBoostUnits)
      if (stepRef.current) {
        stepRef.current.textContent = SAMPLE_FPS.map((fps) =>
          format(playerSpeedUnits / fps),
        ).join(' / ')
      }
    }

    update()
    const intervalId = window.setInterval(update, UPDATE_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [gameStoreAPI])

  return (
    <dl className="fixed right-0 bottom-24 z-5001 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 bg-black p-2 font-mono text-xs text-white">
      <dt className="text-white/60">Speed</dt>
      <dd>
        <span ref={speedRef} /> u/s
      </dd>
      <dt className="text-white/60">Ceiling</dt>
      <dd>
        <span ref={ceilingRef} /> u/s
      </dd>
      <dt className="text-white/60">Boost</dt>
      <dd>
        <span ref={boostRef} /> u/s
      </dd>
      <dt className="text-white/60">Step 60/30</dt>
      <dd>
        <span ref={stepRef} /> u
      </dd>
    </dl>
  )
}

export default SpeedProbe
