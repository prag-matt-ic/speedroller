import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Quaternion, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { loadTypeScript } from './loadTypeScript.mjs'

const { createPillarBlocks } = loadTypeScript('utils/platform/pillarBlocks.ts')
const { courseToWorld, surfaceRotation, CYLINDER_SURFACE, FLAT_SURFACE } = loadTypeScript('utils/platform/courseSurface.ts')
const placements = JSON.parse(readFileSync('resources/coursePillars.json', 'utf8'))
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`)

test('blocks deterministically fill each original pillar, including short and fractional heights', () => {
  const pillars = [...placements, ...[3, 8, 17.5].map(height => ({
    id: `fixture-${height}`, module: 'pillar', position: [2, -4, 10], dimensions: [2, height, 3], distance: 0,
  }))]
  const before = structuredClone(pillars)
  const blocks = createPillarBlocks(pillars)
  assert.deepEqual(blocks, createPillarBlocks(pillars))
  assert.deepEqual(pillars, before)
  assert.equal(new Set(blocks.map(block => block.id)).size, blocks.length)
  assert.deepEqual(createPillarBlocks([]), [])
  for (const pillar of pillars) {
    const stack = createPillarBlocks([pillar])
    assert.equal(stack.length, Math.max(1, Math.round(pillar.dimensions[1] / 8)))
    close(stack[0].position[1], pillar.position[1])
    close(stack.at(-1).position[1] + stack.at(-1).dimensions[1], pillar.position[1] + pillar.dimensions[1])
    for (const [index, block] of stack.entries()) {
      assert.equal(block.position[0], pillar.position[0])
      assert.equal(block.position[2], pillar.position[2])
      assert.equal(block.dimensions[0], pillar.dimensions[0])
      assert.equal(block.dimensions[2], pillar.dimensions[2])
      assert.equal(block.distance, pillar.distance)
      assert.equal(block.dimensions[1], stack[0].dimensions[1])
      if (index === 0) continue
      const previous = stack[index - 1]
      close(previous.position[1] + previous.dimensions[1], block.position[1])
      for (const surface of [FLAT_SURFACE, CYLINDER_SURFACE]) {
        const rotation = new Quaternion()
        surfaceRotation(block.position[0], surface, rotation)
        const up = new Vector3(0, 1, 0).applyQuaternion(rotation)
        const centre = item => courseToWorld(item.position[0], item.position[1] + item.dimensions[1] / 2, item.position[2], surface, new Vector3())
        const previousTop = centre(previous).addScaledVector(up, previous.dimensions[1] / 2)
        const nextBottom = centre(block).addScaledVector(up, -block.dimensions[1] / 2)
        close(previousTop.distanceTo(nextBottom), 0)
      }
    }
  }
})

test('minimal rounded cuboid keeps full bounds and flat mating faces', () => {
  const geometry = new RoundedBoxGeometry(1, 1, 1, 1, 0.01)
  geometry.computeBoundingBox()
  for (const axis of ['x', 'y', 'z']) {
    close(geometry.boundingBox.min[axis], -0.5)
    close(geometry.boundingBox.max[axis], 0.5)
  }
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  for (const sign of [-1, 1]) {
    let flatVertices = 0
    for (let index = 0; index < position.count; index++) {
      if (Math.abs(position.getY(index) - sign * 0.5) > 1e-6) continue
      close(normal.getY(index), sign)
      assert.ok(Math.abs(position.getX(index)) >= 0.48)
      assert.ok(Math.abs(position.getZ(index)) >= 0.48)
      flatVertices++
    }
    assert.ok(flatVertices >= 6)
  }
  geometry.dispose()
})
