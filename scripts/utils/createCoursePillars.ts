import type { PillarPlacement } from '../../utils/platform/architecture'
import { COLUMNS, TILE_SIZE, rowToWorldZ, type RowData } from '../../utils/tiles'
import { ARCHITECTURE_START, ARCHITECTURE_HEIGHT } from './parseArchitecture'

export const PILLAR_SPACING = 24
export const FIRST_PILLAR_DISTANCE = 16
export const PILLAR_TRACK_CLEARANCE = 8

export function createCoursePillars(recovery: readonly PillarPlacement[], rows: readonly RowData[]): PillarPlacement[] {
  const startRow = rows.findIndex((row) => row.startLinePosition !== undefined)
  const finishRow = rows.findIndex((row) => row.finishLinePosition !== undefined)
  if (startRow < 0 || finishRow <= startRow || recovery.length === 0) {
    throw new Error('Course pillars require start/finish markers and recovery templates')
  }
  const placements = [...recovery]
  let index = 0
  for (let distance = FIRST_PILLAR_DISTANCE; distance < (finishRow - startRow) * TILE_SIZE; distance += PILLAR_SPACING) {
    const template = recovery[index % recovery.length]
    const [width, , depth] = template.dimensions
    if (distance + depth / 2 >= ARCHITECTURE_START && distance - depth / 2 <= ARCHITECTURE_START + ARCHITECTURE_HEIGHT) continue
    const side = index % 2 === 0 ? -1 : 1
    placements.push({
      ...template,
      id: `course-pillar-${distance}`,
      position: [side * (COLUMNS * TILE_SIZE / 2 + PILLAR_TRACK_CLEARANCE + width / 2), template.position[1], rowToWorldZ(startRow + distance / TILE_SIZE)],
      distance,
    })
    index++
  }
  return placements.sort((a, b) => a.distance - b.distance || a.position[0] - b.position[0])
}
