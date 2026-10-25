'use client'

import { OrbitControls } from '@react-three/drei'
import { useLayoutEffect, useRef } from 'react'
import { InstancedMesh, Matrix4 } from 'three'

import WebGPUCanvas from '@/components/WebGPUCanvas'
import Pillars from '@/components/platform/scenery/Pillars'
import { PLATFORM_DATA } from '@/resources/rowsData'
import { GameMode } from '@/stores/types'
import { FLAT_SURFACE } from '@/utils/platform/courseSurface'
import { colToX, RAISED_Y, rowToWorldZ, TILE_SIZE, TILE_THICKNESS, TILE_SURFACE_Y } from '@/utils/tiles'

const rows = PLATFORM_DATA.modes[GameMode.SPEEDRUN].rows
const tiles = rows.flatMap((row, rowIndex) => rowIndex < 612 || rowIndex > 812 ? [] :
  row.isRaised.flatMap((raised, column) => raised ? [{ rowIndex, column, highlighted: row.isHighlighted?.[column] }] : []))
const plain = tiles.filter(tile => !tile.highlighted)
const bright = tiles.filter(tile => tile.highlighted)
const rings = rows.flatMap((row, index) => index < 632 || index >= 792 ? [] :
  (row.rings ?? []).flatMap((hasRing, column) => hasRing ? [[colToX(column), 0, rowToWorldZ(index)]] : []))

function Floor({ cells, color }: { cells: typeof tiles; color: string }) {
  const meshRef = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    cells.forEach((tile, index) => {
      matrix.makeTranslation(colToX(tile.column), RAISED_Y, rowToWorldZ(tile.rowIndex))
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox(); mesh.computeBoundingSphere()
  }, [cells])
  return <instancedMesh ref={meshRef} args={[undefined, undefined, cells.length]}>
    <boxGeometry args={[TILE_SIZE * 0.98, TILE_THICKNESS, TILE_SIZE * 0.98]} />
    <meshBasicNodeMaterial color={color} />
  </instancedMesh>
}

export default function RecoveryInspection() {
  return <main className="h-dvh w-full">
    <div className="fixed left-4 top-4 z-10 rounded bg-black/70 p-3 text-sm text-white">
      Stone pillar inspection · drag to orbit, scroll to zoom<br />
      Simplified floor colours; exact generated geometry and ring positions.
    </div>
    <WebGPUCanvas camera={{ position: [105, 65, rowToWorldZ(620)], far: 500, fov: 55 }} dpr={1}>
      <color attach="background" args={['#c8c4bd']} />
      <ambientLight intensity={1.6} />
      <directionalLight position={[-40, 60, 50]} intensity={2} />
      <Pillars surface={FLAT_SURFACE} fadeEnabled={false} />
      <Floor cells={plain} color="#c8bca5" />
      <Floor cells={bright} color="#f4ebd9" />
      {rings.map((position, index) => <mesh key={index} position={[position[0], TILE_SURFACE_Y + 1, position[2]]}>
        <torusGeometry args={[0.65, 0.12, 6, 20]} /><meshBasicNodeMaterial color="#ffb92e" />
      </mesh>)}
      <OrbitControls target={[0, 0, rowToWorldZ(712)]} maxDistance={350} minDistance={10} />
    </WebGPUCanvas>
  </main>
}
