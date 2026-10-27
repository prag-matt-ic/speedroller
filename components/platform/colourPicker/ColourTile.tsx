/* eslint-disable react-hooks/immutability */
'use client'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { createCoursePlaneGeometry } from '@/utils/platform/coursePlaneGeometry'
import { createSurfaceColliders } from '@/utils/platform/surfaceColliders'
import { useLocalNodes } from '@react-three/tsl'
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import { TrimeshCollider, RigidBody } from '@react-three/rapier'
import { type FC, useCallback, useMemo, useEffect, useLayoutEffect } from 'react'
import { float, fwidth, max, mix, smoothstep, uniform, uv, vec3, vertexStage } from 'three/tsl'
import { type Vector3Tuple } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  createGalaxyNodes,
  createGalaxyUniforms,
} from '@/components/player/marble/createGalaxyNodes'
import useGameFrame from '@/hooks/useGameFrame'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE } from '@/components/coreUniforms'
import { PLAYER_RADIUS } from '@/utils/player'
import { type ColourTileUserData } from '@/model/schema'
import { fadeInOut } from '@/resources/tsl/fadeInOut'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { TILE_JOINT_WIDTH, TILE_BEVEL_WIDTH } from '@/utils/platform/tileSlabGeometry'
import { COLOUR_TILE_SIZE } from '@/utils/platform/homeSection'

const COLOUR_TILE_VISIBLE_SIZE = COLOUR_TILE_SIZE - TILE_JOINT_WIDTH - TILE_BEVEL_WIDTH * 2
const TILE_CLOUD_DENSITY = 4.0
const TILE_TIME_OFFSET_RANGE = 1000
const BORDER_THICKNESS = 0.04
const INNER_EDGE = 0.5 - BORDER_THICKNESS
export type ColourTileOption = {
  index: number
  position: Vector3Tuple
  userData: ColourTileUserData
}

type ColourTileProps = {
  option: ColourTileOption
  isActive: boolean
}

const ColourTile: FC<ColourTileProps> = ({ option, isActive }) => {
  const surface = useCourseSurface()
  const [x, y, z] = option.position
  const geometry = useMemo(
    () =>
      createCoursePlaneGeometry(
        COLOUR_TILE_VISIBLE_SIZE,
        COLOUR_TILE_VISIBLE_SIZE,
        x,
        y,
        surface,
        1,
      ),
    [x, y, surface],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  const collision = useMemo(
    () =>
      createSurfaceColliders(
        [[x, y, 0]],
        surface,
        COLOUR_TILE_SIZE,
        PLAYER_RADIUS * 4,
        COLOUR_TILE_SIZE,
      ),
    [x, y, surface],
  )
  const quality = usePerformanceStore((state) => state.sceneConfig.marble)
  const useDistanceFade = usePerformanceStore((state) => state.sceneConfig.isDistanceFadeEnabled)
  const uniforms = useMemo(() => createGalaxyUniforms(option.index), [option.index])
  useLayoutEffect(() => {
    uniforms.density.value = TILE_CLOUD_DENSITY
    uniforms.time.value = Math.random() * TILE_TIME_OFFSET_RANGE
  }, [uniforms])
  const active = useMemo(() => uniform(0), [])
  useLayoutEffect(() => {
    active.value = Number(isActive)
  }, [active, isActive])
  useGameFrame((_, delta) => {
    uniforms.time.value += delta
  })

  const { colorNode, opacityNode, emissiveNode } = useLocalNodes(
    ({ uniforms: scopedUniforms }) => {
      const { uPlayerWorldPos } = scopedUniforms.scope(CORE_UNIFORM_SCOPE)
      const galaxy = createGalaxyNodes(uniforms, quality.samples, quality.starCount, 'tile')
      const centredUv = uv().sub(0.5)
      const edge = max(centredUv.x.abs(), centredUv.y.abs())
      const aa = fwidth(edge)
      const border = smoothstep(float(INNER_EDGE).sub(aa), float(INNER_EDGE).add(aa), edge)
      return {
        colorNode: mix(galaxy.colorNode, vec3(active), border),
        emissiveNode: galaxy.emissiveNode.mul(float(1).sub(border)),
        opacityNode: useDistanceFade ? vertexStage(fadeInOut(uPlayerWorldPos.z)) : float(1),
      }
    },
    [uniforms, active, quality.samples, quality.starCount, useDistanceFade],
  )
  const attachMaterial = useCallback(
    (material: MeshBasicNodeMaterial | null) => {
      if (!material) return
      Object.assign(material, { emissiveNode })
      material.needsUpdate = true
    },
    [emissiveNode],
  )

  return (
    <RigidBody type="fixed" position={[0, 0, z]} colliders={false} userData={option.userData}>
      <TrimeshCollider
        args={[collision.vertices, collision.indices]}
        sensor={true}
        activeCollisionTypes={ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED}
        collisionGroups={COLLISION_GROUPS.colourTileSensor}
      />
      <mesh renderOrder={1}>
        <primitive object={geometry} attach="geometry" />
        <meshBasicNodeMaterial
          ref={attachMaterial}
          colorNode={colorNode}
          opacityNode={opacityNode}
          transparent
          depthWrite={false}
        />
      </mesh>
    </RigidBody>
  )
}

export default ColourTile
