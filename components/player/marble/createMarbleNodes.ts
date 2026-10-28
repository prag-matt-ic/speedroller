import {
  clamp,
  float,
  Fn,
  If,
  mix,
  modelWorldMatrix,
  mx_noise_float,
  normalView,
  positionGeometry,
  positionView,
  smoothstep,
  vec3,
  vec4,
  vertexStage,
} from 'three/tsl'
import type { Node, UniformNode } from 'three/webgpu'

import { createPaletteStops } from '@/components/palette'
import { worldCourseNode } from '@/resources/tsl/courseSurface'
import { getColourFromPalette } from '@/resources/tsl/playerPalette'
import type { CourseSurface } from '@/utils/platform/courseSurface'

// Carried over from marble.vert / marble.frag.
const RESPAWN_FADE_START_Y = 3.5
const RESPAWN_FADE_RANGE = 2.0

const AMBIENT_STRENGTH = 0.3
const DIFFUSE_STRENGTH = 0.6
const SPECULAR_STRENGTH = 0.4
const NOISE_FREQUENCY = 0.24
const REVEAL_SMOOTHNESS = 0.12
const VEIN_NOISE_FREQUENCY = 0.7
const VEIN_ANIMATION_SPEED = 0.06
const VEIN_POWER = 2.8
const VEIN_INTENSITY = 0.4
const VEIN_BRIGHTEN_STRENGTH = 0.8
const SPEED_DARKEN_MAX = 0.2
const SPEED_VEIN_INTENSITY_BOOST = 0.35
const SPEED_VEIN_BRIGHTEN_BOOST = 0.25

// Subtle player-coloured bloom; the emissive MRT keeps it separate from the marble's lit surface.
const BALL_EMISSIVE_STRENGTH = 0.35

// normalize(vec3(1, 1, 1)), which GLSL folds at compile time.
const LIGHT_DIR = /*#__PURE__*/ vec3(0.57735027, 0.57735027, 0.57735027).toConst()

export type MarbleShaderUniforms = {
  uTime: UniformNode<'float', number>
  uConfirmingProgress: UniformNode<'float', number>
  uSpeed: UniformNode<'float', number>
  uPaletteIndex: UniformNode<'int', number>
  uConfirmingPaletteIndex: UniformNode<'int', number>
}

export function createMarbleNodes(
  scoped: MarbleShaderUniforms,
  { enableVeins, isFlat, surface, colour }: {
    enableVeins: boolean
    isFlat: boolean
    surface: CourseSurface
    colour?: string
  },
) {
  const unitLocalPosition = positionGeometry.normalize()
  const animatedTime = scoped.uTime.mul(VEIN_ANIMATION_SPEED)

  // The GLSL used glsl-noise's Ashima simplex; this uses TSL's built-in MaterialX noise. Same
  // -1..1 range and the same frequency constants, but a different field, so the vein pattern
  // differs slightly. Taken deliberately to drop the glsl-noise dependency.

  const noiseValue = mx_noise_float(
    unitLocalPosition.mul(NOISE_FREQUENCY).add(animatedTime),
  )
    .mul(0.5)
    .add(0.5)
  const paletteT = clamp(noiseValue, float(0), float(1))

  const stops = colour === undefined ? null : createPaletteStops(colour)
  const baseColor = stops
    ? mix(
        mix(vec3(...stops[0]), vec3(...stops[1]), paletteT.mul(2).clamp(0, 1)),
        vec3(...stops[2]),
        paletteT.mul(2).sub(1).clamp(0, 1),
      )
    : getColourFromPalette(scoped.uPaletteIndex, paletteT)

  // Fn's body runs after the creator returns, so scoped reads inside it are not tracked.
  // Hoist the two uniforms the reveal reads so a replaced generation rebuilds this graph.
  const { uConfirmingPaletteIndex, uConfirmingProgress } = scoped

  // applyConfirmingReveal: the GLSL early-returns when there is no confirming palette. The
  // confirming lookup is only needed during a colour change, so it moves
  // behind a uniform branch: `hasConfirmingPalette` derives from uniforms, so the branch has no
  // per-fragment divergence and skips the whole reveal subtree the rest of the time.
  const hasConfirmingPalette = uConfirmingPaletteIndex
    .greaterThanEqual(0)
    .and(uConfirmingProgress.greaterThan(0))
  const baseMarbleColor = stops ? baseColor : Fn(() => {
    const marble = baseColor.toVar()
    If(hasConfirmingPalette, () => {
      const confirmingColor = getColourFromPalette(uConfirmingPaletteIndex, paletteT)
      const clampedProgress = clamp(uConfirmingProgress, float(0), float(1))
      const height01 = unitLocalPosition.y.mul(0.5).add(0.5)
      const revealSmoothness = REVEAL_SMOOTHNESS * 1.35
      const revealEdgeLow = clamp(height01.sub(revealSmoothness), float(0), float(1))
      const revealEdgeHigh = clamp(height01.add(revealSmoothness), float(0), float(1))
      const reveal = smoothstep(revealEdgeLow, revealEdgeHigh, clampedProgress)
      marble.assign(mix(baseColor, confirmingColor, reveal))
    })
    return marble
  })()

  // enableVeins is a graph constant: branch at build time so disabling veins omits the noise
  // and pow instead of multiplying their result by zero.
  const speedAmount = clamp(scoped.uSpeed, float(0), float(1))
  let veinContribution: Node<'vec3'> = vec3(0)
  if (enableVeins) {
    const veinNoise = mx_noise_float(
      unitLocalPosition.mul(VEIN_NOISE_FREQUENCY).add(animatedTime),
    )
    const veinMask = clamp(float(1).sub(veinNoise.abs()), float(0), float(1)).pow(VEIN_POWER)
    const veinBrighten = float(VEIN_BRIGHTEN_STRENGTH).add(
      speedAmount.mul(SPEED_VEIN_BRIGHTEN_BOOST),
    )
    const veinIntensity = float(VEIN_INTENSITY).add(
      speedAmount.mul(SPEED_VEIN_INTENSITY_BOOST),
    )
    const veinColour = mix(baseMarbleColor, vec3(1), veinBrighten)
    veinContribution = veinColour.mul(veinMask).mul(veinIntensity)
  }

  const marbleColor = baseMarbleColor
    .mul(float(1).sub(speedAmount.mul(SPEED_DARKEN_MAX)))
    .add(veinContribution)

  // isFlat is a graph constant: when flat, skip the lighting work entirely rather than
  // computing it and then selecting it away.
  let litSurface: Node<'vec3'>
  if (isFlat) {
    litSurface = marbleColor
  } else {
    // Surface lighting, ported as-is: the scene has no three.js lights to hand this to.
    const viewDirection = positionView.negate().normalize()
    const diffuse = normalView.dot(LIGHT_DIR).max(0)
    const halfDirection = LIGHT_DIR.add(viewDirection).normalize()
    const specularBase = normalView.dot(halfDirection).max(0)
    // specularBase^10 by repeated squaring, as the GLSL did.
    const specular2 = specularBase.mul(specularBase)
    const specular4 = specular2.mul(specular2)
    const specular8 = specular4.mul(specular4)
    const specular = specular8.mul(specular2)
    litSurface = marbleColor
      .mul(float(AMBIENT_STRENGTH).add(diffuse.mul(DIFFUSE_STRENGTH)))
      .add(specular.mul(SPECULAR_STRENGTH))
  }

  // Respawn fade from the mesh's world-space height. The model matrix is one value for the
  // whole draw, so the clamp is a per-draw constant: hoist it to the vertex stage rather than
  // re-evaluating it per fragment.
  const worldCentre = modelWorldMatrix.mul(vec4(0, 0, 0, 1))
  const respawnFade: Node<'float'> = vertexStage(
    clamp(
      float(RESPAWN_FADE_START_Y).sub(worldCourseNode(worldCentre.xyz, surface).y).div(RESPAWN_FADE_RANGE),
      float(0),
      float(1),
    ),
  )

  return {
    colorNode: litSurface,
    opacityNode: respawnFade,
    emissiveNode: baseMarbleColor.mul(BALL_EMISSIVE_STRENGTH),
  }
}
