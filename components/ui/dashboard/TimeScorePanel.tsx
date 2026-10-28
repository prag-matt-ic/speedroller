'use client'

import { TimerIcon } from 'lucide-react'
import { type FC } from 'react'
import { twJoin } from 'tailwind-merge'

import { SpeedRunTimeDisplay } from '@/components/ui/SpeedRunTimeDisplay'
import Panel from '@/components/ui/panel/Panel'
import { PanelHeader } from '@/components/ui/panel/PanelHeader'

type TimeScorePanelProps = {
  className?: string
}

export const TimeScorePanel: FC<TimeScorePanelProps> = ({ className }) => {
  return (
    <Panel
      strength={1}
      className={twJoin('flex h-full flex-col justify-between gap-3', className)}>
      <PanelHeader icon={TimerIcon} label="Your Time" />
      <SpeedRunTimeDisplay className="font-mono text-2xl font-medium xl:text-4xl" />
    </Panel>
  )
}

export default TimeScorePanel
