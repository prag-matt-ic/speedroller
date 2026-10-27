import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const { FLAT_SURFACE, CYLINDER_SURFACE } = loadTypeScript('utils/platform/courseSurface.ts')
const { createTileBatches } = loadTypeScript('utils/platform/terrainBatches.ts')
const { colToX, rowToWorldZ, TILE_SURFACE_Y, TRAIL_MAX_PLAYER_HEIGHT } = loadTypeScript('utils/tiles.ts')

function setup(surface) {
  let frame
  const playerPosition = { current: [0, 0, 0] }
  const { createTileTrail, useTileTrail: mountTileTrail } = loadTypeScript('components/platform/tiles/useTileTrail.ts', {
    react: { useRef: current => ({ current }) },
    '@/hooks/useCourseSurface': { useCourseSurface: () => surface },
    '@/hooks/usePlayerCoursePosition': { usePlayerCoursePosition: () => ({ playerPosition }) },
    '@/hooks/useGameFrame': { useGameFrame: callback => { frame = callback } },
  })
  const rows = Array.from({ length: 18 }, () => ({
    isRaised: Array(surface.columns).fill(1), stage: 3, isSectionStart: false, isSectionEnd: false,
  }))
  rows[0].isRaised[1] = 0
  const trail = createTileTrail(createTileBatches(rows))
  mountTileTrail(trail, rows.length)
  return {
    trail,
    move(row, column, time, height = 0.5) {
      playerPosition.current[0] = colToX(column, surface.columns)
      playerPosition.current[1] = TILE_SURFACE_Y + height
      playerPosition.current[2] = rowToWorldZ(row)
      frame({ elapsed: time })
    },
    timestamp(row, column) {
      const entry = trail.byStartRow.get(Math.floor(row / 16) * 16)
      const index = entry.batch.cellToInstance[(row - entry.batch.startRow) * surface.columns + column]
      return entry.timestamps[index]
    },
  }
}

for (const surface of [FLAT_SURFACE, CYLINDER_SURFACE]) {
  test(`${surface.topology}: hold, leave, return and land trigger only on entry`, () => {
    const effect = setup(surface)
    effect.move(2, 2, 1)
    const versions = effect.trail.entries.map(entry => entry.attribute.version)
    effect.move(2, 2, 2)
    assert.equal(effect.timestamp(2, 2), 1)
    assert.deepEqual(effect.trail.entries.map(entry => entry.attribute.version), versions)
    effect.move(2, 3, 3)
    assert.equal(effect.timestamp(2, 3), 3)
    effect.move(2, 2, 4)
    assert.equal(effect.timestamp(2, 2), 4)
    for (const height of [TRAIL_MAX_PLAYER_HEIGHT + 1, -1]) {
      effect.move(2, 2, 5, height)
      assert.equal(effect.timestamp(2, 2), 4)
      effect.move(2, 2, 6)
      assert.equal(effect.timestamp(2, 2), 6)
      effect.move(2, 3, 7)
      effect.move(2, 2, 4)
    }
  })

  test(`${surface.topology}: batch boundary contacts and missing tiles`, () => {
    const effect = setup(surface)
    effect.move(15.5, 2, 1)
    assert.equal(effect.timestamp(15, 2), 1)
    assert.equal(effect.timestamp(16, 2), 1)
    effect.move(16, 2, 2)
    assert.equal(effect.timestamp(16, 2), 1)
    effect.move(15.5, 2, 3)
    assert.equal(effect.timestamp(15, 2), 3)
    assert.equal(effect.timestamp(16, 2), 1)
    effect.move(0, 0, 4)
    effect.move(0, 1, 5)
    assert.equal(effect.timestamp(0, 1), undefined)
    effect.move(0, 0, 6)
    assert.equal(effect.timestamp(0, 0), 6)
  })
}

test('cylinder seam keeps existing contact and rearms after leaving', () => {
  const effect = setup(CYLINDER_SURFACE)
  effect.move(2, -0.5, 1)
  assert.equal(effect.timestamp(2, 0), 1)
  assert.equal(effect.timestamp(2, 131), 1)
  effect.move(2, 131.5, 2)
  assert.equal(effect.timestamp(2, 0), 1)
  assert.equal(effect.timestamp(2, 131), 1)
  effect.move(2, 2, 3)
  effect.move(2, -0.5, 4)
  assert.equal(effect.timestamp(2, 0), 4)
  assert.equal(effect.timestamp(2, 131), 4)
})
