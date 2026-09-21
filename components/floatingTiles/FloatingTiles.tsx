/* eslint-disable react-hooks/immutability */
'use client'

import {
  type CreatorState,
  useLocalNodes,
  useThree,
  useUniforms,
} from '@react-three/fiber/webgpu'
import {
  type FC,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import {
  cameraPosition,
  clamp as tslClamp,
  float,
  floor,
  fract,
  mx_noise_float,
  positionGeometry,
  smoothstep,
  texture,
  vec2,
  vec3,
} from 'three/tsl'
import { DataTexture, FloatType, InstancedMesh, Matrix4, NearestFilter, RedFormat } from 'three'
import type { Node } from 'three/webgpu'

import { useGameStore } from '@/components/GameProvider'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import {
  createFloatingTilesBuffers,
  createFloatingTilesSimulation,
} from '@/components/floatingTiles/floatingTilesSimulation'
import { sampleTilesPalette } from '@/resources/tsl/tilesPalette'
import { COLUMNS, ROWS_RENDERED, type RowData, TILE_SIZE, clamp } from '@/utils/tiles'

const FLOATING_TILE_UNIFORM_SCOPE = 'floatingTiles'

// Carried over from floatingTiles.vert / floatingTiles.frag.
const NOISE_SCALE = 0.12
const EPSILON = 1e-5
const COLUMN_JITTER_RANGE = 0.6
const PALETTE_MIX = 0.4

const EXTRA_SIDE_COLUMNS = 4
const GRID_COLS = COLUMNS + EXTRA_SIDE_COLUMNS * 2
const GRID_OFFSET = EXTRA_SIDE_COLUMNS
const TILE_THICKNESS = 0.1
const BOX_SIZE_SCALE = 0.5
const Y_MIN = -8
const Y_MAX = 8
const Z_FADE_START = 16
const Z_FADE_END = 32
const MAX_DELTA_TIME = 0.05

/** Spawn-mask values: 1 where a floating tile may respawn, 0 where a platform tile blocks it. */
const SPAWNABLE = 1
const BLOCKED = 0
const SPAWN_MASK_THRESHOLD = 0.5

// The simulation reads a clamped frame delta off this uniform. TSL's `time` node cannot stand in
// for it: the kernel is stepped from the game loop, not once per rendered frame.
const createFloatingTilesUniforms = () => ({ uDeltaTime: 0 })

/**
 * Writes one row of the spawn mask from the platform's row data: raised columns block respawn,
 * while the side margins and the sunken columns stay open.
 *
 * Returns whether anything changed, so the caller only re-uploads the mask texture when it has to.
 */
const writeRowSpawnMask = (
  spawnMask: Float32Array,
  rowIndex: number,
  isRaised: readonly (0 | 1)[] | undefined,
): boolean => {
  const rowStart = rowIndex * GRID_COLS
  let hasChanged = false

  for (let col = 0; col < GRID_COLS; col++) {
    const column = col - GRID_OFFSET
    const isPlatformTile = column >= 0 && column < COLUMNS && isRaised?.[column] === 1
    const value = isPlatformTile ? BLOCKED : SPAWNABLE
    const index = rowStart + col

    if (spawnMask[index] !== value) {
      spawnMask[index] = value
      hasChanged = true
    }
  }

  return hasChanged
}

/** Row-major indices of every cell a floating tile may spawn into. */
const collectSpawnableCells = (spawnMask: Float32Array): number[] => {
  const cells: number[] = []

  for (let index = 0; index < spawnMask.length; index++) {
    if (spawnMask[index] > SPAWN_MASK_THRESHOLD) {
      cells.push(index)
    }
  }

  return cells
}

export type FloatingTilesHandle = {
  setRowData: (rowIndex: number, rowData: RowData | null) => void
  setRowWorldPositions: (rowPositions: number[]) => void
  step: (delta: number) => void
}

type FloatingTilesProps = {
  ref: Ref<FloatingTilesHandle>
  onReadyChange: (isReady: boolean) => void
}

const identityMatrix = new Matrix4()

const createSpawnMaskTexture = (data: Float32Array) => {
  const texture = new DataTexture(data, GRID_COLS, ROWS_RENDERED, RedFormat, FloatType)
  texture.needsUpdate = true
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  return texture
}

const createRowPositionsTexture = (data: Float32Array) => {
  const texture = new DataTexture(data, ROWS_RENDERED, 1, RedFormat, FloatType)
  texture.needsUpdate = true
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  return texture
}

const FloatingTiles: FC<FloatingTilesProps> = ({ ref, onReadyChange }) => {
  const count = usePerformanceStore((s) => s.sceneConfig.floatingTiles.instanceCount)
  const rowsData = useGameStore((s) => s.rowsData)
  const renderer = useThree((s) => s.renderer)

  const isDisabled = count === 0

  const meshRef = useRef<InstancedMesh>(null)

  // Registered once here and read back by the same component: the graph that consumes it is built
  // below, and `step` writes it from the game loop.
  const { uDeltaTime } = useUniforms(createFloatingTilesUniforms, FLOATING_TILE_UNIFORM_SCOPE)

  // Both textures are mutated in place, so the array, the texture and every callback that owns one
  // have to agree on a single object for the lifetime of the component.
  const spawnMaskRef = useRef<Float32Array | null>(null)
  if (spawnMaskRef.current === null) {
    spawnMaskRef.current = new Float32Array(GRID_COLS * ROWS_RENDERED)
  }
  const spawnMaskTextureRef = useRef<DataTexture | null>(null)
  if (spawnMaskTextureRef.current === null) {
    spawnMaskTextureRef.current = createSpawnMaskTexture(spawnMaskRef.current!)
  }
  const spawnMaskTexture = spawnMaskTextureRef.current!

  const rowWorldPositionsRef = useRef<Float32Array | null>(null)
  if (rowWorldPositionsRef.current === null) {
    rowWorldPositionsRef.current = new Float32Array(ROWS_RENDERED)
  }
  const rowWorldPositionsTextureRef = useRef<DataTexture | null>(null)
  if (rowWorldPositionsTextureRef.current === null) {
    rowWorldPositionsTextureRef.current = createRowPositionsTexture(rowWorldPositionsRef.current!)
  }
  const rowWorldPositions = rowWorldPositionsRef.current!
  const rowWorldPositionsTexture = rowWorldPositionsTextureRef.current!

  // The mask the platform rewrites row by row through the handle, replayed from scratch whenever a
  // whole new platform layout arrives. Doing it here rather than in an effect keeps the seeded
  // buffers below and the kernel that samples the mask built from the same snapshot.
  const spawnMask = useMemo(() => {
    const mask = spawnMaskRef.current!
    let hasChanged = false

    for (let row = 0; row < ROWS_RENDERED; row++) {
      if (writeRowSpawnMask(mask, row, rowsData?.[row]?.isRaised)) {
        hasChanged = true
      }
    }

    if (hasChanged) {
      spawnMaskTexture.needsUpdate = true
    }

    return mask
  }, [rowsData, spawnMaskTexture])

  // Port of floatingTiles.vert + floatingTiles.frag. The varyings recompute in-graph: the noise
  // coordinate from the tile's world position, and the alpha from the tile's Y and Z.
  const createNodes = useCallback(
    ({ uniforms: scopedUniforms }: CreatorState) => {
      const { uScrollZ } = scopedUniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)

      // The storage buffer has to exist before the graph that reads it is built, so the simulation
      // is created here rather than in an effect — the shape the gem particles use too.
      const buffers = createFloatingTilesBuffers({
        instanceCount: count,
        gridCols: GRID_COLS,
        yMin: Y_MIN,
        yMax: Y_MAX,
        spawnableCells: collectSpawnableCells(spawnMask),
      })
      const simulation = createFloatingTilesSimulation({
        buffers,
        spawnMask: spawnMaskTexture,
        uDeltaTime,
        gridCols: GRID_COLS,
        rowCount: ROWS_RENDERED,
        yMin: Y_MIN,
        yMax: Y_MAX,
      })

      // Particle state is read straight off the simulation's storage buffer, keyed by instance.
      const positionData = buffers.positions.toAttribute()
      const columnValue = positionData.x
      const tileY = positionData.y
      const rowIndex = positionData.z

      const columnIndex = floor(columnValue.add(0.5))
      const jitter = fract(columnValue)
      const columnOffset = jitter.sub(0.5).mul(COLUMN_JITTER_RANGE * TILE_SIZE)

      const worldX = columnIndex
        .sub(float(GRID_COLS * 0.5))
        .add(0.5)
        .mul(float(TILE_SIZE))
        .add(columnOffset)

      // Row world Z, read from the row positions texture at this row's texel centre.
      const rowSampleU = tslClamp(rowIndex, float(0), float(ROWS_RENDERED - 1))
        .add(0.5)
        .div(float(ROWS_RENDERED))
      const worldZ = texture(rowWorldPositionsTexture, vec2(rowSampleU, 0.5)).r.add(uScrollZ)

      const tileWorldPosition = vec3(worldX, tileY, worldZ)
      const noiseCoord = positionGeometry.add(tileWorldPosition).mul(NOISE_SCALE)

      const normalizedY = tslClamp(
        tileY.sub(Y_MIN).div(Math.max(Y_MAX - Y_MIN, EPSILON)),
        float(0),
        float(1),
      )
      const bandAlpha = smoothstep(float(0), float(0.2), normalizedY).mul(
        smoothstep(float(0), float(0.2), float(1).sub(normalizedY)),
      )
      const zFade = float(1).sub(
        smoothstep(Z_FADE_START, Z_FADE_END, worldZ.sub(cameraPosition.z).abs()),
      )
      const alpha = bandAlpha.mul(zFade)

      const noiseValue = mx_noise_float(noiseCoord)
      const paletteT = tslClamp(noiseValue.mul(0.5).add(0.5), float(0), float(1))

      return {
        simulation,
        positionNode: positionGeometry.add(tileWorldPosition),
        colorNode: sampleTilesPalette(paletteT).mul(PALETTE_MIX),
        opacityNode: alpha as Node<'float'>,
      }
    },
    [count, rowWorldPositionsTexture, spawnMask, spawnMaskTexture, uDeltaTime],
  )

  const { colorNode, opacityNode, positionNode, simulation } = useLocalNodes(createNodes)

  useEffect(() => {
    return () => {
      simulation.dispose()
    }
  }, [simulation])

  useEffect(() => {
    onReadyChange(true)
    return () => {
      onReadyChange(false)
    }
  }, [onReadyChange])

  useEffect(() => {
    if (!meshRef.current) return
    meshRef.current.count = count
    for (let index = 0; index < count; index++) {
      meshRef.current.setMatrixAt(index, identityMatrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [count])

  const updateRowMask = useCallback(
    (rowIndex: number, rowData: RowData | null) => {
      if (rowIndex < 0 || rowIndex >= ROWS_RENDERED) return
      if (writeRowSpawnMask(spawnMask, rowIndex, rowData?.isRaised)) {
        spawnMaskTexture.needsUpdate = true
      }
    },
    [spawnMask, spawnMaskTexture],
  )

  const updateRowWorldPositions = useCallback(
    (rowPositions: number[]) => {
      let hasChanged = false

      for (let index = 0; index < Math.min(rowPositions.length, ROWS_RENDERED); index++) {
        const value = rowPositions[index]
        if (!Number.isFinite(value)) continue
        if (rowWorldPositions[index] !== value) {
          rowWorldPositions[index] = value
          hasChanged = true
        }
      }

      if (hasChanged) {
        rowWorldPositionsTexture.needsUpdate = true
      }
    },
    [rowWorldPositions, rowWorldPositionsTexture],
  )

  const stepSimulation = useCallback(
    (delta: number) => {
      if (isDisabled) return
      uDeltaTime.value = clamp(delta, 0, MAX_DELTA_TIME)
      renderer.compute(simulation)
    },
    [isDisabled, renderer, simulation, uDeltaTime],
  )

  useImperativeHandle(
    ref,
    () => ({
      setRowData: (rowIndex, rowData) => {
        if (isDisabled) return
        updateRowMask(rowIndex, rowData)
      },
      setRowWorldPositions: (positions) => {
        if (isDisabled) return
        updateRowWorldPositions(positions)
      },
      step: (delta) => {
        stepSimulation(delta)
      },
    }),
    [isDisabled, stepSimulation, updateRowMask, updateRowWorldPositions],
  )

  if (isDisabled) return null

  const BOX_W = TILE_SIZE * BOX_SIZE_SCALE
  const BOX_H = TILE_THICKNESS * BOX_SIZE_SCALE
  const BOX_D = TILE_SIZE * BOX_SIZE_SCALE

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
      count={count}>
      <boxGeometry args={[BOX_W, BOX_H, BOX_D]} />
      <meshBasicNodeMaterial
        colorNode={colorNode}
        opacityNode={opacityNode}
        positionNode={positionNode}
        transparent
        depthTest
        depthWrite={false}
      />
    </instancedMesh>
  )
}

export default FloatingTiles
