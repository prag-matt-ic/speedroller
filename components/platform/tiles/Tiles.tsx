import { useTexture } from '@react-three/drei'
import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import {
  InstancedRigidBodies,
  type InstancedRigidBodyProps,
  type RapierRigidBody,
} from '@react-three/rapier'
import {
  type Dispatch,
  type FC,
  type SetStateAction,
  Suspense,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  attribute,
  clamp,
  cross,
  dot,
  float,
  floor,
  fract,
  max,
  mix,
  mx_noise_float,
  normalLocal,
  positionGeometry,
  positionLocal,
  positionWorld,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  texture,
  uv,
  vec2,
  vec3,
  vertexStage,
} from 'three/tsl'
import {
  type InstancedBufferAttribute,
  Texture,
} from 'three'
import type { Node, UniformNode } from 'three/webgpu'

import tileDetailNoise2 from '@/assets/textures/platform/tile-noise-2.webp'
import tileDetailNoise3 from '@/assets/textures/platform/tile-noise-3.webp'
import tileDetailNoise1 from '@/assets/textures/platform/tile-noise.webp'
import { SceneQuality, usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import { sampleTilesPalette } from '@/resources/tsl/tilesPalette'
import {
  COLUMNS,
  ROWS_RENDERED,
  TILE_PLAYER_FADE_FULL_RADIUS,
  TILE_PLAYER_FADE_MIN_ALPHA,
  TILE_PLAYER_FADE_MIN_RADIUS,
  TILE_PLAYER_HIGHLIGHT_RADIUS,
  TILE_SIZE,
  TILE_THICKNESS,
} from '@/utils/tiles'

const INSTANCE_COUNT = COLUMNS * ROWS_RENDERED

const TILE_UNIFORM_SCOPE = 'platformTiles'

// Carried over from tile.vert / tile.frag.
const TILE_FADE_ROTATE_MAX = 0.3
const AXIS_EPSILON = 0.001
const UP_THRESHOLD = 0.5
const DARKEN_FACTOR = 0.4
const HIGHLIGHTED_MIX_MIN = 0.16
const HIGHLIGHTED_MIX_MAX = 0.32
const REGULAR_MIX = 0.55
const PLAYER_PROXIMITY_MIX = 0.88
const SHADOW_RADIUS = 0.9
const SHADOW_RADIUS_MAX_SCALE = 1.5
const SHADOW_RADIUS_MIN_SCALE = 1.0
const SHADOW_STRENGTH = 0.85
const SHADOW_FADE_START_Y = 1.8
const SHADOW_FADE_END_Y = 0.5
const SHADOW_FADE_RANGE_INV = 1.0 / (SHADOW_FADE_START_Y - SHADOW_FADE_END_Y)
const SHADOW_MIN_PLAYER_Y = -0.5

const DETAIL_NOISE_STRENGTH = 0.12

// tile.frag's early `if (vAlpha <= 0.001) discard;`. A discard needs a statement stack, which a
// material graph built at React render time does not have, so the material's own alpha test does it.
const ALPHA_TEST = 0.001

// Only uPlayerWorldPos is owned here; uScrollZ is shared with the floating tiles. The remaining
// values are scene settings that only change when the quality tier does, so they live on the same
// creator rather than in a second scope.
type TileShaderUniforms = {
  uHighlightRadiusSq: UniformNode<'float', number>
  uFadeFullRadiusSq: UniformNode<'float', number>
  uFadeMinRadiusSq: UniformNode<'float', number>
  uFadeMinAlpha: UniformNode<'float', number>
  uAddDetailNoise: UniformNode<'float', number>
  uShadowEnabled: UniformNode<'float', number>
}

type TileConfig = {
  addDetailNoise: boolean
  isLowQuality: boolean
}

// Radii are squared on the CPU once per mount: the shader compares squared distances, so this
// avoids re-squaring each radius per fragment and per vertex.
const createTileUniforms = ({ addDetailNoise, isLowQuality }: TileConfig) => () => ({
  uHighlightRadiusSq: TILE_PLAYER_HIGHLIGHT_RADIUS * TILE_PLAYER_HIGHLIGHT_RADIUS,
  uFadeFullRadiusSq: TILE_PLAYER_FADE_FULL_RADIUS * TILE_PLAYER_FADE_FULL_RADIUS,
  uFadeMinRadiusSq: TILE_PLAYER_FADE_MIN_RADIUS * TILE_PLAYER_FADE_MIN_RADIUS,
  uFadeMinAlpha: TILE_PLAYER_FADE_MIN_ALPHA,
  uAddDetailNoise: Number(addDetailNoise),
  uShadowEnabled: isLowQuality ? 0 : 1,
})

export type TilesHandle = {
  rigidBodies: RapierRigidBody[] | null
  visibilityAttribute: InstancedBufferAttribute | null
  highlightedAttribute: InstancedBufferAttribute | null
  visibilityData: Float32Array | null
  seedData: Float32Array | null
  highlightedData: Float32Array | null
  setTileInstances: Dispatch<SetStateAction<InstancedRigidBodyProps[]>>
}

type PlatformTilesProps = {
  ref: React.Ref<TilesHandle>
  onReadyChange: (isReady: boolean) => void
}

export const PlatformTiles: FC<PlatformTilesProps> = ({ ref, onReadyChange }) => {
  const addDetailNoise = usePerformanceStore((s) => s.sceneConfig.platformTiles.addDetailNoise)
  const sceneQuality = usePerformanceStore((s) => s.sceneQuality)
  const detailNoiseTextures = useTexture([
    tileDetailNoise1.src,
    tileDetailNoise2.src,
    tileDetailNoise3.src,
  ]) as [Texture, Texture, Texture]

  const [instances, setTileInstances] = useState<InstancedRigidBodyProps[]>([])
  const tileRigidBodies = useRef<RapierRigidBody[]>(null)

  const visibilityData = useRef<Float32Array>(new Float32Array(INSTANCE_COUNT))
  const highlightedData = useRef<Float32Array>(new Float32Array(INSTANCE_COUNT))
  const seedData = useRef<Float32Array>(new Float32Array(INSTANCE_COUNT))

  const visibilityAttribute = useRef<InstancedBufferAttribute>(null)
  const highlightedAttribute = useRef<InstancedBufferAttribute>(null)

  useUniforms(
    createTileUniforms({
      addDetailNoise,
      isLowQuality: sceneQuality === SceneQuality.LOW,
    }),
    TILE_UNIFORM_SCOPE,
  )

  useImperativeHandle(ref, () => {
    return {
      get rigidBodies() {
        return tileRigidBodies.current
      },
      get visibilityData() {
        return visibilityData.current
      },
      get visibilityAttribute() {
        return visibilityAttribute.current
      },
      get highlightedData() {
        return highlightedData.current
      },
      get highlightedAttribute() {
        return highlightedAttribute.current
      },
      get seedData() {
        return seedData.current
      },
      setTileInstances,
    }
  }, [])

  // Port of tile.vert + tile.frag.
  //
  // Every varying is recomputed in-graph: per-instance attributes are read directly, the sphere-side
  // values are not needed, and world position comes from positionWorld, which already folds in the
  // instance matrix for an instanced mesh.
  const { colorNode, opacityNode, positionNode } = useLocalNodes(
    ({ uniforms: scopedUniforms }: CreatorState) => {
      const scoped = scopedUniforms.scope<TileShaderUniforms>(TILE_UNIFORM_SCOPE)
      const { uScrollZ, uPlayerWorldPos } = scopedUniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)

      const tileVisibility = attribute<'float'>('visibility')
      const tileSeed = attribute<'float'>('seed')
      const tileIsHighlighted = attribute<'float'>('isHighlighted')

      const hashFloat = (n: Node<'float'>) => fract(sin(n).mul(43758.5453))

      const playerOffset = positionWorld.xz.sub(uPlayerWorldPos.xz)
      const distanceSquared = dot(playerOffset, playerOffset)

      // edge0 > edge1 is undefined in GLSL/WGSL smoothstep; express the falloff as the equivalent
      // well-defined 1 - smoothstep(0, r², d²) so the highlight is portable across backends.
      const playerHighlight = float(1).sub(
        smoothstep(
          float(0),
          scoped.uHighlightRadiusSq,
          distanceSquared,
        ),
      )

      const visible = clamp(tileVisibility, float(0), float(1))
      const fadeAmount = smoothstep(
        scoped.uFadeFullRadiusSq,
        scoped.uFadeMinRadiusSq,
        distanceSquared,
      )
      const radialAlpha = mix(float(1), float(scoped.uFadeMinAlpha), fadeAmount)
      const alpha = radialAlpha.mul(visible)

      // Per-instance tilt, suppressed for highlighted tiles. Rotation is about the tile's own
      // centre, so the offset is rotated in place and added back.
      const isHighlighted = step(float(0.5), tileIsHighlighted)
      const tiltAmount = float(1).sub(radialAlpha).mul(float(1).sub(isHighlighted))
      const axisSeeds = vec2(hashFloat(tileSeed.mul(3.17)), hashFloat(tileSeed.mul(7.92)))
      const rawAxis = vec3(axisSeeds.x.sub(0.5), float(0), axisSeeds.y.sub(0.5))
      const tiltAxis = rawAxis.div(max(rawAxis.length(), AXIS_EPSILON))

      const signedNoise = hashFloat(tileSeed.mul(11)).mul(2).sub(1)
      const tiltAngle = tiltAmount.mul(TILE_FADE_ROTATE_MAX).mul(signedNoise)
      const tiltSin = sin(tiltAngle)
      const tiltCos = sin(tiltAngle.add(Math.PI / 2))

      // Rodrigues: v*cos + cross(axis, v)*sin + axis*dot(axis, v)*(1 - cos).
      const rotateWithTrig = (
        value: Node<'vec3'>,
        axis: Node<'vec3'>,
        sinAngle: Node<'float'>,
        cosAngle: Node<'float'>,
      ) =>
        value
          .mul(cosAngle)
          .add(cross(axis, value).mul(sinAngle))
          .add(axis.mul(dot(axis, value)).mul(float(1).sub(cosAngle)))

      // `positionNode` replaces the post-instancing `positionLocal`, so the instance transform has to
      // be put back by hand. Three folds the instance matrix into `positionLocal` before this node
      // runs, which makes the difference between the two the instance centre — tile.vert's
      // `instanceCenter`, and what the tilt rotated about. It is the centre rather than a rotated
      // offset because the platform only ever translates its tiles.
      const instanceCenter = positionLocal.sub(positionGeometry)
      const tiltedGeometry = rotateWithTrig(positionGeometry, tiltAxis, tiltSin, tiltCos).add(
        instanceCenter,
      )
      const isFacingUp = step(
        float(UP_THRESHOLD),
        rotateWithTrig(normalLocal, tiltAxis, tiltSin, tiltCos).normalize().y,
      )
      const shade = mix(float(DARKEN_FACTOR), float(1), isFacingUp)

      // --- fragment stage ---
      const backgroundNoisePosition = positionWorld
        .mul(0.06)
        .add(vec3(tileSeed.mul(0.12), tileSeed.mul(-0.12), uScrollZ.mul(-0.06)))

      const backgroundNoise = mx_noise_float(backgroundNoisePosition).mul(0.5).add(0.5)

      // Detail noise, one of three maps per instance. All three are sampled and the result is
      // selected, which keeps the graph branch-free at the cost of two extra taps.
      const detailUv = uv()
      // The index depends only on the per-instance seed, so the sin/fract/floor inside hashFloat
      // runs once per vertex and the fragment stage just reads the varying.
      const detailIndex = vertexStage(floor(hashFloat(tileSeed.mul(438.54)).mul(3)))
      const detailNoise = select(
        detailIndex.lessThan(0.5),
        texture(detailNoiseTextures[0], detailUv).r,
        select(
          detailIndex.lessThan(1.5),
          texture(detailNoiseTextures[1], detailUv).r,
          texture(detailNoiseTextures[2], detailUv).r,
        ),
      )

      // The GLSL gated the subtraction behind its quality flag; the flag is 0 or 1, so multiplying
      // by it keeps the graph branch-free without changing the result.
      const backgroundColour = sampleTilesPalette(backgroundNoise).sub(
        detailNoise.mul(scoped.uAddDetailNoise).mul(DETAIL_NOISE_STRENGTH),
      )

      const highlightedMix = mix(HIGHLIGHTED_MIX_MIN, HIGHLIGHTED_MIX_MAX, tileSeed)
      const mixAmount = mix(REGULAR_MIX, highlightedMix, isHighlighted)

      const proximityMixAmount = mix(PLAYER_PROXIMITY_MIX, mixAmount, isHighlighted)
      const proximityColour = mix(vec3(1), backgroundColour, proximityMixAmount)
      const background = mix(
        mix(vec3(1), backgroundColour, mixAmount),
        proximityColour,
        playerHighlight,
      )

      // Player contact shadow. `distanceSquared` is already derived above, so reuse it instead of
      // recomputing the same sub + dot.
      const playerDistance = distanceSquared.sqrt()
      const shadowHeightT = clamp(
        float(SHADOW_FADE_START_Y)
          .sub(uPlayerWorldPos.y)
          .mul(SHADOW_FADE_RANGE_INV),
        float(0),
        float(1),
      )
      const playerAboveGround = step(float(SHADOW_MIN_PLAYER_Y), uPlayerWorldPos.y)
      const shadowHeightFade = shadowHeightT
        .mul(shadowHeightT)
        .mul(float(3).sub(shadowHeightT.mul(2)))
        .mul(playerAboveGround)
      const shadowRadius = float(SHADOW_RADIUS).mul(
        mix(SHADOW_RADIUS_MAX_SCALE, SHADOW_RADIUS_MIN_SCALE, shadowHeightFade),
      )
      const rawShadow = float(1).sub(smoothstep(float(0), shadowRadius, playerDistance))
      const shadow = rawShadow
        .mul(rawShadow)
        .mul(sqrt(rawShadow))
        .mul(shadowHeightFade)
        .mul(scoped.uShadowEnabled)

      const shadowed = background.mul(float(1).sub(shadow.mul(SHADOW_STRENGTH))).mul(shade)

      return {
        positionNode: tiltedGeometry,
        colorNode: shadowed,
        opacityNode: alpha as Node<'float'>,
      }
    },
  )

  useEffect(() => {
    onReadyChange(true)
    return () => {
      onReadyChange(false)
    }
  }, [onReadyChange])

  return (
    <InstancedRigidBodies
      ref={tileRigidBodies}
      instances={instances}
      type="fixed"
      sensor={false}
      colliders="cuboid"
      friction={0.0}>
      <instancedMesh
        args={[undefined, undefined, instances.length]}
        frustumCulled={false}
        count={instances.length}>
        <boxGeometry args={[TILE_SIZE, TILE_THICKNESS, TILE_SIZE, 1, 1, 1]}>
          <instancedBufferAttribute
            ref={visibilityAttribute}
            attach="attributes-visibility"
            args={[visibilityData.current!, 1]}
          />
          <instancedBufferAttribute attach="attributes-seed" args={[seedData.current!, 1]} />
          <instancedBufferAttribute
            ref={highlightedAttribute}
            attach="attributes-isHighlighted"
            args={[highlightedData.current!, 1]}
          />
        </boxGeometry>
        <Suspense fallback={null}>
          <meshBasicNodeMaterial
            colorNode={colorNode}
            opacityNode={opacityNode}
            positionNode={positionNode}
            transparent
            alphaTest={ALPHA_TEST}
          />
        </Suspense>
      </instancedMesh>
    </InstancedRigidBodies>
  )
}
