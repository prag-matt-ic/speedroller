import { useEffect, useRef } from 'react'

import { useGameStoreAPI } from '@/components/GameProvider'
import { type PlayerStatus } from '@/stores/types'

export function usePlayerStatus(onStatusChange?: (status: PlayerStatus) => void) {
  const gameStoreAPI = useGameStoreAPI()
  const status = useRef(gameStoreAPI.getState().playerStatus)

  useEffect(() => {
    const unsubscribe = gameStoreAPI.subscribe(
      (state) => state.playerStatus,
      (newStatus) => {
        status.current = newStatus
        onStatusChange?.(newStatus)
      },
    )

    return unsubscribe
  }, [gameStoreAPI, onStatusChange])

  useEffect(() => {
    onStatusChange?.(status.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { status }
}

export default usePlayerStatus
