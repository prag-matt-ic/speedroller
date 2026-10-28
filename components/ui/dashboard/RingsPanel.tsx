'use client'

import { Circle } from 'lucide-react'
import { type FC, useMemo } from 'react'
import { twMerge } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import Panel from '@/components/ui/panel/Panel'
import { PanelHeader } from '@/components/ui/panel/PanelHeader'

type RingsPanelProps = {
  className?: string
}

export const RingsPanel: FC<RingsPanelProps> = ({ className }) => {
  const collectedRings = useGameStore((s) => s.collectedRings)
  const totalRingsCount = useGameStore((s) => s.totalCounts.rings)

  const collectedRingCount = useMemo(() => Object.keys(collectedRings).length, [collectedRings])

  const progress = totalRingsCount > 0 ? (collectedRingCount / totalRingsCount) * 100 : 0

  return (
    <Panel
      strength={1}
      className={twMerge('flex h-full flex-col justify-between', className)}
      attractorClassName="bg-amber-400/15">
      <PanelHeader icon={Circle} label="Rings" iconClassName="text-amber-400" />
      <div>
        <div className="mb-2 font-mono text-2xl font-medium text-amber-400 lg:text-3xl">
          {collectedRingCount}
          <span className="text-base text-amber-100/50 lg:text-lg">/{totalRingsCount}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-amber-200/10">
          <div
            className="h-1 rounded-full bg-linear-to-r from-amber-500 to-amber-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </Panel>
  )
}
