'use client'

import { KinematicCharacterController } from '@dimforge/rapier3d-compat'
import { useRapier } from '@react-three/rapier'
import { useLayoutEffect, useRef } from 'react'

import { PLAYER_RADIUS } from '@/utils/player'

function usePlayerController() {
  const { world } = useRapier()
  const controllerRef = useRef<KinematicCharacterController | null>(null)

  useLayoutEffect(() => {
    if (!world) return
    if (!!controllerRef.current) return // already created

    function setupController() {
      const controller = world.createCharacterController(0.01)

      // Enable auto-stepping over small obstacles (like terrain gaps)
      controller.enableAutostep(0.5, PLAYER_RADIUS / 2, true)

      // Enable snap-to-ground to stick to terrain surfaces
      controller.enableSnapToGround(0.5)

      // Set up vector (positive Y axis)
      controller.setUp({ x: 0.0, y: 1.0, z: 0.0 })

      // Configure slope handling
      controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180) // 45 degrees max climb
      controller.setMinSlopeSlideAngle((30 * Math.PI) / 180) // 30 degrees min slide

      // Allow interaction with dynamic bodies
      controller.setApplyImpulsesToDynamicBodies(true)

      controllerRef.current = controller
    }

    setupController()

    return () => {
      if (!!controllerRef.current) {
        world.removeCharacterController(controllerRef.current)
        controllerRef.current = null
      }
    }
  }, [world])

  return { controllerRef }
}

export default usePlayerController
