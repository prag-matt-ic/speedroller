'use client'
import { useRoomState } from '@/components/multiplayer/MultiplayerProvider'

import { useFrame, useThree } from '@react-three/fiber'
import { type FC, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { Matrix4, Quaternion, Vector3, type PerspectiveCamera } from 'three'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { surfaceFrame, worldToCourse } from '@/utils/platform/courseSurface'

import { CAMERA_FAR } from '@/utils/sceneDistances'

import { Stage, useGameStore } from '@/components/GameProvider'
import useCameraControls from '@/hooks/cameraControls/useCameraControls'
import { usePlayerInput } from '@/hooks/usePlayerInput'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'
import useStage from '@/hooks/useStage'
import { Overlay, SpeedRunStage } from '@/stores/types'

type StageCameraPosition = {
  y: number
  z: number
}

// Racing framing. The camera sits closer and a little higher than the original manual-movement
// framing, so more of the road ahead fills the frame at speed; both values are playtest targets.
export const CAMERA_POSITION_DESKTOP: StageCameraPosition = { y: 5, z: 7 }
export const CAMERA_POSITION_MOBILE: StageCameraPosition = { y: 6, z: 9 }

export const CAMERA_ZOOM_FOR_STAGE_DESKTOP: Record<Stage, number> = {
  [Stage.HOME]: 1.2,
  [Stage.INFO]: 1.2,
  [Stage.OBSTACLES]: 1.3,
  [Stage.CTA]: 1.2,
  [Stage.SPEED_RUN_FINISH]: 1.2,
}

export const CAMERA_ZOOM_FOR_STAGE_MOBILE: Record<Stage, number> = {
  [Stage.HOME]: 1.6,
  [Stage.INFO]: 1.6,
  [Stage.OBSTACLES]: 1.7,
  [Stage.CTA]: 1.6,
  [Stage.SPEED_RUN_FINISH]: 1.6,
}

const LOOK_AT_HEIGHT = 3
// A small steer look-ahead. The input ramp is quick and asymmetric, so the offset is eased
// separately to keep it a drift rather than a flick.
const LOOK_AT_X_RANGE = 0.5
const LOOK_AT_X_EASE_SECONDS = 0.35
const INPUT_UP_Z_OFFSET = 3
const INPUT_DOWN_Z_OFFSET = 7
const INPUT_DOWN_LOOK_AT_Z_OFFSET = 2
const INPUT_DOWN_Z_DAMPING = 8
const OVERLAY_Y_OFFSET = 5
const OVERLAY_Z_OFFSET = 5
const COLLECTIBLE_ZOOM_OFFSET = 0.3

type SetZoom = (zoom: number, transition?: boolean) => void

/**
 * Symmetric, frame-rate independent ease for the steering look-ahead. This is deliberately slower
 * than the input ramp so the small offset trails the key instead of flicking with it.
 */
const easeLookAtX = (
  currentOffset: number,
  targetOffset: number,
  deltaSeconds: number,
): number =>
  currentOffset +
  (targetOffset - currentOffset) * (1 - Math.exp(-deltaSeconds / LOOK_AT_X_EASE_SECONDS))

/**
 * Zoom policy for the hook that owns the lens: the stage picks the base zoom, and an on-screen
 * collectible confirmation nudges it. `useCameraControls` eases toward each goal.
 */
const useStageZoom = (setZoom: SetZoom, zoomForStage: Record<Stage, number>) => {
  const isConfirmingCollectible = useGameStore((s) => !!s.confirmingCollectible)
  const stageZoom = useRef(zoomForStage[Stage.HOME])

  const handleStageChange = useCallback(
    (nextStage: Stage) => {
      stageZoom.current = zoomForStage[nextStage]
      setZoom(stageZoom.current, true)
    },
    [setZoom, zoomForStage],
  )

  useStage(handleStageChange)

  useEffect(() => {
    const confirmationOffset = isConfirmingCollectible ? COLLECTIBLE_ZOOM_OFFSET : 0
    setZoom(stageZoom.current + confirmationOffset, true)
  }, [isConfirmingCollectible, setZoom])
}

type Props = {
  isMobile: boolean
  position: StageCameraPosition
}

/**
 * The running camera keeps whatever far plane it was created with, so a session that started
 * before the preview change would clip the road mid-dissolve. The write lives outside the
 * component body so the camera mutation stays in one place.
 */
const applyFarPlane = (camera: PerspectiveCamera): void => {
  if (camera.far === CAMERA_FAR) return
  camera.far = CAMERA_FAR
  camera.updateProjectionMatrix()
}

const FlatCamera: FC<Props> = ({ isMobile, position }) => {
  const { setLookAt, setZoom } = useCameraControls()
  const camera = useThree((s) => s.camera)
  const { playerPosition } = usePlayerPosition()
  const cameraLookAtPosition = useGameStore((s) => s.cameraLookAtPosition)
  const overlay = useGameStore((s) => s.overlay)
  const speedRunStage = useGameStore((s) => s.speedRunStage)
  // The countdown is drawn over the live track at the normal gameplay camera.
  const isRaisedOverlay = overlay !== Overlay.NONE && overlay !== Overlay.SPEEDRUN_COUNTDOWN && overlay !== Overlay.MULTIPLAYER_COUNTDOWN && overlay !== Overlay.SPECTATING

  // The level design changed the far plane; keep the live camera in step with it.
  useLayoutEffect(() => {
    applyFarPlane(camera as PerspectiveCamera)
  }, [camera])

  const { input } = usePlayerInput()
  const easedLookX = useRef(0)

  useStageZoom(setZoom, isMobile ? CAMERA_ZOOM_FOR_STAGE_MOBILE : CAMERA_ZOOM_FOR_STAGE_DESKTOP)

  useFrame((_, deltaSeconds) => {
    const lookAt = cameraLookAtPosition ?? playerPosition.current
    // The race accelerates and brakes by itself, so racing input must not dolly the camera. The z
    // offsets stay for manual lobby travel, where up/down is real movement.
    const isRacing = speedRunStage === SpeedRunStage.RUNNING
    const backwardInput = isRacing ? 0 : Math.max(input.current.down - input.current.up, 0)
    const forwardInput = isRacing ? 0 : Math.max(input.current.up - input.current.down, 0)
    // Offset the camera along z from player input
    const inputZOffset =
      backwardInput * INPUT_DOWN_Z_OFFSET + forwardInput * INPUT_UP_Z_OFFSET
    // Ease the look-ahead so it drifts toward the steering direction.
    const steeringX = input.current.right - input.current.left
    easedLookX.current = easeLookAtX(
      easedLookX.current,
      steeringX * LOOK_AT_X_RANGE,
      deltaSeconds,
    )
    const lookAtX = lookAt[0] + easedLookX.current
    const backwardLookAtOffset =
      cameraLookAtPosition === null ? backwardInput * INPUT_DOWN_LOOK_AT_Z_OFFSET : 0

    // Ease toward the moving goal rather than snapping the camera onto it each frame
    setLookAt(
      playerPosition.current[0],
      position.y + (isRaisedOverlay ? OVERLAY_Y_OFFSET : 0),
      playerPosition.current[2] +
        position.z +
        inputZOffset +
        (isRaisedOverlay ? OVERLAY_Z_OFFSET : 0),
      lookAtX,
      LOOK_AT_HEIGHT,
      lookAt[2] + backwardLookAtOffset,
      true,
      INPUT_DOWN_Z_DAMPING,
      backwardInput,
    )
  })

  return null
}

const CylinderRaceCamera: FC<Props> = ({ isMobile, position }) => {
  const surface = useCourseSurface()
  const { playerPosition } = usePlayerPosition()
  const { input } = usePlayerInput()
  const overlay = useGameStore(s => s.overlay)
  const respawnTick = useGameStore(s => s.playerRespawnTick)
  const lookAtOverride = useGameStore(s => s.cameraLookAtPosition)
  const state = useRef({
    player: new Vector3(), course: new Vector3(), up: new Vector3(), right: new Vector3(),
    eye: new Vector3(), target: new Vector3(), matrix: new Matrix4(), rotation: new Quaternion(),
    zoom: 1.2, lookX: 0, respawnTick: -1,
  })
  const setZoom = useCallback((zoom: number) => { state.current.zoom = zoom }, [])
  useStageZoom(setZoom, isMobile ? CAMERA_ZOOM_FOR_STAGE_MOBILE : CAMERA_ZOOM_FOR_STAGE_DESKTOP)
  useFrame(({ camera }, delta) => {
    const frame = state.current
    frame.player.fromArray(playerPosition.current)
    worldToCourse(frame.player, surface, frame.course)
    surfaceFrame(frame.course.x, surface, frame.up, frame.right)
    const raised = overlay !== Overlay.NONE && overlay !== Overlay.SPEEDRUN_COUNTDOWN && overlay !== Overlay.MULTIPLAYER_COUNTDOWN && overlay !== Overlay.SPECTATING
    frame.eye.copy(frame.player).addScaledVector(frame.up, position.y + (raised ? OVERLAY_Y_OFFSET : 0))
    frame.eye.z += position.z + (raised ? OVERLAY_Z_OFFSET : 0)
    if (lookAtOverride) frame.target.fromArray(lookAtOverride)
    else frame.target.copy(frame.player)
    const steeringX = input.current.right - input.current.left
    frame.lookX = easeLookAtX(frame.lookX, steeringX * LOOK_AT_X_RANGE, delta)
    frame.target.addScaledVector(frame.up, LOOK_AT_HEIGHT)
      .addScaledVector(frame.right, frame.lookX)
    frame.matrix.lookAt(frame.eye, frame.target, frame.up)
    frame.rotation.setFromRotationMatrix(frame.matrix)
    const blend = frame.respawnTick !== respawnTick ? 1 : 1 - Math.exp(-8 * Math.min(delta, 1 / 15))
    camera.position.lerp(frame.eye, blend)
    camera.quaternion.slerp(frame.rotation, blend)
    camera.zoom += (frame.zoom - camera.zoom) * blend
    camera.far = CAMERA_FAR
    camera.updateProjectionMatrix()
    frame.respawnTick = respawnTick
  })
  return null
}

const Camera: FC<Props> = props => {
  const surface = useCourseSurface()
  const isSpectating = useGameStore(state => state.isSpectating)
  const wide = useRoomState(state => state.wideCamera)
  if (isSpectating) return <CylinderRaceCamera {...props} position={wide ? { y: props.position.y * 1.7, z: props.position.z * 1.7 } : props.position} />
  return surface.topology === 'cylinder' ? <CylinderRaceCamera {...props} /> : <FlatCamera {...props} />
}

export default Camera
