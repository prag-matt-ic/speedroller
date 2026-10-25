import { useCourseSurface } from '@/hooks/useCourseSurface'
import { courseToWorld } from '@/utils/platform/courseSurface'
import { createSurfaceColliders } from '@/utils/platform/surfaceColliders'
import { coursePositionNode, courseNormalNode, worldCourseNode } from '@/resources/tsl/courseSurface'
import { useTexture } from '@react-three/fiber'
import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/tsl'
import { CuboidCollider, TrimeshCollider, RigidBody } from '@react-three/rapier'
import {
  type FC,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import {
  attribute,
  abs,
  min,
  clamp,
  cross,
  dot,
  float,
  Fn,
  If,
  floor,
  fract,
  max,
  mix,
  mx_noise_float,
  transformNormalToView,
  lights,
  color,
  positionGeometry,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  spritesheetUV,
  sqrt,
  step,
  texture,
  uv,
  vec2,
  vec3,
  vertexStage,
} from 'three/tsl'
import {
  AmbientLight,
  DirectionalLight,
  NoColorSpace,
  ClampToEdgeWrapping,
  type InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Sphere,
  SRGBColorSpace,
  Texture,
  Vector3,
  Box3,
} from 'three'
import type { MeshLambertNodeMaterial, Node, UniformNode } from 'three/webgpu'

import ivoryStoneNormals from '@/assets/textures/platform/ivory-stone-normal.png'
import { createTileSlabGeometry, TILE_SLAB_RADIUS } from '@/utils/platform/tileSlabGeometry'

import ivoryStoneAtlas from '@/assets/textures/platform/ivory-stone-atlas.webp'
import tileDetailNoise2 from '@/assets/textures/platform/tile-noise-2.webp'
import tileDetailNoise3 from '@/assets/textures/platform/tile-noise-3.webp'
import tileDetailNoise1 from '@/assets/textures/platform/tile-noise.webp'
import { SceneQuality, usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE } from '@/components/coreUniforms'
import { createTileTrail, useTileTrail } from '@/components/platform/tiles/useTileTrail'
import { createTileBatches, type TileBatch } from '@/utils/platform/terrainBatches'
import { TILE_PLAYER_FADE_FULL_RADIUS, TILE_PLAYER_FADE_MIN_ALPHA, TILE_PLAYER_FADE_MIN_RADIUS } from '@/utils/sceneDistances'
import { samplePlayerPalette } from '@/resources/tsl/playerPalette'
import {
  type RowData,
  rowToWorldZ,
  TILE_SIZE,
  TILE_THICKNESS,
  TRAIL_FADE_SECONDS,
} from '@/utils/tiles'

const TILE_UNIFORM_SCOPE = 'platformTiles'

// Carried over from tile.vert / tile.frag.
const TILE_FADE_ROTATE_MAX = 0.3
const AXIS_EPSILON = 0.001
const HIGHLIGHTED_MIX_MIN = 0.04
const HIGHLIGHTED_MIX_MAX = 0.10
const REGULAR_MIX = 0.24
const SHADOW_RADIUS = 0.9
const SHADOW_RADIUS_MAX_SCALE = 1.5
const SHADOW_RADIUS_MIN_SCALE = 1.0
const SHADOW_STRENGTH = 0.85
const SHADOW_FADE_START_Y = 1.8
const SHADOW_FADE_END_Y = 0.5
const SHADOW_FADE_RANGE_INV = 1.0 / (SHADOW_FADE_START_Y - SHADOW_FADE_END_Y)
const SHADOW_MIN_PLAYER_Y = -0.5

const DETAIL_NOISE_STRENGTH = 0.12
const STONE_ATLAS_GRID = 3
const STONE_CELL_PIXELS = 512
const STONE_CELL_PADDING = 16
const STONE_UV_INSET = (STONE_CELL_PADDING + 0.5) / STONE_CELL_PIXELS
const STONE_MIN_BRIGHTNESS = 0.65
const TILE_AMBIENT_INTENSITY = 1.4
const TILE_KEY_INTENSITY = 2.2

const configureStoneAtlas = (map: Texture) => {
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = ClampToEdgeWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true
}

// Trail tint: the marble palette darkened toward black so the trail reads as a painted shadow.
// The emissive glow keeps the undarkened player colour so the bloom still picks the trail up.
const TRAIL_PALETTE_T = 0.5
const TRAIL_DARKEN = 0.4
const TRAIL_STRENGTH = 0.85
const TRAIL_EMISSIVE_STRENGTH = 0.35

// tile.frag's early `if (vAlpha <= 0.001) discard;`. A discard needs a statement stack, which a
// material graph built at React render time does not have, so the material's own alpha test does it.
const ALPHA_TEST = 0.001

// One registration owns settings shared by every terrain batch.
type TileShaderUniforms = {
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
  uFadeFullRadiusSq: TILE_PLAYER_FADE_FULL_RADIUS * TILE_PLAYER_FADE_FULL_RADIUS,
  uFadeMinRadiusSq: TILE_PLAYER_FADE_MIN_RADIUS * TILE_PLAYER_FADE_MIN_RADIUS,
  uFadeMinAlpha: TILE_PLAYER_FADE_MIN_ALPHA,
  uAddDetailNoise: Number(addDetailNoise),
  uShadowEnabled: isLowQuality ? 0 : 1,
})

type TileNodes = {
  colorNode: Node<'vec3'>
  opacityNode: Node<'float'>
  positionNode: Node<'vec3'>
  emissiveNode: Node<'vec3'>
  normalNode: Node<'vec3'>
  lightsNode: ReturnType<typeof lights>
}

type PlatformTilesProps = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

type TerrainBatchProps = {
  batch: TileBatch
  trailAttribute: InstancedBufferAttribute
  nodes: TileNodes
}

const TerrainBatch: FC<TerrainBatchProps> = ({ batch, trailAttribute, nodes }) => {
  const surface = useCourseSurface()
  const collision = useMemo(() => surface.topology === 'cylinder' ? createSurfaceColliders(batch.positions, surface) : null, [batch, surface])
  const meshRef = useRef<InstancedMesh>(null)

  // Installed Three types omit emissiveNode; the lighting graph supports it.
  const attachMaterial = useCallback((material: MeshLambertNodeMaterial | null) => {
    if (!material) return
    Object.assign(material, { emissiveNode: nodes.emissiveNode })
    material.needsUpdate = true
  }, [nodes.emissiveNode])
  const geometry = useMemo(() => createTileSlabGeometry(), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    for (let index = 0; index < batch.positions.length; index++) {
      matrix.makeTranslation(...batch.positions[index])
      mesh.setMatrixAt(index, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    if (surface.topology === 'cylinder') {
      const bounds = new Box3()
      const center = new Vector3()
      for (const [x, y, z] of batch.positions) {
        courseToWorld(x, y, z, surface, center)
        bounds.expandByPoint(center)
      }
      mesh.boundingBox = bounds.expandByScalar(TILE_SLAB_RADIUS)
    }
    // The GPU tilts each tile around its centre. Expand the CPU bounds by the largest possible
    // vertex displacement so tilted edges cannot disappear at a frustum boundary.
    const tileRadius = TILE_SLAB_RADIUS
    mesh.boundingBox!.expandByScalar(2 * tileRadius * Math.sin(TILE_FADE_ROTATE_MAX / 2))
    mesh.boundingSphere = mesh.boundingBox!.getBoundingSphere(new Sphere())
  }, [batch, surface])

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[0, 0, rowToWorldZ(batch.startRow)]}
      userData={{ type: 'tile' }}
      friction={0}>
      {collision ? <TrimeshCollider args={[collision.vertices, collision.indices]} friction={0} /> : batch.positions.map((position, index) => (
        <CuboidCollider
          key={index}
          position={position}
          args={[TILE_SIZE / 2, TILE_THICKNESS / 2, TILE_SIZE / 2]}
          friction={0}
        />
      ))}
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, batch.positions.length]}
        count={batch.positions.length}
        frustumCulled>
        <primitive object={geometry} attach="geometry">
          <instancedBufferAttribute attach="attributes-seed" args={[batch.seeds, 1]} />
          <instancedBufferAttribute attach="attributes-isHighlighted" args={[batch.highlights, 1]} />
          <primitive object={trailAttribute} attach="attributes-trailTouchedAt" />
        </primitive>
        <Suspense fallback={null}>
          <meshLambertNodeMaterial
            ref={attachMaterial}
            normalNode={nodes.normalNode}
            lightsNode={nodes.lightsNode}
            colorNode={nodes.colorNode}
            opacityNode={nodes.opacityNode}
            positionNode={nodes.positionNode}
            transparent={true}
            alphaTest={ALPHA_TEST}
          />
        </Suspense>
      </instancedMesh>
    </RigidBody>
  )
}

export const PlatformTiles: FC<PlatformTilesProps> = ({ rows, onReadyChange }) => {
  const surface = useCourseSurface()
  const addDetailNoise = usePerformanceStore((s) => s.sceneConfig.platformTiles.addDetailNoise)
  const sceneQuality = usePerformanceStore((s) => s.sceneQuality)
  const stoneAtlasTexture = useTexture(ivoryStoneAtlas.src, configureStoneAtlas)
  const stoneNormalTexture = useTexture(ivoryStoneNormals.src, (map) => {
    configureStoneAtlas(map)
    map.colorSpace = NoColorSpace
  })
  const detailNoiseTextures = useTexture([
    tileDetailNoise1.src,
    tileDetailNoise2.src,
    tileDetailNoise3.src,
  ]) as [Texture, Texture, Texture]
  const batches = useMemo(() => createTileBatches(rows), [rows])
  const trail = useMemo(() => createTileTrail(batches), [batches])

  useTileTrail(trail, rows.length)

  useUniforms(
    createTileUniforms({
      addDetailNoise,
      isLowQuality: sceneQuality === SceneQuality.LOW,
    }),
    TILE_UNIFORM_SCOPE,
  )

  // Port of tile.vert + tile.frag.
  //
  // Every varying is recomputed in-graph: per-instance attributes are read directly, the sphere-side
  // values are not needed, and world position comes from positionWorld, which already folds in the
  // instance matrix for an instanced mesh.
  const { colorNode, opacityNode, positionNode, emissiveNode, normalNode, lightsNode } = useLocalNodes(
    ({ uniforms: scopedUniforms }: CreatorState) => {
      const scoped = scopedUniforms.scope<TileShaderUniforms>(TILE_UNIFORM_SCOPE)
      const { uPlayerWorldPos, uTime, uPlayerPaletteIndex } =
        scopedUniforms.scope(CORE_UNIFORM_SCOPE)

      const tileSeed = attribute<'float'>('seed')
      const tileIsHighlighted = attribute<'float'>('isHighlighted')
      const trailTouchedAt = attribute<'float'>('trailTouchedAt')

      const hashFloat = (n: Node<'float'>) => fract(sin(n).mul(43758.5453))

      const playerCourse = worldCourseNode(uPlayerWorldPos, surface)
      const fragmentCourse = worldCourseNode(positionWorld, surface)
      const rawOffsetX = abs(fragmentCourse.x.sub(playerCourse.x))
      const offsetX = surface.topology === 'cylinder' ? min(rawOffsetX, float(surface.columns * TILE_SIZE).sub(rawOffsetX)) : rawOffsetX
      const playerOffset = vec2(offsetX, fragmentCourse.z.sub(playerCourse.z))
      const distanceSquared = dot(playerOffset, playerOffset)

      const fadeAmount = smoothstep(
        scoped.uFadeFullRadiusSq,
        scoped.uFadeMinRadiusSq,
        distanceSquared,
      )
      const radialAlpha = mix(float(1), float(scoped.uFadeMinAlpha), fadeAmount)
      const alpha = radialAlpha

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
      // --- fragment stage ---
      const backgroundNoisePosition = positionWorld
        .mul(0.06)
        .add(vec3(tileSeed.mul(0.12), tileSeed.mul(-0.12), 0))

      const backgroundNoise = mx_noise_float(backgroundNoisePosition).mul(0.5).add(0.5)

      // Detail noise, one of three maps per instance. The index depends only on the per-instance
      // seed, so the sin/fract/floor inside hashFloat runs once per vertex; the branch below is on
      // that per-instance index, so a tile's fragments take the same path and only the selected
      // texture is sampled — one fetch per fragment instead of three.
      const detailUv = uv()
      const detailIndex = vertexStage(floor(hashFloat(tileSeed.mul(438.54)).mul(3)))
      const detailNoise = Fn(() => {
        const sample = float(0).toVar()
        If(detailIndex.lessThan(0.5), () => {
          sample.assign(texture(detailNoiseTextures[0], detailUv).r)
        })
          .ElseIf(detailIndex.lessThan(1.5), () => {
            sample.assign(texture(detailNoiseTextures[1], detailUv).r)
          })
          .Else(() => {
            sample.assign(texture(detailNoiseTextures[2], detailUv).r)
          })
        return sample
      })()

      // Use a stable cell and padded interior; half-texel inset keeps filtering off cell borders.
      const stoneFrame = vertexStage(
        floor(clamp(tileSeed, 0, 0.999999).mul(STONE_ATLAS_GRID * STONE_ATLAS_GRID)),
      )
      const stoneUv = spritesheetUV(
        vec2(STONE_ATLAS_GRID),
        uv().mul(1 - 2 * STONE_UV_INSET).add(STONE_UV_INSET),
        stoneFrame,
      )
      const stoneColour = texture(stoneAtlasTexture, stoneUv).rgb
      const slabSurface = attribute<'float'>('slabSurface')
      const isIvory = step(0.5, slabSurface)
      const isTop = step(1.5, slabSurface)
      const geometryNormal = attribute<'vec3'>('normal')
      const sampledNormal = sceneQuality === SceneQuality.LOW ? geometryNormal : (() => {
        const tangentNormal = texture(stoneNormalTexture, stoneUv).rgb.mul(2).sub(1)
        // The top UV basis is +X / -Z; the baked normal's Z points out of the stone.
        return mix(geometryNormal, vec3(tangentNormal.x, tangentNormal.z, tangentNormal.y.negate()), isTop)
      })()
      const tiltedNormal = rotateWithTrig(sampledNormal, tiltAxis, tiltSin, tiltCos)
      const normalNode = transformNormalToView(courseNormalNode(tiltedNormal, positionLocal.x, surface)).normalize()
      const ambient = new AmbientLight('#ffffff', TILE_AMBIENT_INTENSITY)
      const key = new DirectionalLight('#fff2df', TILE_KEY_INTENSITY)
      key.position.set(-3, 6, 4)
      key.updateMatrixWorld()
      key.target.updateMatrixWorld()
      const lightsNode = lights([ambient, key])

      // Per-instance scalar mix derived only from the seed and highlight flag: hoist it to the
      // vertex stage so the fragment stage reads a varying instead of re-deriving it per pixel.
      const mixAmount = vertexStage(
        mix(REGULAR_MIX, mix(HIGHLIGHTED_MIX_MIN, HIGHLIGHTED_MIX_MAX, tileSeed), isHighlighted),
      )
      const darkening = clamp(backgroundNoise, 0, 1)
        .add(detailNoise.mul(scoped.uAddDetailNoise).mul(DETAIL_NOISE_STRENGTH))
        .mul(mixAmount)
      const brightness = clamp(float(1).sub(darkening), STONE_MIN_BRIGHTNESS, 1)
      const background = stoneColour.mul(brightness)

      // Trail: tiles the ball has just crossed keep a darkened player-colour tint. The tint and its
      // fade are constant across a tile's fragments, so both are hoisted to the vertex stage like
      // the mixes above and the fragment stage pays for a single mix.
      const trailAge = uTime.sub(trailTouchedAt)
      const trailAmount = vertexStage(
        float(1)
          .sub(smoothstep(float(0), float(TRAIL_FADE_SECONDS), trailAge))
          .mul(TRAIL_STRENGTH),
      )
      const playerTrailColour = samplePlayerPalette(
        float(TRAIL_PALETTE_T),
        uPlayerPaletteIndex.toInt(),
      )
      const trailColour = vertexStage(mix(playerTrailColour, vec3(0), float(TRAIL_DARKEN)))
      const backgroundWithTrail = mix(background, trailColour, trailAmount)

      // The trail still publishes the undarkened player colour to the emissive MRT, so the bloom
      // keeps a faint halo around it without whitening the painted tile.
      const trailEmissive = vertexStage(
        playerTrailColour.mul(trailAmount).mul(TRAIL_EMISSIVE_STRENGTH),
      )

      // Player contact shadow. `distanceSquared` is already derived above, so reuse it instead of
      // recomputing the same sub + dot.
      const playerDistance = distanceSquared.sqrt()
      const shadowHeightT = clamp(
        float(SHADOW_FADE_START_Y)
          .sub(playerCourse.y)
          .mul(SHADOW_FADE_RANGE_INV),
        float(0),
        float(1),
      )
      const playerAboveGround = step(float(SHADOW_MIN_PLAYER_Y), playerCourse.y)
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

      const shadowed = backgroundWithTrail
        .mul(float(1).sub(shadow.mul(SHADOW_STRENGTH)))


      return {
        positionNode: coursePositionNode(tiltedGeometry, surface),
        colorNode: mix(color('#32343a'), shadowed, isIvory),
        normalNode,
        lightsNode,
        opacityNode: alpha as Node<'float'>,
        emissiveNode: trailEmissive.mul(isTop),
      }
    },
    [detailNoiseTextures, stoneAtlasTexture, stoneNormalTexture, sceneQuality, surface],
  )

  useEffect(() => {
    onReadyChange(true)
    return () => {
      onReadyChange(false)
    }
  }, [batches, onReadyChange])

  return (
    <group>
      {trail.entries.map(({ batch, attribute }) => (
        <TerrainBatch
          key={batch.startRow}
          batch={batch}
          trailAttribute={attribute}
          nodes={{ colorNode, opacityNode, positionNode, emissiveNode, normalNode, lightsNode }}
        />
      ))}
    </group>
  )
}
