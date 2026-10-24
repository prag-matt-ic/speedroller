import type { Vector3Tuple } from 'three'

import {
  type InsertSpeedRunResponse,
  type ServerSpeedRunSubmission,
  type SpeedRunDatabase,
  speedRunSubmissionSchema,
} from '@/model/schema'
import { MOVE_HUD_CONFIG } from '@/resources/content/hud'
import { PLATFORM_VERSION } from '@/resources/rowsData'
import { PLAYER_INITIAL_POSITION } from '@/stores/playerSlice'
import { Stage } from '@/stores/types'
import { PLAYER_RESTING_Y } from '@/utils/player'
import { getStartGridPosition } from '@/utils/platform/raceMarkers'
import { colToX, rowToWorldZ, worldZToRowIndex } from '@/utils/tiles'

import { getResetInputState } from './inputSlice'
import {
  type GameSliceCreator,
  type HudIndicatorConfig,
  Overlay,
  SpeedRunStage,
  type TimeSlice,
  getOverlayForSpeedRunStage,
} from './types'

const usernameSchema = speedRunSubmissionSchema.shape.username
const TIME_ROUNDING_FACTOR = 100
const LOBBY_CANCEL_ROW = 22
const LOBBY_CANCEL_COLUMN = 16

export const RESET_TIME_STATE: Pick<
  TimeSlice,
  'speedRunTimeCS' | 'speedRunStage' | 'attemptStartedAtMs' | 'attemptResult' | 'saveStatus'
> = {
  speedRunTimeCS: 0,
  speedRunStage: SpeedRunStage.LOBBY,
  attemptStartedAtMs: null,
  attemptResult: null,
  saveStatus: 'idle',
}

const isValidUsername = (username: string | null): username is string =>
  usernameSchema.safeParse(username ?? '').success

const getMonotonicNow = (): number => performance.now()

const toCentisecondSeconds = (seconds: number): number =>
  Math.round(seconds * TIME_ROUNDING_FACTOR) / TIME_ROUNDING_FACTOR

const getAttemptStartPhase = (username: string | null): SpeedRunStage =>
  isValidUsername(username) ? SpeedRunStage.COUNTDOWN : SpeedRunStage.START

const getLobbyCancelPosition = (): Vector3Tuple => [
  colToX(LOBBY_CANCEL_COLUMN),
  PLAYER_RESTING_Y,
  rowToWorldZ(LOBBY_CANCEL_ROW),
]

export const createTimeSlice =
  (
    insertSpeedRun: (data: ServerSpeedRunSubmission) => InsertSpeedRunResponse,
  ): GameSliceCreator<TimeSlice> =>
  (set, get) => {
    const resetAttemptPlayerState = () => {
      get().stopConfirmation()
      get().resetPlayerSpeedState()
    }

    const beginAttempt = (phase: SpeedRunStage): boolean => {
      const state = get()
      const startGridPosition = getStartGridPosition(state.rowsData, PLAYER_RESTING_Y)
      if (!startGridPosition) {
        console.error('[race] Cannot begin an attempt without a generated START marker')
        return false
      }

      resetAttemptPlayerState()
      const startRowIndex = state.rowsData.findIndex((row) => row.startLinePosition)
      const startRow = startRowIndex >= 0 ? state.rowsData[startRowIndex] : undefined
      const attemptId = state.attemptId + 1

      set({
        attemptId,
        attemptStartedAtMs: null,
        attemptInputType: state.inputType,
        attemptResult: null,
        saveStatus: 'idle',
        speedRunTimeCS: 0,
        collectedRings: {},
        hasCollectedAllRings: false,
        outOfBoundsEvents: [],
        confirmingCollectible: null,
        confirmingPaletteIndex: null,
        confirmationProgress: 0,
        hudIndicator: null,
        cameraLookAtPosition: null,
        speedRunStage: phase,
        overlay: getOverlayForSpeedRunStage(phase),
        playerStatus: 'respawning',
        spawnPosition: startGridPosition,
        playerRespawnTick: state.playerRespawnTick + 1,
        currentRow: Math.max(0, startRowIndex),
        stage: startRow?.stage ?? Stage.HOME,
        ...getResetInputState(),
      })
      return true
    }

    const resetToLobby = (position: Vector3Tuple, hudIndicator: HudIndicatorConfig) => {
      const state = get()
      resetAttemptPlayerState()
      set({
        attemptId: state.attemptId + 1,
        attemptStartedAtMs: null,
        attemptInputType: null,
        attemptResult: null,
        saveStatus: 'idle',
        speedRunTimeCS: 0,
        collectedRings: {},
        hasCollectedAllRings: false,
        outOfBoundsEvents: [],
        confirmingCollectible: null,
        confirmingPaletteIndex: null,
        confirmationProgress: 0,
        hudIndicator,
        cameraLookAtPosition: null,
        speedRunStage: SpeedRunStage.LOBBY,
        overlay: Overlay.NONE,
        playerStatus: 'respawning',
        spawnPosition: position,
        playerRespawnTick: state.playerRespawnTick + 1,
        currentRow: Math.max(0, worldZToRowIndex(position[2], state.rowsData.length)),
        stage: Stage.HOME,
        ...getResetInputState(),
      })
    }

    return {
      ...RESET_TIME_STATE,
      attemptId: 0,
      attemptInputType: null,
      totalTimeS: 0,
      completedSpeedRuns: {},
      platformVersion: PLATFORM_VERSION,
      setTotalTimeS: (seconds: number) => {
        set({ totalTimeS: seconds })
      },
      setSpeedRunTimeCS: (centiSeconds: number) => {
        set({ speedRunTimeCS: centiSeconds })
      },
      enterStartLine: () => {
        const state = get()
        if (state.speedRunStage !== SpeedRunStage.LOBBY) return
        if (state.playerStatus !== 'safe') return
        if (!state.isPlatformReady) return
        beginAttempt(getAttemptStartPhase(state.username))
      },
      startCountdown: () => {
        const state = get()
        if (state.speedRunStage !== SpeedRunStage.START) return
        if (!isValidUsername(state.username)) return
        set({
          speedRunStage: SpeedRunStage.COUNTDOWN,
          overlay: getOverlayForSpeedRunStage(SpeedRunStage.COUNTDOWN),
        })
      },
      cancelStartLine: () => {
        if (get().speedRunStage !== SpeedRunStage.START) return
        resetToLobby(getLobbyCancelPosition(), MOVE_HUD_CONFIG[get().inputType])
      },
      onCountdownComplete: (attemptId: number) => {
        const state = get()
        if (state.speedRunStage !== SpeedRunStage.COUNTDOWN) return
        if (state.attemptId !== attemptId) return
        set({
          speedRunStage: SpeedRunStage.RUNNING,
          overlay: getOverlayForSpeedRunStage(SpeedRunStage.RUNNING),
          attemptStartedAtMs: getMonotonicNow(),
          speedRunTimeCS: 0,
        })
      },
      finishSpeedRun: (attemptId?: number) => {
        const state = get()
        if (state.speedRunStage !== SpeedRunStage.RUNNING) return
        if (attemptId !== undefined && attemptId !== state.attemptId) return
        if (state.attemptStartedAtMs === null) return

        const finishedAt = getMonotonicNow()
        const timeSeconds = toCentisecondSeconds(
          (finishedAt - state.attemptStartedAtMs) / 1000,
        )
        const result = {
          attemptId: state.attemptId,
          username: state.username ?? '',
          date: new Date().toISOString(),
          timeSeconds,
          inputType: state.attemptInputType ?? state.inputType,
          platformVersion: state.platformVersion,
          raceFalls: state.outOfBoundsEvents.length,
          rings: Object.keys(state.collectedRings).length,
        }

        set({
          speedRunStage: SpeedRunStage.SUBMITTING,
          overlay: getOverlayForSpeedRunStage(SpeedRunStage.SUBMITTING),
          speedRunTimeCS: Math.round(timeSeconds * TIME_ROUNDING_FACTOR),
          attemptResult: result,
          saveStatus: 'saving',
        })

        const saveResult = async () => {
          if (!isValidUsername(result.username)) {
            if (get().attemptId === result.attemptId) {
              set({ speedRunStage: SpeedRunStage.END, saveStatus: 'failed' })
            }
            return
          }

          const submission: ServerSpeedRunSubmission = {
            username: result.username,
            time: result.timeSeconds,
            date: result.date,
            input_type: result.inputType,
            level_id: result.platformVersion,
            accidents: result.raceFalls,
            rings: result.rings,
          }

          const appendRun = (run: SpeedRunDatabase) => {
            set((previous) => {
              const versionKey = result.platformVersion
              const existingRuns = previous.completedSpeedRuns[versionKey] ?? []
              return {
                completedSpeedRuns: {
                  ...previous.completedSpeedRuns,
                  [versionKey]: [
                    ...existingRuns,
                    { ...run, level_id: run.level_id ?? versionKey },
                  ],
                },
              }
            })
          }

          try {
            const savedRun = await insertSpeedRun(submission)
            if (!savedRun) throw new Error('Inserting speedrun returned null')
            appendRun(savedRun)
            if (get().attemptId === result.attemptId) {
              set({ speedRunStage: SpeedRunStage.END, saveStatus: 'saved' })
            }
          } catch (error) {
            console.error('Error inserting speedrun:', error)
            if (get().attemptId === result.attemptId) {
              set({ speedRunStage: SpeedRunStage.END, saveStatus: 'failed' })
            }
          }
        }

        void saveResult()
      },
      retryRace: () => {
        const state = get()
        if (
          state.speedRunStage !== SpeedRunStage.RUNNING &&
          state.speedRunStage !== SpeedRunStage.SUBMITTING &&
          state.speedRunStage !== SpeedRunStage.END
        ) {
          return
        }
        beginAttempt(getAttemptStartPhase(state.username))
      },
      returnToLobby: () => {
        const state = get()
        if (state.speedRunStage === SpeedRunStage.LOBBY) return
        resetToLobby(PLAYER_INITIAL_POSITION, MOVE_HUD_CONFIG[state.inputType])
      },
    }
  }
