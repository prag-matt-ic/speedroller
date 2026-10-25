import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, connect } from 'node:net'
import { spawn, execFileSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { once } from 'node:events'
import WebSocket from 'ws'
import { clientIp } from '../clientIp.mts'
import { course, profile, waitFor } from './helpers.mjs'

test('staging upload contains only the standalone service and shared protocol', t => {
  const directory = execFileSync(process.execPath, ['package-staging.mjs'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim()
  t.after(() => rmSync(directory, { recursive: true }))
  const files = readdirSync(directory, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
    .map(entry => `${entry.parentPath.slice(directory.length + 1)}/${entry.name}`).sort()
  assert.deepEqual(files, ['server/multiplayer/Dockerfile', 'server/multiplayer/clientIp.mts', 'server/multiplayer/main.mts', 'server/multiplayer/logging.mts',
    'server/multiplayer/package-lock.json', 'server/multiplayer/package.json', 'server/multiplayer/queue.mts',
    'server/multiplayer/relay.mts', 'server/multiplayer/tsconfig.json', 'shared/multiplayer/clock.mts', 'shared/multiplayer/protocol.mts'].sort())
})

test('proxy IP trust is explicit, single validated X-Real-IP only, with mapped IPv4 normalized', () => {
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-real-ip': '203.0.113.1', 'x-forwarded-for': '198.51.100.1' } }
  assert.equal(clientIp(request, false), '127.0.0.1')
  assert.equal(clientIp(request, true), '203.0.113.1')
  for (const invalid of [undefined, ['203.0.113.1'], '203.0.113.1, 198.51.100.1', 'not-ip']) {
    request.headers['x-real-ip'] = invalid; assert.equal(clientIp(request, true), null)
  }
  request.headers['x-real-ip'] = '::ffff:203.0.113.1'
  assert.equal(clientIp(request, true), '203.0.113.1')
})

test('actual process SIGTERM notifies rooms and exits within drain budget even with partial HTTP requests', async t => {
  const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening')
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve))
  const child = spawn(process.execPath, ['main.mts'], { cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: 'http://localhost:3000', TRUST_RAILWAY_PROXY: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL') })
  let output = ''; child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
  await waitFor(() => output.includes('listening'), 'process listening')
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200)
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:3000' })
  t.after(() => socket.terminate()); await once(socket, 'open')
  const messages = []; socket.on('message', data => messages.push(JSON.parse(data)))
  socket.send(JSON.stringify({ protocolVersion: 1, type: 'create', profile, course }))
  await waitFor(() => messages.some(m => m.type === 'snapshot'))
  const slowHttp = connect(port, '127.0.0.1'); slowHttp.on('error', () => {}); t.after(() => slowHttp.destroy())
  await once(slowHttp, 'connect'); slowHttp.write('GET /health HTTP/1.1\r\nHost: localhost\r\n')
  const started = performance.now(), exited = once(child, 'exit'); child.kill('SIGTERM')
  const [code] = await exited
  assert.equal(code, 0); assert(performance.now() - started < 4000)
  assert(messages.some(m => m.type === 'closed' && m.reason === 'shutdown'))
  assert(output.includes('multiplayer_shutdown'))
  assert(!output.includes(messages.find(m => m.type === 'snapshot').roomId), 'logs must not include invite IDs')
})
