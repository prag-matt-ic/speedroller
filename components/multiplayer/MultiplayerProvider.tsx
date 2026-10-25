'use client'

import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { type Profile, type Course } from '@/shared/multiplayer/protocol.mts'
import { Overlay } from '@/stores/types'
import { getStartGridPosition } from '@/utils/platform/raceMarkers'
import { PLAYER_RESTING_Y } from '@/utils/player'
import { createRoomSession, type RoomSession, type SessionState } from '@/utils/multiplayer/session'
import { MultiplayerOverlay } from './MultiplayerOverlay'

const emptyStore = createStore<SessionState>(() => ({ status: 'idle', snapshot: null, info: null, error: null, clockOffset: null, pendingStart: false }))
const Context = createContext<{
  session: RoomSession | null; busy: boolean; problem: string | null; watchLink: boolean
  create: () => void; join: (role: 'racer' | 'spectator') => void; leave: () => void
} | null>(null)
const endpoint = process.env.NEXT_PUBLIC_MULTIPLAYER_URL

export function MultiplayerProvider({ children }: PropsWithChildren) {
  const game = useGameStoreAPI()
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
    return { name: game.getState().username ?? '', colour: '#37d6c7' }
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
    cleanUrl(); setWatchLink(false)
    game.getState().prepareMultiplayer()
    void open()
  }
  function join(role: 'racer' | 'spectator') {
    if (role === 'racer') game.getState().prepareMultiplayer()
    session?.join(role, profile())
  }
  function leave() {
    generation.current++; active.current?.leave(); active.current = null
    setSession(null); setProblem(null); setBusy(false); cleanUrl()
    game.getState().returnToLobby()
    game.getState().setOverlay(Overlay.NONE)
  }
  useEffect(() => () => { generation.current++; active.current?.dispose() }, [])
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

  return <Context value={{ session, busy, problem, watchLink, create, join, leave }}>
    {children}
    {overlay === Overlay.MULTIPLAYER && <MultiplayerOverlay />}
  </Context>
}
export function useMultiplayer() {
  const context = useContext(Context)
  if (!context) throw new Error('Missing multiplayer provider')
  return context
}
export function useRoomState<T>(selector: (state: SessionState) => T) {
  const { session } = useMultiplayer()
  return useStore(session?.store ?? emptyStore, selector)
}
