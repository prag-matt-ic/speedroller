'use client'
import { Joystick, Keyboard, Trophy } from 'lucide-react'
import { type FC } from 'react'

import { useGameStore } from '@/components/GameProvider'
import { ButtonGroup } from '@/components/ui/ButtonGroup'
import Panel from '@/components/ui/panel/Panel'
import { PanelHeader } from '@/components/ui/panel/PanelHeader'
import { LeaderboardTable } from '@/components/ui/speedRun/LeaderboardTable'
import { InputType } from '@/stores/types'

type Props = {
  className?: string
}

// For use in the Dashboard only..

export const DashboardLeaderboardPanel: FC<Props> = ({ className }) => {
  const leaderboardFilter = useGameStore((s) => s.leaderboardFilter)
  const setLeaderboardFilter = useGameStore((s) => s.setLeaderboardFilter)

  return (
    <Panel strength={2} className={className} attractorClassName="bg-emerald-400/15">
      <PanelHeader icon={Trophy} label="Leaderboard">
        <ButtonGroup
          value={leaderboardFilter}
          onChange={setLeaderboardFilter}
          items={[
            {
              label: null,
              ariaLabel: 'Show keyboard leaderboard',
              value: InputType.KEYS,
              Icon: Keyboard,
            },
            {
              label: null,
              ariaLabel: 'Show joystick leaderboard',
              value: InputType.JOYSTICK,
              Icon: Joystick,
            },
          ]}
        />
      </PanelHeader>
      <LeaderboardTable count={10} fetchLatestRun={false} />
    </Panel>
  )
}
