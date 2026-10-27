'use client'

import {
  Fn,
  If,
  Loop,
  clamp,
  dot,
  float,
  fract,
  interleavedGradientNoise,
  length,
  mix,
  normalize,
  screenCoordinate,
  screenSize,
  screenUV,
  select,
  sin,
  smoothstep,
  time,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node, TextureNode, UniformNode } from 'three/webgpu'

// Port of postProcessing/effects.frag as composed TSL nodes.
//
// The GLSL ran as one full-screen shader fed by `uSceneTexture`, `uResolution` and `uTime` uniforms.
// None of those survive: the render pipeline supplies the scene as a texture node, TSL has
// `screenSize` and a built-in `time`, and a full-screen pass means `vUv` is `screenUV` and
// `gl_FragCoord` is `screenCoordinate`. What remains here is only the effect maths.

// Tuning carried over from effects.frag, except the edge noise, which now lightens.
const BLUR_INTENSITY_EPSILON = 0.001
const EDGE_BLUR_THRESHOLD = 0.04
const VIGNETTE_DARKNESS = 0.6
const BLUR_EXPOSURE = 1.0
const NOISE_JITTER_SCALE = 0.006
const BLUR_BASE_MIX = 0.6
const BLUR_STEP_FALLOFF = 0.6
const VIGNETTE_START = 0.4
const VIGNETTE_SPEED_SHIFT = 0.15
const VIGNETTE_END = 0.8
const SAMPLE_UV_MIN = 0.001
const SAMPLE_UV_MAX = 0.999
const NOISE_LIGHTEN_AMOUNT = 0.3
const BLUR_FOCUS = /*#__PURE__*/ vec2(0.5, 0.45).toConst()
const BLUR_DIRECTION_EPSILON = 1e-5

type SpeedTerms = {
  /** Signed, clamped input speed. */
  signedSpeed: Node<'float'>
  /** Magnitude of the signed speed. */
  speed: Node<'float'>
  /** Vignette applied toward full darkness by VIGNETTE_DARKNESS. */
  vignetteFade: Node<'float'>
  /** Inverse of the vignette: zero at the centre, one at the edges. */
  edgeMask: Node<'float'>
  /** Edge mask times speed, clamped. Drives the blur strength and the edge noise weight. */
  intensity: Node<'float'>
}

/**
 * The terms every part of the effect needs, derived once.
 *
 * The vignette start radius narrows as speed rises, so the vignette tightens under acceleration, and
 * its inverse doubles as the edge-only mask the blur and the edge noise both weight against.
 */
const deriveSpeedTerms = (uSpeed: UniformNode<'float', number>): SpeedTerms => {
  const signedSpeed = clamp(uSpeed, float(-1), float(1))
  const speed = signedSpeed.abs()

  const centredUv = vec2(
    screenUV.x.sub(0.5).mul(screenSize.x.div(screenSize.y)),
    screenUV.y.sub(0.5),
  )
  const vignette = float(1).sub(
    smoothstep(
      float(VIGNETTE_START).sub(speed.mul(VIGNETTE_SPEED_SHIFT)),
      float(VIGNETTE_END),
      length(centredUv),
    ),
  )
  const edgeMask = float(1).sub(vignette)

  return {
    signedSpeed,
    speed,
    vignetteFade: mix(float(1), vignette, VIGNETTE_DARKNESS),
    edgeMask,
    intensity: clamp(edgeMask.mul(speed), float(0), float(1)),
  }
}

export type RadialBlurOptions = {
  sceneColor: TextureNode
  /** Pre-sampled centre texel, shared with the caller so the scene is fetched once. */
  base: Node<'vec4'>
  /** Active blur taps. This is also the loop bound, so it is fixed when the graph is built. */
  stepCount: number
  terms: SpeedTerms
}

/**
 * Radial blur: samples toward a focus point, weighted toward the centre and jittered per pixel with
 * interleaved gradient noise so banding does not read as heavy noise.
 *
 * The GLSL early-returned when the intensity was negligible, the edge mask was below threshold, or
 * the step count was zero. The tap loop is gated behind a uniform `If(speed > eps)` so it is skipped
 * at rest, and a final `select` still discards the result when the per-pixel intensity is negligible.
 */
export const radialBlurNode = ({
  sceneColor,
  base,
  stepCount,
  terms,
}: RadialBlurOptions): Node<'vec3'> => {
  const taps = Math.max(Math.round(stepCount), 1)
  const { signedSpeed, speed, edgeMask, intensity } = terms

  return Fn(() => {
    const sampled = base

    const directionSign = signedSpeed
      .greaterThanEqual(0)
      .select(float(1), float(-1))
      .toVar()
    const blurOffset = BLUR_FOCUS.sub(screenUV).mul(directionSign).toVar()
    const radialDirection = normalize(blurOffset.add(BLUR_DIRECTION_EPSILON)).toVar()
    const jitterDirection = vec2(radialDirection.y.negate(), radialDirection.x).toVar()
    const inverseSteps = float(1 / taps)
    const jitter = interleavedGradientNoise(screenCoordinate.xy.add(time))
      .sub(0.5)
      .mul(NOISE_JITTER_SCALE)

    const accumulated = sampled.rgb.toVar()
    const weightSum = float(1).toVar()

    // `speed` is a uniform, so this branch has no per-fragment divergence: at rest the tap loop is
    // skipped entirely instead of fetching ~`taps` texels whose weights `intensity` (≈0) discards.
    If(speed.greaterThan(BLUR_INTENSITY_EPSILON), () => {
      Loop(taps, ({ i: stepIndex }) => {
        // The GLSL indexed taps from 1, so a zero counter must give a step of 1/taps.
        const stepT = stepIndex.add(1).toFloat().mul(inverseSteps)
        const sampleUv = screenUV
          .add(blurOffset.mul(stepT.mul(BLUR_BASE_MIX).mul(intensity)))
          .add(jitterDirection.mul(jitter))
          .clamp(SAMPLE_UV_MIN, SAMPLE_UV_MAX)

        const weight = float(1).sub(stepT.mul(BLUR_STEP_FALLOFF)).mul(intensity)
        accumulated.addAssign(sceneColor.sample(sampleUv).rgb.mul(weight))
        weightSum.addAssign(weight)
      })
    })

    const blurred = mix(
      sampled.rgb,
      accumulated.div(weightSum).mul(BLUR_EXPOSURE),
      intensity,
    )

    const skipBlur = intensity
      .lessThanEqual(BLUR_INTENSITY_EPSILON)
      .or(edgeMask.lessThanEqual(EDGE_BLUR_THRESHOLD))

    return select(skipBlur, sampled.rgb, blurred)
  })()
}

// Hash terms for the classic `fract(sin(dot(p, k)) * m)` white noise.
const WHITE_NOISE_FREQUENCY = /*#__PURE__*/ vec2(12.9898, 78.233).toConst()
const WHITE_NOISE_MAGNITUDE = 43758.5453

/**
 * Per-pixel white noise in 0..1.
 *
 * Feed it UV-space coordinates rather than pixel coordinates: the hash leans on the sine's fine
 * structure, which loses precision as the argument grows.
 */
export const whiteNoise = /*#__PURE__*/ Fn(([p]: readonly [p: Node<'vec2'>]) =>
  fract(sin(dot(p, WHITE_NOISE_FREQUENCY)).mul(WHITE_NOISE_MAGNITUDE)),
).setLayout({
  name: 'whiteNoise',
  type: 'float',
  inputs: [{ name: 'p', type: 'vec2', qualifier: 'in' }],
})

export type EdgeNoiseOptions = {
  baseColor: Node<'vec3'>
  terms: SpeedTerms
}

/**
 * White-noise grain that lightens the edges, weighted by the same edge mask and speed that drive
 * the radial blur, so it peaks where the blur streaks and is gone at rest and at the centre.
 *
 * This replaces the baked noise texture: the hash costs a few ALU ops instead of a texture fetch,
 * and the weight already reaches zero where the GLSL's early-out used to cut the effect.
 */
export const edgeNoiseNode = ({ baseColor, terms }: EdgeNoiseOptions): Node<'vec3'> => {
  const amount = whiteNoise(screenUV).mul(terms.intensity)

  return mix(baseColor, baseColor.add(vec3(NOISE_LIGHTEN_AMOUNT)), amount)
}

export type SpeedEffectsOptions = {
  sceneColor: TextureNode
  uSpeed: UniformNode<'float', number>
  stepCount: number
}

/** The whole effect: radial blur, then edge noise, then the vignette. */
export const speedEffectsNode = ({
  sceneColor,
  uSpeed,
  stepCount,
}: SpeedEffectsOptions): Node<'vec4'> => {
  const terms = deriveSpeedTerms(uSpeed)
  const sampled = sceneColor.sample(screenUV)

  const blurred = radialBlurNode({ sceneColor, base: sampled, stepCount, terms })
  const grained = edgeNoiseNode({ baseColor: blurred, terms })

  return vec4(grained.mul(terms.vignetteFade), sampled.a)
}
