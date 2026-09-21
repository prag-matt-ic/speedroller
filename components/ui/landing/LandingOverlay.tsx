'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { type FC, type TransitionEvent, useLayoutEffect, useState } from 'react'
import { twJoin } from 'tailwind-merge'

import speedroller from '@/assets/brand/SPEEDROLLER.svg'
import speedrollerFaint from '@/assets/brand/speedroller-faint.svg'
import { PLAYER_INITIAL_POSITION, useGameStore } from '@/components/GameProvider'
import { MOVE_HUD_CONFIG } from '@/resources/content/hud'
import { Overlay } from '@/stores/types'

const LandingControls = dynamic(() => import('./LandingControls'), { ssr: false })
const Credits = dynamic(() => import('@/components/ui/Credits'), { ssr: false })

type Props = {
  isMobile: boolean
}

const LandingOverlay: FC<Props> = ({ isMobile }) => {
  const isShowingLandingOverlay = useGameStore((s) => s.overlay === Overlay.LANDING)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const isHydrated = useGameStore((s) => s._isHydrated)
  const isPlatformReady = useGameStore((s) => s.isPlatformReady)
  const isWarmupComplete = useGameStore((s) => s.isWarmupComplete)
  const respawnPlayer = useGameStore((s) => s.respawnPlayer)
  const inputType = useGameStore((s) => s.inputType)

  const [isExiting, setIsExiting] = useState(false)

  const isLoaded = isHydrated && isPlatformReady && isWarmupComplete

  const onStart = () => {
    setIsExiting(true)
  }

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isShowingLandingOverlay) setIsExiting(false)
  }, [isShowingLandingOverlay])

  const onTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (!isExiting) return
    if (e.target !== e.currentTarget) return
    setOverlay(Overlay.NONE)
    respawnPlayer(PLAYER_INITIAL_POSITION, MOVE_HUD_CONFIG[inputType])
  }

  if (!isShowingLandingOverlay) return null

  return (
    <div
      id="landing-overlay"
      onTransitionEnd={onTransitionEnd}
      className={twJoin(
        'fixed inset-0 z-1000 grid grid-cols-1 grid-rows-2 gap-2 px-6 py-4 xl:gap-5',
        'transition-opacity delay-50 duration-300 ease-out motion-reduce:duration-0',
        isExiting ? 'opacity-0' : 'opacity-100',
      )}>
      <div
        className={twJoin(
          'absolute inset-0 bg-black transition-opacity delay-400 duration-500',
          isLoaded ? 'opacity-0' : 'opacity-100',
        )}
      />

      <header className="relative mx-auto flex w-xl max-w-full flex-col justify-center gap-2 self-end overflow-hidden xl:w-4xl">
        <div className="relative h-fit w-full">
          <Image
            src={speedrollerFaint}
            alt=""
            className="relative h-fit w-full object-contain"
            priority={true}
          />
          <Image
            src={speedroller}
            alt="Speedroller"
            className="animate-reveal-logo absolute inset-0 h-fit w-full object-contain motion-reduce:transition-none"
            priority={true}
          />
        </div>
      </header>

      <LandingControls isLoaded={isLoaded} isMobile={isMobile} onStart={onStart} />
      <Credits show={isLoaded} className="absolute inset-x-5 bottom-6 xl:bottom-8" />
    </div>
  )
}

export default LandingOverlay
