/* eslint-disable react-hooks/refs */
'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { type RefObject, useRef } from 'react'

import {
  type PointerPosition,
  useOptionalPointerPosition,
} from '@/components/ui/PointerProvider'

export type SurfaceAttractorConfig = {
  activeProximity: number
  inactiveProximity: number
  insideOpacity: number
  nearOpacity: number
  quickToDuration?: number
  quickToEase?: string
}

export const PANEL_ATTRACTOR_CONFIG: SurfaceAttractorConfig = {
  activeProximity: 128,
  inactiveProximity: 160,
  insideOpacity: 1,
  nearOpacity: 0.7,
  quickToDuration: 0.5,
  quickToEase: 'power2.out',
}

export const BUTTON_ATTRACTOR_CONFIG: SurfaceAttractorConfig = {
  activeProximity: 96,
  inactiveProximity: 136,
  insideOpacity: 1,
  nearOpacity: 0.7,
  quickToDuration: 0.35,
  quickToEase: 'power2.out',
}

type PointerHandlers = {
  onPointerEnter?: () => void
  onPointerLeave?: () => void
}

type SurfaceAttractorParams = {
  isEnabled: boolean
  containerRef: RefObject<HTMLElement | null>
  attractorRef: RefObject<HTMLElement | null>
  config?: SurfaceAttractorConfig
  requirePointerProvider?: boolean
}

export function useSurfaceAttractor({
  isEnabled,
  containerRef,
  attractorRef,
  config = PANEL_ATTRACTOR_CONFIG,
  requirePointerProvider = false,
}: SurfaceAttractorParams): { containerHandlers?: PointerHandlers; shouldAnimate: boolean } {
  const {
    activeProximity,
    inactiveProximity,
    insideOpacity,
    nearOpacity,
    quickToDuration = 0.5,
    quickToEase = 'power2.out',
  } = config

  const quickSetX = gsap.quickSetter(attractorRef.current, 'x', 'px')
  const quickSetY = gsap.quickSetter(attractorRef.current, 'y', 'px')
  const quickToOpacity = gsap.quickTo(attractorRef.current, 'opacity', {
    duration: 0.35,
    ease: 'power2.out',
  })
  const isPointerInside = useRef(false)

  const { contextSafe } = useGSAP({
    dependencies: [isEnabled],
  })

  const handlePointerPositionChange = contextSafe((position: PointerPosition) => {
    if (!isEnabled) return
    if (!attractorRef.current || !containerRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const activeZone = calculateProximityZone(containerRect, config.activeProximity)

    const isInActiveZone = isWithinZone(position, activeZone)

    if (!isInActiveZone) {
      const inactiveZone = calculateProximityZone(containerRect, config.inactiveProximity)
      if (isWithinZone(position, inactiveZone)) quickToOpacity(0)
      return
    }

    const { x: targetX, y: targetY } = calculateAttractorPosition(position, containerRect)
    quickSetX(targetX)
    quickSetY(targetY)
    quickToOpacity(isPointerInside.current ? insideOpacity : nearOpacity)
  })

  const { hasPointerProvider } = useOptionalPointerPosition(
    isEnabled ? handlePointerPositionChange : undefined,
  )
  const shouldAnimate = isEnabled && (hasPointerProvider || !requirePointerProvider)

  const containerHandlers: PointerHandlers | undefined = shouldAnimate
    ? {
        onPointerEnter: () => {
          isPointerInside.current = true
          quickToOpacity?.(insideOpacity)
        },
        onPointerLeave: () => {
          isPointerInside.current = false
          quickToOpacity?.(0)
        },
      }
    : undefined

  return { containerHandlers, shouldAnimate }
}

type ProximityZone = {
  left: number
  right: number
  top: number
  bottom: number
}

export function calculateProximityZone(rect: DOMRect, proximity: number): ProximityZone {
  return {
    left: rect.left - proximity,
    right: rect.right + proximity,
    top: rect.top - proximity,
    bottom: rect.bottom + proximity,
  }
}

export function isWithinZone(position: PointerPosition, zone: ProximityZone): boolean {
  return (
    position.x >= zone.left &&
    position.x <= zone.right &&
    position.y >= zone.top &&
    position.y <= zone.bottom
  )
}

export function calculateAttractorPosition(
  cursorPosition: PointerPosition,
  containerRect: DOMRect,
): { x: number; y: number } {
  const localX = cursorPosition.x - containerRect.left
  const localY = cursorPosition.y - containerRect.top

  const centerX = containerRect.width / 2
  const centerY = containerRect.height / 2

  return { x: localX - centerX, y: localY - centerY }
}
