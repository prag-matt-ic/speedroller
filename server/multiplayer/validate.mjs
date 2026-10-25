import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFile } from 'node:fs/promises'
import { fixture, pose, waitFor } from './tests/helpers.mjs'

const durationSeconds = Number(process.env.SPIKE_SECONDS ?? 30)
assert(Number.isFinite(durationSeconds) && durationSeconds >= 3 && durationSeconds <= 300)
const cleanups = []
const f = await fixture({ after: callback => cleanups.push(callback) }, { realTime: true })
const racers = [], watchers = []
let sequence = 0, publisher
try {
  const owner = await f.connect(); await owner.create(); racers.push(owner)
  for (let i = 1; i < 5; i++) { const racer = await f.connect(); await racer.join(owner.latest.roomId); racers.push(racer) }
  for (const racer of racers) await racer.ready()
  await owner.request({ type: 'start' }, m => m.type === 'snapshot' && m.phase === 'countdown')
  const raceId = owner.latest.raceId
  await waitFor(() => owner.latest.phase === 'racing', 'scheduled GO', 5000)
  publisher = setInterval(() => racers.forEach(racer => racer.send({ type: 'pose', raceId, pose: pose(++sequence) })), 50)
  for (let i = 0; i < 20; i++) {
    const watcher = await f.connect(); await watcher.join(owner.latest.roomId, 'spectator'); watchers.push(watcher)
    assert.equal(watcher.messages[0].entrants.length, 5)
  }
  const members = [...racers, ...watchers]
  const received = members.map(client => client.messages.filter(m => m.type === 'poses').length)
  const before = { ...f.relay.metrics }
  const start = performance.now()
  await sleep(durationSeconds * 1000)
  const elapsedMs = performance.now() - start
  const batchesPerClient = members.map((client, index) => client.messages.filter(m => m.type === 'poses').length - received[index])
  assert(batchesPerClient.every(count => count >= durationSeconds * 18))
  assert.equal(f.relay.metrics.skippedBatches, 0)
  assert(members.every(client => client.socket.readyState === 1 && client.invalid.length === 0 && !client.messages.some(m => m.type === 'error')))
  const result = { protocolVersion: 1, methodology: 'Real local relay and WebSocket clients; no renderer or WAN simulation.',
    durationSeconds, racers: 5, spectators: 20, batchesPerClient,
    acceptedPoses: f.relay.metrics.acceptedPoses - before.acceptedPoses,
    outboundPayloadBytesPerSecond: (f.relay.metrics.outboundBytes - before.outboundBytes) / (elapsedMs / 1000),
    maxBufferedBytes: f.relay.metrics.maxBufferedBytes, skippedBatches: f.relay.metrics.skippedBatches }
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
} finally {
  clearInterval(publisher)
  for (const cleanup of cleanups) await cleanup()
}
