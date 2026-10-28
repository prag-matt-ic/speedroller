'use client'

import { type WebGPURootState } from '@react-three/fiber'
import { type FC, type PropsWithChildren, useCallback } from 'react'
import type { Vector3Tuple } from 'three'

import WebGPUCanvas from '@/components/WebGPUCanvas'
import { Podium } from '@/components/podium/Podium'
import PodiumFireworksParticles from '@/components/podium/PodiumFireworksParticles'
import type { PodiumWinners } from '@/components/podium/model'
import { CAMERA_FOV } from '@/utils/sceneDistances'

/** Landscape framing from the rugbet podium, kept for a straight visual comparison. */
const PODIUM_CAMERA_POSITION: Vector3Tuple = [0, 2, 9]
const PODIUM_CAMERA_TARGET: Vector3Tuple = [0, 0, 0]
const PODIUM_CAMERA_NEAR = 0.01
const PODIUM_CAMERA_FAR = 50

const BACKGROUND_COLOUR = '#06040b'

type Props = PropsWithChildren<{
  winners: PodiumWinners
}>

/**
 * Standalone podium canvas for the dev page. The scene contents are split into `Podium` and
 * `PodiumFireworksParticles` so the same pair can be mounted inside the main game scene later.
 *
 * The FOV comes from the shared race constant; the framing distance and clipping planes are
 * podium-specific.
 */
const PodiumScene: FC<Props> = ({ winners, children }) => {
  const handleCreated = useCallback((state: WebGPURootState) => {
    state.camera.lookAt(...PODIUM_CAMERA_TARGET)
  }, [])

  return (
    <WebGPUCanvas
      className="fixed! inset-0! h-dvh! w-full"
      camera={{
        position: PODIUM_CAMERA_POSITION,
        fov: CAMERA_FOV,
        near: PODIUM_CAMERA_NEAR,
        far: PODIUM_CAMERA_FAR,
      }}
      onCreated={handleCreated}>
      <color attach="background" args={[BACKGROUND_COLOUR]} />
      <ambientLight intensity={1} />
      <Podium winners={winners} />
      <PodiumFireworksParticles />
      {children}
    </WebGPUCanvas>
  )
}

export default PodiumScene
