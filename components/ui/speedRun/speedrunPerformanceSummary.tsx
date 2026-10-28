import { type ReactNode } from 'react'

import type { SpeedRunDatabase } from '@/model/schema'

export type PerformanceSummaryInput = {
  latestRunTimeS: number | null
  latestRunRank: number | null
  leaderboardCount: number
  leaderboardRuns: SpeedRunDatabase[]
  previousBestTimeS: number | null
  totalRunsCompleted: number
}

export type PerformanceSummary = {
  heading: ReactNode
  description: ReactNode
  isPersonalBest: boolean
  personalBestDescription: ReactNode | null
}

export const getSpeedrunPerformanceSummary = ({
  latestRunTimeS,
  latestRunRank,
  leaderboardCount = 10,
  leaderboardRuns,
  previousBestTimeS,
  totalRunsCompleted,
}: PerformanceSummaryInput): PerformanceSummary => {
  const bestLeaderboardTimeS =
    leaderboardRuns.length > 0 ? (leaderboardRuns[0]?.time ?? null) : null

  const leaderboardCutoffTimeS =
    leaderboardRuns.length >= leaderboardCount
      ? (leaderboardRuns[leaderboardCount - 1]?.time ?? null)
      : null

  if (!latestRunTimeS || latestRunTimeS <= 0) {
    return {
      heading: 'Great run!',
      description:
        'You completed the speedrun. Your time will appear here once it is available.',
      isPersonalBest: false,
      personalBestDescription: null,
    }
  }

  const formattedTime = latestRunTimeS.toFixed(2)
  const isFirstRun = totalRunsCompleted <= 1
  const personalBestDiff =
    typeof previousBestTimeS === 'number' ? previousBestTimeS - latestRunTimeS : null

  const isPersonalBest = personalBestDiff !== null && personalBestDiff > 0.005

  const personalBestDescription =
    isPersonalBest && personalBestDiff !== null && typeof previousBestTimeS === 'number' ? (
      <>
        You beat your previous best of <b>{previousBestTimeS.toFixed(2)}</b>s by{' '}
        <b>{personalBestDiff.toFixed(2)}</b>s.
      </>
    ) : null

  const appendPersonalBest = (content: ReactNode): ReactNode => {
    if (!isPersonalBest || !personalBestDescription) return content
    return (
      <>
        {content}
        <br />
        <br />
        <>
          <b>New personal best!</b> {personalBestDescription}
        </>
      </>
    )
  }

  const buildSummary = (
    heading: ReactNode,
    description: ReactNode,
    options: { appendPersonalBest?: boolean } = {},
  ): PerformanceSummary => ({
    heading,
    description:
      options.appendPersonalBest === false ? description : appendPersonalBest(description),
    isPersonalBest,
    personalBestDescription,
  })

  if (latestRunRank === 1) {
    return buildSummary(
      'New world record!!!',
      <>
        You set <b>the fastest time ever recorded</b> and claimed the <b>#1</b> spot on the
        global leaderboard.
      </>,
    )
  }

  if (latestRunRank && latestRunRank > 1 && latestRunRank <= 3) {
    let deltaToFirst: string | null = null
    if (bestLeaderboardTimeS && bestLeaderboardTimeS > 0) {
      const diff = latestRunTimeS - bestLeaderboardTimeS
      if (diff > 0.005) {
        deltaToFirst = diff.toFixed(2)
      }
    }

    return buildSummary(
      'Podium finish!!!',
      deltaToFirst ? (
        <>
          You are now <b>#{latestRunRank}</b> globally with {formattedTime}s, just{' '}
          {deltaToFirst}s behind the world record.
        </>
      ) : (
        <>
          You are now <b>#{latestRunRank}</b> globally with {formattedTime}s on the global
          leaderboard.
        </>
      ),
    )
  }

  if (latestRunRank && latestRunRank > 3 && latestRunRank <= leaderboardCount) {
    return buildSummary(
      'Elite speedroller!',
      <>
        You reached <b>#{latestRunRank}</b> on the global leaderboard with {formattedTime}s.
        Excellent work!
      </>,
    )
  }

  if (latestRunRank && latestRunRank > leaderboardCount) {
    let timeToCut: string | null = null
    if (leaderboardCutoffTimeS && latestRunTimeS) {
      const diff = latestRunTimeS - leaderboardCutoffTimeS
      if (diff > 0.005) {
        timeToCut = diff.toFixed(2)
      }
    }

    return buildSummary(
      'Nice run!',
      <>
        You placed <b>#{latestRunRank}</b> globally with {formattedTime}s.
        <br />
        <br />
        {timeToCut ? (
          <>
            Shave {timeToCut}s off to break into the top {leaderboardCount}.
          </>
        ) : (
          <>Keep pushing to break into the top {leaderboardCount}.</>
        )}
      </>,
    )
  }

  if (isFirstRun) {
    return buildSummary(
      'First run complete!',
      `You finished your first speedrun in ${formattedTime}s. Good job!`,
    )
  }

  if (isPersonalBest && personalBestDescription) {
    return buildSummary(
      'New personal best!',
      <>
        You ran <b>{formattedTime}</b>s. {personalBestDescription}
      </>,
      { appendPersonalBest: false },
    )
  }

  return buildSummary(
    'Good effort!',
    <>
      You completed the run in <b>{formattedTime}</b>s. Keep refining your line to set a new
      personal best.
    </>,
  )
}
