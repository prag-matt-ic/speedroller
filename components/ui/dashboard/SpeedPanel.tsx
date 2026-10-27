'use client'

import { Circle } from 'lucide-react'
import { type FC } from 'react'

import SpeedDial from '@/components/ui/SpeedDial'
import Panel from '@/components/ui/panel/Panel'
import { PanelHeader } from '@/components/ui/panel/PanelHeader'

type RingsSpeedPanelProps = {
  className?: string
}

export const SpeedPanel: FC<RingsSpeedPanelProps> = ({ className }) => {
  return (
    <Panel strength={1} className={className} attractorClassName="bg-amber-400/15">
      <PanelHeader icon={Circle} label="Speed" iconClassName="text-amber-400" />
      <RingBoostInfo />
    </Panel>
  )
}

export default SpeedPanel

export const RingBoostInfo: FC = () => {
  return (
    <div className="flex w-fit max-w-2xl items-center gap-4 rounded-xl border border-amber-200/5 bg-amber-200/3 p-2">
      <div className="relative flex items-center justify-center">
        <SpeedDial className="size-18" progressOverride={0.5} strokeWidth={4} />
        <span className="pointer-events-none absolute text-[10px] tracking-[1px] text-white/70 uppercase">
          Boost
        </span>
      </div>
      <p className="text-sm leading-relaxed font-semibold text-pretty text-white xl:text-base">
        Each ring gives you a temporary boost.
        <br />
        <span className="text-balance text-white/60">Falling off resets it.</span>
      </p>
    </div>
  )
}
