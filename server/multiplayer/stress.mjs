import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { openSync, closeSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHistogram } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { createRelay } from './relay.mts'
import { createLogger, startTelemetry } from './logging.mts'
import { fixture, pose, waitFor } from './tests/helpers.mjs'

if (process.argv.includes('--server')) {
  // Only this loopback fixture trusts synthetic source IPs; production limits stay unchanged.
  const logger = createLogger()
  const relay = createRelay({ allowedOrigins: ['http://localhost:3000'], trustRailwayProxy: true, logger })
  const stopTelemetry = startTelemetry(relay, logger, 1000)
  relay.http.listen(0, '127.0.0.1', () => process.send({ port: relay.http.address().port }))
  let stopping = false
  async function shutdown() {
    if (stopping) return
    stopping = true; await relay.close(); stopTelemetry()
    if (process.connected) process.disconnect()
  }
  process.once('SIGTERM', shutdown)
  process.once('disconnect', shutdown)
} else {
  const seconds = Number(process.env.STRESS_SECONDS ?? 30)
  assert(Number.isInteger(seconds) && seconds >= 3 && seconds <= 120)
  const runId = randomUUID()
  const directory = resolve(process.env.STRESS_OUTPUT ?? fileURLToPath(new URL(`../../.tmp/multiplayer-stress/${runId}`, import.meta.url)))
  await mkdir(directory, { recursive: true })
  const results = []
  for (const roomCount of [1, 10]) {
    const logPath = join(directory, `server-${roomCount}-rooms.jsonl`)
    const descriptor = openSync(logPath, 'w')
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--server'], {
      env: { ...process.env, LOG_LEVEL: 'info', STRESS_RUN_ID: runId }, stdio: ['ignore', descriptor, descriptor, 'ipc'],
    })
    closeSync(descriptor)
    const exited = once(child, 'exit')
    const cleanups = [], publishers = [], clients = [], rooms = []
    const timeout = setTimeout(() => child.kill('SIGKILL'), (seconds + 90) * 1000)
    let failure, elapsedMs, rtt = createHistogram()
    try {
      const [{ port }] = await Promise.race([once(child, 'message'), exited.then(() => { throw new Error('Server exited before readiness') })])
      const f = await fixture({ after: callback => cleanups.push(callback) }, { url: `ws://127.0.0.1:${port}` })
      for (let index = 0; index < roomCount; index++) {
        const settings = { headers: { 'X-Real-IP': `203.0.113.${index + 1}` } }
        const owner = await f.connect(settings); await owner.create()
        const racers = [owner], members = [owner]
        for (let i = 1; i < 5; i++) { const racer = await f.connect(settings); await racer.join(owner.latest.roomId); racers.push(racer); members.push(racer) }
        for (const racer of racers) await racer.ready()
        rooms.push({ owner, racers, members, settings })
      }
      await sleep(1100)
      for (const room of rooms) await room.owner.request({ type: 'start' }, m => m.type === 'snapshot' && m.phase === 'countdown')
      await waitFor(() => rooms.every(room => room.owner.latest.phase === 'racing'), 'all rooms racing', 10000)
      for (const room of rooms) {
        for (let i = 0; i < 20; i++) {
          const watcher = await f.connect(room.settings); await watcher.join(room.owner.latest.roomId, 'spectator')
          assert.equal(watcher.latest.entrants.length, 5); room.members.push(watcher)
        }
        clients.push(...room.members)
      }
      for (const client of clients) {
        client.batches = 0; client.errors = 0; client.lastBatch = 0; client.gaps = createHistogram()
        client.socket.on('message', raw => {
          const message = JSON.parse(raw)
          if (message.type === 'error') client.errors++
          if (message.type === 'poses') {
            const at = performance.now()
            if (client.lastBatch) client.gaps.record(Math.max(1, Math.round((at - client.lastBatch) * 1e6)))
            client.lastBatch = at; client.batches++
          }
          if (message.type === 'pong') rtt.record(Math.max(1, Math.round((performance.now() - message.clientTime) * 1e6)))
          // Requests are complete; don't retain the load stream in the test client's history.
          client.messages.length = 0
        })
      }
      for (const room of rooms) {
        let sequence = 0
        const raceId = room.owner.latest.raceId
        publishers.push(setInterval(() => { sequence++; for (const racer of room.racers) racer.send({ type: 'pose', raceId, pose: pose(sequence) }) }, 50))
      }
      publishers.push(setInterval(() => rooms.forEach(room => room.owner.send({ type: 'ping', clientTime: performance.now() })), 1000))
      const started = performance.now(); await sleep(seconds * 1000); elapsedMs = performance.now() - started
      assert(clients.every(client => client.batches >= seconds * 18), 'every client receives >=18 batches/sec')
      assert(clients.every(client => client.socket.readyState === 1 && client.errors === 0 && client.invalid.length === 0), 'all clients healthy')
      assert(rtt.count > 0 && rtt.percentile(99) / 1e6 < 100, 'local ping p99 <100ms')
    } catch (error) { failure = error }
    finally {
      publishers.forEach(clearInterval)
      for (const cleanup of cleanups) await cleanup()
      child.kill('SIGTERM')
      const [code] = await exited; clearTimeout(timeout)
      if (code !== 0) failure ??= new Error(`Server exited ${code}`)
    }
    const events = (await readFile(logPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const metrics = events.filter(event => event.event === 'multiplayer_metrics')
    const last = metrics.at(-1)
    try {
      assert(last && metrics.some(event => event.timings.commandDuration.count > 0 && event.timings.tickDuration.count > 0), 'server timings captured')
      assert(events.some(event => event.event === 'ws.command.completed' && event.traceId), 'correlated command traces captured')
      assert.equal(last.skippedBatches, 0); assert.equal(last.congestedDisconnects, 0)
      assert.equal(last.rooms, 0); assert.equal(last.connections, 0)
      assert(last.acceptedPoses >= roomCount * 5 * seconds * 18, 'server accepted expected publishing rate')
      assert(metrics.every(event => Number.isFinite(event.eventLoopP99Ms) && event.eventLoopP99Ms < 100))
      for (const room of rooms) assert(!events.some(event => JSON.stringify(event).includes(room.owner.latest.roomId)), 'no invite IDs in logs')
    } catch (error) { failure ??= error }
    const result = { roomCount, clients: clients.length, seconds, elapsedMs, passed: !failure,
      error: failure?.message, minBatches: Math.min(...clients.map(client => client.batches)),
      clientPingP99Ms: rtt.count ? rtt.percentile(99) / 1e6 : null,
      clientBatchGapP99Ms: Math.max(...clients.map(client => (client.gaps?.percentile(99) ?? 0) / 1e6)),
      maxCommandP99Ms: Math.max(...metrics.map(event => event.timings.commandDuration.p99Ms)),
      maxTickP99Ms: Math.max(...metrics.map(event => event.timings.tickDuration.p99Ms)),
      maxEventLoopP99Ms: Math.max(...metrics.map(event => event.eventLoopP99Ms)),
      maxRssBytes: Math.max(...metrics.map(event => event.rssBytes)),
      maxCpuPercent: Math.max(...metrics.map(event => event.cpuPercent)),
      acceptedPoses: last?.acceptedPoses, outboundBytes: last?.outboundBytes, logPath }
    results.push(result)
    await writeFile(join(directory, 'results.json'), JSON.stringify({ runId, methodology: 'Separate local Node server process; real sockets; synthetic per-room source IPs over loopback; not Railway/WAN/GPU evidence.', results }, null, 2) + '\n')
    console.log(JSON.stringify(result))
    if (failure) throw failure
  }
  console.log(`Saved stress evidence: ${directory}`)
}
