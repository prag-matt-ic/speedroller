import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadTypeScript } from './loadTypeScript.mjs'

const tiles = loadTypeScript('utils/tiles.ts')
const { placeRowElementsOnTiles } = loadTypeScript('utils/platform/placeRowElementsOnTiles.ts')

test('floor anchors follow tile height without changing layout, content, or floating headings', () => {
  const row = {
    isRaised: [1], stage: 1, isSectionStart: true, isSectionEnd: false,
    infoZonePlacements: [[1, -0.455, 2, 3]],
    collectiblePlacements: [[4, -0.455, 5, 6]],
    colourPickerPlacement: [7, -0.455, 8, 9],
    startLinePosition: [10, -0.455, 11],
    finishLinePosition: [12, -0.455, 13],
    confettiPlacements: [{ position: [14, -0.455, 15], width: 5, depth: 1, contentIndex: 2 }],
    floatingHeadingPlacements: [[16, 3, 17, 4]],
  }
  const original = structuredClone(row)
  const placed = placeRowElementsOnTiles(row)
  const y = tiles.ON_TILE_Y
  assert.deepEqual(placed, {
    ...row,
    infoZonePlacements: [[1, y, 2, 3]],
    collectiblePlacements: [[4, y, 5, 6]],
    colourPickerPlacement: [7, y, 8, 9],
    startLinePosition: [10, y, 11],
    finishLinePosition: [12, y, 13],
    confettiPlacements: [{ position: [14, y, 15], width: 5, depth: 1, contentIndex: 2 }],
  })
  assert.deepEqual(row, original)
})

for (const thickness of [tiles.TILE_THICKNESS, 0.8]) {
  test(`generated course floor anchors clear ${thickness}-thick tiles without regenerating data`, () => {
    const surfaceY = tiles.RAISED_Y + thickness / 2
    const onTileY = surfaceY + 0.005
    const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts', {
      '@/utils/tiles': { ...tiles, ON_TILE_Y: onTileY },
    })
    const counts = new Map()
    for (const { rows } of Object.values(PLATFORM_DATA.modes)) {
      for (const row of rows) {
        const placements = {
          infoZones: row.infoZonePlacements ?? [],
          collectibles: row.collectiblePlacements ?? [],
          colourPicker: row.colourPickerPlacement ? [row.colourPickerPlacement] : [],
          start: row.startLinePosition ? [row.startLinePosition] : [],
          finish: row.finishLinePosition ? [row.finishLinePosition] : [],
          confetti: row.confettiPlacements?.map(({ position }) => position) ?? [],
        }
        for (const [kind, positions] of Object.entries(placements)) {
          for (const [, y] of positions) {
            assert.equal(y, onTileY, kind)
            assert.ok(y > surfaceY, kind)
            counts.set(kind, (counts.get(kind) ?? 0) + 1)
          }
        }
      }
    }
    assert.equal(counts.size, 6, 'exercise every floor-mounted element type')
  })
}
