import { followTarget } from './spectating'
import { appendPose, createPlayback, samplePlayback, createPresentationClock, type Playback, type PoseSample } from './interpolation'
import { createStore } from 'zustand/vanilla'
import { estimateClockOffset, type ClockSample } from '../../shared/multiplayer/clock.mts'
import { PROTOCOL_VERSION, serverMessageSchema, type ClientMessage, type Course, type Pose, type Profile, type RoomInfo, type Snapshot } from '../../shared/multiplayer/protocol.mts'

const POSE_INTERVAL_MS = 50

type Command = ClientMessage extends infer Message ? Message extends ClientMessage ? Omit<Message, 'protocolVersion'> : never : never
type Entry = { type: 'create'; profile: Profile } | { type: 'inspect'; roomId: string }
export type SessionState = {
  status: 'idle' | 'connecting' | 'preview' | 'joined' | 'error'
  snapshot: Snapshot | null
  info: RoomInfo | null
  error: string | null
  clockOffset: number | null
  followId: string | null
  wideCamera: boolean
  pendingStart: boolean
}
const initialState: SessionState = { status: 'idle', snapshot: null, info: null, error: null, clockOffset: null, pendingStart: false, followId: null, wideCamera: false }
const messages: Record<string, string> = {
  'room-missing': 'This room has closed or expired.',
  'course-mismatch': 'This room uses a different course or game version. Open the same game version to join.',
  'full': 'Those places have just filled. You can watch if spectator places remain.',
  'entry-closed': 'The race has already started. You can join as a spectator.',
  'stale-room': 'The room changed. Check the racer list, then start again.',
  'owner-only': 'Only the owner can start or reopen this race.',
  'not-ready': 'Waiting for every racer to finish loading.',
  'need-opponent': 'Invite at least one other racer to start.',
  'protocol-mismatch': 'The multiplayer service uses a different version. Refresh the game.',
  'rate-limit': 'Too many requests. Please wait a moment and try again.',
  'server-full': 'Multiplayer is busy. Please try again later.',
}
export function canStartRace(snapshot: Snapshot | null) {
  if (!snapshot || snapshot.phase !== 'waiting' || snapshot.selfId !== snapshot.ownerId) return false
  const racers = snapshot.members.filter(member => member.role === 'racer')
  return racers.length >= 2 && racers.length <= 5 && racers.every(member => member.ready)
}
export function createRoomSession(options: {
  endpoint: string | undefined
  course: Course
  initialPose: Pose
  socket?: (url: string) => WebSocket
  now?: () => number
}) {
  const store = createStore<SessionState>(() => initialState)
  const now = options.now ?? (() => performance.now())
  let socket: WebSocket | null = null
  let generation = 0
  const poseBuffers = new Map<string, PoseSample[]>()
  const playbacks = new Map<string, Playback>()
  const presentationClock = createPresentationClock()
  let presentationTime = 0
  function updateEntrantPlayback(playback: Playback, id: string) {
    samplePlayback(poseBuffers.get(id)!, presentationTime, playback)
  }
  const rotation: Pose['rotation'] = [0, 0, 0, 1]
  let sequence = 0
  let nextPublishAt = -Infinity
  let finishSentFor: string | null = null
  let ready = false
  let readySent = false
  let previewRoom: string | null = null
  let clockSamples: ClockSample[] = []
  let clockTokens: string[] = []
  let poll: ReturnType<typeof setInterval> | undefined
  let syncTimer: ReturnType<typeof setInterval> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let syncTimeout: ReturnType<typeof setTimeout> | undefined
  // Phase 3/4 can consume the latest pose batch without publishing movement into React state.
  let latestPoses: Extract<ReturnType<typeof serverMessageSchema.parse>, { type: 'poses' }> | null = null

  function disconnect() {
    generation++
    clearInterval(poll); clearInterval(syncTimer); clearTimeout(timeout); clearTimeout(syncTimeout)
    socket?.close(); socket = null; readySent = false; latestPoses = null; poseBuffers.clear(); playbacks.clear(); presentationClock.reset()
  }
  function fail(error: string) {
    disconnect(); store.setState({ status: 'error', error, pendingStart: false })
  }
  function send(command: Command) {
    if (!socket || socket.readyState !== 1) return false
    if (socket.bufferedAmount > 65536) { fail('Connection is too slow. Leave and rejoin to synchronize.'); return false }
    socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...command }))
    return true
  }
  function markReady() {
    const { snapshot, clockOffset } = store.getState()
    const member = snapshot?.members.find(member => member.id === snapshot.selfId)
    if (ready && !readySent && clockOffset !== null && snapshot?.phase === 'waiting' && member?.role === 'racer' && !member.ready) {
      readySent = send({ type: 'ready', course: options.course, pose: options.initialPose })
    }
  }
  function sync() {
    clockSamples = []; clockTokens = []
    send({ type: 'ping', clientTime: now() })
    clearTimeout(syncTimeout)
    syncTimeout = setTimeout(() => fail('Clock synchronization timed out. Please rejoin.'), 8000)
  }
  function inspect() {
    if (previewRoom) send({ type: 'inspect', roomId: previewRoom, course: options.course })
  }
  function connect(entry: Entry) {
    disconnect(); store.setState({ ...initialState, status: 'connecting' }); previewRoom = entry.type === 'inspect' ? entry.roomId : null
    if (!options.endpoint) { fail('Multiplayer is not available on this game yet. You can still play single player.'); return }
    try {
      const endpoint = new URL(options.endpoint)
      if (!['ws:', 'wss:'].includes(endpoint.protocol)) throw new Error('Invalid socket URL')
      socket = (options.socket ?? (url => new WebSocket(url)))(endpoint.toString())
    } catch { fail('Multiplayer could not connect. Please try again later.'); return }
    const activeGeneration = generation
    const activeSocket = socket
    timeout = setTimeout(() => fail('Multiplayer is taking too long to respond. Please try again.'), 8000)
    socket.onopen = () => {
      if (generation !== activeGeneration) return
      if (entry.type === 'create') send({ type: 'create', profile: entry.profile, course: options.course })
      else { inspect(); poll = setInterval(inspect, 3000) }
    }
    socket.onerror = () => { if (generation === activeGeneration) fail('Could not reach multiplayer. Check your connection and try again.') }
    socket.onclose = () => { if (generation === activeGeneration) fail('Connection lost. Leave and rejoin; this race cannot be resumed as a racer.') }
    socket.onmessage = event => {
      if (generation !== activeGeneration || socket !== activeSocket) return
      let input: unknown
      try { input = JSON.parse(event.data) } catch { fail('Received an unreadable multiplayer response.'); return }
      const parsed = serverMessageSchema.safeParse(input)
      if (!parsed.success) { fail('The game and multiplayer service are incompatible. Please refresh.'); return }
      const message = parsed.data
      if (message.type === 'error') {
        const error = messages[message.code] ?? 'That action could not be completed. Please leave and try again.'
        if (['room-missing', 'course-mismatch', 'protocol-mismatch', 'server-full', 'invalid-message', 'invalid-sync'].includes(message.code)) { fail(error); return }
        clearTimeout(timeout)
        store.setState({ error, pendingStart: false })
        if (!store.getState().snapshot && previewRoom && ['full', 'entry-closed'].includes(message.code)) {
          store.setState({ status: 'preview' }); inspect(); clearInterval(poll); poll = setInterval(inspect, 3000)
        }
        else if (store.getState().snapshot) send({ type: 'snapshot' })
        else fail(error)
        return
      }
      if (message.type === 'closed') {
        fail(message.reason === 'owner-left' ? 'The owner left, so this room has closed.' : message.reason === 'expired' ? 'This room has expired.' : 'Multiplayer restarted. Please create a new room.'); return
      }
      if (message.type === 'room-info') {
        clearTimeout(timeout); store.setState({ status: 'preview', info: message }); return
      }
      if (message.type === 'snapshot') {
        const previous = store.getState().snapshot
        if (previous && (previous.roomId !== message.roomId || message.revision < previous.revision)) return
        clearTimeout(timeout); clearInterval(poll)
        if (previous?.raceId !== message.raceId) {
          poseBuffers.clear(); playbacks.clear(); presentationClock.reset(); sequence = 0; nextPublishAt = -Infinity; finishSentFor = null
        }
        if (previous?.raceId && message.phase === 'waiting' && previous.phase !== 'waiting') ready = false
        if (previous?.raceId !== message.raceId || previous?.phase !== message.phase) { latestPoses = null; readySent = false }
        for (const entrant of message.entrants) {
          let buffer = poseBuffers.get(entrant.id)
          if (!buffer) { buffer = []; poseBuffers.set(entrant.id, buffer); playbacks.set(entrant.id, createPlayback()) }
          appendPose(buffer, entrant)
        }
        store.setState({ status: 'joined', snapshot: message, pendingStart: false, followId: followTarget(message, store.getState().followId) })
        if (!previous) { sync(); syncTimer = setInterval(sync, 15000) }
        markReady(); return
      }
      if (message.type === 'pong') {
        if (clockTokens.length >= 5) return
        clockSamples.push({ clientSentAt: message.clientTime, clientReceivedAt: now(), serverTime: message.serverTime })
        clockTokens.push(message.token)
        if (clockTokens.length < 5) send({ type: 'ping', clientTime: now() })
        else send({ type: 'sync', tokens: clockTokens })
        return
      }
      if (message.type === 'synced') {
        clearTimeout(syncTimeout)
        try { store.setState({ clockOffset: estimateClockOffset(clockSamples).offsetMs }); markReady() }
        catch { fail('Could not synchronize the race clock. Please rejoin.') }
        return
      }
      if (message.type === 'poses') {
        const snapshot = store.getState().snapshot
        if (snapshot?.raceId === message.raceId && snapshot.roomId === message.roomId && message.revision >= snapshot.revision) {
          latestPoses = message
          for (const entrant of message.entrants) {
            const buffer = poseBuffers.get(entrant.id)
            if (buffer) appendPose(buffer, entrant)
          }
        }
      }
    }
  }
  return {
    store, connect,
    follow(id: string) {
      if (store.getState().snapshot?.entrants.some(entrant => entrant.id === id)) store.setState({ followId: id })
    },
    setWideCamera(wideCamera: boolean) { store.setState({ wideCamera }) },
    setReady(value: boolean) { ready = value; markReady() },
    join(role: 'racer' | 'spectator', profile: Profile) {
      if (!previewRoom || store.getState().status !== 'preview') return
      clearInterval(poll)
      store.setState({ status: 'connecting', error: null })
      send({ type: 'join', roomId: previewRoom, role, profile, course: options.course })
      timeout = setTimeout(() => fail('Joining timed out. Please try again.'), 8000)
    },
    start() {
      const snapshot = store.getState().snapshot
      if (!canStartRace(snapshot) || store.getState().pendingStart) return
      store.setState({ pendingStart: true, error: null })
      send({ type: 'start', revision: snapshot!.revision })
      timeout = setTimeout(() => fail('Start could not be confirmed. Please rejoin to check the race.'), 8000)
    },
    publishPose(raceId: string, position: Pose['position'], respawn: number) {
      const { snapshot, status } = store.getState()
      const self = snapshot?.entrants.find(entrant => entrant.id === snapshot.selfId)
      if (status !== 'joined' || snapshot?.raceId !== raceId || snapshot.phase !== 'racing' || self?.status !== 'racing' || finishSentFor === raceId) return false
      const time = now()
      if (time < nextPublishAt) return false
      nextPublishAt = Number.isFinite(nextPublishAt) ? nextPublishAt + (Math.floor((time - nextPublishAt) / POSE_INTERVAL_MS) + 1) * POSE_INTERVAL_MS : time + POSE_INTERVAL_MS
      return send({ type: 'pose', raceId, pose: { position, rotation, respawn, sequence: ++sequence } })
    },
    finish(raceId: string, elapsedMs: number, position: Pose['position'], respawn: number) {
      const { snapshot, status } = store.getState()
      if (status !== 'joined' || snapshot?.raceId !== raceId || snapshot.phase !== 'racing' || finishSentFor === raceId) return false
      if (!snapshot.entrants.some(entrant => entrant.id === snapshot.selfId && entrant.status === 'racing')) return false
      if (!send({ type: 'finish', raceId, elapsedMs, pose: { position, rotation, respawn, sequence: ++sequence } })) return false
      finishSentFor = raceId
      return true
    },
    newRace() {
      const { snapshot, status } = store.getState()
      if (status !== 'joined' || snapshot?.phase !== 'results' || snapshot.selfId !== snapshot.ownerId || !snapshot.raceId) return
      store.setState({ error: null })
      send({ type: 'new-race', raceId: snapshot.raceId })
    },
    captureRotation(value: { x: number; y: number; z: number; w: number }) {
      rotation[0] = value.x; rotation[1] = value.y; rotation[2] = value.z; rotation[3] = value.w
    },
    updatePlayback(localTime = now()) {
      const { clockOffset, status } = store.getState()
      if (clockOffset === null || status !== 'joined') return
      presentationTime = presentationClock.sample(localTime, clockOffset)
      playbacks.forEach(updateEntrantPlayback)
    },
    getRenderedPose: (id: string) => playbacks.get(id),
    getPoseBuffer: (id: string) => poseBuffers.get(id),
    leave() { disconnect(); previewRoom = null; store.setState(initialState) },
    dispose() { disconnect(); store.setState({ status: 'error', error: 'Room connection closed. Please create or rejoin a room.' }) },
    getLatestPoses: () => latestPoses,
  }
}
export type RoomSession = ReturnType<typeof createRoomSession>
