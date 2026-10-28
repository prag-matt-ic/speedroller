/* eslint-disable react-hooks/refs */
'use client'

import { useCourseSurface } from '@/hooks/useCourseSurface'
import { courseToWorld } from '@/utils/platform/courseSurface'

import { useGSAP } from '@gsap/react'
import { Html } from '@react-three/drei'
import { type HtmlProps } from '@react-three/drei/webgpu'
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
import { type Vector3Tuple } from 'three'

import { useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { SoundFX, useSoundStore } from '@/components/SoundProvider'
import { PLAYER_RADIUS } from '@/utils/player'
import { PointerProvider } from '@/components/ui/PointerProvider'
import {
  INFO_ZONE_HEIGHT,
  INFO_ZONE_WIDTH,
} from '@/utils/platform/infoZoneDimensions'

import { CameraPoseSensor } from '@/components/CameraPoseSensor'

import IconSphere from './iconSphere/IconSphere'

gsap.registerPlugin(EasePack)

const DEFAULT_INFO_POSITION_OFFSET: Vector3Tuple = [0, 0, 3.5]
const SENSOR_HALF_EXTENTS: Vector3Tuple = [INFO_ZONE_WIDTH / 2, PLAYER_RADIUS * 2, INFO_ZONE_HEIGHT / 2]

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
  const surface = useCourseSurface()
  const gameStore = useGameStoreAPI()
  const isMobile = useGameStore((s) => s.isMobile)
  const htmlPortal = useGameStore((s) => s.htmlPortal)
  const setCameraLookAtPosition = useGameStore((s) => s.setCameraLookAtPosition)
  const playSoundFX = useSoundStore((s) => s.playSoundFX)

  const [showInfo, setShowInfo] = useState(alwaysShowInfo)
  const infoContainer = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)

  // onFramed fires only on frustum transitions, so this updates React state only when it changes.
  // The floor tile's natural bounds are enough: the tile is framed whenever the player is anywhere
  // near the zone, which is the only time the Html content floating above it is shown.
  const onFramed = useCallback((inView: boolean) => {
    setIsInView(inView)
  }, [])

  const cameraTarget = useMemo<Vector3Tuple>(() => {
    const target = courseToWorld(position[0] - infoPositionOffset[0], position[1] - infoPositionOffset[1], position[2] - infoPositionOffset[2], surface, { x: 0, y: 0, z: 0 })
    return [target.x, target.y, target.z]
  }, [position, infoPositionOffset, surface])

  const clearCameraTarget = useCallback(() => {
    // A late exit from this zone must not clear a newer zone's target.
    if (gameStore.getState().cameraLookAtPosition === cameraTarget) {
      setCameraLookAtPosition(null)
    }
  }, [cameraTarget, gameStore, setCameraLookAtPosition])

  useEffect(() => clearCameraTarget, [clearCameraTarget])

  const onEnter = () => {
    setCameraLookAtPosition(cameraTarget)
    if (alwaysShowInfo) return
    setShowInfo(true)
  }

  const onExit = () => {
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
  })

  const onInfoExit = contextSafe(() => {
    gsap.to(infoContainer.current, {
      opacity: 0,
      scale: 0.8,
      duration: 0.24,
      ease: 'expoScale(0.8,1.0,power1.out)',
    })
  })

  return (
    <CameraPoseSensor position={position} halfExtents={SENSOR_HALF_EXTENTS}
      onEnter={onEnter} onExit={onExit} onFramed={onFramed}>
      <group>
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
    </CameraPoseSensor>
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
