'use client'

import { type LucideIcon, type LucideProps } from 'lucide-react'
import type { ButtonHTMLAttributes, FC, PointerEventHandler, ReactNode } from 'react'
import { useRef } from 'react'
import { twMerge } from 'tailwind-merge'

import {
  BUTTON_ATTRACTOR_CONFIG,
  useSurfaceAttractor,
} from '@/components/ui/attractors/useSurfaceAttractor'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  className?: string
  startIcon?: LucideIcon
  endIcon?: LucideIcon
  iconClassName?: string
}

const BASE_CLASSES =
  'group relative flex size-fit tracking-wide cursor-pointer leading-none disabled:opacity-70 uppercase items-center disabled:cursor-not-allowed justify-center rounded-full font-semibold overflow-hidden transition-colors duration-200'

const SIZE_CLASSES = {
  sm: 'gap-1.5 px-3 py-1.5 text-xs lg:px-4 lg:py-2 lg:text-sm',
  md: 'gap-2 px-4 py-2 text-sm lg:px-6 lg:py-2.5 lg:text-base',
  lg: 'gap-3.5 px-6 py-2 text-base lg:px-8 lg:py-3 lg:text-lg',
}

const ICON_SIZE_CLASSES = {
  sm: 'size-3.5 xl:size-4',
  md: 'size-4 xl:size-5',
  lg: 'size-5 xl:size-6',
}

const ICON_PROPS: Partial<LucideProps> = {
  strokeWidth: 1.5,
  className: 'transition-colors',
}

const VARIANT_CLASSES: Record<ButtonProps['variant'], string> = {
  primary:
    'border border-amber-100/20 bg-linear-0 hover:text-amber-200 from-amber-400/5 to-amber-400/10 text-white hover:border-amber-300/40 hover:from-amber-400/10 hover:to-amber-400/15',
  secondary:
    'border border-white/5 bg-radial from-white/3 to-white/6 text-white/70 hover:from-white/6 hover:to-white/12 hover:text-white',
}

const ATTRACTOR_CONTAINER_CLASSES =
  'pointer-events-none absolute inset-0 -z-10 flex items-center justify-center'

const ATTRACTOR_GLOW_CLASSES = 'size-20 rounded-full bg-amber-600/40 blur-2xl opacity-0'

//     animation: spin 3s
// linear infinite;
//     background: conic-gradient(from 0 at 50% 50%, #06090A 100deg, #FF0137 180deg, #06090A 260deg);

const Button: FC<ButtonProps> = ({
  variant = 'primary',
  size = 'lg',
  children,
  className,
  startIcon: StartIcon,
  endIcon: EndIcon,
  iconClassName,
  onPointerEnter,
  onPointerLeave,
  ...props
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const attractorRef = useRef<HTMLDivElement>(null)
  const isPrimary = variant === 'primary'

  const { containerHandlers, shouldAnimate } = useSurfaceAttractor({
    isEnabled: isPrimary,
    containerRef: buttonRef,
    attractorRef,
    config: BUTTON_ATTRACTOR_CONFIG,
  })

  const mergedOnPointerEnter: PointerEventHandler<HTMLButtonElement> | undefined = isPrimary
    ? (event) => {
        containerHandlers?.onPointerEnter?.()
        onPointerEnter?.(event)
      }
    : onPointerEnter

  const mergedOnPointerLeave: PointerEventHandler<HTMLButtonElement> | undefined = isPrimary
    ? (event) => {
        containerHandlers?.onPointerLeave?.()
        onPointerLeave?.(event)
      }
    : onPointerLeave

  return (
    <button
      ref={buttonRef}
      onPointerEnter={mergedOnPointerEnter}
      onPointerLeave={mergedOnPointerLeave}
      className={twMerge(BASE_CLASSES, SIZE_CLASSES[size], VARIANT_CLASSES[variant], className)}
      {...props}>
      {isPrimary ? (
        <div className={ATTRACTOR_CONTAINER_CLASSES} aria-hidden="true">
          <div
            ref={attractorRef}
            className={twMerge(ATTRACTOR_GLOW_CLASSES, !shouldAnimate && 'hidden')}
          />
        </div>
      ) : null}
      {!!StartIcon && (
        <StartIcon
          {...ICON_PROPS}
          className={twMerge(ICON_SIZE_CLASSES[size], iconClassName)}
        />
      )}
      {children}
      {!!EndIcon && (
        <EndIcon {...ICON_PROPS} className={twMerge(ICON_SIZE_CLASSES[size], iconClassName)} />
      )}
    </button>
  )
}

export default Button
