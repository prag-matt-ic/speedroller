import { useEffect, useRef } from 'react'

import { useGameStoreAPI } from '@/components/GameProvider'

export function usePlayerSpeed(onSpeedChange?: (speedUnits: number) => void) {
  const gameStoreAPI = useGameStoreAPI()
  const speedUnits = useRef(gameStoreAPI.getState().playerSpeedUnits)

  useEffect(() => {
    const unsubscribe = gameStoreAPI.subscribe(
      (state) => state.playerSpeedUnits,
      (newSpeedUnits) => {
        speedUnits.current = newSpeedUnits
        onSpeedChange?.(newSpeedUnits)
      },
    )

    return unsubscribe
  }, [gameStoreAPI, onSpeedChange])

  useEffect(() => {
    onSpeedChange?.(speedUnits.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { speedUnits }
}

export default usePlayerSpeed
