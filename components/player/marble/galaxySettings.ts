export type GalaxyQuality = {
  segments: number
  samples: 3 | 4 | 6 | 12
  starCount: 8 | 16 | 24
}

export const GALAXY_LIGHT_DIRECTION = [0, 0.25, -1] as const

export const GALAXY_SAMPLE_COUNT = 6

export const GALAXY_DEFAULTS = {
  paletteIndex: 5,
  density: 2.4,
  cloudScale: 1.6,
  driftSpeed: 0.08,
  starBrightness: 1.4,
  reflection: 0.45,
  sharpness: 65,
  refraction: 1.25,
  glass: true,
  clouds: true,
  stars: true,
}
export type GalaxySettings = typeof GALAXY_DEFAULTS

export function createGalaxyStars(seed = 129, count = 24) {
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  return Array.from({ length: count }, () => {
    const height = random() * 2 - 1
    const angle = random() * Math.PI * 2
    const radius = Math.cbrt(random()) * 0.85
    const width = Math.sqrt(1 - height * height) * radius
    return { x: Math.cos(angle) * width, y: height * radius, z: Math.sin(angle) * width }
  })
}
