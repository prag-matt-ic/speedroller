import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const tiles = loadTypeScript('utils/tiles.ts')
const parser = loadTypeScript('scripts/utils/parseArchitecture.ts', { '../../utils/tiles': tiles })
const { createCoursePillars, FIRST_PILLAR_DISTANCE, PILLAR_SPACING } = loadTypeScript('scripts/utils/createCoursePillars.ts', {
  '../../utils/tiles': tiles,
  './parseArchitecture': parser,
})
const recovery = JSON.parse(readFileSync('resources/recoveryPillars.json', 'utf8'))
const rows = loadTypeScript('resources/rowsData.ts').PLATFORM_DATA.modes.speedrun.rows

test('permanent course pillars are deterministic, clear the floor and preserve recovery', () => {
  const actual = createCoursePillars(recovery, rows)
  assert.deepEqual(actual, JSON.parse(readFileSync('resources/coursePillars.json', 'utf8')))
  assert.deepEqual(actual, createCoursePillars(recovery, rows))
  assert.deepEqual(actual.filter(pillar => pillar.id.startsWith('recovery-')), recovery)
  assert.equal(new Set(actual.map(pillar => pillar.id)).size, actual.length)
  parser.validateArchitectureClearance(actual, rows)
  const additions = actual.filter(pillar => pillar.id.startsWith('course-'))
  assert.ok(additions.length > recovery.length * 4)
  assert.equal(additions[0].distance, FIRST_PILLAR_DISTANCE)
  const start = rows.findIndex(row => row.startLinePosition)
  const finish = rows.findIndex(row => row.finishLinePosition)
  additions.forEach((pillar, index) => {
    assert.equal(Math.sign(pillar.position[0]), index % 2 === 0 ? -1 : 1)
    assert.equal((pillar.distance - FIRST_PILLAR_DISTANCE) % PILLAR_SPACING, 0)
    assert.ok(pillar.distance < (finish - start) * tiles.TILE_SIZE)
    assert.equal(pillar.position[2], tiles.rowToWorldZ(start + pillar.distance / tiles.TILE_SIZE))
    const halfDepth = pillar.dimensions[2] / 2
    assert.ok(pillar.distance + halfDepth < parser.ARCHITECTURE_START || pillar.distance - halfDepth > parser.ARCHITECTURE_START + parser.ARCHITECTURE_HEIGHT)
  })
  assert.throws(() => createCoursePillars([], rows), /require/)
  assert.throws(() => createCoursePillars(recovery, []), /require/)
})
