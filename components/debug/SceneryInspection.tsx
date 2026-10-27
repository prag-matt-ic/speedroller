'use client'

import { Html, OrbitControls } from '@react-three/drei'

import WebGPUCanvas from '@/components/WebGPUCanvas'
import { TILE_AMBIENT_LIGHT } from '@/components/lighting/lightNodes'
import StoneBlocks from '@/components/platform/scenery/StoneBlocks'
import { FLAT_SURFACE } from '@/utils/platform/courseSurface'
import { createSceneryPreviewBlocks, SCENERY_PREVIEW_LABELS } from '@/utils/platform/sceneryPreview'

const blocks = createSceneryPreviewBlocks()

export default function SceneryInspection() {
  return <main className="h-dvh w-full">
    <div className="fixed left-4 top-4 z-10 rounded bg-black/70 p-3 text-sm text-white">
      Stone structures · drag to orbit, scroll to zoom<br />
      Shared block mesh · baked shading · gameplay ambient light
    </div>
    <WebGPUCanvas camera={{ position: [65, 48, 105], far: 500, fov: 50 }} dpr={1}>
      <color attach="background" args={['#c8c4bd']} />
      <ambientLight color={TILE_AMBIENT_LIGHT.color} intensity={TILE_AMBIENT_LIGHT.intensity} />
      <StoneBlocks blocks={blocks} surface={FLAT_SURFACE} fadeEnabled={false} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[5, -0.02, 0]}>
        <planeGeometry args={[150, 60]} />
        <meshLambertNodeMaterial color="#b7b2a8" />
      </mesh>
      {SCENERY_PREVIEW_LABELS.map(({ name, x }) => <Html key={name} position={[x, 0, 8]} center>
        <div className="pointer-events-none whitespace-nowrap rounded bg-black/70 px-3 py-1 text-sm text-white">{name}</div>
      </Html>)}
      <OrbitControls target={[5, 12, 0]} minDistance={10} maxDistance={220} maxPolarAngle={Math.PI / 2} />
    </WebGPUCanvas>
  </main>
}
