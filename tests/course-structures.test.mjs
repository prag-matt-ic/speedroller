import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const { createCourseStructures, structureBlockIsClear, mixCoursePillars } = loadTypeScript('scripts/utils/createCourseStructures.ts')
const { blockWorldPosition } = loadTypeScript('utils/platform/blockWorldPosition.ts')
const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts')
const { rows, surface } = PLATFORM_DATA.modes.speedrun
const { colToX, rowToWorldZ, TILE_SURFACE_Y } = loadTypeScript('utils/tiles.ts')
const { surfaceRadius } = loadTypeScript('utils/platform/courseSurface.ts')

test('generated scenery mixes all four assemblies with pillars, deterministically and clear of the route', () => {
  const before = JSON.stringify(rows)
  const blocks = createCourseStructures(rows, surface)
  assert.deepEqual(blocks, createCourseStructures(rows, surface))
  assert.deepEqual(blocks, JSON.parse(readFileSync('resources/courseStructures.json', 'utf8')))
  assert.equal(JSON.stringify(rows), before)
  assert.equal(new Set(blocks.map(block => block.id)).size, blocks.length)
  for (const kind of ['gate', 'cantilever', 'tower', 'wall']) assert.ok(blocks.some(block => block.id.includes(`-${kind}-`)), kind)
  for (const block of blocks) assert.ok(structureBlockIsClear(block, rows, surface), block.id)
  const pillars = JSON.parse(readFileSync('resources/coursePillars.json', 'utf8'))
  assert.ok(pillars.length > 100)
  assert.deepEqual(mixCoursePillars(pillars, blocks), pillars)
  assert.throws(() => createCourseStructures([], surface), /markers/)
})

test('clearance rejects floor and low overhead intersections, including the cylinder seam', () => {
  const fixture = Array.from({ length: 40 }, () => ({ isRaised: Array(surface.columns).fill(0) }))
  fixture[20].isRaised[0] = 1
  const block = { id: 'test', module: 'pillar', position: [colToX(0, surface.columns), TILE_SURFACE_Y, rowToWorldZ(20)], dimensions: [4, 3, 4], distance: 0 }
  assert.equal(structureBlockIsClear(block, fixture, surface), false)
  block.position[1] = TILE_SURFACE_Y + 7
  assert.equal(structureBlockIsClear(block, fixture, surface), false)
  block.position[1] = TILE_SURFACE_Y + 10
  assert.equal(structureBlockIsClear(block, fixture, surface), true)
  block.position = [colToX(surface.columns - 1, surface.columns), TILE_SURFACE_Y, rowToWorldZ(20)]
  assert.equal(structureBlockIsClear(block, fixture, surface), false)
  block.position[2] -= 20
  assert.equal(structureBlockIsClear(block, fixture, surface), true)
})

test('assembled blocks retain their shared tangent frame and touching lintel faces around the cylinder', () => {
  const blocks = createCourseStructures(rows, surface)
  const gates = Object.groupBy(blocks.filter(block => block.id.includes('-gate-lintel-')), block => block.distance)
  for (const segments of Object.values(gates)) {
    for (let index = 1; index < segments.length; index++) {
      const previous = segments[index - 1]
      const current = segments[index]
      const a = blockWorldPosition(previous, surface, { x: 0, y: 0, z: 0 })
      const b = blockWorldPosition(current, surface, { x: 0, y: 0, z: 0 })
      const angle = current.frameX / surfaceRadius(surface)
      const separation = (previous.dimensions[0] + current.dimensions[0]) / 2
      assert.ok(Math.abs(b.x - a.x - Math.cos(angle) * separation) < 1e-6)
      assert.ok(Math.abs(b.y - a.y - Math.sin(angle) * separation) < 1e-6)
    }
  }
})

test('every structure support continues into the fog without moving its upper blocks', () => {
  const blocks = createCourseStructures(rows, surface)
  const foundations = blocks.filter(block => block.id.includes('-foundation-'))
  assert.ok(foundations.length > 0)
  const stacks = Object.groupBy(foundations, block => block.id.split('-foundation-')[0])
  for (const [supportId, stack] of Object.entries(stacks)) {
    const support = blocks.find(block => block.id === supportId)
    assert.ok(support)
    assert.equal(stack[0].position[1], TILE_SURFACE_Y - 28)
    for (let index = 0; index < stack.length; index++) {
      const block = stack[index]
      const next = stack[index + 1] ?? support
      assert.ok(Math.abs(block.position[1] + block.dimensions[1] - next.position[1]) < 1e-6)
      assert.equal(block.position[0], support.position[0])
      assert.equal(block.frameX, support.frameX)
    }
  }
  for (const kind of ['gate', 'cantilever', 'tower', 'wall']) {
    assert.ok(foundations.some(block => block.id.includes(`-${kind}-`)), kind)
  }
})
