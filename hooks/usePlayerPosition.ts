import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useOptionalMultiplayer } from '@/components/multiplayer/MultiplayerProvider'
import { type Vector3Tuple } from 'three'

import { useGameStoreAPI } from '@/components/GameProvider'

export function usePlayerPosition(onPlayerPositionChange?: (pos: Vector3Tuple) => void) {
  const gameStoreAPI = useGameStoreAPI()
  const multiplayer = useOptionalMultiplayer()

  // Capture current value in a ref to avoid re-renders
  const playerPosition = useRef<Vector3Tuple>(gameStoreAPI.getState().playerPosition)

  useEffect(() => {
    // Subscribe to store updates and update ref only when playerPosition changes
    const unsubscribe = gameStoreAPI.subscribe(
      (s) => s.playerPosition,
      (newPosition) => {
        if (gameStoreAPI.getState().isSpectating) return
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

  useFrame(() => {
    if (!gameStoreAPI.getState().isSpectating) return
    const session = multiplayer?.session
    const followId = session?.store.getState().followId
    const pose = followId ? session?.getRenderedPose(followId) : undefined
    playerPosition.current = pose?.latest ? pose.position : gameStoreAPI.getState().playerPosition
    onPlayerPositionChange?.(playerPosition.current)
  }, -90)

  return { playerPosition }
}
