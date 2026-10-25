import type { Snapshot } from '../../shared/multiplayer/protocol.mts'

export function followTarget(snapshot: Snapshot | null, preferred: string | null) {
  const selected = snapshot?.entrants.find(entrant => entrant.id === preferred)
  return (selected?.status === 'racing' ? selected : snapshot?.entrants.find(entrant => entrant.status === 'racing') ?? selected ?? snapshot?.entrants[0])?.id ?? null
}

export function raceProgress(z: number, startZ: number, finishZ: number) {
  if (startZ === finishZ) return 0
  return Math.round(Math.max(0, Math.min(1, (z - startZ) / (finishZ - startZ))) * 100)
}
