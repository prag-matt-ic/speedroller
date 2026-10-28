'use client'

import { useTexture } from '@react-three/fiber/webgpu'
import { useLocalNodes } from '@react-three/tsl'
import { type FC, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { abs, attribute, mix, normalMap, spritesheetUV, step, texture, uv, vec2, vertexStage } from 'three/tsl'
import {
  type BoxGeometry,
  ClampToEdgeWrapping,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshPhongNodeMaterial,
  NoColorSpace,
  Quaternion,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three/webgpu'

import ivoryStoneAtlas from '@/assets/textures/platform/ivory-stone-atlas.webp'
import ivoryStoneNormals from '@/assets/textures/platform/ivory-stone-normal.png'
import { useRouteFadeIn } from '@/hooks/useRouteFadeIn'
import type { PillarPlacement } from '@/utils/platform/architecture'
import { surfaceRotation, type CourseSurface } from '@/utils/platform/courseSurface'
import { blockWorldPosition } from '@/utils/platform/blockWorldPosition'
import { createStoneBlockGeometry } from '@/utils/platform/stoneBlockGeometry'
import { industrialSurface } from './industrialSurface'

const BATCH_LENGTH = 32
const STONE_ATLAS_GRID = 3
const STONE_UV_INSET = 16.5 / 512
const STONE_NORMAL_STRENGTH = 0.35

const configureStoneAtlas = (map: Texture) => {
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = ClampToEdgeWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true
}

type Props = { blocks: readonly PillarPlacement[]; surface: CourseSurface; enabled?: boolean; fadeEnabled?: boolean; onReadyChange?: (ready: boolean) => void }

type BatchProps = { surface: CourseSurface; pillars: PillarPlacement[]; geometry: BoxGeometry; material: MeshPhongNodeMaterial }

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
    clone.setAttribute('blockSize', new InstancedBufferAttribute(
      new Float32Array(pillars.flatMap((pillar) => pillar.dimensions)), 3,
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
      const [width, height, depth] = pillar.dimensions
      blockWorldPosition(pillar, surface, position)
      surfaceRotation(pillar.frameX ?? pillar.position[0], surface, rotation)
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

const StoneBlocks: FC<Props> = ({ blocks, surface, enabled = true, fadeEnabled = true, onReadyChange }) => {
  const batches = useMemo(() => Object.values(Object.groupBy(blocks, (block) => Math.floor(block.distance / BATCH_LENGTH))), [blocks])
  const stoneAtlas = useTexture(ivoryStoneAtlas.src, configureStoneAtlas)
  const stoneNormals = useTexture(ivoryStoneNormals.src, (map) => {
    configureStoneAtlas(map)
    map.colorSpace = NoColorSpace
  })
  const { colorNode, emissiveNode, normalNode, pillarWorldZ } = useLocalNodes(() => {
    const stoneUv = spritesheetUV(
      vec2(STONE_ATLAS_GRID),
      uv().mul(1 - 2 * STONE_UV_INSET).add(STONE_UV_INSET),
      attribute<'float'>('stoneFrame', 'float'),
    )
    const dimensions = attribute<'vec3'>('blockSize', 'vec3')
    const faceNormal = abs(attribute<'vec3'>('normal', 'vec3'))
    const faceSize = vertexStage(vec2(
      mix(dimensions.x, dimensions.z, step(0.5, faceNormal.x)),
      mix(dimensions.y, dimensions.z, step(0.5, faceNormal.y)),
    ))
    const panel = industrialSurface(texture(stoneAtlas, stoneUv).rgb, uv(), faceSize)
    return {
      pillarWorldZ: attribute<'float'>('pillarWorldZ', 'float'),
      colorNode: panel.colorNode.mul(attribute<'float'>('stoneShade', 'float')),
      emissiveNode: panel.emissiveNode,
      normalNode: normalMap(texture(stoneNormals, stoneUv).rgb, vec2(STONE_NORMAL_STRENGTH)),
    }
  }, [stoneAtlas, stoneNormals])
  const opacityNode = useRouteFadeIn(pillarWorldZ, fadeEnabled)
  const geometry = useMemo(() => createStoneBlockGeometry(), [])
  const material = useMemo(() => {
    const material = new MeshPhongNodeMaterial({ colorNode, normalNode, opacityNode, shininess: 24, specular: '#62584c', transparent: true, depthWrite: true, alphaTest: 0.001 })
    Object.assign(material, { emissiveNode })
    return material
  }, [colorNode, emissiveNode, normalNode, opacityNode])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    onReadyChange?.(true)
    return () => onReadyChange?.(false)
  }, [onReadyChange, enabled])
  return <group visible={enabled}>{batches.map((pillars) => pillars && <PillarBatch key={pillars[0].id} surface={surface} pillars={pillars} geometry={geometry} material={material} />)}</group>
}

export default StoneBlocks
