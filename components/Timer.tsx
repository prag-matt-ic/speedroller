'use client'

import { type FC, useEffect } from 'react'

import { useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { SpeedRunStage } from '@/stores/types'

const TOTAL_TIME_INTERVAL_MS = 1000
const SPEED_RUN_DISPLAY_INTERVAL_MS = 50
const MILLISECONDS_PER_CENTISECOND = 10

const Timer: FC = () => {
  const isSpeedRunTiming = useGameStore(
    (s) => s.speedRunStage === SpeedRunStage.RUNNING,
  )
  const attemptStartedAtMs = useGameStore((s) => s.attemptStartedAtMs)
  const _isHydrated = useGameStore((s) => s._isHydrated)
  const gameStoreAPI = useGameStoreAPI()

  useEffect(() => {
    if (!_isHydrated) return

    let previous = Date.now()
    const intervalId = window.setInterval(() => {
      const now = Date.now()
      const deltaSeconds = (now - previous) / 1000
      previous = now
      gameStoreAPI.setState((s) => ({
        totalTimeS: s.totalTimeS + deltaSeconds,
      }))
    }, TOTAL_TIME_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [gameStoreAPI, _isHydrated])

  // The display refreshes from a monotonic origin, so hidden tabs and menus cannot drift the
  // clock. The exact finish time is captured again in `finishSpeedRun`.
  useEffect(() => {
    if (!isSpeedRunTiming || attemptStartedAtMs === null) return

    const updateDisplayedTime = () => {
      const elapsedCentiseconds = Math.floor(
        (performance.now() - attemptStartedAtMs) / MILLISECONDS_PER_CENTISECOND,
      )
      gameStoreAPI.setState({ speedRunTimeCS: Math.max(0, elapsedCentiseconds) })
    }

    updateDisplayedTime()
    const intervalId = window.setInterval(
      updateDisplayedTime,
      SPEED_RUN_DISPLAY_INTERVAL_MS,
    )

    return () => window.clearInterval(intervalId)
  }, [attemptStartedAtMs, gameStoreAPI, isSpeedRunTiming])

  return null
}

export default Timer
