/* eslint-disable react-hooks/refs */
'use client'

import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import { useGSAP } from '@gsap/react'
import { Html } from '@react-three/drei'
import { type HtmlProps } from '@react-three/drei/webgpu'
import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import {
  CuboidCollider,
  type IntersectionEnterHandler,
  type IntersectionExitHandler,
  RigidBody,
} from '@react-three/rapier'
import gsap from 'gsap'
import EasePack from 'gsap/dist/EasePack'
import {
  type FC,
  type PropsWithChildren,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Transition } from 'react-transition-group'
import { twMerge } from 'tailwind-merge'
import { float, mix, uv, vec2, vec3, vertexStage } from 'three/tsl'
import { type Vector3Tuple } from 'three'
import type { Node, UniformNode } from 'three/webgpu'

import { useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import { SoundFX, useSoundStore } from '@/components/SoundProvider'
import { PLAYER_RADIUS } from '@/components/player/PlayerHUD'
import { PointerProvider } from '@/components/ui/PointerProvider'
import { InfoZoneUserData, type RigidBodyUserData } from '@/model/schema'
import { fadeInOut, objectWorldZ } from '@/resources/tsl/fadeInOut'
import { paintCorners } from '@/resources/tsl/paintCorners'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import {
  INFO_ZONE_COLS,
  INFO_ZONE_HEIGHT,
  INFO_ZONE_ROWS,
  INFO_ZONE_WIDTH,
} from '@/utils/platform/infoZoneDimensions'

import IconSphere from './iconSphere/IconSphere'

gsap.registerPlugin(EasePack)

// Corner bracket tuning, carried over from infoZone.frag.
const BORDER_THICKNESS_TILES = 0.25
const CORNER_LENGTH_TILES = 0.5
const DEFAULT_INFO_POSITION_OFFSET: Vector3Tuple = [0, 0, 3.5]

type InfoZoneUniforms = {
  uAspect: UniformNode<'float', number>
  uTilesX: UniformNode<'float', number>
  uTilesY: UniformNode<'float', number>
  uShowProgress: UniformNode<'float', number>
}

const createInfoZoneUniforms = (aspect: number, tilesX: number, tilesY: number) => () => ({
  uAspect: aspect,
  uTilesX: tilesX,
  uTilesY: tilesY,
  uShowProgress: 0,
})

export type InfoZoneProps = PropsWithChildren<{
  position: Vector3Tuple
  /** Stable, unique per zone: its uniforms are registered under this scope. */
  zoneKey: string
  infoContainerClassName?: string
  infoPositionOffset?: Vector3Tuple
  alwaysShowInfo?: boolean
  infoContentHtmlProps?: HtmlProps
  iconSrc: string
}>

const userData: InfoZoneUserData = {
  type: 'info-zone',
}

// Shows HTML content when the player enters the zone
export const InfoZone: FC<InfoZoneProps> = ({
  position,
  zoneKey,
  infoContainerClassName,
  children,
  infoPositionOffset = DEFAULT_INFO_POSITION_OFFSET,
  alwaysShowInfo = false,
  infoContentHtmlProps = {},
  iconSrc,
}) => {
  const gameStore = useGameStoreAPI()
  const isMobile = useGameStore((s) => s.isMobile)
  const htmlPortal = useGameStore((s) => s.htmlPortal)
  const setCameraLookAtPosition = useGameStore((s) => s.setCameraLookAtPosition)
  const playSoundFX = useSoundStore((s) => s.playSoundFX)
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)

  const [showInfo, setShowInfo] = useState(alwaysShowInfo)
  const infoContainer = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)

  // onFramed fires only on frustum transitions, so this updates React state only when it changes.
  // The floor tile's natural bounds are enough: the tile is framed whenever the player is anywhere
  // near the zone, which is the only time the Html content floating above it is shown.
  const onFramed = useCallback((inView: boolean) => {
    setIsInView(inView)
  }, [])

  // Registers the zone's uniforms. The graph reads them back off the same scope; uShowProgress is
  // also held here because the enter/exit tweens animate it directly.
  // Corner brackets are drawn per grid cell, so the tile metrics come from the zone dimensions
  // rather than a shared 1×1 default (which made brackets ~5× too large on the 5×5 zone).
  const tileAspect = INFO_ZONE_WIDTH / INFO_ZONE_HEIGHT
  const tilesX = INFO_ZONE_COLS
  const tilesY = INFO_ZONE_ROWS

  const { uShowProgress } = useUniforms(createInfoZoneUniforms(tileAspect, tilesX, tilesY), zoneKey)

  // Port of infoZone.vert + infoZone.frag. Height-space UV and the distance fade are recomputed
  // per stage rather than carried across as varyings.
  const createNodes = useCallback(
    ({ uniforms }: CreatorState) => {
      const scoped = uniforms.scope<InfoZoneUniforms>(zoneKey)
      const { uPlayerWorldPos } = uniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)
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

      // uOpacity was declared in the GLSL but never set from JS, so it stayed at its initial 1.
      // The fade reads the zone's own z, so the whole 5-tile panel ramps as one rather than wiping
      // in across its depth.
      const opacityNode: Node<'float'> = useDistanceFade
        ? bracketMask.mul(
            vertexStage(fadeInOut(uPlayerWorldPos.z, objectWorldZ(), { fadeOut: true })),
          )
        : bracketMask
      return { colorNode: vec3(1), opacityNode }
    },
    [useDistanceFade, zoneKey],
  )

  const { colorNode, opacityNode } = useLocalNodes(createNodes)

  const cameraTarget = useMemo<Vector3Tuple>(() => [
    position[0] - infoPositionOffset[0],
    position[1] - infoPositionOffset[1],
    position[2] - infoPositionOffset[2],
  ], [position, infoPositionOffset])

  const clearCameraTarget = useCallback(() => {
    // A late exit from this zone must not clear a newer zone's target.
    if (gameStore.getState().cameraLookAtPosition === cameraTarget) {
      setCameraLookAtPosition(null)
    }
  }, [cameraTarget, gameStore, setCameraLookAtPosition])

  useEffect(() => clearCameraTarget, [clearCameraTarget])

  const onIntersectionEnter: IntersectionEnterHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData) return
    if (otherUserData.type !== 'player') return
    setCameraLookAtPosition(cameraTarget)
    if (alwaysShowInfo) return
    setShowInfo(true)
  }

  const onIntersectionExit: IntersectionExitHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData) return
    if (otherUserData.type !== 'player') return
    clearCameraTarget()
    if (alwaysShowInfo) return
    setShowInfo(false)
  }

  const { contextSafe } = useGSAP({ dependencies: [showInfo] })

  const onInfoEnter = contextSafe(() => {
    playSoundFX(SoundFX.OPEN_INFO)
    gsap.fromTo(
      infoContainer.current,
      { opacity: 0, scale: 0.8 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.32,
        delay: 0.3,
        stagger: -0.07,
        ease: 'expoScale(0.8,1.0,power1.out)',
      },
    )
    gsap.to(uShowProgress, {
      duration: 0.5,
      value: 1,
      ease: 'power2.out',
    })
  })

  const onInfoExit = contextSafe(() => {
    gsap.to(infoContainer.current, {
      opacity: 0,
      scale: 0.8,
      duration: 0.24,
      ease: 'expoScale(0.8,1.0,power1.out)',
    })
    gsap.to(uShowProgress, {
      duration: 0.3,
      value: 0,
      ease: 'power2.in',
    })
  })


  return (
    <RigidBody
      type="fixed"
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      colliders={false}
      userData={userData}>
      <CuboidCollider
        args={[INFO_ZONE_WIDTH / 2, INFO_ZONE_HEIGHT / 2, PLAYER_RADIUS * 2]}
        sensor={true}
        activeCollisionTypes={ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED}
        mass={0}
        friction={0}
        onIntersectionEnter={onIntersectionEnter}
        onIntersectionExit={onIntersectionExit}
        collisionGroups={COLLISION_GROUPS.infoZoneSensor}
      />
      <group>
        {/* Floor tile */}
        <mesh position={[0, 0, 0.01]} renderOrder={2} onFramed={onFramed}>
          <planeGeometry args={[INFO_ZONE_WIDTH, INFO_ZONE_HEIGHT]} />
          <meshBasicNodeMaterial
            colorNode={colorNode}
            opacityNode={opacityNode}
            transparent
          />
        </mesh>

        {/* Floating Icon Sphere */}
        <Suspense fallback={null}>
          <IconSphere
            iconSrc={iconSrc}
            isVisible={true}
            shouldHide={showInfo}
            zoneKey={zoneKey}
          />
        </Suspense>
      </group>
      {/* Mesh to show where info content is placed. */}
      {/* <mesh position={infoPositionOffset}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshBasicMaterial color="white" />
        </mesh> */}

      {/* Info Content */}
      {isInView && (
        <Html
          sprite={true}
          center={true}
          renderOrder={2}
          occlude={false}
          portal={htmlPortal}
          pointerEvents="none"
          position={infoPositionOffset}
          className="relative z-100 select-none"
          {...infoContentHtmlProps}>
          <Transition
            in={showInfo}
            mountOnEnter={true}
            unmountOnExit={true}
            timeout={{ enter: 0, exit: 300 }}
            onEnter={onInfoEnter}
            onExit={onInfoExit}
            nodeRef={infoContainer}>
            <InfoContentPanel
              ref={infoContainer}
              isMobile={isMobile}
              className={twMerge('relative size-fit', infoContainerClassName)}>
              {children}
            </InfoContentPanel>
          </Transition>
        </Html>
      )}
    </RigidBody>
  )
}

type PanelProps = PropsWithChildren<{
  ref: RefObject<HTMLDivElement | null>
  className?: string
  isMobile: boolean
}>

const InfoContentPanel: FC<PanelProps> = ({ children, isMobile, className, ref }) => {
  return (
    <div ref={ref} className={className}>
      <PointerProvider isMobile={isMobile}>{children}</PointerProvider>
    </div>
  )
}
