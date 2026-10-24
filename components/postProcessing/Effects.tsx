/* eslint-disable react-hooks/immutability */
'use client'

import { useFrame, useTexture, useThree } from '@react-three/fiber'
import { useRenderPipeline, useUniforms } from '@react-three/tsl'
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import BloomNode, { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { emissive, mrt, output, uniformTexture, vec4 } from 'three/tsl'
import { NeutralToneMapping, NoToneMapping, type PassNode } from 'three/webgpu'

import noiseTexture from '@/assets/textures/postprocessing/noise.webp'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import SceneWarmup from '@/components/SceneWarmup'
import { speedEffectsNode } from '@/components/postProcessing/speedEffectsPost'
import usePlayerSpeed from '@/hooks/usePlayerSpeed'
import { RACE_MAX_SPEED } from '@/utils/platform/raceSpeed'
import { SPEED_SMOOTH_HALF_LIFE, stepSmoothedSpeed } from '@/utils/smoothedSpeed'

const EFFECTS_UNIFORM_SCOPE = 'postProcessing'

// Selective bloom. Materials publish their glow through the emissive MRT attachment, so only the
// player, trail and rings contribute. BloomNode is three's half-resolution mip-chain bloom.
const BLOOM_STRENGTH = 0.8
const BLOOM_RADIUS = 0.25
const BLOOM_THRESHOLD = 0

// The only animated value: the blur, edge noise and vignette all scale off it. Registration is what
// creates the node; the frame callback below writes it.
const createEffectsUniforms = () => ({
  uSpeed: 0,
})

/**
 * Speed-driven post-processing: selective bloom from the emissive MRT, then radial blur, edge noise
 * darkening and a vignette.
 *
 * R3F's default render job calls `state.renderPipeline.render()` when no user job claims the render
 * phase, so this deliberately registers no `useFrame` render job.
 */
const PostProcessing = () => {
  const renderer = useThree((state) => state.renderer)
  const isNeutralToneMapping = usePerformanceStore((s) => s.isNeutralToneMapping)
  useLayoutEffect(() => {
    // RenderPipeline detects this change and updates its final output transform automatically.
    renderer.toneMapping = isNeutralToneMapping ? NeutralToneMapping : NoToneMapping
  }, [renderer, isNeutralToneMapping])

  const noiseMap = useTexture(noiseTexture.src)
  // The effect nodes take texture nodes; the loaded Texture is stable for this component's life.
  const noiseNode = useMemo(() => uniformTexture(noiseMap), [noiseMap])
  const blurSamples = usePerformanceStore((s) => s.sceneConfig.postProcessing.blurSamples)
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

  // BloomNode owns its mip-chain render targets, so a rebuilt graph must dispose the outgoing one.
  const bloomNodeRef = useRef<BloomNode | null>(null)

  const { renderPipeline, rebuild } = useRenderPipeline(
    ({ renderPipeline: pipeline, passes }) => {
      setScenePassRef({ current: passes.scenePass })
      pipeline.outputColorTransform = true

      bloomNodeRef.current?.dispose()
      const bloomNode = bloom(
        passes.scenePass.getTextureNode('emissive'),
        BLOOM_STRENGTH,
        BLOOM_RADIUS,
        BLOOM_THRESHOLD,
      )
      bloomNodeRef.current = bloomNode

      const sceneColor = passes.scenePass.getTextureNode('output')
      const effects = isEnabled
        ? speedEffectsNode({
            sceneColor,
            uSpeed,
            noiseTexture: noiseNode,
            stepCount: blurSamplesRef.current,
          })
        : sceneColor

      // Add the bloom before the output transform so the halo shares the scene's colour space.
      pipeline.outputNode = vec4(effects.rgb.add(bloomNode.rgb), effects.a)
    },
    // Selective bloom: the emissive attachment only receives materials that set an emissive node.
    // Multiply by output alpha because non-output MRT attachments are unblended.
    ({ passes }) => {
      passes.scenePass.setMRT(mrt({ output, emissive: emissive.mul(output.a) }))
    },
  )

  // A change to the quality tier sizes the blur loop, which is a structural graph change.
  useEffect(() => {
    rebuild()
  }, [blurSamples, rebuild])

  useEffect(() => {
    if (!renderPipeline) return

    return () => {
      bloomNodeRef.current?.dispose()
      bloomNodeRef.current = null
    }
  }, [renderPipeline])

  useFrame((_, delta) => {
    // The player publishes forward speed: signed while the lobby is played manually, positive
    // during the automatic race. Normalising by the race cap keeps both on one curve.
    const targetSpeed = Math.max(-1, Math.min(1, speedUnits.current / RACE_MAX_SPEED))
    stepSmoothedSpeed(smoothedSpeed, targetSpeed, delta, SPEED_SMOOTH_HALF_LIFE)
    uSpeed.value = smoothedSpeed.current
  })

  return <SceneWarmup scenePassRef={scenePassRef} compilationRef={compilationRef} />
}

export default PostProcessing
