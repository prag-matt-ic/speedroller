import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { compactPoseSchema, encodePose, decodePose, encodeMovement, serverMessageSchema, clientMessageSchema, PROTOCOL_VERSION, LIMITS } from '../../../shared/multiplayer/protocol.mts'
import { fixture, pose, profile, course, waitFor } from './helpers.mjs'

const envelope = { type: 'poses', protocolVersion: PROTOCOL_VERSION, roomId: '11111111-1111-4111-8111-111111111111', raceId: '22222222-2222-4222-8222-222222222222', revision: 1, serverTime: 1000 }
test('compact pose validates precision, bounds, quaternion and slot uniqueness', () => {
  const original = { ...pose(5), position: [1.123456789, -2.987654321, 123.9999999], rotation: [0, Math.sin(0.7), 0, Math.cos(0.7)] }
  const encoded = encodePose(original), decoded = decodePose(compactPoseSchema.parse(encoded))
  for (let i = 0; i < 3; i++) assert(Math.abs(decoded.position[i] - original.position[i]) <= 0.0005)
  assert(Math.abs(Math.hypot(...decoded.rotation) - 1) < 1e-12)
  assert.deepEqual(original.position, [1.123456789, -2.987654321, 123.9999999])
  for (const invalid of [encoded.slice(1), [...encoded, 1], [-1, ...encoded.slice(1)], [1, 0, Infinity, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0]]) assert.equal(compactPoseSchema.safeParse(invalid).success, false)
  const movement = encodeMovement({ slot: 2, receivedAt: 1000.6, pose: original })
  const message = serverMessageSchema.parse({ ...envelope, entrants: [movement] })
  assert.equal(message.entrants[0].slot, 2); assert.equal(message.entrants[0].receivedAt, 1001)
  assert.equal(serverMessageSchema.safeParse({ ...envelope, entrants: [movement, movement] }).success, false)
  assert.equal(clientMessageSchema.safeParse({ protocolVersion: 1, type: 'create', profile, course }).success, false)
})

test('changes-only batches recover skipped updates, preserve colours and serialize once per shared batch', async t => {
  const f = await fixture(t)
  const { owner, racers, raceId } = await f.race(2)
  await f.advance(3000)
  const originalGetter = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'bufferedAmount')
  let congested = false
  Object.defineProperty(WebSocket.prototype, 'bufferedAmount', { configurable: true, get() {
    return this._isServer && congested ? LIMITS.softQueueBytes + 1 : originalGetter.get.call(this)
  } })
  t.after(() => Object.defineProperty(WebSocket.prototype, 'bufferedAmount', originalGetter))
  const stringify = JSON.stringify
  let serializations = 0
  JSON.stringify = function(value, ...args) { if (value?.type === 'poses') serializations++; return stringify(value, ...args) }
  t.after(() => { JSON.stringify = stringify })
  const batches = () => owner.messages.filter(message => message.type === 'poses')
  const before = batches().length
  await f.advance(34); assert.equal(batches().length, before, 'no empty or unchanged batches')
  owner.send({ type: 'pose', raceId, pose: pose(1) })
  await waitFor(() => f.relay.metrics.acceptedPoses === 1)
  await f.advance(34)
  assert.equal(serializations, 1)
  assert.deepEqual(batches().at(-1).entrants.map(e => e.slot), [1])
  assert.equal(owner.latest.entrants[0].profile.colour, profile.colour)
  congested = true
  owner.send({ type: 'pose', raceId, pose: pose(2) })
  await waitFor(() => f.relay.metrics.acceptedPoses === 2)
  await f.advance(34)
  const skippedCount = batches().length
  assert(f.relay.metrics.skippedBatches > 0)
  congested = false
  await f.advance(34)
  assert.equal(batches().length, skippedCount + 1)
  assert.equal(batches().at(-1).entrants.length, 2, 'recover all poses even with no new uploads')
  assert.equal(batches().at(-1).entrants[0].pose.sequence, 2)
  await f.advance(34); assert.equal(batches().length, skippedCount + 1)
  await owner.request({ type: 'finish', raceId, elapsedMs: 100, pose: pose(3) }, m => m.type === 'snapshot')
  racers[1].send({ type: 'pose', raceId, pose: pose(1) })
  await waitFor(() => f.relay.metrics.acceptedPoses === 3)
  await f.advance(34)
  assert.deepEqual(batches().at(-1).entrants.map(e => e.slot), [2], 'finished racers leave movement stream')
  const late = await f.connect(); await late.join(owner.latest.roomId, 'spectator')
  assert.equal(late.latest.entrants[0].status, 'finished')
  assert.equal(late.latest.entrants[0].profile.colour, profile.colour)
})
