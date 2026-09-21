'use client'

import { useGSAP } from '@gsap/react'
import { PerformanceMonitor, Stats } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import gsap from 'gsap'
import { type FC, Suspense, useMemo } from 'react'

import Camera, { CAMERA_POSITION_DESKTOP, CAMERA_POSITION_MOBILE } from '@/components/Camera'
import GameUniforms from '@/components/GameUniforms'
import InputSmoother from '@/components/InputSmoother'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import WebGPUCanvas from '@/components/WebGPUCanvas'
import Backdrop from '@/components/backdrop/Backdrop'
import OutOfBounds from '@/components/platform/OutOfBounds'
import Platform from '@/components/platform/Platform'
import Player from '@/components/player/Player'
import PostProcessing from '@/components/postProcessing/Effects'

gsap.registerPlugin(useGSAP)

type Props = {
  isDebug: boolean
  isMobile: boolean
}

const Game: FC<Props> = ({ isDebug, isMobile }) => {
  const maxDPR = usePerformanceStore((s) => s.maxDPR)
  const simFps = usePerformanceStore((s) => s.simFps)
  const onPerformanceChange = usePerformanceStore((s) => s.onPerformanceChange)
  const isPhysicsDebug = usePerformanceStore((s) => s.isPhysicsDebug)
  const physicsTimeStep = simFps === 0 ? 'vary' : 1 / simFps

  const cameraPosition = isMobile ? CAMERA_POSITION_MOBILE : CAMERA_POSITION_DESKTOP

  // The WebGPU renderer takes its options through `rendererProps`; these carry over the WebGL
  // `gl` settings this canvas used previously (antialias off on mobile, low-power in dev).
  const rendererProps = useMemo(
    () => ({
      antialias: !isMobile,
      powerPreference:
        process.env.NODE_ENV === 'development'
          ? ('low-power' as const)
          : ('high-performance' as const),
    }),
    [isMobile],
  )

  const dpr = useMemo<number>(() => {
    if (typeof window === 'undefined') return 1
    if (!!maxDPR) return Math.min(window.devicePixelRatio ?? 1, maxDPR)
    return window.devicePixelRatio ?? 1
  }, [maxDPR])

  return (
    <WebGPUCanvas
      className="fixed! inset-0! h-dvh! w-full"
      dpr={dpr}
      rendererProps={rendererProps}
      camera={{
        position: [0, cameraPosition.y, cameraPosition.z],
        far: process.env.NODE_ENV === 'development' ? 100 : 40,
        fov: 65,
      }}>
      <PerformanceMonitor
        // Create an upper/lower FPS band relative to device refresh rate
        // If avg fps > upper => incline (step quality up); if < lower => decline (step down)
        bounds={(refreshrate) => (refreshrate > 90 ? [50, 80] : [50, 60])}
        onIncline={() => onPerformanceChange(true)}
        onDecline={() => onPerformanceChange(false)}
        flipflops={2}>
        {/* <ambientLight intensity={1.0} /> */}

        <Suspense>
          <GameUniforms />
          <InputSmoother />
          {/* <OrbitControls /> */}
          <Camera isMobile={isMobile} position={cameraPosition} />
          {isDebug && <Stats />}
          <Backdrop />
          <Physics debug={isPhysicsDebug} timeStep={physicsTimeStep}>
            <OutOfBounds />
            <Platform />
            <Player />
          </Physics>
          <PostProcessing />
        </Suspense>
      </PerformanceMonitor>
    </WebGPUCanvas>
  )
}

export default Game

// ------------------
// Ideas
// Glass walls with text that shatter as you roll through them
