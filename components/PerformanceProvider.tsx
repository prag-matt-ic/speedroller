import { type FC, type PropsWithChildren, createContext, useContext, useState } from 'react'
import { type StoreApi, createStore, useStore } from 'zustand'

export type RapierSimFPS = 0 | 30 | 60 | 120 // 0 = 'vary'

export enum SceneQuality {
  ULTRA = 'Ultra',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export type SceneConfig = {
  isDistanceFadeEnabled: boolean
  marble: {
    segments: number
    isFlat: boolean
    enableVeins: boolean
  }
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

const SCENE_CONFIGS: Record<SceneQuality, SceneConfig> = {
  [SceneQuality.ULTRA]: {
    isDistanceFadeEnabled: true,
    marble: { segments: 80, isFlat: false, enableVeins: true },
    ring: { radialSegments: 24, tubularSegments: 48 },
    gem: { particleCount: 180 },
    floatingTiles: { instanceCount: Math.pow(13, 2) },
    platformTiles: { addDetailNoise: true },
    colourTile: { useNoise: true },
    floatingHeading: { shouldRotate: true, useNoiseFade: true },
    infoZoneSphere: { segments: 64, enableVeins: true },
    confetti: { particleCount: 240 },
    postProcessing: { blurSamples: 24 },
    particles: { fps: 0 },
  },
  [SceneQuality.HIGH]: {
    isDistanceFadeEnabled: true,
    marble: { segments: 64, isFlat: false, enableVeins: true },
    ring: { radialSegments: 16, tubularSegments: 32 },
    gem: { particleCount: 160 },
    floatingTiles: { instanceCount: Math.pow(13, 2) },
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
    marble: { segments: 40, isFlat: false, enableVeins: false },
    ring: { radialSegments: 8, tubularSegments: 16 },
    gem: { particleCount: 80 },
    floatingTiles: { instanceCount: Math.pow(8, 2) },
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
    marble: { segments: 24, isFlat: true, enableVeins: false },
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
  maxDPR: number | undefined
  simFps: RapierSimFPS
  sceneQuality: SceneQuality
  sceneConfig: SceneConfig
  onPerformanceChange: (up: boolean) => void
  setSimFps: (fps: RapierSimFPS) => void
  setSceneQuality: (quality: SceneQuality) => void
  setMaxDpr: (value: number | undefined) => void
  hasBeenManuallySet: boolean
  isPhysicsDebug: boolean
  setIsPhysicsDebug: (value: boolean) => void
}

type PerformanceStore = StoreApi<PerformanceState>

const PerformanceContext = createContext<PerformanceStore>(undefined!)

const createPerformanceStore = (initialState: Pick<PerformanceState, 'isMobile'>) => {
  const initialQualityMode = initialState.isMobile ? SceneQuality.MEDIUM : SceneQuality.HIGH

  logPerformanceDebug('creating store', { ...initialState, initialQualityMode })

  return createStore<PerformanceState>((set, get) => ({
    isMobile: initialState.isMobile,
    maxDPR: undefined,
    simFps: 0,
    sceneQuality: initialQualityMode,
    sceneConfig: SCENE_CONFIGS[initialQualityMode],
    hasBeenManuallySet: false,
    isPhysicsDebug: false,
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
    setMaxDpr: (value: number | undefined) => {
      const previous = get().maxDPR
      logPerformanceDebug('maxDPR override updated', { previous, next: value })
      set({
        maxDPR: value,
      })
    },
    setIsPhysicsDebug: (value: boolean) => {
      const previous = get().isPhysicsDebug
      if (previous === value) return
      logPerformanceDebug('isPhysicsDebug updated', { previous, next: value })
      set({ isPhysicsDebug: value })
    },
    onPerformanceChange: (up: boolean) => {
      const { sceneQuality, hasBeenManuallySet, maxDPR } = get()
      if (hasBeenManuallySet) return

      const order = Object.values(SceneQuality).reverse() // [Low, Medium, High]
      const currentIndex = order.indexOf(sceneQuality)
      const nextIndex = Math.min(order.length - 1, Math.max(0, currentIndex + (up ? 1 : -1)))
      const nextMode = order[nextIndex]

      if (nextMode === sceneQuality) {
        const shouldDropDPR =
          !up && sceneQuality === SceneQuality.LOW && (maxDPR === undefined || maxDPR > 1)
        if (!shouldDropDPR) return
        logPerformanceDebug('maxDPR reduced')
        set((prev) => ({
          maxDPR: prev.maxDPR === undefined ? 1.5 : 1,
        }))
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
