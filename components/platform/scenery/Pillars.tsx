'use client'

import { useTexture } from '@react-three/fiber/webgpu'
import { useLocalNodes } from '@react-three/tsl'
import { type FC, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { attribute, normalMap, spritesheetUV, texture, uv, vec2 } from 'three/tsl'
import {
  type BoxGeometry,
  ClampToEdgeWrapping,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshLambertNodeMaterial,
  NoColorSpace,
  Quaternion,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three/webgpu'

import ivoryStoneAtlas from '@/assets/textures/platform/ivory-stone-atlas.webp'
import ivoryStoneNormals from '@/assets/textures/platform/ivory-stone-normal.png'
import { useRouteFadeIn } from '@/hooks/useRouteFadeIn'
import pillarData from '@/resources/coursePillars.json'
import type { PillarPlacement } from '@/utils/platform/architecture'
import { courseToWorld, surfaceRotation, type CourseSurface } from '@/utils/platform/courseSurface'
import { createPillarBlocks } from '@/utils/platform/pillarBlocks'

const BATCH_LENGTH = 32
const BLOCK_BEVEL_RADIUS = 0.01
const STONE_ATLAS_GRID = 3
const STONE_UV_INSET = 16.5 / 512
const STONE_BRIGHTNESS = 0.88
const STONE_NORMAL_STRENGTH = 0.6
const placements = pillarData as PillarPlacement[]
const batches = Object.values(Object.groupBy(createPillarBlocks(placements), (pillar) => Math.floor(pillar.distance / BATCH_LENGTH)))

const configureStoneAtlas = (map: Texture) => {
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = ClampToEdgeWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true
}

type Props = { surface: CourseSurface; enabled?: boolean; fadeEnabled?: boolean; onReadyChange?: (ready: boolean) => void }

type BatchProps = { surface: CourseSurface; pillars: PillarPlacement[]; geometry: BoxGeometry; material: MeshLambertNodeMaterial }

const PillarBatch: FC<BatchProps> = ({ surface, pillars, geometry, material }) => {
  const meshRef = useRef<InstancedMesh>(null)
  const batchGeometry = useMemo(() => {
    const clone = geometry.clone()
    clone.setAttribute('pillarWorldZ', new InstancedBufferAttribute(
      new Float32Array(pillars.map((pillar) => pillar.position[2])), 1,
    ))
    clone.setAttribute('stoneFrame', new InstancedBufferAttribute(
      new Float32Array(pillars.map((_, index) => index % (STONE_ATLAS_GRID * STONE_ATLAS_GRID))), 1,
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

const Pillars: FC<Props> = ({ surface, enabled = true, fadeEnabled = true, onReadyChange }) => {
  const stoneAtlas = useTexture(ivoryStoneAtlas.src, configureStoneAtlas)
  const stoneNormals = useTexture(ivoryStoneNormals.src, (map) => {
    configureStoneAtlas(map)
    map.colorSpace = NoColorSpace
  })
  const { colorNode, normalNode, pillarWorldZ } = useLocalNodes(() => {
    const stoneUv = spritesheetUV(
      vec2(STONE_ATLAS_GRID),
      uv().mul(1 - 2 * STONE_UV_INSET).add(STONE_UV_INSET),
      attribute<'float'>('stoneFrame', 'float'),
    )
    return {
      pillarWorldZ: attribute<'float'>('pillarWorldZ', 'float'),
      colorNode: texture(stoneAtlas, stoneUv).rgb.mul(STONE_BRIGHTNESS),
      normalNode: normalMap(texture(stoneNormals, stoneUv).rgb, vec2(STONE_NORMAL_STRENGTH)),
    }
  }, [stoneAtlas, stoneNormals])
  const opacityNode = useRouteFadeIn(pillarWorldZ, fadeEnabled)
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 1, BLOCK_BEVEL_RADIUS), [])
  const material = useMemo(() => new MeshLambertNodeMaterial({ colorNode, normalNode, opacityNode, transparent: true, depthWrite: true, alphaTest: 0.001 }), [colorNode, normalNode, opacityNode])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    onReadyChange?.(true)
    return () => onReadyChange?.(false)
  }, [onReadyChange, enabled])
  return <group visible={enabled}>{batches.map((pillars) => pillars && <PillarBatch key={pillars[0].id} surface={surface} pillars={pillars} geometry={geometry} material={material} />)}</group>
}

export default Pillars
