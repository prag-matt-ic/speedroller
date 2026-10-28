import test from 'node:test'
import assert from 'node:assert/strict'
import { createLogger, startTelemetry } from '../logging.mts'
import { fixture, pose, profile, waitFor } from './helpers.mjs'

test('Pino captures correlated control traces and bounded timings without invite IDs or player payloads', async t => {
  const events = []
  const logger = createLogger({ write: line => { events.push(JSON.parse(line)) } })
  const f = await fixture(t, { logger })
  const { owner, raceId, roomId } = await f.race()
  await f.advance(3000)
  owner.send({ type: 'pose', raceId, pose: pose(1) })
  await waitFor(() => f.relay.metrics.acceptedPoses === 1)
  await owner.error({ type: 'start' }, 'wrong-phase')
  const stop = startTelemetry(f.relay, logger); stop()
  const state = events.find(event => event.event === 'room.state')
  assert(state.traceId && state.traceId !== roomId)
  assert(events.some(event => event.event === 'ws.command.completed' && event.traceId === state.traceId && event.durationMs >= 0))
  assert(events.some(event => event.event === 'ws.command.rejected' && event.code === 'wrong-phase'))
  assert(!events.some(event => event.command === 'pose'))
  const metrics = events.find(event => event.event === 'multiplayer_metrics')
  assert(metrics.timings.commandDuration.count > 0 && metrics.timings.tickDuration.count > 0)
  assert(metrics.timings.commandDuration.p99Ms >= 0)
  assert.equal(f.relay.timings.commandDuration.count, 0, 'histograms reset per reporting window')
  const output = JSON.stringify(events)
  assert(!output.includes(roomId)); assert(!output.includes(profile.name)); assert(!output.includes(profile.colour))
  assert(events.every(event => typeof event.level === 'string' && Number.isFinite(Date.parse(event.time))))
})
