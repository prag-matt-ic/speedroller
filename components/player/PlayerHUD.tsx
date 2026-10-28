'use client'

import { Html } from '@react-three/drei'
import gsap from 'gsap'
import {
  type CSSProperties,
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { SwitchTransition, Transition, type TransitionStatus } from 'react-transition-group'
import { twJoin } from 'tailwind-merge'

import { useGameStore } from '@/components/GameProvider'
import { getPaletteHex } from '@/components/palette'
import { useConfirmationProgress } from '@/hooks/useConfirmationProgress'
import { CollectibleID } from '@/model/schema'
import { GEMS_COLOURS_BY_ID } from '@/resources/colours'


const defaultGemColour = GEMS_COLOURS_BY_ID[CollectibleID.DesignTools].colour

const PlayerHUD: FC = () => {
  const confirmingCollectible = useGameStore((s) => s.confirmingCollectible)
  const confirmingPaletteIndex = useGameStore((s) => s.confirmingPaletteIndex)
  const hudIndicator = useGameStore((s) => s.hudIndicator)
  const setHudIndicator = useGameStore((s) => s.setHudIndicator)

  const showBar = confirmingCollectible !== null || confirmingPaletteIndex !== null
  const showContent = !!hudIndicator?.id
  const show = showBar || showContent

  const [isMounted, setIsMounted] = useState(show)
  const showRef = useRef(show)

  const currentGemColour =
    confirmingCollectible !== null
      ? (GEMS_COLOURS_BY_ID[confirmingCollectible]?.colour ?? defaultGemColour)
      : defaultGemColour

  const currentPaletteColour =
    confirmingPaletteIndex !== null ? getPaletteHex(confirmingPaletteIndex) : null

  const progressBarStyle = useMemo(
    () =>
      ({
        '--collectible-color': currentPaletteColour ?? currentGemColour,
      }) as CSSProperties,
    [currentGemColour, currentPaletteColour],
  )

  if (show && !isMounted) {
    setIsMounted(true)
  }

  useEffect(() => {
    showRef.current = show
  }, [show])

  const setter = useCallback(
    (value: number) => gsap.quickSetter('#progress-bar', 'x', '%')(value),
    [],
  )

  const onConfirmationProgressChange = (progress: number) => {
    const xValue = -100 + progress * 100
    setter(xValue)
  }

  useConfirmationProgress(onConfirmationProgressChange)

  const container = useRef<HTMLDivElement>(null)
  const delayedCall = useRef<GSAPTween>(null)

  const onEnter = () => {
    delayedCall.current?.kill()
    if (!!hudIndicator?.autoDismissS) {
      delayedCall.current = gsap.delayedCall(hudIndicator.autoDismissS, () => {
        setHudIndicator(null)
      })
    }
  }

  const onExit = () => {
    delayedCall.current?.kill()
  }

  useEffect(
    () => () => {
      delayedCall.current?.kill()
    },
    [],
  )

  const switchKey = `${showBar}-${hudIndicator?.id ?? ''}`

  if (!isMounted) return null

  const baseTransitionClasses = 'transition-all ease-out will-change-[opacity,transform]'

  return (
    <Html
      sprite={true}
      pointerEvents="none"
      position={[0, 2, 1.5]}
      center={true}
      renderOrder={2}
      className="relative select-none">
      <SwitchTransition mode="out-in">
        <Transition
          key={switchKey}
          timeout={{ enter: 240, exit: 200 }}
          onEnter={onEnter}
          onExit={onExit}
          onExited={() => {
            if (showRef.current) return
            setIsMounted(false)
          }}
          appear={true}
          nodeRef={container}>
          {(state) => {
            const visibilityClasses =
              state === 'entering' || state === 'entered'
                ? 'opacity-100 scale-100 duration-240'
                : 'opacity-0 scale-110 duration-200'

            if (showBar)
              return (
                <div
                  ref={container}
                  className={twJoin(
                    'flex flex-col items-center rounded-full bg-black p-2',
                    baseTransitionClasses,
                    visibilityClasses,
                  )}>
                  <div
                    className="relative h-4 w-26 overflow-hidden rounded-full border border-white bg-white"
                    style={progressBarStyle}>
                    <div
                      id="progress-bar"
                      className="absolute h-full w-full -translate-x-full rounded-full bg-linear-0 from-(--collectible-color) to-[color-mix(in_srgb,var(--collectible-color)_80%,#000)]"
                    />
                  </div>
                </div>
              )
            if (showContent)
              return (
                <div
                  ref={container}
                  key={hudIndicator.id}
                  className={twJoin(
                    'speech-bubble mb-8 flex items-center gap-2 rounded-full bg-black p-3 text-base font-medium tracking-wide whitespace-nowrap text-white xl:mb-0 xl:p-4 xl:text-lg',
                    baseTransitionClasses,
                    visibilityClasses,
                  )}>
                  {!!hudIndicator.Icon && <hudIndicator.Icon className="size-4 xl:size-6" />}
                  {hudIndicator.label}
                </div>
              )
            return <div ref={container} className="hidden" />
          }}
        </Transition>
      </SwitchTransition>
    </Html>
  )
}

export default PlayerHUD
