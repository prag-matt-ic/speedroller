'use client'
import {
  type FC,
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import { type StoreApi, createStore, useStore } from 'zustand'
import { persist } from 'zustand/middleware'

export enum SoundFX {
  COUNTDOWN = 'COUNTDOWN',
  BACKGROUND = 'BACKGROUND',
  BACKGROUND_SPEEDRUN = 'BACKGROUND_SPEEDRUN',
  OUT_OF_BOUNDS = 'OUT_OF_BOUNDS',
  OPEN_INFO = 'OPEN_INFO',
  CHANGE_COLOUR = 'CHANGE_COLOUR',
  RING_COLLECTED = 'RING_COLLECTED',
  CONFETTI_BURST = 'CONFETTI_BURST',
}

const SOUND_FILES: Record<SoundFX, string> = {
  [SoundFX.COUNTDOWN]: '/audio/grenade-countdown.aac',
  [SoundFX.BACKGROUND]: '/audio/music/on-my-way.mp3',
  [SoundFX.BACKGROUND_SPEEDRUN]: '/audio/music/alluminium.mp3',
  [SoundFX.OPEN_INFO]: '/audio/reveal.aac',
  // TODO: Add Collectible unlocking sound effect
  [SoundFX.CHANGE_COLOUR]: '/audio/transform.aac',
  [SoundFX.OUT_OF_BOUNDS]: '/audio/outofbounds.aac',
  [SoundFX.RING_COLLECTED]: '/audio/ring.aac',
  [SoundFX.CONFETTI_BURST]: '/audio/confetti.aac',
}

export type BackgroundTrackPhase = 'lobby' | 'race'

const BACKGROUND_TRACKS: Record<
  BackgroundTrackPhase,
  SoundFX.BACKGROUND | SoundFX.BACKGROUND_SPEEDRUN
> = {
  lobby: SoundFX.BACKGROUND,
  race: SoundFX.BACKGROUND_SPEEDRUN,
}

const BACKGROUND_TRACK_VOLUMES: Record<BackgroundTrackPhase, number> = {
  lobby: 0.35,
  race: 0.6,
}

type Buffers = Partial<Record<SoundFX, AudioBuffer>>
export type PlaySoundFX = (fx: SoundFX, loop?: boolean, volume?: number) => void

export type SoundState = {
  isLoading: boolean
  isMuted: boolean
  backgroundTrack: SoundFX | null
  backgroundTrackPhase: BackgroundTrackPhase
  setIsMuted: (isMuted: boolean) => void
  initialise: () => Promise<void>
  playSoundFX: PlaySoundFX
  stopSoundFX: (fx: SoundFX) => void
  stopAllSounds: () => void
  switchBackgroundTrack: (phase: BackgroundTrackPhase) => void
}

type PersistedSoundState = Pick<SoundState, 'isMuted'>

type SoundStore = StoreApi<SoundState>
const SoundContext = createContext<SoundStore>(undefined!)

const createSoundStore = () => {
  let audioContext: AudioContext | null = null
  let masterGain: GainNode | null = null
  let audioBuffers: Buffers = {}
  let initialisationPromise: Promise<void> | null = null

  const activeSources = new Set<AudioBufferSourceNode>()
  const gainNodesBySource = new Map<AudioBufferSourceNode, GainNode>()

  const DEFAULT_MASTER_GAIN = 0.5
  const STOP_FX_FADE_SECONDS = 0.3

  const safelyDisconnect = (node: AudioNode | null | undefined) => {
    if (!node) return
    try {
      node.disconnect()
    } catch {}
  }

  const cleanupSource = (source: AudioBufferSourceNode) => {
    const gainNode = gainNodesBySource.get(source)
    gainNodesBySource.delete(source)
    activeSources.delete(source)
    source.onended = null
    safelyDisconnect(source)
    safelyDisconnect(gainNode)
  }

  const registerSource = (source: AudioBufferSourceNode, gainNode: GainNode) => {
    activeSources.add(source)
    gainNodesBySource.set(source, gainNode)
    source.onended = () => {
      cleanupSource(source)
    }
  }

  const fadeOutSource = (source: AudioBufferSourceNode, duration: number) => {
    if (!audioContext) return
    const now = audioContext.currentTime
    const gainNode = gainNodesBySource.get(source)
    if (gainNode) {
      gainNode.gain.cancelScheduledValues(now)
      const currentValue = gainNode.gain.value
      gainNode.gain.setValueAtTime(currentValue, now)
      gainNode.gain.linearRampToValueAtTime(0, now + duration)
    }
    try {
      source.stop(now + duration)
    } catch (error) {
      console.error('[SoundProvider] Failed to stop sound source', source, error)
    }
  }

  const stopSourceImmediately = (source: AudioBufferSourceNode) => {
    try {
      source.stop()
    } catch (error) {
      console.error('[SoundProvider] Failed to stop sound source', source, error)
    } finally {
      cleanupSource(source)
    }
  }

  async function ensureContext() {
    if (!audioContext) {
      audioContext = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      )()
      masterGain = audioContext.createGain()
      masterGain.connect(audioContext.destination)
      masterGain.gain.value = DEFAULT_MASTER_GAIN
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    return { audioContext, masterGain }
  }

  async function loadAllSounds(): Promise<void> {
    const { audioContext } = await ensureContext()
    const loadedBuffers: [SoundFX, AudioBuffer][] = []

    const loadSound = async (fx: SoundFX, url: string) => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
        const arrayBuffer = await response.arrayBuffer()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        loadedBuffers.push([fx as SoundFX, audioBuffer])
      } catch (event) {
        console.error('[SoundProvider] Failed to load', fx, url, event)
      }
    }

    await Promise.all(
      Object.entries(SOUND_FILES).map(([fx, url]) => loadSound(fx as SoundFX, url)),
    )

    audioBuffers = Object.fromEntries(loadedBuffers)
  }

  return createStore<SoundState>()(
    persist<SoundState, [], [], PersistedSoundState>(
      (set, get) => ({
        isLoading: true,
        isMuted: true,
        backgroundTrack: null,
        backgroundTrackPhase: 'lobby',

        initialise: async () => {
          if (!initialisationPromise) {
            initialisationPromise = loadAllSounds().finally(() => set({ isLoading: false }))
          }
          await initialisationPromise
        },

        setIsMuted: (isMuted: boolean) => {
          const { backgroundTrackPhase, playSoundFX, stopAllSounds } = get()

          if (!isMuted) {
            const backgroundTrack = BACKGROUND_TRACKS[backgroundTrackPhase]
            const volume = BACKGROUND_TRACK_VOLUMES[backgroundTrackPhase]
            set({ backgroundTrack, isMuted: false })
            playSoundFX(backgroundTrack, true, volume)
            return
          }
          stopAllSounds()
          set({ backgroundTrack: null, isMuted: true })
        },

        stopAllSounds: () => {
          const sources = Array.from(activeSources)
          sources.forEach((source) => {
            const gainNode = gainNodesBySource.get(source)
            if (gainNode && audioContext) {
              const now = audioContext.currentTime
              gainNode.gain.cancelScheduledValues(now)
            }
            stopSourceImmediately(source)
          })
          gainNodesBySource.clear()
          activeSources.clear()
        },

        switchBackgroundTrack: (phase: BackgroundTrackPhase) => {
          set({ backgroundTrackPhase: phase })

          const { backgroundTrack, isMuted, stopSoundFX, playSoundFX } = get()
          if (isMuted) return

          const newBackgroundTrack = BACKGROUND_TRACKS[phase]
          if (backgroundTrack === newBackgroundTrack) return

          if (backgroundTrack === SoundFX.BACKGROUND) {
            stopSoundFX(SoundFX.BACKGROUND)
          } else if (backgroundTrack === SoundFX.BACKGROUND_SPEEDRUN) {
            stopSoundFX(SoundFX.BACKGROUND_SPEEDRUN)
          }

          // small buffer to ensure clean transition
          setTimeout(() => {
            if (get().isMuted) return // Don't play if muted during the delay
            playSoundFX(newBackgroundTrack, true, BACKGROUND_TRACK_VOLUMES[phase])
          }, STOP_FX_FADE_SECONDS * 1000)

          set({ backgroundTrack: newBackgroundTrack })
        },

        playSoundFX: async (fx: SoundFX, loop: boolean = false, volume: number = 1) => {
          if (get().isMuted) return

          const startPlayback = async () => {
            await ensureContext()
            if (!audioBuffers[fx]) {
              await get().initialise()
            }
            const audioBuffer = audioBuffers[fx]
            if (!audioBuffer) {
              console.error(`[SoundProvider] Missing buffer for ${fx} after init`)
              return
            }
            const bufferSource = audioContext!.createBufferSource()
            bufferSource.buffer = audioBuffer
            bufferSource.loop = loop
            const gainNode = audioContext!.createGain()
            gainNode.gain.value = volume
            bufferSource.connect(gainNode)
            gainNode.connect(masterGain!)
            registerSource(bufferSource, gainNode)
            bufferSource.start(0)
          }

          try {
            await startPlayback()
          } catch (err) {
            console.error(`[SoundProvider] Failed to play ${fx}`, err)
          }
        },

        stopSoundFX: (fx: SoundFX) => {
          if (!audioContext) return
          activeSources.forEach((source) => {
            if (!source.buffer) return
            if (audioBuffers[fx] !== source.buffer) return
            fadeOutSource(source, STOP_FX_FADE_SECONDS)
          })
        },
      }),
      {
        name: 'speedroller-sound',
        partialize: (state) => ({ isMuted: state.isMuted }),
      },
    ),
  )
}

export const SoundProvider: FC<PropsWithChildren> = ({ children }) => {
  const [soundStore] = useState<SoundStore>(createSoundStore())

  useEffect(() => {
    const initialiseAudio = async () => {
      try {
        await soundStore.getState().initialise()
      } catch (error) {
        console.error('[SoundProvider] Audio initialisation failed', error)
      }
    }
    initialiseAudio()
  }, [soundStore])

  return <SoundContext value={soundStore}>{children}</SoundContext>
}

export function useSoundStore<T>(selector: (state: SoundState) => T): T {
  const soundStore = useContext(SoundContext)
  if (!soundStore) throw new Error('Missing SoundContext.Provider in the tree')
  return useStore(soundStore, selector)
}
