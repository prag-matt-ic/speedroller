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
import { type FC, useCallback, useEffect, useId, useMemo, useRef } from 'react'
import { float, positionWorld, time } from 'three/tsl'
import { AdditiveBlending, Color, type Vector3Tuple } from 'three'
import type { UniformNode } from 'three/webgpu'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import {
  createGemParticleBuffers,
  createGemParticleRenderNodes,
  createGemParticleSimulation,
  GEM_PARTICLE_QUAD_SIZE,
} from '@/components/platform/collectibles/collectible/gem/particles/gemParticleSimulation'
import { CollectibleID } from '@/model/schema'
import { GEMS_COLOURS_BY_ID, GOLD_PARTICLE_PALETTE } from '@/resources/colours'
import { fadeDistance } from '@/resources/tsl/fadeDistance'

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

const tempColour = new Color()

const toLinearPalette = (palette: readonly string[]): readonly (readonly [number, number, number])[] =>
  palette.map((hex) => {
    tempColour.set(hex)
    return [tempColour.r, tempColour.g, tempColour.b] as const
  })

/**
 * Gem particles: a burst that lifts out of the tile and settles into a floating cloud inside the gem.
 *
 * The GLSL ran this as `<points>` with all the motion evaluated per vertex every frame. Three things
 * changed shape:
 *
 * - points became instanced quads, because WebGPU rasterises point primitives at one pixel;
 * - the per-vertex motion moved into a compute kernel that advances a storage buffer once per
 *   particle, which is then read back as an attribute (the shape Threenix's Fireflies uses);
 * - `uDpr` and the perspective attenuation both went, since a quad is sized in world units.
 *
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
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)
  const renderer = useThree((s) => s.renderer)

  const progress = useRef({ value: 0 })
  const progressTween = useRef<GSAPTween | null>(null)
  const hasMounted = useRef(false)
  const previouslyConfirmed = useRef(false)

  const particlePalette = GEMS_COLOURS_BY_ID[id]?.particlesPalette ?? GOLD_PARTICLE_PALETTE
  const palette = useMemo(() => toLinearPalette(particlePalette), [particlePalette])

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
      const buffers = createGemParticleBuffers({
        count: particleCount,
        gemScale,
        tileWidth,
        tileHeight,
        origin: gemPosition,
        palette,
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
          distanceFade: useDistanceFade ? fadeDistance(positionWorld.z) : float(1),
          palette,
        }),
      }
    },
    [gemPosition, gemScale, particleCount, particleScope, palette, tileHeight, tileWidth, useDistanceFade],
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

  useFrame(() => {
    if (!isVisible) return
    uBurstProgress.value = progress.current.value
    // Once the burst has settled (progress 1) the render node derives the settled float from
    // `time` alone and ignores the burst buffer, so skip the compute pass until the next burst.
    if (progress.current.value >= 1) return
    renderer.compute(simulation.updateParticles)
  })

  return (
    <instancedMesh
      position={position}
      args={[undefined, undefined, particleCount]}
      count={particleCount}
      frustumCulled={false}
      visible={isVisible}>
      <planeGeometry args={[GEM_PARTICLE_QUAD_SIZE, GEM_PARTICLE_QUAD_SIZE]} />
      <meshBasicNodeMaterial
        colorNode={render.colorNode}
        opacityNode={render.opacityNode}
        positionNode={render.positionNode}
        transparent
        depthTest={false}
        blending={AdditiveBlending}
      />
    </instancedMesh>
  )
}

export default Particles
