'use client'

import { type FC, type RefObject, useMemo, useRef } from 'react'
import type { Mesh } from 'three'

import { useGameStore } from '@/components/GameProvider'
import { SceneQuality, usePerformanceStore } from '@/components/PerformanceProvider'
import { useConfirmationProgress } from '@/hooks/useConfirmationProgress'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import useGameFrame from '@/hooks/useGameFrame'
import usePlayerSpeed from '@/hooks/usePlayerSpeed'
import { RACE_MAX_SPEED } from '@/utils/platform/raceSpeed'
import { SPEED_SMOOTH_HALF_LIFE, stepSmoothedSpeed } from '@/utils/smoothedSpeed'

import { GalaxyMarble } from './GalaxyMarble'
import { GALAXY_DEFAULTS } from './galaxySettings'

type MarbleProps = { ref: RefObject<Mesh | null> }

export const Marble: FC<MarbleProps> = ({ ref }) => {
  const surface = useCourseSurface()
  const quality = usePerformanceStore((state) => state.sceneConfig.marble)
  const isLowQuality = usePerformanceStore((state) => state.sceneQuality === SceneQuality.LOW)
  const paletteIndex = useGameStore((state) => state.paletteIndex)
  const confirmingPaletteIndex = useGameStore((state) => state.confirmingPaletteIndex ?? -1)
  const { confirmationProgress } = useConfirmationProgress()
  const { speedUnits } = usePlayerSpeed()
  const animationTime = useRef(0)
  const smoothedSpeed = useRef(0)
  const settings = useMemo(() => ({ ...GALAXY_DEFAULTS, paletteIndex }), [paletteIndex])

  useGameFrame((_, deltaTime) => {
    animationTime.current += deltaTime
    stepSmoothedSpeed(
      smoothedSpeed,
      isLowQuality ? 0 : Math.min(1, Math.abs(speedUnits.current) / RACE_MAX_SPEED),
      deltaTime,
      SPEED_SMOOTH_HALF_LIFE,
    )
  })

  return (
    <GalaxyMarble
      ref={ref}
      settings={settings}
      animationTime={animationTime}
      {...quality}
      surface={surface}
      speed={smoothedSpeed}
      confirmingPaletteIndex={confirmingPaletteIndex}
      confirmationProgress={confirmationProgress}
    />
  )
}
