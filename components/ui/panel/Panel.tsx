/* eslint-disable react-hooks/refs */
'use client'

import { useInViewport, useMergedRef } from '@mantine/hooks'
import { type FC, type PropsWithChildren, useRef } from 'react'
import { twMerge } from 'tailwind-merge'

import {
  PANEL_ATTRACTOR_CONFIG,
  useSurfaceAttractor,
} from '@/components/ui/attractors/useSurfaceAttractor'

type Strength = 1 | 2 | 3

export type PanelProps = PropsWithChildren<{
  strength?: Strength
  className?: string
  enableAttractor?: boolean
  attractorClassName?: string
}>

const CONTAINER_STRENGTH_CLASSES: Record<Strength, string> = {
  1: 'border-white/10 bg-white/5',
  2: 'border-white/20 bg-white/15',
  3: 'border-white/40 bg-white/35',
}

const Panel: FC<PanelProps> = ({
  strength = 2,
  className,
  children,
  enableAttractor = true,
  attractorClassName = 'bg-teal-500/15',
}) => {
  const { ref, inViewport } = useInViewport()
  const container = useRef<HTMLDivElement>(null)
  const mergedRef = useMergedRef(ref, container)
  const attractor = useRef<HTMLDivElement>(null)

  const { containerHandlers } = useSurfaceAttractor({
    isEnabled: inViewport && enableAttractor,
    containerRef: container,
    attractorRef: attractor,
    config: PANEL_ATTRACTOR_CONFIG,
  })

  return (
    <div
      ref={mergedRef}
      {...(containerHandlers ?? {})}
      className={twMerge(
        'relative overflow-hidden rounded-2xl border p-4 backdrop-blur-sm lg:p-6',
        CONTAINER_STRENGTH_CLASSES[strength],
        className,
      )}>
      {enableAttractor && (
        <div className="pointer-events-none absolute inset-0 -z-10 hidden items-center justify-center sm:flex">
          <div
            ref={attractor}
            data-surface-glow="true"
            className={twMerge(
              'relative size-56 rounded-full opacity-0 blur-[56px]',
              attractorClassName,
            )}
          />
        </div>
      )}
      {children}
    </div>
  )
}

export default Panel
