/* eslint-disable react-hooks/immutability */
'use client'

import { useUniforms } from '@react-three/tsl'
import { type FC, useCallback, useEffect } from 'react'
import { type Vector3Tuple } from 'three'

import { useGameStore } from '@/components/GameProvider'
import { CORE_UNIFORM_SCOPE, createCoreUniforms } from '@/components/coreUniforms'
import { useGameFrame } from '@/hooks/useGameFrame'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'

// Registers the shared game uniforms. Mounted above every consumer in `Game.tsx` so the scope is
// committed before the graphs that read it are built.
const GameUniforms: FC = () => {
  const { uPlayerWorldPos, uTime, uPlayerPaletteIndex } = useUniforms(
    createCoreUniforms,
    CORE_UNIFORM_SCOPE,
  )
  const paletteIndex = useGameStore((s) => s.paletteIndex)

  const updatePlayerPosition = useCallback((position: Vector3Tuple) => {
    uPlayerWorldPos.value.set(position[0], position[1], position[2])
  }, [uPlayerWorldPos])
  usePlayerPosition(updatePlayerPosition)

  // The game clock every material animates on. Writing the frame's `elapsed` here keeps the
  // shader time and the CPU timestamps written by frame jobs on the same clock.
  useGameFrame((state) => {
    uTime.value = state.elapsed
  })

  useEffect(() => {
    uPlayerPaletteIndex.value = paletteIndex
  }, [paletteIndex, uPlayerPaletteIndex])

  return null
}

export default GameUniforms
