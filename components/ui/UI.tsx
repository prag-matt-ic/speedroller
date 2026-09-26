'use client'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { LayoutDashboardIcon, XIcon } from 'lucide-react'
import { type FC, useRef } from 'react'
import { SwitchTransition, Transition, type TransitionStatus } from 'react-transition-group'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import CollectiblesUI from '@/components/ui/CollectiblesUI'
import SpeedUI from '@/components/ui/SpeedUI'
import MovementControls from '@/components/ui/controls/Controls'
import { Dashboard } from '@/components/ui/dashboard/Dashboard'
import MiniMap from '@/components/ui/miniMap/MiniMap'
import { GameMode, Overlay } from '@/stores/types'

import { SubscribeOverlay } from './SubscribeOverlay'
import { SpeedRunCountdownOverlay } from './speedRun/SpeedRunCountdownOverlay'
import { SpeedrunEndOverlay } from './speedRun/SpeedRunEndOverlay'
import { SpeedRunStartOverlay } from './speedRun/SpeedRunStartOverlay'
import { SpeedRunControls } from './speedRun/SpeedRunUI'

gsap.registerPlugin(useGSAP)

type Props = { isMobile: boolean }

const UI: FC<Props> = ({ isMobile }) => {
  const mode = useGameStore((s) => s.mode)
  const overlay = useGameStore((s) => s.overlay)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const isSpeedRunMode = mode === GameMode.SPEEDRUN

  const infoContainer = useRef<HTMLDivElement>(null)
  const overlayBackdropRef = useRef<HTMLDivElement>(null)
  const dashboardRef = useRef<HTMLDivElement>(null)
  const subscribeOverlay = useRef<HTMLDivElement>(null)
  const speedRunStartOverlay = useRef<HTMLDivElement>(null)
  const speedRunCountdownOverlay = useRef<HTMLDivElement>(null)
  const speedRunEndOverlay = useRef<HTMLDivElement>(null)

  return (
    <>
      <div
        className={twJoin(
          'pointer-events-none fixed inset-x-0 top-0 z-100 grid w-full grid-cols-3 grid-rows-1 items-center gap-x-2 pt-2 transition-opacity duration-300 select-none xl:pt-3',
          overlay === Overlay.LANDING ? 'opacity-0' : 'opacity-100',
        )}>
        {/* Collectibles/Timer */}
        <SwitchTransition>
          <Transition
            key={isSpeedRunMode ? 'speed-run' : 'collectibles'}
            timeout={{ enter: 0, exit: 240 }}
            appear={true}
            nodeRef={infoContainer}>
            {(status: TransitionStatus) => {
              return (
                <section
                  ref={infoContainer}
                  className={twJoin(
                    'flex h-fit items-center gap-2.5 pl-4 opacity-0 transition-opacity duration-200 xl:gap-3 xl:pl-5',
                    status === 'exiting' && 'opacity-0',
                    status === 'entering' && 'opacity-100',
                    status === 'entered' && 'opacity-100',
                  )}>
                  {isSpeedRunMode ? <SpeedRunControls /> : <CollectiblesUI />}
                </section>
              )
            }}
          </Transition>
        </SwitchTransition>

        {/* Speed/Rings */}
        <SpeedUI />
      </div>

      {/* Top Right Dashboard toggle */}
      <button
        type="button"
        onClick={() => {
          if (overlay === Overlay.DASHBOARD) {
            setOverlay(Overlay.NONE)
          } else {
            setOverlay(Overlay.DASHBOARD)
          }
        }}
        aria-label={overlay === Overlay.DASHBOARD ? 'Close dashboard' : 'Open dashboard'}
        className={twJoin(
          'group pointer-events-auto fixed top-2 right-2 z-300 flex items-center rounded-lg p-3 text-xs uppercase transition-all duration-300 outline-none hover:bg-black/30 xl:top-3 xl:right-3',
          overlay === Overlay.LANDING ? 'opacity-0' : 'opacity-100',
        )}>
        {overlay === Overlay.DASHBOARD ? (
          <XIcon className="size-6 xl:size-8" strokeWidth={1} />
        ) : (
          <LayoutDashboardIcon
            className="size-6 text-white opacity-50 transition-opacity duration-300 group-hover:opacity-100 group-focus:opacity-100 group-active:opacity-100 xl:size-8"
            strokeWidth={1}
          />
        )}
      </button>

      <MiniMap />

      <MovementControls />

      {/* Fullscreen overlays */}
      <Transition
        in={overlay !== Overlay.NONE}
        timeout={{ enter: 0, exit: 300 }}
        mountOnEnter={true}
        unmountOnExit={true}
        nodeRef={overlayBackdropRef}>
        {(status) => (
          <div
            ref={overlayBackdropRef}
            className={twJoin(
              'pointer-events-none fixed inset-0 z-200 bg-linear-0 from-black/25 via-black/80 to-black/25 backdrop-blur-md duration-250 xl:backdrop-blur-lg',
              status === 'entered' && 'opacity-100',
              (status === 'exiting' || status === 'exited') && 'opacity-0',
            )}
          />
        )}
      </Transition>

      <Transition
        in={overlay === Overlay.DASHBOARD}
        timeout={{ enter: 0, exit: 400 }}
        mountOnEnter={true}
        unmountOnExit={true}
        nodeRef={dashboardRef}>
        {(status) => (
          <Dashboard ref={dashboardRef} isMobile={isMobile} transitionStatus={status} />
        )}
      </Transition>

      <Transition
        in={overlay === Overlay.SUBSCRIBE}
        timeout={{ enter: 0, exit: 400 }}
        mountOnEnter={true}
        unmountOnExit={true}
        nodeRef={subscribeOverlay}>
        {(status) => <SubscribeOverlay ref={subscribeOverlay} transitionStatus={status} />}
      </Transition>

      <Transition
        in={overlay === Overlay.SPEEDRUN_START}
        timeout={{ enter: 0, exit: 500 }}
        mountOnEnter={true}
        unmountOnExit={true}
        nodeRef={speedRunStartOverlay}>
        {(status) => (
          <SpeedRunStartOverlay ref={speedRunStartOverlay} transitionStatus={status} />
        )}
      </Transition>

      <Transition
        in={overlay === Overlay.SPEEDRUN_COUNTDOWN}
        timeout={{ enter: 0, exit: 300 }}
        mountOnEnter={true}
        unmountOnExit={true}
        nodeRef={speedRunCountdownOverlay}>
        {(status) => (
          <SpeedRunCountdownOverlay ref={speedRunCountdownOverlay} transitionStatus={status} />
        )}
      </Transition>

      <Transition
        in={overlay === Overlay.SPEEDRUN_END}
        timeout={{ enter: 0, exit: 300 }}
        mountOnEnter={true}
        unmountOnExit={true}
        nodeRef={speedRunEndOverlay}>
        {(status) => (
          <SpeedrunEndOverlay
            ref={speedRunEndOverlay}
            transitionStatus={status}
            isMobile={isMobile}
          />
        )}
      </Transition>
    </>
  )
}

export default UI
