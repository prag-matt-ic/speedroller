'use client'

import { useLocalNodes } from '@react-three/tsl'
import { float, vertexStage } from 'three/tsl'
import type { Node } from 'three/webgpu'

import { CORE_UNIFORM_SCOPE } from '@/components/coreUniforms'
import { fadeInOut } from '@/resources/tsl/fadeInOut'

// Threenix's route fade, adapted to the straight course's world Z and shared game uniform.
export const useRouteFadeIn = (targetWorldZ: number | Node<'float'>, enabled = true): Node<'float'> =>
  useLocalNodes(({ uniforms }) => {
    if (!enabled) return { opacityNode: float(1) }
    const { uPlayerWorldPos } = uniforms.scope(CORE_UNIFORM_SCOPE)
    const target = typeof targetWorldZ === 'number' ? float(targetWorldZ) : targetWorldZ
    return { opacityNode: vertexStage(fadeInOut(uPlayerWorldPos.z, target)) }
  }, [targetWorldZ, enabled]).opacityNode
