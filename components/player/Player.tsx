'use client'

import { QueryFilterFlags } from '@dimforge/rapier3d-compat'
import {
  BallCollider,
  type IntersectionEnterHandler,
  type IntersectionExitHandler,
  type RapierCollider,
  RapierRigidBody,
  RigidBody,
} from '@react-three/rapier'
import { type FC, useEffect, useRef } from 'react'
import { Mesh, type Object3D, Vector3 } from 'three'

import { PLAYER_INITIAL_POSITION, useGameStore } from '@/components/GameProvider'
import PlayerHUD, { PLAYER_RADIUS } from '@/components/player/PlayerHUD'
import { Marble } from '@/components/player/marble/Marble'
import { useGameFrame } from '@/hooks/useGameFrame'
import usePlayerController from '@/hooks/usePlayerController'
import { usePlayerInput } from '@/hooks/usePlayerInput'
import usePlayerSpeed from '@/hooks/usePlayerSpeed'
import type { PlayerUserData, RigidBodyUserData } from '@/model/schema'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { EPSILON } from '@/utils/tiles'

// https://rapier.rs/docs/user_guides/javascript/rigid_bodies
// https://rapier.rs/docs/user_guides/javascript/colliders
// https://rapier.rs/docs/user_guides/javascript/character_controller/

// Physics constants
const GRAVITY_ACCELERATION = -9.81 // m/s²
const UP_DIRECTION = new Vector3(0, 1, 0)
const PLAYER_USER_DATA: PlayerUserData = { type: 'player' }

const Player: FC = () => {
  const onOutOfBounds = useGameStore((s) => s.onOutOfBounds)
  const setPlayerPosition = useGameStore((s) => s.setPlayerPosition)
  const setConfirmingCollectible = useGameStore((s) => s.setConfirmingCollectible)
  const setConfirmingPaletteIndex = useGameStore((s) => s.setConfirmingPaletteIndex)
  const isPlatformReady = useGameStore((s) => s.isPlatformReady)
  const playerStatus = useGameStore((s) => s.playerStatus)
  const playerRespawnTick = useGameStore((s) => s.playerRespawnTick)
  const spawnPosition = useGameStore((s) => s.spawnPosition)
  const onRespawnComplete = useGameStore((s) => s.onRespawnComplete)

  const { input } = usePlayerInput()
  const { controllerRef } = usePlayerController()
  const { speedUnits: playerSpeedUnits } = usePlayerSpeed()

  // Refs for physics bodies and meshes
  const bodyRef = useRef<RapierRigidBody>(null)
  const ballColliderRef = useRef<RapierCollider | null>(null)
  const sphereMeshRef = useRef<Mesh>(null)

  // Preallocated vectors for physics calculations (performance optimization)
  const frameDisplacement = useRef(new Vector3())
  const playerVelocity = useRef(new Vector3())
  const rollAxis = useRef(new Vector3())
  const worldScale = useRef(new Vector3())

  // Reusable position objects (avoid per-frame allocations)
  const nextPosition = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 })
  const desiredMovement = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 })

  useGameFrame((_, deltaTime) => {
    if (
      !bodyRef.current ||
      !controllerRef.current ||
      !ballColliderRef.current ||
      !sphereMeshRef.current
    )
      return

    if (!isPlatformReady || playerStatus === 'idle' || playerStatus === 'out-of-bounds') return

    const speedUnits = playerSpeedUnits.current
    const currentPosition = bodyRef.current.translation()

    // Resolve player input into a clamped direction vector
    const inputDirectionX = input.current.right - input.current.left
    const inputDirectionZ = input.current.down - input.current.up
    const canMove = playerStatus === 'safe'
    const inputMagnitude = Math.hypot(inputDirectionX, inputDirectionZ)
    const movementScale = canMove ? (speedUnits * deltaTime) / Math.max(1, inputMagnitude) : 0

    // Calculate desired movement including gravity
    desiredMovement.current.x = inputDirectionX * movementScale
    desiredMovement.current.y = GRAVITY_ACCELERATION * deltaTime
    desiredMovement.current.z = inputDirectionZ * movementScale

    // Use character controller to compute collision-aware movement
    controllerRef.current.computeColliderMovement(
      ballColliderRef.current,
      desiredMovement.current,
      QueryFilterFlags.EXCLUDE_SENSORS,
    )

    const correctedMovement = controllerRef.current.computedMovement()

    // Apply corrected movement to kinematic rigid body
    nextPosition.current.x = currentPosition.x + correctedMovement.x
    nextPosition.current.y = currentPosition.y + correctedMovement.y
    nextPosition.current.z = currentPosition.z + correctedMovement.z

    bodyRef.current.setNextKinematicTranslation(nextPosition.current)

    // Calculate physics for rolling animation
    frameDisplacement.current.set(
      correctedMovement.x,
      0,
      correctedMovement.z,
    )

    calculatePlayerVelocity(frameDisplacement.current, deltaTime, playerVelocity.current)

    // Apply rolling physics to sphere mesh
    applyRollingPhysics(
      sphereMeshRef.current,
      playerVelocity.current,
      deltaTime,
      worldScale.current,
      rollAxis.current,
    )

    // Update global player position in store (immutable update)
    setPlayerPosition(nextPosition.current)
  })

  const onIntersectionEnter: IntersectionEnterHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData) return

    if (otherUserData.type === 'collectible') {
      setConfirmingCollectible(otherUserData.collectibleType)
      return
    }

    if (otherUserData.type === 'colour-tile') {
      setConfirmingPaletteIndex(otherUserData.paletteIndex)
      return
    }

    if (otherUserData.type === 'out-of-bounds') {
      onOutOfBounds()
      return
    }
  }

  const onIntersectionExit: IntersectionExitHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData) return

    if (otherUserData.type === 'collectible') {
      setConfirmingCollectible(null)
      return
    }

    if (otherUserData.type === 'colour-tile') {
      setConfirmingPaletteIndex(null)
      return
    }
  }

  const isRespawning = playerStatus === 'respawning'

  useEffect(() => {
    if (!isPlatformReady || !isRespawning || !bodyRef.current || !spawnPosition) return
    nextPosition.current.x = spawnPosition[0]
    nextPosition.current.y = spawnPosition[1]
    nextPosition.current.z = spawnPosition[2]
    bodyRef.current.setTranslation(nextPosition.current, true)
    bodyRef.current.setNextKinematicTranslation(nextPosition.current)
    setPlayerPosition(nextPosition.current)
    const timeout = setTimeout(() => {
      onRespawnComplete()
    }, 200)
    return () => clearTimeout(timeout)
  }, [
    playerRespawnTick,
    isRespawning,
    isPlatformReady,
    onRespawnComplete,
    setPlayerPosition,
    spawnPosition,
  ])

  // Mounted with the rest of the physics content, so the marble is already in the scene when
  // SceneWarmup compiles it. Placement is not this component's mount: `playerStatus` keeps the body
  // parked at PLAYER_INITIAL_POSITION, the shader's Y fade keeps it invisible there, and the drop-in
  // is the respawn LandingOverlay triggers once it closes.
  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      userData={PLAYER_USER_DATA}
      colliders={false}
      position={PLAYER_INITIAL_POSITION}
      onIntersectionEnter={onIntersectionEnter}
      onIntersectionExit={onIntersectionExit}>
      <BallCollider
        args={[PLAYER_RADIUS]}
        ref={ballColliderRef}
        collisionGroups={COLLISION_GROUPS.player}
      />
      <Marble ref={sphereMeshRef} />
      <PlayerHUD />
    </RigidBody>
  )
}

export default Player

function calculatePlayerVelocity(
  displacement: Vector3,
  deltaTime: number,
  targetVelocity: Vector3,
): void {
  targetVelocity.copy(displacement).divideScalar(Math.max(deltaTime, EPSILON.SMALL))
}

function applyRollingPhysics(
  sphereMesh: Object3D,
  velocity: Vector3,
  deltaTime: number,
  worldScale: Vector3,
  rollAxis: Vector3,
): void {
  sphereMesh.getWorldScale(worldScale)
  // Assume uniform scale for a sphere
  const effectiveRadius = PLAYER_RADIUS * worldScale.x
  const speed = velocity.length()

  if (speed <= EPSILON.SMALL || effectiveRadius <= EPSILON.SMALL) return
  // Rolling without slipping: ω = (n × v) / R
  // Axis given by right-hand rule (surface normal × velocity)
  rollAxis.copy(UP_DIRECTION).cross(velocity).normalize()

  // Calculate rotation angle: θ = |v| * Δt / R
  const rotationAngle = (speed * deltaTime) / effectiveRadius
  sphereMesh.rotateOnWorldAxis(rollAxis, rotationAngle)
  sphereMesh.quaternion.normalize()
}
