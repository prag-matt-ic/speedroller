import { randomUUID } from 'node:crypto'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import pino from 'pino'
import type { Logger, DestinationStream } from 'pino'
import type { createRelay } from './relay.mts'

export function createLogger(destination?: DestinationStream) {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: label => ({ level: label }) },
    base: { service: 'speedroller-multiplayer', instanceId: randomUUID(), runId: process.env.STRESS_RUN_ID },
    serializers: { err: pino.stdSerializers.err },
    redact: { paths: ['roomId', 'profile', 'pose', 'ip', 'headers'], remove: true },
  }, destination)
}

export function startTelemetry(relay: ReturnType<typeof createRelay>, logger: Logger, intervalMs = 10000) {
  const delay = monitorEventLoopDelay({ resolution: 10 }); delay.enable()
  let previousCpu = process.cpuUsage(), previousAt = performance.now()
  let previousPoses = 0, previousBytes = 0, previousBroadcasts = 0
  function report() {
    const at = performance.now(), seconds = (at - previousAt) / 1000
    const cpu = process.cpuUsage(), metrics = relay.getMetrics()
    const timings: Record<string, unknown> = {}
    for (const [name, histogram] of Object.entries(relay.timings)) {
      timings[name] = { count: histogram.count, p50Ms: histogram.count ? histogram.percentile(50) / 1e6 : 0,
        p95Ms: histogram.count ? histogram.percentile(95) / 1e6 : 0,
        p99Ms: histogram.count ? histogram.percentile(99) / 1e6 : 0, maxMs: histogram.count ? histogram.max / 1e6 : 0 }
      histogram.reset()
    }
    logger.info({ event: 'multiplayer_metrics', ...metrics, timings,
      eventLoopP99Ms: delay.count ? delay.percentile(99) / 1e6 : 0,
      eventLoopMaxMs: delay.count ? delay.max / 1e6 : 0,
      posesPerSecond: (metrics.acceptedPoses - previousPoses) / seconds,
      outboundBytesPerSecond: (metrics.outboundBytes - previousBytes) / seconds,
      broadcastsPerSecond: (metrics.broadcasts - previousBroadcasts) / seconds,
      cpuPercent: ((cpu.user - previousCpu.user) + (cpu.system - previousCpu.system)) / (seconds * 10000),
      rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed })
    previousCpu = cpu; previousAt = at; previousPoses = metrics.acceptedPoses
    previousBytes = metrics.outboundBytes; previousBroadcasts = metrics.broadcasts; delay.reset()
  }
  const timer = setInterval(report, intervalMs); timer.unref()
  return () => { clearInterval(timer); report(); delay.disable() }
}
