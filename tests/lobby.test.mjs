import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const document = JSON.parse(readFileSync('assets/platform/1.4.0/race.course.json', 'utf8'))
const { validateCourse, courseRows } = loadTypeScript('utils/editor/courseDocument.ts')
const { LOBBY_PODIUM, LOBBY_FEATURE_FOOTPRINTS, LOBBY_LOOP_START_ROW, LOBBY_LOOP_END_ROW } = loadTypeScript('utils/platform/lobbyLayout.ts')

test('lobby loop is solid across the seam and every fixed feature has support', () => {
  assert.deepEqual(validateCourse(document), [])
  const rows = courseRows(document)
  for (let row = LOBBY_LOOP_START_ROW; row <= LOBBY_LOOP_END_ROW; row++) {
    assert.deepEqual(rows[row].floor, Array.from({ length: 132 }, (_, column) => column))
    assert.deepEqual(rows[row].ghosts, [])
    assert.ok(rows[row].objects.every(object => object.type === 'paintShop'))
  }
  for (const feature of LOBBY_FEATURE_FOOTPRINTS) {
    const broken = structuredClone(document)
    broken.sections[0].rows[feature.row].ghosts.push(feature.column)
    assert.ok(validateCourse(broken).some(issue => issue.message === 'Keep the lobby feature footprint supported'))
  }
  for (const row of [0, 22]) assert.ok(rows[row].floor.includes(66))
  assert.deepEqual(rows[12].objects, [{ column: 66, type: 'paintShop' }])
})

test('race approach and all timed-course layers remain byte-equivalent as data', () => {
  const unchangedRows = courseRows(document).slice(24)
  assert.equal(createHash('sha256').update(JSON.stringify(unchangedRows)).digest('hex'), '3e69d722fba72dc4dcf3c1d1793e2e8d13535cb902252921bb98dd7b773cc8c2')
})


test('podium stands outside the floor at the far left of the plaza', () => {
  const rows = courseRows(document)
  for (let row = LOBBY_PODIUM.row - 2; row <= LOBBY_PODIUM.row + 2; row++) {
    for (let column = LOBBY_PODIUM.column - 4; column <= LOBBY_PODIUM.column + 4; column++) {
      assert.equal(rows[row].floor.includes(column), false)
    }
  }
})
