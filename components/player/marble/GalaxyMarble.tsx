/* eslint-disable react-hooks/immutability */
'use client'

import { useFrame } from '@react-three/fiber'
import { useLocalNodes } from '@react-three/tsl'
import { type FC, type RefObject, useCallback, useLayoutEffect, useMemo } from 'react'
import {
  cameraPosition,
  cos,
  sin,
  float,
  Fn,
  mix,
  modelWorldMatrixInverse,
  modelWorldMatrix,
  vertexStage,
  mx_noise_float,
  normalWorld,
  positionGeometry,
  positionWorld,
  refract,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl'
import { Color, type Mesh, type MeshBasicNodeMaterial, Vector3 } from 'three/webgpu'

import {
  clampPaletteIndexSafe,
  createPaletteStops,
  PLAYER_PALETTE_STOPS,
} from '@/components/palette'
import { worldCourseNode } from '@/resources/tsl/courseSurface'
import type { CourseSurface } from '@/utils/platform/courseSurface'
import {
  createGalaxyStars,
  GALAXY_DEFAULTS,
  GALAXY_SAMPLE_COUNT,
  type GalaxySettings,
  type GalaxyQuality,
} from './galaxySettings'

export type GalaxyMarbleProps = {
  radius?: number
  settings?: GalaxySettings
  animationTime: RefObject<number>
  opacity?: number
  samples?: GalaxyQuality['samples']
  starCount?: GalaxyQuality['starCount']
  rotation?: number
  lightDirection?: readonly [number, number, number]
  ref?: RefObject<Mesh | null>
  segments?: number
  visible?: boolean
  colour?: string
  surface?: CourseSurface
  confirmingPaletteIndex?: number
  confirmationProgress?: RefObject<number>
  speed?: RefObject<number>
}
// Matches the lab’s -180° azimuth and 0.25 light height.
const DEFAULT_LIGHT = [0, 0.25, -1] as const
const STARS = createGalaxyStars()

export const GalaxyMarble: FC<GalaxyMarbleProps> = ({
  radius = 0.45,
  settings = GALAXY_DEFAULTS,
  animationTime,
  opacity = 1,
  samples = GALAXY_SAMPLE_COUNT,
  starCount = 24,
  rotation,
  lightDirection = DEFAULT_LIGHT,
  ref,
  segments = 64,
  visible = true,
  colour,
  surface,
  confirmingPaletteIndex = -1,
  confirmationProgress,
  speed,
}) => {
  const uniforms = useMemo(
    () => ({
      time: uniform(0),
      speed: uniform(0),
      confirmation: uniform(0),
      confirmingColour: uniform(new Color()),
      confirmingHighlight: uniform(new Color()),
      density: uniform(0),
      cloudScale: uniform(0),
      driftSpeed: uniform(0),
      starBrightness: uniform(0),
      reflection: uniform(0),
      sharpness: uniform(0),
      refraction: uniform(1),
      glass: uniform(1),
      clouds: uniform(1),
      stars: uniform(1),
      opacity: uniform(1),
      cloudColour: uniform(new Color()),
      highlightColour: uniform(new Color()),
      light: uniform(new Vector3()),
    }),
    [],
  )
  useLayoutEffect(() => {
    for (const key of [
      'density',
      'cloudScale',
      'driftSpeed',
      'starBrightness',
      'reflection',
      'sharpness',
      'refraction',
    ] as const)
      uniforms[key].value = settings[key]
    for (const key of ['glass', 'clouds', 'stars'] as const)
      uniforms[key].value = Number(settings[key])
    const [, base, highlight] = colour
      ? createPaletteStops(colour)
      : PLAYER_PALETTE_STOPS[clampPaletteIndexSafe(settings.paletteIndex)]
    const [, nextBase, nextHighlight] =
      PLAYER_PALETTE_STOPS[clampPaletteIndexSafe(confirmingPaletteIndex)]
    uniforms.confirmingColour.value.setRGB(...nextBase)
    uniforms.confirmingHighlight.value.setRGB(...nextHighlight)
    uniforms.cloudColour.value.setRGB(...base)
    uniforms.highlightColour.value.setRGB(...highlight)
    uniforms.opacity.value = opacity
    uniforms.light.value.set(...lightDirection).normalize()
  }, [settings, opacity, lightDirection, uniforms, colour, confirmingPaletteIndex])

  useFrame(() => {
    uniforms.time.value = animationTime.current
    uniforms.speed.value = speed?.current ?? 0
    uniforms.confirmation.value =
      confirmingPaletteIndex < 0 ? 0 : (confirmationProgress?.current ?? 0)
  })

  const { colorNode, opacityNode, emissiveNode } = useLocalNodes(() => {
    const u = uniforms
    const entry = positionGeometry.normalize().toVar()
    const height = entry.y.mul(0.5).add(0.5).toVar()
    const reveal = smoothstep(
      height.sub(0.162).clamp(0, 1),
      height.add(0.162).clamp(0, 1),
      u.confirmation,
    ).toVar()
    const cloudColour = mix(u.cloudColour, u.confirmingColour, reveal).toVar()
    const highlightColour = mix(u.highlightColour, u.confirmingHighlight, reveal).toVar()
    const cameraLocal = vertexStage(modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz)
    const incoming = positionGeometry.sub(cameraLocal).normalize()
    // shortcut: stylised interior refraction only; add scene transmission if the approved look needs the track visible through glass.
    const ray = refract(incoming, entry, vertexStage(float(1).div(u.refraction)))
      .normalize()
      .toVar()
    const distance = entry.dot(ray).mul(-2).max(0).toVar()
    const step = distance.mul(1 / samples).toVar()
    const drift = vertexStage(u.time.mul(u.driftSpeed))
    const driftOffset = vertexStage(vec3(drift.mul(0.2), drift.mul(-0.4), 0))
    const clouds = Fn(() => {
      const colour = vec3(0).toVar()
      const transmission = float(1).toVar()
      for (let index = 0; index < samples; index++) {
        const point = entry.add(ray.mul(step.mul(index + 0.5))).toVar()
        const angle = drift.add(point.y.mul(0.7)).toVar()
        const sine = sin(angle).toVar()
        const cosine = cos(angle).toVar()
        const swirl = vec3(
          point.x.mul(cosine).sub(point.z.mul(sine)),
          point.y,
          point.x.mul(sine).add(point.z.mul(cosine)),
        )
        const domain = swirl.mul(u.cloudScale).add(driftOffset).toVar()
        const broad = mx_noise_float(domain).toVar()
        const detail = mx_noise_float(domain.mul(2.1).add(12.4))
        const fine = mx_noise_float(domain.mul(6.3).add(31.7))
        const field = smoothstep(0.02, 0.55, broad.add(detail.mul(0.32)).add(fine.mul(0.14)))
        const boundary = float(1).sub(smoothstep(0.65, 1, point.length()))
        const absorption = float(1)
          .sub(field.mul(boundary).mul(u.density).mul(step).negate().exp())
          .mul(u.clouds)
          .toVar()
        const tint = mix(cloudColour, highlightColour, smoothstep(0.1, 0.7, broad))
        colour.addAssign(tint.mul(absorption).mul(transmission).mul(1.6))
        transmission.mulAssign(float(1).sub(absorption))
      }
      return colour
    })()
    const stars = Fn(() => {
      const brightness = float(0).toVar()
      for (let index = 0; index < starCount; index++) {
        const star = STARS[index]
        const offset = vec3(star.x, star.y, star.z).sub(entry).toVar()
        const along = offset.dot(ray).clamp(0, distance)
        const separation = offset.sub(ray.mul(along)).length()
        const starMask = float(1)
          .sub(smoothstep(0.002, 0.014, separation))
          .toVar()
        brightness.addAssign(starMask.mul(starMask))
      }
      return brightness.mul(u.starBrightness).mul(u.stars)
    })()
    const view = cameraPosition.sub(positionWorld).normalize().toVar()
    const facing = normalWorld.dot(view).max(0)
    const rim = float(1).sub(facing).toVar()
    const rimSquared = rim.mul(rim).toVar()
    const fresnel = rimSquared.mul(rimSquared).mul(rim).mul(0.92).add(0.08)
    const highlight = normalWorld.dot(u.light.add(view).normalize()).max(0).pow(u.sharpness).toVar()
    const highlightSquared = highlight.mul(highlight).toVar()
    const glass = vec3(0.55, 0.72, 1)
      .mul(fresnel)
      .add(highlight.mul(0.7))
      .add(highlightSquared.mul(highlightSquared).mul(3))
      .mul(u.reflection)
      .mul(u.glass)
    const respawnFade = surface
      ? vertexStage(
          float(3.5)
            .sub(worldCourseNode(modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz, surface).y)
            .div(2)
            .clamp(0, 1),
        )
      : float(1)
    const interior = clouds
      .mul(float(1).sub(u.speed.mul(0.2)))
      .add(vec3(0.8, 0.9, 1).mul(stars).mul(u.speed.mul(0.35).add(1)))
      .toVar()
    return {
      opacityNode: u.opacity.mul(respawnFade),
      emissiveNode: interior.mul(0.15),
      colorNode: vec3(0.008, 0.012, 0.028).add(interior.mul(0.85)).add(glass),
    }
  }, [uniforms, samples, starCount, surface])

  // Publish only the interior to the game's selective-bloom attachment.
  const attachMaterial = useCallback(
    (material: MeshBasicNodeMaterial | null) => {
      if (!material) return
      Object.assign(material, { emissiveNode })
      material.needsUpdate = true
    },
    [emissiveNode],
  )

  return (
    <mesh
      ref={ref}
      visible={visible}
      rotation={rotation === undefined ? undefined : [0, rotation, 0]}
    >
      <sphereGeometry args={[radius, segments, Math.min(segments, 48)]} />
      <meshBasicNodeMaterial
        ref={attachMaterial}
        colorNode={colorNode}
        opacityNode={opacityNode}
        transparent
        alphaTest={0.001}
        depthWrite={opacity > 0}
      />
    </mesh>
  )
}
