'use client'

import { type FC, useCallback, useEffect } from 'react'
import { twJoin } from 'tailwind-merge'

import { GameProvider, useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { MultiplayerProvider } from '@/components/multiplayer/MultiplayerProvider'
import { PerformanceProvider } from '@/components/PerformanceProvider'
import { QueryProvider } from '@/components/QueryProvider'
import { SoundProvider } from '@/components/SoundProvider'
import Timer from '@/components/Timer'
import UI from '@/components/ui/UI'
import { Overlay, SpeedRunStage } from '@/stores/types'
import { RACE_MAX_SPEED } from '@/utils/platform/raceSpeed'

/** Dev previews never submit a run. */
const discardSpeedRun = async () => null

const DEV_RING_COUNT = 7
const DEV_RING_LIMIT = 20
const DEV_SPEED = Math.round(RACE_MAX_SPEED * 0.6)
const DEV_PALE_BACKGROUND = '#e7e1d6'

const createRings = (count: number): Record<string, true> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`${index}:${index}`, true]),
  )

/**
 * Seeds a live race with no player body behind it. The page only renders UI, so it also stands in
 * for the missing platform: it marks the floor ready and settles every respawn the store requests.
 */
const useFakeRace = () => {
  const gameStoreAPI = useGameStoreAPI()

  useEffect(() => {
    gameStoreAPI.setState({
      speedRunStage: SpeedRunStage.RUNNING,
      overlay: Overlay.NONE,
      attemptId: 1,
      attemptStartedAtMs: performance.now(),
      speedRunTimeCS: 0,
      playerStatus: 'safe',
      isPlatformReady: true,
      isWarmupComplete: true,
      collectedRings: createRings(DEV_RING_COUNT),
      playerSpeedUnits: DEV_SPEED,
    })
  }, [gameStoreAPI])

  useEffect(
    () =>
      gameStoreAPI.subscribe(
        (state) => state.playerStatus,
        (playerStatus) => {
          if (playerStatus === 'respawning') gameStoreAPI.setState({ playerStatus: 'safe' })
        },
      ),
    [gameStoreAPI],
  )
}

type StageButtonProps = {
  label: string
  isActive: boolean
  onClick: () => void
}

const StageButton: FC<StageButtonProps> = ({ label, isActive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={isActive}
    className={twJoin(
      'rounded-md px-2 py-1 text-[11px] font-semibold tracking-wide uppercase transition-colors',
      isActive ? 'bg-stone-900 text-stone-50' : 'text-stone-600 hover:bg-stone-900/10',
    )}>
    {label}
  </button>
)

const DevToolbar: FC = () => {
  const gameStoreAPI = useGameStoreAPI()
  const speedRunStage = useGameStore((s) => s.speedRunStage)
  const ringCount = useGameStore((s) => Object.keys(s.collectedRings).length)
  const speedUnits = useGameStore((s) => s.playerSpeedUnits)

  const applyStage = useCallback(
    (stage: SpeedRunStage) => {
      const attemptBase = {
        attemptId: gameStoreAPI.getState().attemptId + 1,
        playerStatus: 'safe' as const,
        isPlatformReady: true,
        isWarmupComplete: true,
        speedRunTimeCS: 0,
      }

      if (stage === SpeedRunStage.RUNNING) {
        gameStoreAPI.setState({
          ...attemptBase,
          speedRunStage: stage,
          overlay: Overlay.NONE,
          attemptStartedAtMs: performance.now(),
        })
        return
      }

      gameStoreAPI.setState({
        ...attemptBase,
        speedRunStage: stage,
        overlay:
          stage === SpeedRunStage.COUNTDOWN ? Overlay.SPEEDRUN_COUNTDOWN : Overlay.NONE,
        attemptStartedAtMs: null,
      })
    },
    [gameStoreAPI],
  )

  const setRings = (count: number) =>
    gameStoreAPI.setState({ collectedRings: createRings(count) })
  const setSpeed = (speedUnitsValue: number) =>
    gameStoreAPI.setState({ playerSpeedUnits: speedUnitsValue })

  return (
    <aside
      className="fixed bottom-4 left-4 z-[600] flex flex-col gap-2.5 rounded-xl border border-stone-900/10 bg-white/85 p-3 shadow-lg backdrop-blur"
      style={{ colorScheme: 'light' }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold tracking-[0.18em] text-stone-500 uppercase">
          Race UI
        </span>
        <span className="rounded-full bg-stone-900/5 px-2 py-0.5 text-[10px] font-semibold text-stone-500 uppercase">
          dev
        </span>
      </div>

      <div className="flex items-center gap-1">
        <StageButton
          label="Lobby"
          isActive={speedRunStage === SpeedRunStage.LOBBY}
          onClick={() => applyStage(SpeedRunStage.LOBBY)}
        />
        <StageButton
          label="Countdown"
          isActive={speedRunStage === SpeedRunStage.COUNTDOWN}
          onClick={() => applyStage(SpeedRunStage.COUNTDOWN)}
        />
        <StageButton
          label="Running"
          isActive={speedRunStage === SpeedRunStage.RUNNING}
          onClick={() => applyStage(SpeedRunStage.RUNNING)}
        />
      </div>

      <label className="flex items-center gap-2 text-[10px] font-semibold tracking-wider text-stone-500 uppercase">
        Rings
        <input
          type="range"
          min={0}
          max={DEV_RING_LIMIT}
          step={1}
          value={Math.min(ringCount, DEV_RING_LIMIT)}
          onChange={(event) => setRings(Number(event.target.value))}
          className="w-28 accent-stone-800"
        />
        <span className="w-5 text-right text-[11px] tabular-nums text-stone-700">
          {ringCount}
        </span>
      </label>

      <label className="flex items-center gap-2 text-[10px] font-semibold tracking-wider text-stone-500 uppercase">
        Speed
        <input
          type="range"
          min={0}
          max={RACE_MAX_SPEED}
          step={1}
          value={Math.round(speedUnits)}
          onChange={(event) => setSpeed(Number(event.target.value))}
          className="w-28 accent-stone-800"
        />
        <span className="w-5 text-right text-[11px] tabular-nums text-stone-700">
          {Math.round(speedUnits)}
        </span>
      </label>
    </aside>
  )
}

const Inspection: FC = () => {
  useFakeRace()

  return (
    <>
      <div className="fixed inset-0 bg-stone-600"  />
      <Timer />
      <UI isMobile={false} />
      <DevToolbar />
    </>
  )
}

const RaceUIInspection: FC = () => (
  <SoundProvider>
    <QueryProvider>
      <GameProvider
        isMobile={false}
        insertSpeedRun={discardSpeedRun}>
        <PerformanceProvider isMobile={false}>
          <MultiplayerProvider>
            <Inspection />
          </MultiplayerProvider>
        </PerformanceProvider>
      </GameProvider>
    </QueryProvider>
  </SoundProvider>
)

export default RaceUIInspection
