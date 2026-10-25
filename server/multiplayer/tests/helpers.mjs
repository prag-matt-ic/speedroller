import assert from 'node:assert/strict'
import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import WebSocket from 'ws'
import { createRelay } from '../relay.mts'
import { PROTOCOL_VERSION, serverMessageSchema } from '../../../shared/multiplayer/protocol.mts'

export const course = { layoutVersion: 'test-flat-1', rulesVersion: 'test-rules-1', topology: 'flat', columns: 33 }
export const profile = { name: 'PlayerOne', colour: '#abcdef' }
export const pose = (sequence = 0) => ({ sequence, position: [0, 0.4, -sequence], rotation: [0, 0, 0, 1], respawn: 0 })
export async function waitFor(predicate, message = 'condition', timeoutMs = 3000) {
  const deadline = performance.now() + timeoutMs
  while (!predicate()) {
    assert(performance.now() < deadline, `Timed out: ${message}`)
    await sleep(5)
  }
}
export async function fixture(t, options = {}) {
  let clock = 1000
  const relay = createRelay({ allowedOrigins: ['http://localhost:3000'],
    ...(options.realTime ? {} : { now: () => clock, automaticTick: false }) })
  relay.http.listen(0, '127.0.0.1')
  await once(relay.http, 'listening')
  const url = `ws://127.0.0.1:${relay.http.address().port}`
  const clients = []
  async function connect(settings = {}) {
    const socket = new WebSocket(url, { origin: 'http://localhost:3000', ...settings })
    const client = { socket, messages: [], latest: null, invalid: [] }
    socket.on('error', () => {})
    socket.on('message', raw => {
      const result = serverMessageSchema.safeParse(JSON.parse(raw.toString()))
      if (!result.success) { client.invalid.push(result.error); return }
      client.messages.push(result.data)
      if (result.data.type === 'snapshot') client.latest = result.data
    })
    clients.push(client)
    await once(socket, 'open')
    client.send = message => socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION,
      ...(message.type === 'start' ? { revision: client.latest?.revision } : {}), ...message }))
    client.request = async (message, predicate) => {
      const start = client.messages.length
      client.send(message)
      await waitFor(() => client.messages.slice(start).some(predicate) || client.invalid.length, message.type)
      assert.deepEqual(client.invalid, [])
      return client.messages.slice(start).find(predicate)
    }
    client.error = async (message, code) => {
      const response = await client.request(message, m => m.type === 'error')
      assert.equal(response.code, code)
    }
    client.sync = async () => {
      const tokens = []
      for (let i = 0; i < 5; i++) {
        const pong = await client.request({ type: 'ping', clientTime: performance.now() }, m => m.type === 'pong')
        tokens.push(pong.token)
      }
      await client.request({ type: 'sync', tokens }, m => m.type === 'synced')
    }
    client.ready = async () => {
      await client.sync()
      await client.request({ type: 'ready', course, pose: pose() }, m => m.type === 'snapshot' && m.members.some(member => member.id === m.selfId && member.ready))
    }
    client.join = async (roomId, role = 'racer', selectedCourse = course) => client.request(
      { type: 'join', roomId, role, profile, course: selectedCourse }, m => m.type === 'snapshot')
    client.create = async () => client.request({ type: 'create', profile, course }, m => m.type === 'snapshot')
    client.disconnect = async () => {
      if (socket.readyState === WebSocket.CLOSED) return
      const closed = once(socket, 'close'); socket.terminate(); await closed; await sleep(10)
    }
    return client
  }
  async function advance(ms) {
    // Let responsive real WebSocket clients pong between deterministic clock steps.
    while (ms > 0) {
      const step = Math.min(ms, 5000); clock += step; ms -= step
      relay.tick(); await sleep(5)
    }
  }
  t.after(async () => {
    clients.forEach(client => client.socket.terminate())
    await relay.close()
    clients.forEach(client => assert.deepEqual(client.invalid, []))
  })
  async function race(count = 2) {
    const owner = await connect(); await owner.create()
    const racers = [owner]
    for (let i = 1; i < count; i++) {
      const racer = await connect(); await racer.join(owner.latest.roomId); racers.push(racer)
    }
    for (const racer of racers) await racer.ready()
    await advance(1000)
    await owner.request({ type: 'start' }, m => m.type === 'snapshot' && m.phase === 'countdown')
    return { owner, racers, roomId: owner.latest.roomId, raceId: owner.latest.raceId }
  }
  return { relay, url, connect, advance, race, now: () => clock, elapse: ms => { clock += ms } }
}
