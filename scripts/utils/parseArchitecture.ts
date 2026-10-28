import type { PillarPlacement } from '../../utils/platform/architecture'
import { colToX, rowToWorldZ, TILE_SIZE, TILE_SURFACE_Y, type RowData } from '../../utils/tiles'

export const ARCHITECTURE_WIDTH = 161
export const ARCHITECTURE_HEIGHT = 160
export const ARCHITECTURE_START = 600
export const ARCHITECTURE_BASE_Y = -32
const HEIGHTS: Record<string, number> = { '255,0,0': 12, '0,255,0': 24, '0,0,255': 40 }

export function parseArchitecture(data: Uint8Array, width: number, height: number): PillarPlacement[] {
  if (width !== ARCHITECTURE_WIDTH || height !== ARCHITECTURE_HEIGHT || data.length !== width * height * 3) {
    throw new Error('Architecture must be an exact 161×160 RGB bitmap; resizing is forbidden')
  }
  const colours = Array.from({ length: width * height }, (_, index) => {
    const colour = `${data[index * 3]},${data[index * 3 + 1]},${data[index * 3 + 2]}`
    if (colour !== '0,0,0' && !HEIGHTS[colour]) throw new Error(`Unknown architecture colour ${colour} at pixel ${index}`)
    return colour
  })
  const visited = new Set<number>()
  const placements: PillarPlacement[] = []
  for (let origin = 0; origin < colours.length; origin++) {
    if (visited.has(origin) || colours[origin] === '0,0,0') continue
    const colour = colours[origin]
    const queue = [origin]
    visited.add(origin)
    let left = width, right = 0, top = height, bottom = 0
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], x = index % width, y = Math.floor(index / width)
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const next = ny * width + nx
        if (colours[next] === '0,0,0') continue
        if (colours[next] !== colour) throw new Error('Pillar footprints must have an empty pixel between them')
        if (!visited.has(next)) { visited.add(next); queue.push(next) }
      }
    }
    if (queue.length !== (right - left + 1) * (bottom - top + 1)) throw new Error('Pillar footprint must be a solid rectangle, separated from other footprints')
    // Scenery pixels denote areas [x,x+1] × [s,s+1], not terrain tile centres.
    const x = -80 + (left + right + 1) / 2
    const distance = ARCHITECTURE_START + height - (top + bottom + 1) / 2
    placements.push({
      id: `recovery-pillar-${left}-${top}`, module: 'pillar',
      position: [x, ARCHITECTURE_BASE_Y, rowToWorldZ(distance + 32)],
      dimensions: [right - left + 1, TILE_SURFACE_Y + HEIGHTS[colour] - ARCHITECTURE_BASE_Y, bottom - top + 1],
      distance,
    })
  }
  return placements.sort((a, b) => a.distance - b.distance || a.position[0] - b.position[0])
}

export function validateArchitectureClearance(placements: PillarPlacement[], rows: readonly RowData[]) {
  for (const pillar of placements) {
    const [x, , z] = pillar.position
    const [width, , depth] = pillar.dimensions
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      if (Math.abs(rowToWorldZ(rowIndex) - z) >= (depth + TILE_SIZE) / 2) continue
      rows[rowIndex].isRaised.forEach((raised, column) => {
        if (raised && Math.abs(colToX(column) - x) - (width + TILE_SIZE) / 2 < 8) {
          throw new Error(`${pillar.id} is less than eight units from floor at row ${rowIndex}, column ${column}`)
        }
      })
    }
  }
}
