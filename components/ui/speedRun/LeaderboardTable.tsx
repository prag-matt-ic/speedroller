'use client'
import { useQuery } from '@tanstack/react-query'
import { type FC, type ReactNode, useEffect, useMemo } from 'react'
import { twJoin, twMerge } from 'tailwind-merge'

import { getSpeedrunData, getSpeedrunPosition } from '@/app/actions'
import { useGameStore } from '@/components/GameProvider'
import type { SpeedRunDatabase } from '@/model/schema'
import { PLATFORM_VERSION } from '@/resources/rowsData'

import type { PerformanceSummary } from './speedrunPerformanceSummary'
import { getSpeedrunPerformanceSummary } from './speedrunPerformanceSummary'

const EMPTY_RUNS: SpeedRunDatabase[] = []

type Props = {
  count: number
  className?: string
  fetchLatestRun: boolean
  onPerformanceSummary?: (summary: PerformanceSummary | null) => void
}

export const LeaderboardTable: FC<Props> = ({
  count,
  className,
  fetchLatestRun,
  onPerformanceSummary,
}) => {
  const completedSpeedRuns = useGameStore(
    (s) => s.completedSpeedRuns[PLATFORM_VERSION] ?? EMPTY_RUNS,
  )
  const leaderboardFilter = useGameStore((s) => s.leaderboardFilter)
  const userSpeedRunIds = useMemo(
    () => completedSpeedRuns.map((run) => run.id),
    [completedSpeedRuns],
  )
  const latestRunId = fetchLatestRun
    ? (completedSpeedRuns[completedSpeedRuns.length - 1]?.id ?? null)
    : null

  const { data: leaderboardRuns = [], isPending: isLoadingLeaderboard } = useQuery({
    queryKey: ['speedrun-leaderboard', count, latestRunId, leaderboardFilter, PLATFORM_VERSION],
    queryFn: () => getSpeedrunData(count, leaderboardFilter, PLATFORM_VERSION),
    staleTime: 30_000,
  })

  const latestRunIsRanked =
    !!latestRunId && leaderboardRuns.some((run) => run.id === latestRunId)

  const shouldFetchRecentRun = !!latestRunId && !isLoadingLeaderboard && !latestRunIsRanked

  const { data: unrankedRecentRun } = useQuery({
    queryKey: ['speedrun-recent-run', latestRunId, leaderboardFilter, PLATFORM_VERSION],
    queryFn: () =>
      getSpeedrunPosition(latestRunId as number, leaderboardFilter, PLATFORM_VERSION),
    enabled: shouldFetchRecentRun,
    staleTime: 30_000,
  })

  // Assume a full leaderboard arrives: a shorter (or empty) result must not
  // collapse the table and reflow the surrounding dashboard grid.
  const skeletonRows = useMemo(() => Array.from({ length: count }), [count])
  const topRowCount = Math.min(count, TOP_THREE_ROW_COUNT)
  const regularRowCount = Math.max(count - TOP_THREE_ROW_COUNT, 0)
  const reservedListHeight = `calc(${topRowCount} * var(--leaderboard-top-row-height) + ${regularRowCount} * var(--leaderboard-row-height))`

  const latestRun = completedSpeedRuns[completedSpeedRuns.length - 1] ?? null

  useEffect(() => {
    if (!onPerformanceSummary) return

    if (isLoadingLeaderboard || !latestRun) {
      onPerformanceSummary(null)
      return
    }

    let previousBestTimeS: number | null = null
    if (completedSpeedRuns.length > 1) {
      let best = Number.POSITIVE_INFINITY
      for (let index = 0; index < completedSpeedRuns.length - 1; index += 1) {
        const time = completedSpeedRuns[index]?.time
        if (typeof time === 'number' && time < best) best = time
      }
      previousBestTimeS = Number.isFinite(best) ? best : null
    }

    const latestRankInTop = leaderboardRuns.findIndex((run) => run.id === latestRun.id)

    const latestRunRank: number | null =
      latestRun == null
        ? null
        : latestRankInTop >= 0
          ? latestRankInTop + 1
          : !!unrankedRecentRun && unrankedRecentRun.run.id === latestRun.id
            ? unrankedRecentRun.position
            : null

    const summary = getSpeedrunPerformanceSummary({
      latestRunTimeS: latestRun?.time ?? null,
      latestRunRank,
      leaderboardCount: count,
      leaderboardRuns,
      previousBestTimeS,
      totalRunsCompleted: completedSpeedRuns.length,
    })

    onPerformanceSummary(summary)
  }, [
    count,
    isLoadingLeaderboard,
    latestRun,
    leaderboardRuns,
    onPerformanceSummary,
    unrankedRecentRun,
    completedSpeedRuns,
  ])

  return (
    <section
      style={{ minHeight: reservedListHeight }}
      className={twMerge(
        'grid max-h-full w-full max-w-xl grid-cols-[auto_2fr_1fr_0.5fr] gap-x-4 overflow-y-auto',
        ROW_HEIGHT_VARIABLES,
        className,
      )}>
      {isLoadingLeaderboard
        ? skeletonRows.map((_, index) => <LoadingRow key={`loading-${index}`} index={index} />)
        : leaderboardRuns.map((entry, index) => (
            <LeaderboardRow
              key={entry.id}
              username={entry.username}
              time={entry.time}
              flag={entry.flag}
              position={index + 1}
              isCurrentUser={userSpeedRunIds.includes(entry.id)}
              isLatestRun={entry.id === latestRun?.id}
            />
          ))}

      {!isLoadingLeaderboard && !!unrankedRecentRun && (
        <LeaderboardRow
          key={unrankedRecentRun.run.id}
          username={unrankedRecentRun.run.username}
          time={unrankedRecentRun.run.time}
          flag={unrankedRecentRun.run.flag}
          position={unrankedRecentRun.position}
          isCurrentUser={true}
          isLatestRun={true}
        />
      )}

    </section>
  )
}

const TOP_THREE_ROW_COUNT = 3

// Heights live here so the skeleton rows and the reserved full-list height stay in sync.
const ROW_HEIGHT_VARIABLES =
  '[--leaderboard-top-row-height:3rem] [--leaderboard-row-height:2.25rem] xl:[--leaderboard-top-row-height:3.5rem] xl:[--leaderboard-row-height:2.75rem]'
const ROW_CONTAINER_CLASSES = 'relative col-span-full grid grid-cols-subgrid items-center px-2'
const TOP_3_CONTAINER_CLASSES = 'h-[var(--leaderboard-top-row-height)] text-white'
const NOT_TOP_3_CONTAINER_CLASSES = 'h-[var(--leaderboard-row-height)] text-white/90'

type RowProps = {
  username: string
  time: number
  flag: ReactNode
  position: number
  isCurrentUser: boolean
  isLatestRun?: boolean
  className?: string
}

const LeaderboardRow: FC<RowProps> = ({
  username,
  time,
  flag,
  position,
  isCurrentUser,
  isLatestRun = false,
  className,
}) => {
  const isTopThree = position <= TOP_THREE_ROW_COUNT

  return (
    <div
      className={twMerge(
        ROW_CONTAINER_CLASSES,
        position % 2 === 0 && 'bg-black/20',
        isTopThree ? TOP_3_CONTAINER_CLASSES : NOT_TOP_3_CONTAINER_CLASSES,
        isCurrentUser && 'bg-emerald-600/5 text-emerald-400',
        isLatestRun && 'z-40 border! border-emerald-600',
        className,
      )}>
      {isTopThree ? (
        <Medal position={position} />
      ) : (
        <div className="flex w-full items-center justify-center pl-1 text-center font-semibold">
          {position}.
        </div>
      )}
      <h4
        className={twJoin(
          'flex items-center text-left',
          isTopThree ? 'text-sm xl:text-base' : 'text-xs xl:text-sm',
        )}>
        {username}
      </h4>
      <div className="flex items-center justify-center text-center font-mono text-base tabular-nums">
        {time.toFixed(2)}s
      </div>
      <div className="flex items-center justify-center text-center text-xl font-bold">
        {flag ?? '?'}
      </div>
    </div>
  )
}

const LoadingRow: FC<{ index: number }> = ({ index }) => {
  const isTopThree = index < TOP_THREE_ROW_COUNT
  return (
    <div
      className={twJoin(
        ROW_CONTAINER_CLASSES,
        index % 2 === 0 && 'bg-white/1',
        isTopThree ? TOP_3_CONTAINER_CLASSES : NOT_TOP_3_CONTAINER_CLASSES,
        'animate-pulse',
      )}>
      <div className="flex w-full items-center justify-center">
        {isTopThree ? (
          <div className="size-8 rounded-full bg-white/10" />
        ) : (
          <div className="h-4 w-6 rounded bg-white/10" />
        )}
      </div>
      <div className="flex items-center">
        <div className="h-4 w-32 rounded bg-white/10" />
      </div>
      <div className="flex items-center justify-center">
        <div className="h-5 w-16 rounded bg-white/10" />
      </div>
      <div className="flex items-center justify-center">
        <div className="size-8 rounded-full bg-white/10" />
      </div>
    </div>
  )
}

const Medal: FC<{ position: number }> = ({ position }) => {
  const medalColours = ['text-amber-400', 'text-gray-300', 'text-amber-600']

  return (
    <div className="relative ml-1.25 flex size-8 items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={twJoin('absolute inset-0', medalColours[position - 1])}>
        <path
          d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"
          stroke="currentColor"
        />
        <path d="M11 12 5.12 2.2" stroke="currentColor" />
        <path d="m13 12 5.88-9.8" stroke="currentColor" />
        <path d="M8 7h8" stroke="currentColor" />
        <circle cx="12" cy="17" r="6" fill="currentColor" />
      </svg>
      <p className="absolute top-3.25 text-[14px] font-bold text-black">{position}</p>
    </div>
  )
}
