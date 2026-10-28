'use client'

import { useLayoutEffect, useRef } from 'react'
import { BackSide, Color, InstancedMesh, Object3D, Vector3 } from 'three'

import { cylinderPosition, OUTER_RADIUS, TRACK_LENGTH, TRACK_RADIUS, TRACK_START_Z } from './cylinder'

const SCENERY_COUNT = 240
const WORLD_LENGTH = TRACK_LENGTH * 2
const WORLD_CENTER_Z = TRACK_START_Z - TRACK_LENGTH / 2
const WORLD_UP = new Vector3(0, 1, 0)
const BUILDING_COLOR = new Color('#397b87')
const PEAK_COLOR = new Color('#546b92')

function SceneryInstances({ peaks }: { peaks: boolean }) {
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    if (!mesh.current) return
    const transform = new Object3D()
    const up = new Vector3()
    const color = new Color()
    for (let index = 0; index < SCENERY_COUNT; index++) {
      const angle = index * 2.399963229728653 + (peaks ? 0.7 : 0)
      const variation = (Math.sin(index * 127.1 + (peaks ? 31 : 7)) + 1) / 2
      const height = peaks ? 5 + variation * 7 : 2 + variation * 9
      const width = peaks ? 4 + variation * 3 : 1 + variation * 1.5
      const z = WORLD_CENTER_Z + ((index / SCENERY_COUNT) - 0.5) * WORLD_LENGTH
      cylinderPosition(angle * OUTER_RADIUS, z, height / 2, transform.position, OUTER_RADIUS)
      up.set(-Math.sin(angle), Math.cos(angle), 0)
      transform.quaternion.setFromUnitVectors(WORLD_UP, up)
      transform.scale.set(width, height, width)
      transform.updateMatrix()
      mesh.current.setMatrixAt(index, transform.matrix)
      color.copy(peaks ? PEAK_COLOR : BUILDING_COLOR).multiplyScalar(0.6 + variation * 0.8)
      mesh.current.setColorAt(index, color)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [peaks])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SCENERY_COUNT]}>
      {peaks ? <coneGeometry args={[0.5, 1, 5]} /> : <boxGeometry />}
      <meshStandardMaterial roughness={0.8} metalness={peaks ? 0 : 0.3} />
    </instancedMesh>
  )
}

export default function CylinderScenery() {
  return (
    <group>
      <mesh position={[0, TRACK_RADIUS, WORLD_CENTER_Z]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[OUTER_RADIUS, OUTER_RADIUS, WORLD_LENGTH, 96, 1, true]} />
        <meshStandardMaterial color="#182c42" side={BackSide} roughness={1} />
      </mesh>
      <SceneryInstances peaks={false} />
      <SceneryInstances peaks />
    </group>
  )
}
