import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { performance } from 'node:perf_hooks'
import { WebSocket, WebSocketServer } from 'ws'
import { queueAction } from './queue.mts'
import { clientMessageSchema, LIMITS, PROTOCOL_VERSION, sameCourse } from '../../shared/multiplayer/protocol.mts'
import type { ClientMessage, Course, Entrant, ErrorCode, Pose, Profile, ServerMessage, Snapshot } from '../../shared/multiplayer/protocol.mts'

type Connection = {
  socket: WebSocket; ip: string; id: string; room: Room | null; profile: Profile | null;
  role: 'racer' | 'spectator'; ready: boolean; initialPose: Pose | null;
  synced: boolean; tokens: Map<string, number>; joinedAt: number; lastPong: number;
  lastPing: number; congestedAt: number | null; windowAt: number; poses: number; controls: number;
}
type Room = {
  id: string; ownerId: string; course: Course; phase: Snapshot['phase']; revision: number;
  members: Set<Connection>; entrants: Entrant[]; raceId: string | null;
  startAt: number | null; activeAt: number;
}
type Options = { allowedOrigins: readonly string[]; now?: () => number; automaticTick?: boolean }

export function createRelay({ allowedOrigins, now = () => performance.now(), automaticTick = true }: Options) {
  const rooms = new Map<string, Room>()
  const connections = new Set<Connection>()
  const sources = new Map<string, { since: number; connections: number; creations: number }>()
  let stopping = false
  let lastBatch = now()
  const metrics = { acceptedPoses: 0, outboundBytes: 0, skippedBatches: 0, congestedDisconnects: 0, maxBufferedBytes: 0 }
  const http = createServer((request, response) => {
    response.writeHead(request.url === '/health' && !stopping ? 200 : 404)
    response.end(request.url === '/health' && !stopping ? 'ok' : 'not found')
  })
  const sockets = new WebSocketServer({ noServer: true, maxPayload: LIMITS.payloadBytes, perMessageDeflate: false })

  function allowSource(ip: string, field: 'connections' | 'creations', limit: number) {
    let source = sources.get(ip)
    if (!source || now() - source.since >= 60000) {
      if (!source && sources.size >= 10000) return false
      source = { since: now(), connections: 0, creations: 0 }
      sources.set(ip, source)
    }
    return ++source[field] <= limit
  }

  http.on('upgrade', (request, socket, head) => {
    // shortcut: trust only the direct peer IP; verify Railway proxy headers before staging.
    const ip = request.socket.remoteAddress ?? 'unknown'
    if (stopping || !request.headers.origin || !allowedOrigins.includes(request.headers.origin)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return
    }
    if (connections.size >= LIMITS.connections || !allowSource(ip, 'connections', LIMITS.connectionsPerMinute)) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return
    }
    sockets.handleUpgrade(request, socket, head, webSocket => {
      const connection: Connection = { socket: webSocket, ip, id: randomUUID(), room: null, profile: null,
        role: 'spectator', ready: false, initialPose: null, synced: false, tokens: new Map(),
        joinedAt: now(), lastPong: now(), lastPing: now(), congestedAt: null,
        windowAt: now(), poses: 0, controls: 0 }
      connections.add(connection)
      webSocket.on('error', () => { webSocket.terminate() })
      webSocket.on('pong', () => { connection.lastPong = now() })
      webSocket.on('close', () => { advanceRooms(); connections.delete(connection); leave(connection) })
      webSocket.on('message', (raw, binary) => {
        if (stopping || webSocket.readyState !== WebSocket.OPEN) return
        advanceRooms()
        if (now() - connection.windowAt >= 1000) {
          connection.windowAt = now(); connection.poses = 0; connection.controls = 0
        }
        let input: unknown
        try { input = binary ? null : JSON.parse(raw.toString()) } catch { input = null }
        const parsed = clientMessageSchema.safeParse(input)
        const isPose = parsed.success && parsed.data.type === 'pose'
        const count = isPose ? ++connection.poses : ++connection.controls
        if (count > (isPose ? LIMITS.posesPerSecond : LIMITS.controlsPerSecond)) {
          reject(connection, 'rate-limit'); webSocket.close(1008, 'rate limit'); leave(connection); return
        }
        if (!parsed.success) {
          const version = input && typeof input === 'object' && 'protocolVersion' in input ? input.protocolVersion : undefined
          reject(connection, version !== undefined && version !== PROTOCOL_VERSION ? 'protocol-mismatch' : 'invalid-message'); return
        }
        handle(connection, parsed.data)
      })
    })
  })

  function send(connection: Connection, message: ServerMessage, replaceable = false) {
    if (connection.socket.readyState !== WebSocket.OPEN) return
    const queued = connection.socket.bufferedAmount
    metrics.maxBufferedBytes = Math.max(metrics.maxBufferedBytes, queued)
    const action = queueAction(queued, connection.congestedAt, now(), replaceable)
    if (action === 'close') {
      metrics.congestedDisconnects++; connection.socket.terminate(); return
    }
    if (action === 'skip') {
      connection.congestedAt ??= now(); metrics.skippedBatches++; return
    }
    connection.congestedAt = null
    const encoded = JSON.stringify(message)
    metrics.outboundBytes += Buffer.byteLength(encoded)
    connection.socket.send(encoded)
  }
  function reject(connection: Connection, code: ErrorCode) { send(connection, { type: 'error', code }) }
  function snapshot(connection: Connection, room: Room): Snapshot {
    return { type: 'snapshot', protocolVersion: PROTOCOL_VERSION, selfId: connection.id,
      roomId: room.id, ownerId: room.ownerId, ownerConnected: [...room.members].some(m => m.id === room.ownerId),
      course: room.course, revision: room.revision, phase: room.phase, raceId: room.raceId,
      startAt: room.startAt, serverTime: now(), entrants: room.entrants,
      members: [...room.members].map(m => ({ id: m.id, profile: m.profile!, role: m.role, ready: m.ready })) }
  }
  function publish(room: Room) {
    room.revision++
    room.members.forEach(member => send(member, snapshot(member, room)))
  }
  function closeRoom(room: Room, reason: 'owner-left' | 'expired' | 'shutdown') {
    rooms.delete(room.id)
    for (const member of room.members) {
      member.room = null
      send(member, { type: 'closed', reason })
      member.socket.close(1000, reason)
    }
    room.members.clear()
  }
  function completeIfFinished(room: Room) {
    if (room.phase !== 'racing' || room.entrants.some(entrant => entrant.status === 'racing')) return
    room.phase = 'results'; room.activeAt = now()
    room.entrants = room.entrants.map(entrant => ({ ...entrant, place: entrant.elapsedMs === null ? null :
      1 + room.entrants.filter(other => other.elapsedMs !== null &&
        Math.round(other.elapsedMs / 10) < Math.round(entrant.elapsedMs! / 10)).length }))
  }
  function leave(connection: Connection) {
    const room = connection.room
    connection.room = null
    connection.ready = false; connection.initialPose = null
    if (!room) return
    room.members.delete(connection); room.activeAt = now()
    if (!room.members.size) { rooms.delete(room.id); return }
    if (connection.id === room.ownerId && (room.phase === 'waiting' || room.phase === 'countdown')) {
      closeRoom(room, 'owner-left'); return
    }
    if (connection.role === 'racer' && room.phase === 'countdown') {
      room.phase = 'waiting'; room.raceId = null; room.startAt = null; room.entrants = []
      room.members.forEach(member => { member.ready = false; member.initialPose = null })
    } else if (room.phase === 'racing') {
      room.entrants = room.entrants.map(entrant => entrant.id === connection.id && entrant.status === 'racing'
        ? { ...entrant, status: 'dnf' } : entrant)
      completeIfFinished(room)
    }
    publish(room)
  }
  function advanceRooms() {
    for (const room of rooms.values()) {
      if ((room.phase === 'waiting' || room.phase === 'results') && now() - room.activeAt >= LIMITS.idleRoomMs) {
        closeRoom(room, 'expired'); continue
      }
      if (room.phase === 'countdown' && now() >= room.startAt!) {
        room.phase = 'racing'; publish(room)
      }
      if (room.phase === 'racing' && now() >= room.startAt! + LIMITS.raceMs) {
        room.entrants = room.entrants.map(entrant => entrant.status === 'racing' ? { ...entrant, status: 'dnf' } : entrant)
        completeIfFinished(room); publish(room)
      }
    }
  }
  function join(connection: Connection, room: Room, role: Connection['role'], profile: Profile) {
    connection.room = room; connection.role = role; connection.profile = profile
    connection.ready = false; connection.initialPose = null
    room.members.add(connection); room.activeAt = now()
    // The first message to this member is its full snapshot, in the same event-loop turn as admission.
    publish(room)
  }
  function handle(connection: Connection, message: ClientMessage) {
    if (message.type === 'ping') {
      const token = randomUUID()
      connection.tokens.set(token, now())
      while (connection.tokens.size > 5) connection.tokens.delete(connection.tokens.keys().next().value!)
      send(connection, { type: 'pong', clientTime: message.clientTime, serverTime: now(), token }); return
    }
    if (message.type === 'sync') {
      if (!message.tokens.every(token => connection.tokens.has(token) && now() - connection.tokens.get(token)! <= 30000)) {
        reject(connection, 'invalid-sync'); return
      }
      connection.synced = true; connection.tokens.clear(); send(connection, { type: 'synced' }); return
    }
    if (message.type === 'inspect') {
      const room = rooms.get(message.roomId)
      if (!room) { reject(connection, 'room-missing'); return }
      if (!sameCourse(room.course, message.course)) { reject(connection, 'course-mismatch'); return }
      connection.joinedAt = now()
      const members = [...room.members]
      send(connection, { type: 'room-info', roomId: room.id, phase: room.phase,
        racers: members.filter(member => member.role === 'racer').length,
        spectators: members.filter(member => member.role === 'spectator').length })
      return
    }
    if (message.type === 'create' || message.type === 'join') {
      if (connection.room) { reject(connection, 'already-joined'); return }
      if (message.type === 'create') {
        if (!allowSource(connection.ip, 'creations', LIMITS.creationsPerMinute)) { reject(connection, 'rate-limit'); return }
        if (rooms.size >= LIMITS.rooms) { reject(connection, 'server-full'); return }
        const room: Room = { id: randomUUID(), ownerId: connection.id, course: message.course, phase: 'waiting',
          revision: 0, members: new Set(), entrants: [], raceId: null, startAt: null, activeAt: now() }
        rooms.set(room.id, room); join(connection, room, 'racer', message.profile); return
      }
      const room = rooms.get(message.roomId)
      if (!room) { reject(connection, 'room-missing'); return }
      if (!sameCourse(room.course, message.course)) { reject(connection, 'course-mismatch'); return }
      if (message.role === 'racer' && room.phase !== 'waiting') { reject(connection, 'entry-closed'); return }
      if ([...room.members].filter(m => m.role === message.role).length >=
        (message.role === 'racer' ? LIMITS.racers : LIMITS.spectators)) { reject(connection, 'full'); return }
      join(connection, room, message.role, message.profile); return
    }
    const room = connection.room
    if (!room) { reject(connection, 'not-joined'); return }
    if (message.type === 'leave') { leave(connection); connection.joinedAt = now(); send(connection, { type: 'left' }); return }
    if (message.type === 'snapshot') { send(connection, snapshot(connection, room)); return }
    if (message.type === 'claim-slot') {
      if (room.phase !== 'waiting') { reject(connection, 'entry-closed'); return }
      if (connection.role === 'racer') return
      if ([...room.members].filter(m => m.role === 'racer').length >= LIMITS.racers) { reject(connection, 'full'); return }
      connection.role = 'racer'; connection.ready = false; room.activeAt = now(); publish(room); return
    }
    if (message.type === 'ready') {
      if (connection.role !== 'racer') { reject(connection, 'racer-only'); return }
      if (room.phase !== 'waiting') { reject(connection, 'wrong-phase'); return }
      if (!sameCourse(room.course, message.course)) { reject(connection, 'course-mismatch'); return }
      if (!connection.synced) { reject(connection, 'clock-sync-required'); return }
      connection.ready = true; connection.initialPose = message.pose; publish(room); return
    }
    if (message.type === 'start' || message.type === 'new-race') {
      if (room.ownerId !== connection.id) { reject(connection, 'owner-only'); return }
      if (message.type === 'new-race') {
        if (message.raceId !== room.raceId) { reject(connection, 'stale-race'); return }
        if (room.phase !== 'results') { reject(connection, 'wrong-phase'); return }
        room.phase = 'waiting'; room.raceId = null; room.startAt = null; room.entrants = []
        room.members.forEach(member => { member.ready = false; member.initialPose = null })
      } else {
        if (room.phase !== 'waiting') { reject(connection, 'wrong-phase'); return }
        if (message.revision !== room.revision) { reject(connection, 'stale-room'); return }
        const racers = [...room.members].filter(member => member.role === 'racer')
        if (racers.length < 2) { reject(connection, 'need-opponent'); return }
        if (racers.some(member => !member.ready || member.socket.readyState !== WebSocket.OPEN)) { reject(connection, 'not-ready'); return }
        room.raceId = randomUUID(); room.phase = 'countdown'; room.startAt = now() + LIMITS.countdownMs
        room.entrants = racers.map((member, index) => ({ id: member.id, profile: member.profile!, slot: index + 1,
          status: 'racing', pose: member.initialPose!, receivedAt: now(), elapsedMs: null, place: null }))
      }
      room.activeAt = now(); publish(room); return
    }
    if (connection.role !== 'racer') { reject(connection, 'racer-only'); return }
    if (message.raceId !== room.raceId) { reject(connection, 'stale-race'); return }
    if (room.phase !== 'racing') { reject(connection, 'wrong-phase'); return }
    const entrant = room.entrants.find(entrant => entrant.id === connection.id)
    if (!entrant || entrant.status !== 'racing') return
    if (message.pose.sequence <= entrant.pose.sequence || message.pose.respawn < entrant.pose.respawn) {
      reject(connection, 'stale-pose'); return
    }
    if (message.type === 'finish' && message.elapsedMs > now() - room.startAt! + 500) { reject(connection, 'invalid-time'); return }
    room.entrants = room.entrants.map(current => current.id !== connection.id ? current : { ...current,
      pose: message.pose, receivedAt: now(), ...(message.type === 'finish' ? { status: 'finished', elapsedMs: message.elapsedMs } : {}) })
    if (message.type === 'pose') { metrics.acceptedPoses++; return }
    completeIfFinished(room); publish(room)
  }
  function tick() {
    advanceRooms()
    for (const connection of connections) {
      if ((!connection.room && now() - connection.joinedAt >= LIMITS.joinMs) || now() - connection.lastPong >= LIMITS.deadConnectionMs) {
        leave(connection); connection.socket.terminate(); continue
      }
      if (now() - connection.lastPing >= LIMITS.heartbeatMs) {
        connection.lastPing = now(); connection.socket.ping()
      }
    }
    for (const [ip, source] of sources) if (now() - source.since >= 60000) sources.delete(ip)
    if (now() - lastBatch < 50) return
    lastBatch += Math.floor((now() - lastBatch) / 50) * 50
    for (const room of rooms.values()) {
      if (room.phase !== 'racing') continue
      const message: ServerMessage = { type: 'poses', protocolVersion: PROTOCOL_VERSION, roomId: room.id,
        raceId: room.raceId!, revision: room.revision, serverTime: now(), entrants: room.entrants }
      room.members.forEach(member => send(member, message, true))
    }
  }
  const timer = automaticTick ? setInterval(tick, 50) : null
  async function close() {
    if (stopping) return
    stopping = true
    if (timer) clearInterval(timer)
    for (const room of rooms.values()) closeRoom(room, 'shutdown')
    connections.forEach(connection => connection.socket.close(1001, 'shutdown'))
    const force = setTimeout(() => sockets.clients.forEach(socket => socket.terminate()), 1000)
    await Promise.all([
      new Promise<void>(resolve => sockets.close(() => resolve())),
      new Promise<void>(resolve => http.close(() => resolve())),
    ])
    clearTimeout(force); connections.clear(); sources.clear()
  }
  return { http, tick, close, metrics }
}
