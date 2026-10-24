'use client'
import gsap from 'gsap'
import { LogOutIcon } from 'lucide-react'
import { type FC, type Ref, useEffect } from 'react'
import { type TransitionStatus } from 'react-transition-group'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import { SoundFX, useSoundStore } from '@/components/SoundProvider'
import Button from '@/components/ui/Button'
import { usePageHidden } from '@/hooks/usePageVisibility'
import { SpeedRunStage } from '@/stores/types'

type Props = {
  ref: Ref<HTMLDivElement>
  transitionStatus: TransitionStatus
}

const COUNTDOWN_STEP_SECONDS = 1
const COUNTDOWN_NUMBERS = ['#countdown-3', '#countdown-2', '#countdown-1', '#countdown-go']

/**
 * 3-2-1-GO over the live track. The sequence waits for platform readiness, warmup and grid
 * placement, restarts from three after a hidden tab, and validates its attempt before completing.
 */
export const SpeedRunCountdownOverlay: FC<Props> = ({ ref, transitionStatus }) => {
  const speedRunStage = useGameStore((s) => s.speedRunStage)
  const attemptId = useGameStore((s) => s.attemptId)
  const isPlatformReady = useGameStore((s) => s.isPlatformReady)
  const isWarmupComplete = useGameStore((s) => s.isWarmupComplete)
  const playerStatus = useGameStore((s) => s.playerStatus)
  const onCountdownComplete = useGameStore((s) => s.onCountdownComplete)
  const returnToLobby = useGameStore((s) => s.returnToLobby)
  const playSoundFX = useSoundStore((s) => s.playSoundFX)
  const stopSoundFX = useSoundStore((s) => s.stopSoundFX)
  const isPageHidden = usePageHidden()

  const isPlacedOnGrid = playerStatus === 'safe'
  const canStart =
    transitionStatus === 'entered' &&
    speedRunStage === SpeedRunStage.COUNTDOWN &&
    isPlatformReady &&
    isWarmupComplete &&
    isPlacedOnGrid &&
    !isPageHidden

  useEffect(() => {
    if (!canStart) return

    playSoundFX(SoundFX.COUNTDOWN)
    const timeline = gsap.timeline({
      defaults: { ease: 'linear' },
      onComplete: () => onCountdownComplete(attemptId),
    })

    timeline
      .set(COUNTDOWN_NUMBERS, { opacity: 0 })
      .set('#countdown-3', { opacity: 1 })
      .to('#countdown-3', { opacity: 0, duration: COUNTDOWN_STEP_SECONDS })
      .set('#countdown-2', { opacity: 1 })
      .to('#countdown-2', { opacity: 0, duration: COUNTDOWN_STEP_SECONDS })
      .set('#countdown-1', { opacity: 1 })
      .to('#countdown-1', { opacity: 0, duration: COUNTDOWN_STEP_SECONDS })
      .set('#countdown-go', { opacity: 1 })

    // Kill (not revert) on interruption so a completed GO stays visible during the overlay exit,
    // while hidden tabs and cancelled attempts cannot deliver a stale callback.
    return () => {
      timeline.kill()
      stopSoundFX(SoundFX.COUNTDOWN)
    }
  }, [attemptId, canStart, onCountdownComplete, playSoundFX, stopSoundFX])

  return (
    <div
      ref={ref}
      className={twJoin(
        'pointer-events-none fixed inset-0 z-200 flex size-full flex-col items-center justify-center gap-6 transition-opacity',
        transitionStatus === 'entering' && 'opacity-100 duration-300',
        transitionStatus === 'entered' && 'opacity-100',
        transitionStatus === 'exiting' && 'opacity-0 duration-300',
        transitionStatus === 'exited' && 'opacity-0',
      )}>
      <div
        className="relative flex items-center justify-center"
        role="status"
        aria-live="assertive"
        aria-label="Race countdown">
        <CountdownNumber id="countdown-3" label="3" />
        <CountdownNumber id="countdown-2" label="2" />
        <CountdownNumber id="countdown-1" label="1" />
        <CountdownNumber id="countdown-go" label="GO" />
      </div>

      <div className="pointer-events-auto absolute inset-x-0 bottom-6 flex justify-center">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={returnToLobby}
          aria-label="Back to lobby"
          endIcon={LogOutIcon}>
          Back to lobby
        </Button>
      </div>
    </div>
  )
}

const CountdownNumber: FC<{ id: string; label: string }> = ({ id, label }) => {
  return (
    <div id={id} className="absolute text-[120px] font-black opacity-0 xl:text-[140px]">
      {label}
    </div>
  )
}
