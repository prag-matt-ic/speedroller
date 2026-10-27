'use client'

import { MailIcon } from 'lucide-react'
import { type FC, type RefObject } from 'react'
import { type TransitionStatus } from 'react-transition-group'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import Credits from '@/components/ui/Credits'
import { PointerProvider } from '@/components/ui/PointerProvider'
import { DashboardLeaderboardPanel } from '@/components/ui/dashboard/LeaderboardPanel'
import { RingsPanel } from '@/components/ui/dashboard/RingsPanel'
import { SettingsPanel } from '@/components/ui/dashboard/SettingsPanel'
import { SpeedPanel } from '@/components/ui/dashboard/SpeedPanel'
import { UsernamePanel } from '@/components/ui/dashboard/UsernamePanel'
import Panel from '@/components/ui/panel/Panel'
import { Overlay } from '@/stores/types'

type DashboardProps = {
  ref: RefObject<HTMLElement | null>
  isMobile: boolean
  transitionStatus: TransitionStatus
}

export const Dashboard: FC<DashboardProps> = ({ ref, isMobile, transitionStatus }) => {
  const isSubscribed = useGameStore((s) => s.isSubscribed)
  const setOverlay = useGameStore((s) => s.setOverlay)
  return (
    <PointerProvider isMobile={isMobile}>
      <aside
        ref={ref}
        className={twJoin(
          'fixed inset-0 z-200 flex items-center justify-center overflow-hidden px-18 transition-opacity duration-200',
          transitionStatus === 'entered' && 'opacity-100',
          transitionStatus === 'exiting' && 'opacity-0',
          transitionStatus === 'exited' && 'opacity-0',
        )}>
        <div className="mx-auto grid max-h-full w-full max-w-xl grid-cols-1 gap-2 overflow-y-auto px-2 py-6 xl:max-w-6xl xl:grid-cols-2 xl:gap-3">
          {isSubscribed ? (
            <UsernamePanel />
          ) : (
            <div className="col-span-1 grid grid-cols-4 gap-2">
              <UsernamePanel className="col-span-3" />
              <Panel className="flex items-center justify-center">
                <button
                  className="relative rounded-xl bg-black/80 p-3 ring ring-amber-200/30 hover:ring-amber-400"
                  onClick={() => setOverlay(Overlay.SUBSCRIBE)}>
                  <MailIcon strokeWidth={1.5} size={24} className="text-white" />
                  <div className="absolute -top-1.5 -right-1.5 size-3 rounded-full bg-red-500" />
                </button>
              </Panel>
            </div>
          )}
          <DashboardLeaderboardPanel className="row-span-3" />
          <div className="col-span-1 grid grid-cols-3 gap-2">
            <RingsPanel />
            <SpeedPanel className="col-span-2" />
          </div>
          <SettingsPanel />

          <Credits show={transitionStatus === 'entered'} className="col-span-full mt-8" />
        </div>
      </aside>
    </PointerProvider>
  )
}
