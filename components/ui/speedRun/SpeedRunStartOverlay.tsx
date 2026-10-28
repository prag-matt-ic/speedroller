'use client'

import { useEffect, useRef, useState, type FC, type Ref } from 'react'
import { type TransitionStatus } from 'react-transition-group'
import { useGameStore } from '@/components/GameProvider'
import { useMultiplayer } from '@/components/multiplayer/MultiplayerProvider'
import Button from '@/components/ui/Button'
import { PointerProvider } from '@/components/ui/PointerProvider'
import SpeedPanel from '@/components/ui/dashboard/SpeedPanel'
import { Input } from '@/components/ui/input/Input'
import { useUsernameInput } from '@/components/ui/input/useUsernameInput'

type Props = { ref: Ref<HTMLDivElement>; transitionStatus: TransitionStatus }

export const SpeedRunStartOverlay: FC<Props> = ({ ref, transitionStatus }) => {
  const isMobile = useGameStore(state => state.isMobile)
  const startCountdown = useGameStore(state => state.startCountdown)
  const cancelStartLine = useGameStore(state => state.cancelStartLine)
  const multiplayer = useMultiplayer()
  const input = useUsernameInput()
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const usernameInput = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'solo' | 'multiplayer' | null>(null)
  const active = transitionStatus === 'entered' || transitionStatus === 'entering'

  useEffect(() => {
    const element = dialog.current
    element?.showModal(); title.current?.focus()
    return () => element?.close()
  }, [])
  useEffect(() => { if (mode) usernameInput.current?.focus() }, [mode])
  function start(selected: 'solo' | 'multiplayer') {
    if (!input.isValid) { setMode(selected); return }
    dialog.current?.close()
    if (selected === 'solo') startCountdown()
    else multiplayer.create()
  }
  function cancel() { dialog.current?.close(); cancelStartLine() }

  return <PointerProvider isMobile={isMobile}>
    <div ref={ref}>
      <dialog ref={dialog} aria-labelledby="race-mode-heading" onCancel={event => { event.preventDefault(); cancel() }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[min(36rem,95vw)] overflow-y-auto rounded-2xl border border-amber-200/20 bg-neutral-950 p-5 text-white shadow-2xl backdrop:bg-black/75 sm:p-8">
        <section className="flex flex-col gap-5">
          <h2 ref={title} tabIndex={-1} id="race-mode-heading" className="font-unbounded text-2xl font-semibold outline-none">{mode ? 'Enter your racer name' : 'Choose your race'}</h2>
          {!mode ? <>
            <p className="text-sm text-white/70">Race against the clock, or invite friends to a private race.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="primary" disabled={!active} onClick={() => start('solo')}>Single player</Button>
              <Button variant="primary" disabled={!active} onClick={() => start('multiplayer')}>Multiplayer</Button>
            </div>
            <p className="text-sm text-white/60">Multiplayer supports up to five racers. Share your room link to invite racers and spectators.</p>
          </> : <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); start(mode) }}>
            <label htmlFor="race-username" className="text-sm">Your name</label>
            <Input ref={usernameInput} {...input} id="race-username" autoCapitalize="off" autoComplete="off" aria-describedby="race-name-help" />
            <p id="race-name-help" className="text-xs text-white/60">Use 6–12 characters. {mode === 'solo' ? 'Your name appears with your leaderboard time.' : 'Other people in the room will see your name.'}</p>
            <Button type="submit" variant="primary" disabled={!active || !input.isValid}>{mode === 'solo' ? 'Start countdown' : 'Create room'}</Button>
            <Button type="button" variant="secondary" onClick={() => setMode(null)}>Change mode</Button>
          </form>}
          <SpeedPanel />
          <Button variant="secondary" onClick={cancel}>Back to lobby</Button>
        </section>
      </dialog>
    </div>
  </PointerProvider>
}
