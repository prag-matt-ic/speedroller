'use client'
import { LogOutIcon, RotateCcwIcon } from 'lucide-react'
import { type FC } from 'react'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import { useOptionalMultiplayer } from '@/components/multiplayer/MultiplayerProvider'
import Button from '@/components/ui/Button'
import { SpeedRunTimeDisplay } from '@/components/ui/SpeedRunTimeDisplay'
import { SpeedRunStage } from '@/stores/types'

export const SpeedRunTimer: FC = () => {
  const speedRunStatus = useGameStore((s) => s.speedRunStage)

  const isFinished =
    speedRunStatus === SpeedRunStage.SUBMITTING || speedRunStatus === SpeedRunStage.END
  if (isFinished) return null

  const isWaitingForGo =
    speedRunStatus === SpeedRunStage.LOBBY ||
    speedRunStatus === SpeedRunStage.START ||
    speedRunStatus === SpeedRunStage.COUNTDOWN
  return (
    <div className="flex items-center gap-2">
      <div
        className={twJoin(
          'size-2.5 rounded-full',
          isWaitingForGo ? 'bg-amber-400' : 'bg-emerald-500',
        )}
      />
      <SpeedRunTimeDisplay className="font-mono text-2xl leading-none font-semibold tracking-tight lg:text-4xl" />
    </div>
  )
}

export const SpeedRunControls: FC = () => {
  const multiplayer = useOptionalMultiplayer()
  const isMultiplayer = useGameStore(state => state.multiplayerRaceId !== null)
  const speedRunStatus = useGameStore((s) => s.speedRunStage)
  const retryRace = useGameStore((s) => s.retryRace)
  const returnToLobby = useGameStore((s) => s.returnToLobby)

  const isDisabled = speedRunStatus !== SpeedRunStage.RUNNING

  return (
    <div className="pointer-events-auto flex size-fit items-center justify-center gap-2.5">
      <Button
        size="sm"
        variant="secondary"
        title="Back to lobby"
        aria-label="Back to lobby"
        disabled={isDisabled}
        className="aspect-square!"
        onClick={isMultiplayer ? multiplayer?.leave : returnToLobby}>
        <LogOutIcon size={20} strokeWidth={2} />
      </Button>

      {!isMultiplayer && <Button
        variant="secondary"
        size="sm"
        onClick={retryRace}
        title="Restart"
        aria-label="Restart race"
        disabled={isDisabled}
        className="aspect-square!">
        <RotateCcwIcon size={20} strokeWidth={2} />
      </Button>}

      <SpeedRunTimer />
    </div>
  )
}
