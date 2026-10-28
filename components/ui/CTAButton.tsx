'use client'

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FC,
  type ReactNode,
  useId,
} from 'react'
import { twJoin } from 'tailwind-merge'

import { PLAYER_PALETTE_INDEX, getPaletteCss } from '../palette'

const CTA_GRADIENT_OFFSETS = [0, 0.25, 0.5, 0.75, 1] as const
const CTA_GRADIENT_MODE = 'oklch'

type GradientStops = readonly [string, string, string, string, string]

const createPrimaryStops = (start = 0, end = 1): GradientStops => {
  const [s1, s2, s3, s4, s5] = CTA_GRADIENT_OFFSETS
  const range = end - start

  return [
    getPaletteCss(PLAYER_PALETTE_INDEX, start + range * s1, CTA_GRADIENT_MODE),
    getPaletteCss(PLAYER_PALETTE_INDEX, start + range * s2, CTA_GRADIENT_MODE),
    getPaletteCss(PLAYER_PALETTE_INDEX, start + range * s3, CTA_GRADIENT_MODE),
    getPaletteCss(PLAYER_PALETTE_INDEX, start + range * s4, CTA_GRADIENT_MODE),
    getPaletteCss(PLAYER_PALETTE_INDEX, start + range * s5, CTA_GRADIENT_MODE),
  ]
}

const PRIMARY_STOPS = createPrimaryStops()

const PRIMARY_GRADIENT_VARS = {
  '--stop-a': PRIMARY_STOPS[0],
  '--stop-b': PRIMARY_STOPS[1],
  '--stop-c': PRIMARY_STOPS[2],
  '--stop-d': PRIMARY_STOPS[3],
  '--stop-e': PRIMARY_STOPS[4],
} as CSSProperties

type CTAButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
}

const CTAButton: FC<CTAButtonProps> = ({
  children,
  className,
  disabled,
  type = 'button',
  ...props
}) => {
  const gradientId = useId()
  const gradientVars = PRIMARY_GRADIENT_VARS

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      style={{ width: 256, height: 54, ...gradientVars }}
      className={twJoin(
        'text-unbounded relative flex shrink-0 items-center justify-center rounded-xl transition-all duration-200',
        'bg-black/50 hover:bg-black/80',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'hover:opacity-90 focus-visible:opacity-90',
        className,
      )}>
      <svg
        width="256"
        height="54"
        viewBox="0 0 256 54"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true">
        <rect
          x="0.5"
          y="0.5"
          width="255"
          height="53"
          rx="11.5"
          stroke={`url(#${gradientId}-border)`}
        />
        <defs>
          <linearGradient
            id={`${gradientId}-border`}
            x1="0"
            y1="27"
            x2="264.356"
            y2="33.822"
            gradientUnits="userSpaceOnUse">
            {CTA_GRADIENT_OFFSETS.map((offset, i) => (
              <stop
                key={offset}
                offset={offset}
                stopColor={`var(--stop-${String.fromCharCode(97 + i)})`}
                style={{ transition: 'stop-color 200ms ease, stop-opacity 200ms ease' }}
              />
            ))}
          </linearGradient>
        </defs>
      </svg>
      <span className="relative z-10 flex items-center gap-2.5 px-3 text-base font-bold tracking-wider text-white uppercase">
        {children}
      </span>
    </button>
  )
}

export default CTAButton
