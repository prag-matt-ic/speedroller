/**
 * Deterministic, instance-local randomness for cosmetic particles only, never game outcomes.
 *
 * Copied from the rugbet podium particles so each mounted fireworks field seeds an independent
 * sequence, even when React replays a Strict Mode mount.
 */
export const createParticleRandom = (seed: string): (() => number) => {
  // FNV-1a accepts arbitrary strings, including React useId() values.
  let state = 0x811c9dc5
  for (let index = 0; index < seed.length; index++) {
    state = Math.imul(state ^ seed.charCodeAt(index), 0x01000193)
  }

  return () => {
    // Mulberry32 keeps each allocation's sequence independent of every other allocation.
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}
