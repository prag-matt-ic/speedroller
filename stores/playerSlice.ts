import gsap from 'gsap'
import { type Vector3Tuple } from 'three'

import { SoundFX } from '@/components/SoundProvider'
import { clampPaletteIndexSafe } from '@/components/palette'
import { CollectibleID } from '@/model/schema'
import { getOutOfBoundsMessage } from '@/resources/content/hud'
import { ringIndexToKey } from '@/utils/rings'

import {
  type CreateGameStoreParams,
  type GameSliceCreator,
  type PlayerSlice,
  type PlayerStatus,
  RingCollection,
  type RingIndex,
  SpeedRunStage,
  isAttemptLocked,
} from './types'

export const PLAYER_INITIAL_POSITION: Vector3Tuple = [0, 4, 0]
const COLLECTIBLE_DURATION_S = 1.5

export const RESET_PLAYER_STATE: Pick<
  PlayerSlice,
  | 'confirmingCollectible'
  | 'confirmingPaletteIndex'
  | 'collectedRings'
  | 'confirmationProgress'
  | 'hasCollectedAllRings'
  | 'playerBoostUnits'
  | 'playerSpeedUnits'
> = {
  confirmingCollectible: null,
  confirmingPaletteIndex: null,
  collectedRings: {},
  confirmationProgress: 0,
  hasCollectedAllRings: false,
  playerBoostUnits: 0,
  playerSpeedUnits: 0,
}

export const createPlayerSlice =
  ({ playSoundFX, stopSoundFX }: CreateGameStoreParams): GameSliceCreator<PlayerSlice> =>
  (set, get) => {
    let confirmationTween: GSAPTween | null = null
    const confirmationTweenTarget = { value: 0 }

    function startConfirmation(onComplete: () => void, duration: number) {
      confirmationTweenTarget.value = 0
      confirmationTween = gsap.fromTo(
        confirmationTweenTarget,
        { value: 0 },
        {
          duration,
          ease: 'none',
          value: 1,
          onUpdate: () => {
            set({ confirmationProgress: confirmationTweenTarget.value })
          },
          onComplete: () => {
            onComplete()
            confirmationTween?.kill()
            confirmationTween = null
          },
        },
      )
    }

    function cancelConfirmation() {
      set({
        confirmingCollectible: null,
        confirmingPaletteIndex: null,
      })
      confirmationTween = gsap.to(confirmationTweenTarget, {
        duration: 0.3,
        ease: 'power2.out',
        value: 0,
        onUpdate: () => {
          set({ confirmationProgress: confirmationTweenTarget.value })
        },
        onComplete: () => {
          confirmationTweenTarget.value = 0
          confirmationTween?.kill()
          confirmationTween = null
        },
      })
    }

    return {
      ...RESET_PLAYER_STATE,
      collectedCollectibles: [],
      seenCollectibles: {},
      playerRespawnTick: 0,
      ringBoostTick: 0,
      spawnPosition: null,
      playerStatus: 'idle' as PlayerStatus,
      outOfBoundsEvents: [],
      username: null,
      isSubscribed: false,
      paletteIndex: 0,
      confirmingPaletteIndex: RESET_PLAYER_STATE.confirmingPaletteIndex,
      setUsername: (username: string) => {
        if (isAttemptLocked(get().speedRunStage)) return
        set({ username })
      },
      setIsSubscribed: (isSubscribed) => {
        set({ isSubscribed })
      },
      playerPosition: PLAYER_INITIAL_POSITION,
      setPlayerPosition: (position) => {
        set((state) => {
          const [x, y, z] = state.playerPosition
          if (x === position.x && y === position.y && z === position.z) return state
          return { playerPosition: [position.x, position.y, position.z] }
        })
      },
      setPlayerSpeedUnits: (speedUnits) => {
        set((state) =>
          state.playerSpeedUnits === speedUnits ? state : { playerSpeedUnits: speedUnits },
        )
      },
      setPlayerBoostUnits: (boostUnits) => {
        set((state) =>
          state.playerBoostUnits === boostUnits ? state : { playerBoostUnits: boostUnits },
        )
      },
      setPaletteIndex: (paletteIndex: number) => {
        set({ paletteIndex: clampPaletteIndexSafe(paletteIndex) })
      },
      markCollectibleSeen: (collectibleType) => {
        set((s) => ({
          seenCollectibles: { ...s.seenCollectibles, [collectibleType]: true },
        }))
      },
      onRingCollected: (ringIndex: RingIndex) => {
        const ringKey = ringIndexToKey(ringIndex)
        if (get().collectedRings[ringKey]) return
        const state = get()
        const newCollectedRings: RingCollection = { ...state.collectedRings, [ringKey]: true }

        const playerRingsCount = Object.keys(newCollectedRings).length
        const hasCollectedAllRings = playerRingsCount >= state.totalCounts.rings
        if (hasCollectedAllRings) {
          console.warn('All rings collected!')
        }

        // The player owns the race speed model; this tick only reports how many rings to credit.
        // A ring picked up outside the live race still counts towards the attempt, but no boost.
        const isRaceRing = state.speedRunStage === SpeedRunStage.RUNNING

        set((previous) => ({
          collectedRings: newCollectedRings,
          hasCollectedAllRings,
          ringBoostTick: isRaceRing ? previous.ringBoostTick + 1 : previous.ringBoostTick,
        }))
      },
      setConfirmingCollectible: (collectibleType: CollectibleID | null) => {
        confirmationTween?.kill()

        if (collectibleType === null) {
          cancelConfirmation()
          set({ confirmingCollectible: null, confirmingPaletteIndex: null })
          stopSoundFX(SoundFX.CHANGE_COLOUR)
          return
        }

        // Don't re-confirm already collected
        if (get().collectedCollectibles.includes(collectibleType)) return

        set({
          confirmingCollectible: collectibleType,
          confirmingPaletteIndex: null,
          confirmationProgress: 0,
        })

        playSoundFX(SoundFX.CHANGE_COLOUR)

        const onConfirmed = () => {
          const currentConfirming = get().confirmingCollectible
          if (currentConfirming !== collectibleType) return
          set((s) => ({
            collectedCollectibles: [...s.collectedCollectibles, collectibleType],
            confirmingCollectible: null,
            hudIndicator: null,
          }))
          playSoundFX(SoundFX.OPEN_INFO)
        }

        startConfirmation(onConfirmed, COLLECTIBLE_DURATION_S)
      },
      setConfirmingPaletteIndex: (paletteIndex: number | null) => {
        if (paletteIndex !== null && get().speedRunStage !== SpeedRunStage.LOBBY) return
        confirmationTween?.kill()

        if (paletteIndex === null) {
          cancelConfirmation()
          set({ confirmingCollectible: null, confirmingPaletteIndex: null })
          stopSoundFX(SoundFX.CHANGE_COLOUR)
          return
        }

        const clamped = clampPaletteIndexSafe(paletteIndex)
        const currentPalette = get().paletteIndex
        if (clamped === currentPalette) {
          cancelConfirmation()
          set({ confirmingCollectible: null, confirmingPaletteIndex: null })
          return
        }

        set({
          confirmingCollectible: null,
          confirmingPaletteIndex: clamped,
          confirmationProgress: 0,
        })

        playSoundFX(SoundFX.CHANGE_COLOUR)

        const onConfirmed = () => {
          const currentConfirming = get().confirmingPaletteIndex
          if (currentConfirming !== clamped) return
          set({
            paletteIndex: clamped,
            confirmingPaletteIndex: null,
            hudIndicator: null,
          })
          playSoundFX(SoundFX.OPEN_INFO)
        }

        startConfirmation(onConfirmed, COLLECTIBLE_DURATION_S)
      },
      stopConfirmation: () => {
        confirmationTween?.kill()
        confirmationTween = null
        confirmationTweenTarget.value = 0
        stopSoundFX(SoundFX.CHANGE_COLOUR)
        set({
          confirmingCollectible: null,
          confirmingPaletteIndex: null,
          confirmationProgress: 0,
        })
      },
      resetPlayerSpeedState: () => {
        set({ playerBoostUnits: 0, playerSpeedUnits: 0 })
      },
      respawnPlayer: (position, hud) => {
        get().stopConfirmation()
        set((s) => ({
          playerStatus: 'respawning',
          playerRespawnTick: s.playerRespawnTick + 1,
          spawnPosition: position,
          cameraLookAtPosition: null,
          cameraPoseOverrides: [],
          hudIndicator: hud ?? s.hudIndicator,
        }))
      },
      onRespawnComplete: () => {
        set({
          playerStatus: 'safe',
        })
      },
      onOutOfBounds: () => {
        const state = get()
        const status = state.playerStatus
        if (status === 'out-of-bounds' || status === 'idle') return
        if (
          state.speedRunStage === SpeedRunStage.SUBMITTING ||
          state.speedRunStage === SpeedRunStage.END
        ) {
          return
        }
        get().stopConfirmation()
        playSoundFX(SoundFX.OUT_OF_BOUNDS)
        // A fall costs momentum and boost; the player accelerates from rest after respawn.
        get().resetPlayerSpeedState()
        const outOfBoundsMessage =
          state.speedRunStage === SpeedRunStage.LOBBY
            ? getOutOfBoundsMessage(state.outOfBoundsEvents)
            : null

        set((s) => ({
          playerStatus: 'out-of-bounds',
          spawnPosition: null, // Calculated in usePlayerRespawn hook
          cameraLookAtPosition: null,
          cameraPoseOverrides: [],
          hudIndicator: outOfBoundsMessage,
          outOfBoundsEvents: [
            ...s.outOfBoundsEvents,
            { hudId: outOfBoundsMessage?.id ?? null, timestamp: Date.now() },
          ],
          playerInput: {
            up: 0,
            down: 0,
            left: 0,
            right: 0,
          },
          playerInputIntent: {
            up: 0,
            down: 0,
            left: 0,
            right: 0,
          },
        }))
      },
    }
  }
