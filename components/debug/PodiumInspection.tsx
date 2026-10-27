'use client'

import { OrbitControls } from '@react-three/drei'

import PodiumScene from '@/components/podium/PodiumScene'
import { MOCK_PODIUM_WINNERS } from '@/components/podium/mockPodiumWinners'
import { CAMERA_FOV } from '@/utils/sceneDistances'

const PodiumInspection = () => (
  <main className="h-dvh w-full">
    <div className="pointer-events-none fixed top-5 left-5 z-10 max-w-64 rounded bg-slate-950/85 p-4 text-sm text-white">
      <h1 className="font-semibold">Podium lab</h1>
      <p className="mt-1 text-slate-300">
        Mock top three · drag to orbit, scroll to zoom
        <br />
        Camera FOV {CAMERA_FOV} (matches the race scene)
      </p>
    </div>

    <PodiumScene winners={MOCK_PODIUM_WINNERS}>
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={5}
        maxDistance={30}
        target={[0, 0, 0]}
      />
    </PodiumScene>
  </main>
)

export default PodiumInspection
