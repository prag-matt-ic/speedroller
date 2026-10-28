import { type RefObject, useEffect, useRef } from 'react'

import { Stage, useGameStoreAPI } from '@/components/GameProvider'

type StageChangeHandler = (nextStage: Stage, previousStage: Stage) => void

export function useStage(onStageChange?: StageChangeHandler): RefObject<Stage> {
  const gameStoreAPI = useGameStoreAPI()
  const stage = useRef<Stage>(gameStoreAPI.getState().stage)
  const prevStage = useRef<Stage>(stage.current)

  useEffect(() => {
    const unsubscribe = gameStoreAPI.subscribe(
      (state) => state.stage,
      (nextStage, previousStage) => {
        prevStage.current = previousStage
        stage.current = nextStage
        onStageChange?.(nextStage, previousStage)
      },
    )

    return unsubscribe
  }, [gameStoreAPI, onStageChange])

  useEffect(() => {
    onStageChange?.(stage.current, prevStage.current)
    // Fire only once on mount so consumers can initialize immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return stage
}

export default useStage
