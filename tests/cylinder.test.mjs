import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import Rapier from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'

import { loadTypeScript } from './loadTypeScript.mjs'

const {
  TRACK_RADIUS, TRACK_WIDTH, TRACK_START_Z, TRACK_LENGTH, LOOP_LENGTH,
  cylinderPosition, cylinderFrame, courseFrame, trackAngle, createTrackGeometry, createMovementState,
  stepCylinderMovement, needsRespawn,
} = loadTypeScript('components/cylinder/cylinder.ts')
const { PLAYER_RADIUS } = loadTypeScript('utils/player.ts')
const DELTA = 1 / 60

function close(actual, expected, tolerance = 0.00001) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`)
}

test('cylinder coordinates retain Z, arc distance, radius and inward height', () => {
  const position = new Vector3()
  const up = new Vector3()
  const tangent = new Vector3()
  for (const sideways of [-TRACK_WIDTH / 2, -5, 0, 5, TRACK_WIDTH / 2]) {
    cylinderPosition(sideways, -17, 0, position)
    close(position.z, -17)
    close(Math.hypot(position.x, position.y - TRACK_RADIUS), TRACK_RADIUS)
    close(Math.atan2(position.x, TRACK_RADIUS - position.y) * TRACK_RADIUS, sideways)
    cylinderFrame(position, up, tangent)
    close(up.length(), 1)
    close(tangent.length(), 1)
    close(up.dot(tangent), 0)
    const lifted = cylinderPosition(sideways, -17, 2, new Vector3())
    close(lifted.sub(position).dot(up), 2)
  }
})

test('track mesh faces inward, covers the course and has no invalid triangles', () => {
  const { vertices, indices } = createTrackGeometry()
  const first = new Vector3()
  const second = new Vector3()
  const third = new Vector3()
  const up = new Vector3()
  const tangent = new Vector3()
  for (let index = 0; index < indices.length; index += 3) {
    for (let corner = 0; corner < 3; corner++) assert.ok(indices[index + corner] < vertices.length / 3)
    first.fromArray(vertices, indices[index] * 3)
    second.fromArray(vertices, indices[index + 1] * 3).sub(first)
    third.fromArray(vertices, indices[index + 2] * 3).sub(first)
    cylinderFrame(first, up, tangent)
    assert.ok(second.cross(third).dot(up) > 0)
  }
  close(vertices[2], TRACK_START_Z)
  close(vertices.at(-1), TRACK_START_Z - TRACK_LENGTH)
  let previousAngle = 0
  let totalRotation = 0
  // Each row contains the same number of cross-track samples; its middle vertex is the centerline.
  let rowSize = 3
  while (vertices[rowSize + 2] === TRACK_START_Z) rowSize += 3
  for (let offset = (rowSize / 3 - 1) / 2 * 3; offset < vertices.length; offset += rowSize) {
    const angle = Math.atan2(vertices[offset], TRACK_RADIUS - vertices[offset + 1])
    const change = angle - previousAngle
    totalRotation += Math.atan2(Math.sin(change), Math.cos(change))
    previousAngle = angle
    close(Math.atan2(Math.sin(angle - trackAngle(vertices[offset + 2])), Math.cos(angle - trackAngle(vertices[offset + 2]))), 0)
  }
  close(totalRotation, Math.PI * 2)
})

test('course frame stays orthonormal through the full loop and points along the winding path', () => {
  const up = new Vector3()
  const right = new Vector3()
  const forward = new Vector3()
  for (const z of [0, -40, -80, -120, -160]) {
    const position = cylinderPosition(trackAngle(z) * TRACK_RADIUS, z, 0, new Vector3())
    courseFrame(position, up, right, forward)
    close(up.length(), 1)
    close(right.length(), 1)
    close(forward.length(), 1)
    close(up.dot(right), 0)
    close(up.dot(forward), 0)
    close(right.dot(forward), 0)
    const next = cylinderPosition(trackAngle(z - 0.001) * TRACK_RADIUS, z - 0.001, 0, new Vector3())
    assert.ok(next.sub(position).normalize().dot(forward) > 0.999)
  }
})

before(async () => { await Rapier.init() })

function simulation(sideways = 0, z = 0) {
  const world = new Rapier.World({ x: 0, y: 0, z: 0 })
  world.timestep = DELTA
  const { vertices, indices } = createTrackGeometry()
  world.createCollider(Rapier.ColliderDesc.trimesh(vertices, indices))
  const spawn = cylinderPosition(trackAngle(z) * TRACK_RADIUS + sideways, z, PLAYER_RADIUS + 0.1, new Vector3())
  const body = world.createRigidBody(Rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z))
  const collider = world.createCollider(Rapier.ColliderDesc.ball(PLAYER_RADIUS), body)
  const controller = world.createCharacterController(0.01)
  controller.enableAutostep(0.5, PLAYER_RADIUS / 2, true)
  controller.enableSnapToGround(0.5)
  controller.setMaxSlopeClimbAngle(Math.PI / 4)
  controller.setMinSlopeSlideAngle(Math.PI / 6)
  const state = createMovementState()
  world.step()
  return {
    world, body,
    step(sideways = 0, forward = 0) {
      stepCylinderMovement(controller, collider, body.translation(), sideways, forward, DELTA, state)
      body.setNextKinematicTranslation(state.nextPosition)
      world.step()
      return body.translation()
    },
  }
}

test('Rapier settles across the ribbon, including the walls and upside down', () => {
  for (const [sideways, z] of [[-3, 0], [0, -40], [3, -80], [-3, -120], [0, -159]]) {
    const sim = simulation(sideways, z)
    try {
      for (let tick = 0; tick < 180; tick++) sim.step()
      const position = sim.body.translation()
      close(Math.hypot(position.x, TRACK_RADIUS - position.y), TRACK_RADIUS - PLAYER_RADIUS - 0.01, 0.01)
      const expectedAngle = trackAngle(z) + sideways / TRACK_RADIUS
      const angleError = Math.atan2(position.x, TRACK_RADIUS - position.y) - expectedAngle
      close(Math.atan2(Math.sin(angleError), Math.cos(angleError)) * TRACK_RADIUS, 0, 0.025)
      assert.equal(needsRespawn(position), false)
    } finally { sim.world.free() }
  }
})

test('holding forward completes a full 360-degree loop and reverse returns along the ribbon', () => {
  const sim = simulation()
  try {
    for (let tick = 0; tick < 60; tick++) sim.step()
    let previousAngle = 0
    let rotation = 0
    let highestY = 0
    for (let tick = 0; tick < 2400 && sim.body.translation().z > -LOOP_LENGTH + 1; tick++) {
      const position = sim.step(0, 1)
      close(Math.hypot(position.x, TRACK_RADIUS - position.y), TRACK_RADIUS - PLAYER_RADIUS - 0.01, 0.025)
      assert.equal(needsRespawn(position), false)
      const angle = Math.atan2(position.x, TRACK_RADIUS - position.y)
      rotation += Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle))
      previousAngle = angle
      highestY = Math.max(highestY, position.y)
    }
    assert.ok(sim.body.translation().z <= -LOOP_LENGTH + 1)
    close(rotation, Math.PI * 2, 0.025)
    assert.ok(highestY > TRACK_RADIUS * 2 - 1)
    for (let tick = 0; tick < 2400 && sim.body.translation().z < 0; tick++) {
      const position = sim.step(0, -1)
      assert.equal(needsRespawn(position), false)
      close(Math.hypot(position.x, TRACK_RADIUS - position.y), TRACK_RADIUS - PLAYER_RADIUS - 0.01, 0.025)
    }
    assert.ok(sim.body.translation().z >= 0)
    close(sim.body.translation().x, 0, PLAYER_RADIUS)
  } finally { sim.world.free() }
})

test('leaving either side or either end falls outward and reaches the respawn boundary', () => {
  for (const [sideways, forward] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const sim = simulation()
    try {
      let fallen = false
      for (let tick = 0; tick < 2400; tick++) {
        if (needsRespawn(sim.step(sideways, forward))) { fallen = true; break }
      }
      assert.equal(fallen, true, `direction ${sideways}, ${forward}`)
    } finally { sim.world.free() }
  }
})
