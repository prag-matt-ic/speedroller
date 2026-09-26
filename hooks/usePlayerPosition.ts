import { useEffect, useRef } from 'react'
import { type Vector3Tuple } from 'three'

import { useGameStoreAPI } from '@/components/GameProvider'

export function usePlayerPosition(onPlayerPositionChange?: (pos: Vector3Tuple) => void) {
  const gameStoreAPI = useGameStoreAPI()

  // Capture current value in a ref to avoid re-renders
  const playerPosition = useRef<Vector3Tuple>(gameStoreAPI.getState().playerPosition)

  useEffect(() => {
    // Subscribe to store updates and update ref only when playerPosition changes
    const unsubscribe = gameStoreAPI.subscribe(
      (s) => s.playerPosition,
      (newPosition) => {
        const [newX, newY, newZ] = newPosition
        const [prevX, prevY, prevZ] = playerPosition.current

        if (newX === prevX && newY === prevY && newZ === prevZ) return

        playerPosition.current = newPosition
        onPlayerPositionChange?.(newPosition)
      },
    )

    return unsubscribe
  }, [gameStoreAPI, onPlayerPositionChange])

  // Fire once on mount so consumers can initialize uniforms/refs immediately.
  useEffect(() => {
    onPlayerPositionChange?.(playerPosition.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { playerPosition }
}
