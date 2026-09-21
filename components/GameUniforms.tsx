'use client'

import { useUniforms } from '@react-three/fiber/webgpu'
import { type FC } from 'react'

import { CORE_UNIFORM_SCOPE, createCoreUniforms } from '@/components/coreUniforms'

// Registers the shared game uniforms. Mounted above every consumer in `Game.tsx` so the scope is
// committed before the graphs that read it are built.
const GameUniforms: FC = () => {
  useUniforms(createCoreUniforms, CORE_UNIFORM_SCOPE)
  return null
}

export default GameUniforms
