'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/components/GameProvider'
import { PointerProvider } from '@/components/ui/PointerProvider'
import Button from '@/components/ui/Button'
import { RaceStandings } from './RaceStandings'
import { useMultiplayer, useRoomState } from './MultiplayerProvider'

export function SpectatorControls() {
  const { session, leave } = useMultiplayer()
  const snapshot = useRoomState(state => state.snapshot)
  const followId = useRoomState(state => state.followId)
  const wide = useRoomState(state => state.wideCamera)
  const offset = useRoomState(state => state.clockOffset)
  const isMobile = useGameStore(state => state.isMobile)
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 200)
    return () => clearInterval(timer)
  }, [])
  if (!snapshot || !session) return null
  const serverNow = now + (offset ?? 0)
  const elapsed = snapshot.startAt === null ? 0 : Math.max(0, serverNow - snapshot.startAt)
  const entrants = [...snapshot.entrants].sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || a.slot - b.slot)
  return <PointerProvider isMobile={isMobile}>
    <section aria-label="Spectator controls" className="pointer-events-auto fixed top-3 left-3 z-500 max-h-[75dvh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl bg-black/80 p-4 text-white shadow-xl">
      <h2 className="font-unbounded text-lg">Watching the race</h2>
      <p role="status" className="my-2 text-sm text-white/70">{snapshot.phase === 'waiting' ? 'Waiting for the owner to start.' : snapshot.phase === 'countdown' ? `Starts in ${Math.max(0, Math.ceil(((snapshot.startAt ?? serverNow) - serverNow) / 1000))}` : snapshot.phase === 'results' ? 'Final results' : `${(elapsed / 1000).toFixed(1)} s · ${entrants.filter(entrant => entrant.status === 'racing').length} still racing`}</p>
      {entrants.length > 0 ? <>
        <label htmlFor="follow-racer" className="text-sm">Follow racer</label>
        <select id="follow-racer" value={followId ?? ''} onChange={event => session.follow(event.target.value)} className="mt-1 mb-3 w-full rounded border border-white/30 bg-neutral-900 p-2">
          {entrants.map(entrant => <option key={entrant.id} value={entrant.id}>{entrant.slot}. {entrant.profile.name} · {entrant.status}</option>)}
        </select>
        <Button variant="secondary" aria-pressed={wide} onClick={() => session.setWideCamera(!wide)}>{wide ? 'Close camera' : 'Wide camera'}</Button>
        <div className="my-3"><RaceStandings /></div>
        <p className="mb-3 text-xs text-white/60">Progress is approximate. Camera switches to a remaining racer when its target finishes.</p>
      </> : <ul className="my-3 text-sm">{snapshot.members.filter(member => member.role === 'racer').map(member => <li key={member.id}>{member.profile.name} · {member.ready ? 'Ready' : 'Loading…'}</li>)}</ul>}
      {snapshot.phase === 'results' && <p className="my-3 text-sm">{snapshot.ownerConnected ? 'Waiting for the owner to open the next race.' : 'The owner left. This room cannot rematch.'}</p>}
      <Button variant="secondary" onClick={leave}>Leave spectator view</Button>
    </section>
  </PointerProvider>
}
