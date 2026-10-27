import { type FC, type PropsWithChildren, createContext, useContext, useState } from 'react'
import { type StoreApi, createStore, useStore } from 'zustand'

import type { GalaxyQuality } from '@/components/player/marble/galaxySettings'

import { DEFAULT_MAX_DPR, MIN_AUTO_DPR, stepMaxDprDown } from '@/utils/dpr'

export type RapierSimFPS = 0 | 30 | 60 | 120 // 0 = 'vary'

export enum SceneQuality {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

/** Lowest to highest; the order the automatic quality ladder walks. */
export const SCENE_QUALITY_ORDER = [
  SceneQuality.LOW,
  SceneQuality.MEDIUM,
  SceneQuality.HIGH,
] as const satisfies readonly SceneQuality[]

export type SceneConfig = {
  isDistanceFadeEnabled: boolean
  marble: GalaxyQuality
  ring: {
    radialSegments: number
    tubularSegments: number
  }
  gem: {
    particleCount: number
  }
  floatingTiles: {
    instanceCount: number
  }
  platformTiles: {
    addDetailNoise: boolean
  }
  colourTile: {
    useNoise: boolean
  }
  floatingHeading: {
    shouldRotate: boolean
    useNoiseFade: boolean
  }
  infoZoneSphere: {
    segments: number
    enableVeins: boolean
  }
  confetti: {
    particleCount: number
  }
  postProcessing: {
    blurSamples: number
  }
  particles: {
    /** Burst simulation updates per second (0 = every rendered frame). */
    fps: number
  }
}

const logPerformanceDebug = (...payload: unknown[]) => {
  if (process.env.NODE_ENV !== 'development') return
  console.warn('[PerformanceProvider]', ...payload)
}

// Floating scenery is temporarily disabled while the floor material is being refined.
export const SCENE_CONFIGS: Record<SceneQuality, SceneConfig> = {
  [SceneQuality.HIGH]: {
    isDistanceFadeEnabled: true,
    marble: { segments: 64, samples: 6, starCount: 24 },
    ring: { radialSegments: 16, tubularSegments: 32 },
    gem: { particleCount: 160 },
    floatingTiles: { instanceCount: 0 },
    platformTiles: { addDetailNoise: true },
    colourTile: { useNoise: true },
    floatingHeading: { shouldRotate: true, useNoiseFade: true },
    infoZoneSphere: { segments: 48, enableVeins: true },
    confetti: { particleCount: 160 },
    postProcessing: { blurSamples: 16 },
    particles: { fps: 60 },
  },
  [SceneQuality.MEDIUM]: {
    isDistanceFadeEnabled: true,
    marble: { segments: 40, samples: 4, starCount: 16 },
    ring: { radialSegments: 8, tubularSegments: 16 },
    gem: { particleCount: 80 },
    floatingTiles: { instanceCount: 0 },
    platformTiles: { addDetailNoise: false },
    colourTile: { useNoise: true },
    floatingHeading: { shouldRotate: false, useNoiseFade: true },
    infoZoneSphere: { segments: 32, enableVeins: false },
    confetti: { particleCount: 80 },
    postProcessing: { blurSamples: 8 },
    particles: { fps: 30 },
  },
  [SceneQuality.LOW]: {
    isDistanceFadeEnabled: false,
    marble: { segments: 24, samples: 3, starCount: 8 },
    ring: { radialSegments: 6, tubularSegments: 12 },
    gem: { particleCount: 40 },
    floatingTiles: { instanceCount: 0 },
    platformTiles: { addDetailNoise: false },
    colourTile: { useNoise: false },
    floatingHeading: { shouldRotate: false, useNoiseFade: false },
    infoZoneSphere: { segments: 20, enableVeins: false },
    confetti: { particleCount: 48 },
    postProcessing: { blurSamples: 0 },
    particles: { fps: 30 },
  },
}

type PerformanceState = {
  isMobile: boolean
  maxDPR: number
  simFps: RapierSimFPS
  sceneQuality: SceneQuality
  sceneConfig: SceneConfig
  onPerformanceChange: (up: boolean, currentDpr: number) => void
  setSimFps: (fps: RapierSimFPS) => void
  setSceneQuality: (quality: SceneQuality) => void
  setMaxDpr: (value: number) => void
  hasBeenManuallySet: boolean
  hasUsedMediumDprBuffer: boolean
  isPhysicsDebug: boolean
  setIsPhysicsDebug: (value: boolean) => void
  isNeutralToneMapping: boolean
  setIsNeutralToneMapping: (value: boolean) => void
}

type PerformanceStore = StoreApi<PerformanceState>

const PerformanceContext = createContext<PerformanceStore>(undefined!)

const createPerformanceStore = (initialState: Pick<PerformanceState, 'isMobile'>) => {
  const initialQualityMode = initialState.isMobile ? SceneQuality.MEDIUM : SceneQuality.HIGH

  logPerformanceDebug('creating store', { ...initialState, initialQualityMode })

  return createStore<PerformanceState>((set, get) => ({
    isMobile: initialState.isMobile,
    maxDPR: DEFAULT_MAX_DPR,
    simFps: 0,
    sceneQuality: initialQualityMode,
    sceneConfig: SCENE_CONFIGS[initialQualityMode],
    hasBeenManuallySet: false,
    hasUsedMediumDprBuffer: false,
    isPhysicsDebug: false,
    isNeutralToneMapping: true,
    setIsNeutralToneMapping: (value) => set(() => ({ isNeutralToneMapping: value })),
    setSimFps: (fps: RapierSimFPS) => {
      set({ simFps: fps })
    },
    setSceneQuality: (quality: SceneQuality) => {
      if (quality === get().sceneQuality) return
      set({
        sceneQuality: quality,
        sceneConfig: SCENE_CONFIGS[quality],
        hasBeenManuallySet: true,
      })
    },
    setMaxDpr: (value: number) => {
      const previous = get().maxDPR
      if (previous === value) return
      logPerformanceDebug('maxDPR override updated', { previous, next: value })
      set({
        maxDPR: value,
        hasBeenManuallySet: true,
      })
    },
    setIsPhysicsDebug: (value: boolean) => {
      const previous = get().isPhysicsDebug
      if (previous === value) return
      logPerformanceDebug('isPhysicsDebug updated', { previous, next: value })
      set({ isPhysicsDebug: value })
    },
    onPerformanceChange: (up: boolean, currentDpr: number) => {
      const { sceneQuality, hasBeenManuallySet, hasUsedMediumDprBuffer } = get()
      if (hasBeenManuallySet) return

      // Spend resolution at medium before dropping to low, so the effects survive the decline.
      const shouldDropMediumDpr =
        !up &&
        sceneQuality === SceneQuality.MEDIUM &&
        !hasUsedMediumDprBuffer &&
        currentDpr > MIN_AUTO_DPR

      if (shouldDropMediumDpr) {
        logPerformanceDebug('maxDPR reduced at medium quality')
        set({
          hasUsedMediumDprBuffer: true,
          maxDPR: stepMaxDprDown(currentDpr),
        })
        return
      }

      const currentIndex = SCENE_QUALITY_ORDER.indexOf(sceneQuality)
      const nextIndex = Math.min(
        SCENE_QUALITY_ORDER.length - 1,
        Math.max(0, currentIndex + (up ? 1 : -1)),
      )
      const nextMode = SCENE_QUALITY_ORDER[nextIndex]

      if (nextMode === sceneQuality) {
        const shouldDropDpr = !up && sceneQuality === SceneQuality.LOW && currentDpr > MIN_AUTO_DPR
        if (!shouldDropDpr) return
        logPerformanceDebug('maxDPR reduced at low quality')
        set({ maxDPR: stepMaxDprDown(currentDpr) })
        return
      }

      logPerformanceDebug('sceneQuality auto adjusted', {
        direction: up ? 'up' : 'down',
        previous: sceneQuality,
        next: nextMode,
      })

      set({
        sceneQuality: nextMode,
        sceneConfig: SCENE_CONFIGS[nextMode],
        hasUsedMediumDprBuffer: false,
      })
    },
  }))
}

type Props = PropsWithChildren<{
  isMobile: boolean
}>

export const PerformanceProvider: FC<Props> = ({ children, isMobile }) => {
  const [store] = useState<PerformanceStore>(createPerformanceStore({ isMobile }))
  return <PerformanceContext value={store}>{children}</PerformanceContext>
}

export function usePerformanceStore<T>(selector: (state: PerformanceState) => T): T {
  const store = useContext(PerformanceContext)
  if (!store) throw new Error('Missing PerformanceProvider in the tree')
  return useStore(store, selector)
}

export function usePerformanceStoreAPI(): PerformanceStore {
  const store = useContext(PerformanceContext)
  if (!store) throw new Error('Missing PerformanceProvider in the tree')
  return store
}
