'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { type FC, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { PerspectiveCamera } from 'three'

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
const LOOK_AT_X_RANGE = 1.5
const INPUT_UP_Z_OFFSET = 3
const INPUT_DOWN_Z_OFFSET = 7
const INPUT_DOWN_LOOK_AT_Z_OFFSET = 2
const INPUT_DOWN_Z_DAMPING = 8
const OVERLAY_Y_OFFSET = 5
const OVERLAY_Z_OFFSET = 5
const COLLECTIBLE_ZOOM_OFFSET = 0.3

type SetZoom = (zoom: number, transition?: boolean) => void

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

const Camera: FC<Props> = ({ isMobile, position }) => {
  const { setLookAt, setZoom } = useCameraControls()
  const camera = useThree((s) => s.camera)
  const { playerPosition } = usePlayerPosition()
  const cameraLookAtPosition = useGameStore((s) => s.cameraLookAtPosition)
  const overlay = useGameStore((s) => s.overlay)
  const speedRunStage = useGameStore((s) => s.speedRunStage)
  // The countdown is drawn over the live track at the normal gameplay camera.
  const isRaisedOverlay = overlay !== Overlay.NONE && overlay !== Overlay.SPEEDRUN_COUNTDOWN

  // The level design changed the far plane; keep the live camera in step with it.
  useLayoutEffect(() => {
    applyFarPlane(camera as PerspectiveCamera)
  }, [camera])

  const { input } = usePlayerInput()

  useStageZoom(setZoom, isMobile ? CAMERA_ZOOM_FOR_STAGE_MOBILE : CAMERA_ZOOM_FOR_STAGE_DESKTOP)

  useFrame(() => {
    const lookAt = cameraLookAtPosition ?? playerPosition.current
    // The race accelerates and brakes by itself, so racing input must not dolly the camera. The z
    // offsets stay for manual lobby travel, where up/down is real movement.
    const isRacing = speedRunStage === SpeedRunStage.RUNNING
    const backwardInput = isRacing ? 0 : Math.max(input.current.down - input.current.up, 0)
    const forwardInput = isRacing ? 0 : Math.max(input.current.up - input.current.down, 0)
    // Offset the camera along z from player input
    const inputZOffset =
      backwardInput * INPUT_DOWN_Z_OFFSET + forwardInput * INPUT_UP_Z_OFFSET
    // Look left or right based on player input
    const lookAtX = lookAt[0] + (input.current.right - input.current.left) * LOOK_AT_X_RANGE
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

export default Camera
