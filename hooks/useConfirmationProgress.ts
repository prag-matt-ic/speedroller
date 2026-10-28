import { useEffect, useRef } from 'react'

import { useGameStoreAPI } from '@/components/GameProvider'

// Returns a ref to the current normalized confirmation progress [0,1].
// Optionally accepts a callback invoked on changes (and once on mount).
export function useConfirmationProgress(
  onConfirmationProgressChange?: (progress: number) => void,
) {
  const gameStoreAPI = useGameStoreAPI()

  // Capture current value in a ref to avoid re-renders
  const confirmationProgress = useRef(gameStoreAPI.getState().confirmationProgress)

  useEffect(() => {
    // Subscribe to store updates and update ref when confirmationProgress changes
    const unsubscribe = gameStoreAPI.subscribe(
      (s) => s.confirmationProgress,
      (progress) => {
        confirmationProgress.current = progress
        onConfirmationProgressChange?.(progress)
      },
    )
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStoreAPI])

  // Fire once on mount with the current value so consumers can initialize.
  useEffect(() => {
    onConfirmationProgressChange?.(confirmationProgress.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { confirmationProgress }
}
