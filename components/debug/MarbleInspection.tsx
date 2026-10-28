'use client'

import { Html, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Leva, useControls } from 'leva'
import {
  type FC,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three/addons/controls/OrbitControls.js'

import { uniform } from 'three/tsl'
import { useLocalNodes } from '@react-three/tsl'
import { createMarbleNodes } from '@/components/player/marble/createMarbleNodes'
import { FLAT_SURFACE } from '@/utils/platform/courseSurface'

import { SCENE_CONFIGS, SceneQuality } from '@/components/PerformanceProvider'
import type { GalaxyQuality } from '@/components/player/marble/galaxySettings'

import WebGPUCanvas from '@/components/WebGPUCanvas'
import { GalaxyMarble } from '@/components/player/marble/GalaxyMarble'
import { GALAXY_DEFAULTS, GALAXY_SAMPLE_COUNT } from '@/components/player/marble/galaxySettings'
import { PLAYER_BASE_COLOURS } from '@/components/palette'
import { PLAYER_RADIUS } from '@/utils/player'

const RENDERER_PROPS = { trackTimestamp: true }

const LegacyPreview: FC<{ time: RefObject<number>; paletteIndex: number }> = ({
  time,
  paletteIndex,
}) => {
  const uTime = useMemo(() => uniform(0), [])
  const nodes = useLocalNodes(
    () =>
      createMarbleNodes(
        {
          uTime,
          uSpeed: uniform(0),
          uConfirmingProgress: uniform(0),
          uPaletteIndex: uniform(0, 'int'),
          uConfirmingPaletteIndex: uniform(-1, 'int'),
        },
        {
          surface: FLAT_SURFACE,
          colour: PLAYER_BASE_COLOURS[paletteIndex],
          isFlat: false,
          enableVeins: true,
        },
      ),
    [uTime, paletteIndex],
  )
  useFrame(() => {
    // eslint-disable-next-line react-hooks/immutability
    uTime.value = time.current
  })
  return (
    <mesh>
      <sphereGeometry args={[PLAYER_RADIUS, 64, 48]} />
      <meshBasicNodeMaterial
        colorNode={nodes.colorNode}
        opacityNode={nodes.opacityNode}
        transparent
      />
    </mesh>
  )
}

const Preview: FC<{ onCopy: (message: string) => void }> = ({ onCopy }) => {
  const time = useRef(2.5)
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((state) => state.camera)
  const renderer = useThree((state) => state.renderer)
  const [appearance, setAppearance] = useControls('Appearance', () => ({
    paletteIndex: {
      label: 'Player colour',
      value: GALAXY_DEFAULTS.paletteIndex,
      options: Object.fromEntries(PLAYER_BASE_COLOURS.map((colour, index) => [colour, index])),
    },
    density: { value: GALAXY_DEFAULTS.density, min: 0, max: 6 },
    cloudScale: { value: GALAXY_DEFAULTS.cloudScale, min: 0.5, max: 8 },
    driftSpeed: { value: GALAXY_DEFAULTS.driftSpeed, min: 0, max: 0.3 },
    starBrightness: { value: GALAXY_DEFAULTS.starBrightness, min: 0, max: 4 },
    reflection: { value: GALAXY_DEFAULTS.reflection, min: 0, max: 1.5 },
    sharpness: { value: GALAXY_DEFAULTS.sharpness, min: 10, max: 250 },
    refraction: { value: GALAXY_DEFAULTS.refraction, min: 1, max: 1.6 },
  }))
  const [inspection, setInspection] = useControls('Inspection', () => ({
    glass: true,
    clouds: true,
    stars: true,
    samples: {
      label: 'Samples (override)',
      value: String(GALAXY_SAMPLE_COUNT),
      options: ['3', '4', '6', '12'],
    },
    opacity: { value: 1, min: 0, max: 1 },
    paused: false,
    seconds: { value: 2.5, min: 0, max: 120, step: 0.05 },
    rotation: { value: 0, min: -180, max: 180 },
  }))
  const [scene, setScene] = useControls('Scene', () => ({
    quality: { value: SceneQuality.HIGH, options: Object.values(SceneQuality) },
    model: { value: 'Galaxy', options: ['Galaxy', 'Previous marble'] },
    backdrop: { value: 'Bright track', options: ['Bright track', 'Dark studio'] },
    framing: { value: 'Close-up', options: ['Close-up', 'Gameplay scale'] },
    lightAzimuth: { value: -180, min: -180, max: 180 },
    lightHeight: { value: 0.25, min: 0.1, max: 3 },
  }))
  const marbleQuality = SCENE_CONFIGS[scene.quality].marble
  useLayoutEffect(() => {
    setInspection({ samples: String(marbleQuality.samples) })
  }, [marbleQuality, setInspection])
  useLayoutEffect(() => {
    time.current = inspection.seconds
  }, [inspection.seconds])
  useFrame((_, delta) => {
    if (!inspection.paused) time.current += delta
  })
  const resetView = () => {
    const distance = scene.framing === 'Close-up' ? 2.2 : 6
    camera.position.set(distance * 0.45, distance * 0.35, distance)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }
  useLayoutEffect(() => {
    const distance = scene.framing === 'Close-up' ? 2.2 : 6
    camera.position.set(distance * 0.45, distance * 0.35, distance)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }, [camera, scene.framing])
  const resetSettings = () => {
    const { glass, clouds, stars, ...appearanceDefaults } = GALAXY_DEFAULTS
    setAppearance(appearanceDefaults)
    setInspection({
      glass,
      clouds,
      stars,
      samples: String(GALAXY_SAMPLE_COUNT),
      opacity: 1,
      paused: false,
      seconds: 2.5,
      rotation: 0,
    })
    setScene({
      quality: SceneQuality.HIGH,
      model: 'Galaxy',
      backdrop: 'Bright track',
      framing: 'Close-up',
      lightAzimuth: -180,
      lightHeight: 0.25,
    })
    time.current = 2.5
    camera.position.set(2.2 * 0.45, 2.2 * 0.35, 2.2)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }
  const copySettings = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          { ...appearance, ...inspection, seconds: time.current, ...scene, seed: 129, dpr: 1 },
          null,
          2,
        ),
      )
      onCopy('Settings copied')
    } catch {
      onCopy('Clipboard unavailable — allow clipboard access and try again.')
    }
  }
  useEffect(() => {
    let cancelled = false
    let busy = false
    const readings: number[] = []
    onCopy('GPU timing: warming up…')
    const started = performance.now()
    const timer = setInterval(async () => {
      if (busy || performance.now() - started < 2000) return
      if (performance.now() - started > 30000) {
        onCopy('GPU timing unavailable — no completed samples')
        clearInterval(timer)
        return
      }
      if (!renderer.hasFeature('timestamp-query')) {
        onCopy('GPU timing unavailable on this browser')
        clearInterval(timer)
        return
      }
      busy = true
      try {
        const milliseconds = await renderer.resolveTimestampsAsync()
        if (cancelled) return
        if (milliseconds !== undefined && milliseconds > 0) readings.push(milliseconds)
        if (readings.length >= 20) {
          readings.sort((a, b) => a - b)
          onCopy(
            `Last scene GPU median: ${((readings[9] + readings[10]) / 2).toFixed(3)} ms · 20 samples`,
          )
          clearInterval(timer)
        }
      } catch {
        if (!cancelled) onCopy('GPU timing unavailable')
        clearInterval(timer)
      } finally {
        busy = false
      }
    }, 250)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [
    renderer,
    scene.model,
    scene.framing,
    scene.backdrop,
    inspection.samples,
    scene.quality,
    onCopy,
  ])
  const bright = scene.backdrop === 'Bright track'
  const azimuth = (scene.lightAzimuth * Math.PI) / 180
  return (
    <>
      <color attach="background" args={[bright ? '#bab4b0' : '#090c16']} />
      {scene.model === 'Previous marble' ? (
        <LegacyPreview time={time} paletteIndex={appearance.paletteIndex} />
      ) : (
        <GalaxyMarble
          radius={PLAYER_RADIUS}
          animationTime={time}
          settings={{
            ...appearance,
            glass: inspection.glass,
            clouds: inspection.clouds,
            stars: inspection.stars,
          }}
          opacity={inspection.opacity}
          {...marbleQuality}
          samples={Number(inspection.samples) as GalaxyQuality['samples']}
          rotation={(inspection.rotation * Math.PI) / 180}
          lightDirection={[Math.sin(azimuth), scene.lightHeight, Math.cos(azimuth)]}
        />
      )}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -PLAYER_RADIUS - 0.02, 0]}
        visible={bright}
      >
        <planeGeometry args={[40, 40]} />
        <meshBasicNodeMaterial color="#b5aba1" />
      </mesh>
      <gridHelper
        args={[40, 40, '#8f7b90', '#928b85']}
        position={[0, -PLAYER_RADIUS - 0.019, 0]}
        visible={bright}
      />
      <OrbitControls
        ref={controls}
        makeDefault
        minDistance={0.7}
        maxDistance={12}
        maxPolarAngle={Math.PI * 0.49}
      />
      <LabActions onResetView={resetView} onResetSettings={resetSettings} onCopy={copySettings} />
    </>
  )
}

// The actions live in the DOM; their handlers stay alongside the scene-owned controls.
const LabActions: FC<{
  onResetView: () => void
  onResetSettings: () => void
  onCopy: () => void
}> = ({ onResetView, onResetSettings, onCopy }) => (
  <Html fullscreen style={{ pointerEvents: 'none' }}>
    <div className="pointer-events-auto absolute bottom-5 left-5 flex flex-wrap gap-2 text-sm text-white">
      <button className="rounded bg-slate-900 px-3 py-2" onClick={onResetView}>
        Reset view
      </button>
      <button className="rounded bg-slate-900 px-3 py-2" onClick={onResetSettings}>
        Reset settings
      </button>
      <button className="rounded bg-slate-900 px-3 py-2" onClick={onCopy}>
        Copy tuning JSON
      </button>
    </div>
  </Html>
)

const MarbleInspection: FC = () => {
  const [status, setStatus] = useState('')
  return (
    <main className="h-dvh w-full">
      <div className="pointer-events-none fixed left-5 top-5 z-10 max-w-64 rounded bg-slate-950/85 p-4 text-sm text-white">
        <h1 className="font-semibold">Glass nebula marble lab</h1>
        <p className="mt-1 text-slate-300">
          Drag to orbit · scroll to zoom
          <br />
          Fixed seed 129 · DPR 1 · shared gameplay material
        </p>
        <p role="status" className="mt-2">
          {status}
        </p>
      </div>
      <Leva theme={{ sizes: { rootWidth: '310px', controlWidth: '155px' } }} />
      <WebGPUCanvas
        rendererProps={RENDERER_PROPS}
        camera={{ position: [1, 0.8, 2.2], fov: 40, near: 0.01, far: 100 }}
        dpr={1}
      >
        <Preview onCopy={setStatus} />
      </WebGPUCanvas>
    </main>
  )
}
export default MarbleInspection
