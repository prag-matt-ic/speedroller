'use client'

import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useFrame } from '@react-three/fiber/webgpu'
// import { useControls } from 'leva'
import { type FC, useCallback, useEffect, useRef } from 'react'

import { Stage, useGameStore } from '@/components/GameProvider'
import { usePlayerInput } from '@/hooks/usePlayerInput'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'
import useStage from '@/hooks/useStage'
import { Overlay } from '@/stores/types'

const { ACTION } = CameraControlsImpl

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

type Props = {
  isMobile: boolean
  position: StageCameraPosition
}

const Camera: FC<Props> = ({ isMobile, position }) => {
  const cameraControls = useRef<CameraControls>(null)
  const { playerPosition } = usePlayerPosition()
  const cameraLookAtPosition = useGameStore((s) => s.cameraLookAtPosition)
  const isConfirmingCollectible = useGameStore((s) => !!s.confirmingCollectible)

  const isOverlayOpen = useGameStore((s) => s.overlay !== Overlay.NONE)
  const overlayZOffset = isOverlayOpen ? 5.0 : 0
  const overlayYOffset = isOverlayOpen ? 5.0 : 0

  const cameraZoomForStage = isMobile
    ? CAMERA_ZOOM_FOR_STAGE_MOBILE
    : CAMERA_ZOOM_FOR_STAGE_DESKTOP

  const currentZoom = useRef<number>(cameraZoomForStage[Stage.HOME])

  const { input } = usePlayerInput()

  // useControls(() => ({
  //   cameraZoom: {
  //     value: currentZoom.current,
  //     min: 0,
  //     max: 2,
  //     onChange: (value: number) => {
  //       currentZoom.current = value
  //       if (!cameraControls.current) return
  //       cameraControls.current.zoomTo(value, false)
  //     },
  //   },
  // }))

  const handleStageChange = useCallback(
    (nextStage: Stage) => {
      if (!cameraControls.current) return
      const zoom = cameraZoomForStage[nextStage]
      currentZoom.current = zoom
      cameraControls.current.zoomTo(zoom, true)
    },
    [cameraZoomForStage],
  )

  useStage(handleStageChange)

  useEffect(() => {
    if (!cameraControls.current) return
    if (isConfirmingCollectible) {
      cameraControls.current.zoomTo(currentZoom.current + 0.3, true)
    } else {
      cameraControls.current.zoomTo(currentZoom.current, true)
    }
  }, [isConfirmingCollectible])

  useFrame(() => {
    if (!cameraControls.current) return

    const lookAt = cameraLookAtPosition ?? playerPosition.current
    // Adjust the position based on player input
    const positionZOffset = input.current.down * 5.0 - input.current.up * -3.0
    // Look left or right based on player input
    const lookAtX = lookAt[0] + (input.current.right - input.current.left) * 1.5

    cameraControls.current.setLookAt(
      playerPosition.current[0],
      position.y + overlayYOffset,
      position.z + positionZOffset + overlayZOffset,
      lookAtX,
      3,
      lookAt[2],
      true,
    )
  })

  return (
    <CameraControls
      ref={cameraControls}
      makeDefault={true}
      mouseButtons={{
        left: ACTION.NONE,
        middle: ACTION.NONE,
        right: ACTION.NONE,
        wheel: ACTION.NONE,
      }}
      touches={{
        one: ACTION.NONE,
        two: ACTION.NONE,
        three: ACTION.NONE,
      }}
    />
  )
}

export default Camera
