import assert from 'node:assert/strict'
import { encodeMovement, PROTOCOL_VERSION } from '../../shared/multiplayer/protocol.mts'
const entrants = Array.from({ length: 5 }, (_, index) => ({
  id: `33333333-3333-4333-8333-33333333333${index}`, profile: { name: `Player0${index}`, colour: '#37d6c7' },
  slot: index + 1, status: 'racing', pose: { sequence: 120, respawn: 2,
    position: [1.234567891 + index, 4.123456789, -234.56789123], rotation: [0, Math.sin(0.123), 0, Math.cos(0.123)] },
  receivedAt: 12345.6789123, elapsedMs: null, place: null,
}))
const envelope = { type: 'poses', roomId: '11111111-1111-4111-8111-111111111111', raceId: '22222222-2222-4222-8222-222222222222', revision: 8, serverTime: 12350.123456 }
const bytes = value => Buffer.byteLength(JSON.stringify(value))
const previousBytes = bytes({ ...envelope, protocolVersion: 1, entrants })
const compactBytes = bytes({ ...envelope, serverTime: Math.round(envelope.serverTime), protocolVersion: PROTOCOL_VERSION, entrants: entrants.map(encodeMovement) })
assert(compactBytes * 30 < previousBytes * 20)
console.log(JSON.stringify({ fixture: 'five moving racers, JSON payload only', previousBytes, compactBytes,
  previousBytesPerSecondAt20Hz: previousBytes * 20, compactBytesPerSecondAt30Hz: compactBytes * 30,
  reductionPercent: 100 * (1 - compactBytes * 30 / (previousBytes * 20)) }))
