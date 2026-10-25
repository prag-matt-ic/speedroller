import type { PillarPlacement } from '../../utils/platform/architecture'
import { type CourseSurface, surfaceDeltaX, surfaceRadius } from '../../utils/platform/courseSurface'
import { colToX, rowToWorldZ, TILE_SIZE, TILE_SURFACE_Y, type RowData } from '../../utils/tiles'

export const CYLINDER_PILLAR_CLEARANCE = 4
export const CYLINDER_SCENERY_DEPTH = 28
const ROW_SPACING = 24
const COLUMN_SPACING = 12
const PILLAR_GAP = 4
const HEIGHTS = [28, 36, 40]

export function pillarSurfaceHalfWidth(pillar: PillarPlacement, surface: CourseSurface) {
  const radius = surfaceRadius(surface)
  const topRadius = radius - (pillar.position[1] + pillar.dimensions[1] - TILE_SURFACE_Y)
  return Math.atan2(pillar.dimensions[0] / 2, topRadius) * radius
}

export function cylinderPillarIsClear(pillar: PillarPlacement, rows: readonly RowData[], surface: CourseSurface) {
  const halfWidth = pillarSurfaceHalfWidth(pillar, surface) + TILE_SIZE / 2 + CYLINDER_PILLAR_CLEARANCE
  const halfDepth = pillar.dimensions[2] / 2 + TILE_SIZE / 2 + CYLINDER_PILLAR_CLEARANCE
  for (let row = 0; row < rows.length; row++) {
    if (Math.abs(rowToWorldZ(row) - pillar.position[2]) > halfDepth) continue
    for (let column = 0; column < surface.columns; column++) {
      if (rows[row].isRaised[column] !== 1) continue
      if (Math.abs(surfaceDeltaX(pillar.position[0], colToX(column, surface.columns), surface)) <= halfWidth) return false
    }
  }
  return true
}

export function createCylinderPillars(rows: readonly RowData[], surface: CourseSurface): PillarPlacement[] {
  const placements: PillarPlacement[] = []
  const start = rows.findIndex(row => row.startLinePosition)
  const finish = rows.findIndex(row => row.finishLinePosition)
  if (start < 0 || finish <= start) throw new Error('Cylinder scenery requires start and finish markers')
  for (let row = start + 16; row < finish; row += ROW_SPACING) {
    for (let column = 0; column < surface.columns; column += COLUMN_SPACING) {
      const seed = (row * 31 + column * 17) >>> 0
      const pillar: PillarPlacement = {
        id: `cylinder-pillar-${row}-${column}`, module: 'pillar',
        position: [colToX(column, surface.columns), TILE_SURFACE_Y - CYLINDER_SCENERY_DEPTH, rowToWorldZ(row)],
        dimensions: [2 + seed % 5, HEIGHTS[seed % HEIGHTS.length], 4 + seed % 5],
        distance: (row - start) * TILE_SIZE,
      }
      if (!cylinderPillarIsClear(pillar, rows, surface)) continue
      const overlaps = placements.some(other =>
        Math.abs(other.position[2] - pillar.position[2]) < (other.dimensions[2] + pillar.dimensions[2]) / 2 + PILLAR_GAP &&
        Math.abs(surfaceDeltaX(other.position[0], pillar.position[0], surface)) <
          pillarSurfaceHalfWidth(other, surface) + pillarSurfaceHalfWidth(pillar, surface) + PILLAR_GAP,
      )
      if (!overlaps) placements.push(pillar)
    }
  }
  return placements
}
