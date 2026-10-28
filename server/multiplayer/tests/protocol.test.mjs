import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { profileSchema, LIMITS } from '../../../shared/multiplayer/protocol.mts'
import { queueAction } from '../queue.mts'
import { fixture, course, profile, pose } from './helpers.mjs'
import { once } from 'node:events'
import WebSocket from 'ws'

test('multiplayer username contract matches the existing solo schema', async () => {
  const source = await readFile(new URL('../../../model/schema.ts', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('schema.ts', source, ts.ScriptTarget.Latest, true)
  const declaration = ast.statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
    .find(declaration => declaration.name.getText(ast) === 'speedRunSubmissionSchema')
  const username = declaration.initializer.arguments[0].properties.find(property => property.name.getText(ast) === 'username')
  assert.equal(username.initializer.getText(ast), 'z.string().min(6).max(12)')
  for (const [name, valid] of [['short', false], ['sixsix', true], ['twelveChars!', true], ['thirteenChars', false]]) {
    assert.equal(profileSchema.safeParse({ ...profile, name }).success, valid)
  }
})

test('queue policy sheds only replaceable state and closes slow or blocked control paths', () => {
  const { softQueueBytes: soft, hardQueueBytes: hard, congestionMs } = LIMITS
  assert.equal(queueAction(soft, null, 0, true), 'send')
  assert.equal(queueAction(soft + 1, null, 0, true), 'skip')
  assert.equal(queueAction(soft + 1, 0, congestionMs - 1, true), 'skip')
  assert.equal(queueAction(soft + 1, 0, congestionMs, true), 'close')
  assert.equal(queueAction(hard + 1, null, 0, true), 'close')
  assert.equal(queueAction(soft + 1, null, 0, false), 'close')
  assert.equal(queueAction(0, 0, congestionMs, false), 'send')
})

test('clock tokens cannot be borrowed or replayed; stale poses and finishes cannot replace accepted data', async t => {
  const f = await fixture(t)
  const first = await f.connect(); await first.create()
  const second = await f.connect(); await second.join(first.latest.roomId)
  const tokens = []
  for (let i = 0; i < 5; i++) tokens.push((await first.request({ type: 'ping', clientTime: i }, m => m.type === 'pong')).token)
  await second.error({ type: 'sync', tokens }, 'invalid-sync')
  await first.request({ type: 'sync', tokens }, m => m.type === 'synced')
  await first.error({ type: 'sync', tokens }, 'invalid-sync')
  await f.advance(1000)
  await first.request({ type: 'ready', course, pose: pose() }, m => m.type === 'snapshot')
  await second.ready()
  await first.request({ type: 'start' }, m => m.type === 'snapshot' && m.phase === 'countdown')
  await f.advance(4000)
  const raceId = first.latest.raceId
  await first.request({ type: 'finish', raceId, elapsedMs: 800, pose: pose(2) }, m => m.type === 'snapshot')
  first.send({ type: 'finish', raceId, elapsedMs: 1, pose: pose(3) })
  const snapshot = await first.request({ type: 'snapshot' }, m => m.type === 'snapshot')
  assert.equal(snapshot.entrants[0].elapsedMs, 800)
  assert.equal(snapshot.entrants[0].pose.sequence, 2)
})

test('separate pose rate bound and connection creation throttles', async t => {
  const f = await fixture(t)
  const { owner, raceId } = await f.race()
  await f.advance(3000)
  const closed = once(owner.socket, 'close')
  for (let i = 1; i <= 41; i++) owner.send({ type: 'pose', raceId, pose: pose(i) })
  assert.equal((await closed)[0], 1008)
  for (let i = 0; i < 8; i++) { const client = await f.connect(); await client.create() }
  const final = await f.connect(); await final.create()
  const throttled = await f.connect()
  await throttled.error({ type: 'create', profile, course }, 'rate-limit')
  // Count all upgrade attempts, including clients that never join; forwarded IPs cannot bypass it.
  for (let i = 12; i < LIMITS.connectionsPerMinute; i++) { const client = await f.connect(); await client.disconnect() }
  const socket = new WebSocket(f.url, { origin: 'http://localhost:3000', headers: { 'X-Forwarded-For': '1.2.3.4' } })
  socket.on('error', () => {})
  const status = await new Promise(resolve => socket.on('unexpected-response', (_, response) => {
    response.resume(); resolve(response.statusCode); socket.terminate()
  }))
  assert.equal(status, 429)
})
