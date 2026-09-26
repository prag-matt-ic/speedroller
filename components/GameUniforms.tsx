'use client'

import { useUniforms } from '@react-three/fiber/webgpu'
import { type FC, useCallback } from 'react'
import { type Vector3Tuple } from 'three'

import { CORE_UNIFORM_SCOPE, createCoreUniforms } from '@/components/coreUniforms'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'

// Registers the shared game uniforms. Mounted above every consumer in `Game.tsx` so the scope is
// committed before the graphs that read it are built.
const GameUniforms: FC = () => {
  const { uPlayerWorldPos } = useUniforms(createCoreUniforms, CORE_UNIFORM_SCOPE)
  const updatePlayerPosition = useCallback((position: Vector3Tuple) => {
    uPlayerWorldPos.value.set(position[0], position[1], position[2])
  }, [uPlayerWorldPos])
  usePlayerPosition(updatePlayerPosition)
  return null
}

export default GameUniforms
