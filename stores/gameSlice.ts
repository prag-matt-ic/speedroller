import { PLATFORM_DATA } from '@/resources/rowsData'
import type { RowData } from '@/utils/tiles'

import { getResetInputState } from './inputSlice'
import { PLAYER_INITIAL_POSITION, RESET_PLAYER_STATE } from './playerSlice'
import { RESET_TIME_STATE } from './timeSlice'
import { createTotalCounts } from './totalCounts'
import {
  CreateGameStoreParams,
  GameMode,
  type GameSlice,
  type GameSliceCreator,
  Overlay,
  SpeedRunStage,
  Stage,
  getOverlayForSpeedRunStage,
} from './types'

const getPlatformDataForMode = (
  mode: GameMode,
): { rowsData: RowData[]; totalCounts: ReturnType<typeof createTotalCounts> } => {
  const modeData = PLATFORM_DATA.modes[mode] ?? PLATFORM_DATA.modes[GameMode.LEARN]
  if (!modeData) {
    return {
      rowsData: [],
      totalCounts: createTotalCounts(),
    }
  }
  return {
    rowsData: modeData.rows,
    totalCounts: { ...modeData.totalCounts },
  }
}

const DEFAULT_PLATFORM_DATA = getPlatformDataForMode(GameMode.LEARN)

export const RESET_GAME_STATE = {
  totalCounts: DEFAULT_PLATFORM_DATA.totalCounts,
  currentRow: 0,
  cameraLookAtPosition: null,
  isPlatformReady: false,
  isWarmupComplete: false,
  rowsData: DEFAULT_PLATFORM_DATA.rowsData,
}

export const createGameSlice =
  (
    switchBackgroundTrack: CreateGameStoreParams['switchBackgroundTrack'],
  ): GameSliceCreator<GameSlice> =>
  (set, get) => ({
    ...RESET_GAME_STATE,
    stage: Stage.HOME,
    htmlPortal: undefined,
    _isHydrated: false,
    resetPlatformTick: 0,
    mode: GameMode.LEARN,
    hudIndicator: null,
    setHydrated: (mode: GameMode) => {
      if (mode === GameMode.DEV) {
        set({ _isHydrated: true, ...getPlatformDataForMode(GameMode.DEV) })
      } else {
        set({ _isHydrated: true, mode: GameMode.LEARN })
      }
    },
    setHtmlPortal: (htmlPortal) => {
      set({ htmlPortal })
    },
    setHudIndicator: (indicator) => {
      set({ hudIndicator: indicator })
    },
    setCurrentRow: (currentRow) => {
      set({ currentRow })
    },
    setCameraLookAtPosition: (cameraLookAtPosition) => {
      set({ cameraLookAtPosition })
    },
    setIsPlatformReady: (isPlatformReady) => {
      set({ isPlatformReady })
    },
    setIsWarmupComplete: (isWarmupComplete) => {
      set({ isWarmupComplete })
    },
    setRowsData: (rowsData, totalCounts) => {
      set({ rowsData, totalCounts, isPlatformReady: false, isWarmupComplete: false })
    },
    goToStage: (newStage: Stage) => {
      if (newStage === Stage.HOME) {
        set({ stage: Stage.HOME })
      }
      if (newStage === Stage.INFO) {
        set({ stage: Stage.INFO })
      }
      if (newStage === Stage.OBSTACLES) {
        set({ stage: Stage.OBSTACLES })
      }
      if (newStage === Stage.CTA) {
        set({ stage: Stage.CTA })
      }
    },
    resetGame: ({ mode: targetMode, speedRunStage }) => {
      const { stopConfirmation, mode, overlay } = get()

      stopConfirmation()
      const isModeChange = targetMode !== mode

      if (isModeChange) switchBackgroundTrack(targetMode)

      const nextModeData = getPlatformDataForMode(targetMode)

      const isSpeedRunMode = targetMode === GameMode.SPEEDRUN
      const isShowingLandingOverlay = overlay === Overlay.LANDING

      const nextOverlay = isSpeedRunMode
        ? getOverlayForSpeedRunStage(speedRunStage ?? SpeedRunStage.START)
        : isShowingLandingOverlay
          ? Overlay.LANDING
          : Overlay.NONE

      set((s) => {
        return {
          ...RESET_GAME_STATE,
          ...RESET_PLAYER_STATE,
          ...RESET_TIME_STATE,
          ...getResetInputState(),
          mode: targetMode,
          rowsData: isModeChange ? nextModeData.rowsData : s.rowsData,
          totalCounts: isModeChange ? nextModeData.totalCounts : s.totalCounts,
          overlay: nextOverlay,
          outOfBoundsEvents: [],
          playerStatus: s.playerStatus === 'idle' ? 'idle' : 'respawning',
          spawnPosition: s.playerStatus === 'idle' ? null : [...PLAYER_INITIAL_POSITION],
          playerRespawnTick: s.playerRespawnTick + 1,
          playerPosition: PLAYER_INITIAL_POSITION,
          resetPlatformTick: s.resetPlatformTick + 1,
        }
      })
    },
  })
