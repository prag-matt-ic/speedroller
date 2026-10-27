'use client'
import { Joystick, Keyboard, LogOutIcon, RotateCcwIcon, SmilePlus, Trophy } from 'lucide-react'
import { type FC, type RefObject, useState } from 'react'
import { type TransitionStatus } from 'react-transition-group'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import Button from '@/components/ui/Button'
import { ButtonGroup } from '@/components/ui/ButtonGroup'
import { PointerProvider } from '@/components/ui/PointerProvider'
import { FeedbackPanel } from '@/components/ui/dashboard/FeedbackPanel'
import { RingsPanel } from '@/components/ui/dashboard/RingsPanel'
import TimeScorePanel from '@/components/ui/dashboard/TimeScorePanel'
import { TimesFallenPanel } from '@/components/ui/dashboard/TimesFallenPanel'
import Panel from '@/components/ui/panel/Panel'
import { PanelHeader } from '@/components/ui/panel/PanelHeader'
import { LeaderboardTable } from '@/components/ui/speedRun/LeaderboardTable'
import { type PerformanceSummary } from '@/components/ui/speedRun/speedrunPerformanceSummary'
import { useWebShare } from '@/hooks/useWebShare'
import { InputType, type SaveStatus } from '@/stores/types'

type Props = {
  ref: RefObject<HTMLDivElement | null>
  transitionStatus: TransitionStatus
  isMobile: boolean
}

// Fullscreen overlay shown at the end of a speedrun
export const SpeedrunEndOverlay: FC<Props> = ({ ref, transitionStatus, isMobile }) => {
  const retryRace = useGameStore((s) => s.retryRace)
  const returnToLobby = useGameStore((s) => s.returnToLobby)
  const attemptResult = useGameStore((s) => s.attemptResult)
  const saveStatus = useGameStore((s) => s.saveStatus)
  const speedRunTimeCS = useGameStore((s) => s.speedRunTimeCS)
  const leaderboardFilter = useGameStore((s) => s.leaderboardFilter)
  const setLeaderboardFilter = useGameStore((s) => s.setLeaderboardFilter)
  const { handleShare, isShareSupported } = useWebShare()

  const [performanceSummary, setPerformanceSummary] = useState<PerformanceSummary | null>(null)
  const resultTimeSeconds = attemptResult?.timeSeconds ?? speedRunTimeCS / 100
  const canSummariseSavedResult = saveStatus === 'saved'
  // Historical runs must not be presented as this attempt's comparison while it is still saving
  // or after the save failed.
  const displayedPerformanceSummary = canSummariseSavedResult ? performanceSummary : null

  return (
    <div
      ref={ref}
      className={twJoin(
        'fixed inset-0 z-500 flex items-center justify-center overflow-hidden px-18 transition-opacity duration-200',
        transitionStatus === 'entering' && 'opacity-0',
        transitionStatus === 'entered' && 'opacity-100',
        transitionStatus === 'exiting' && 'opacity-0',
      )}>
      <PointerProvider isMobile={isMobile}>
        <section className="mx-auto grid max-h-full w-full max-w-xl grid-cols-1 gap-2 overflow-y-auto px-2 py-6 xl:max-w-6xl xl:grid-cols-2 xl:gap-3">
          <Panel className="shrink-0" strength={2}>
            <h2 className="text-2xl font-bold lg:text-4xl">
              {displayedPerformanceSummary?.heading ?? 'Race complete'}
            </h2>
            <p className="mt-3 max-w-md text-sm text-white/80 xl:text-lg">
              {displayedPerformanceSummary?.description ?? 'Your time is shown below.'}
            </p>
            <p
              aria-live="polite"
              className={twJoin(
                'mt-2 text-sm font-semibold',
                saveStatus === 'failed' ? 'text-amber-300' : 'text-white/60',
              )}>
              {SAVE_STATUS_LABELS[saveStatus]}
            </p>
          </Panel>

          <Panel
            strength={3}
            className="row-span-3 row-start-3 xl:col-start-2 xl:row-start-1"
            attractorClassName="bg-emerald-400/15">
            <PanelHeader icon={Trophy} label="Leaderboard">
              <ButtonGroup
                value={leaderboardFilter}
                onChange={setLeaderboardFilter}
                items={[
                  { label: 'Keyboard', value: InputType.KEYS, Icon: Keyboard },
                  { label: 'Joystick', value: InputType.JOYSTICK, Icon: Joystick },
                ]}
              />
            </PanelHeader>
            <LeaderboardTable
              count={LEADERBOARD_COUNT}
              fetchLatestRun={canSummariseSavedResult}
              onPerformanceSummary={
                canSummariseSavedResult ? setPerformanceSummary : undefined
              }
            />
          </Panel>

          <div className="col-span-full grid grid-cols-3 gap-3 xl:col-span-1 xl:gap-4">
            <TimeScorePanel />
            <RingsPanel />
            <TimesFallenPanel />
          </div>

          <FeedbackPanel />

          <Panel
            className="col-span-full mx-auto flex w-fit items-center justify-center gap-3 rounded-full"
            strength={3}>
            {isShareSupported && (
              <Button
                variant="secondary"
                size="md"
                endIcon={SmilePlus}
                onClick={() => {
                  const seconds = resultTimeSeconds.toFixed(2)
                  handleShare({
                    text: `I just completed the speedrun in ${seconds}s! Can you beat my time?`,
                    url: window.location.origin,
                  })
                }}>
                Share
              </Button>
            )}
            <Button variant="primary" onClick={retryRace} endIcon={RotateCcwIcon}>
              Retry
            </Button>
            <Button
              size="md"
              variant="secondary"
              endIcon={LogOutIcon}
              onClick={returnToLobby}>
              Back to lobby
            </Button>
          </Panel>
        </section>
      </PointerProvider>
    </div>
  )
}

const LEADERBOARD_COUNT = 10

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: 'Your time is shown below.',
  saving: 'Saving your time…',
  saved: 'Time saved.',
  failed: 'Time not saved.',
}
