'use client'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { courseToWorld, surfaceRotation } from '@/utils/platform/courseSurface'

import { useLocalNodes } from '@react-three/tsl'
import { type FC, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Quaternion, Vector3, BoxGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4 } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { attribute, clamp, color, dot, normalWorld, vec3 } from 'three/tsl'

import { useRouteFadeIn } from '@/hooks/useRouteFadeIn'
import pillarData from '@/resources/coursePillars.json'
import type { PillarPlacement } from '@/utils/platform/architecture'

const BATCH_LENGTH = 32
const placements = pillarData as PillarPlacement[]
const batches = Object.values(Object.groupBy(placements, (pillar) => Math.floor(pillar.distance / BATCH_LENGTH)))

type Props = { enabled?: boolean; fadeEnabled?: boolean; onReadyChange?: (ready: boolean) => void }

type BatchProps = { pillars: PillarPlacement[]; geometry: BoxGeometry; material: MeshBasicNodeMaterial }

const PillarBatch: FC<BatchProps> = ({ pillars, geometry, material }) => {
  const surface = useCourseSurface()
  const meshRef = useRef<InstancedMesh>(null)
  const batchGeometry = useMemo(() => {
    const clone = geometry.clone()
    clone.setAttribute('pillarWorldZ', new InstancedBufferAttribute(
      new Float32Array(pillars.map((pillar) => pillar.position[2])), 1,
    ))
    return clone
  }, [geometry, pillars])
  useEffect(() => () => batchGeometry.dispose(), [batchGeometry])
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    const position = new Vector3()
    const rotation = new Quaternion()
    const scale = new Vector3()
    pillars.forEach((pillar, index) => {
      const [x, baseY, z] = pillar.position
      const [width, height, depth] = pillar.dimensions
      courseToWorld(x, baseY + height / 2, z, surface, position)
      surfaceRotation(x, surface, rotation)
      scale.set(width, height, depth)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
  }, [pillars, batchGeometry, material, surface])
  return (
    <instancedMesh ref={meshRef} args={[batchGeometry, material, pillars.length]} dispose={null} frustumCulled />
  )
}

const Pillars: FC<Props> = ({ enabled = true, fadeEnabled = true, onReadyChange }) => {
  const { colorNode, pillarWorldZ } = useLocalNodes(() => ({
    pillarWorldZ: attribute<'float'>('pillarWorldZ', 'float'),
    colorNode: color('#e8ddc9').mul(
      clamp(dot(normalWorld, vec3(-0.5, 0.8, 0.3).normalize()), 0, 1).mul(0.45).add(0.55),
    ),
  }), [])
  const opacityNode = useRouteFadeIn(pillarWorldZ, fadeEnabled)
  const geometry = useMemo(() => new BoxGeometry(), [])
  const material = useMemo(() => new MeshBasicNodeMaterial({ colorNode, opacityNode, transparent: true, depthWrite: true, alphaTest: 0.001 }), [colorNode, opacityNode])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    onReadyChange?.(true)
    return () => onReadyChange?.(false)
  }, [onReadyChange, enabled])
  return <group visible={enabled}>{batches.map((pillars) => pillars && <PillarBatch key={pillars[0].id} pillars={pillars} geometry={geometry} material={material} />)}</group>
}

export default Pillars
