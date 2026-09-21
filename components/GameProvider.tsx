'use client'
import { type FC, type PropsWithChildren, createContext, useContext, useState } from 'react'
import { useStore } from 'zustand'

import { useSoundStore } from '@/components/SoundProvider'
import type { InsertSpeedRunResponse, ServerSpeedRunSubmission } from '@/model/schema'
import { createGameStore } from '@/stores/createGameStore'
import type { GameStore } from '@/stores/types'

export {
  Stage,
  type PlayerInput,
  type HudIndicatorConfig,
  type RingIndex,
} from '@/stores/types'

export { PLAYER_INITIAL_POSITION } from '@/stores/playerSlice'

const GameContext = createContext<ReturnType<typeof createGameStore>>(undefined!)

type Props = PropsWithChildren<{
  isMobile: boolean
  insertSpeedRun: (data: ServerSpeedRunSubmission) => InsertSpeedRunResponse
}>

export const GameProvider: FC<Props> = ({ children, isMobile, insertSpeedRun }) => {
  const playSoundFX = useSoundStore((s) => s.playSoundFX)
  const stopSoundFX = useSoundStore((s) => s.stopSoundFX)
  const switchBackgroundTrack = useSoundStore((s) => s.switchBackgroundTrack)

  const [store] = useState(() =>
    createGameStore({
      isMobile,
      insertSpeedRun,
      playSoundFX,
      stopSoundFX,
      switchBackgroundTrack,
    }),
  )
  
  return <GameContext value={store}>{children}</GameContext>
}

export function useGameStore<T>(selector: (state: GameStore) => T): T {
  const store = useContext(GameContext)
  if (!store) throw new Error('Missing Provider in the tree')
  return useStore(store, selector)
}

export function useGameStoreAPI() {
  const store = useContext(GameContext)
  if (!store) throw new Error('Missing Provider in the tree')
  return store
}
