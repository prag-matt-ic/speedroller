import type { PillarPlacement } from './architecture'

export const SCENERY_PREVIEW_LABELS = [
  { name: 'Staggered tower', x: -42 },
  { name: 'Cantilever', x: -16 },
  { name: 'Gate', x: 14 },
  { name: 'Stepped wall', x: 46 },
]

export function createSceneryPreviewBlocks(): PillarPlacement[] {
  const blocks: PillarPlacement[] = []
  const add = (id: string, position: PillarPlacement['position'], dimensions: PillarPlacement['dimensions']) => {
    blocks.push({ id, module: 'pillar', position, dimensions, distance: 0 })
  }
  for (let level = 0; level < 5; level++) {
    add(`tower-${level}`, [-42 + (level % 2 === 0 ? -1 : 1), level * 6, 0], [6, 6, 6])
  }
  for (let level = 0; level < 4; level++) {
    add(`cantilever-column-${level}`, [-16, level * 6, 0], [4, 6, 4])
  }
  add('cantilever-cap', [-13, 24, 0], [12, 3, 4])
  for (const side of [-1, 1]) {
    for (let level = 0; level < 3; level++) {
      add(`gate-column-${side}-${level}`, [14 + side * 8, level * 6, 0], [4, 6, 4])
    }
  }
  for (let segment = 0; segment < 5; segment++) {
    add(`gate-lintel-${segment}`, [6 + segment * 4, 18, 0], [4, 3, 4])
  }
  for (let column = 0; column < 4; column++) {
    for (let level = 0; level <= column; level++) {
      add(`wall-${column}-${level}`, [37 + column * 6, level * 4, 0], [6, 4, 4])
    }
  }
  return blocks
}

export type SceneryKind = 'tower' | 'cantilever' | 'gate' | 'wall'

export function createStructureBlocks(kind: SceneryKind): PillarPlacement[] {
  const centre = { tower: -42, cantilever: -16, gate: 14, wall: 46 }[kind]
  return createSceneryPreviewBlocks().filter(block => block.id.startsWith(`${kind}-`)).map(block => ({
    ...block, position: [block.position[0] - centre, block.position[1], block.position[2]],
  }))
}
