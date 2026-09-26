import gsap from 'gsap'
import { type Vector3Tuple } from 'three'

import { SoundFX } from '@/components/SoundProvider'
import { clampPaletteIndexSafe } from '@/components/palette'
import { CollectibleID } from '@/model/schema'
import { getOutOfBoundsMessage } from '@/resources/content/hud'
import { ringIndexToKey } from '@/utils/rings'

import {
  type CreateGameStoreParams,
  GameMode,
  type GameSliceCreator,
  type PlayerSlice,
  type PlayerStatus,
  RingCollection,
  type RingIndex,
} from './types'

export const PLAYER_INITIAL_POSITION: Vector3Tuple = [0, 4, 0]
export const PLAYER_SPEED_BASE = 8.0 // units per second
export const PLAYER_SPEED_MAX = 11.0
const RING_SPEED_INCREMENT = 0.5
const SPEED_COOLDOWN_S = 6.0
const COLLECTIBLE_DURATION_S = 1.5

export const RESET_PLAYER_STATE: Pick<
  PlayerSlice,
  | 'confirmingCollectible'
  | 'confirmingPaletteIndex'
  | 'collectedRings'
  | 'confirmationProgress'
  | 'hasCollectedAllRings'
  | 'playerSpeedUnits'
  | 'paletteIndex'
> = {
  confirmingCollectible: null,
  confirmingPaletteIndex: null,
  collectedRings: {},
  confirmationProgress: 0,
  hasCollectedAllRings: false,
  playerSpeedUnits: PLAYER_SPEED_BASE,
  paletteIndex: 0,
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

    let speedTween: GSAPTween | null = null
    let speedDecayTween: GSAPTween | null = null
    const speedTweenTarget = { value: PLAYER_SPEED_BASE }

    function increaseSpeed(increment: number) {
      speedDecayTween?.kill()
      speedTween?.kill()
      const targetValue = Math.min(PLAYER_SPEED_MAX, speedTweenTarget.value + increment)
      speedTween = gsap.to(speedTweenTarget, {
        duration: 0.25,
        ease: 'none',
        value: targetValue,
        onUpdate: () => {
          set({ playerSpeedUnits: speedTweenTarget.value })
        },
        onComplete: () => {
          speedDecayTween = gsap.to(speedTweenTarget, {
            duration: SPEED_COOLDOWN_S,
            ease: 'none',
            value: PLAYER_SPEED_BASE,
            onUpdate: () => {
              set({ playerSpeedUnits: speedTweenTarget.value })
            },
          })
        },
      })
    }

    function resetSpeed() {
      speedDecayTween?.kill()
      speedTween?.kill()
      speedTween = gsap.to(speedTweenTarget, {
        duration: 0.25,
        ease: 'none',
        value: PLAYER_SPEED_BASE,
        onUpdate: () => {
          set({ playerSpeedUnits: speedTweenTarget.value })
        },
      })
    }

    return {
      ...RESET_PLAYER_STATE,
      collectedCollectibles: [],
      seenCollectibles: {},
      playerRespawnTick: 0,
      spawnPosition: null,
      playerStatus: 'idle' as PlayerStatus,
      outOfBoundsEvents: [],
      username: null,
      isSubscribed: false,
      paletteIndex: RESET_PLAYER_STATE.paletteIndex,
      confirmingPaletteIndex: RESET_PLAYER_STATE.confirmingPaletteIndex,
      setUsername: (username: string) => {
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
        const totalRingsCount = get().totalCounts.rings
        const newCollectedRings: RingCollection = { ...get().collectedRings, [ringKey]: true }

        const playerRingsCount = Object.keys(newCollectedRings).length
        const hasCollectedAllRings = playerRingsCount >= totalRingsCount
        if (hasCollectedAllRings) {
          console.warn('All rings collected!')
        }

        increaseSpeed(RING_SPEED_INCREMENT)

        set({ collectedRings: newCollectedRings, hasCollectedAllRings })
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
      respawnPlayer: (position, hud) => {
        get().stopConfirmation()
        set((s) => ({
          playerStatus: 'respawning',
          playerRespawnTick: s.playerRespawnTick + 1,
          spawnPosition: position,
          cameraLookAtPosition: null,
          hudIndicator: hud ?? s.hudIndicator,
        }))
      },
      onRespawnComplete: () => {
        set({
          playerStatus: 'safe',
        })
      },
      onOutOfBounds: () => {
        const status = get().playerStatus
        if (status === 'out-of-bounds' || status === 'idle') return
        get().stopConfirmation()
        playSoundFX(SoundFX.OUT_OF_BOUNDS)
        resetSpeed()
        const mode = get().mode
        const outOfBoundsMessage =
          mode === GameMode.SPEEDRUN ? null : getOutOfBoundsMessage(get().outOfBoundsEvents)

        set((s) => ({
          playerStatus: 'out-of-bounds',
          spawnPosition: null, // Calculated in usePlayerRespawn hook
          cameraLookAtPosition: null,
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
