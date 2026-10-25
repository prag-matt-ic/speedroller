'use client'

import { useEffect, useRef } from 'react'
import { useGameStoreAPI } from '@/components/GameProvider'
import Button from '@/components/ui/Button'
import { PointerProvider } from '@/components/ui/PointerProvider'
import { useMultiplayer } from './MultiplayerProvider'

export function MultiplayerCountdown() {
  const game = useGameStoreAPI()
  const { leave } = useMultiplayer()
  const label = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const update = () => {
      const start = game.getState().multiplayerStartAtMs
      if (label.current && start !== null) label.current.textContent = start > performance.now()
        ? String(Math.ceil((start - performance.now()) / 1000)) : 'GO'
    }
    update()
    const timer = setInterval(update, 50)
    return () => clearInterval(timer)
  }, [game])
  return <PointerProvider isMobile={game.getState().isMobile}>
    <section aria-label="Multiplayer countdown" className="pointer-events-none fixed inset-0 z-500 flex flex-col items-center justify-center gap-6 text-white">
      <p className="text-lg">Race starts in</p>
      <p ref={label} role="timer" aria-live="polite" className="font-unbounded text-8xl font-bold" />
      <Button variant="secondary" className="pointer-events-auto" onClick={leave}>Leave race</Button>
    </section>
  </PointerProvider>
}
