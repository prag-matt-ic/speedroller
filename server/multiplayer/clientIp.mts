import { isIP } from 'node:net'
import type { IncomingMessage } from 'node:http'

// Enable only behind Railway's HTTP edge, with no public raw TCP ingress.
export function clientIp(request: IncomingMessage, trustRailwayProxy: boolean): string | null {
  const value = trustRailwayProxy ? request.headers['x-real-ip'] : request.socket.remoteAddress
  if (typeof value !== 'string' || !isIP(value)) return null
  return value.startsWith('::ffff:') && isIP(value.slice(7)) === 4 ? value.slice(7) : value
}
