import { useCourseSurface } from '@/hooks/useCourseSurface'
import { courseToWorld } from '@/utils/platform/courseSurface'
import { createSurfaceColliders } from '@/utils/platform/surfaceColliders'
import { coursePositionNode, courseNormalNode, worldCourseNode } from '@/resources/tsl/courseSurface'
import { useTexture } from '@react-three/fiber'
import { type CreatorState, useLocalNodes } from '@react-three/tsl'
import { CuboidCollider, TrimeshCollider, RigidBody } from '@react-three/rapier'
import {
  type FC,
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
  modelWorldMatrix,
  vec4,
  mx_noise_float,
  transformNormalToView,
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
import type { Material, Node } from 'three/webgpu'

import ivoryStoneNormals from '@/assets/textures/platform/ivory-stone-normal.png'
import { createTileSlabGeometry, TILE_SLAB_RADIUS } from '@/utils/platform/tileSlabGeometry'

import ivoryStoneAtlas from '@/assets/textures/platform/ivory-stone-atlas.webp'
import tileDetailNoise2 from '@/assets/textures/platform/tile-noise-2.webp'
import tileDetailNoise3 from '@/assets/textures/platform/tile-noise-3.webp'
import tileDetailNoise1 from '@/assets/textures/platform/tile-noise.webp'
import { SceneQuality, usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE } from '@/components/coreUniforms'
import { createTileTrail, useTileTrail } from '@/components/platform/tiles/useTileTrail'
import { createTileMaterial } from '@/components/platform/tiles/tileMaterial'
import { createTileBatches, packTileState, type TileBatch } from '@/utils/platform/terrainBatches'
import { GHOST_DROP_DEPTH } from '@/utils/platform/ghostTiles'
import { ghostTileMotion } from '@/resources/tsl/ghostTileMotion'
import { samplePlayerPalette, PLAYER_LIGHT_PALETTE_T } from '@/resources/tsl/playerPalette'
import {
  type RowData,
  rowToWorldZ,
  TILE_SIZE,
  TILE_THICKNESS,
  TRAIL_FADE_SECONDS,
} from '@/utils/tiles'

const AXIS_EPSILON = 0.001
const HIGHLIGHTED_MIX_MIN = 0.08
const HIGHLIGHTED_MIX_MAX = 0.16
const REGULAR_MIX = 0.24
const SHADOW_RADIUS = 0.9
const SHADOW_RADIUS_MAX_SCALE = 1.5
const SHADOW_RADIUS_MIN_SCALE = 1.0
const SHADOW_STRENGTH = 0.85
const SHADOW_FADE_START_Y = 1.8
const SHADOW_FADE_END_Y = 0.5
const SHADOW_FADE_RANGE_INV = 1.0 / (SHADOW_FADE_START_Y - SHADOW_FADE_END_Y)
const SHADOW_MIN_PLAYER_Y = -0.5

const DETAIL_NOISE_STRENGTH = 0.3
// Mean red channel of the three detail maps; detail should not change the tier's overall brightness.
const DETAIL_NOISE_MEAN = 0.862
const STONE_ATLAS_GRID = 3
const STONE_CELL_PIXELS = 512
const STONE_CELL_PADDING = 16
const STONE_UV_INSET = (STONE_CELL_PADDING + 0.5) / STONE_CELL_PIXELS
const STONE_MIN_BRIGHTNESS = 0.65

const configureStoneAtlas = (map: Texture) => {
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = ClampToEdgeWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true
}

// Touched-tile afterglow: a small additive palette lift plus a fainter emissive halo. It has to sit
// under the player point light, not replace it, so both values stay low; the timestamp attribute
// refreshes while the ball stays on a tile and fades once it leaves.
const TRAIL_GLOW_STRENGTH = 0.05
const TRAIL_EMISSIVE_STRENGTH = 0.1

// Race lines are painted onto the floor tiles themselves, so the checks keep the stone's normals,
// bevels, specular and per-tile lighting. The paint is mixed over the stone rather than replacing
// it, so the grain still shows through and the line does not read as a flat decal.
const RACE_LINE_PAINT_WHITE = '#f4f0e8'
const RACE_LINE_PAINT_BLACK = '#0d0f13'
const RACE_LINE_EDGE = '#b41f1f'
const RACE_LINE_PAINT_BLEND = 0.2
const RACE_LINE_EDGE_DEPTH = 0.5

type PlatformTilesProps = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

type TerrainBatchProps = {
  batch: TileBatch
  trailAttribute: InstancedBufferAttribute
  material: Material
}

const TerrainBatch: FC<TerrainBatchProps> = ({ batch, trailAttribute, material }) => {
  const surface = useCourseSurface()
  const collision = useMemo(() => surface.topology === 'cylinder' && batch.solidPositions.length > 0 ? createSurfaceColliders(batch.solidPositions, surface) : null, [batch, surface])
  const tileState = useMemo(() => packTileState(batch), [batch])
  const meshRef = useRef<InstancedMesh>(null)

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
    if (surface.topology === 'cylinder') {
      const bounds = new Box3()
      const center = new Vector3()
      for (const [x, y, z] of batch.positions) {
        courseToWorld(x, y, z, surface, center)
        bounds.expandByPoint(center)
      }
      mesh.boundingBox = bounds.expandByScalar(TILE_SLAB_RADIUS)
    } else {
      mesh.computeBoundingBox()
    }
    // GPU falling and rotation must stay inside the CPU culling bounds.
    const tileRadius = TILE_SLAB_RADIUS
    mesh.boundingBox!.expandByScalar(GHOST_DROP_DEPTH + 2 * tileRadius)
    mesh.boundingSphere = mesh.boundingBox!.getBoundingSphere(new Sphere())
  }, [batch, surface])

  return (
    <group position={[0, 0, rowToWorldZ(batch.startRow)]}>
      {batch.solidPositions.length > 0 && (
        <RigidBody type="fixed" colliders={false} userData={{ type: 'tile' }} friction={0}>
          {collision ? (
            <TrimeshCollider args={[collision.vertices, collision.indices]} friction={0} />
          ) : batch.solidPositions.map((position, index) => (
            <CuboidCollider
              key={index}
              position={position}
              args={[TILE_SIZE / 2, TILE_THICKNESS / 2, TILE_SIZE / 2]}
              friction={0}
            />
          ))}
        </RigidBody>
      )}
      <instancedMesh
        ref={meshRef}
        material={material}
        args={[undefined, undefined, batch.positions.length]}
        count={batch.positions.length}
        frustumCulled>
        <primitive object={geometry} attach="geometry">
          <instancedBufferAttribute attach="attributes-tileState" args={[tileState, 4]} />
          <instancedBufferAttribute attach="attributes-seed" args={[batch.seeds, 1]} />
          <primitive object={trailAttribute} attach="attributes-trailTouchedAt" />
        </primitive>
      </instancedMesh>
    </group>
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
  const batches = useMemo(() => createTileBatches(rows, true), [rows])
  const trail = useMemo(() => createTileTrail(batches), [batches])

  useTileTrail(trail, rows.length)

  // Port of tile.vert + tile.frag.
  //
  // Every varying is recomputed in-graph: per-instance attributes are read directly, the sphere-side
  // values are not needed, and world position comes from positionWorld, which already folds in the
  // instance matrix for an instanced mesh.
  const nodes = useLocalNodes(
    ({ uniforms: scopedUniforms }: CreatorState) => {
      const { uPlayerWorldPos, uTime, uPlayerPaletteIndex } =
        scopedUniforms.scope(CORE_UNIFORM_SCOPE)

      const tileSeed = attribute<'float'>('seed')
      // Ghost, highlight and race-line state share one vec4: the device's eight-vertex-buffer limit
      // counts a buffer per attribute, and the slab's own faces already spend four.
      const tileState = attribute<'vec4'>('tileState')
      const trailTouchedAt = attribute<'float'>('trailTouchedAt')
      const isHighlighted = tileState.y
      const raceLinePaint = tileState.z
      const raceLineEdge = tileState.w

      const hashFloat = (n: Node<'float'>) => fract(sin(n).mul(43758.5453))

      const playerCourse = worldCourseNode(uPlayerWorldPos, surface)
      const fragmentCourse = worldCourseNode(positionWorld, surface)
      const rawOffsetX = abs(fragmentCourse.x.sub(playerCourse.x))
      const offsetX = surface.topology === 'cylinder' ? min(rawOffsetX, float(surface.columns * TILE_SIZE).sub(rawOffsetX)) : rawOffsetX
      const playerOffset = vec2(offsetX, fragmentCourse.z.sub(playerCourse.z))
      const distanceSquared = dot(playerOffset, playerOffset)

      const isGhost = tileState.x
      const instanceCenter = positionLocal.sub(positionGeometry)
      const tileWorldZ = modelWorldMatrix.mul(vec4(instanceCenter, 1)).z
      const ahead = uPlayerWorldPos.z.sub(tileWorldZ)
      const axisSeeds = vec2(hashFloat(tileSeed.mul(3.17)), hashFloat(tileSeed.mul(7.92)))
      const rawAxis = vec3(axisSeeds.x.sub(0.5), float(0), axisSeeds.y.sub(0.5))
      const tiltAxis = rawAxis.div(max(rawAxis.length(), AXIS_EPSILON))

      const signedNoise = hashFloat(tileSeed.mul(11)).mul(2).sub(1)
      const { angle: tiltAngle, offsetY, opacity: alpha } = ghostTileMotion(ahead, isGhost, signedNoise)
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
      const tiltedGeometry = rotateWithTrig(positionGeometry, tiltAxis, tiltSin, tiltCos).add(
        instanceCenter,
      ).add(vec3(0, offsetY, 0))
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
      const stoneSample = texture(stoneAtlasTexture, stoneUv).rgb
      const stoneLuminance = stoneSample.dot(vec3(0.2126, 0.7152, 0.0722))
      const stoneColour = mix(color('#1b2029'), color('#454b57'), smoothstep(0.3, 0.82, stoneLuminance))
      const slabSurface = attribute<'float'>('slabSurface')
      const isSlab = step(0.5, slabSurface)
      const isTop = step(1.5, slabSurface)
      const geometryNormal = attribute<'vec3'>('normal')
      const sampledNormal = sceneQuality === SceneQuality.LOW ? geometryNormal : (() => {
        const tangentNormal = texture(stoneNormalTexture, stoneUv).rgb.mul(2).sub(1)
        // The top UV basis is +X / -Z; the baked normal's Z points out of the stone.
        return mix(geometryNormal, vec3(tangentNormal.x, tangentNormal.z, tangentNormal.y.negate()), isTop)
      })()
      const tiltedNormal = rotateWithTrig(sampledNormal, tiltAxis, tiltSin, tiltCos)
      const normalNode = transformNormalToView(courseNormalNode(tiltedNormal, positionLocal.x, surface)).normalize()

      // Per-instance scalar mix derived only from the seed and highlight flag: hoist it to the
      // vertex stage so the fragment stage reads a varying instead of re-deriving it per pixel.
      const mixAmount = vertexStage(
        mix(REGULAR_MIX, mix(HIGHLIGHTED_MIX_MIN, HIGHLIGHTED_MIX_MAX, tileSeed), isHighlighted),
      )
      const darkening = clamp(backgroundNoise, 0, 1)
        .add(addDetailNoise ? detailNoise.sub(DETAIL_NOISE_MEAN).mul(DETAIL_NOISE_STRENGTH) : float(0))
        .mul(mixAmount)
      const brightness = clamp(float(1).sub(darkening), STONE_MIN_BRIGHTNESS, 1)
      const background = stoneColour.mul(brightness)

      // Race-line paint. A white square is 80% white over the stone; the finish's black square is
      // 80% black over the stone and its other squares are 80% white, so the flag reads clearly
      // without losing the tile's normal map, bevel, specular or lighting.
      const paintBlend = step(float(0.5), raceLinePaint).mul(float(RACE_LINE_PAINT_BLEND))
      const paintColour = mix(
        color(RACE_LINE_PAINT_WHITE),
        color(RACE_LINE_PAINT_BLACK),
        step(float(1.5), raceLinePaint),
      )
      const painted = mix(background, paintColour, paintBlend)
      // The finish's red stripe is a slice of the leading row along the edge the player reaches
      // first (tile UV v = 0), which keeps it on the tiles instead of needing its own geometry.
      const edgeStripe = float(1).sub(step(float(RACE_LINE_EDGE_DEPTH), detailUv.y))
      const paintedWithEdge = mix(painted, color(RACE_LINE_EDGE), raceLineEdge.mul(edgeStripe))

      // Touched-tile afterglow. The fade is constant across a tile's fragments, so the palette
      // colour is multiplied in the vertex stage; the fragment stage only adds the varying.
      const trailAge = uTime.sub(trailTouchedAt)
      const trailEnergy = vertexStage(
        samplePlayerPalette(float(PLAYER_LIGHT_PALETTE_T), uPlayerPaletteIndex.toInt()).mul(
          float(1).sub(smoothstep(float(0), float(TRAIL_FADE_SECONDS), trailAge)),
        ),
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

      const shadowed = sceneQuality === SceneQuality.LOW
        ? paintedWithEdge
        : paintedWithEdge.mul(float(1).sub(shadow.mul(SHADOW_STRENGTH)))
      // Add the afterglow after the contact shadow so the fake shadow cannot eat the glow.
      const shadowedWithTrail = shadowed.add(trailEnergy.mul(TRAIL_GLOW_STRENGTH))

      return {
        positionNode: coursePositionNode(tiltedGeometry, surface),
        colorNode: mix(color('#17191d'), shadowedWithTrail, isSlab),
        normalNode,
        opacityNode: alpha as Node<'float'>,
        emissiveNode: trailEnergy.mul(TRAIL_EMISSIVE_STRENGTH).mul(isTop),
      }
    },
    [detailNoiseTextures, stoneAtlasTexture, stoneNormalTexture, sceneQuality, surface, addDetailNoise],
  )
  const material = useMemo(() => createTileMaterial(nodes), [nodes])
  useEffect(() => () => material.dispose(), [material])

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
          material={material}
        />
      ))}
    </group>
  )
}
