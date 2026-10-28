import type { Snapshot } from '../../shared/multiplayer/protocol.mts'

type Entrant = Snapshot['entrants'][number]
export type Standing = { entrant: Entrant; position: number | null; progress: number }

export function raceStandings(
  snapshot: Snapshot,
  startZ: number,
  finishZ: number,
  latestZ: (id: string) => number | undefined,
): Standing[] {
  const rows = snapshot.entrants.map(entrant => {
    const z = latestZ(entrant.id) ?? entrant.pose.position[2]
    const progress = finishZ === startZ ? 0 : Math.max(0, Math.min(1, (z - startZ) / (finishZ - startZ)))
    return { entrant, position: null as number | null, progress }
  })
  const statusOrder = { finished: 0, racing: 1, dnf: 2 }
  rows.sort((a, b) => statusOrder[a.entrant.status] - statusOrder[b.entrant.status] ||
    (a.entrant.status === 'finished' ? (a.entrant.place ?? Infinity) - (b.entrant.place ?? Infinity) :
      a.entrant.status === 'racing' ? b.progress - a.progress : 0) || a.entrant.slot - b.entrant.slot)
  return rows.map((row, index) => ({ ...row,
    position: row.entrant.status === 'dnf' ? null : row.entrant.status === 'finished' ? row.entrant.place : index + 1,
  }))
}
