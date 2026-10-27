import {
  cameraPosition,
  cos,
  sin,
  float,
  Fn,
  mix,
  modelWorldMatrixInverse,
  vertexStage,
  mx_noise_float,
  normalWorld,
  positionGeometry,
  positionWorld,
  refract,
  smoothstep,
  uniform,
  uv,
  vec3,
  vec4,
} from 'three/tsl'
import { Color, Vector3 } from 'three/webgpu'

import {
  createGalaxyStars,
  GALAXY_DEFAULTS,
  GALAXY_LIGHT_DIRECTION,
  type GalaxyQuality,
} from './galaxySettings'
import { PLAYER_PALETTE_STOPS, clampPaletteIndexSafe } from '@/components/palette'

const STARS = createGalaxyStars()
// Normalized width is 2: full virtual depth is one-quarter of that width.
const TILE_HALF_DEPTH = 0.25

export const createGalaxyUniforms = (paletteIndex = GALAXY_DEFAULTS.paletteIndex) => {
  const uniforms = {
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
  }
  for (const key of [
    'density',
    'cloudScale',
    'driftSpeed',
    'starBrightness',
    'reflection',
    'sharpness',
    'refraction',
  ] as const)
    uniforms[key].value = GALAXY_DEFAULTS[key]
  const [, base, highlight] = PLAYER_PALETTE_STOPS[clampPaletteIndexSafe(paletteIndex)]
  uniforms.cloudColour.value.setRGB(...base)
  uniforms.highlightColour.value.setRGB(...highlight)
  uniforms.light.value.set(...GALAXY_LIGHT_DIRECTION).normalize()
  return uniforms
}

export function createGalaxyNodes(
  uniforms: ReturnType<typeof createGalaxyUniforms>,
  samples: GalaxyQuality['samples'],
  starCount: GalaxyQuality['starCount'],
  shape: 'sphere' | 'tile',
) {
  const u = uniforms
  const entry = (
    shape === 'sphere'
      ? positionGeometry.normalize()
      : vec3(uv().x.mul(2).sub(1), TILE_HALF_DEPTH, float(1).sub(uv().y.mul(2)))
  ).toVar()
  const height = entry.y.mul(0.5).add(0.5).toVar()
  const reveal = smoothstep(
    height.sub(0.162).clamp(0, 1),
    height.add(0.162).clamp(0, 1),
    u.confirmation,
  ).toVar()
  const cloudColour = mix(u.cloudColour, u.confirmingColour, reveal).toVar()
  const highlightColour = mix(u.highlightColour, u.confirmingHighlight, reveal).toVar()
  const cameraLocal = vertexStage(modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz)
  const worldIncoming = positionWorld.sub(cameraPosition).normalize()
  const tangent = vec3(normalWorld.y, normalWorld.x.negate(), 0).normalize()
  const incoming =
    shape === 'sphere'
      ? positionGeometry.sub(cameraLocal).normalize()
      : vec3(worldIncoming.dot(tangent), worldIncoming.dot(normalWorld), worldIncoming.z)
  // shortcut: virtual interior only; add scene transmission if the track must show through.
  const ray = refract(
    incoming,
    shape === 'sphere' ? entry : vec3(0, 1, 0),
    vertexStage(float(1).div(u.refraction)),
  )
    .normalize()
    .toVar()
  const sideExit = (position: typeof entry.x, direction: typeof ray.x) =>
    direction
      .greaterThanEqual(0)
      .select(float(1).sub(position), position.add(1))
      .div(direction.abs().max(0.00001))
  const distance = (
    shape === 'sphere'
      ? entry.dot(ray).mul(-2).max(0)
      : sideExit(entry.x, ray.x)
          .min(sideExit(entry.z, ray.z))
          .min(entry.y.add(TILE_HALF_DEPTH).div(ray.y.negate().max(0.00001)))
          .max(0)
  ).toVar()
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
      const boundary = float(1).sub(
        smoothstep(
          0.65,
          1,
          shape === 'sphere'
            ? point.length()
            : point.x.abs().max(point.y.abs().div(TILE_HALF_DEPTH)).max(point.z.abs()),
        ),
      )
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
      const offset = vec3(star.x, star.y * (shape === 'tile' ? TILE_HALF_DEPTH : 1), star.z)
        .sub(entry)
        .toVar()
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
  const interior = clouds
    .mul(float(1).sub(u.speed.mul(0.2)))
    .add(vec3(0.8, 0.9, 1).mul(stars).mul(u.speed.mul(0.35).add(1)))
    .toVar()
  return {
    emissiveNode: interior.mul(0.15),
    colorNode: vec3(0.008, 0.012, 0.028).add(interior.mul(0.85)).add(glass),
  }
}
