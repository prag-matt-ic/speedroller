import { createStore } from 'zustand'
import { type PersistOptions, persist, subscribeWithSelector } from 'zustand/middleware'

import { createGameSlice } from './gameSlice'
import { createInputSlice } from './inputSlice'
import { createOverlaysSlice } from './overlaysSlice'
import { createPlayerSlice } from './playerSlice'
import { createTimeSlice } from './timeSlice'
import { type CreateGameStoreParams, type GameStore } from './types'

type PersistedStore = Pick<
  GameStore,
  | 'username'
  | 'totalTimeS'
  | 'completedSpeedRuns'
  | 'inputType'
  | 'joystickPosition'
  | 'paletteIndex'
  | 'isSubscribed'
>

type LegacyPersistedStore = PersistedStore & { mode?: unknown }

const STORE_VERSION = 2

export const createGameStore = (params: CreateGameStoreParams) => {
  return createStore<GameStore>()(
    subscribeWithSelector(
      persist<GameStore, [], [], PersistedStore>(
        (...a) => ({
          ...createTimeSlice(params.insertSpeedRun)(...a),
          ...createInputSlice(params.isMobile)(...a),
          ...createPlayerSlice(params)(...a),
          ...createOverlaysSlice(...a),
          ...createGameSlice()(...a),
        }),
        {
          name: 'speedroller-game',
          partialize: (s) =>
            ({
              username: s.username,
              isSubscribed: s.isSubscribed,
              totalTimeS: s.totalTimeS,
              completedSpeedRuns: s.completedSpeedRuns,
              inputType: s.inputType,
              joystickPosition: s.joystickPosition,
              paletteIndex: s.paletteIndex,
            }) as PersistedStore,
          version: STORE_VERSION,
          // Version 1 persisted the removed Learn/Explore mode. Drop it so public startup always
          // begins in the continuous lobby, while every other preference and run bucket survives.
          migrate: (persistedState, version) => {
            if (version >= STORE_VERSION) return persistedState as PersistedStore
            if (!persistedState || typeof persistedState !== 'object') {
              return persistedState as PersistedStore
            }
            const migratedState = { ...(persistedState as LegacyPersistedStore) }
            delete migratedState.mode
            return migratedState
          },
          onRehydrateStorage: () => {
            return (state, error) => {
              if (!!error) {
                console.error('Error during game store hydration:', error)
              } else {
                state?.setHydrated()
              }
            }
          },
        } as PersistOptions<GameStore, PersistedStore>,
      ),
    ),
  )
}
