'use client'

import {
  Fn,
  clamp,
  float,
  fract,
  instanceIndex,
  instancedArray,
  positionGeometry,
  max,
  mix,
  select,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
  vertexStage,
} from 'three/tsl'
import type { ComputeNode, Node, StorageBufferNode, UniformNode } from 'three/webgpu'

// Port of gem/particles/point.vert + point.frag as a compute-driven instanced particle system,
// following the shape of Threenix's Fireflies: storage buffers created once, a compute kernel that
// advances them, and node graphs that read the buffers back through `toAttribute()`.
//
// Two things had to change shape rather than syntax:
//
// 1. WebGPU rasterises point primitives at one pixel, so `<points>` with `gl_PointSize` cannot work.
//    The particles render as instanced quads and `gl_PointCoord` becomes the quad's own uv.
// 2. `gl_PointSize` was in pixels, so it needed the device pixel ratio and a perspective attenuation
//    term. A quad sized in world units needs neither, which drops the uDpr uniform entirely.
//
// The per-particle data the GLSL carried as attributes splits by how often it changes: the spawn
// point, gem-interior target, seed and colour are constant, while the burst position advances every
// frame. Only the burst needs a kernel — the settled float is a pure function of time.

// Carried over from point.vert.
const EPSILON = 1e-5
const GEM_INTERIOR_SCALE = 0.9
const OCTA_INV_SQRT3 = 0.57735027
const HASH_MULTIPLIERS = /*#__PURE__*/ vec4(17, 27, 15, 13).toConst()
const SWIRL_WEIGHTS = /*#__PURE__*/ vec3(0.7, 0.4, 0.5).toConst()
const FLOAT_FREQ_X = 0.35
const FLOAT_FREQ_Y = 0.27
const FLOAT_FREQ_Z = 0.41
const BURST_DIR_FALLBACK = /*#__PURE__*/ vec2(1, 0).toConst()

const SWIRL_SPEED = 3.0
const TIME_OFFSET_SPAN = 0.2
const ARC_HEIGHT_MIN = 0.5
const ARC_HEIGHT_MAX = 1.4
const ARC_HEIGHT_SCALE = 10.0
const ARC_MIN_SCALE = 0.5
const SPREAD_MIN = 3.0
const SPREAD_MAX = 8.0
const FLOAT_TIME_SCALE = 0.7
const FLOAT_SCALE_MIN = 0.5
const FLOAT_SCALE_MAX = 1.2
const SIZE_MIN = 12.0
const SIZE_MAX = 40.0
const SIZE_FADE = 0.3
const SIZE_SEED_FREQ = 17.0
const SPARKLE_SEED_THRESHOLD = 0.9
/** Number of palette slots the colour lookup distinguishes. */
const PALETTE_LOOKUP_SIZE = 3
const SPARKLE_SIZE_SCALE = 3.0
const SOFTNESS_SEED_FREQ = 31.0
const OPACITY_SEED_FALLOFF = 0.5
const OPACITY_DAMPENING = 0.8
const OPACITY_SPARKLE_BOOST = 2.0
const APPEAR_END = 0.15
const SETTLE_START = 0.5
const SETTLE_PULSE_TIME_SCALE = 4.0
const SETTLE_PULSE_SEED_FREQ = 23.0
const SETTLE_PULSE_SIZE_MIN = 0.9
const SETTLE_PULSE_SIZE_MAX = 1.3
const SETTLE_PULSE_OPACITY_MIN = 0.6
const TRAIL_FADE_START = 0.6
const TRAIL_FADE_END = 0.75
const SPARKLE_SOFTNESS = 2.0
const SPARKLE_SOFTNESS_THRESHOLD = 1.5
const SHAPE_RADIUS = 0.5
const SHAPE_SOFT_EDGE_MAX = 0.45
const QUAD_UV_CENTER = 0.5

/**
 * World-space quad edge length. The GLSL sized points in pixels, so this is a re-authoring rather
 * than a conversion: it is tuned so the mid-range particle keeps roughly its previous screen size.
 */
export const GEM_PARTICLE_QUAD_SIZE = 0.045

export type GemParticleBuffers = {
  spawnBuffer: StorageBufferNode<'vec4'>
  targetBuffer: StorageBufferNode<'vec4'>
  burstBuffer: StorageBufferNode<'vec4'>
  count: number
}

export type GemParticleSeedInput = {
  count: number
  /** Gem radius; scales the interior target and the burst arc. */
  gemScale: number
  tileWidth: number
  tileHeight: number
  /**
   * Where the gem sits inside the mesh's own space. Baked into the seeded positions so the mesh can
   * stay at the component's `position` prop and the parent group's rotation keeps working.
   */
  origin: readonly [number, number, number]
  /** Linear RGB triples, one per palette entry. */
  palette: readonly (readonly [number, number, number])[]
}

/** Uniformly distributed point inside a unit octahedron, scaled by a biased radius. */
const sampleOctaPoint = () => {
  const x = Math.random() * 2 - 1
  const y = Math.random() * 2 - 1
  const z = Math.random() * 2 - 1
  const normalization = Math.abs(x) + Math.abs(y) + Math.abs(z) || EPSILON
  const radius = Math.pow(Math.random(), 0.55)
  return [
    (x / normalization) * radius,
    (y / normalization) * radius,
    (z / normalization) * radius,
  ] as const
}

/**
 * Seeds the static half of each particle on the CPU: the spawn point within the tile footprint, the
 * gem-interior target, the seed and a palette colour.
 *
 * `w` slots carry the seed and a sparkle flag rather than a fourth position component, so no extra
 * attribute is needed. The burst buffer starts at the spawn point and is advanced by the kernel.
 */
export const createGemParticleBuffers = ({
  count,
  gemScale,
  tileWidth,
  tileHeight,
  origin,
  palette,
}: GemParticleSeedInput): GemParticleBuffers => {
  const spawn = new Float32Array(count * 4)
  const target = new Float32Array(count * 4)
  const burst = new Float32Array(count * 4)
  const interiorScale = gemScale * GEM_INTERIOR_SCALE
  const paletteSize = Math.max(palette.length, 1)

  for (let index = 0; index < count; index++) {
    const offset = index * 4
    const seed = Math.random()
    const paletteIndex = Math.min(Math.floor(Math.random() * paletteSize), paletteSize - 1)

    const spawnX = (Math.random() - 0.5) * tileWidth
    const spawnZ = (Math.random() - 0.5) * tileHeight
    spawn[offset + 0] = spawnX
    spawn[offset + 1] = 0
    spawn[offset + 2] = spawnZ
    spawn[offset + 3] = seed

    const [octaX, octaY, octaZ] = sampleOctaPoint()
    target[offset + 0] = origin[0] + octaX * interiorScale
    target[offset + 1] = origin[1] + octaY * interiorScale
    target[offset + 2] = origin[2] + octaZ * interiorScale
    // The w slot carries the palette index, biased by whether this is a sparkle particle.
    target[offset + 3] = paletteIndex

    burst[offset + 0] = spawnX
    burst[offset + 1] = 0
    burst[offset + 2] = spawnZ
    burst[offset + 3] = 0
  }

  return {
    spawnBuffer: instancedArray(spawn, 'vec4'),
    targetBuffer: instancedArray(target, 'vec4'),
    burstBuffer: instancedArray(burst, 'vec4'),
    count,
  }
}

export type GemParticleMotionUniforms = {
  uBurstProgress: UniformNode<'float', number>
  /** TSL's built-in `time` node; the renderer advances it, so no CPU write is needed. */
  uTime: Node<'float'>
  uGemScale: UniformNode<'float', number>
}

export type GemParticleSimulation = {
  updateParticles: ComputeNode
  buffers: GemParticleBuffers
  motion: GemParticleMotionUniforms
}

/** vec3 smoothNoise(float seed, float progress) — smooth sines, chosen over a hash to avoid jitter. */
const smoothNoise = (seed: Node<'float'>, progress: Node<'float'>): Node<'vec3'> =>
  vec3(
    sin(seed.mul(12).add(progress.mul(SWIRL_SPEED))),
    sin(seed.mul(23).add(progress.mul(SWIRL_SPEED * 1.2)).add(1)),
    sin(seed.mul(45).add(progress.mul(SWIRL_SPEED * 0.8)).add(2)),
  )

const easeOutCubic = (t: Node<'float'>): Node<'float'> =>
  float(1).sub(float(1).sub(t).pow(3))

/**
 * float sdOctahedron(vec3 p, float s) — signed distance to an octahedron of half-size `s`.
 * Returned for the settled containment test.
 */
export const sdOctahedron = (point: Node<'vec3'>, size: Node<'float'>): Node<'float'> =>
  point.abs().x.add(point.abs().y).add(point.abs().z).sub(size).mul(OCTA_INV_SQRT3)

/** vec3 clampToOctahedron(vec3 p, float s) — projects a point back onto the octahedron surface. */
const clampToOctahedron = (point: Node<'vec3'>, size: Node<'float'>): Node<'vec3'> => {
  const absSum = point.abs().x.add(point.abs().y).add(point.abs().z)
  return select(
    absSum.lessThanEqual(size),
    point,
    point.mul(size.div(max(absSum, float(EPSILON)))),
  )
}

/**
 * Creates the compute kernel that advances each particle through its burst.
 *
 * The GLSL evaluated all of this per vertex every frame. Doing it once per particle in a kernel and
 * handing the result to the render node as an attribute is the reason the vertex stage can stay a
 * plain quad offset.
 */
export const createGemParticleSimulation = (
  buffers: GemParticleBuffers,
  motion: GemParticleMotionUniforms,
): GemParticleSimulation => {
  const updateParticles = Fn(() => {
    const spawnData = buffers.spawnBuffer.element(instanceIndex)
    const targetData = buffers.targetBuffer.element(instanceIndex)
    const state = buffers.burstBuffer.element(instanceIndex)

    const spawn = spawnData.xyz
    const seed = spawnData.w
    const gemInterior = targetData.xyz
    const gemScale = motion.uGemScale

    // Each particle starts on its own schedule, so the burst reads as a wave rather than a pop.
    const timingOffset = seed.mul(TIME_OFFSET_SPAN)
    const normalizer = max(float(1).sub(timingOffset), float(EPSILON))
    const progress = clamp(
      motion.uBurstProgress.sub(timingOffset).div(normalizer),
      float(0),
      float(1),
    )
    const easedProgress = easeOutCubic(progress)

    const hashedSeed = fract(seed.mul(HASH_MULTIPLIERS))
    const arcProfile = progress.mul(float(1).sub(progress))
    const swirl = smoothNoise(seed, progress).mul(SWIRL_WEIGHTS).mul(float(1).sub(progress))

    // Cache the length so the normalize path reuses the same sqrt instead of recomputing it.
    const spawnLength = spawn.xz.length().toVar()
    const burstDirection = select(
      spawnLength.lessThan(EPSILON),
      BURST_DIR_FALLBACK,
      spawn.xz.div(spawnLength),
    )
    const spreadAmount = mix(SPREAD_MIN, SPREAD_MAX, hashedSeed.z).mul(gemScale)
    const arcHeight = mix(ARC_HEIGHT_MIN, ARC_HEIGHT_MAX, hashedSeed.w).mul(
      max(gemScale.mul(ARC_HEIGHT_SCALE), ARC_MIN_SCALE),
    )

    const lifted = spawn
      .add(swirl)
      .add(vec3(0, arcHeight.mul(arcProfile), 0))
      .add(vec3(burstDirection.mul(spreadAmount.mul(arcProfile)), 0))
      .mul(easedProgress)
      .add(spawn.mul(float(1).sub(easedProgress)))

    // Once settled the render node takes over from the gem interior, so park the state there.
    const settled = progress.greaterThanEqual(1)
    state.assign(
      vec4(select(settled, gemInterior, lifted), easedProgress) as never,
    )
  })().compute(buffers.count)

  return { updateParticles, buffers, motion }
}

/**
 * Resolves a palette index to a colour with two nested selects.
 *
 * The GLSL had the colour as a per-particle vertex attribute. Baking the palette into the graph
 * instead keeps it as constants — no buffer space, and the index is all the shader needs. Three
 * slots cover the palettes this project uses; a larger palette would step through more selects.
 */
const pickPaletteColour = (
  paletteIndex: Node<'float'>,
  palette: readonly (readonly [number, number, number])[],
): Node<'vec3'> => {
  const entries = PALETTE_LOOKUP_SIZE
  const colours = palette.slice(0, entries)
  const fallback = colours[colours.length - 1] ?? ([1, 1, 1] as const)

  let resolved: Node<'vec3'> = vec3(fallback[0], fallback[1], fallback[2])
  for (let index = entries - 2; index >= 0; index--) {
    const colour = colours[index] ?? fallback
    resolved = select(
      paletteIndex.lessThan(index + 1),
      vec3(colour[0], colour[1], colour[2]),
      resolved,
    )
  }

  return resolved
}

export type GemParticleRenderOptions = {
  buffers: GemParticleBuffers
  motion: GemParticleMotionUniforms
  /** Distance fade toward the camera, applied by the caller so this module stays scene-agnostic. */
  distanceFade: Node<'float'>
  /** The palette the seed data indexes into, in linear RGB. */
  palette: readonly (readonly [number, number, number])[]
}

export type GemParticleRenderNodes = {
  positionNode: Node<'vec3'>
  colorNode: Node<'vec3'>
  opacityNode: Node<'float'>
}

/**
 * Builds the render nodes for the instanced quads.
 *
 * The GLSL carried vColorAlpha and vSoftness across as varyings because the fragment stage had no
 * access to the vertex data. Here the buffers are readable from any stage, so both are computed once
 * and the quad only supplies its shape mask.
 */
export const createGemParticleRenderNodes = ({
  buffers,
  motion,
  distanceFade,
  palette,
}: GemParticleRenderOptions): GemParticleRenderNodes => {
  const spawnData = buffers.spawnBuffer.toAttribute()
  const targetData = buffers.targetBuffer.toAttribute()
  const burstData = buffers.burstBuffer.toAttribute()

  const seed = spawnData.w
  const gemInterior = targetData.xyz
  const paletteIndex = targetData.w
  // The GLSL derived sparkle-ness from the seed, so it comes back the same way.
  const isSparkle = seed.greaterThan(SPARKLE_SEED_THRESHOLD).select(float(1), float(0))
  const hashedSeed = fract(seed.mul(HASH_MULTIPLIERS))

  const timingOffset = seed.mul(TIME_OFFSET_SPAN)
  const progress = clamp(
    motion.uBurstProgress.sub(timingOffset).div(max(float(1).sub(timingOffset), float(EPSILON))),
    float(0),
    float(1),
  )
  const easedProgress = easeOutCubic(progress)
  const settleProgress = smoothstep(SETTLE_START, 1, progress)

  // Settled float: a sine wave inside the gem, clamped back onto the octahedron surface.
  const floatAmplitude: Node<'float'> = motion.uGemScale.mul(
    mix(FLOAT_SCALE_MIN, FLOAT_SCALE_MAX, hashedSeed.y),
  )
  const floatWave: Node<'vec3'> = vec3(
    sin(motion.uTime.mul(FLOAT_TIME_SCALE * FLOAT_FREQ_X).add(seed.mul(6.2831853))),
    sin(motion.uTime.mul(FLOAT_TIME_SCALE * FLOAT_FREQ_Y).add(seed.mul(13))),
    sin(motion.uTime.mul(FLOAT_TIME_SCALE * FLOAT_FREQ_Z).add(seed.mul(7))),
  ).mul(floatAmplitude)

  const interiorBound = motion.uGemScale.mul(GEM_INTERIOR_SCALE)
  const interiorDistance = sdOctahedron(floatWave, interiorBound)
  // Outside the octahedron the wave is projected back onto its surface; inside it floats freely.
  const settledPosition = select(
    interiorDistance.greaterThan(0),
    gemInterior.add(clampToOctahedron(floatWave, interiorBound)),
    gemInterior.add(floatWave),
  )

  const burstPosition = burstData.xyz
  const particlePosition = mix(burstPosition, settledPosition, settleProgress)

  const settlePulsePhase = motion.uTime
    .mul(SETTLE_PULSE_TIME_SCALE)
    .add(seed.mul(SETTLE_PULSE_SEED_FREQ))
  const settlePulseWave = sin(settlePulsePhase).mul(0.5).add(0.5)

  // Size: the GLSL's pixel sizes normalised to world units, with sparkles scaled up.
  const baseSize = mix(SIZE_MIN, SIZE_MAX, fract(seed.mul(SIZE_SEED_FREQ)))
    .mul(GEM_PARTICLE_QUAD_SIZE / ((SIZE_MIN + SIZE_MAX) * 0.5))
    .mul(float(1).sub(easedProgress.mul(SIZE_FADE)))
    .mul(mix(float(1), float(SPARKLE_SIZE_SCALE), isSparkle))
    .mul(mix(float(1), mix(SETTLE_PULSE_SIZE_MIN, SETTLE_PULSE_SIZE_MAX, settlePulseWave), settleProgress))

  const softness = mix(
    fract(seed.mul(SOFTNESS_SEED_FREQ)),
    float(SPARKLE_SOFTNESS),
    isSparkle,
  )
  // Per-particle constant: compute once per vertex (the additive quad covers many pixels), so the
  // palette lookup and softness mix are not re-run per fragment.
  const glowColor = vertexStage(
    mix(pickPaletteColour(paletteIndex, palette), vec3(1), softness.clamp(0, 1)),
  )

  const appear = smoothstep(float(0), float(APPEAR_END), progress)
  const settle = smoothstep(float(0.6), float(1), progress)
  const trailFade = float(1).sub(smoothstep(TRAIL_FADE_START, TRAIL_FADE_END, progress))
  const linger = mix(trailFade, float(1), settle)
  const settleOpacity = mix(
    float(1),
    mix(SETTLE_PULSE_OPACITY_MIN, float(1), settlePulseWave),
    settleProgress,
  )
  // Per-particle constant (with a per-vertex distance fade): hoist to the vertex stage so the
  // smoothsteps/pulse/seed terms run once per vertex instead of per fragment.
  const baseOpacity = vertexStage(
    appear
      .mul(linger)
      .mul(float(1).sub(seed.mul(OPACITY_SEED_FALLOFF)))
      .mul(settleOpacity)
      .mul(mix(float(1), float(OPACITY_SPARKLE_BOOST), isSparkle).min(1))
      .mul(OPACITY_DAMPENING)
      .mul(distanceFade),
  )

  return {
    // positionGeometry is the plane's own [-0.5, 0.5] corner offset.
    positionNode: particlePosition.add(positionGeometry.mul(baseSize)),
    colorNode: glowColor,
    opacityNode: baseOpacity.mul(quadShapeMask(softness)),
  }
}

/** Distance from the quad's centre in uv space, spanning 0..~0.707. */
const uvCentredLength = (): Node<'float'> => uv().sub(QUAD_UV_CENTER).length()

/**
 * The quad's shape mask, matching point.frag's two branches: a soft-edged disc, or a pow2 falloff
 * for sparkles. Softness above 1.5 selects the sparkle form, exactly as the GLSL's sentinel did.
 */
const quadShapeMask = (softness: Node<'float'>): Node<'float'> => {
  const centredDistance = uvCentredLength()
  const softEdge = mix(float(0), float(SHAPE_SOFT_EDGE_MAX), softness)
  const hardRadius = float(SHAPE_RADIUS).sub(softEdge.mul(SHAPE_RADIUS))
  const standard = float(1).sub(smoothstep(hardRadius.mul(2), float(1), centredDistance))
  const falloff = float(1).sub(centredDistance.mul(4)).max(0)

  return select(softness.greaterThan(SPARKLE_SOFTNESS_THRESHOLD), falloff.mul(falloff), standard)
}

