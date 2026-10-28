'use client'

import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { type Profile, type Course } from '@/shared/multiplayer/protocol.mts'
import { PLAYER_BASE_COLOURS, clampPaletteIndexSafe } from '@/components/palette'
import { useQueryClient } from '@tanstack/react-query'
import { RaceStandings } from './RaceStandings'
import { Overlay } from '@/stores/types'
import { getStartGridPosition } from '@/utils/platform/raceMarkers'
import { PLAYER_RESTING_Y } from '@/utils/player'
import { createRoomSession, type RoomSession, type SessionState } from '@/utils/multiplayer/session'
import { bindMultiplayerRace } from '@/utils/multiplayer/raceBridge'
import { MultiplayerCountdown } from './MultiplayerCountdown'
import { SpectatorControls } from './SpectatorControls'
import { MultiplayerOverlay } from './MultiplayerOverlay'

const emptyStore = createStore<SessionState>(() => ({ status: 'idle', snapshot: null, info: null, error: null, clockOffset: null, pendingStart: false, followId: null, wideCamera: false }))
const Context = createContext<{
  session: RoomSession | null; busy: boolean; problem: string | null; watchLink: boolean
  reconnect: () => void; create: () => void; join: (role: 'racer' | 'spectator') => void; leave: () => void
} | null>(null)
const endpoint = process.env.NEXT_PUBLIC_MULTIPLAYER_URL

export function MultiplayerProvider({ children }: PropsWithChildren) {
  const game = useGameStoreAPI()
  const queryClient = useQueryClient()
  const overlay = useGameStore(state => state.overlay)
  const hydrated = useGameStore(state => state._isHydrated)
  const platformReady = useGameStore(state => state.isPlatformReady)
  const warmupComplete = useGameStore(state => state.isWarmupComplete)
  const playerSafe = useGameStore(state => state.playerStatus === 'safe')
  const [session, setSession] = useState<RoomSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [watchLink, setWatchLink] = useState(false)
  const active = useRef<RoomSession | null>(null)
  const generation = useRef(0)
  const inspectedInvite = useRef(false)

  function profile(): Profile {
    const { username, paletteIndex } = game.getState()
    return { name: username ?? '', colour: PLAYER_BASE_COLOURS[clampPaletteIndexSafe(paletteIndex)] }
  }
  function cleanUrl() {
    const url = new URL(window.location.href)
    url.searchParams.delete('room'); url.searchParams.delete('watch')
    window.history.replaceState(null, '', url)
  }
  async function open(roomId?: string) {
    const token = ++generation.current
    active.current?.dispose(); active.current = null; setSession(null)
    setProblem(null); setBusy(true)
    game.getState().setOverlay(Overlay.MULTIPLAYER)
    try {
      const state = game.getState()
      const initialPosition = getStartGridPosition(state.rowsData, PLAYER_RESTING_Y, state.courseSurface)
      if (!initialPosition) throw new Error('This course has no starting grid. Return to the lobby and reload.')
      const bytes = new TextEncoder().encode(JSON.stringify({ rows: state.rowsData, surface: state.courseSurface }))
      if (!crypto.subtle) throw new Error('Multiplayer needs a secure connection. Open the game over HTTPS.')
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      if (generation.current !== token) return
      const layoutVersion = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      const course: Course = { layoutVersion, rulesVersion: `race-v1:${state.platformVersion}`, ...state.courseSurface }
      const localEndpoint = process.env.NODE_ENV === 'development' ? `ws://${window.location.hostname}:8080` : undefined
      const next = createRoomSession({ endpoint: endpoint ?? localEndpoint, course,
        initialPose: { position: initialPosition, rotation: [0, 0, 0, 1], sequence: 0, respawn: 0 } })
      active.current = next; setSession(next)
      next.connect(roomId ? { type: 'inspect', roomId } : { type: 'create', profile: profile() })
    } catch (error) {
      if (generation.current === token) setProblem(error instanceof Error ? error.message : 'Could not prepare multiplayer.')
    } finally { if (generation.current === token) setBusy(false) }
  }
  function create() {
    inspectedInvite.current = true
    cleanUrl(); setWatchLink(false)
    game.getState().prepareMultiplayer()
    void open()
  }
  function join(role: 'racer' | 'spectator') {
    if (role === 'racer') game.getState().prepareMultiplayer()
    session?.join(role, profile())
  }
  function reconnect() {
    const roomId = session?.store.getState().snapshot?.roomId
    if (!roomId) return
    setWatchLink(true)
    void open(roomId)
  }
  function leave() {
    generation.current++; active.current?.leave(); active.current = null
    setSession(null); setProblem(null); setBusy(false); cleanUrl()
    game.getState().returnToLobby()
    game.getState().setOverlay(Overlay.NONE)
  }
  useEffect(() => game.subscribe((state, previous) => {
    if (state.completedSpeedRuns === previous.completedSpeedRuns) return
    void queryClient.invalidateQueries({ queryKey: ['speedrun-leaderboard'] })
    void queryClient.invalidateQueries({ queryKey: ['speedrun-recent-run'] })
  }), [game, queryClient])
  useEffect(() => () => { generation.current++; active.current?.dispose() }, [])
  useEffect(() => {
    if (!session) return
    const bridge = bindMultiplayerRace(game, session)
    return () => bridge.dispose()
  }, [game, session])
  useEffect(() => {
    session?.setReady(hydrated && platformReady && warmupComplete && playerSafe)
  }, [session, hydrated, platformReady, warmupComplete, playerSafe])
  useEffect(() => {
    if (inspectedInvite.current || !hydrated || !platformReady || !warmupComplete || overlay !== Overlay.NONE) return
    const url = new URL(window.location.href)
    const roomId = url.searchParams.get('room')
    if (roomId === null) return
    inspectedInvite.current = true
    setWatchLink(url.searchParams.get('watch') === '1')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)) {
      setProblem('This race link is invalid. Create a new room or return to the lobby.')
      game.getState().setOverlay(Overlay.MULTIPLAYER); return
    }
    void open(roomId)
    // Invite entry runs once, after the existing landing and asset gates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, hydrated, platformReady, warmupComplete])

  return <Context value={{ session, busy, problem, watchLink, create, join, leave, reconnect }}>
    {children}
    {session && overlay === Overlay.NONE && <RacerStandings />}
    {overlay === Overlay.MULTIPLAYER && <MultiplayerOverlay />}
    {overlay === Overlay.SPECTATING && <SpectatorControls />}
    {overlay === Overlay.MULTIPLAYER_COUNTDOWN && <MultiplayerCountdown />}
  </Context>
}
export function useOptionalMultiplayer() { return useContext(Context) }
export function useMultiplayer() {
  const context = useContext(Context)
  if (!context) throw new Error('Missing multiplayer provider')
  return context
}
export function useRoomState<T>(selector: (state: SessionState) => T) {
  const context = useOptionalMultiplayer()
  return useStore(context?.session?.store ?? emptyStore, selector)
}

function RacerStandings() {
  const snapshot = useRoomState(state => state.snapshot)
  if (snapshot?.phase !== 'racing' || !snapshot.entrants.some(entrant => entrant.id === snapshot.selfId)) return null
  return <div className="pointer-events-none fixed top-24 right-3 z-100 w-52 rounded-xl bg-black/75 p-3 text-white sm:w-64 xl:top-28">
    <RaceStandings />
  </div>
}
