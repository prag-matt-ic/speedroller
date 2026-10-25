// Controlled network simulation around real WebSockets; samples interpolation, not GPU presentation.
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import WebSocket from 'ws'
import { fixture, pose, profile, waitFor } from './tests/helpers.mjs'
import { loadTypeScript } from '../../tests/loadTypeScript.mjs'
const { createRoomSession } = loadTypeScript('utils/multiplayer/session.ts')
const { samplePose, INTERPOLATION_DELAY_MS } = loadTypeScript('utils/multiplayer/interpolation.ts')
const seconds = Number(process.env.SPIKE_SECONDS ?? 5)
assert(Number.isFinite(seconds) && seconds >= 3 && seconds <= 30)
const percentile = values => values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? null

async function measure(rtt) {
  const cleanup = []
  const f = await fixture({ after: callback => cleanup.push(callback) }, { realTime: true })
  const sessions = [], sockets = [], timers = new Set(), captures = new Map()
  let publisher, sampler, sequence = 0, peakQueued = 0, delivered = 0
  const age = [], slowAge = [], snapshotAge = [], rendered = { position: [0, 0, 0], rotation: [0, 0, 0, 1] }
  function later(fn, delay) {
    const timer = setTimeout(() => { timers.delete(timer); fn() }, delay)
    timers.add(timer); peakQueued = Math.max(peakQueued, timers.size)
  }
  try {
    const owner = await f.connect(); await owner.create()
    const racers = [owner]
    for (let i = 1; i < 5; i++) { const racer = await f.connect(); await racer.join(owner.latest.roomId); racers.push(racer) }
    for (const racer of racers) await racer.ready()
    await owner.request({ type: 'start' }, m => m.type === 'snapshot' && m.phase === 'countdown')
    const raceId = owner.latest.raceId
    await waitFor(() => owner.latest.phase === 'racing', 'GO', 5000)
    publisher = setInterval(() => {
      const current = ++sequence; captures.set(current, performance.now())
      later(() => racers.forEach(racer => racer.send({ type: 'pose', raceId, pose: pose(current) })), rtt / 2)
    }, 50)
    await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      let nextDelivery = 0, messages = 0
      const session = createRoomSession({ endpoint: f.url, course: owner.latest.course, initialPose: pose(),
        socket: url => {
          const socket = new WebSocket(url, { origin: 'http://localhost:3000' }); sockets.push(socket)
          const wrapper = { get readyState() { return socket.readyState }, get bufferedAmount() { return socket.bufferedAmount },
            close() { socket.close() }, send(data) { later(() => { if (socket.readyState === 1) socket.send(data) }, rtt / 2) } }
          socket.on('open', () => wrapper.onopen?.())
          socket.on('close', () => wrapper.onclose?.())
          socket.on('error', () => wrapper.onerror?.())
          socket.on('message', data => {
            // A lost TCP packet stalls ordered delivery; it does not drop WebSocket messages.
            const jitter = ((++messages * 17 + index * 7) % 41) - 20
            const recoveryDelay = messages % 100 === 0 ? 100 : 0
            nextDelivery = Math.max(nextDelivery, performance.now() + Math.max(0, rtt / 2 + jitter) + recoveryDelay)
            later(() => { delivered++; wrapper.onmessage?.({ data: data.toString() }) }, nextDelivery - performance.now())
          })
          return wrapper
        } })
      sessions[index] = session
      session.connect({ type: 'inspect', roomId: owner.latest.roomId })
      await waitFor(() => session.store.getState().status === 'preview', 'preview', 8000)
      session.join('spectator', { ...profile, name: 'Watcher' })
      await waitFor(() => session.store.getState().clockOffset !== null, 'sync', 8000)
    }))
    // A real paused TCP reader, additional to simulated delay/jitter on the other watchers.
    sockets[19]._socket.pause()
    later(() => sockets[19]._socket.resume(), Math.min(seconds * 700, 4000))
    const heapBefore = process.memoryUsage().heapUsed
    sampler = setInterval(() => {
      for (let index = 0; index < sessions.length; index++) {
        const session = sessions[index], { clockOffset, snapshot } = session.store.getState()
        assert.equal(session.store.getState().status, 'joined')
        const buffer = session.getPoseBuffer(owner.latest.selfId)
        if (!buffer?.length) continue
        assert(buffer.length <= 8)
        const serverNow = performance.now() + clockOffset
        const target = serverNow - INTERPOLATION_DELAY_MS
        if (!samplePose(buffer, target, rendered)) continue
        // pose(sequence).z = -sequence, so interpolated Z identifies the original capture time.
        const interpolatedSequence = -rendered.position[2]
        const before = Math.floor(interpolatedSequence), after = Math.ceil(interpolatedSequence)
        const first = captures.get(before), last = captures.get(after)
        if (first !== undefined && last !== undefined) {
          const capture = first + (last - first) * (interpolatedSequence - before)
          ;(index === 19 ? slowAge : age).push(performance.now() - capture)
        }
        if (index !== 19) snapshotAge.push(serverNow - buffer.at(-1).time)
        assert.equal(snapshot.members.filter(member => member.role === 'racer').length, 5)
      }
    }, 16)
    await sleep(seconds * 1000)
    const result = { rttMs: rtt, jitterMs: 20, tcpRecoveryStall: '100 ms every 100th inbound message', seconds,
      racers: 5, watchers: 20, p95PoseReceiptAgeMs: percentile(snapshotAge), p95SampledCaptureAgeMs: percentile(age),
      p95SlowReaderSampledAgeMs: percentile(slowAge), heapGrowthBytes: process.memoryUsage().heapUsed - heapBefore,
      maxSimulatedPendingDeliveries: peakQueued, delivered, maxServerBufferedBytes: f.relay.metrics.maxBufferedBytes,
      skippedServerBatches: f.relay.metrics.skippedBatches, maxPoseSamples: Math.max(...sessions.flatMap(session =>
        session.store.getState().snapshot.entrants.map(entrant => session.getPoseBuffer(entrant.id)?.length ?? 0))) }
    assert(age.length > 0)
    return result
  } finally {
    clearInterval(publisher); clearInterval(sampler)
    sessions.forEach(session => session?.dispose()); timers.forEach(clearTimeout)
    sockets.forEach(socket => socket.terminate())
    for (const stop of cleanup) await stop()
  }
}
for (const rtt of [50, 150, 300]) console.log(JSON.stringify(await measure(rtt)))
