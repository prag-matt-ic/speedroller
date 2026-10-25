import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js'
import ClusteredLightsNode from 'three/addons/tsl/lighting/ClusteredLightsNode.js'
import {
  AmbientLight,
  DirectionalLight,
  PointLight,
  WebGPURenderer,
  type WebGPURendererParameters,
} from 'three/webgpu'

import { RING_EMISSIVE } from '@/components/platform/rings/ringConfig'
import { PLATFORM_DATA } from '@/resources/rowsData'

/**
 * Light objects are created once at module scope and mounted by `SceneLights`, matching the
 * Threenix landing scene. The owning systems only write intensity and position, so no frame path
 * constructs a light or a temporary vector.
 */

// Kept at the values the tile material used before it inherited scene lighting: a white fill and a
// warm key from (-3, 6, 4). The proposed 0.8/1.6 pair made ivory too dim in the actual course.
const TILE_AMBIENT_INTENSITY = 0.6
const TILE_KEY_INTENSITY = 2.2

export const TILE_AMBIENT_LIGHT = new AmbientLight('#ffffff', TILE_AMBIENT_INTENSITY)

export const TILE_KEY_LIGHT = new DirectionalLight('#fff2df', TILE_KEY_INTENSITY)
TILE_KEY_LIGHT.position.set(-3, 6, 4)

/**
 * The character light. Its colour follows the selected marble palette in `SceneLights`; the values
 * here are the intensity and reach of the pool it throws onto the tiles. A point light at the ball
 * centre falls off steeply across the first tile, so these are deliberately small compared with the
 * landing scene's fixture lights. Playtest tuning values, not physically calibrated ones.
 */
export const PLAYER_LIGHT_CONSTANTS = {
  intensity: Math.PI * 0.8,
  distance: 6,
  decay: 1.2,
} as const

export const PLAYER_POINT_LIGHT = new PointLight(
  '#c8c8c8',
  PLAYER_LIGHT_CONSTANTS.intensity,
  PLAYER_LIGHT_CONSTANTS.distance,
  PLAYER_LIGHT_CONSTANTS.decay,
)

PLAYER_POINT_LIGHT.castShadow = false

/** One shadowless light per ring, co-located with the torus and extinguished once it is collected. */
export const RING_LIGHT_CONSTANTS = {
  color: RING_EMISSIVE,
  intensity: Math.PI * 0.9,
  distance: 5,
  decay: 1.2,
} as const

/**
 * The pool is sized from the authored platform data rather than a hand-written count, so rebuilding
 * the course moves both the rings and their lights. The renderer sizes its light texture and
 * per-cluster list from this total; a light beyond it would be silently dropped.
 */
export const MAX_RING_LIGHTS = Math.max(
  ...Object.values(PLATFORM_DATA.modes).map(({ totalCounts }) => totalCounts.rings),
)

export const RING_POINT_LIGHTS: PointLight[] = Array.from(
  { length: MAX_RING_LIGHTS },
  () => {
    const light = new PointLight(
      RING_LIGHT_CONSTANTS.color,
      // Starts extinguished; its ring turns it on when the ring is placed.
      0,
      RING_LIGHT_CONSTANTS.distance,
      RING_LIGHT_CONSTANTS.decay,
    )

    light.castShadow = false

    return light
  },
)

/** The player light plus every ring slot mounted by `SceneLights`. */
export const SCENE_POINT_LIGHT_COUNT = 1 + RING_POINT_LIGHTS.length

// Capacity carries every authored point light with nothing spare, so a longer pool cannot grow
// unnoticed. Both capacities are the same total: the per-cluster list is proven below the real
// overlap for this course, and a smaller cap would reintroduce silent per-cluster drops.
const MAX_CLUSTERED_LIGHTS = SCENE_POINT_LIGHT_COUNT
// 64-pixel tiles quarter the addon's 32-pixel default cluster grid. The course's lights are small
// and local (reach 5-6 units), so tiles mainly bound the cluster pass rather than the light count.
const CLUSTER_TILE_SIZE = 64
const CLUSTER_Z_SLICES = 24

/**
 * `create` is on the instance but missing from the addon's public typings, so this is the seam the
 * drawing-buffer clamp attaches to.
 */
type ClusteredLightsNodeInternals = ClusteredLightsNode & {
  create: (width: number, height: number) => void
}

/**
 * Guards the grid against a drawing buffer that has no usable size yet, which is the one input the
 * addon cannot defend itself against: an unsized buffer would otherwise build a zero-length index
 * buffer and a `NaN` grid. It only bites while the buffer is unusable and settles on the same value
 * each time, so it cannot thrash the grid rebuild.
 */
const hasUsableClusterSize = (size: number) =>
  Number.isFinite(size) && Math.floor(size / CLUSTER_TILE_SIZE) >= 1

/** Renderer-owned nodes share one cluster grid across the scene's default lit materials. */
export const createSceneLighting = () => {
  const lighting = new ClusteredLighting(
    MAX_CLUSTERED_LIGHTS,
    CLUSTER_TILE_SIZE,
    CLUSTER_Z_SLICES,
    MAX_CLUSTERED_LIGHTS,
  )
  const createNode = lighting.createNode.bind(lighting)
  lighting.createNode = (lights = []) => {
    const node = createNode(lights)
    const internals = node as ClusteredLightsNodeInternals
    const create = internals.create.bind(node)
    internals.create = (width, height) => {
      const isUsable = hasUsableClusterSize(width) && hasUsableClusterSize(height)
      create(isUsable ? width : CLUSTER_TILE_SIZE, isUsable ? height : CLUSTER_TILE_SIZE)
    }
    return node
  }
  return lighting
}

/** Install before R3F initializes the renderer or any scene render list is cached. */
export const createSceneRenderer = (parameters: WebGPURendererParameters) => {
  const renderer = new WebGPURenderer(parameters)
  renderer.lighting = createSceneLighting()
  return renderer
}
