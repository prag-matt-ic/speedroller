'use client'

import { useFrame } from '@react-three/fiber/webgpu'
import { type FC, useCallback, useEffect, useRef } from 'react'

import { Stage, useGameStore } from '@/components/GameProvider'
import useCameraControls from '@/hooks/cameraControls/useCameraControls'
import { usePlayerInput } from '@/hooks/usePlayerInput'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'
import useStage from '@/hooks/useStage'
import { Overlay } from '@/stores/types'

type StageCameraPosition = {
  y: number
  z: number
}

export const CAMERA_POSITION_DESKTOP: StageCameraPosition = { y: 4.5, z: 8 }
export const CAMERA_POSITION_MOBILE: StageCameraPosition = { y: 5.5, z: 10 }

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
const INPUT_DOWN_Z_OFFSET = 5
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

const Camera: FC<Props> = ({ isMobile, position }) => {
  const { setLookAt, setZoom } = useCameraControls()
  const { playerPosition } = usePlayerPosition()
  const cameraLookAtPosition = useGameStore((s) => s.cameraLookAtPosition)
  const isOverlayOpen = useGameStore((s) => s.overlay !== Overlay.NONE)

  const { input } = usePlayerInput()

  useStageZoom(setZoom, isMobile ? CAMERA_ZOOM_FOR_STAGE_MOBILE : CAMERA_ZOOM_FOR_STAGE_DESKTOP)

  useFrame(() => {
    const lookAt = cameraLookAtPosition ?? playerPosition.current
    // Offset the camera along z from player input
    const inputZOffset =
      input.current.down * INPUT_DOWN_Z_OFFSET + input.current.up * INPUT_UP_Z_OFFSET
    // Look left or right based on player input
    const lookAtX = lookAt[0] + (input.current.right - input.current.left) * LOOK_AT_X_RANGE

    // Ease toward the moving goal rather than snapping the camera onto it each frame
    setLookAt(
      playerPosition.current[0],
      position.y + (isOverlayOpen ? OVERLAY_Y_OFFSET : 0),
      playerPosition.current[2] +
        position.z +
        inputZOffset +
        (isOverlayOpen ? OVERLAY_Z_OFFSET : 0),
      lookAtX,
      LOOK_AT_HEIGHT,
      lookAt[2],
      true,
    )
  })

  return null
}

export default Camera
