import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import Rapier from '@dimforge/rapier3d-compat'
import { loadTypeScript } from './loadTypeScript.mjs'

const { CYLINDER_SURFACE: surface, FLAT_SURFACE, courseToWorld, worldToCourse, surfaceFrame, surfaceDeltaX } = loadTypeScript('utils/platform/courseSurface.ts')
const { createSurfaceColliders } = loadTypeScript('utils/platform/surfaceColliders.ts')
const { colToX, TILE_SURFACE_Y, TILE_THICKNESS, RAISED_Y } = loadTypeScript('utils/tiles.ts')
const point = () => ({ x: 0, y: 0, z: 0 })
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

before(async () => { await Rapier.init() })

test('surface coordinates round-trip in place, including ceiling and both sides of the seam', () => {
  for (const topology of [surface, FLAT_SURFACE]) {
    for (const x of [-65.9, -33, 0, 33, 65.9]) {
      const position = courseToWorld(x, 3, -900, topology, point())
      worldToCourse(position, topology, position)
      close(position.x, x); close(position.y, 3); close(position.z, -900)
    }
  }
  close(surfaceDeltaX(65.5, -65.5, surface), 1)
  close(surfaceDeltaX(-65.5, 65.5, surface), -1)
})

function createWorld(columns) {
  const world = new Rapier.World({ x: 0, y: 0, z: 0 })
  const positions = columns.map(column => [colToX(column, 132), RAISED_Y, 0])
  const geometry = createSurfaceColliders(positions, surface, 1, TILE_THICKNESS, 20)
  world.createCollider(Rapier.ColliderDesc.trimesh(geometry.vertices, geometry.indices))
  return world
}

function playerAt(world, x) {
  const position = courseToWorld(x, TILE_SURFACE_Y + 0.7, 0, surface, point())
  const body = world.createRigidBody(Rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z))
  const collider = world.createCollider(Rapier.ColliderDesc.ball(0.45), body)
  const controller = world.createCharacterController(0.01)
  controller.enableAutostep(0.5, 0.225, true)
  controller.enableSnapToGround(0.5)
  const up = point(), right = point(), course = point(), desired = point()
  world.step()
  return {
    body,
    step(steer = 0, forward = 0) {
      const position = body.translation()
      worldToCourse(position, surface, course)
      surfaceFrame(course.x, surface, up, right)
      controller.setUp(up)
      desired.x = (right.x * steer - up.x * 9.81) / 60
      desired.y = (right.y * steer - up.y * 9.81) / 60
      desired.z = -forward / 60
      controller.computeColliderMovement(collider, desired)
      const movement = controller.computedMovement()
      body.setNextKinematicTranslation({ x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z })
      world.step()
      return worldToCourse(body.translation(), surface, course)
    },
  }
}

test('Rapier holds the ball on the cylinder floor, walls, ceiling and across the seam', () => {
  const world = createWorld(Array.from({ length: 132 }, (_, i) => i))
  for (const x of [0, 33, -33, 65.5]) {
    const player = playerAt(world, x)
    let position
    for (let frame = 0; frame < 90; frame++) position = player.step()
    close(position.y, TILE_SURFACE_Y + 0.46, 0.03)
    for (let frame = 0; frame < 60; frame++) position = player.step(8)
    close(surfaceDeltaX(x, position.x, surface), 8, 0.3)
    close(position.y, TILE_SURFACE_Y + 0.46, 0.03)
  }
  world.free()
})

test('empty bitmap cells remain gaps: leaving a narrow track falls outward', () => {
  const world = createWorld([65, 66])
  const player = playerAt(world, 0)
  let position
  for (let frame = 0; frame < 120; frame++) position = player.step(8)
  assert.ok(position.y < -4, `expected outward fall, got ${JSON.stringify(position)}`)
  world.free()
})

test('surface placements keep floor panels and their local normal aligned around the cylinder', async () => {
  const { Vector3, Matrix4, Quaternion } = await import('three')
  const { createLocalCoursePanelGeometry } = loadTypeScript('utils/platform/coursePlaneGeometry.ts')
  const { useCoursePlacement } = loadTypeScript('hooks/useCoursePlacement.ts', {
    react: { useMemo: compute => compute() },
    './useCourseSurface': { useCourseSurface: () => surface },
  })
  for (const x of [0, 33, 66, -33]) {
    const placement = useCoursePlacement([x, TILE_SURFACE_Y, -90], -Math.PI / 2)
    const matrix = new Matrix4().compose(placement.position, new Quaternion().setFromEuler(placement.rotation), new Vector3(1, 1, 1))
    const geometry = createLocalCoursePanelGeometry(5, 5, x, TILE_SURFACE_Y, surface)
    const vertices = geometry.getAttribute('position')
    for (let index = 0; index < vertices.count; index++) {
      const world = new Vector3().fromBufferAttribute(vertices, index).applyMatrix4(matrix)
      const course = worldToCourse(world, surface, point())
      close(course.y, TILE_SURFACE_Y, 1e-5)
      assert.ok(Math.abs(surfaceDeltaX(x, course.x, surface)) <= 2.50001)
      assert.ok(Math.abs(course.z + 90) <= 2.50001)
    }
    const up = point(), right = point()
    surfaceFrame(x, surface, up, right)
    const normal = new Vector3(0, 0, 1).transformDirection(matrix)
    close(normal.x, up.x); close(normal.y, up.y); close(normal.z, up.z)
    geometry.dispose()
  }
})

test('the authored race admits a full loop at race speed and requires manual steering', () => {
  const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts')
  const { createTileBatches } = loadTypeScript('utils/platform/terrainBatches.ts')
  const { rowToWorldZ } = loadTypeScript('utils/tiles.ts')
  const rows = PLATFORM_DATA.modes.speedrun.rows
  const start = rows.findIndex(row => row.startLinePosition)
  const finish = rows.findIndex(row => row.finishLinePosition)
  const subdivisions = 4
  const count = surface.columns * subdivisions
  const wrap = index => (index + count) % count
  const toX = index => index / subdivisions - (surface.columns - 1) / 2
  const onFloor = (row, x) => rows[row].isRaised[((Math.round(x + 65.5) % 132) + 132) % 132] === 1
  // This planner exists only in the test. It finds safe driver inputs, never moves the live ball.
  const next = Array.from({ length: finish + 1 }, () => new Int32Array(count).fill(-1))
  let costs = new Float64Array(count)
  for (let row = finish; row >= start; row--) {
    const rowCosts = new Float64Array(count).fill(Infinity)
    for (let index = 0; index < count; index++) {
      const x = toX(index)
      if (!onFloor(row, x - 0.6) || !onFloor(row, x + 0.6)) continue
      let clearance = 1
      while (clearance < 8 && onFloor(row, x - clearance) && onFloor(row, x + clearance)) clearance++
      for (const offset of [-1, 0, 1]) {
        const candidate = wrap(index + offset)
        const cost = costs[candidate] + 1 / (clearance * clearance) + Math.abs(offset) * 0.01
        if (cost >= rowCosts[index]) continue
        rowCosts[index] = cost
        next[row][index] = candidate
      }
    }
    costs = rowCosts
  }
  let index = 66 * subdivisions
  assert.ok(Number.isFinite(costs[index]), 'no driveable route at the existing steering speed')
  const route = []
  for (let row = start; row <= finish; row++) {
    route[row] = toX(index)
    index = next[row][index]
  }
  let rotationDistance = 0
  for (let row = start + 1; row <= finish; row++) rotationDistance += surfaceDeltaX(route[row - 1], route[row], surface)
  assert.ok(rotationDistance > 125 && rotationDistance < 139, `expected a full loop, got ${rotationDistance} arc units`)

  const world = new Rapier.World({ x: 0, y: 0, z: 0 })
  for (const batch of createTileBatches(rows)) {
    const geometry = createSurfaceColliders(batch.positions, surface)
    const body = world.createRigidBody(Rapier.RigidBodyDesc.fixed().setTranslation(0, 0, rowToWorldZ(batch.startRow)))
    world.createCollider(Rapier.ColliderDesc.trimesh(geometry.vertices, geometry.indices), body)
  }
  const drive = steer => {
    const player = playerAt(world, route[start])
    const spawn = player.body.translation()
    player.body.setTranslation({ ...spawn, z: rowToWorldZ(start) }, true)
    world.step()
    let position = worldToCourse(player.body.translation(), surface, point())
    for (let frame = 0; frame < 5000 && position.z > rowToWorldZ(finish); frame++) {
      const row = Math.min(finish - 1, Math.max(start, Math.floor(3.5 - position.z)))
      const fraction = Math.min(1, Math.max(0, 3.5 - position.z - row))
      const slope = surfaceDeltaX(route[row], route[row + 1], surface)
      const target = route[row] + slope * fraction
      const input = steer ? Math.max(-8, Math.min(8, slope * 19 + surfaceDeltaX(position.x, target, surface) * 6)) : 0
      position = player.step(input, 19)
      if (position.y < -4) break
    }
    const result = { ...position }
    world.removeRigidBody(player.body)
    return result
  }
  const straight = drive(false)
  assert.ok(straight.y < -4, 'forward travel must not follow the painted path automatically')
  const driven = drive(true)
  assert.ok(driven.y > -1, `driver fell at ${JSON.stringify(driven)}`)
  assert.ok(driven.z <= rowToWorldZ(finish), `driver stopped before finish: ${JSON.stringify(driven)}`)
  world.free()
})
