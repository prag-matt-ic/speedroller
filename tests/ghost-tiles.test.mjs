import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { uniform } from 'three/tsl'
import { MathUtils } from 'three'
import Rapier from '@dimforge/rapier3d-compat'
import { loadTypeScript } from './loadTypeScript.mjs'

const { ghostTileMotion } = loadTypeScript('resources/tsl/ghostTileMotion.ts')
const { GHOST_DROP_DEPTH, GHOST_DROP_START, GHOST_DROP_END } = loadTypeScript('utils/platform/ghostTiles.ts')
const { RACE_MAX_SPEED } = loadTypeScript('utils/platform/raceSpeed.ts')
const { courseToWorld, surfaceFrame, CYLINDER_SURFACE, FLAT_SURFACE } = loadTypeScript('utils/platform/courseSurface.ts')
const { createTileBatches } = loadTypeScript('utils/platform/terrainBatches.ts')
const { createSurfaceColliders } = loadTypeScript('utils/platform/surfaceColliders.ts')
const { colToX, rowToWorldZ, TILE_SURFACE_Y } = loadTypeScript('utils/tiles.ts')

// Evaluate the actual TSL graph, rather than a separately implemented animation formula.
function evaluate(node) {
  const graph = node.toJSON()
  const nodes = new Map([graph, ...(graph.nodes ?? [])].map(entry => [entry.uuid, entry]))
  const read = id => {
    const entry = nodes.get(id)
    if (typeof entry.value === 'number') return entry.value
    const inputs = entry.inputNodes
    const child = key => read(inputs[key])
    if (inputs.node) return child('node')
    if (entry.op === '-') return child('aNode') - child('bNode')
    if (entry.op === '*') return child('aNode') * child('bNode')
    if (entry.method === 'abs') return Math.abs(child('aNode'))
    if (entry.method === 'mix') return MathUtils.lerp(child('aNode'), child('bNode'), child('cNode'))
    if (entry.method === 'step') return child('bNode') < child('aNode') ? 0 : 1
    if (entry.method === 'smoothstep') return MathUtils.smoothstep(child('cNode'), child('aNode'), child('bNode'))
    throw new Error(`Unexpected motion node: ${JSON.stringify(entry)}`)
  }
  return read(graph.uuid)
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`)

test('ghost shader drops midway, clears before arrival at maximum speed, and reverses on retreat', () => {
  const ahead = uniform(88), isGhost = uniform(1), noise = uniform(0.5)
  const motion = ghostTileMotion(ahead, isGhost, noise)
  for (const [distance, drop, opacity] of [[88, 0, 1], [48, 0, 1], [36, -2.5, 1], [24, -10, 0], [0, -10, 0], [-100, -10, 0], [36, -2.5, 1], [48, 0, 1]]) {
    ahead.value = distance
    close(evaluate(motion.offsetY), drop)
    close(evaluate(motion.opacity), opacity)
  }
  assert.ok(GHOST_DROP_END / RACE_MAX_SPEED > 0.8, 'more than 0.8 seconds of completely clear approach at maximum speed')
  for (let distance = GHOST_DROP_START; distance > -5; distance -= RACE_MAX_SPEED / 30) {
    ahead.value = distance
    if (distance <= GHOST_DROP_END) { close(evaluate(motion.opacity), 0); close(evaluate(motion.offsetY), -GHOST_DROP_DEPTH) }
  }
  ahead.value = 0
  for (const value of [-1, -0.5, 0, 0.5, 1]) {
    noise.value = value
    const angle = Math.abs(evaluate(motion.angle))
    assert.ok(angle >= Math.PI / 4 && angle <= Math.PI / 2)
  }
  isGhost.value = 0
  for (const distance of [-100, 0, 36, 88, 1000]) {
    ahead.value = distance
    close(evaluate(motion.opacity), 1)
    close(evaluate(motion.offsetY), 0)
    close(evaluate(motion.angle), 0)
  }
})

test('drop follows the local outward direction on flat floor, cylinder walls, ceiling and seam', () => {
  const motion = ghostTileMotion(uniform(24), uniform(1), uniform(0.5))
  const offset = evaluate(motion.offsetY)
  for (const surface of [FLAT_SURFACE, CYLINDER_SURFACE]) for (const x of [0, 33, -33, 65.5, -65.5]) {
    const original = courseToWorld(x, TILE_SURFACE_Y, -300, surface, {})
    const fallen = courseToWorld(x, TILE_SURFACE_Y + offset, -300, surface, {})
    const up = {}, right = {}
    surfaceFrame(x, surface, up, right)
    close((fallen.x - original.x) * up.x + (fallen.y - original.y) * up.y, -10)
    close(Math.hypot(fallen.x - original.x, fallen.y - original.y), 10)
    close(fallen.z, original.z)
  }
})

before(async () => { await Rapier.init() })
test('ghost instances never produce collision geometry on the floor, walls or ceiling', () => {
  const columns = [0, 33, 66, 99]
  const row = { isRaised: Array(132).fill(0), decorationColumns: columns, stage: 3, isSectionStart: false, isSectionEnd: false }
  // Even an overlapping source floor flag cannot turn a ghost into a collider.
  for (const column of columns) { row.isRaised[column] = 1; row.isRaised[column + 2] = 1 }
  const [batch] = createTileBatches([row], true)
  assert.equal(batch.positions.length, 8)
  assert.equal(batch.solidPositions.length, 4)
  const geometry = createSurfaceColliders(batch.solidPositions, CYLINDER_SURFACE)
  const world = new Rapier.World({ x: 0, y: 0, z: 0 })
  try {
    world.createCollider(Rapier.ColliderDesc.trimesh(geometry.vertices, geometry.indices).setTranslation(0, 0, rowToWorldZ(0)))
    world.step()
    for (const column of columns) for (const offset of [0, 2]) {
      const x = colToX(column + offset, 132)
      const origin = courseToWorld(x, TILE_SURFACE_Y + 1, rowToWorldZ(0), CYLINDER_SURFACE, {})
      const up = {}, right = {}
      surfaceFrame(x, CYLINDER_SURFACE, up, right)
      const hit = world.castRay(new Rapier.Ray(origin, { x: -up.x, y: -up.y, z: 0 }), 2, true)
      assert.equal(!!hit, offset === 2, `column ${column + offset}`)
    }
  } finally { world.free() }
  const onlyGhosts = { ...row, isRaised: Array(132).fill(0) }
  const [ghostBatch] = createTileBatches([onlyGhosts], true)
  assert.equal(ghostBatch.solidPositions.length, 0)
  assert.ok(ghostBatch.cellToInstance.every(index => index === -1))
})
