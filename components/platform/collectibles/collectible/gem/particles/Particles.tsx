/* eslint-disable react-hooks/immutability */
'use client'

import {
  type CreatorState,
  useFrame,
  useLocalNodes,
  useThree,
  useUniforms,
} from '@react-three/fiber/webgpu'
import gsap from 'gsap'
import { type FC, useCallback, useEffect, useId, useRef } from 'react'
import { float, shapeCircle, time, vertexStage } from 'three/tsl'
import { AdditiveBlending, type InstancedMesh, Sphere, Vector3, type Vector3Tuple } from 'three'
import type { UniformNode } from 'three/webgpu'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import {
  createGemParticleBuffers,
  createGemParticleRenderNodes,
  createGemParticleSimulation,
} from '@/components/platform/collectibles/collectible/gem/particles/gemParticleSimulation'
import { CollectibleID } from '@/model/schema'
import { GEMS_COLOURS_BY_ID, GOLD_PARTICLE_PALETTE } from '@/resources/colours'
import { fadeInOut } from '@/resources/tsl/fadeInOut'

const GEM_PARTICLE_UNIFORM_SCOPE = 'gemParticles'

type GemParticleUniforms = {
  uBurstProgress: UniformNode<'float', number>
  uGemScale: UniformNode<'float', number>
}

const createGemParticleUniforms = (gemScale: number) => () => ({
  uBurstProgress: 0,
  uGemScale: gemScale,
})

type Props = {
  id: CollectibleID
  tileWidth: number
  tileHeight: number
  wasConfirmed: boolean
  gemPosition: Vector3Tuple
  gemScale: number
  position?: Vector3Tuple
  isVisible: boolean
}

/**
 * Gem particles: a burst that lifts out of the tile and settles into a floating cloud inside the gem.
 * The static per-particle data is seeded once on the CPU when the buffers are created.
 */
const Particles: FC<Props> = ({
  id,
  tileWidth,
  tileHeight,
  wasConfirmed = false,
  gemPosition,
  gemScale,
  position = [0, 0, 0],
  isVisible,
}) => {
  const particleCount = usePerformanceStore((s) => s.sceneConfig.gem.particleCount)
  const particleFps = usePerformanceStore((s) => s.sceneConfig.particles.fps)
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)
  const renderer = useThree((s) => s.renderer)

  const progress = useRef({ value: 0 })
  const progressTween = useRef<GSAPTween | null>(null)
  const hasMounted = useRef(false)
  const previouslyConfirmed = useRef(false)

  const particlePalette = GEMS_COLOURS_BY_ID[id]?.particlesPalette ?? GOLD_PARTICLE_PALETTE

  // One burst system per gem: a shared scope would let one gem drive every gem's particles.
  const particleScope = `${GEM_PARTICLE_UNIFORM_SCOPE}_${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  const uniforms = useUniforms(
    createGemParticleUniforms(gemScale),
    particleScope,
  )
  const { uBurstProgress } = uniforms

  const createNodes = useCallback(
    ({ uniforms: scopedUniforms }: CreatorState) => {
      const scoped = scopedUniforms.scope<GemParticleUniforms>(particleScope)
      const { uPlayerWorldPos } = scopedUniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)
      const buffers = createGemParticleBuffers({
        count: particleCount,
        gemScale,
        tileWidth,
        tileHeight,
        origin: gemPosition,
        palette: particlePalette,
      })
      const motion = {
        uBurstProgress: scoped.uBurstProgress,
        uTime: time,
        uGemScale: scoped.uGemScale,
      }

      return {
        simulation: createGemParticleSimulation(buffers, motion),
        render: createGemParticleRenderNodes({
          buffers,
          motion,
          // The emitter's own z, shared with the shell it bursts out of.
          distanceFade: useDistanceFade ? vertexStage(fadeInOut(uPlayerWorldPos.z)) : float(1),
          palette: particlePalette,
        }),
      }
    },
    [gemPosition, gemScale, particleCount, particlePalette, particleScope, tileHeight, tileWidth, useDistanceFade],
  )

  const { simulation, render } = useLocalNodes(createNodes)

  useEffect(() => {
    return () => {
      simulation.updateParticles.dispose()
    }
  }, [simulation])

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      previouslyConfirmed.current = wasConfirmed
      progress.current.value = wasConfirmed ? 1 : 0
      uBurstProgress.value = progress.current.value
      return
    }

    const justConfirmed = wasConfirmed && !previouslyConfirmed.current
    previouslyConfirmed.current = wasConfirmed

    if (!justConfirmed) {
      if (!wasConfirmed && progress.current.value !== 0) {
        progressTween.current?.kill()
        progress.current.value = 0
        uBurstProgress.value = 0
      }
      return
    }

    progressTween.current?.kill()
    progress.current.value = 0
    uBurstProgress.value = 0

    progressTween.current = gsap.to(progress.current, {
      value: 1,
      duration: 1.3,
      ease: 'power2.out',
      onComplete: () => {
        progress.current.value = 1
        uBurstProgress.value = 1
      },
    })
  }, [wasConfirmed, uBurstProgress])

  useEffect(() => {
    return () => {
      progressTween.current?.kill()
    }
  }, [])

  // The burst is a pure function of `uBurstProgress`, so a capped update rate trades only
  // smoothness for compute time — no state is integrated across steps.
  useFrame(
    () => {
      uBurstProgress.value = progress.current.value
      // Before collection particles are transparent; after the burst the render node derives
      // their settled float from `time`. Only the active burst needs a compute dispatch.
      if (progress.current.value <= 0 || progress.current.value >= 1) return
      renderer.compute(simulation.updateParticles)
    },
    { fps: particleFps === 0 ? undefined : particleFps, enabled: isVisible },
  )

  const setAnimationBounds = useCallback((mesh: InstancedMesh | null) => {
    if (!mesh) return
    const horizontalExtent = Math.max(tileWidth, tileHeight) / 2 + gemScale * 8 * 0.25 + 1
    const verticalExtent = Math.max(gemPosition[1] + gemScale, Math.max(0.5, gemScale * 10) * 1.4 * 0.25 + gemScale * 8 * 0.25) + 1
    mesh.boundingSphere = new Sphere(new Vector3(), Math.hypot(horizontalExtent, verticalExtent, horizontalExtent))
  }, [gemPosition, gemScale, tileHeight, tileWidth])

  return (
    <instancedMesh
      ref={setAnimationBounds}
      args={[undefined, undefined, particleCount]}
      position={position}
      count={particleCount}
      visible={isVisible}>
      <planeGeometry args={[1, 1]} />
      <spriteNodeMaterial
        colorNode={render.colorNode}
        opacityNode={render.opacityNode}
        positionNode={render.positionNode}
        scaleNode={render.scaleNode}
        maskNode={shapeCircle()}
        transparent
        depthTest={false}
        blending={AdditiveBlending}
      />
    </instancedMesh>
  )
}

export default Particles
