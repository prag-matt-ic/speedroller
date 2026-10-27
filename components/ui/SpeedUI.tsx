'use client'

import { Circle } from 'lucide-react'
import { type FC } from 'react'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import SpeedDial from '@/components/ui/SpeedDial'

const SpeedUI: FC = () => {
  const collectedRings = useGameStore((s) => s.collectedRings)
  const collectedRingCount = Object.keys(collectedRings).length
  const hasCollectedRings = collectedRingCount > 0

  return (
    <div className="relative flex flex-col items-center place-self-center">
      <SpeedDial className="size-24 xl:size-28" strokeWidth={6} />
      <div
        className={twJoin(
          'absolute top-full left-1/2 z-10 flex -translate-x-1/2 -translate-y-2 items-center gap-1 rounded-full border px-2.5 py-1',
          hasCollectedRings
            ? 'border-amber-300/30 bg-black/70 text-amber-300'
            : 'border-white/15 bg-black/60 text-white/70',
        )}>
        <Circle className="size-3" strokeWidth={3} aria-hidden="true" />
        <span className="font-mono text-sm leading-none font-bold tabular-nums xl:text-base">
          {collectedRingCount}
        </span>
        <span className="text-[9px] leading-none font-semibold tracking-wider uppercase opacity-70 xl:text-[10px]">
          Rings
        </span>
      </div>
    </div>
  )
}
export default SpeedUI
