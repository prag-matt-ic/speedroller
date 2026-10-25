import { createRelay } from './relay.mts'

const port = Number(process.env.PORT ?? 8080)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535')
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(',').map(value => value.trim())
for (const origin of allowedOrigins) {
  const url = new URL(origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins')
}
const relay = createRelay({ allowedOrigins })
relay.http.on('error', error => { console.error(error.message); void relay.close().then(() => { process.exitCode = 1 }) })
relay.http.listen(port, '0.0.0.0', () => process.stdout.write(`Multiplayer service listening on ${port}\n`))
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void relay.close() })
