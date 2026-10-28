'use client'

import { CuboidCollider, RigidBody, type IntersectionEnterHandler } from '@react-three/rapier'
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import { useCallback, useEffect, useId, useMemo, useState, type PropsWithChildren } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/tsl'
import { float, mix, uv, vec2, vec3, vertexStage } from 'three/tsl'
import type { Node, UniformNode } from 'three/webgpu'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { createLocalCoursePanelGeometry } from '@/utils/platform/coursePlaneGeometry'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE } from '@/components/coreUniforms'
import { fadeInOut, objectWorldZ } from '@/resources/tsl/fadeInOut'
import { paintCorners } from '@/resources/tsl/paintCorners'
import { TILE_SIZE } from '@/utils/tiles'
import type { Vector3Tuple } from 'three'

import { useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { useCoursePlacement } from '@/hooks/useCoursePlacement'
import { isLocalPlayerContact, selectCameraPoseOverride, type CameraPose } from '@/utils/camera/cameraPose'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'

const BORDER_THICKNESS_TILES = 0.25
const CORNER_LENGTH_TILES = 0.5

type SensorUniforms = {
  uAspect: UniformNode<'float', number>
  uTilesX: UniformNode<'float', number>
  uTilesY: UniformNode<'float', number>
  uShowProgress: UniformNode<'float', number>
}

const createSensorUniforms = (aspect: number, tilesX: number, tilesY: number) => () => ({
  uAspect: aspect,
  uTilesX: tilesX,
  uTilesY: tilesY,
  uShowProgress: 0,
})

export type CameraPoseSensorProps = PropsWithChildren<{
  position: Vector3Tuple
  /** Half-width, half-height above the floor, and half-depth in course space. */
  halfExtents: Vector3Tuple
  pose?: CameraPose
  onEnter?: () => void
  onExit?: () => void
  onFramed?: (inView: boolean) => void
  enabled?: boolean
  onActiveChange?: (active: boolean) => void
}>

export function CameraPoseSensor({ position, halfExtents, pose, enabled = true, onActiveChange, onEnter, onExit, onFramed, children }: CameraPoseSensorProps) {
  const id = useId()
  const store = useGameStoreAPI()
  const placement = useCoursePlacement(position, -Math.PI / 2)
  const surface = useCourseSurface()
  const [courseX, courseY] = position
  const [halfWidth, halfHeight, halfDepth] = halfExtents
  const width = halfWidth * 2
  const depth = halfDepth * 2
  const panelGeometry = useMemo(() => createLocalCoursePanelGeometry(width, depth, courseX, courseY, surface), [width, depth, courseX, courseY, surface])
  useEffect(() => () => panelGeometry.dispose(), [panelGeometry])
  const useDistanceFade = usePerformanceStore(state => state.sceneConfig.isDistanceFadeEnabled)
  const scope = `camera-sensor-${id}`
  const { uShowProgress } = useUniforms(createSensorUniforms(width / depth, width / TILE_SIZE, depth / TILE_SIZE), scope)
  const [occupied, setOccupied] = useState(false)
  const active = useGameStore(state => selectCameraPoseOverride(state)?.id === id)
  const release = useCallback(() => store.getState().setCameraPoseOverride(id, null), [id, store])

  useEffect(() => release, [release])
  useEffect(() => { if (!enabled || !pose) release() }, [enabled, pose, release])
  useEffect(() => { onActiveChange?.(active) }, [active, onActiveChange])
  useEffect(() => () => onActiveChange?.(false), [onActiveChange])
  useEffect(() => {
    if (pose && store.getState().cameraPoseOverrides.some(entry => entry.id === id)) {
      store.getState().setCameraPoseOverride(id, pose)
    }
  }, [id, pose, store])

  const enter: IntersectionEnterHandler = event => {
    if (!enabled || !isLocalPlayerContact(event)) return
    setOccupied(true)
    if (pose) store.getState().setCameraPoseOverride(id, pose)
    onEnter?.()
  }
  const exit: IntersectionEnterHandler = event => {
    if (!isLocalPlayerContact(event)) return
    setOccupied(false)
    release()
    onExit?.()
  }

  const highlighted = enabled && (pose ? active : occupied)
  useGSAP(() => {
    gsap.to(uShowProgress, {
      value: highlighted ? 1 : 0,
      duration: highlighted ? 0.5 : 0.3,
      ease: highlighted ? 'power2.out' : 'power2.in',
      overwrite: true,
    })
  }, { dependencies: [highlighted, uShowProgress], revertOnUpdate: true })

  const createNodes = useCallback(
    ({ uniforms }: CreatorState) => {
      const scoped = uniforms.scope<SensorUniforms>(scope)
      const { uPlayerWorldPos } = uniforms.scope(CORE_UNIFORM_SCOPE)
      // Height-space UV: centred, with the aspect ratio applied to x.
      const centeredUvSource = uv().sub(0.5)
      const centeredUv: Node<'vec2'> = vec2(
        centeredUvSource.x.mul(scoped.uAspect),
        centeredUvSource.y,
      )

      const animatedCornerLength = mix(
        float(CORNER_LENGTH_TILES),
        float(CORNER_LENGTH_TILES * 6),
        scoped.uShowProgress,
      )

      const bracketMask = paintCorners(
        centeredUv,
        scoped.uAspect,
        vec2(scoped.uTilesX, scoped.uTilesY),
        float(BORDER_THICKNESS_TILES),
        animatedCornerLength,
      )

      // Fade the whole area together using its centre, rather than wiping across its depth.
      const opacityNode: Node<'float'> = useDistanceFade
        ? bracketMask.mul(
            vertexStage(fadeInOut(uPlayerWorldPos.z, objectWorldZ(), { fadeOut: true })),
          )
        : bracketMask
      return { colorNode: vec3(1), opacityNode }
    },
    [useDistanceFade, scope],
  )

  const { colorNode, opacityNode } = useLocalNodes(createNodes, [createNodes])

  return <RigidBody type="fixed" colliders={false} {...placement}>
    {enabled && <CuboidCollider args={[halfWidth, halfDepth, halfHeight]} sensor mass={0} friction={0}
      activeCollisionTypes={ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED}
      collisionGroups={COLLISION_GROUPS.infoZoneSensor}
      onIntersectionEnter={enter} onIntersectionExit={exit} />}
    <mesh position={[0, 0, 0.01]} renderOrder={2} onFramed={onFramed}>
      <primitive object={panelGeometry} attach="geometry" />
      <meshBasicNodeMaterial colorNode={colorNode} opacityNode={opacityNode} transparent />
    </mesh>
    {children}
  </RigidBody>
}
