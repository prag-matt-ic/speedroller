import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import { platform, arch, cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import WebSocket from 'ws'

const durationSeconds = Number(process.env.SPIKE_SECONDS ?? 30)
assert(Number.isFinite(durationSeconds) && durationSeconds >= 3 && durationSeconds <= 300)
const scenarios = [
  { name: 'loopback', oneWayMs: 0, jitterMs: 0 },
  { name: '150ms-round-trip-model', oneWayMs: 75, jitterMs: 15 },
  { name: '300ms-round-trip-model', oneWayMs: 150, jitterMs: 30 },
]
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)] ?? null
async function waitFor(predicate, label, timeoutMs = 8000) {
  const deadline = performance.now() + timeoutMs
  while (!predicate()) {
    assert(performance.now() < deadline, `Timed out: ${label}`)
    await sleep(10)
  }
}

async function run(scenario) {
  const child = fork(new URL('./relay.mts', import.meta.url), [], {
    execArgv: ['--expose-gc'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  const clients = []
  const pendingTimers = new Set()
  const intervals = []
  let listening, measured, begun = false
  child.on('message', message => {
    if (message.type === 'listening') listening = message
    if (message.type === 'metrics') measured = message
    if (message.type === 'begun') begun = true
  })
  const ages = [], rtts = [], bootstrapMs = []
  let collecting = false, measuredPoseBytes = 0, measuredPoseCount = 0, unexpectedCloses = 0
  // Seeded application-delay model preserves ordering. It is not TCP loss emulation.
  let seed = 12345
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  function schedule(client, direction, callback) {
    const delay = scenario.oneWayMs + (random() * 2 - 1) * scenario.jitterMs
    const lane = client[direction]
    const due = Math.max(performance.now() + Math.max(0, delay), lane.due)
    lane.due = due
    if (delay === 0) { callback(); return }
    lane.queue.push({ due, callback })
    if (lane.timer) return
    const drain = () => {
      pendingTimers.delete(lane.timer)
      while (lane.queue.length && lane.queue[0].due <= performance.now()) lane.queue.shift().callback()
      lane.timer = null
      if (lane.queue.length) {
        lane.timer = setTimeout(drain, Math.max(1, lane.queue[0].due - performance.now()))
        pendingTimers.add(lane.timer)
      }
    }
    lane.timer = setTimeout(drain, Math.max(1, due - performance.now()))
    pendingTimers.add(lane.timer)
  }
  function send(client, message) {
    const encoded = JSON.stringify(message)
    if (collecting && message.type === 'pose') { measuredPoseBytes += Buffer.byteLength(encoded); measuredPoseCount++ }
    schedule(client, 'outgoingDue', () => {
      if (client.socket.readyState === WebSocket.OPEN) client.socket.send(encoded)
    })
  }
  async function connect(role) {
    const socket = new WebSocket(`ws://127.0.0.1:${listening.port}`)
    const client = { socket, incomingDue: {due: 0, queue: [], timer: null}, outgoingDue: {due: 0, queue: [], timer: null}, snapshots: [], error: null,
      selfId: null, batches: 0, latest: null, closing: false, firstMessage: null }
    clients.push(client)
    socket.on('close', () => { if (collecting && !client.closing) unexpectedCloses++ })
    socket.on('error', error => { client.error = error.message })
    socket.on('message', raw => schedule(client, 'incomingDue', () => {
      const message = JSON.parse(raw.toString())
      client.firstMessage ??= message.type
      if (message.type === 'error') client.error = message.code
      if (message.type === 'snapshot') {
        client.latest = message
        client.snapshots.push(message)
        if (message.selfId) client.selfId = message.selfId
      }
      if (message.type === 'poses') {
        client.batches++
        if (collecting) for (const racer of message.racers) {
          if (racer.pose && racer.finishMs === null) ages.push(performance.now() - racer.pose.sampledAt)
        }
      }
      if (message.type === 'pong' && collecting) rtts.push(performance.now() - message.sentAt)
    }))
    await once(socket, 'open')
    const joinedAt = performance.now()
    send(client, { type: 'join', role })
    await waitFor(() => client.selfId || client.error, 'join acknowledgement')
    if (client.selfId) {
      assert.equal(client.firstMessage, 'snapshot', 'bootstrap must precede live traffic')
      bootstrapMs.push(performance.now() - joinedAt)
    }
    return client
  }
  async function close(client) {
    client.closing = true
    if (client.socket.readyState === WebSocket.CLOSED) return
    const closed = once(client.socket, 'close')
    client.socket.terminate()
    await closed
    await sleep(30)
  }
  try {
    await waitFor(() => listening, 'server listening')
    assert.equal((await fetch(`http://127.0.0.1:${listening.port}/health`)).status, 200)
    const racers = [await connect('racer')]
    send(racers[0], { type: 'start' })
    await waitFor(() => racers[0].error, 'owner needs opponent')
    assert.equal(racers[0].error, 'need-opponent'); racers[0].error = null
    for (let index = 1; index < 5; index++) racers.push(await connect('racer'))
    const overflow = await connect('racer')
    assert.equal(overflow.error, 'full'); await close(overflow)
    send(racers[1], { type: 'start' })
    await waitFor(() => racers[1].error, 'non-owner start')
    assert.equal(racers[1].error, 'owner-only'); racers[1].error = null
    const spectators = []
    for (let index = 0; index < 10; index++) spectators.push(await connect('spectator'))
    send(racers[0], { type: 'start' })
    await waitFor(() => racers.every(client => client.latest?.phase === 'racing'), 'shared start')
    const raceId = racers[0].latest.raceId
    assert(racers.every(client => client.latest.raceId === raceId))
    const lateRacer = await connect('racer')
    assert.equal(lateRacer.error, 'entry-closed'); await close(lateRacer)
    let sequence = 0
    let publishing = true
    intervals.push(setInterval(() => {
      if (!publishing) return
      sequence++
      for (let index = 0; index < racers.length; index++) send(racers[index], {
        type: 'pose', raceId, sequence, sampledAt: performance.now(),
        position: [Math.sin(sequence / 20 + index) * 4, 0.4, -sequence * 0.8],
        rotation: [Math.sin(sequence / 60), 0, 0, Math.cos(sequence / 60)], respawn: 0,
      })
    }, 50))
    await sleep(1000)
    for (let index = 0; index < 10; index++) {
      const spectator = await connect('spectator')
      assert.equal(spectator.latest.phase, 'racing')
      assert.equal(spectator.latest.raceId, raceId)
      assert.equal(spectator.latest.members.filter(member => member.role === 'racer' && member.pose).length, 5)
      spectators.push(spectator)
    }
    const excessSpectator = await connect('spectator')
    assert.equal(excessSpectator.error, 'full'); await close(excessSpectator)
    send(spectators[0], { type: 'finish', raceId, elapsedMs: 1 })
    await waitFor(() => spectators[0].error, 'spectator cannot finish')
    assert.equal(spectators[0].error, 'racer-only'); spectators[0].error = null

    intervals.push(setInterval(() => {
      for (const client of [...racers, ...spectators]) send(client, { type: 'ping', sentAt: performance.now() })
    }, 1000))
    child.send('begin')
    await waitFor(() => begun, 'measurement start')
    collecting = true
    console.error(`Measuring ${scenario.name}: 5 racers + 20 watchers for ${durationSeconds}s`)
    await sleep(durationSeconds * 1000)
    collecting = false
    child.send('measure')
    await waitFor(() => measured, 'server metrics')
    assert.equal(unexpectedCloses, 0)
    assert(ages.length > durationSeconds * 1000, 'all viewers must receive sustained five-racer traffic')
    assert(rtts.length >= durationSeconds * 10, 'enough round-trip samples')
    assert.equal(measured.skippedBatches, 0, 'normal traffic must not congest recipients')
    assert.equal(measured.congestedDisconnects, 0)
    assert(measured.acceptedPoses > durationSeconds * 90, 'publish close to 100 poses/second')

    // No further movement: a late join must bootstrap cached poses and an already accepted finish.
    publishing = false
    await sleep(scenario.oneWayMs * 2 + 100)
    send(racers[0], { type: 'finish', raceId, elapsedMs: 1000 })
    await waitFor(() => spectators[0].latest.members.some(member => member.finishMs === 1000), 'finish broadcast')
    await close(spectators.pop())
    const afterFinish = await connect('spectator')
    spectators.push(afterFinish)
    const initial = afterFinish.snapshots[0]
    assert.equal(initial.members.filter(member => member.role === 'racer' && member.pose).length, 5)
    assert.equal(initial.members.filter(member => member.finishMs === 1000).length, 1)
    for (let index = 1; index < 5; index++) send(racers[index], { type: 'finish', raceId, elapsedMs: 1000 + index })
    await waitFor(() => spectators.every(client => client.latest.phase === 'results'), 'identical final results')
    await close(spectators.pop())
    const afterResults = await connect('spectator')
    assert.equal(afterResults.latest.phase, 'results')
    assert.equal(afterResults.latest.members.filter(member => member.finishMs !== null).length, 5)
    assert(spectators.every(client => JSON.stringify(client.latest.members.filter(m => m.role === 'racer')) ===
      JSON.stringify(afterResults.latest.members.filter(m => m.role === 'racer'))))

    let pressure = null
    if (scenario.oneWayMs === 0) {
      afterResults.socket.pause()
      const before = measured
      measured = null
      child.send({ pressureMemberId: afterResults.selfId })
      await sleep(6500)
      child.send('measure')
      await waitFor(() => measured, 'pressure metrics')
      assert(measured.skippedBatches > 0, 'real paused TCP reader must trigger queue shedding')
      assert.equal(measured.congestedDisconnects, 1, 'only congested reader must be disconnected')
      assert(racers.every(client => client.socket.readyState === WebSocket.OPEN))
      pressure = { skippedBatches: measured.skippedBatches, maxBufferedBytes: measured.maxBufferedBytes,
        congestedDisconnects: measured.congestedDisconnects, healthyRacersStillConnected: 5 }
      measured = before
      afterResults.socket.resume()
    }
    return { scenario, durationSeconds, racers: 5, spectators: 20,
      rttMs: { p50: percentile(rtts, 0.5), p95: percentile(rtts, 0.95), samples: rtts.length },
      sourceToReceiveMs: { p50: percentile(ages, 0.5), p95: percentile(ages, 0.95), samples: ages.length },
      estimatedAgeWith100msInterpolationP95: percentile(ages, 0.95) + 100,
      joinBootstrapP95Ms: percentile(bootstrapMs, 0.95), meanPoseBytes: measuredPoseBytes / measuredPoseCount,
      meanBatchBytes: measured.batchBytes / measured.batches,
      outboundPayloadBytesPerSecond: measured.outboundBytes / (measured.durationMs / 1000),
      server: measured, pressure,
      assertions: ['five-racer limit', 'owner needs opponent', 'owner-only start', 'late-racer rejection',
        '20-spectator limit', 'spectator finish rejection', 'bootstrap before live data',
        '10 late spectators get five current poses', 'stationary bootstrap with prior finish',
        'results bootstrap', 'consistent final results', 'nominal traffic has no congestion'] }
  } catch (error) {
    console.error('Scenario failed:', scenario.name, clients.filter(client => client.selfId).map(client => ({
      id: client.selfId, phase: client.latest?.phase, error: client.error,
      finishes: client.latest?.members.filter(member => member.role === 'racer').map(member => member.finishMs),
    })))
    throw error
  } finally {
    intervals.forEach(clearInterval)
    pendingTimers.forEach(clearTimeout)
    clients.forEach(client => client.socket.terminate())
    const stopped = once(child, 'exit')
    child.kill('SIGTERM')
    await stopped
  }
}

const result = { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model,
  methodology: 'Separate relay process; real loopback WebSockets; seeded ordered application delay, not WAN/TCP loss; JSON payload bytes exclude framing/TLS; interpolation age is an estimate, not rendered.',
  runs: [] }
for (const scenario of scenarios) result.runs.push(await run(scenario))
if (process.argv[2]) await writeFile(process.argv[2], `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
