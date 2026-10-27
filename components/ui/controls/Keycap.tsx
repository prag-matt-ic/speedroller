'use client'

import { type FC, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

type KeycapProps = {
  children: ReactNode
  /** Pressed state for the live movement HUD; static hints leave it false. */
  isActive?: boolean
  className?: string
}

/**
 * One keyboard cap. The surface is solid so it reads against the track, the pale dev backdrop and
 * the countdown card alike.
 */
export const Keycap: FC<KeycapProps> = ({ children, isActive = false, className }) => (
  <span
    className={twMerge(
      'flex items-center justify-center rounded-md border bg-stone-900 font-mono text-xs font-bold transition-colors',
      isActive
        ? 'border-amber-500 text-amber-100'
        : 'border-stone-700 text-stone-500',
      className,
    )}>
    {children}
  </span>
)

export default Keycap
