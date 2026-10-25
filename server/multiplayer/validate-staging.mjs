// Synthetic clients only: run against a dedicated staging service, never production.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import WebSocket from 'ws'
import { course, profile, pose, waitFor } from './tests/helpers.mjs'
import { PROTOCOL_VERSION, serverMessageSchema } from '../../shared/multiplayer/protocol.mts'

const url = new URL(process.env.MULTIPLAYER_URL)
assert.equal(url.protocol, 'wss:')
const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000'
const health = new URL('/health', url); health.protocol = 'https:'
const clients = []
const deadline = setTimeout(() => { throw new Error('Staging validation exceeded three minutes') }, 180000)
deadline.unref()
async function connect(options = {}) {
  const socket = new WebSocket(url, { origin, ...options })
  const client = { socket, messages: [], latest: null }
  clients.push(client)
  socket.on('error', () => {})
  socket.on('message', raw => {
    const message = serverMessageSchema.parse(JSON.parse(raw.toString()))
    client.messages.push(message)
    if (message.type === 'snapshot') client.latest = message
  })
  await once(socket, 'open')
  client.request = async (command, predicate) => {
    const start = client.messages.length
    socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...command }))
    await waitFor(() => client.messages.slice(start).some(predicate), command.type, 10000)
    return client.messages.slice(start).find(predicate)
  }
  client.error = (command, code) => client.request(command, m => m.type === 'error' && m.code === code)
  client.join = (roomId, role = 'racer') => client.request({ type: 'join', roomId, role, profile, course }, m => m.type === 'snapshot')
  return client
}
async function denied(options, expected) {
  const socket = new WebSocket(url, options)
  socket.on('error', () => {})
  const [request, response] = await once(socket, 'unexpected-response')
  assert.equal(response.statusCode, expected)
  request.destroy(); socket.terminate()
}
async function ready(client) {
  const tokens = []
  for (let i = 0; i < 5; i++) {
    const pong = await client.request({ type: 'ping', clientTime: performance.now() }, m => m.type === 'pong')
    tokens.push(pong.token)
  }
  await client.request({ type: 'sync', tokens }, m => m.type === 'synced')
  await client.request({ type: 'ready', course, pose: pose() }, m => m.type === 'snapshot')
}
try {
  if (process.env.PROXY_CHECK === 'true') {
    const started = performance.now()
    let accepted = 0, throttled = false
    for (let i = 1; i <= 61; i++) {
      try {
        const client = await connect({ headers: { 'X-Real-IP': `203.0.113.${i}`, 'X-Forwarded-For': `198.51.100.${i}` } })
        accepted++; client.socket.terminate()
      } catch (error) {
        assert.match(error.message, /429/); throttled = true; break
      }
    }
    assert(performance.now() - started < 60000, 'probe must fit one rate window')
    assert(accepted > 0 && throttled, 'changing forged headers must not bypass source throttling')
    console.log(`PASS Railway edge source throttling despite forged IP headers (${accepted} accepted before HTTP 429)`)
  } else {
    assert.equal((await fetch(health)).status, 200)
    await denied({}, 403)
    await denied({ origin: 'https://example.invalid' }, 403)
    const owner = await connect()
    await owner.error({ type: 'create', profile, course, protocolVersion: 0 }, 'protocol-mismatch')
    await owner.request({ type: 'create', profile, course }, m => m.type === 'snapshot')
    const roomId = owner.latest.roomId
    const racers = [owner]
    for (let i = 1; i < 5; i++) { const client = await connect(); await client.join(roomId); racers.push(client) }
    const watcher = await connect()
    await watcher.error({ type: 'join', roomId, role: 'racer', profile, course }, 'full')
    await watcher.error({ type: 'join', roomId, role: 'spectator', profile, course: { ...course, rulesVersion: 'different' } }, 'course-mismatch')
    for (const racer of racers) await ready(racer)
    await sleep(1100)
    await owner.request({ type: 'start', revision: owner.latest.revision }, m => m.type === 'snapshot' && m.phase === 'countdown')
    await waitFor(() => owner.latest.phase === 'racing', 'GO', 10000)
    const raceId = owner.latest.raceId
    await watcher.error({ type: 'join', roomId, role: 'racer', profile, course }, 'entry-closed')
    await watcher.join(roomId, 'spectator')
    assert.equal(watcher.latest.entrants.length, 5)
    assert(watcher.latest.entrants.every(entrant => entrant.pose))
    for (const racer of racers) racer.socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: 'pose', raceId, pose: pose(1) }))
    await waitFor(() => watcher.messages.some(m => m.type === 'poses' && m.entrants.length === 5 && m.entrants.every(e => e.pose?.sequence === 1)), 'five live poses', 10000)
    await watcher.error({ type: 'pose', raceId, pose: pose(1) }, 'racer-only')
    console.log('PASS WSS health, origins, five racers, closed entry, late snapshot/live updates, protocol/course mismatch')
    if (process.env.WAIT_FOR_RESTART === 'true') {
      console.log('READY_FOR_REDEPLOY: five-racer race active; waiting up to 120 seconds')
      await waitFor(() => owner.messages.some(m => m.type === 'closed' && m.reason === 'shutdown'), 'shutdown notice', 120000)
      await waitFor(() => owner.socket.readyState === WebSocket.CLOSED, 'socket closed', 10000)
      let replacement
      const deadline = performance.now() + 60000
      while (!replacement && performance.now() < deadline) {
        try { replacement = await connect() } catch { await sleep(1000) }
      }
      assert(replacement, 'replacement available')
      await replacement.error({ type: 'inspect', roomId, course }, 'room-missing')
      await replacement.request({ type: 'create', profile, course }, m => m.type === 'snapshot')
      assert.notEqual(replacement.latest.roomId, roomId)
      console.log('PASS active-race redeploy: shutdown notice, closed sockets, old room missing, new room available')
    } else {
      owner.socket.terminate()
      await waitFor(() => watcher.latest.ownerConnected === false, 'owner disconnect', 10000)
      assert.equal(watcher.latest.entrants[0].status, 'dnf')
      for (const racer of racers.slice(1)) await racer.request({ type: 'finish', raceId, elapsedMs: 100, pose: pose(2) }, m => m.type === 'snapshot')
      await waitFor(() => watcher.latest.phase === 'results', 'results', 10000)
      await racers[1].error({ type: 'new-race', raceId }, 'owner-only')
      const silent = await connect({ autoPong: false }); await silent.join(roomId, 'spectator')
      await waitFor(() => silent.socket.readyState === WebSocket.CLOSED, 'missed heartbeat eviction', 22000)
      console.log('PASS owner loss/DNF, finishes/results, rematch denied, real heartbeat eviction')
    }
  }
} finally {
  clearTimeout(deadline)
  for (const client of clients) client.socket.terminate()
}
