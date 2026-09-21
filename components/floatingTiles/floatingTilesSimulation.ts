import {
  Fn,
  If,
  Return,
  clamp,
  float,
  fract,
  instanceIndex,
  instancedArray,
  texture,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type { Texture } from 'three'
import type { ComputeNode, Node, StorageBufferNode, UniformNode } from 'three/webgpu'

// Port of floatingTiles/shaders/position.frag as a WebGPU compute kernel.
//
// The GLSL ran as a fragment pass under three's GPUComputationRenderer, which is WebGL-only (it
// builds a WebGLRenderTarget and a FullScreenQuad), so under the WebGPU renderer it could not run
// at all. A compute kernel removes both the ping-pong render targets and the texel addressing the
// old scheme needed: particle state is keyed by `instanceIndex` instead of a texture uv, so the
// instance-to-texel mapping, the padded slot count and the per-frame texture read-back all go.
//
// The spawn mask stays a texture rather than becoming a storage buffer. It is rewritten row by row
// while the platform streams, and a texture re-uploads on `needsUpdate`, where a storage buffer
// would have been a one-off snapshot of the mask taken when the buffers were built.

/** Speed range a respawned particle picks up — the GLSL's respawn constants. */
const RESPAWN_SPEED_MIN = 1.0
const RESPAWN_SPEED_RANGE = 0.6

/** Speed range a particle is seeded with on the CPU — the pre-compute seeding constants. */
const INITIAL_SPEED_MIN = 0.4
const INITIAL_SPEED_RANGE = 0.8
/** Keeps a seeded column fraction below 1, so `floor` reads back the intended column. */
const MAX_INITIAL_JITTER = 0.9999

const SPAWN_SEARCH_STEPS = 12
const SPAWN_MASK_THRESHOLD = 0.5
const HASH_MULTIPLIERS = /*#__PURE__*/ vec3(0.1031, 0.11369, 0.13787).toConst()
const HASH_OFFSET = 19.19

export type FloatingTilesBuffers = {
  /** Packed particle state: `vec4(column + jitter, y, row, speed)`, one element per instance. */
  positions: StorageBufferNode<'vec4'>
  instanceCount: number
}

export type FloatingTilesSeedInput = {
  instanceCount: number
  gridCols: number
  yMin: number
  yMax: number
  /** Row-major mask indices (`row * gridCols + col`) a particle may start or respawn in. */
  spawnableCells: readonly number[]
}

/**
 * Seeds every particle on the CPU: a spawn cell, a height and a speed.
 *
 * The kernel only advances the height, so starting from the zero-filled allocation would park every
 * tile at the origin. Seeding here rather than in an init kernel keeps the buffers and the graph
 * that reads them built from the same snapshot of the spawn mask.
 */
export const createFloatingTilesBuffers = ({
  instanceCount,
  gridCols,
  yMin,
  yMax,
  spawnableCells,
}: FloatingTilesSeedInput): FloatingTilesBuffers => {
  const positions = new Float32Array(instanceCount * 4)
  const cellCount = spawnableCells.length

  for (let index = 0; index < instanceCount; index++) {
    const base = index * 4
    // The mask's side margins are always spawnable, so an empty list is not expected to occur.
    const cell = cellCount > 0 ? spawnableCells[Math.floor(Math.random() * cellCount)] : 0
    positions[base + 0] = (cell % gridCols) + Math.random() * MAX_INITIAL_JITTER
    positions[base + 1] = yMin + Math.random() * (yMax - yMin)
    positions[base + 2] = Math.floor(cell / gridCols)
    positions[base + 3] = INITIAL_SPEED_MIN + Math.random() * INITIAL_SPEED_RANGE
  }

  return { positions: instancedArray(positions, 'vec4'), instanceCount }
}

export type FloatingTilesSimulationInput = {
  buffers: FloatingTilesBuffers
  /** Spawn mask: 1 where a particle may respawn, 0 where a platform tile blocks it. */
  spawnMask: Texture
  /** Clamped frame delta, written by the owner immediately before each dispatch. */
  uDeltaTime: UniformNode<'float', number>
  gridCols: number
  rowCount: number
  yMin: number
  yMax: number
}

/** float hash3(vec2 p) — the GLSL's three-output hash. */
const hash3 = (pX: Node<'float'>, pY: Node<'float'>) => {
  const p3 = fract(vec3(pX, pY, pX).mul(HASH_MULTIPLIERS))
  const adjusted = p3.add(p3.dot(vec3(p3.y, p3.z, p3.x).add(HASH_OFFSET)))
  return fract(vec3(adjusted.x, adjusted.y, adjusted.x).mul(vec3(adjusted.z, adjusted.y, adjusted.x)))
}

/**
 * Builds the kernel that advances each particle by one step.
 *
 * `uDeltaTime` has to be a uniform *node*: reading `.value` at graph-build time would bake the
 * frame delta in as a constant, leaving every tile frozen at its seeded height.
 */
export const createFloatingTilesSimulation = ({
  buffers,
  spawnMask,
  uDeltaTime,
  gridCols,
  rowCount,
  yMin,
  yMax,
}: FloatingTilesSimulationInput): ComputeNode => {
  const maskWidth = float(gridCols)
  const maskHeight = float(rowCount)
  const maxColumn = float(Math.max(gridCols - 1, 0))
  const maxRow = float(Math.max(rowCount - 1, 0))

  /** float sampleSpawnMask(float rowIndex, float colIndex) — nearest texel of the mask texture. */
  const sampleSpawnMask = (rowIndex: Node<'float'>, colIndex: Node<'float'>): Node<'float'> => {
    const u = clamp(colIndex, float(0), maxColumn).add(0.5).div(maskWidth)
    const v = clamp(rowIndex, float(0), maxRow).add(0.5).div(maskHeight)
    return texture(spawnMask, vec2(u, v)).r
  }

  return Fn(() => {
    const state = buffers.positions.element(instanceIndex)
    const columnValue = state.x
    const currentY = state.y
    const rowIndex = state.z
    const speed = state.w

    const nextY = currentY.add(speed.mul(uDeltaTime))
    const shouldRespawn = float(0).toVar()

    If(nextY.greaterThan(yMax), () => {
      shouldRespawn.assign(1)
    }).Else(() => {
      If(sampleSpawnMask(rowIndex, columnValue.floor()).lessThan(SPAWN_MASK_THRESHOLD), () => {
        shouldRespawn.assign(1)
      })
    })

    If(shouldRespawn.greaterThan(SPAWN_MASK_THRESHOLD), () => {
      const seeds = hash3(columnValue.add(nextY), rowIndex)
      const cursor = vec2(seeds.x, seeds.y).toVar()
      // The GLSL returned the *first* spawnable candidate; keep the last one seen as the fallback
      // so an exhausted search still yields a definite cell.
      const spawnColumn = clamp(cursor.y.mul(gridCols).floor(), float(0), maxColumn).toVar()
      const spawnRow = clamp(cursor.x.mul(rowCount).floor(), float(0), maxRow).toVar()
      const found = float(0).toVar()

      for (let step = 0; step < SPAWN_SEARCH_STEPS; step++) {
        If(found.lessThan(SPAWN_MASK_THRESHOLD), () => {
          const candidateRow = clamp(cursor.x.mul(rowCount).floor(), float(0), maxRow)
          const candidateColumn = clamp(cursor.y.mul(gridCols).floor(), float(0), maxColumn)
          spawnRow.assign(candidateRow)
          spawnColumn.assign(candidateColumn)
          If(
            sampleSpawnMask(candidateRow, candidateColumn).greaterThan(SPAWN_MASK_THRESHOLD),
            () => {
              found.assign(1)
            },
          )
          cursor.assign(fract(cursor.mul(vec2(3.1, 2.7)).add(vec2(0.17, 0.53))))
        })
      }

      const jitter = fract(seeds.z.mul(43758.5453))
      state.assign(
        vec4(
          spawnColumn.add(jitter),
          float(yMin),
          spawnRow,
          float(RESPAWN_SPEED_MIN).add(seeds.x.mul(RESPAWN_SPEED_RANGE)),
        ) as never,
      )
      Return()
    })

    state.assign(vec4(columnValue, nextY, rowIndex, speed))
  })().compute(buffers.instanceCount)
}
