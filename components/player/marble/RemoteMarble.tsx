'use client'

import { useFrame } from '@react-three/fiber'
import { type RefObject, useRef } from 'react'
import type { Mesh } from 'three/webgpu'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { GalaxyMarble } from './GalaxyMarble'

export function RemoteMarble({ ref, colour }: { ref: RefObject<Mesh | null>; colour: string }) {
  const surface = useCourseSurface()
  const quality = usePerformanceStore((state) => state.sceneConfig.marble)
  const animationTime = useRef(0)
  useFrame((_, delta) => {
    animationTime.current += delta
  })
  return (
    <GalaxyMarble
      ref={ref}
      colour={colour}
      animationTime={animationTime}
      surface={surface}
      {...quality}
      visible={false}
    />
  )
}
