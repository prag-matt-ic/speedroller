/* eslint-disable react-hooks/immutability */
'use client'

import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import gsap from 'gsap'
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef } from 'react'
import {
  attribute,
  float,
  fract,
  mix,
  positionGeometry,
  smoothstep,
  sin,
  time,
  vec3,
  shapeCircle,
  vertexStage,
} from 'three/tsl'
import { AdditiveBlending, Color, InstancedBufferAttribute, type InstancedMesh, Sphere, Vector3, type Vector3Tuple } from 'three'
import type { UniformNode } from 'three/webgpu'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import {
  CONFETTI_PARTICLE_COLOURS_GOLD,
  CONFETTI_PARTICLE_COLOURS_GREEN,
  CONFETTI_PARTICLE_COLOURS_TEAL,
} from '@/resources/colours'
import { fadeInOut } from '@/resources/tsl/fadeInOut'
import { softCircleMask, softEdgeRadius } from '@/resources/tsl/particleQuad'

const CONFETTI_UNIFORM_SCOPE = 'confettiEmitter'

type ConfettiUniforms = {
  uBurstProgress: UniformNode<'float', number>
}

const createConfettiUniforms = () => ({
  uBurstProgress: 0,
})

/**
 * World-space quad edge length, before the per-particle scale. The GLSL sized points in pixels, so
 * this is a re-authoring rather than a conversion: the emitter sits at a distance of roughly 8 world
 * units, where a 1.0 tile is the dominant on-screen unit, and the previous 1.0 quad painted a
 * sprite the size of a tile over a particle that should read as a spark. The soft mask keeps the
 * bright core inside the middle 60% of the quad, so this draws roughly a 0.03-0.07 unit glow.
 */
const PARTICLE_QUAD_SIZE = 0.08

/** Per-particle scale range applied to {@link PARTICLE_QUAD_SIZE}, as in the GLSL's size seed. */
const MIN_PARTICLE_SCALE = 0.25
const MAX_PARTICLE_SCALE = 1.0

const CONFETTI_GRAVITY = -6
const BURST_DURATION_SECONDS = 1.8
const BURST_FADE_START = 0.75

const MIN_DRIFT_SPEED = 0.45
const MAX_DRIFT_SPEED = 2.0
const MIN_LAUNCH_SPEED = 5.0
const MAX_LAUNCH_SPEED = 10.0

const MIN_SOFT_EDGE = 0.12
const MAX_SOFT_EDGE = 0.45

/** How far the launch point scatters around the emitter, in world units. */
const SPAWN_SPREAD = 0.8
/** Wobble amplitude in world units, at the start of the burst. */
const WOBBLE_AMPLITUDE = 0.2
const WOBBLE_TIME_SCALE = 0.9
const WOBBLE_FREQUENCIES = [0.8, 0.6, 0.7] as const

/** Brightness jitter, so the burst reads as many particles rather than one flat sheet. */
const MIN_BRIGHTNESS = 0.85
const MAX_BRIGHTNESS = 1.15

const PALETTE_BY_CONFETTI_INDEX = [
  CONFETTI_PARTICLE_COLOURS_GOLD,
  CONFETTI_PARTICLE_COLOURS_TEAL,
  CONFETTI_PARTICLE_COLOURS_GREEN,
] as const

type Props = {
  position: Vector3Tuple
  isVisible: boolean
  confettiIndex: number
  seedOffset?: number
}

export type ConfettiParticleEmitterHandle = {
  burst: () => void
  reset: () => void
}

const tmpColor = new Color()

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min)

/**
 * Per-particle seeds. Size, brightness, wobble phases and glow softness all derive from this one
 * value in the shader, as they did in the GLSL. They cannot be given buffers of their own: the
 * instanced quad's pipeline already uses every one of the device's eight vertex buffers, and a
 * ninth fails pipeline creation outright.
 *
 * `seedOffset` keeps the two emitters of a row from wobbling in lockstep.
 */
const createSeeds = (count: number, offset: number): Float32Array => {
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    seeds[i] = Math.random() + offset * 0.01
  }
  return seeds
}

const createRandomColours = (count: number, palette: readonly string[]): Float32Array => {
  const colours = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const colourIndex = Math.floor(Math.random() * palette.length)
    tmpColor.set(palette[colourIndex])
    const lane = i * 3
    colours[lane] = tmpColor.r
    colours[lane + 1] = tmpColor.g
    colours[lane + 2] = tmpColor.b
  }
  return colours
}

const getPaletteForIndex = (index: number): readonly string[] => {
  const paletteIndex = Math.abs(index) % PALETTE_BY_CONFETTI_INDEX.length
  const palette = PALETTE_BY_CONFETTI_INDEX[paletteIndex]
  if (!palette || palette.length === 0) return PALETTE_BY_CONFETTI_INDEX[0]
  return palette
}

const createSpawnPositions = (count: number): Float32Array => {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const lane = i * 3
    positions[lane] = (Math.random() - 0.5) * SPAWN_SPREAD
    positions[lane + 1] = 0
    positions[lane + 2] = (Math.random() - 0.5) * SPAWN_SPREAD
  }
  return positions
}

const createDriftVelocities = (count: number): Float32Array => {
  const drift = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const lane = i * 3
    const theta = Math.random() * Math.PI * 2
    const speed = randomBetween(MIN_DRIFT_SPEED, MAX_DRIFT_SPEED)
    drift[lane] = Math.cos(theta) * speed
    drift[lane + 1] = 0
    drift[lane + 2] = Math.sin(theta) * speed
  }
  return drift
}

const createLaunchSpeeds = (count: number): Float32Array => {
  const launchSpeeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    launchSpeeds[i] = randomBetween(MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED)
  }
  return launchSpeeds
}

const ConfettiParticleEmitter = forwardRef<ConfettiParticleEmitterHandle, Props>(
  ({ position, isVisible, confettiIndex, seedOffset = 0 }, ref) => {
    const particleCount = usePerformanceStore((s) => s.sceneConfig.confetti.particleCount)
    const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)

    const progress = useRef({ value: 0 })
    const progressTween = useRef<gsap.core.Tween | null>(null)

    const palette = useMemo(() => getPaletteForIndex(confettiIndex), [confettiIndex])
    const seeds = useMemo(
      () => createSeeds(particleCount, seedOffset),
      [particleCount, seedOffset],
    )
    const colours = useMemo(
      () => createRandomColours(particleCount, palette),
      [particleCount, palette],
    )
    const spawnPositions = useMemo(() => createSpawnPositions(particleCount), [particleCount])
    const driftVelocities = useMemo(() => createDriftVelocities(particleCount), [particleCount])
    const launchSpeeds = useMemo(() => createLaunchSpeeds(particleCount), [particleCount])

    const colourAttribute = useRef<InstancedBufferAttribute>(null)
    const spawnAttribute = useRef<InstancedBufferAttribute>(null)
    const driftAttribute = useRef<InstancedBufferAttribute>(null)
    const launchSpeedAttribute = useRef<InstancedBufferAttribute>(null)
    const seedAttribute = useRef<InstancedBufferAttribute>(null)

    // One scope per emitter: a shared scope couples the two emitters of a row's burst progress.
    const emitterScope = `${CONFETTI_UNIFORM_SCOPE}_${useId().replace(/[^a-zA-Z0-9]/g, '')}`

    const { uBurstProgress } = useUniforms(createConfettiUniforms, emitterScope)

    // Port of confettiPoint.vert + confettiPoint.frag.
    //
    // WebGPU rasterises point primitives at one pixel, so the emitter renders instanced unit quads
    // instead of <points>: the quad supplies gl_PointCoord's replacement via its own uv, and the
    // GLSL's gl_PointSize becomes a world-space quad scale.
    const createNodes = useCallback(
      ({ uniforms: scopedUniforms }: CreatorState) => {
        const scoped = scopedUniforms.scope<ConfettiUniforms>(emitterScope)
        const { uPlayerWorldPos } = scopedUniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)

        const spawnPosition = attribute<'vec3'>('spawnPosition')
        const driftVelocity = attribute<'vec3'>('driftVelocity')
        const launchSpeed = attribute<'float'>('launchSpeed')
        const seed = attribute<'float'>('seed')
        const particleColour = attribute<'vec3'>('colour')

        const burstProgress = scoped.uBurstProgress.clamp(0, 1)
        const burstElapsed = burstProgress.mul(BURST_DURATION_SECONDS)
        const burstRemaining = float(1).sub(burstProgress)

        // The renderer advances TSL's built-in `time`, so the wobble needs no CPU uniform write.
        const wobbleTime = time.mul(WOBBLE_TIME_SCALE)
        const wobble = vec3(
          sin(wobbleTime.mul(WOBBLE_FREQUENCIES[0]).add(seed.mul(6))),
          sin(wobbleTime.mul(WOBBLE_FREQUENCIES[1]).add(seed.mul(9))),
          sin(wobbleTime.mul(WOBBLE_FREQUENCIES[2]).add(seed.mul(5))),
        )
          .mul(burstRemaining)
          .mul(WOBBLE_AMPLITUDE)

        const vertical = launchSpeed
          .mul(burstElapsed)
          .add(float(0.5).mul(CONFETTI_GRAVITY).mul(burstElapsed).mul(burstElapsed))

        const particlePosition = spawnPosition
          .add(driftVelocity.mul(burstElapsed))
          .add(vec3(0, vertical, 0))
          .add(wobble)

        // Clamping the seed keeps it a usable mix factor; it overshoots 1 only because the GLSL
        // offset it by a hundredth of the emitter index.
        const particleScale = mix(
          float(MIN_PARTICLE_SCALE),
          float(MAX_PARTICLE_SCALE),
          seed.clamp(0, 1),
        ).mul(PARTICLE_QUAD_SIZE)

        // Additive blending composites `colour * alpha` into the frame, so a particle fades by
        // losing brightness. Folding the fade into the colour keeps the two in step and stops a
        // swarm of near-transparent quads from stacking into one bright blob that appears never to
        // fade, which is what an alpha-only fade looks like under additive blending.
        const brightness = mix(float(MIN_BRIGHTNESS), float(MAX_BRIGHTNESS), fract(seed.mul(7)))
        // Per-particle constant, referenced by both colorNode and opacityNode: compute it once in
        // the vertex stage so the smoothsteps and seed mix are not re-run per fragment.
        const opacity = vertexStage(
          smoothstep(float(0), float(0.12), burstProgress)
            .mul(float(1).sub(smoothstep(float(BURST_FADE_START), float(1), burstProgress)))
            .mul(brightness),
        )

        // The GLSL's `mix(0.0, 0.45, fract(seed * 31.0))`, floored: at zero softness the mask is a
        // hard-edged disc, which reads as a flat blob now that the quads are small.
        const softEdge = mix(
          float(MIN_SOFT_EDGE),
          float(MAX_SOFT_EDGE),
          fract(seed.mul(31)),
        )
        // hardRadius depends only on the per-particle seed: hoist it to the vertex stage so the
        // fragment mask keeps only the uv-dependent smoothstep.
        const hardRadius = vertexStage(softEdgeRadius(softEdge))

        // The fade depends only on the emitter's own z, so it is one value for the whole burst:
        // the vertex stage evaluates it once per quad and the fragment stage reads the varying.
        const distanceFade = useDistanceFade ? vertexStage(fadeInOut(uPlayerWorldPos.z)) : float(1)

        return {
          positionNode: particlePosition.add(positionGeometry.mul(particleScale)),
          colorNode: particleColour.mul(opacity),
          opacityNode: opacity
            .mul(softCircleMask({ hardRadius }))
            .mul(distanceFade),
        }
      },
      [emitterScope, useDistanceFade],
    )

    const { colorNode, opacityNode, positionNode } = useLocalNodes(createNodes)

    const burst = useCallback(() => {
      progressTween.current?.kill()
      progress.current.value = 0
      uBurstProgress.value = 0
      progressTween.current = gsap.to(progress.current, {
        value: 1,
        duration: BURST_DURATION_SECONDS,
        ease: 'power2.out',
        onUpdate: () => {
          uBurstProgress.value = progress.current.value
        },
      })
    }, [uBurstProgress])

    const reset = useCallback(() => {
      progressTween.current?.kill()
      progress.current.value = 0
      uBurstProgress.value = 0
    }, [uBurstProgress])

    useImperativeHandle(
      ref,
      () => ({
        burst,
        reset,
      }),
      [burst, reset],
    )

    useEffect(() => {
      return () => {
        progressTween.current?.kill()
      }
    }, [])

    // Between bursts the emitter keeps its buffers, so parking it on the tween's end state costs
    // nothing and leaves `opacity` at zero rather than frozen mid-burst.
    useEffect(() => {
      if (!isVisible) reset()
    }, [isVisible, reset])

    const setAnimationBounds = useCallback((mesh: InstancedMesh | null) => {
      if (!mesh) return
      // Covers the full 1.8-second ballistic arc, drift, spawn spread and quad size.
      mesh.boundingSphere = new Sphere(new Vector3(0, 4, 0), 8)
    }, [])

    return (
      <instancedMesh
        ref={setAnimationBounds}
        position={position}
        args={[undefined, undefined, particleCount]}
        count={particleCount}
        visible={isVisible}>
        <planeGeometry args={[1, 1]}>
          <instancedBufferAttribute
            ref={spawnAttribute}
            attach="attributes-spawnPosition"
            args={[spawnPositions, 3]}
          />
          <instancedBufferAttribute
            ref={driftAttribute}
            attach="attributes-driftVelocity"
            args={[driftVelocities, 3]}
          />
          <instancedBufferAttribute
            ref={launchSpeedAttribute}
            attach="attributes-launchSpeed"
            args={[launchSpeeds, 1]}
          />
          <instancedBufferAttribute
            ref={seedAttribute}
            attach="attributes-seed"
            args={[seeds, 1]}
          />
          <instancedBufferAttribute
            ref={colourAttribute}
            attach="attributes-colour"
            args={[colours, 3]}
          />
        </planeGeometry>

        <meshBasicNodeMaterial
          colorNode={colorNode}
          opacityNode={opacityNode}
          positionNode={positionNode}
          maskNode={shapeCircle()}
          transparent={true}
          depthTest={false}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </instancedMesh>
    )
  },
)

ConfettiParticleEmitter.displayName = 'ConfettiParticleEmitter'

export default ConfettiParticleEmitter
