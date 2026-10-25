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
