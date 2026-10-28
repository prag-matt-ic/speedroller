'use client'

import { Compass, type LucideIcon, Timer } from 'lucide-react'
import { type FC, type ReactNode } from 'react'
import { twJoin, twMerge } from 'tailwind-merge'

import Panel from '@/components/ui/panel/Panel'

export type DashboardTabId = 'main' | 'speedrun' | 'test'

type ModeTabsProps = {
  className?: string
  activeTab: DashboardTabId
  onTabChange: (tab: DashboardTabId) => void
}

type ModeTabConfig = {
  id: DashboardTabId
  Icon: LucideIcon
  label: string
  description: ReactNode
}

const CORE_TABS: ModeTabConfig[] = [
  {
    id: 'main',
    Icon: Compass,
    label: 'Explore',
    description: 'Learn the level and discover bonuses to unlock.',
  },
  {
    id: 'speedrun',
    Icon: Timer,
    label: 'Speedroll',
    description: 'Race against others to the finish line.',
  },
] as const

const MODE_TABS: ModeTabConfig[] =
  process.env.NODE_ENV === 'development' ? CORE_TABS : CORE_TABS

export const ModeTabs: FC<ModeTabsProps> = ({ className, activeTab, onTabChange }) => {
  return (
    <Panel
      className={twMerge(
        'flex h-32 flex-col gap-3 rounded-xl p-4 md:flex-row lg:rounded-2xl',
        className,
      )}>
      {MODE_TABS.map(({ id, Icon, label, description }) => {
        const isSelected = activeTab === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === activeTab) return
              onTabChange(id)
            }}
            className={twJoin(
              'flex flex-1 flex-col items-start rounded-xl p-4 text-left text-white transition',
              isSelected
                ? 'bg-amber-300/5 ring ring-amber-600'
                : 'bg-white/5 opacity-70 hover:opacity-100',
            )}>
            <div className="mb-2 flex items-center gap-2.5">
              <Icon className="size-6" />
              <span className="text-lg font-bold">{label}</span>
            </div>
            <p className="max-w-sm text-base font-medium text-balance opacity-80">
              {description}
            </p>
          </button>
        )
      })}
    </Panel>
  )
}

export default ModeTabs
