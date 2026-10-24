import { useEffect, useRef } from 'react'

import { useGameStoreAPI } from '@/components/GameProvider'

/**
 * Subscribes to the ring-boost allowance the player publishes for UI. The value is the speed
 * allowed above cruise in units per second, so a dial driving it shows the boost itself rather
 * than the total speed.
 */
export function usePlayerBoost(onBoostChange?: (boostUnits: number) => void) {
  const gameStoreAPI = useGameStoreAPI()
  const boostUnits = useRef(gameStoreAPI.getState().playerBoostUnits)

  useEffect(() => {
    const unsubscribe = gameStoreAPI.subscribe(
      (state) => state.playerBoostUnits,
      (newBoostUnits) => {
        boostUnits.current = newBoostUnits
        onBoostChange?.(newBoostUnits)
      },
    )

    return unsubscribe
  }, [gameStoreAPI, onBoostChange])

  useEffect(() => {
    onBoostChange?.(boostUnits.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { boostUnits }
}

export default usePlayerBoost
