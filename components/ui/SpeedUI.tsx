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
    <div className="flex flex-col items-center gap-1.5 place-self-center">
      <SpeedDial className="size-24 xl:size-28" strokeWidth={6} />
      <div
        className={twJoin(
          'flex items-center gap-1 rounded-full border bg-stone-900 px-2.5 py-1',
          hasCollectedRings ? 'border-amber-600 text-amber-300' : 'border-stone-700 text-stone-400',
        )}>
        <Circle className="size-3" strokeWidth={3} aria-hidden="true" />
        <span className="font-mono text-sm leading-none font-bold tabular-nums xl:text-base">
          {collectedRingCount}
        </span>
        <span className="text-[9px] leading-none font-semibold tracking-wider text-stone-400 uppercase xl:text-[10px]">
          Rings
        </span>
      </div>
    </div>
  )
}
export default SpeedUI
