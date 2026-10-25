'use client'

import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/components/GameProvider'
import Button from '@/components/ui/Button'
import { PointerProvider } from '@/components/ui/PointerProvider'
import { Input } from '@/components/ui/input/Input'
import { useUsernameInput } from '@/components/ui/input/useUsernameInput'
import { profileSchema, roomUrl } from '@/shared/multiplayer/protocol.mts'
import { canStartRace } from '@/utils/multiplayer/session'
import { useMultiplayer, useRoomState } from './MultiplayerProvider'

export function MultiplayerOverlay() {
  const { session, busy, problem, watchLink, create, join, leave, reconnect } = useMultiplayer()
  const status = useRoomState(state => state.status)
  const snapshot = useRoomState(state => state.snapshot)
  const info = useRoomState(state => state.info)
  const error = useRoomState(state => state.error)
  const pendingStart = useRoomState(state => state.pendingStart)
  const isMobile = useGameStore(state => state.isMobile)
  const username = useGameStore(state => state.username)
  const [hasSavedName] = useState(() => profileSchema.safeParse({ name: username, colour: '#37d6c7' }).success)
  const input = useUsernameInput()
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const [baseUrl] = useState(() => typeof window === 'undefined' ? '' : window.location.href)
  const roomId = snapshot?.roomId
  const link = roomId && baseUrl ? roomUrl(baseUrl, roomId) : ''
  const [copyStatus, setCopyStatus] = useState('')
  const autoWatchAttempted = useRef(false)
  const racers = snapshot?.members.filter(member => member.role === 'racer') ?? []
  const spectators = snapshot?.members.filter(member => member.role === 'spectator').length ?? info?.spectators ?? 0
  const owner = snapshot?.selfId === snapshot?.ownerId
  const self = snapshot?.members.find(member => member.id === snapshot.selfId)
  const joining = !problem && (busy || status === 'connecting' || status === 'idle')
  const issue = problem ?? error

  useEffect(() => { const element = dialog.current; element?.showModal(); title.current?.focus(); return () => element?.close() }, [])
  useEffect(() => { title.current?.focus() }, [status, snapshot?.phase])
  useEffect(() => {
    if (roomId) {
      const url = roomUrl(window.location.href, roomId, self?.role === 'spectator')
      window.history.replaceState(null, '', url)
    }
  }, [roomId, self?.role])
  useEffect(() => {
    if (watchLink && hasSavedName && status === 'preview' && info && info.spectators < 20 && input.isValid && !autoWatchAttempted.current) {
      autoWatchAttempted.current = true; join('spectator')
    }
  }, [watchLink, hasSavedName, status, info, input.isValid, join])
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopyStatus('Link copied.') }
    catch { setCopyStatus('Could not copy. Select and copy the link below.'); linkInput.current?.focus(); linkInput.current?.select() }
  }
  const heading = snapshot?.phase === 'results' ? 'Race results' : snapshot ? self?.role === 'spectator' ? 'Watching the room' : 'Race room' : 'Join a race'
  return <PointerProvider isMobile={isMobile}>
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); leave() }} aria-labelledby="room-heading"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(36rem,95vw)] overflow-y-auto rounded-2xl border border-teal-200/20 bg-neutral-950 p-5 text-white shadow-2xl backdrop:bg-black/75 sm:p-8">
      <section className="flex flex-col gap-5">
        <h2 ref={title} tabIndex={-1} id="room-heading" className="font-unbounded text-2xl font-semibold outline-none">{heading}</h2>
        <p role={issue ? "alert" : "status"} aria-live="polite" className="text-sm text-white/70">
          {issue ?? (joining ? 'Connecting to your race…' : snapshot ? snapshot.phase === 'waiting' ? `${racers.length} of 5 racers · ${spectators} spectators` : snapshot.phase === 'countdown' ? 'Entry closed. The race is starting.' : snapshot.phase === 'racing' ? 'Race in progress. Racer entry is closed.' : 'Race complete.' : `${info?.racers ?? 0} of 5 racers · ${spectators} spectators`)}
        </p>
        {!snapshot && !joining && <>
          <label htmlFor="room-name" className="text-sm">Your name</label>
          <Input {...input} id="room-name" autoComplete="off" autoCapitalize="off" aria-describedby="room-name-help" />
          <p id="room-name-help" className="text-xs text-white/60">Use 6–12 characters. Your saved name can be changed here.</p>
        </>}
        {status === 'preview' && info && !problem && <>
          <div className="flex flex-wrap gap-3">
            {!watchLink && info.phase === 'waiting' && info.racers < 5 && <Button variant="primary" disabled={!input.isValid} onClick={() => join('racer')}>Join race</Button>}
            <Button variant="secondary" disabled={!input.isValid || spectators >= 20} onClick={() => join('spectator')}>Watch</Button>
          </div>
          <p className="text-sm text-white/60">{info.phase !== 'waiting' ? 'Racer entry has closed. Spectators can still join.' : info.racers >= 5 ? 'All racer places are taken. You can still watch.' : 'Join before the owner starts, or watch as a spectator.'}{spectators >= 20 && ' Spectator places are also full.'}</p>
        </>}
        {snapshot && <>
          {snapshot.phase !== 'waiting' && <p className="text-sm text-white/70">{racers.length} racers · {spectators} spectators</p>}
          {snapshot.phase === 'waiting' ? <ol aria-label="Racers" className="flex flex-col gap-2">
            {racers.map((member, index) => <li key={member.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3 text-sm">
              <span>{index + 1}. {member.profile.name}{member.id === snapshot.ownerId ? ' · Owner' : ''}{member.id === snapshot.selfId ? ' · You' : ''}</span>
              <span className="text-teal-200">{member.ready ? 'Ready' : 'Loading…'}</span>
            </li>)}
          </ol> : <ol aria-label="Race standings" className="flex flex-col gap-2">
            {[...snapshot.entrants].sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || a.slot - b.slot).map(entrant => <li key={entrant.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3 text-sm">
              <span>{entrant.place ? `${entrant.place}. ` : ''}{entrant.profile.name}{entrant.id === snapshot.selfId ? ' · You' : ''}</span>
              <span className="text-teal-200">{entrant.status === 'finished' ? `${((entrant.elapsedMs ?? 0) / 1000).toFixed(2)} s` : entrant.status === 'dnf' ? 'DNF' : snapshot.phase === 'countdown' ? 'On the grid' : 'Racing…'}</span>
            </li>)}
          </ol>}
          <label htmlFor="race-share-url" className="text-sm">Invite racers and spectators</label>
          <input ref={linkInput} id="race-share-url" readOnly value={link} className="min-w-0 w-full rounded-lg border border-white/20 bg-black px-3 py-2 text-sm" onFocus={event => event.target.select()} />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void copy()}>Copy link</Button>
            {owner && snapshot.phase === 'waiting' && <Button variant="primary" disabled={!canStartRace(snapshot) || pendingStart || status !== 'joined'} onClick={() => session?.start()}>Start race</Button>}
          </div>
          <p role="status" className="text-xs text-teal-200">{copyStatus}</p>
          {snapshot.phase === 'waiting' && <p className="text-sm text-white/60">{owner ? racers.length < 2 ? 'Invite at least one other racer to start.' : racers.some(member => !member.ready) ? 'Waiting for racers to load and synchronize.' : 'Everyone is ready. You can start without filling all five places.' : 'The owner starts once at least two racers are ready.'}</p>}
          {snapshot.phase === 'racing' && <p role="status" className="text-sm text-white/60">{snapshot.entrants.filter(entrant => entrant.status === 'racing').length} racers still racing. Results update as they finish.</p>}
          {snapshot.phase === 'results' && (owner && snapshot.ownerConnected ? <Button variant="primary" disabled={status !== 'joined'} onClick={() => session?.newRace()}>New race</Button> : <p className="text-sm text-white/60">{snapshot.ownerConnected ? 'Waiting for the owner to open the next race.' : 'The owner left. Create a new room to race again.'}</p>)}

        </>}
        {status === 'error' && self?.role === 'spectator' && <Button variant="primary" onClick={reconnect}>Reconnect to watch</Button>}
        {(problem || status === 'error') && <Button variant="primary" disabled={!input.isValid || busy} onClick={create}>Create new room</Button>}
        <Button variant="secondary" onClick={leave}>{snapshot ? 'Leave room' : 'Back to lobby'}</Button>
      </section>
    </dialog>
  </PointerProvider>
}
