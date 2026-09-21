/* eslint-disable react-hooks/immutability */
'use client'

import { useTexture } from '@react-three/drei'
import { useFrame, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { uniformTexture } from 'three/tsl'
import type { PassNode } from 'three/webgpu'

import noiseTexture from '@/assets/textures/postprocessing/noise.webp'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import SceneWarmup from '@/components/SceneWarmup'
import { speedEffectsNode } from '@/components/postProcessing/speedEffectsPost'
import { usePlayerInput } from '@/hooks/usePlayerInput'
import usePlayerSpeed from '@/hooks/usePlayerSpeed'
import { PLAYER_SPEED_MAX } from '@/stores/playerSlice'
import { SPEED_SMOOTH_HALF_LIFE, stepSmoothedSpeed } from '@/utils/smoothedSpeed'

const EFFECTS_UNIFORM_SCOPE = 'postProcessing'

// The only animated value: the blur, edge noise and vignette all scale off it. Registration is what
// creates the node; the frame callback below writes it.
const createEffectsUniforms = () => ({
  uSpeed: 0,
})

/**
 * Speed-driven post-processing: radial blur, edge noise darkening and a vignette.
 *
 * R3F's default render job calls `state.renderPipeline.render()` when no user job claims the render
 * phase, so this deliberately registers no `useFrame` render job.
 */
const PostProcessing = () => {
  const noiseMap = useTexture(noiseTexture.src)
  // The effect nodes take texture nodes; the loaded Texture is stable for this component's life.
  const noiseNode = useMemo(() => uniformTexture(noiseMap), [noiseMap])
  const blurSamples = usePerformanceStore((s) => s.sceneConfig.postProcessing.blurSamples)
  const { input } = usePlayerInput()
  const { speedUnits } = usePlayerSpeed()
  const smoothedSpeed = useRef(0)

  // The pass the warmup host compiles against. Published as a fresh ref object whenever the
  // pipeline (re)builds so the warmup effect re-runs; the callbacks below run in a layout effect.
  const [scenePassRef, setScenePassRef] = useState<RefObject<PassNode | null> | null>(null)
  const compilationRef = useRef<Promise<void> | null>(null)

  // Registered and read back in one call. The reader form (`useUniforms<EffectsUniforms>(SCOPE)`) only
  // sees the committed store, so it returns an empty scope on the first render — and both the
  // pipeline callback and the frame callback below would close over an undefined node.
  const { uSpeed } = useUniforms(createEffectsUniforms, EFFECTS_UNIFORM_SCOPE)

  const isEnabled = blurSamples > 0

  // The blur loop bound is fixed when the graph is built, so read it at build time rather than
  // capturing it into a callback whose identity would change on every quality change.
  const blurSamplesRef = useRef(blurSamples)
  blurSamplesRef.current = blurSamples

  const { rebuild } = useRenderPipeline(({ renderPipeline, passes }) => {
    setScenePassRef({ current: passes.scenePass })
    renderPipeline.outputColorTransform = false
    renderPipeline.outputNode = isEnabled
      ? speedEffectsNode({
          sceneColor: passes.scenePass.getTextureNode(),
          uSpeed,
          noiseTexture: noiseNode,
          stepCount: blurSamplesRef.current,
        })
      : passes.scenePass
  })

  // A change to the quality tier sizes the blur loop, which is a structural graph change.
  useEffect(() => {
    rebuild()
  }, [blurSamples, rebuild])

  useFrame((_, delta) => {
    const inputZ = input.current.up - input.current.down
    const targetSpeed = Math.max(
      -1,
      Math.min(1, (inputZ * speedUnits.current) / PLAYER_SPEED_MAX),
    )
    stepSmoothedSpeed(smoothedSpeed, targetSpeed, delta, SPEED_SMOOTH_HALF_LIFE)
    uSpeed.value = smoothedSpeed.current
  })

  return <SceneWarmup scenePassRef={scenePassRef} compilationRef={compilationRef} />
}

export default PostProcessing
