import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { connect } from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'
import { createRelay } from '../relay.mts'
import { LIMITS } from '../../../shared/multiplayer/protocol.mts'
import WebSocket from 'ws'

for (const status of [403, 429]) test(`HTTP ${status} rejected half-open upgrades cannot block shutdown`, async () => {
  const relay = createRelay({ allowedOrigins: ['http://localhost:3000'] })
  const serverSockets = new Set()
  relay.http.on('connection', socket => { serverSockets.add(socket); socket.on('close', () => serverSockets.delete(socket)) })
  relay.http.listen(0, '127.0.0.1'); await once(relay.http, 'listening')
  const port = relay.http.address().port
  let rejected
  try {
    if (status === 429) {
      for (let index = 0; index < LIMITS.connectionsPerMinute; index++) {
        const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:3000' })
        await once(socket, 'open')
        const closed = once(socket, 'close'); socket.terminate(); await closed
      }
    }
    rejected = connect({ port, host: '127.0.0.1', allowHalfOpen: true })
    rejected.on('error', () => {})
    await once(rejected, 'connect')
    let response = ''
    rejected.on('data', data => { response += data })
    const ended = once(rejected, 'end')
    rejected.write(`GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: ${status === 403 ? 'https://blocked.example' : 'http://localhost:3000'}\r\n\r\n`)
    await ended
    assert.match(response, new RegExp(`^HTTP/1.1 ${status} `))
    assert.equal(rejected.writableEnded, false, 'hostile client deliberately leaves its outgoing stream open')
    const closed = await Promise.race([relay.close().then(() => true), sleep(1500).then(() => false)])
    assert.equal(closed, true, 'shutdown must complete even while rejected client stays half-open')
  } finally {
    rejected?.destroy()
    for (const socket of serverSockets) socket.destroy()
    await relay.close()
  }
})
