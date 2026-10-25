import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'

// shortcut: one loopback-only room without persistence or recovery, extend this service in Phase 1 before deployment.
const MAX_RACERS = 5
const MAX_SPECTATORS = 20
const SOFT_QUEUE_BYTES = 64 * 1024
const HARD_QUEUE_BYTES = 256 * 1024
const CONGESTION_TIMEOUT_MS = 5000
const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), role: z.enum(['racer', 'spectator']) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('ping'), sentAt: z.number().finite() }),
  z.object({ type: z.literal('pose'), raceId: z.string(), sequence: z.number().int().nonnegative(),
    sampledAt: z.number().finite(), position: vector,
    rotation: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
    respawn: z.number().int().nonnegative() }),
  z.object({ type: z.literal('finish'), raceId: z.string(), elapsedMs: z.number().finite().nonnegative() }),
])
type Pose = Extract<z.infer<typeof messageSchema>, { type: 'pose' }>
type Member = { id: string; role: 'racer' | 'spectator'; pose: Pose | null; finishMs: number | null;
  congestedAt: number | null; windowStart: number; messages: number }

const roomId = randomUUID()
const members = new Map<WebSocket, Member>()
let ownerId: string | null = null
let raceId: string | null = null
let phase = 'waiting'
let revision = 0
let startedAt: number | null = null
const http = createServer((req, res) => {
  res.writeHead(req.url === '/health' ? 200 : 404)
  res.end(req.url === '/health' ? 'ok' : 'not found')
})
const server = new WebSocketServer({ server: http, maxPayload: 8192, perMessageDeflate: false })
const eventLoop = monitorEventLoopDelay({ resolution: 10 })
eventLoop.enable()
let metrics = { inboundBytes: 0, outboundBytes: 0, batches: 0, batchBytes: 0, maxBatchBytes: 0,
  maxBufferedBytes: 0, skippedBatches: 0, congestedDisconnects: 0, acceptedPoses: 0 }
let cpuStart = process.cpuUsage()
let measuredAt = performance.now()
let heapStart = process.memoryUsage().heapUsed
let peakRss = process.memoryUsage().rss

function send(socket: WebSocket, encoded: string, replaceable = false) {
  if (socket.readyState !== WebSocket.OPEN) return
  const member = members.get(socket)
  const queued = socket.bufferedAmount
  metrics.maxBufferedBytes = Math.max(metrics.maxBufferedBytes, queued)
  if (queued > SOFT_QUEUE_BYTES) {
    if (member && member.congestedAt === null) member.congestedAt = performance.now()
    if (!replaceable || queued > HARD_QUEUE_BYTES ||
        (member && performance.now() - member.congestedAt! >= CONGESTION_TIMEOUT_MS)) {
      metrics.congestedDisconnects++
      socket.terminate()
      return
    }
    metrics.skippedBatches++
    return
  }
  if (member) member.congestedAt = null
  metrics.outboundBytes += Buffer.byteLength(encoded)
  socket.send(encoded)
}

function snapshot() {
  return { type: 'snapshot', protocolVersion: 0, roomId, revision, ownerId, raceId, phase,
    serverTime: performance.now(), startedAt, course: { version: 'phase0', topology: 'flat', columns: 33 },
    members: Array.from(members.values(), ({ id, role, pose, finishMs }) => ({ id, role, pose, finishMs })) }
}

function broadcastSnapshot() {
  revision++
  const encoded = JSON.stringify(snapshot())
  members.forEach((_, socket) => send(socket, encoded))
}

server.on('connection', (socket) => {
  const joinTimeout = setTimeout(() => { if (!members.has(socket)) socket.terminate() }, 3000)
  socket.on('error', () => {})
  socket.on('close', () => { clearTimeout(joinTimeout); members.delete(socket) })
  socket.on('message', (raw, binary) => {
    metrics.inboundBytes += Buffer.byteLength(raw.toString())
    const reject = (code: string) => send(socket, JSON.stringify({ type: 'error', code }))
    if (binary) { socket.close(1003); return }
    let parsed: ReturnType<typeof messageSchema.safeParse>
    try { parsed = messageSchema.safeParse(JSON.parse(raw.toString())) }
    catch { reject('invalid-message'); return }
    if (!parsed.success) { reject('invalid-message'); return }
    const message = parsed.data
    let member = members.get(socket)
    if (message.type === 'join') {
      if (member) { reject('already-joined'); return }
      const count = Array.from(members.values()).filter(m => m.role === message.role).length
      if (message.role === 'racer' && phase !== 'waiting') { reject('entry-closed'); return }
      if (count >= (message.role === 'racer' ? MAX_RACERS : MAX_SPECTATORS)) { reject('full'); return }
      member = { id: randomUUID(), role: message.role, pose: null, finishMs: null,
        congestedAt: null, windowStart: performance.now(), messages: 0 }
      members.set(socket, member)
      clearTimeout(joinTimeout)
      if (!ownerId && message.role === 'racer') ownerId = member.id
      revision++
      // Subscribe and bootstrap in one event-loop turn, before any live batch can interleave.
      send(socket, JSON.stringify({ ...snapshot(), selfId: member.id }))
      return
    }
    if (!member) { reject('not-joined'); return }
    if (performance.now() - member.windowStart >= 1000) {
      member.windowStart = performance.now(); member.messages = 0
    }
    if (++member.messages > 60) { socket.close(1008, 'rate limit'); return }
    if (message.type === 'ping') {
      send(socket, JSON.stringify({ type: 'pong', sentAt: message.sentAt, serverTime: performance.now() }))
      return
    }
    if (message.type === 'start') {
      if (member.id !== ownerId) { reject('owner-only'); return }
      if (phase !== 'waiting') { reject('already-started'); return }
      if (Array.from(members.values()).filter(m => m.role === 'racer').length < 2) {
        reject('need-opponent'); return
      }
      // Phase 0 measures the transport; scheduled countdown/readiness belong to Phase 1.
      phase = 'racing'; raceId = randomUUID(); startedAt = performance.now()
      broadcastSnapshot()
      return
    }
    if (member.role !== 'racer') { reject('racer-only'); return }
    if (phase !== 'racing' || message.raceId !== raceId) { reject('stale-race'); return }
    if (message.type === 'pose') {
      if (member.finishMs !== null || message.sequence <= (member.pose?.sequence ?? -1)) return
      member.pose = message
      metrics.acceptedPoses++
      return
    }
    if (member.finishMs !== null) return
    if (message.elapsedMs > performance.now() - startedAt! + 500) { reject('invalid-time'); return }
    member.finishMs = message.elapsedMs
    if (Array.from(members.values()).filter(m => m.role === 'racer').every(m => m.finishMs !== null)) phase = 'results'
    broadcastSnapshot()
  })
})

const batchTimer = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
  if (phase !== 'racing') return
  const racers = Array.from(members.values()).filter(m => m.role === 'racer')
  const encoded = JSON.stringify({ type: 'poses', raceId, revision, serverTime: performance.now(),
    racers: racers.map(({ id, pose, finishMs }) => ({ id, pose, finishMs })) })
  const bytes = Buffer.byteLength(encoded)
  metrics.batches++; metrics.batchBytes += bytes
  metrics.maxBatchBytes = Math.max(metrics.maxBatchBytes, bytes)
  members.forEach((_, socket) => send(socket, encoded, true))
}, 50)

process.on('message', (command) => {
  // Test-only IPC drives a real non-reading socket into congestion, separately from nominal traffic.
  if (typeof command === 'object' && command !== null && 'pressureMemberId' in command) {
    const socket = Array.from(members.entries()).find(([, m]) => m.id === command.pressureMemberId)?.[0]
    if (!socket) return
    const encoded = JSON.stringify({ type: 'pressure', padding: 'x'.repeat(8192) })
    const began = performance.now()
    const pressureTimer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN || performance.now() - began > 10000) {
        clearInterval(pressureTimer); return
      }
      for (let index = 0; index < 32; index++) send(socket, encoded, true)
    }, 5)
  }
  if (command === 'begin') {
    global.gc?.()
    heapStart = process.memoryUsage().heapUsed
    peakRss = process.memoryUsage().rss
    metrics = { inboundBytes: 0, outboundBytes: 0, batches: 0, batchBytes: 0, maxBatchBytes: 0,
      maxBufferedBytes: 0, skippedBatches: 0, congestedDisconnects: 0, acceptedPoses: 0 }
    cpuStart = process.cpuUsage(); measuredAt = performance.now(); eventLoop.reset()
    process.send?.({ type: 'begun' })
  }
  if (command === 'measure') {
    const durationMs = performance.now() - measuredAt
    const cpu = process.cpuUsage(cpuStart)
    global.gc?.()
    process.send?.({ type: 'metrics', ...metrics, durationMs,
      cpuPercentOneCore: (cpu.user + cpu.system) / (durationMs * 10),
      heapStartBytes: heapStart, heapEndBytes: process.memoryUsage().heapUsed,
      peakRssBytes: peakRss, eventLoopP99Ms: eventLoop.percentile(99) / 1e6 })
  }
})

process.on('SIGTERM', () => {
  clearInterval(batchTimer); eventLoop.disable()
  server.clients.forEach(socket => socket.terminate())
  server.close(); http.close(() => process.exit(0))
})
http.listen(0, '127.0.0.1', () => {
  const address = http.address()
  if (address && typeof address !== 'string') process.send?.({ type: 'listening', port: address.port })
})
