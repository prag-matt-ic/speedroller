import { POSE_INTERVAL_MS } from '../../shared/multiplayer/protocol.mts'
import type { StoreApi } from 'zustand/vanilla'
import { Overlay, SpeedRunStage, type GameStore } from '@/stores/types'
import { getResetInputState } from '@/stores/inputSlice'
import { getStartGridPosition } from '@/utils/platform/raceMarkers'
import { PLAYER_RESTING_Y } from '@/utils/player'
import type { RoomSession } from './session'

export function bindMultiplayerRace(game: StoreApi<GameStore>, session: RoomSession, options: {
  now?: () => number; hidden?: () => boolean; automaticTick?: boolean
} = {}) {
  const now = options.now ?? (() => performance.now())
  const hidden = options.hidden ?? (() => typeof document !== 'undefined' && document.hidden)
  let previousRace: string | null = null
  let disposed = false
  let followedId: string | null = null
  let followedRespawn = -1
  let watchedRace: string | null = null

  function watch() {
    const { snapshot, clockOffset, followId } = session.store.getState()
    if (!snapshot || clockOffset === null) return
    const state = game.getState()
    if (!state._isHydrated || !state.isPlatformReady || !state.isWarmupComplete) return
    if (!state.isSpectating) {
      state.stopConfirmation(); state.resetPlayerSpeedState()
      game.setState({ isSpectating: true, speedRunStage: SpeedRunStage.START, attemptId: state.attemptId + 1,
        attemptStartedAtMs: null, multiplayerRaceId: null, multiplayerFinish: null,
        playerStatus: 'safe', spawnPosition: null, cameraLookAtPosition: null, cameraPoseOverrides: [], ...getResetInputState() })
    }
    if (game.getState().overlay !== Overlay.SPECTATING) game.setState({ overlay: Overlay.SPECTATING })
    const buffer = followId ? session.getPoseBuffer(followId) : undefined
    // Coarse state drives progress and respawn notifications; frame consumers use session playback.
    const latestPose = buffer?.at(-1)?.pose
    if (latestPose) {
      const respawn = latestPose.respawn
      const changed = followedId !== followId || followedRespawn !== respawn || watchedRace !== snapshot.raceId
      const position = game.getState().playerPosition
      if (changed || position.some((value, axis) => value !== latestPose.position[axis])) {
        game.setState(current => ({ playerPosition: [...latestPose.position],
          playerRespawnTick: current.playerRespawnTick + (changed ? 1 : 0) }))
      }
      followedId = followId; followedRespawn = respawn; watchedRace = snapshot.raceId
    } else if (snapshot.phase === 'waiting' && (followedId !== null || !state.isSpectating)) {
      const grid = getStartGridPosition(state.rowsData, PLAYER_RESTING_Y, state.courseSurface)
      if (grid) game.setState(current => ({ playerPosition: grid, playerRespawnTick: current.playerRespawnTick + 1 }))
      followedId = null; followedRespawn = -1; watchedRace = null
    }
  }

  function synchronize() {
    if (disposed) return
    const { snapshot, status, clockOffset } = session.store.getState()
    const state = game.getState()
    if (status === 'error') {
      if (state.multiplayerRaceId) state.stopMultiplayerRace(state.multiplayerRaceId)
      else if (state.overlay !== Overlay.MULTIPLAYER) state.setOverlay(Overlay.MULTIPLAYER)
      return
    }
    if (status !== 'joined' || !snapshot) return
    const self = snapshot.members.find(member => member.id === snapshot.selfId)
    if (self?.role === 'spectator') { watch(); return }
    if (self?.role !== 'racer') return
    if (snapshot.phase === 'waiting') {
      if (previousRace) { previousRace = null; state.prepareMultiplayer() }
      const current = game.getState()
      session.setReady(current._isHydrated && current.isPlatformReady && current.isWarmupComplete && current.playerStatus === 'safe')
      return
    }
    if (!snapshot.raceId || snapshot.startAt === null || clockOffset === null) return
    const entrant = snapshot.entrants.find(entrant => entrant.id === snapshot.selfId)
    if (!entrant) return
    if (state.multiplayerRaceId !== snapshot.raceId) {
      state.scheduleMultiplayerRace(snapshot.raceId, snapshot.startAt - clockOffset)
      previousRace = snapshot.raceId
    }
    if (entrant.status === 'finished' && entrant.elapsedMs !== null) {
      game.getState().confirmMultiplayerFinish(snapshot.raceId, entrant.elapsedMs)
    }
    if (snapshot.phase === 'results' || entrant.status !== 'racing') {
      game.getState().stopMultiplayerRace(snapshot.raceId)
      return
    }
    if (!hidden()) game.getState().startMultiplayerRace(snapshot.raceId, now())
  }
  function publish() {
    const state = game.getState()
    if (state.isSpectating) return
    const raceId = state.multiplayerRaceId
    if (!raceId) return
    const finish = state.multiplayerFinish
    if (finish?.raceId === raceId && finish.attemptId === state.attemptId) {
      session.finish(raceId, finish.elapsedMs, state.playerPosition, state.playerRespawnTick)
      return
    }
    if (state.speedRunStage === SpeedRunStage.RUNNING) session.publishPose(raceId, state.playerPosition, state.playerRespawnTick)
  }
  function tick() { synchronize(); publish() }
  const unsubscribeSession = session.store.subscribe(synchronize)
  const unsubscribeGame = game.subscribe((state, previous) => {
    if (state.multiplayerFinish !== previous.multiplayerFinish && state.multiplayerFinish) publish()
  })
  const timer = options.automaticTick === false ? null : setInterval(tick, POSE_INTERVAL_MS)
  synchronize()
  return { tick, dispose() {
    disposed = true; unsubscribeSession(); unsubscribeGame()
    if (timer) clearInterval(timer)
  } }
}
