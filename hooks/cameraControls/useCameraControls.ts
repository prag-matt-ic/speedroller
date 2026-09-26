'use client'

import { useFrame, useThree } from '@react-three/fiber/webgpu'
import { useCallback, useRef } from 'react'
import { Vector3 } from 'three/webgpu'

const MIN_TRANSITION_SPEED = 1.5
const MAX_TRANSITION_SPEED = 4.8
const TRANSITION_DISTANCE_SCALE = 0.2
const ZOOM_TRANSITION_SPEED = 4
const DEFAULT_ZOOM = 1
/** Below this residual the remaining change is imperceptible, so the lens snaps to the goal. */
const ZOOM_SNAP_THRESHOLD = 0.001

/** Cameras with a lens. Both perspective and orthographic cameras expose `zoom`. */
type ZoomCamera = {
  zoom: number
  updateProjectionMatrix: () => void
}

type CameraState = {
  currentPosition: Vector3
  goalPosition: Vector3
  currentTarget: Vector3
  goalTarget: Vector3
  pointerOffset: Vector3
  composedTarget: Vector3
  currentZoom: number
  goalZoom: number
  isPointerEnabled: boolean
  /** Per-transition damping override for the z axis, blended toward it by zDampingBlend. */
  zDampingOverride: number | undefined
  zDampingBlend: number
}

const supportsZoom = (camera: unknown): camera is ZoomCamera =>
  typeof (camera as Partial<ZoomCamera>).zoom === 'number'

/**
 * Writes the eased zoom to the camera. The projection rebuild, and its matrix inverse, only run
 * while the lens is still moving. The write sits outside the hook body because assigning to a
 * value returned by `useThree` is rejected by the React Compiler lint rules this project runs.
 */
const applyZoom = (camera: ZoomCamera, zoom: number) => {
  if (camera.zoom === zoom) return

  camera.zoom = zoom
  camera.updateProjectionMatrix()
}

type Props = {
  pointerLookAt?: {
    xRange: number
    yRange: number
    speed: number
  }
}

const useCameraControls = ({ pointerLookAt }: Props = {}) => {
  const camera = useThree((s) => s.camera)
  const cameraStateRef = useRef<CameraState | null>(null)
  if (cameraStateRef.current == null) {
    const initialZoom = supportsZoom(camera) ? camera.zoom : DEFAULT_ZOOM
    cameraStateRef.current = {
      currentPosition: camera.position.clone(),
      goalPosition: camera.position.clone(),
      currentTarget: new Vector3(),
      goalTarget: new Vector3(),
      pointerOffset: new Vector3(),
      composedTarget: new Vector3(),
      currentZoom: initialZoom,
      goalZoom: initialZoom,
      isPointerEnabled: true,
      zDampingOverride: undefined,
      zDampingBlend: 1,
    }
  }

  const setLookAt = useCallback(
    (
      positionX: number,
      positionY: number,
      positionZ: number,
      targetX: number,
      targetY: number,
      targetZ: number,
      transition = false,
      zDampingOverride?: number,
      zDampingBlend = 1,
    ) => {
      const cameraState = cameraStateRef.current!
      cameraState.goalPosition.set(positionX, positionY, positionZ)
      cameraState.goalTarget.set(targetX, targetY, targetZ)
      // The frame loop reads these back; with no override the z axis eases like the others.
      cameraState.zDampingOverride = zDampingOverride
      cameraState.zDampingBlend = zDampingBlend
      if (transition) return
      cameraState.currentPosition.copy(cameraState.goalPosition)
      cameraState.currentTarget.copy(cameraState.goalTarget)
    },
    [],
  )

  const setZoom = useCallback((zoom: number, transition = false) => {
    const cameraState = cameraStateRef.current!
    cameraState.goalZoom = zoom
    if (transition) return
    cameraState.currentZoom = zoom
  }, [])

  const setIsPointerEnabled = useCallback((enabled: boolean) => {
    const cameraState = cameraStateRef.current!
    cameraState.isPointerEnabled = enabled
  }, [])

  const getDistanceToTarget = useCallback(() => {
    const cameraState = cameraStateRef.current!
    return cameraState.currentPosition.distanceTo(cameraState.currentTarget)
  }, [])

  const getZoom = useCallback(() => {
    const cameraState = cameraStateRef.current!
    return cameraState.currentZoom
  }, [])

  useFrame(({ pointer }, delta) => {
    const cameraState = cameraStateRef.current!
    const transitionDistance = Math.max(
      cameraState.currentPosition.distanceTo(cameraState.goalPosition),
      cameraState.currentTarget.distanceTo(cameraState.goalTarget),
    )
    const transitionSpeed = Math.min(
      MAX_TRANSITION_SPEED,
      Math.max(MIN_TRANSITION_SPEED, transitionDistance * TRANSITION_DISTANCE_SCALE),
    )
    const transitionAlpha = 1 - Math.exp(-transitionSpeed * delta)
    const { zDampingOverride, zDampingBlend } = cameraState
    if (zDampingOverride === undefined || zDampingBlend <= 0) {
      cameraState.currentPosition.lerp(cameraState.goalPosition, transitionAlpha)
      cameraState.currentTarget.lerp(cameraState.goalTarget, transitionAlpha)
    } else {
      const zDamping =
        transitionSpeed + (zDampingOverride - transitionSpeed) * zDampingBlend
      const zTransitionAlpha = 1 - Math.exp(-zDamping * delta)

      cameraState.currentPosition.x +=
        (cameraState.goalPosition.x - cameraState.currentPosition.x) * transitionAlpha
      cameraState.currentPosition.y +=
        (cameraState.goalPosition.y - cameraState.currentPosition.y) * transitionAlpha
      cameraState.currentPosition.z +=
        (cameraState.goalPosition.z - cameraState.currentPosition.z) * zTransitionAlpha
      cameraState.currentTarget.x +=
        (cameraState.goalTarget.x - cameraState.currentTarget.x) * transitionAlpha
      cameraState.currentTarget.y +=
        (cameraState.goalTarget.y - cameraState.currentTarget.y) * transitionAlpha
      cameraState.currentTarget.z +=
        (cameraState.goalTarget.z - cameraState.currentTarget.z) * zTransitionAlpha
    }

    if (pointerLookAt) {
      const pointerAlpha = 1 - Math.exp(-pointerLookAt.speed * delta)
      const pointerX = cameraState.isPointerEnabled ? pointer.x * pointerLookAt.xRange : 0
      const pointerY = cameraState.isPointerEnabled ? pointer.y * pointerLookAt.yRange : 0
      cameraState.pointerOffset.set(
        cameraState.pointerOffset.x + (pointerX - cameraState.pointerOffset.x) * pointerAlpha,
        cameraState.pointerOffset.y + (pointerY - cameraState.pointerOffset.y) * pointerAlpha,
        0,
      )
    } else {
      cameraState.pointerOffset.set(0, 0, 0)
    }

    camera.position.copy(cameraState.currentPosition)
    cameraState.composedTarget.copy(cameraState.currentTarget).add(cameraState.pointerOffset)

    camera.lookAt(cameraState.composedTarget)

    if (!supportsZoom(camera)) return

    // The lens keeps its own fixed time constant: transition distance is measured in world units
    // and would saturate on a zoom delta expressed as a bare multiplier.
    cameraState.currentZoom +=
      (cameraState.goalZoom - cameraState.currentZoom) *
      (1 - Math.exp(-ZOOM_TRANSITION_SPEED * delta))

    if (Math.abs(cameraState.currentZoom - cameraState.goalZoom) < ZOOM_SNAP_THRESHOLD) {
      cameraState.currentZoom = cameraState.goalZoom
    }

    applyZoom(camera, cameraState.currentZoom)
  }, -1)

  return { setLookAt, setZoom, setIsPointerEnabled, getDistanceToTarget, getZoom }
}

export default useCameraControls
