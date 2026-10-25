import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import WebSocket from 'ws'
import { fixture, course, profile, pose, waitFor } from './helpers.mjs'
import { LIMITS, clientMessageSchema, roomUrl } from '../../../shared/multiplayer/protocol.mts'
import { estimateClockOffset } from '../../../shared/multiplayer/clock.mts'

test('five racers, readiness, owner-only start, closed entry, late snapshots and rematch', async t => {
  const f = await fixture(t)
  const owner = await f.connect(); await owner.create()
  await owner.error({ type: 'start' }, 'need-opponent')
  const racers = [owner]
  for (let i = 1; i < 5; i++) { const racer = await f.connect(); await racer.join(owner.latest.roomId); racers.push(racer) }
  await owner.error({ type: 'start' }, 'not-ready')
  await racers[1].error({ type: 'start' }, 'owner-only')
  await f.advance(1000)
  for (const racer of racers) await racer.ready()
  await f.advance(1000)
  await owner.request({ type: 'start' }, m => m.type === 'snapshot' && m.phase === 'countdown')
  const raceId = owner.latest.raceId
  assert.equal(owner.latest.startAt, f.now() + 3000)
  const sixth = await f.connect()
  await sixth.error({ type: 'join', roomId: owner.latest.roomId, role: 'racer', profile, course }, 'entry-closed')
  await owner.error({ type: 'start' }, 'wrong-phase')
  await owner.error({ type: 'finish', raceId, elapsedMs: 0, pose: pose(1) }, 'wrong-phase')
  const watcher = await f.connect(); await watcher.join(owner.latest.roomId, 'spectator')
  assert.equal(watcher.messages[0].phase, 'countdown')
  assert.equal(watcher.latest.entrants.length, 5)
  await f.advance(2999); assert.equal(owner.latest.phase, 'countdown')
  await f.advance(1); await waitFor(() => owner.latest.phase === 'racing')
  await watcher.error({ type: 'pose', raceId, pose: pose(1) }, 'racer-only')
  await watcher.error({ type: 'finish', raceId, elapsedMs: 0, pose: pose(1) }, 'racer-only')
  await watcher.error({ type: 'claim-slot' }, 'entry-closed')
  await owner.error({ type: 'finish', raceId, elapsedMs: 9999, pose: pose(1) }, 'invalid-time')
  await f.advance(1000)
  for (let i = 0; i < 5; i++) {
    await racers[i].request({ type: 'finish', raceId, elapsedMs: i < 2 ? 1000 : 1000 + i * 10, pose: pose(2) },
      m => m.type === 'snapshot' && m.entrants[i].status === 'finished')
    if (i === 0) {
      const late = await f.connect(); await late.join(owner.latest.roomId, 'spectator')
      assert.equal(late.messages[0].entrants[0].elapsedMs, 1000)
      assert.equal(late.messages[0].entrants[0].pose.sequence, 2)
      assert(late.messages[0].entrants.every(entrant => entrant.pose))
    }
  }
  assert.deepEqual(owner.latest.entrants.map(e => e.place), [1, 1, 3, 4, 5])
  const resultsWatcher = await f.connect(); await resultsWatcher.join(owner.latest.roomId, 'spectator')
  assert.equal(resultsWatcher.latest.phase, 'results')
  assert.deepEqual(resultsWatcher.latest.entrants, owner.latest.entrants)
  await owner.error({ type: 'finish', raceId, elapsedMs: 1, pose: pose(3) }, 'wrong-phase')
  await owner.request({ type: 'new-race', raceId }, m => m.type === 'snapshot' && m.phase === 'waiting')
  assert.equal(owner.latest.raceId, null)
  assert(owner.latest.members.filter(m => m.role === 'racer').every(m => !m.ready))
  await owner.error({ type: 'finish', raceId, elapsedMs: 1, pose: pose(4) }, 'stale-race')
  await f.advance(1000)
  for (const racer of racers) await racer.request({ type: 'ready', course, pose: pose() }, m => m.type === 'snapshot')
  await owner.error({ type: 'start', revision: 0 }, 'stale-room')
  await owner.request({ type: 'start' }, m => m.type === 'snapshot' && m.phase === 'countdown')
  assert.notEqual(owner.latest.raceId, raceId)
  await f.advance(3000)
  await owner.error({ type: 'finish', raceId, elapsedMs: 1, pose: pose(5) }, 'stale-race')
})

test('simultaneous fifth-slot admissions are atomic and spectators have a separate cap', async t => {
  const f = await fixture(t)
  const owner = await f.connect(); await owner.create()
  for (let i = 1; i < 4; i++) { const racer = await f.connect(); await racer.join(owner.latest.roomId) }
  const contenders = await Promise.all([f.connect(), f.connect()])
  const command = { type: 'join', roomId: owner.latest.roomId, role: 'racer', profile, course }
  const responses = await Promise.all(contenders.map(c => c.request(command, m => m.type === 'snapshot' || m.type === 'error')))
  assert.equal(responses.filter(m => m.type === 'snapshot').length, 1)
  assert.equal(responses.find(m => m.type === 'error').code, 'full')
  for (let i = 0; i < 20; i++) { const watcher = await f.connect(); await watcher.join(owner.latest.roomId, 'spectator') }
  const overflow = await f.connect()
  await overflow.error({ ...command, role: 'spectator' }, 'full')
  assert.equal(owner.latest.members.length, 25)
})

test('countdown disconnect cancels race ID; owner departure closes waiting/countdown room', async t => {
  const f = await fixture(t)
  const { owner, racers, raceId, roomId } = await f.race(3)
  await racers[2].disconnect()
  await waitFor(() => owner.latest.phase === 'waiting')
  assert.equal(owner.latest.raceId, null)
  await owner.error({ type: 'start', revision: 0 }, 'stale-room')
  await owner.request({ type: 'start' }, m => m.type === 'snapshot' && m.phase === 'countdown')
  assert.notEqual(owner.latest.raceId, raceId)
  const opponent = racers[1]
  await owner.disconnect()
  await waitFor(() => opponent.messages.some(m => m.type === 'closed' && m.reason === 'owner-left'))
  const visitor = await f.connect()
  await visitor.error({ type: 'join', roomId, role: 'spectator', profile, course }, 'room-missing')
})

test('owner DNF during racing does not stop others; accepted finishes survive disconnect', async t => {
  const f = await fixture(t)
  const { owner, racers, raceId, roomId } = await f.race(3)
  await f.advance(4000)
  await racers[1].request({ type: 'finish', raceId, elapsedMs: 900, pose: pose(1) }, m => m.type === 'snapshot')
  await racers[1].disconnect(); await owner.disconnect()
  await waitFor(() => racers[2].latest.ownerConnected === false)
  assert.equal(racers[2].latest.entrants[0].status, 'dnf')
  assert.equal(racers[2].latest.entrants[1].status, 'finished')
  const returner = await f.connect()
  await returner.error({ type: 'join', roomId, role: 'racer', profile, course }, 'entry-closed')
  await returner.join(roomId, 'spectator')
  await racers[2].request({ type: 'finish', raceId, elapsedMs: 1000, pose: pose(1) }, m => m.type === 'snapshot' && m.phase === 'results')
  await racers[2].error({ type: 'new-race', raceId }, 'owner-only')
  assert.deepEqual(racers[2].latest.entrants.map(e => e.place), [null, 1, 2])
})

test('race deadline, idle expiry, spectator polling and empty-room cleanup', async t => {
  const f = await fixture(t)
  const { owner, roomId } = await f.race()
  await f.advance(3000 + LIMITS.raceMs)
  assert.equal(owner.latest.phase, 'results')
  assert(owner.latest.entrants.every(e => e.status === 'dnf'))
  const watcher = await f.connect(); await watcher.join(roomId, 'spectator')
  await f.advance(LIMITS.idleRoomMs - 1000)
  await watcher.request({ type: 'snapshot' }, m => m.type === 'snapshot')
  await f.advance(1000)
  await waitFor(() => watcher.messages.some(m => m.type === 'closed' && m.reason === 'expired'))
  const alone = await f.connect(); await alone.create(); const emptyId = alone.latest.roomId
  await alone.request({ type: 'leave' }, m => m.type === 'left')
  await alone.error({ type: 'join', roomId: emptyId, role: 'spectator', profile, course }, 'room-missing')
})

test('course/version validation, malformed commands, stale poses and cross-room isolation', async t => {
  const f = await fixture(t)
  const { owner, raceId } = await f.race()
  await f.advance(4000)
  const other = await f.connect(); await other.create()
  await other.error({ type: 'pose', raceId, pose: pose(1) }, 'stale-race')
  const bad = await f.connect()
  await bad.error({ type: 'join', roomId: owner.latest.roomId, role: 'spectator', profile, course: { ...course, rulesVersion: 'other' } }, 'course-mismatch')
  await bad.error({ type: 'create', profile, course, protocolVersion: 0 }, 'protocol-mismatch')
  await bad.error({ type: 'create', profile: { ...profile, name: 'x' }, course }, 'invalid-message')
  await bad.error({ type: 'pose', raceId, pose: { ...pose(1), rotation: [0, 0, 0, 0] } }, 'invalid-message')
  await owner.error({ type: 'pose', raceId, roomId: other.latest.roomId, pose: pose(1) }, 'invalid-message')
  owner.send({ type: 'pose', raceId, pose: pose(2) })
  await waitFor(() => f.relay.metrics.acceptedPoses === 1)
  await owner.error({ type: 'pose', raceId, pose: pose(1) }, 'stale-pose')
  await f.advance(50)
  await waitFor(() => owner.messages.some(m => m.type === 'poses'))
  assert.equal(other.messages.filter(m => m.type === 'poses').length, 0)
})

test('clock exchange required; lowest RTT offset; share URL preserves pathname', async t => {
  const f = await fixture(t)
  const owner = await f.connect(); await owner.create()
  await owner.error({ type: 'ready', course, pose: pose() }, 'clock-sync-required')
  await owner.error({ type: 'sync', tokens: Array(5).fill(crypto.randomUUID()) }, 'invalid-message')
  await f.advance(1000); await owner.ready()
  const samples = [200, 100, 40, 60, 80].map(rtt => ({ clientSentAt: 1000, clientReceivedAt: 1000 + rtt, serverTime: 5000 + rtt / 2 }))
  assert.deepEqual(estimateClockOffset(samples), { roundTripMs: 40, offsetMs: 4000 })
  assert.throws(() => estimateClockOffset(samples.slice(0, 4)))
  const link = new URL(roomUrl('https://example.com/game?test=1', owner.latest.roomId, true))
  assert.equal(link.pathname, '/game'); assert.equal(link.searchParams.get('watch'), '1')
  assert.equal(link.searchParams.get('room'), owner.latest.roomId)
  assert.equal(clientMessageSchema.safeParse({ type: 'start', protocolVersion: 1, ownerId: owner.latest.selfId }).success, false)
})

test('origin, payload, rate limits, heartbeat, unjoined timeout and healthcheck', async t => {
  const f = await fixture(t)
  assert.equal((await fetch(f.url.replace('ws:', 'http:') + '/health')).status, 200)
  for (const origin of ['https://wrong.example', undefined]) {
    const socket = new WebSocket(f.url, origin ? { origin } : {})
    socket.on('error', () => {})
    const [response] = await new Promise(resolve => socket.once('unexpected-response', (_, response) => { response.resume(); resolve([response]); socket.terminate() }))
    assert.equal(response.statusCode, 403)
  }
  const oversized = await f.connect(); const closed = once(oversized.socket, 'close')
  oversized.socket.send('x'.repeat(9000)); assert.equal((await closed)[0], 1009)
  const flood = await f.connect(); const flooded = once(flood.socket, 'close')
  for (let i = 0; i < 11; i++) flood.socket.send('{')
  assert.equal((await flooded)[0], 1008)
  const silent = await f.connect({ autoPong: false }); await silent.create()
  await f.advance(15000); await waitFor(() => silent.socket.readyState === WebSocket.CLOSED)
  const unjoined = await f.connect(); await f.advance(10000)
  await waitFor(() => unjoined.socket.readyState === WebSocket.CLOSED)
})

test('spectator claims a free slot after rematch and graceful shutdown closes sockets', async t => {
  const f = await fixture(t)
  const { owner, raceId, roomId } = await f.race()
  const watcher = await f.connect(); await watcher.join(roomId, 'spectator')
  await f.advance(3000 + LIMITS.raceMs)
  await owner.request({ type: 'new-race', raceId }, m => m.type === 'snapshot' && m.phase === 'waiting')
  await watcher.request({ type: 'claim-slot' }, m => m.type === 'snapshot' && m.members.find(x => x.id === m.selfId).role === 'racer')
  assert.equal(watcher.latest.members.find(m => m.id === watcher.latest.selfId).ready, false)
  await f.relay.close()
  await waitFor(() => owner.socket.readyState === WebSocket.CLOSED, 'client observes shutdown')
  assert(owner.messages.some(m => m.type === 'closed' && m.reason === 'shutdown'))
})


test('disconnect at the GO deadline uses server time even before the next timer tick', async t => {
  const f = await fixture(t)
  const { owner, racers } = await f.race()
  f.elapse(3000)
  await owner.disconnect()
  await waitFor(() => racers[1].latest.ownerConnected === false)
  assert.equal(racers[1].latest.phase, 'racing')
  assert.equal(racers[1].latest.entrants[0].status, 'dnf')
  assert(!racers[1].messages.some(message => message.type === 'closed'))
})
