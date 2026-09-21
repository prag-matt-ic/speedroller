/* eslint-disable react-hooks/refs */
'use client'

import { useGSAP } from '@gsap/react'
import { Html } from '@react-three/drei'
import { type HtmlProps } from '@react-three/drei/webgpu'
import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import {
  CuboidCollider,
  type IntersectionEnterHandler,
  type IntersectionExitHandler,
  RapierRigidBody,
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
  useRef,
  useState,
} from 'react'
import { Transition } from 'react-transition-group'
import { twMerge } from 'tailwind-merge'
import { float, mix, positionWorld, uv, vec2, vec3 } from 'three/tsl'
import { type Vector3Tuple } from 'three'
import type { Node, UniformNode } from 'three/webgpu'

import { useGameStore } from '@/components/GameProvider'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { SoundFX, useSoundStore } from '@/components/SoundProvider'
import { PLAYER_RADIUS } from '@/components/player/PlayerHUD'
import { PointerProvider } from '@/components/ui/PointerProvider'
import { InfoZoneUserData, type RigidBodyUserData } from '@/model/schema'
import { fadeDistance } from '@/resources/tsl/fadeDistance'
import { paintCorners } from '@/resources/tsl/paintCorners'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import {
  INFO_ZONE_COLS,
  INFO_ZONE_HEIGHT,
  INFO_ZONE_ROWS,
  INFO_ZONE_WIDTH,
} from '@/utils/platform/infoZoneDimensions'
import { HIDDEN_POSITION } from '@/utils/tiles'

import IconSphere from './iconSphere/IconSphere'

gsap.registerPlugin(EasePack)

// Corner bracket tuning, carried over from infoZone.frag.
const BORDER_THICKNESS_TILES = 0.25
const CORNER_LENGTH_TILES = 0.5

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
  ref: RefObject<RapierRigidBody | null>
  /** Stable, unique per zone: its uniforms are registered under this scope. */
  zoneKey: string
  isVisible: boolean
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
  ref,
  zoneKey,
  isVisible,
  infoContainerClassName,
  children,
  infoPositionOffset = [0, 0, 3.5],
  alwaysShowInfo = false,
  infoContentHtmlProps = {},
  iconSrc,
}) => {
  const isMobile = useGameStore((s) => s.isMobile)
  const htmlPortal = useGameStore((s) => s.htmlPortal)
  const setCameraLookAtPosition = useGameStore((s) => s.setCameraLookAtPosition)
  const playSoundFX = useSoundStore((s) => s.playSoundFX)
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)

  const [showInfo, setShowInfo] = useState(alwaysShowInfo)
  const infoContainer = useRef<HTMLDivElement>(null)

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
      const opacityNode: Node<'float'> = useDistanceFade
        ? bracketMask.mul(fadeDistance(positionWorld.z))
        : bracketMask
      return { colorNode: vec3(1), opacityNode }
    },
    [useDistanceFade, zoneKey],
  )

  const { colorNode, opacityNode } = useLocalNodes(createNodes)

  const lookAtInfo = () => {
    if (!isVisible) return
    if (!ref || !ref.current) return
    const currentTranslation = ref.current.translation()
    const targetPosition: Vector3Tuple = [
      currentTranslation.x - infoPositionOffset[0],
      currentTranslation.y - infoPositionOffset[1],
      currentTranslation.z - infoPositionOffset[2],
    ]
    setCameraLookAtPosition(targetPosition)
  }

  const onIntersectionEnter: IntersectionEnterHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData) return
    if (otherUserData.type !== 'player') return
    lookAtInfo()
    if (alwaysShowInfo) return
    setShowInfo(true)
  }

  const onIntersectionExit: IntersectionExitHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData) return
    if (otherUserData.type !== 'player') return
    // Reset camera and hide info when exiting
    setCameraLookAtPosition(null)
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
      ref={ref}
      // KEEP DYNAMIC
      type="dynamic"
      gravityScale={0}
      friction={0}
      mass={0}
      position={HIDDEN_POSITION} // Overwritten dynamically in the parent
      rotation={[-Math.PI / 2, 0, 0]}
      colliders={false}
      userData={userData}>
      <CuboidCollider
        args={[INFO_ZONE_WIDTH / 2, INFO_ZONE_HEIGHT / 2, PLAYER_RADIUS * 2]}
        sensor={true}
        mass={0}
        friction={0}
        onIntersectionEnter={onIntersectionEnter}
        onIntersectionExit={onIntersectionExit}
        collisionGroups={COLLISION_GROUPS.infoZoneSensor}
      />
      <group visible={isVisible}>
        {/* Floor tile */}
        <mesh position={[0, 0, 0.01]} renderOrder={2}>
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
            isVisible={isVisible}
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
      {isVisible && (
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
