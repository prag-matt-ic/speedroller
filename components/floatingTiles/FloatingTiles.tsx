/* eslint-disable react-hooks/immutability */
'use client'

import {
  type CreatorState,
  useLocalNodes,
  useThree,
  useUniforms,
} from '@react-three/fiber/webgpu'
import { type FC, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  clamp as tslClamp,
  float,
  floor,
  fract,
  mx_noise_float,
  positionGeometry,
  smoothstep,
  vec3,
} from 'three/tsl'
import {
  Box3,
  DataTexture,
  FloatType,
  InstancedMesh,
  Matrix4,
  NearestFilter,
  RedFormat,
  Sphere,
  Vector3,
} from 'three'
import type { Node, UniformNode } from 'three/webgpu'

import { useGameStore } from '@/components/GameProvider'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import {
  createFloatingTilesBuffers,
  createFloatingTilesSimulation,
} from '@/components/floatingTiles/floatingTilesSimulation'
import { useGameFrame } from '@/hooks/useGameFrame'
import { fadeInOut } from '@/resources/tsl/fadeInOut'
import { sampleTilesPalette } from '@/resources/tsl/tilesPalette'
import {
  COLUMNS,
  PLATFORM_BATCH_ROWS,
  type RowData,
  TILE_SIZE,
  clamp,
  rowToWorldZ,
} from '@/utils/tiles'

const FLOATING_TILE_UNIFORM_SCOPE = 'floatingTiles'
const DENSITY_REFERENCE_ROWS = 40
const NOISE_SCALE = 0.12
const EPSILON = 1e-5
const COLUMN_JITTER_RANGE = 0.6
const PALETTE_MIX = 0.4
const EXTRA_SIDE_COLUMNS = 4
const GRID_COLS = COLUMNS + EXTRA_SIDE_COLUMNS * 2
const TILE_THICKNESS = 0.1
const BOX_SIZE_SCALE = 0.5
const Y_MIN = -8
const Y_MAX = 8
const MAX_DELTA_TIME = 0.05
const BOX_WIDTH = TILE_SIZE * BOX_SIZE_SCALE
const BOX_HEIGHT = TILE_THICKNESS * BOX_SIZE_SCALE
const SPAWNABLE = 1
const BLOCKED = 0

// Registered once by the parent and shared by all independently culled simulation batches.
const createFloatingTilesUniforms = () => ({ uDeltaTime: 0 })

type FloatingTilesProps = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

type FloatingBatchData = {
  startRow: number
  rows: readonly RowData[]
  count: number
}

const createSpawnData = (rows: readonly RowData[]) => {
  const mask = new Float32Array(GRID_COLS * rows.length)
  const spawnableCells: number[] = []
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    for (let column = 0; column < GRID_COLS; column++) {
      const platformColumn = column - EXTRA_SIDE_COLUMNS
      const isPlatformTile =
        platformColumn >= 0 &&
        platformColumn < COLUMNS &&
        rows[rowIndex].isRaised[platformColumn] === 1
      const index = rowIndex * GRID_COLS + column
      mask[index] = isPlatformTile ? BLOCKED : SPAWNABLE
      if (!isPlatformTile) spawnableCells.push(index)
    }
  }

  const texture = new DataTexture(mask, GRID_COLS, rows.length, RedFormat, FloatType)
  texture.needsUpdate = true
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  return { texture, spawnableCells }
}

const FloatingBatch: FC<{
  batch: FloatingBatchData
  uDeltaTime: UniformNode<'float', number>
}> = ({ batch, uDeltaTime }) => {
  const renderer = useThree((state) => state.renderer)
  const isPlatformReady = useGameStore((state) => state.isPlatformReady)
  const meshRef = useRef<InstancedMesh>(null)
  // Written by the mesh's onFramed callback; false until the first frame reports it.
  const isFramedRef = useRef(false)
  const spawnData = useMemo(() => createSpawnData(batch.rows), [batch.rows])
  const originZ = rowToWorldZ(batch.startRow)

  const createNodes = useCallback(
    ({ uniforms }: CreatorState) => {
      const { uPlayerWorldPos } = uniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)
      const buffers = createFloatingTilesBuffers({
        instanceCount: batch.count,
        gridCols: GRID_COLS,
        yMin: Y_MIN,
        yMax: Y_MAX,
        spawnableCells: spawnData.spawnableCells,
      })
      const simulation = createFloatingTilesSimulation({
        buffers,
        spawnMask: spawnData.texture,
        uDeltaTime,
        gridCols: GRID_COLS,
        rowCount: batch.rows.length,
        yMin: Y_MIN,
        yMax: Y_MAX,
      })

      const positionData = buffers.positions.toAttribute()
      const columnValue = positionData.x
      const tileY = positionData.y
      const rowIndex = positionData.z
      const columnIndex = floor(columnValue)
      const jitter = fract(columnValue)
      const columnOffset = jitter.sub(0.5).mul(COLUMN_JITTER_RANGE * TILE_SIZE)
      const worldX = columnIndex
        .sub(GRID_COLS * 0.5)
        .add(0.5)
        .mul(TILE_SIZE)
        .add(columnOffset)

      // The simulation's rows stay local to this fixed batch. The mesh transform supplies the
      // world origin; only distance fades and world noise need to add it explicitly.
      const localZ = rowIndex.mul(-TILE_SIZE)
      const worldZ = localZ.add(originZ)
      const localPosition = vec3(worldX, tileY, localZ)
      const noiseCoord = positionGeometry.add(vec3(worldX, tileY, worldZ)).mul(NOISE_SCALE)
      const normalizedY = tslClamp(
        tileY.sub(Y_MIN).div(Math.max(Y_MAX - Y_MIN, EPSILON)),
        float(0),
        float(1),
      )
      const bandAlpha = smoothstep(float(0), float(0.2), normalizedY).mul(
        smoothstep(float(0), float(0.2), float(1).sub(normalizedY)),
      )
      const alpha = bandAlpha.mul(fadeInOut(uPlayerWorldPos.z, worldZ))
      const noiseValue = mx_noise_float(noiseCoord)
      const paletteT = tslClamp(noiseValue.mul(0.5).add(0.5), float(0), float(1))

      return {
        simulation,
        positionNode: positionGeometry.add(localPosition),
        colorNode: sampleTilesPalette(paletteT).mul(PALETTE_MIX),
        opacityNode: alpha as Node<'float'>,
      }
    },
    [batch.count, batch.rows.length, originZ, spawnData, uDeltaTime],
  )

  const { colorNode, opacityNode, positionNode, simulation } = useLocalNodes(createNodes)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const identityMatrix = new Matrix4()
    for (let index = 0; index < batch.count; index++) {
      mesh.setMatrixAt(index, identityMatrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    // GPU positions are absent from the instance matrices. Bounds cover every spawn cell,
    // jittered edge and the full vertical simulation range, independently of current particles.
    const halfWidth = ((GRID_COLS - 1) * TILE_SIZE + COLUMN_JITTER_RANGE * TILE_SIZE + BOX_WIDTH) / 2
    mesh.boundingBox = new Box3(
      new Vector3(-halfWidth, Y_MIN - BOX_HEIGHT / 2, -(batch.rows.length - 1) * TILE_SIZE - BOX_WIDTH / 2),
      new Vector3(halfWidth, Y_MAX + BOX_HEIGHT / 2, BOX_WIDTH / 2),
    )
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new Sphere())
    mesh.updateWorldMatrix(true, false)
  }, [batch])

  useEffect(() => () => simulation.dispose(), [simulation])
  useEffect(() => () => spawnData.texture.dispose(), [spawnData])

  const onFramed = useCallback((inView: boolean) => {
    isFramedRef.current = inView
  }, [])

  // The GPU sim is dispatched only while this batch is framed; out of view its tiles are invisible,
  // so freezing their simulation costs nothing.
  useGameFrame(() => {
    if (!isPlatformReady || !isFramedRef.current) return
    renderer.compute(simulation)
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, batch.count]}
      position={[0, 0, originZ]}
      count={batch.count}
      onFramed={onFramed}
      frustumCulled>
      <boxGeometry args={[BOX_WIDTH, BOX_HEIGHT, BOX_WIDTH]} />
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

const FloatingTiles: FC<FloatingTilesProps> = ({ rows, onReadyChange }) => {
  const densityCount = usePerformanceStore((state) => state.sceneConfig.floatingTiles.instanceCount)
  const { uDeltaTime } = useUniforms(createFloatingTilesUniforms, FLOATING_TILE_UNIFORM_SCOPE)
  const batches = useMemo(() => {
    const result: FloatingBatchData[] = []
    if (densityCount === 0) return result
    for (let startRow = 0; startRow < rows.length; startRow += PLATFORM_BATCH_ROWS) {
      const batchRows = rows.slice(startRow, startRow + PLATFORM_BATCH_ROWS)
      result.push({
        startRow,
        rows: batchRows,
        count: Math.max(1, Math.round((densityCount * batchRows.length) / DENSITY_REFERENCE_ROWS)),
      })
    }
    return result
  }, [rows, densityCount])

  useGameFrame((_, delta) => {
    uDeltaTime.value = clamp(delta, 0, MAX_DELTA_TIME)
  }, -1)

  // Child bounds and GPU buffers are initialized before this passive effect runs.
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [batches, onReadyChange])

  return (
    <group>
      {batches.map((batch) => (
        <FloatingBatch key={batch.startRow} batch={batch} uDeltaTime={uDeltaTime} />
      ))}
    </group>
  )
}

export default FloatingTiles
