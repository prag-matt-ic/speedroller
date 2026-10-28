import type { PillarPlacement } from './architecture'

const TARGET_BLOCK_HEIGHT = 8

export function createPillarBlocks(pillars: readonly PillarPlacement[]): PillarPlacement[] {
  return pillars.flatMap((pillar) => {
    const [x, baseY, z] = pillar.position
    const [width, height, depth] = pillar.dimensions
    const count = Math.max(1, Math.round(height / TARGET_BLOCK_HEIGHT))
    const blockHeight = height / count
    return Array.from({ length: count }, (_, index) => ({
      ...pillar,
      id: `${pillar.id}-block-${index}`,
      position: [x, baseY + index * blockHeight, z],
      dimensions: [width, blockHeight, depth],
    }))
  })
}
