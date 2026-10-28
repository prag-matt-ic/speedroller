'use client'
import gsap from 'gsap'
import { ArrowDown, ArrowLeft, ArrowRight, LogOutIcon } from 'lucide-react'
import { type FC, type Ref, useEffect } from 'react'
import { type TransitionStatus } from 'react-transition-group'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import { SoundFX, useSoundStore } from '@/components/SoundProvider'
import Button from '@/components/ui/Button'
import { Keycap } from '@/components/ui/controls/Keycap'
import { usePageHidden } from '@/hooks/usePageVisibility'
import { InputType, SpeedRunStage } from '@/stores/types'

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
  const inputType = useGameStore((s) => s.inputType)
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
        transitionStatus === 'exiting' && 'opacity-0 duration-600',
        transitionStatus === 'exited' && 'opacity-0',
      )}>
      {/* The numbers are absolutely stacked, so the block needs a definite height or the hint
          rises through them. */}
      <div
        className="relative flex h-[190px] items-center justify-center xl:h-[230px]"
        role="status"
        aria-live="assertive"
        aria-label="Race countdown">
        <CountdownNumber id="countdown-3" label="3" />
        <CountdownNumber id="countdown-2" label="2" />
        <CountdownNumber id="countdown-1" label="1" />
        <CountdownNumber id="countdown-go" label="GO" />
      </div>

      <ControlHint inputType={inputType} />

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

const ControlHint: FC<{ inputType: InputType }> = ({ inputType }) => (
  <div className="flex max-w-[min(90vw,34rem)] flex-col items-center gap-2 rounded-2xl border border-stone-800 bg-stone-950 px-5 py-3 text-center">
    {inputType === InputType.JOYSTICK ? (
      <p className="text-sm text-stone-200 xl:text-base">
        Stick left and right to steer · pull down to brake
      </p>
    ) : (
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-stone-200 xl:text-base">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <Keycap className="size-6 text-stone-200">A</Keycap>
            <Keycap className="size-6 text-stone-200">D</Keycap>
          </span>
          <span className="text-xs text-stone-500">or</span>
          <span className="flex items-center gap-1">
            <Keycap className="size-6 text-stone-200">
              <ArrowLeft size={13} strokeWidth={3} aria-hidden="true" />
            </Keycap>
            <Keycap className="size-6 text-stone-200">
              <ArrowRight size={13} strokeWidth={3} aria-hidden="true" />
            </Keycap>
          </span>
          Steer
        </span>
        <span className="flex items-center gap-2">
          <Keycap className="size-6 text-stone-200">S</Keycap>
          <span className="text-xs text-stone-500">or</span>
          <Keycap className="size-6 text-stone-200">
            <ArrowDown size={13} strokeWidth={3} aria-hidden="true" />
          </Keycap>
          Brake
        </span>
      </div>
    )}
    <p className="text-xs text-stone-400 xl:text-sm">The ball accelerates automatically</p>
  </div>
)

const CountdownNumber: FC<{ id: string; label: string }> = ({ id, label }) => {
  return (
    <div
      id={id}
      className="absolute text-[180px] leading-none font-black opacity-0 xl:text-[220px]">
      {label}
    </div>
  )
}
