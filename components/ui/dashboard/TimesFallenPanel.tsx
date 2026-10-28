'use client'
import { SkullIcon } from 'lucide-react'
import { type FC } from 'react'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import Panel from '@/components/ui/panel/Panel'
import { PanelHeader } from '@/components/ui/panel/PanelHeader'

type Props = {
  className?: string
}

export const TimesFallenPanel: FC<Props> = ({ className }) => {
  const fallCount = useGameStore((s) => s.outOfBoundsEvents.length)

  return (
    <Panel
      strength={1}
      className={twJoin('flex flex-col justify-between gap-3', className)}
      attractorClassName="bg-red-500/20">
      <PanelHeader icon={SkullIcon} iconClassName="text-red-300" label="Accidents" />
      <p
        className={twJoin(
          'text-3xl font-bold xl:text-4xl',
          fallCount > 0 ? 'text-red-400' : 'text-neutral-400',
        )}>
        {fallCount}
      </p>
    </Panel>
  )
}
