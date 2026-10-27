import type { PillarPlacement } from '../../utils/platform/architecture'
import { blockWorldPosition } from '../../utils/platform/blockWorldPosition'
import { courseToWorld, findSolidColumnArc, surfaceRadius, type CourseSurface } from '../../utils/platform/courseSurface'
import { createStructureBlocks, type SceneryKind } from '../../utils/platform/sceneryPreview'
import { createPillarBlocks } from '../../utils/platform/pillarBlocks'
import { colToX, rowToWorldZ, TILE_SIZE, TILE_SURFACE_Y, type RowData } from '../../utils/tiles'
import { CYLINDER_SCENERY_DEPTH } from './createCylinderPillars'

const STRUCTURE_SPACING = 72
const ROUTE_MARGIN = 4
const HEADROOM = 8
const KINDS: SceneryKind[] = ['gate', 'tower', 'cantilever', 'wall']

/** Separating axes for a block and each tile's protected player corridor in the cylinder cross-section. */
export function structureBlockIsClear(block: PillarPlacement, rows: readonly RowData[], surface: CourseSurface) {
  const centre = blockWorldPosition(block, surface, { x: 0, y: 0, z: 0 })
  const angle = surface.topology === 'cylinder' ? (block.frameX ?? block.position[0]) / surfaceRadius(surface) : 0
  const blockRight = [Math.cos(angle), Math.sin(angle)]
  const blockUp = [-blockRight[1], blockRight[0]]
  const tileCentre = { x: 0, y: 0, z: 0 }
  for (let row = 0; row < rows.length; row++) {
    if (Math.abs(rowToWorldZ(row) - centre.z) > block.dimensions[2] / 2 + TILE_SIZE / 2 + ROUTE_MARGIN) continue
    for (let column = 0; column < surface.columns; column++) {
      if (!rows[row].isRaised[column]) continue
      const x = colToX(column, surface.columns)
      const tileAngle = surface.topology === 'cylinder' ? x / surfaceRadius(surface) : 0
      const right = [Math.cos(tileAngle), Math.sin(tileAngle)]
      const up = [-right[1], right[0]]
      courseToWorld(x, TILE_SURFACE_Y + (HEADROOM - ROUTE_MARGIN) / 2, rowToWorldZ(row), surface, tileCentre)
      const separated = [blockRight, blockUp, right, up].some(axis => {
        const dot = (direction: number[]) => Math.abs(axis[0] * direction[0] + axis[1] * direction[1])
        const blockRadius = dot(blockRight) * block.dimensions[0] / 2 + dot(blockUp) * block.dimensions[1] / 2
        const corridorRadius = dot(right) * (TILE_SIZE / 2 + ROUTE_MARGIN) + dot(up) * (HEADROOM + ROUTE_MARGIN) / 2
        return Math.abs(axis[0] * (centre.x - tileCentre.x) + axis[1] * (centre.y - tileCentre.y)) > blockRadius + corridorRadius
      })
      if (!separated) return false
    }
  }
  return true
}

export function createCourseStructures(rows: readonly RowData[], surface: CourseSurface) {
  const start = rows.findIndex(row => row.startLinePosition)
  const finish = rows.findIndex(row => row.finishLinePosition)
  if (start < 0 || finish <= start) throw new Error('Course structures require start and finish markers')
  const blocks: PillarPlacement[] = []
  for (let row = start + 40, index = 0; row < finish - 16; row += STRUCTURE_SPACING, index++) {
    const columns = rows.slice(row - 6, row + 7).flatMap(item => item.isRaised.flatMap((raised, column) => raised ? [column] : []))
    const arc = findSolidColumnArc(columns, surface.columns, surface.topology)
    if (!arc || arc.width > 32) continue
    const frameX = colToX(arc.start + (arc.width - 1) / 2, surface.columns)
    const kind = KINDS[index % KINDS.length]
    const side = Math.floor(index / KINDS.length) % 2 === 0 ? -1 : 1
    const width = arc.width * TILE_SIZE
    const offset = kind === 'gate' ? 0 : side * (width / 2 + (kind === 'wall' ? 30 : kind === 'tower' ? 25 : 10))
    const scaleX = kind === 'gate' ? Math.max(1, (width + 12) / 12) : kind === 'cantilever' ? 1.5 : 1
    const scaleY = kind === 'cantilever' || kind === 'tower' ? 0.7 : 1
    const base = kind === 'tower' ? -4 : kind === 'cantilever' ? -3 : kind === 'wall' ? -2 : 0
    const candidate = createStructureBlocks(kind).map(block => ({
      ...block,
      id: `structure-${row}-${block.id}`,
      frameX: kind === 'tower' || kind === 'wall' ? frameX + offset : frameX,
      position: [frameX + offset + block.position[0] * scaleX * (kind === 'cantilever' ? -side : 1), TILE_SURFACE_Y + base + block.position[1] * scaleY, rowToWorldZ(row)] as PillarPlacement['position'],
      dimensions: [block.dimensions[0] * scaleX, block.dimensions[1] * scaleY, block.dimensions[2]] as PillarPlacement['dimensions'],
      distance: (row - start) * TILE_SIZE,
    }))
    const foundations = candidate.filter(block => block.position[1] === TILE_SURFACE_Y + base).flatMap(block => createPillarBlocks([{
      ...block,
      id: `${block.id}-foundation`,
      position: [block.position[0], TILE_SURFACE_Y - CYLINDER_SCENERY_DEPTH, block.position[2]],
      dimensions: [block.dimensions[0], CYLINDER_SCENERY_DEPTH + base, block.dimensions[2]],
    }]))
    const assembly = [...foundations, ...candidate]
    if (assembly.every(block => structureBlockIsClear(block, rows, surface))) blocks.push(...assembly)
  }
  return blocks
}

export function mixCoursePillars(pillars: PillarPlacement[], structures: PillarPlacement[]) {
  // Reserve a short scenery band for each assembly so nearby pillars cannot obscure its silhouette.
  return pillars.filter(pillar => !structures.some(block => Math.abs(block.position[2] - pillar.position[2]) < 12))
}
