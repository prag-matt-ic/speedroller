import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'
import { type Vector3Tuple } from 'three'
import { type StateCreator } from 'zustand'

import { type SoundState } from '@/components/SoundProvider'
import {
  CollectibleID,
  InsertSpeedRunResponse,
  ServerSpeedRunSubmission,
  SpeedRunDatabase,
} from '@/model/schema'
import type { TotalCounts } from '@/stores/totalCounts'
import type { RowData } from '@/utils/tiles'

export enum Stage {
  HOME = 1,
  INFO = 2,
  OBSTACLES = 3,
  CTA = 4,
  SPEED_RUN_FINISH = 5,
}

export type PlayerInput = {
  up: number
  down: number
  left: number
  right: number
}

export type PlayerStatus = 'idle' | 'safe' | 'out-of-bounds' | 'respawning'

export type HudIndicatorConfig = {
  id: string
  label: ReactNode
  Icon?: LucideIcon
  autoDismissS?: number
}

export type RingIndex = [row: number, column: number]
export type RingCollection = Record<string, true>

export enum SpeedRunStage {
  START = 'start',
  COUNTDOWN = 'countdown',
  RUNNING = 'running',
  SUBMITTING = 'submitting',
  END = 'end',
}

export enum GameMode {
  LEARN = 'learn',
  SPEEDRUN = 'speedrun',
  DEV = 'dev',
}

export type TimeSlice = {
  totalTimeS: number // total time spent in the experience in seconds (persisted)
  setTotalTimeS: (seconds: number) => void

  speedRunStage: SpeedRunStage

  startCountdown: () => void // Sets mode to SPEEDRUN, sets speed run stage to countdown
  onCountdownComplete: () => void // sets speedRunStage to running
  finishSpeedRun: () => void // sets speedRunStage to submitting, submits speedrun and then speedRunStage to end

  speedRunTimeCS: number // current speed run duration in 10 milliseconds (centi-seconds)
  setSpeedRunTimeCS: (centiSeconds: number) => void

  completedSpeedRuns: Record<string, SpeedRunDatabase[]>
  platformVersion: string
}

export enum InputType {
  KEYS = 'keyboard',
  JOYSTICK = 'joystick',
}

export type InputSlice = {
  isMobile: boolean
  inputType: InputType
  setInputType: (type: InputType) => void
  joystickPosition: 'left' | 'right'
  setJoystickPosition: (position: 'left' | 'right') => void
  playerInputIntent: PlayerInput
  setPlayerInputIntent: (input: PlayerInput) => void
  playerInput: PlayerInput
  setPlayerInput: (input: PlayerInput) => void

  // MF: unsure if we need this as global state or it can just be set locally, defaulted to input type.
  leaderboardFilter: InputType
  setLeaderboardFilter: (filter: InputType) => void
}

export enum Overlay {
  NONE = 'none',
  LANDING = 'landing',
  DASHBOARD = 'dashboard',
  SUBSCRIBE = 'subscribe',
  SPEEDRUN_START = 'speedrun-start',
  SPEEDRUN_COUNTDOWN = 'speedrun-countdown',
  SPEEDRUN_END = 'speedrun-end',
}

export const getOverlayForSpeedRunStage = (speedRunStage: SpeedRunStage): Overlay => {
  switch (speedRunStage) {
    case SpeedRunStage.START:
      return Overlay.SPEEDRUN_START
    case SpeedRunStage.COUNTDOWN:
      return Overlay.SPEEDRUN_COUNTDOWN
    case SpeedRunStage.RUNNING:
      return Overlay.NONE
    case SpeedRunStage.SUBMITTING:
      return Overlay.SPEEDRUN_END
    case SpeedRunStage.END:
      return Overlay.SPEEDRUN_END
    default:
      return Overlay.NONE
  }
}

export type OverlaysSlice = {
  overlay: Overlay
  setOverlay: (overlay: Overlay) => void
}

export type OutOfBoundsEvent = {
  hudId: string | null
  timestamp: number
}

export type PlayerSlice = {
  username: null | string
  setUsername: (username: string) => void
  isSubscribed: boolean
  setIsSubscribed: (isSubscribed: boolean) => void

  playerPosition: Vector3Tuple
  setPlayerPosition: (pos: { x: number; y: number; z: number }) => void

  playerSpeedUnits: number // units per second
  // setPlayerSpeedUnits: (speed: number) => void

  spawnPosition: Vector3Tuple | null
  playerRespawnTick: number
  playerStatus: PlayerStatus
  outOfBoundsEvents: OutOfBoundsEvent[]

  paletteIndex: number
  confirmingPaletteIndex: number | null
  setPaletteIndex: (paletteIndex: number) => void
  setConfirmingPaletteIndex: (paletteIndex: number | null) => void

  respawnPlayer: (position: Vector3Tuple, hud?: HudIndicatorConfig) => void
  onRespawnComplete: () => void

  confirmingCollectible: CollectibleID | null
  setConfirmingCollectible: (collectibleType: CollectibleID | null) => void
  confirmationProgress: number

  collectedCollectibles: CollectibleID[]
  seenCollectibles: Partial<Record<CollectibleID, boolean>>

  collectedRings: RingCollection
  hasCollectedAllRings: boolean
  onRingCollected: (indexes: RingIndex) => void

  markCollectibleSeen: (collectibleType: CollectibleID) => void
  stopConfirmation: () => void
  onOutOfBounds: () => void
}

export type GameSlice = {
  stage: Stage
  goToStage: (stage: Stage) => void

  hudIndicator: HudIndicatorConfig | null
  setHudIndicator: (indicator: HudIndicatorConfig | null) => void

  rowsData: RowData[]
  totalCounts: TotalCounts
  setRowsData: (rows: RowData[], totalCounts: TotalCounts) => void

  currentRow: number
  setCurrentRow: (row: number) => void

  mode: GameMode
  resetGame: (params: { mode: GameMode; speedRunStage?: SpeedRunStage }) => void

  cameraLookAtPosition: Vector3Tuple | null
  setCameraLookAtPosition: (pos: Vector3Tuple | null) => void

  resetPlatformTick: number

  isPlatformReady: boolean
  setIsPlatformReady: (isReady: boolean) => void

  isWarmupComplete: boolean
  setIsWarmupComplete: (isComplete: boolean) => void

  htmlPortal: undefined | React.RefObject<HTMLDivElement>
  setHtmlPortal: (ref: undefined | React.RefObject<HTMLDivElement>) => void

  _isHydrated: boolean
  setHydrated: (mode: GameMode) => void
}

export type GameStore = TimeSlice & PlayerSlice & GameSlice & InputSlice & OverlaysSlice

export type CreateGameStoreParams = {
  isMobile: boolean
  insertSpeedRun: (data: ServerSpeedRunSubmission) => InsertSpeedRunResponse
} & Pick<SoundState, 'playSoundFX' | 'stopSoundFX' | 'switchBackgroundTrack'>

export type GameSliceCreator<T> = StateCreator<GameStore, [['zustand/persist', unknown]], [], T>
