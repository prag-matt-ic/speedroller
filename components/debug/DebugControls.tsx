'use client'

import { WrenchIcon } from 'lucide-react'
import { type ChangeEvent, type FC, type ReactNode, useState } from 'react'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import {
  SCENE_QUALITY_ORDER,
  SceneQuality,
  usePerformanceStore,
} from '@/components/PerformanceProvider'
import { GameMode, Overlay } from '@/stores/types'
import { DEFAULT_MAX_DPR, MAX_DPR } from '@/utils/dpr'
import { rowToWorldZ } from '@/utils/tiles'

type Option<T> = {
  label: string
  value: T
}

// const SIM_FPS_OPTIONS: Option<RapierSimFPS>[] = [
//   { label: 'Adaptive', value: 0 },
//   { label: '30 fps', value: 30 },
//   { label: '60 fps', value: 60 },
//   { label: '120 fps', value: 120 },
// ]

const DPR_OPTIONS: Option<number>[] = [
  { label: '0.5', value: 0.5 },
  { label: '0.75', value: 0.75 },
  { label: '1.0', value: 1 },
  { label: '1.5 (default)', value: DEFAULT_MAX_DPR },
  { label: '2.0 (max)', value: MAX_DPR },
]

const GAME_MODE_OPTIONS: Option<GameMode>[] = [
  { label: 'Speedrun', value: GameMode.SPEEDRUN },
  { label: 'Dev', value: GameMode.DEV },
]

const OVERLAY_OPTIONS: Option<Overlay>[] = Object.values(Overlay).map((value) => ({
  label: value.charAt(0).toUpperCase() + value.slice(1),
  value,
}))

const DebugControls: FC = () => {
  const respawnPlayer = useGameStore((s) => s.respawnPlayer)
  const sceneQuality = usePerformanceStore((s) => s.sceneQuality)
  const setSceneQuality = usePerformanceStore((s) => s.setSceneQuality)
  const maxDpr = usePerformanceStore((s) => s.maxDPR)
  const setMaxDpr = usePerformanceStore((s) => s.setMaxDpr)
  const mode = useGameStore((s) => s.mode)
  const isPhysicsDebug = usePerformanceStore((s) => s.isPhysicsDebug)
  const setIsPhysicsDebug = usePerformanceStore((s) => s.setIsPhysicsDebug)
  const isNeutralToneMapping = usePerformanceStore((s) => s.isNeutralToneMapping)
  const setIsNeutralToneMapping = usePerformanceStore((s) => s.setIsNeutralToneMapping)
  const resetGame = useGameStore((s) => s.resetGame)
  const overlay = useGameStore((s) => s.overlay)
  const setOverlay = useGameStore((s) => s.setOverlay)

  const [isOpen, setIsOpen] = useState(true)

  const handleQualityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.target.blur()
    setSceneQuality(event.target.value as SceneQuality)
  }

  const handleDprChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.target.blur()
    setMaxDpr(Number(event.target.value))
  }

  const handleModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.target.blur()
    resetGame({ mode: event.target.value as GameMode })
  }

  const handlePhysicsDebugChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.target.blur()
    setIsPhysicsDebug(event.target.value === 'true')
  }

  const handleOverlayChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.target.blur()
    setOverlay(event.target.value as Overlay)
  }

  return (
    <div className="fixed bottom-24 left-0 z-5001 max-w-56 space-y-2 bg-black p-1 text-xs text-white">
      {isOpen && (
        <>
          <button className="block" disabled={mode !== GameMode.SPEEDRUN} onClick={() => respawnPlayer([0, 1, rowToWorldZ(632)])}>
            Inspect recovery in game
          </button>
          <a className="block" href="/dev/recovery" target="_blank" rel="noreferrer">Pillar orbit inspection</a>
          <SelectRow
            id="performance-debug-scene-quality"
            label="Quality"
            value={sceneQuality}
            onChange={handleQualityChange}>
            {[...SCENE_QUALITY_ORDER].reverse().map((quality) => (
              <option key={quality} value={quality}>
                {quality}
              </option>
            ))}
          </SelectRow>
          <SelectRow
            id="performance-debug-dpr"
            label="DPR"
            value={maxDpr.toString()}
            onChange={handleDprChange}>
            {DPR_OPTIONS.map((option) => (
              <option key={option.label} value={option.value.toString()}>
                {option.label}
              </option>
            ))}
          </SelectRow>
          <SelectRow
            id="performance-debug-physics"
            label="Physics Debug"
            value={isPhysicsDebug ? 'true' : 'false'}
            onChange={handlePhysicsDebugChange}>
            <option value="false">Off</option>
            <option value="true">On</option>
          </SelectRow>
          <SelectRow
            id="performance-debug-tone-mapping"
            label="Tone Mapping"
            value={isNeutralToneMapping ? 'neutral' : 'none'}
            onChange={(event) => {
              event.target.blur()
              setIsNeutralToneMapping(event.target.value === 'neutral')
            }}>
            <option value="none">NoToneMapping</option>
            <option value="neutral">NeutralToneMapping</option>
          </SelectRow>
          <SelectRow
            id="performance-debug-overlays"
            label="Overlay"
            value={overlay}
            onChange={handleOverlayChange}>
            {OVERLAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectRow>
          <SelectRow
            id="performance-debug-mode"
            label="Mode"
            value={mode}
            onChange={handleModeChange}>
            {GAME_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectRow>
        </>
      )}

      <button aria-label="Toggle debug controls" onClick={() => setIsOpen((prev) => !prev)}>
        <WrenchIcon />
      </button>
    </div>
  )
}

type SelectRowProps = {
  id: string
  label: string
  value: string
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void
  children: ReactNode
}

const SelectRow: FC<SelectRowProps> = ({ id, label, value, onChange, children }) => {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="font-semibold text-white/70">{label}</span>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className={twJoin(
          'min-w-32 rounded border border-white/10 bg-white/10 px-2 py-1 text-right text-xs text-white transition outline-none',
          'focus:border-white/40 focus:bg-white/20 focus:shadow-inner',
        )}>
        {children}
      </select>
    </label>
  )
}

export default DebugControls
