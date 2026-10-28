export type ClockSample = { clientSentAt: number; clientReceivedAt: number; serverTime: number }

// Apply this offset to performance.now(); never compare clocks from separate machines directly.
export function estimateClockOffset(samples: readonly ClockSample[]) {
  if (samples.length < 5) throw new Error('Five clock samples required')
  let best: { roundTripMs: number; offsetMs: number } | undefined
  for (const sample of samples) {
    const { clientSentAt, clientReceivedAt, serverTime } = sample
    if (![clientSentAt, clientReceivedAt, serverTime].every(Number.isFinite) ||
      clientSentAt < 0 || serverTime < 0 || clientReceivedAt < clientSentAt) throw new Error('Invalid clock sample')
    const roundTripMs = clientReceivedAt - clientSentAt
    if (!best || roundTripMs < best.roundTripMs) {
      best = { roundTripMs, offsetMs: serverTime - (clientSentAt + clientReceivedAt) / 2 }
    }
  }
  return best!
}
