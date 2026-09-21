'use client'

import { useThree } from '@react-three/fiber/webgpu'
import { type FC, type RefObject, useEffect, useRef } from 'react'
import type { PassNode } from 'three/webgpu'

import { useGameStore } from '@/components/GameProvider'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { useSceneWarmup } from '@/hooks/useSceneWarmup'

type Props = {
  scenePassRef: RefObject<PassNode | null> | null
  compilationRef: RefObject<Promise<void> | null>
}

type FrameloopMode = 'always' | 'demand' | 'never'

/**
 * Compiles mounted content (including off-camera meshes) against the postprocessing scene pass once
 * the platform content is ready, keeping the landing overlay closed until the compile settles.
 *
 * Unlike the Threenix landing scene, this scene renders automatically (no render-phase useFrame job
 * to guard with `compilationRef`), so the frame loop is paused around the compile instead.
 */
const SceneWarmup: FC<Props> = ({ scenePassRef, compilationRef }) => {
  const isPlatformReady = useGameStore((s) => s.isPlatformReady)
  const setIsWarmupComplete = useGameStore((s) => s.setIsWarmupComplete)
  const sceneQuality = usePerformanceStore((s) => s.sceneQuality)
  const setFrameloop = useThree((s) => s.setFrameloop)
  const invalidate = useThree((s) => s.invalidate)
  const get = useThree((s) => s.get)

  // Non-null while warmup owns the paused frame loop; holds the mode to restore.
  // A cancelled run is immediately replaced by a re-queued one whose onWarmupStart fires while the
  // loop is already paused, so the prior mode must be captured once rather than per start.
  const frameloopBeforeWarmupRef = useRef<FrameloopMode | null>(null)

  useSceneWarmup({
    isSceneReady: isPlatformReady,
    scenePassRef,
    compilationRef,
    revision: sceneQuality,
    onWarmupStart: () => {
      setIsWarmupComplete(false)
      if (frameloopBeforeWarmupRef.current === null) {
        frameloopBeforeWarmupRef.current = get().frameloop
        setFrameloop('never')
      }
    },
    onWarmupComplete: () => {
      if (frameloopBeforeWarmupRef.current !== null) {
        setFrameloop(frameloopBeforeWarmupRef.current)
        frameloopBeforeWarmupRef.current = null
      }
      invalidate()
      setIsWarmupComplete(true)
    },
  })

  // A run cancelled by unmount never reports completion, so restore the loop here rather than
  // leaving the Canvas frozen.
  useEffect(() => {
    return () => {
      if (frameloopBeforeWarmupRef.current !== null) {
        setFrameloop(frameloopBeforeWarmupRef.current)
        frameloopBeforeWarmupRef.current = null
      }
    }
  }, [setFrameloop])

  return null
}

export default SceneWarmup
