import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { fixture, course, pose, profile, waitFor } from './helpers.mjs'
import { loadTypeScript } from '../../../tests/loadTypeScript.mjs'
const { createRoomSession, canStartRace } = loadTypeScript('utils/multiplayer/session.ts')

function browserSession(t, f) {
  const session = createRoomSession({ endpoint: f.url, course, initialPose: pose(),
    socket: url => new WebSocket(url, { origin: 'http://localhost:3000' }) })
  t.after(() => session.dispose())
  session.setReady(true)
  return session
}
const selfReady = session => {
  const snapshot = session.store.getState().snapshot
  return snapshot?.members.find(member => member.id === snapshot.selfId)?.ready
}

test('browser session creates, previews without admission, joins, synchronizes and starts once', async t => {
  const f = await fixture(t)
  const owner = browserSession(t, f)
  owner.connect({ type: 'create', profile })
  await waitFor(() => selfReady(owner), 'owner ready')
  assert.equal(canStartRace(owner.store.getState().snapshot), false)
  const roomId = owner.store.getState().snapshot.roomId
  const guest = browserSession(t, f)
  guest.connect({ type: 'inspect', roomId })
  await waitFor(() => guest.store.getState().status === 'preview')
  assert.equal(guest.store.getState().info.racers, 1)
  assert.equal(owner.store.getState().snapshot.members.length, 1)
  guest.join('racer', { ...profile, name: 'PlayerTwo' })
  await waitFor(() => selfReady(guest) && canStartRace(owner.store.getState().snapshot))
  assert.notEqual(guest.store.getState().clockOffset, null)
  guest.start()
  assert.equal(owner.store.getState().snapshot.phase, 'waiting')
  owner.start(); owner.start()
  await waitFor(() => owner.store.getState().snapshot.phase === 'countdown')
  const late = browserSession(t, f)
  late.connect({ type: 'inspect', roomId })
  await waitFor(() => late.store.getState().info?.phase === 'countdown')
  late.join('spectator', { ...profile, name: 'Watcher' })
  await waitFor(() => late.store.getState().status === 'joined')
  assert.equal(late.store.getState().snapshot.members.find(m => m.id === late.store.getState().snapshot.selfId).role, 'spectator')
  await f.advance(3000)
  await waitFor(() => owner.store.getState().snapshot.phase === 'racing')
  await waitFor(() => late.getLatestPoses() !== null)
  const snapshot = late.store.getState().snapshot
  await f.advance(50)
  assert.equal(late.store.getState().snapshot, snapshot, 'pose batches must not update reactive room state')
  owner.leave()
  assert.equal(owner.store.getState().status, 'idle')
})

test('full and active room lookup does not claim a place; closed and incompatible links fail clearly', async t => {
  const f = await fixture(t)
  const { owner, roomId } = await f.race(5)
  const guest = browserSession(t, f)
  guest.connect({ type: 'inspect', roomId })
  await waitFor(() => guest.store.getState().status === 'preview')
  assert.equal(guest.store.getState().info.racers, 5)
  assert.equal(guest.store.getState().info.phase, 'countdown')
  guest.join('racer', profile)
  await waitFor(() => guest.store.getState().status === 'preview' && guest.store.getState().error)
  assert.match(guest.store.getState().error, /already started/)
  await owner.disconnect()
  guest.connect({ type: 'inspect', roomId })
  await waitFor(() => guest.store.getState().status === 'error')
  assert.match(guest.store.getState().error, /closed or expired/)
})

test('disabled multiplayer never creates a socket; cancellation ignores stale callbacks', async () => {
  let calls = 0
  const disabled = createRoomSession({ endpoint: undefined, course, initialPose: pose(), socket: () => { calls++; throw Error() } })
  disabled.connect({ type: 'create', profile })
  assert.equal(calls, 0)
  assert.equal(disabled.store.getState().status, 'error')
  disabled.leave()
  const fake = { readyState: 0, close() {}, send() {}, bufferedAmount: 0 }
  const session = createRoomSession({ endpoint: 'ws://localhost:8080', course, initialPose: pose(), socket: () => fake })
  session.connect({ type: 'create', profile })
  const stale = fake.onerror
  session.leave(); stale()
  assert.equal(session.store.getState().status, 'idle')
  session.dispose()
})

test('cylinder lobby accepts exact topology and rejects a different course before admission', async t => {
  const f = await fixture(t)
  const owner = await f.connect()
  const cylinder = { ...course, topology: 'cylinder', columns: 132 }
  await owner.request({ type: 'create', profile, course: cylinder }, m => m.type === 'snapshot')
  const guest = await f.connect()
  await guest.error({ type: 'inspect', roomId: owner.latest.roomId, course }, 'course-mismatch')
  const info = await guest.request({ type: 'inspect', roomId: owner.latest.roomId, course: cylinder }, m => m.type === 'room-info')
  assert.equal(info.racers, 1)
  assert.equal(owner.latest.members.length, 1)
})

for (const count of [2, 3, 5]) test(`${count} browser controllers agree on poses, finishes, ties and rematch`, async t => {
  const f = await fixture(t)
  const sessions = []
  for (let index = 0; index < count; index++) {
    const session = createRoomSession({ endpoint: f.url, course, initialPose: pose(), now: f.now,
      socket: url => new WebSocket(url, { origin: 'http://localhost:3000' }) })
    sessions.push(session); t.after(() => session.dispose()); session.setReady(true)
    if (!index) session.connect({ type: 'create', profile })
    else {
      session.connect({ type: 'inspect', roomId: sessions[0].store.getState().snapshot.roomId })
      await waitFor(() => session.store.getState().status === 'preview')
      session.join('racer', { ...profile, name: `Player${index + 1}` })
    }
    await waitFor(() => selfReady(session))
  }
  const owner = sessions[0]
  await waitFor(() => owner.store.getState().snapshot.members.length === count && canStartRace(owner.store.getState().snapshot))
  owner.start()
  await waitFor(() => sessions.every(s => s.store.getState().snapshot.phase === 'countdown'))
  const { raceId, startAt } = owner.store.getState().snapshot
  assert.ok(sessions.every(s => s.store.getState().snapshot.startAt === startAt))
  await f.advance(3100)
  await waitFor(() => sessions.every(s => s.store.getState().snapshot.phase === 'racing'))
  for (const session of sessions) {
    assert.equal(session.publishPose(raceId, [1, 2, 3], 0), true)
    assert.equal(session.publishPose(raceId, [2, 3, 4], 0), false, '20 Hz cap')
  }
  await waitFor(() => f.relay.metrics.acceptedPoses === count)
  await f.advance(50)
  await waitFor(() => sessions.every(s => s.getPoseBuffer(owner.store.getState().snapshot.selfId)?.at(-1)?.pose.sequence === 1))
  for (const session of sessions) {
    assert.equal(session.finish(raceId, 100, [3, 2, 1], 0), true)
    assert.equal(session.finish(raceId, 100, [3, 2, 1], 0), false)
  }
  await waitFor(() => sessions.every(s => s.store.getState().snapshot.phase === 'results'))
  const results = owner.store.getState().snapshot.entrants
  assert.ok(results.every(e => e.place === 1 && e.elapsedMs === 100))
  for (const session of sessions) assert.deepEqual(session.store.getState().snapshot.entrants, results)
  owner.newRace()
  await waitFor(() => sessions.every(s => s.store.getState().snapshot.phase === 'waiting'))
  for (const session of sessions) {
    assert.equal(session.getPoseBuffer(results[0].id), undefined)
    assert.equal(session.publishPose(raceId, [0, 0, 0], 0), false)
    assert.equal(session.finish(raceId, 100, [0, 0, 0], 0), false)
    assert.equal(selfReady(session), false)
    session.setReady(true)
  }
  await waitFor(() => canStartRace(owner.store.getState().snapshot))
  owner.start()
  await waitFor(() => sessions.every(s => s.store.getState().snapshot.phase === 'countdown'))
  assert.notEqual(owner.store.getState().snapshot.raceId, raceId)
})

test('spectators bootstrap every phase, follow finish/DNF, reconnect and survive a rematch while loading', async t => {
  const f = await fixture(t)
  const owner = await f.connect(); await owner.create()
  const racers = [owner]
  for (let i = 1; i < 5; i++) { const racer = await f.connect(); await racer.join(owner.latest.roomId); racers.push(racer) }
  const watchers = []
  async function watch() {
    const session = browserSession(t, f)
    session.connect({ type: 'inspect', roomId: owner.latest.roomId })
    await waitFor(() => session.store.getState().status === 'preview')
    session.join('spectator', { ...profile, name: 'Watcher' })
    await waitFor(() => session.store.getState().clockOffset !== null)
    watchers.push(session)
    assert.equal(session.store.getState().snapshot.members.find(m => m.id === session.store.getState().snapshot.selfId).ready, false)
    return session
  }
  const waiting = await watch()
  assert.equal(waiting.store.getState().snapshot.phase, 'waiting')
  assert.equal(waiting.store.getState().followId, null)
  for (const racer of racers) await racer.ready()
  await f.advance(1000)
  await owner.request({ type: 'start' }, m => m.type === 'snapshot' && m.phase === 'countdown')
  const countdown = await watch()
  assert.equal(countdown.store.getState().snapshot.phase, 'countdown')
  const { raceId } = owner.latest
  await f.advance(4000)
  const midrace = await watch()
  assert.equal(midrace.store.getState().snapshot.phase, 'racing')
  assert.equal(midrace.getPoseBuffer(owner.latest.selfId).length, 1)
  assert.equal(midrace.publishPose(raceId, [0, 0, 0], 0), false)
  assert.equal(midrace.finish(raceId, 100, [0, 0, 0], 0), false)
  await owner.request({ type: 'finish', raceId, elapsedMs: 1000, pose: pose(1) }, m => m.type === 'snapshot')
  const finished = await watch()
  assert.equal(finished.store.getState().snapshot.entrants[0].status, 'finished')
  assert.equal(finished.store.getState().followId, racers[1].latest.selfId)
  await racers[1].disconnect()
  await waitFor(() => finished.store.getState().followId === racers[2].latest.selfId)
  for (const racer of racers.slice(2)) await racer.request({ type: 'finish', raceId, elapsedMs: 1000, pose: pose(1) }, m => m.type === 'snapshot')
  const results = await watch()
  assert.equal(results.store.getState().snapshot.phase, 'results')
  assert.equal(results.store.getState().snapshot.entrants.length, 5)
  midrace.leave()
  const reconnected = await watch()
  assert.deepEqual(reconnected.store.getState().snapshot.entrants, results.store.getState().snapshot.entrants)
  await owner.request({ type: 'new-race', raceId }, m => m.type === 'snapshot' && m.phase === 'waiting')
  await waitFor(() => results.store.getState().snapshot.phase === 'waiting')
  assert.equal(results.store.getState().followId, null)
  assert.equal(results.getPoseBuffer(owner.latest.selfId), undefined)
  // The scene may still be loading; the retained controller must contain the newest room only.
  assert.equal(waiting.store.getState().snapshot.raceId, null)
  assert.equal(waiting.store.getState().snapshot.members.find(m => m.id === waiting.store.getState().snapshot.selfId).role, 'spectator')
})
