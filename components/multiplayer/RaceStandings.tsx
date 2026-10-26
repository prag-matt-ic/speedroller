'use client'

import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '@/components/GameProvider'
import { findRaceMarkers } from '@/utils/platform/raceMarkers'
import { raceStandings } from '@/utils/multiplayer/standings'
import { useMultiplayer, useRoomState } from './MultiplayerProvider'

const STANDINGS_INTERVAL_MS = 200

export function RaceStandings() {
  const { session } = useMultiplayer()
  const snapshot = useRoomState(state => state.snapshot)
  const status = useRoomState(state => state.status)
  const rows = useGameStore(state => state.rowsData)
  const markers = useMemo(() => findRaceMarkers(rows), [rows])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (status !== 'joined' || snapshot?.phase !== 'racing') return
    const timer = setInterval(() => setTick(value => value + 1), STANDINGS_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [status, snapshot?.phase])
  const standings = useMemo(() => {
    // Pose buffers change without notifying React; sample only at the HUD cadence.
    void tick
    return snapshot ? raceStandings(snapshot, markers?.start.position[2] ?? 0,
      markers?.finish.position[2] ?? 0, id => session?.getPoseBuffer(id)?.at(-1)?.pose.position[2]) : []
  }, [snapshot, markers, session, tick])
  if (!snapshot || snapshot.phase === 'waiting') return null
  return <section aria-label="Race standings">
    <p className="mb-2 text-xs text-white/60">{status !== 'joined' ? 'Connection lost · standings paused' : snapshot.phase === 'results' ? 'Final standings' : 'Live standings · provisional'}</p>
    <ol className="space-y-1.5 text-xs sm:text-sm">
      {standings.map(({ entrant, position, progress }) => <li key={entrant.id} className="flex items-center gap-2">
        <span className="w-4 shrink-0 font-mono tabular-nums">{position ?? '—'}</span>
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entrant.profile.colour }} />
        <span className="min-w-0 flex-1 truncate">{entrant.profile.name}{entrant.id === snapshot.selfId ? ' · You' : ''}</span>
        <span className="shrink-0 font-mono text-teal-200 tabular-nums">{entrant.status === 'finished' ? `${((entrant.elapsedMs ?? 0) / 1000).toFixed(2)} s` : entrant.status === 'dnf' ? 'DNF' : snapshot.phase === 'countdown' ? 'Grid' : `${Math.round(progress * 100)}%`}</span>
      </li>)}
    </ol>
  </section>
}
