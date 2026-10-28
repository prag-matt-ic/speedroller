import { createRelay } from './relay.mts'
import { createLogger, startTelemetry } from './logging.mts'

const port = Number(process.env.PORT ?? 8080)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535')
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',').map(value => value.trim())
for (const origin of allowedOrigins) {
  const url = new URL(origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins')
}
if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS) throw new Error('Set ALLOWED_ORIGINS explicitly in production')
const trustRailwayProxy = process.env.TRUST_RAILWAY_PROXY === 'true'
if (trustRailwayProxy && !process.env.RAILWAY_ENVIRONMENT_ID) throw new Error('Proxy trust requires a Railway environment')
const logger = createLogger()
const relay = createRelay({ allowedOrigins, trustRailwayProxy, logger })
const stopTelemetry = startTelemetry(relay, logger)
relay.http.on('error', err => { logger.error({ event: 'server.error', err }); void relay.close().then(() => { stopTelemetry(); process.exitCode = 1 }) })
relay.http.listen(port, '0.0.0.0', () => logger.info({ event: 'server.listening', port }))
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  logger.info({ event: 'multiplayer_shutdown', signal })
  void relay.close().then(stopTelemetry)
})
