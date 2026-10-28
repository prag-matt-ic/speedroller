'use client'

import { useFrame, useTexture, useThree } from '@react-three/fiber'
import { type FC, useId, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Fn,
  If,
  PI,
  Return,
  array,
  color,
  cos,
  deltaTime,
  float,
  hash,
  instanceIndex,
  instancedArray,
  mix,
  sin,
  smoothstep,
  spritesheetUV,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  vertexStage,
} from 'three/tsl'
import {
  type BufferAttribute,
  NearestFilter,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu'

import confettiSprite from '@/assets/particles/fireworks-sprites.webp'
import { createParticleRandom } from '@/components/podium/createParticleRandom'

const DEFAULT_PARTICLE_COUNT = 2048
const DEFAULT_UPDATE_STRIDE = 1

const BATCH_COUNT = 7
const BURST_DELAY_MIN_MS = 300
const BURST_DELAY_MAX_MS = 800
const EXPLOSION_TRIGGER_LIFE = 1.2
const EXPLOSION_SCALE_MULTIPLIER = 2
const FIREWORK_PHASE = {
  launch: 0,
  explosion: 1,
} as const

/** Bright confetti palette used by the rugbet podium. */
const PARTICLE_PALETTE = [
  '#e5a81a',
  '#6228d7',
  '#ff42ef',
  '#ffca00',
  '#ffe243',
  '#ffcf0c',
  '#ffd100',
  '#ffda53',
  '#ffdb46',
  '#ffed5e',
  '#ffd54b',
  '#ffca1e',
  '#ffdf2f',
  '#ffccff',
  '#ffc8ff',
  '#ffceff',
  '#f6b4ff',
  '#ffbfff',
  '#ffd3ff',
  '#ffd2ff',
  '#fcc0ff',
  '#ffe1ff',
  '#ff94ff',
  '#ffbaff',
  '#ffb4ff',
  '#ff8fff',
  '#ffafff',
  '#ff85ff',
  '#ffbcff',
  '#ffbbff',
  '#ffb6ff',
] as const

type TslArrayNode<T extends string> = Omit<ReturnType<typeof array>, 'element'> & {
  element: (indexNode: Node) => Node<T>
}

type Props = {
  active?: boolean
  particleCount?: number
  updateStride?: number
}

const PodiumFireworksParticles: FC<Props> = ({
  active = true,
  particleCount = DEFAULT_PARTICLE_COUNT,
  updateStride = DEFAULT_UPDATE_STRIDE,
}) => {
  if (particleCount <= 0) return null
  return (
    <PodiumFireworksParticlesInner active={active} particleCount={particleCount} updateStride={updateStride} />
  )
}

type InnerProps = {
  active: boolean
  particleCount: number
  updateStride: number
}

const PodiumFireworksParticlesInner: FC<InnerProps> = ({ active, particleCount, updateStride }) => {
  const particleSeed = useId()
  const renderer = useThree((s) => s.renderer) as unknown as WebGPURenderer
  const frameloop = useThree((s) => s.frameloop)
  const updateFrameModuloRef = useRef(0)
  const batchIndexRef = useRef(0)
  const isInitialized = useRef(false)
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const alphaMapTexture = useTexture(confettiSprite.src, (tex) => {
    tex.generateMipmaps = false
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
  })

  const instanceCapacity = Math.max(1, particleCount)
  const safeUpdateStride = Math.max(1, Math.floor(updateStride))
  const batchSize = Math.max(1, Math.floor(instanceCapacity / BATCH_COUNT))

  const {
    colorNode,
    maskNode,
    positionNode,
    opacityNode,
    scaleNode,
    resetParticles,
    spawnBatch,
    updateParticles,
    computeNodes,
    storageAttributes,
    uniforms,
  } = useMemo(() => {
    const metadataValues = new Float32Array(instanceCapacity * 4)
    const random = createParticleRandom(particleSeed)
    for (let index = 0; index < instanceCapacity; index++) {
      const metadataIndex = index * 4
      metadataValues[metadataIndex] = random()
      metadataValues[metadataIndex + 1] = Math.floor(index / batchSize)
    }

    const uniforms = {
      uActiveBatch: uniform(float(0)).setName('uFwActiveBatch'),
      uDtScale: uniform(float(1)).setName('uFwDtScale'),
    }

    const colorsArray = array(
      PARTICLE_PALETTE.map((particleColour) => color(particleColour)),
    ) as unknown as TslArrayNode<'vec3'>
    const colorBuffer = instancedArray(instanceCapacity, 'vec4')
    const positionBuffer = instancedArray(instanceCapacity, 'vec4') // w stores life.
    const velocityBuffer = instancedArray(instanceCapacity, 'vec4') // xyz velocity, w scale.
    const metadataBuffer = instancedArray(metadataValues, 'vec4') // x seed, y batch, z phase, w scale-fade life.
    const launchPhaseNode = float(FIREWORK_PHASE.launch).toConst()
    const explosionPhaseNode = float(FIREWORK_PHASE.explosion).toConst()
    const explosionTriggerLifeNode = float(EXPLOSION_TRIGGER_LIFE).toConst()
    const explosionScaleMultiplierNode = float(EXPLOSION_SCALE_MULTIPLIER).toConst()

    // --- Reset ---
    const resetParticles = Fn(() => {
      positionBuffer.element(instanceIndex).assign(vec4(-1000, -1000, 0, 0))
      velocityBuffer.element(instanceIndex).assign(vec4(0))
      const metadata = metadataBuffer.element(instanceIndex)
      metadata.z.assign(launchPhaseNode)
      metadata.w.assign(0)

      const paletteIndex = hash(instanceIndex.add(11)).mul(PARTICLE_PALETTE.length).floor()
      const frameIndex = hash(instanceIndex.add(23)).mul(4).floor()
      colorBuffer
        .element(instanceIndex)
        .assign(vec4(colorsArray.element(paletteIndex), frameIndex))
    })().compute(instanceCapacity)

    // --- Spawn batch ---
    const spawnBatch = Fn(() => {
      const metadata = metadataBuffer.element(instanceIndex)
      const seed = metadata.x
      const batch = metadata.y
      const phase = metadata.z
      const scaleFadeLife = metadata.w
      const life = positionBuffer.element(instanceIndex).w
      const positionValue = positionBuffer.element(instanceIndex).xyz
      const velocityValue = velocityBuffer.element(instanceIndex)
      const frameIndex = colorBuffer.element(instanceIndex).a
      const indexAsFloat = instanceIndex.toFloat()

      // Only spawn particles in the active batch that are dead.
      If(batch.equal(uniforms.uActiveBatch).and(life.lessThanEqual(0)), () => {
        // Shared batch seed for deterministic per-burst values.
        const batchSeed = uniforms.uActiveBatch.add(time.mul(0.1))

        // Same lifetime for the entire batch so they all explode together.
        life.assign(mix(1.2, 1.8, hash(batchSeed.add(7.3))))

        // Reassign colour and frame for variety between bursts.
        const colorIndex = hash(indexAsFloat.add(time).mul(3.7))
          .mul(PARTICLE_PALETTE.length)
          .floor()
        colorBuffer.element(instanceIndex).xyz.assign(colorsArray.element(colorIndex))
        frameIndex.assign(hash(indexAsFloat.add(seed).add(time)).mul(4).floor())

        // Shared origin per batch: all particles in a batch start at the same point.
        const originX = mix(float(-2), float(2), hash(batchSeed.add(1.1)))
        const originY = mix(float(-8), float(-5), hash(batchSeed.add(2.3)))
        const originZ = mix(float(-10), float(-20), hash(batchSeed.add(3.7)))

        positionValue.assign(vec3(originX, originY, originZ))

        // Shared velocity per batch: random upward angle with a slight lean left/right.
        const batchSpeed = mix(float(20), float(36), hash(batchSeed.add(7.9)))
        const batchAngle = mix(float(-0.7), float(0.7), hash(batchSeed.add(5.1)))
        const batchVelocityX = sin(batchAngle).mul(batchSpeed)
        const batchVelocityY = cos(batchAngle).mul(batchSpeed)
        const jitterX = mix(float(-0.05), float(0.05), hash(indexAsFloat.add(time.mul(5.1))))
        const jitterY = mix(float(-0.05), float(0.05), hash(indexAsFloat.add(time.mul(6.3))))
        const baseScale = mix(float(0.4), float(1), seed)

        velocityValue.assign(
          vec4(batchVelocityX.add(jitterX), batchVelocityY.add(jitterY), float(0), baseScale),
        )

        phase.assign(launchPhaseNode)
        scaleFadeLife.assign(0)
      })
    })().compute(instanceCapacity)

    // --- Update ---
    const updateParticles = Fn(() => {
      const life = positionBuffer.element(instanceIndex).w

      If(life.lessThanEqual(0), () => {
        Return()
      })

      const positionValue = positionBuffer.element(instanceIndex).xyz
      const velocityValue = velocityBuffer.element(instanceIndex)
      const movementVelocity = velocityValue.xyz
      const metadata = metadataBuffer.element(instanceIndex)
      const seed = metadata.x
      const phase = metadata.z
      const scaleFadeLife = metadata.w
      // Initialize before branching so TSL cannot cache dt inside only one phase.
      const dt = deltaTime.mul(uniforms.uDtScale).toVar()
      const explosionDrag = float(1).sub(float(0.14).mul(dt))
      const indexAsFloat = instanceIndex.toFloat()

      If(phase.lessThan(explosionPhaseNode), () => {
        velocityValue.y.subAssign(float(4.2).mul(dt))
        velocityValue.x.addAssign(
          sin(seed.mul(30).add(life.mul(4)))
            .mul(0.24)
            .mul(dt),
        )
        positionValue.addAssign(movementVelocity.mul(dt))

        If(life.lessThan(explosionTriggerLifeNode), () => {
          const directions = 16
          // Radial explosion in XY with a slight z spread, quantised to ~16 directions.
          const angle = hash(indexAsFloat.add(time).mul(13.7))
            .mul(directions)
            .floor()
            .mul(PI.div(directions / 2))
          const magnitude = mix(float(0.5), float(8), hash(indexAsFloat.add(time).mul(19.3)))

          phase.assign(explosionPhaseNode)
          velocityValue.x.assign(cos(angle).mul(magnitude))
          velocityValue.y.assign(sin(angle).mul(magnitude))
          velocityValue.z.assign(
            mix(float(-5), float(0), hash(indexAsFloat.add(time).mul(23.1))),
          )
          velocityValue.w.mulAssign(explosionScaleMultiplierNode)
          scaleFadeLife.assign(life)
          Return()
        })
      })

      If(phase.greaterThanEqual(explosionPhaseNode), () => {
        velocityValue.y.subAssign(float(7).mul(dt))
        velocityValue.x.mulAssign(explosionDrag)
        velocityValue.y.mulAssign(explosionDrag)
        velocityValue.z.mulAssign(explosionDrag)
        positionValue.addAssign(movementVelocity.mul(dt))
      })

      life.subAssign(dt.mul(0.8))

      If(life.lessThanEqual(0), () => {
        life.assign(0)
        velocityValue.w.assign(0)
        Return()
      })

      If(phase.greaterThanEqual(explosionPhaseNode), () => {
        velocityValue.w.mulAssign(life.div(scaleFadeLife))
        scaleFadeLife.assign(life)
      })
    })().compute(instanceCapacity)

    // --- Render nodes ---
    const colorNode = vertexStage(colorBuffer.element(instanceIndex).rgb)

    const maskNode = Fn(() => {
      const colorValue = vertexStage(colorBuffer.element(instanceIndex))
      const textureUV = spritesheetUV(vec2(2), uv(), colorValue.w)
      return texture(alphaMapTexture, textureUV).r
    })()

    const positionNode = positionBuffer.toAttribute().xyz

    const opacityNode = Fn(() => {
      const seed = vertexStage(metadataBuffer.element(instanceIndex).x)
      const maxOpacity = vertexStage(mix(0.1, 0.6, seed))
      const particleLife = vertexStage(positionBuffer.element(instanceIndex).w)
      return vertexStage(
        smoothstep(float(0), float(0.25), particleLife).mul(maxOpacity),
      ).toFloat()
    })()

    const scaleNode = vec2(velocityBuffer.toAttribute().w)

    return {
      colorNode,
      maskNode,
      positionNode,
      opacityNode,
      scaleNode,
      resetParticles,
      spawnBatch,
      updateParticles,
      computeNodes: [resetParticles, spawnBatch, updateParticles],
      storageAttributes: [
        colorBuffer.value,
        positionBuffer.value,
        velocityBuffer.value,
        metadataBuffer.value,
      ],
      uniforms,
    }
  }, [alphaMapTexture, instanceCapacity, batchSize, particleSeed])

  const uniformsRef = useRef(uniforms)

  useLayoutEffect(() => {
    uniformsRef.current = uniforms
    uniformsRef.current.uDtScale.value = safeUpdateStride
  }, [safeUpdateStride, uniforms])

  // Keep resources alive while the canvas is paused.
  useLayoutEffect(() => {
    if (!renderer || particleCount <= 0) return
    renderer.compute(resetParticles)
    isInitialized.current = true
    updateFrameModuloRef.current = 0

    return () => {
      isInitialized.current = false
      if (burstTimer.current !== null) clearTimeout(burstTimer.current)
      burstTimer.current = null
      for (const node of computeNodes) node.dispose()
      // Three r186 storage attributes require renderer cleanup to release their GPU buffers.
      const attributes = (
        renderer as WebGPURenderer & {
          _attributes?: { delete(attribute: BufferAttribute): unknown }
        }
      )._attributes
      for (const attribute of storageAttributes) attributes?.delete(attribute)
    }
  }, [renderer, particleCount, resetParticles, computeNodes, storageAttributes])

  useLayoutEffect(() => {
    if (!active || !renderer || !isInitialized.current || frameloop === 'never') return
    renderer.compute(resetParticles)
    const activeUniforms = uniformsRef.current
    let isActive = true

    const scheduleBurst = () => {
      const delay =
        BURST_DELAY_MIN_MS + Math.random() * (BURST_DELAY_MAX_MS - BURST_DELAY_MIN_MS)

      return setTimeout(() => {
        if (!isActive || !isInitialized.current) return
        activeUniforms.uActiveBatch.value = batchIndexRef.current
        batchIndexRef.current = (batchIndexRef.current + 1) % BATCH_COUNT
        renderer.compute(spawnBatch)
        burstTimer.current = scheduleBurst()
      }, delay)
    }

    // Fire the first burst immediately.
    activeUniforms.uActiveBatch.value = batchIndexRef.current
    batchIndexRef.current = (batchIndexRef.current + 1) % BATCH_COUNT
    renderer.compute(spawnBatch)

    burstTimer.current = scheduleBurst()

    return () => {
      isActive = false
      if (burstTimer.current !== null) clearTimeout(burstTimer.current)
      burstTimer.current = null
    }
  }, [active, renderer, frameloop, resetParticles, spawnBatch, uniforms])

  // Per-frame simulation update, respecting the update stride.
  useFrame(() => {
    if (!active || !renderer || !isInitialized.current || particleCount <= 0 || frameloop === 'never')
      return
    updateFrameModuloRef.current++
    if (updateFrameModuloRef.current < safeUpdateStride) return
    updateFrameModuloRef.current = 0
    renderer.compute(updateParticles)
  })

  return (
    <instancedMesh
      visible={active}
      args={[undefined, undefined, instanceCapacity]}
      count={particleCount}
      frustumCulled={false}>
      <planeGeometry args={[0.35, 0.35, 1, 1]} />
      <spriteNodeMaterial
        key={maskNode.uuid}
        positionNode={positionNode}
        colorNode={colorNode}
        maskNode={maskNode}
        opacityNode={opacityNode}
        scaleNode={scaleNode}
        depthWrite={false}
        transparent={true}
      />
    </instancedMesh>
  )
}

export default PodiumFireworksParticles
