import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { before, test } from 'node:test'
import Rapier from '@dimforge/rapier3d-compat'
import ts from 'typescript'
import { createStore } from 'zustand/vanilla'
import { subscribeWithSelector } from 'zustand/middleware'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Compile only the TypeScript modules exercised here, in memory. This keeps the native Node
// runner usable without another runtime dependency, emitted files, or a browser/React test stack.
function loadTypeScript(relativePath, overrides = {}, cache = new Map()) {
  const filename = path.resolve(projectRoot, relativePath)
  if (cache.has(filename)) return cache.get(filename).exports
  const loaded = new Module(filename)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  cache.set(filename, loaded)
  const nativeRequire = createRequire(filename)
  loaded.require = (specifier) => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier]
    if (specifier.startsWith('@/')) {
      return loadTypeScript(`${specifier.slice(2)}.ts`, overrides, cache)
    }
    return nativeRequire(specifier)
  }
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  })
  loaded._compile(outputText, filename)
  return loaded.exports
}

const {
  COLUMNS,
  PLATFORM_BATCH_ROWS,
  RAISED_Y,
  TILE_SIZE,
  TILE_THICKNESS,
  rowToWorldZ,
  worldZToRowIndex,
} = loadTypeScript('utils/tiles.ts')
const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts')
const { findSafeRespawnPosition } = loadTypeScript('utils/platform/playerRespawn.ts')
const { createTileBatches } = loadTypeScript('utils/platform/terrainBatches.ts')
const { COLLISION_GROUPS } = loadTypeScript('utils/collisionGroups.ts')

const SPAWN_HEIGHT = 4
const PLAYER_RADIUS = 0.45

function rowWithColumns(...columns) {
  return {
    isRaised: Array.from({ length: COLUMNS }, (_, column) => Number(columns.includes(column))),
    stage: 1,
    isSectionStart: false,
    isSectionEnd: false,
  }
}

function almostEqual(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be close to ${expected}`)
}

test('row coordinates round-trip the whole course, clamp its ends, and cross boundaries both ways', () => {
  assert.equal(rowToWorldZ(0), 3.5 * TILE_SIZE)
  const rowCount = PLATFORM_DATA.modes.learn.rows.length
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const z = rowToWorldZ(rowIndex)
    assert.equal(worldZToRowIndex(z, rowCount), rowIndex)
    assert.equal(worldZToRowIndex(z + TILE_SIZE * 0.49, rowCount), rowIndex)
    assert.equal(worldZToRowIndex(z - TILE_SIZE * 0.49, rowCount), rowIndex)
    if (rowIndex > 0) assert.equal(worldZToRowIndex(z + TILE_SIZE * 0.51, rowCount), rowIndex - 1)
    if (rowIndex < rowCount - 1) assert.equal(worldZToRowIndex(z - TILE_SIZE * 0.51, rowCount), rowIndex + 1)
  }
  assert.equal(worldZToRowIndex(10_000, rowCount), 0)
  assert.equal(worldZToRowIndex(-10_000, rowCount), rowCount - 1)
  assert.equal(worldZToRowIndex(0, 0), -1)
})

test('safe respawn chooses the nearest raised column and preserves its actual world Z', () => {
  const rows = [rowWithColumns(16), rowWithColumns(14, 18), rowWithColumns(16)]
  assert.deepEqual(findSafeRespawnPosition(rows, 0, rowToWorldZ(1), SPAWN_HEIGHT), [-2, SPAWN_HEIGHT, rowToWorldZ(1)])
  assert.deepEqual(findSafeRespawnPosition(rows, 0.4, rowToWorldZ(1), SPAWN_HEIGHT), [2, SPAWN_HEIGHT, rowToWorldZ(1)])
  assert.deepEqual(findSafeRespawnPosition(rows, 1.8, rowToWorldZ(1), SPAWN_HEIGHT), [2, SPAWN_HEIGHT, rowToWorldZ(1)])
  assert.deepEqual(findSafeRespawnPosition(rows, NaN, rowToWorldZ(2), SPAWN_HEIGHT), [0, SPAWN_HEIGHT, rowToWorldZ(2)])
  assert.equal(findSafeRespawnPosition([], 0, 0, SPAWN_HEIGHT), null)
  assert.equal(findSafeRespawnPosition([rowWithColumns(), rowWithColumns()], 0, 0, SPAWN_HEIGHT), null)
})

test('safe respawn searches gaps and the complete course, including falls past either endpoint', () => {
  const rows = Array.from({ length: 90 }, () => rowWithColumns())
  rows[1] = rowWithColumns(16)
  rows[44] = rowWithColumns(15)
  rows[46] = rowWithColumns(17)
  rows[89] = rowWithColumns(18)
  // The next row takes precedence over an equally close previous safe row.
  assert.deepEqual(findSafeRespawnPosition(rows, 0, rowToWorldZ(45), SPAWN_HEIGHT), [1, SPAWN_HEIGHT, rowToWorldZ(46)])
  // A gap far beyond the old 40-row pool finds a real course tile.
  assert.deepEqual(findSafeRespawnPosition(rows, 0, rowToWorldZ(75), SPAWN_HEIGHT), [2, SPAWN_HEIGHT, rowToWorldZ(89)])
  assert.deepEqual(findSafeRespawnPosition(rows, 0, 100, SPAWN_HEIGHT), [0, SPAWN_HEIGHT, rowToWorldZ(1)])
  assert.deepEqual(findSafeRespawnPosition(rows, 0, -1000, SPAWN_HEIGHT), [2, SPAWN_HEIGHT, rowToWorldZ(89)])
})

for (const [mode, { rows, totalCounts }] of Object.entries(PLATFORM_DATA.modes)) {
  test(`${mode}: complete generated layout has exactly one instance per raised cell in fixed batches`, () => {
    const batches = createTileBatches(rows)
    const expectedTiles = rows.reduce((count, row) => count + row.isRaised.filter(Boolean).length, 0)
    const visited = new Set()
    for (const batch of batches) {
      assert.equal(batch.startRow % PLATFORM_BATCH_ROWS, 0)
      assert.equal(batch.positions.length, batch.seeds.length)
      assert.equal(batch.positions.length, batch.highlights.length)
      batch.positions.forEach(([x, y, localZ], index) => {
        const worldZ = rowToWorldZ(batch.startRow) + localZ
        const rowIndex = worldZToRowIndex(worldZ, rows.length)
        const column = Math.round(x / TILE_SIZE + (COLUMNS - 1) / 2)
        const key = `${rowIndex}:${column}`
        assert.ok(!visited.has(key), `duplicate tile ${key}`)
        visited.add(key)
        assert.ok(rowIndex >= batch.startRow && rowIndex < batch.startRow + PLATFORM_BATCH_ROWS)
        assert.equal(rows[rowIndex].isRaised[column], 1, `gap rendered at ${key}`)
        assert.equal(y, RAISED_Y)
        assert.equal(worldZ, rowToWorldZ(rowIndex))
        assert.equal(batch.highlights[index], rows[rowIndex].isHighlighted?.[column] ?? 0)
        assert.ok(batch.seeds[index] >= 0 && batch.seeds[index] <= 1)
      })
    }
    assert.equal(visited.size, expectedTiles)
    assert.deepEqual(createTileBatches(rows), batches, 'reset must preserve positions and animation seeds')
    assert.equal(rows.length, totalCounts.rows)
    assert.equal(rows.reduce((count, row) => count + (row.rings?.filter(Boolean).length ?? 0), 0), totalCounts.rings)
    for (const [field, totalKey] of [
      ['floatingHeadingPlacements', 'headings'], ['collectiblePlacements', 'collectibles'],
      ['infoZonePlacements', 'infoZones'], ['confettiPlacements', 'confetti'],
    ]) {
      assert.equal(rows.reduce((count, row) => count + (row[field]?.length ?? 0), 0), totalCounts[totalKey])
    }
    assert.equal(rows.filter((row) => row.colourPickerPlacement).length, totalCounts.colourPickers)
    for (const row of rows) {
      for (const playerX of [-100, 0, 100]) {
        const position = findSafeRespawnPosition(rows, playerX, rowToWorldZ(row.rowIndex), SPAWN_HEIGHT)
        assert.ok(position)
        const selectedRow = worldZToRowIndex(position[2], rows.length)
        const selectedColumn = Math.round(position[0] / TILE_SIZE + (COLUMNS - 1) / 2)
        assert.equal(rows[selectedRow].isRaised[selectedColumn], 1)
      }
    }
  })
}

test('Z-only store changes notify player-position consumers without React renders', () => {
  const store = createStore(subscribeWithSelector(() => ({ playerPosition: [0, 1, 0] })))
  const cleanups = []
  const { usePlayerPosition } = loadTypeScript('hooks/usePlayerPosition.ts', {
    react: { useRef: (value) => ({ current: value }), useEffect: (effect) => cleanups.push(effect()) },
    '@/components/GameProvider': { useGameStoreAPI: () => store },
  })
  const received = []
  const { playerPosition } = usePlayerPosition((position) => received.push(position))
  store.setState({ playerPosition: [0, 1, -1] })
  store.setState({ playerPosition: [0, 1, -1] })
  store.setState({ playerPosition: [0, 1, 1] })
  assert.deepEqual(received, [[0, 1, 0], [0, 1, -1], [0, 1, 1]])
  assert.deepEqual(playerPosition.current, [0, 1, 1])
  cleanups.forEach((cleanup) => cleanup?.())
})

before(async () => { await Rapier.init() })

function addTerrain(world, rows) {
  return createTileBatches(rows).map((batch) => {
    const body = world.createRigidBody(Rapier.RigidBodyDesc.fixed().setTranslation(0, 0, rowToWorldZ(batch.startRow)))
    batch.positions.forEach(([x, y, z]) => {
      world.createCollider(Rapier.ColliderDesc.cuboid(TILE_SIZE / 2, TILE_THICKNESS / 2, TILE_SIZE / 2).setTranslation(x, y, z).setFriction(0), body)
    })
    return body
  })
}

function addPlayer(world, position) {
  const body = world.createRigidBody(Rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(...position))
  const collider = world.createCollider(Rapier.ColliderDesc.ball(PLAYER_RADIUS).setCollisionGroups(COLLISION_GROUPS.player), body)
  const controller = world.createCharacterController(0.01)
  controller.enableAutostep(0.5, PLAYER_RADIUS / 2, true)
  controller.enableSnapToGround(0.5)
  return { body, collider, controller }
}

function movePlayer(world, player, desired) {
  player.controller.computeColliderMovement(player.collider, desired, Rapier.QueryFilterFlags.EXCLUDE_SENSORS)
  const delta = player.controller.computedMovement()
  const position = player.body.translation()
  player.body.setNextKinematicTranslation({ x: position.x + delta.x, y: position.y + delta.y, z: position.z + delta.z })
  world.step()
  return delta
}

test('Rapier moves along Z and diagonally across fixed terrain while sensors do not block movement', () => {
  const world = new Rapier.World({ x: 0, y: -9.81, z: 0 })
  try {
    const terrain = addTerrain(world, Array.from({ length: 40 }, () => rowWithColumns(14, 15, 16, 17, 18)))
    const originalTransforms = terrain.map((body) => body.translation())
    const player = addPlayer(world, [0, 0, 0])
    const sensorBody = world.createRigidBody(Rapier.RigidBodyDesc.fixed().setTranslation(0, 0, -2))
    world.createCollider(Rapier.ColliderDesc.cuboid(2, 2, 0.2).setSensor(true), sensorBody)
    world.step()
    for (let frame = 0; frame < 150; frame++) movePlayer(world, player, { x: 0, y: -0.16, z: -0.1 })
    almostEqual(player.body.translation().z, -15, 0.03)
    almostEqual(player.body.translation().x, 0, 0.03)
    assert.ok(player.body.translation().y > -0.05)
    for (let frame = 0; frame < 15; frame++) movePlayer(world, player, { x: 0.05, y: -0.16, z: 0.05 })
    almostEqual(player.body.translation().x, 0.75, 0.03)
    almostEqual(player.body.translation().z, -14.25, 0.03)
    assert.deepEqual(terrain.map((body) => body.translation()), originalTransforms)
  } finally { world.free() }
})

test('Rapier corrected Z movement stops at solid obstacles and falls off both course endpoints', () => {
  const world = new Rapier.World({ x: 0, y: -9.81, z: 0 })
  try {
    addTerrain(world, Array.from({ length: 12 }, () => rowWithColumns(16)))
    const obstacle = world.createRigidBody(Rapier.RigidBodyDesc.fixed().setTranslation(0, 1, -2))
    world.createCollider(Rapier.ColliderDesc.cuboid(1, 2, 0.2), obstacle)
    const player = addPlayer(world, [0, 0, 0])
    world.step()
    for (let frame = 0; frame < 50; frame++) movePlayer(world, player, { x: 0, y: -0.16, z: -0.1 })
    assert.ok(player.body.translation().z > -1.36 && player.body.translation().z < -1.3)
    world.removeRigidBody(obstacle)
    for (const [startZ, direction] of [[rowToWorldZ(0), 1], [rowToWorldZ(11), -1]]) {
      player.body.setTranslation({ x: 0, y: 0, z: startZ }, true)
      player.body.setNextKinematicTranslation({ x: 0, y: 0, z: startZ })
      world.step()
      for (let frame = 0; frame < 40; frame++) movePlayer(world, player, { x: 0, y: -0.16, z: direction * 0.1 })
      assert.ok(player.body.translation().y < -2, `expected a fall after leaving Z=${startZ}`)
    }
  } finally { world.free() }
})

test('native fixed sensors report player intersections only with KINEMATIC_FIXED enabled', () => {
  const world = new Rapier.World({ x: 0, y: 0, z: 0 })
  try {
    const player = addPlayer(world, [0, 0, 0])
    const body = world.createRigidBody(Rapier.RigidBodyDesc.fixed())
    const sensor = world.createCollider(
      Rapier.ColliderDesc.cuboid(1, 1, 1).setSensor(true).setCollisionGroups(COLLISION_GROUPS.outOfBoundsSensor), body,
    )
    world.step()
    assert.equal(world.intersectionPair(player.collider, sensor), false)
    sensor.setActiveCollisionTypes(Rapier.ActiveCollisionTypes.DEFAULT | Rapier.ActiveCollisionTypes.KINEMATIC_FIXED)
    world.step()
    assert.equal(world.intersectionPair(player.collider, sensor), true)
  } finally { world.free() }
})
