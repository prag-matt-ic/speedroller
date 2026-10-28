import type { Collider as RapierCollider, KinematicCharacterController } from '@dimforge/rapier3d-compat'
import { Vector3 } from 'three'

export const TRACK_WIDTH = 10
export const TRACK_RADIUS = 21
export const TRACK_START_Z = 4
export const LOOP_LENGTH = 160
export const TRACK_LENGTH = LOOP_LENGTH + TRACK_START_Z
export const TRACK_ROTATION = Math.PI * 2
export const OUTER_RADIUS = TRACK_RADIUS * 2
export const MOVE_SPEED = 8
export const GRAVITY = 9.81
export const RESPAWN_DEPTH = 4
const ANGULAR_SEGMENTS = 32
const LENGTH_SEGMENTS = 256
const GROUND_PULL = 2

type Coordinates = { x: number; y: number; z: number }

export function trackAngle(z: number) {
  const progress = Math.max(0, Math.min(1, -z / LOOP_LENGTH))
  return TRACK_ROTATION * progress * progress * (3 - 2 * progress)
}

export function cylinderPosition(
  sideways: number,
  z: number,
  height: number,
  target: Coordinates,
  radius = TRACK_RADIUS,
) {
  const angle = sideways / radius
  target.x = (radius - height) * Math.sin(angle)
  target.y = TRACK_RADIUS - (radius - height) * Math.cos(angle)
  target.z = z
  return target
}

export function cylinderFrame(position: Coordinates, up: Vector3, tangent: Vector3) {
  const angle = Math.atan2(position.x, TRACK_RADIUS - position.y)
  up.set(-Math.sin(angle), Math.cos(angle), 0)
  tangent.set(Math.cos(angle), Math.sin(angle), 0)
}

export function courseFrame(position: Coordinates, up: Vector3, right: Vector3, forward: Vector3) {
  cylinderFrame(position, up, right)
  const progress = Math.max(0, Math.min(1, -position.z / LOOP_LENGTH))
  const radius = Math.hypot(position.x, TRACK_RADIUS - position.y)
  const pitch = radius * TRACK_ROTATION * 6 * progress * (1 - progress) / LOOP_LENGTH
  forward.copy(right).multiplyScalar(pitch)
  forward.z = -1
  forward.normalize()
  right.crossVectors(forward, up).normalize()
}

export function createTrackGeometry() {
  const vertices = new Float32Array((ANGULAR_SEGMENTS + 1) * (LENGTH_SEGMENTS + 1) * 3)
  const indices = new Uint32Array(ANGULAR_SEGMENTS * LENGTH_SEGMENTS * 6)
  const position = new Vector3()
  let vertexOffset = 0
  let indexOffset = 0
  for (let row = 0; row <= LENGTH_SEGMENTS; row++) {
    const z = TRACK_START_Z - (row / LENGTH_SEGMENTS) * TRACK_LENGTH
    for (let column = 0; column <= ANGULAR_SEGMENTS; column++) {
      cylinderPosition(
        trackAngle(z) * TRACK_RADIUS + (column / ANGULAR_SEGMENTS - 0.5) * TRACK_WIDTH,
        z,
        0,
        position,
      )
      position.toArray(vertices, vertexOffset)
      vertexOffset += 3
      if (row === LENGTH_SEGMENTS || column === ANGULAR_SEGMENTS) continue
      const start = row * (ANGULAR_SEGMENTS + 1) + column
      const nextRow = start + ANGULAR_SEGMENTS + 1
      indices.set([start, start + 1, nextRow, start + 1, nextRow + 1, nextRow], indexOffset)
      indexOffset += 6
    }
  }
  return { vertices, indices }
}

export function createMovementState() {
  return {
    up: new Vector3(0, 1, 0),
    tangent: new Vector3(1, 0, 0),
    forward: new Vector3(0, 0, -1),
    desired: new Vector3(),
    displacement: new Vector3(),
    nextPosition: new Vector3(),
    fallSpeed: 0,
  }
}

// Both the preview and the Rapier regression tests use this exact movement step.
export function stepCylinderMovement(
  controller: KinematicCharacterController,
  collider: RapierCollider,
  position: Coordinates,
  sideways: number,
  forward: number,
  delta: number,
  state: ReturnType<typeof createMovementState>,
) {
  courseFrame(position, state.up, state.tangent, state.forward)
  controller.setUp(state.up)
  state.fallSpeed = controller.computedGrounded()
    ? GROUND_PULL
    : state.fallSpeed + GRAVITY * delta
  const distance = (MOVE_SPEED * delta) / Math.max(1, Math.hypot(sideways, forward))
  state.desired.copy(state.tangent).multiplyScalar(sideways * distance)
  state.desired.addScaledVector(state.forward, forward * distance)
  state.desired.addScaledVector(state.up, -state.fallSpeed * delta)
  controller.computeColliderMovement(collider, state.desired)
  state.displacement.copy(controller.computedMovement())
  state.nextPosition.copy(position).add(state.displacement)
}

export function needsRespawn(position: Coordinates) {
  return (
    Math.hypot(position.x, position.y - TRACK_RADIUS) > TRACK_RADIUS + RESPAWN_DEPTH ||
    position.z > TRACK_START_Z + RESPAWN_DEPTH ||
    position.z < TRACK_START_Z - TRACK_LENGTH - RESPAWN_DEPTH
  )
}
