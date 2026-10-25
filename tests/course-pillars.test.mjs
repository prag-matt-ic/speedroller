import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const { createCylinderPillars, cylinderPillarIsClear } = loadTypeScript('scripts/utils/createCylinderPillars.ts')
const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts')
const { rows, surface } = PLATFORM_DATA.modes.speedrun
const { colToX, rowToWorldZ, TILE_SURFACE_Y } = loadTypeScript('utils/tiles.ts')

test('cylinder pillars are deterministic and their entire projected volume clears all floor', () => {
  const actual = createCylinderPillars(rows, surface)
  assert.deepEqual(actual, JSON.parse(readFileSync('resources/coursePillars.json', 'utf8')))
  assert.deepEqual(actual, createCylinderPillars(rows, surface))
  assert.ok(actual.length > 100)
  assert.equal(new Set(actual.map(pillar => pillar.id)).size, actual.length)
  for (const pillar of actual) {
    assert.ok(cylinderPillarIsClear(pillar, rows, surface), pillar.id)
    assert.equal(pillar.position[1], TILE_SURFACE_Y - 28)
    assert.ok(pillar.dimensions[1] <= 40)
  }
  assert.throws(() => createCylinderPillars([], surface), /markers/)
})

test('pillar clearance wraps the seam and excludes small voids inside the course', () => {
  const fixture = Array.from({ length: 40 }, () => ({ isRaised: Array(132).fill(0) }))
  const pillar = { position: [colToX(0, 132), TILE_SURFACE_Y - 28, rowToWorldZ(20)], dimensions: [6, 40, 8] }
  assert.ok(cylinderPillarIsClear(pillar, fixture, surface))
  fixture[20].isRaised[131] = 1
  assert.equal(cylinderPillarIsClear(pillar, fixture, surface), false)
  fixture[20].isRaised[131] = 0
  // The tall pillar's tip projects wider than its base; include that entire footprint.
  fixture[20].isRaised[9] = 1
  assert.equal(cylinderPillarIsClear(pillar, fixture, surface), false)
  fixture[20].isRaised[9] = 0
  fixture[20].isRaised[20] = 1
  assert.ok(cylinderPillarIsClear(pillar, fixture, surface))
})
