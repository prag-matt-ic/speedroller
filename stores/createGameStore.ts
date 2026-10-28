import { createStore } from 'zustand'
import { createJSONStorage, type PersistOptions, type StorageValue, persist, subscribeWithSelector } from 'zustand/middleware'

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
  const storage = createJSONStorage<PersistedStore>(() => window.localStorage)
  let lastSaved: StorageValue<PersistedStore> | undefined

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
          storage: storage && {
            getItem: (name) => {
              lastSaved = undefined
              return storage.getItem(name)
            },
            setItem: (name, value) => {
              // Transient frame updates must not serialize saved runs or write localStorage.
              if (lastSaved && lastSaved.version === value.version &&
                lastSaved.state.username === value.state.username &&
                lastSaved.state.isSubscribed === value.state.isSubscribed &&
                lastSaved.state.totalTimeS === value.state.totalTimeS &&
                lastSaved.state.completedSpeedRuns === value.state.completedSpeedRuns &&
                lastSaved.state.inputType === value.state.inputType &&
                lastSaved.state.joystickPosition === value.state.joystickPosition &&
                lastSaved.state.paletteIndex === value.state.paletteIndex
              ) return
              storage.setItem(name, value)
              lastSaved = value
            },
            removeItem: (name) => {
              storage.removeItem(name)
              lastSaved = undefined
            },
          },
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
