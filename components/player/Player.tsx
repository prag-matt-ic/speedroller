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

import { PLAYER_INITIAL_POSITION, useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { SpectatorScene } from '@/components/multiplayer/SpectatorScene'
import { RemoteRacers } from '@/components/multiplayer/RemoteRacers'
import { useOptionalMultiplayer, useRoomState } from '@/components/multiplayer/MultiplayerProvider'
import PlayerHUD from '@/components/player/PlayerHUD'
import { Marble } from '@/components/player/marble/Marble'
import { useGameFrame } from '@/hooks/useGameFrame'
import usePlayerController from '@/hooks/usePlayerController'
import { usePlayerInput, usePlayerInputIntent } from '@/hooks/usePlayerInput'
import type { PlayerUserData, RigidBodyUserData } from '@/model/schema'
import {
  type PlayerInput,
  isAutomaticMovementStage,
  isMovementInputStage,
} from '@/stores/types'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import {
  BRAKE_DEADZONE,
  LOBBY_SPEED,
  RACE_STEER_SPEED,
  type RaceSpeedState,
  addRingBoost,
  createRaceSpeedState,
  resetRaceSpeed,
  stepRaceSpeed,
} from '@/utils/platform/raceSpeed'
import { PLAYER_RADIUS } from '@/utils/player'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { surfaceFrame, worldToCourse } from '@/utils/platform/courseSurface'
import { updateColourTileContacts } from '@/utils/platform/colourTileContacts'
import { EPSILON } from '@/utils/tiles'

// https://rapier.rs/docs/user_guides/javascript/rigid_bodies
// https://rapier.rs/docs/user_guides/javascript/colliders
// https://rapier.rs/docs/user_guides/javascript/character_controller/

// Physics constants
const GRAVITY_ACCELERATION = -9.81 // m/s²
const PLAYER_USER_DATA: PlayerUserData = { type: 'player' }
// A hidden tab or stalled frame must never integrate its whole gap into one movement step.
const MAX_MOVEMENT_DELTA_S = 1 / 15
// The speed mirror only needs republishing when the readout would visibly change.
const PUBLISHED_SPEED_EPSILON = 0.001

type Movement = { x: number; y: number; z: number }

/** Manual lobby travel: four axes, with diagonals normalised so they are not faster. */
function writeLobbyMovement(movement: Movement, input: PlayerInput, deltaTime: number): void {
  const directionX = input.right - input.left
  const directionZ = input.down - input.up
  const inputMagnitude = Math.hypot(directionX, directionZ)
  const movementScale = (LOBBY_SPEED * deltaTime) / Math.max(1, inputMagnitude)

  movement.x = directionX * movementScale
  movement.z = directionZ * movementScale
}

/** Signed forward speed for effects and HUD while the lobby is played manually. */
function getLobbyForwardSpeed(input: PlayerInput): number {
  return (input.up - input.down) * LOBBY_SPEED
}

const Player: FC = () => {
  const spectatorMember = useRoomState(state => state.snapshot?.members.some(member => member.id === state.snapshot?.selfId && member.role === 'spectator') ?? false)
  const isSpectating = useGameStore(state => state.isSpectating)
  return spectatorMember || isSpectating ? <SpectatorScene /> : <LocalPlayer />
}

const LocalPlayer: FC = () => {
  const multiplayer = useOptionalMultiplayer()
  const surface = useCourseSurface()
  const rowCount = useGameStore(s => s.rowsData.length)
  const gameStoreAPI = useGameStoreAPI()
  const onOutOfBounds = useGameStore((s) => s.onOutOfBounds)
  const setPlayerPosition = useGameStore((s) => s.setPlayerPosition)
  const setPlayerSpeedUnits = useGameStore((s) => s.setPlayerSpeedUnits)
  const setPlayerBoostUnits = useGameStore((s) => s.setPlayerBoostUnits)
  const setConfirmingCollectible = useGameStore((s) => s.setConfirmingCollectible)
  const setConfirmingPaletteIndex = useGameStore((s) => s.setConfirmingPaletteIndex)
  const isPlatformReady = useGameStore((s) => s.isPlatformReady)
  const speedRunStage = useGameStore((s) => s.speedRunStage)
  const playerStatus = useGameStore((s) => s.playerStatus)
  const playerRespawnTick = useGameStore((s) => s.playerRespawnTick)
  const spawnPosition = useGameStore((s) => s.spawnPosition)
  const onRespawnComplete = useGameStore((s) => s.onRespawnComplete)

  const { input } = usePlayerInput()
  const { inputIntent } = usePlayerInputIntent()
  const { controllerRef } = usePlayerController()

  // Refs for physics bodies and meshes
  const colourTileContacts = useRef<number[]>([])
  const bodyRef = useRef<RapierRigidBody>(null)
  const ballColliderRef = useRef<RapierCollider | null>(null)
  const sphereMeshRef = useRef<Mesh>(null)

  // Race speed state: mutated in place once per frame, so the loop allocates nothing.
  const raceSpeed = useRef<RaceSpeedState>(createRaceSpeedState())
  const lastRingBoostTick = useRef(0)
  const lastPublishedSpeed = useRef(0)
  const lastPublishedBoost = useRef(0)

  // Preallocated vectors for physics calculations (performance optimization)
  const coursePosition = useRef(new Vector3())
  const surfaceUp = useRef(new Vector3(0, 1, 0))
  const surfaceRight = useRef(new Vector3(1, 0, 0))
  const frameDisplacement = useRef(new Vector3())
  const playerVelocity = useRef(new Vector3())
  const rollAxis = useRef(new Vector3())
  const worldScale = useRef(new Vector3())

  // Reusable position objects (avoid per-frame allocations)
  const nextPosition = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 })
  const desiredMovement = useRef<Movement>({ x: 0, y: 0, z: 0 })

  const isRacing = isAutomaticMovementStage(speedRunStage)

  /** Credits each ring collected since the previous frame; the store only reports a tick. */
  function creditCollectedRings(): void {
    const { ringBoostTick } = gameStoreAPI.getState()
    if (ringBoostTick === lastRingBoostTick.current) return

    const collectedRingCount = Math.max(0, ringBoostTick - lastRingBoostTick.current)
    lastRingBoostTick.current = ringBoostTick
    addRingBoost(raceSpeed.current, collectedRingCount)
  }

  /** Publishes the speed and boost readouts consumed by the effects, HUD, and debug probe. */
  function publishSpeedMirror(isHeld: boolean): void {
    const speedUnits = isHeld
      ? 0
      : isRacing
        ? raceSpeed.current.forwardSpeed
        : getLobbyForwardSpeed(input.current)

    if (Math.abs(speedUnits - lastPublishedSpeed.current) > PUBLISHED_SPEED_EPSILON) {
      lastPublishedSpeed.current = speedUnits
      setPlayerSpeedUnits(speedUnits)
    }

    const boostUnits = isRacing && !isHeld ? raceSpeed.current.boostUnits : 0
    if (Math.abs(boostUnits - lastPublishedBoost.current) > PUBLISHED_SPEED_EPSILON) {
      lastPublishedBoost.current = boostUnits
      setPlayerBoostUnits(boostUnits)
    }
  }

  // Every placement, fall respawn, retry, and lobby return increments this tick. Clearing here
  // makes all of them start from rest with no boost, and rebases the boost cursor so a ring from
  // the previous run cannot be credited again.
  useEffect(() => {
    resetRaceSpeed(raceSpeed.current)
    lastRingBoostTick.current = gameStoreAPI.getState().ringBoostTick
    lastPublishedSpeed.current = 0
    lastPublishedBoost.current = 0
  }, [playerRespawnTick, gameStoreAPI])

  // Outside a movement stage there is no loop to publish through, so stop the speed feedback here
  // rather than leaving the results screen frozen at race speed.
  useEffect(() => {
    if (isMovementInputStage(speedRunStage)) return
    resetRaceSpeed(raceSpeed.current)
    setPlayerSpeedUnits(0)
    setPlayerBoostUnits(0)
  }, [speedRunStage, setPlayerSpeedUnits, setPlayerBoostUnits])

  useGameFrame((_, rawDeltaTime) => {
    if (
      !bodyRef.current ||
      !controllerRef.current ||
      !ballColliderRef.current ||
      !sphereMeshRef.current
    )
      return

    if (!isPlatformReady || playerStatus === 'idle' || playerStatus === 'out-of-bounds') return
    if (!isMovementInputStage(speedRunStage)) return
    if (document.hidden) return

    const deltaTime = Math.min(rawDeltaTime, MAX_MOVEMENT_DELTA_S)
    const canMove = playerStatus === 'safe'

    creditCollectedRings()

    if (isRacing && canMove) {
      const isBraking = inputIntent.current.down > BRAKE_DEADZONE
      stepRaceSpeed(raceSpeed.current, isBraking, deltaTime)
    }

    if (!canMove) {
      // Held on the grid or mid-respawn: gravity only, no horizontal travel.
      desiredMovement.current.x = 0
      desiredMovement.current.z = 0
    } else if (isRacing) {
      const steerX = input.current.right - input.current.left
      desiredMovement.current.x = steerX * RACE_STEER_SPEED * deltaTime
      desiredMovement.current.z = -raceSpeed.current.forwardSpeed * deltaTime
    } else {
      writeLobbyMovement(desiredMovement.current, input.current, deltaTime)
    }
    desiredMovement.current.y = GRAVITY_ACCELERATION * deltaTime

    const currentPosition = bodyRef.current.translation()
    worldToCourse(currentPosition, surface, coursePosition.current)
    surfaceFrame(coursePosition.current.x, surface, surfaceUp.current, surfaceRight.current)
    controllerRef.current.setUp(surfaceUp.current)
    if (surface.topology === 'cylinder' && (coursePosition.current.y < -4 || currentPosition.z > 14 || currentPosition.z < 3.5 - rowCount - 10)) {
      onOutOfBounds()
      return
    }
    const sideways = desiredMovement.current.x
    const gravity = desiredMovement.current.y
    desiredMovement.current.x = surfaceRight.current.x * sideways + surfaceUp.current.x * gravity
    desiredMovement.current.y = surfaceRight.current.y * sideways + surfaceUp.current.y * gravity

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
    frameDisplacement.current.copy(correctedMovement)
    frameDisplacement.current.addScaledVector(surfaceUp.current, -frameDisplacement.current.dot(surfaceUp.current))

    calculatePlayerVelocity(frameDisplacement.current, deltaTime, playerVelocity.current)

    // Apply rolling physics to sphere mesh
    applyRollingPhysics(
      sphereMeshRef.current,
      playerVelocity.current,
      deltaTime,
      worldScale.current,
      rollAxis.current,
      surfaceUp.current,
    )

    multiplayer?.session?.captureRotation(sphereMeshRef.current.quaternion)

    // Update the store mirrors used by effects and HUD (immutable updates, change-guarded).
    setPlayerPosition(nextPosition.current)
    publishSpeedMirror(!canMove)
  })

  const updateColourTileContact = (paletteIndex: number, entering: boolean) => {
    const previous = colourTileContacts.current.at(-1) ?? null
    colourTileContacts.current = updateColourTileContacts(colourTileContacts.current, paletteIndex, entering)
    const current = colourTileContacts.current.at(-1) ?? null
    if (current !== previous) setConfirmingPaletteIndex(current)
  }

  const onIntersectionEnter: IntersectionEnterHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData) return

    if (otherUserData.type === 'collectible') {
      setConfirmingCollectible(otherUserData.collectibleType)
      return
    }

    if (otherUserData.type === 'colour-tile') {
      updateColourTileContact(otherUserData.paletteIndex, true)
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
      updateColourTileContact(otherUserData.paletteIndex, false)
      return
    }
  }

  const isRespawning = playerStatus === 'respawning'

  useEffect(() => {
    if (!isPlatformReady || !isRespawning || !bodyRef.current || !spawnPosition) return
    colourTileContacts.current = []
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
    <>
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
      <RemoteRacers />
    </>
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
  up: Vector3,
): void {
  sphereMesh.getWorldScale(worldScale)
  // Assume uniform scale for a sphere
  const effectiveRadius = PLAYER_RADIUS * worldScale.x
  const speed = velocity.length()

  if (speed <= EPSILON.SMALL || effectiveRadius <= EPSILON.SMALL) return
  // Rolling without slipping: ω = (n × v) / R
  // Axis given by right-hand rule (surface normal × velocity)
  rollAxis.copy(up).cross(velocity).normalize()

  // Calculate rotation angle: θ = |v| Δt / R
  const rotationAngle = (speed * deltaTime) / effectiveRadius
  sphereMesh.rotateOnWorldAxis(rollAxis, rotationAngle)
  sphereMesh.quaternion.normalize()
}
