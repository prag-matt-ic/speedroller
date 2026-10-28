import { useEffect, useRef } from 'react'

import { type PlayerInput, useGameStoreAPI } from '@/components/GameProvider'

export function usePlayerInput(onInputChange?: (input: PlayerInput) => void) {
  const gameStoreAPI = useGameStoreAPI()
  const input = useRef(gameStoreAPI.getState().playerInput)

  useEffect(() => {
    const unsubscribe = gameStoreAPI.subscribe(
      (s) => s.playerInput,
      (newInput) => {
        input.current = newInput
        onInputChange?.(newInput)
      },
    )

    return unsubscribe
  }, [gameStoreAPI, onInputChange])

  useEffect(() => {
    onInputChange?.(input.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { input }
}

export function usePlayerInputIntent(onChange?: (input: PlayerInput) => void) {
  const gameStoreAPI = useGameStoreAPI()
  const inputIntent = useRef(gameStoreAPI.getState().playerInputIntent)

  useEffect(() => {
    const unsubscribe = gameStoreAPI.subscribe(
      (s) => s.playerInputIntent,
      (newInput) => {
        inputIntent.current = newInput
        onChange?.(newInput)
      },
    )

    return unsubscribe
  }, [gameStoreAPI, onChange])

  useEffect(() => {
    onChange?.(inputIntent.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { inputIntent }
}
