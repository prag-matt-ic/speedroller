import { PLATFORM_DATA } from '@/resources/rowsData'
import type { RowData } from '@/utils/tiles'

import { getResetInputState } from './inputSlice'
import { PLAYER_INITIAL_POSITION, RESET_PLAYER_STATE } from './playerSlice'
import { RESET_TIME_STATE } from './timeSlice'
import { createTotalCounts } from './totalCounts'
import {
  GameMode,
  type GameSlice,
  type GameSliceCreator,
  Overlay,
  SpeedRunStage,
  Stage,
} from './types'

const getPlatformDataForMode = (
  mode: GameMode,
): { rowsData: RowData[]; totalCounts: ReturnType<typeof createTotalCounts> } => {
  const modeData = PLATFORM_DATA.modes[mode] ?? PLATFORM_DATA.modes[GameMode.SPEEDRUN]
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

const DEFAULT_PLATFORM_DATA = getPlatformDataForMode(GameMode.SPEEDRUN)

export const RESET_GAME_STATE = {
  totalCounts: DEFAULT_PLATFORM_DATA.totalCounts,
  currentRow: 0,
  cameraLookAtPosition: null,
  isPlatformReady: false,
  isWarmupComplete: false,
  rowsData: DEFAULT_PLATFORM_DATA.rowsData,
}

export const createGameSlice = (): GameSliceCreator<GameSlice> => (set, get) => ({
  ...RESET_GAME_STATE,
  stage: Stage.HOME,
  htmlPortal: undefined,
  _isHydrated: false,
  resetPlatformTick: 0,
  mode: GameMode.SPEEDRUN,
  hudIndicator: null,
  setHydrated: () => {
    set({
      _isHydrated: true,
      mode: GameMode.SPEEDRUN,
      speedRunStage: SpeedRunStage.LOBBY,
      ...getPlatformDataForMode(GameMode.SPEEDRUN),
    })
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
    get().stopConfirmation()
    set((state) => ({
      rowsData,
      totalCounts,
      resetPlatformTick: state.resetPlatformTick + 1,
      isPlatformReady: false,
      isWarmupComplete: false,
      cameraLookAtPosition: null,
      hudIndicator: null,
    }))
  },
  goToStage: (newStage: Stage) => {
    set({ stage: newStage })
  },
  // Developer layout switch only. Race attempts reset in place via the time slice, so the
  // generated terrain and warmup stay mounted.
  resetGame: ({ mode: targetMode }) => {
    const state = get()
    state.stopConfirmation()
    state.resetPlayerSpeedState()
    const nextModeData = getPlatformDataForMode(targetMode)
    const isShowingLandingOverlay = state.overlay === Overlay.LANDING

    set((previous) => ({
      ...RESET_GAME_STATE,
      ...RESET_PLAYER_STATE,
      ...RESET_TIME_STATE,
      ...getResetInputState(),
      mode: targetMode,
      rowsData: nextModeData.rowsData,
      totalCounts: nextModeData.totalCounts,
      overlay: isShowingLandingOverlay ? Overlay.LANDING : Overlay.NONE,
      stage: Stage.HOME,
      hudIndicator: null,
      attemptId: previous.attemptId + 1,
      attemptInputType: null,
      outOfBoundsEvents: [],
      playerStatus: 'respawning',
      spawnPosition: [...PLAYER_INITIAL_POSITION],
      playerRespawnTick: previous.playerRespawnTick + 1,
      playerPosition: PLAYER_INITIAL_POSITION,
      resetPlatformTick: previous.resetPlatformTick + 1,
    }))
  },
})
