import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import { loadTypeScript } from './loadTypeScript.mjs'
import { bakeNormalCell } from '../scripts/bakeStoneNormals.mjs'

const tiles = loadTypeScript('utils/tiles.ts')
const { createTileSlabGeometry, TILE_SLAB_DEPTH, TILE_SLAB_RADIUS } = loadTypeScript('utils/platform/tileSlabGeometry.ts', { '../tiles': tiles })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`)

test('slab preserves the collider top and pivot, closes joints and contains all vertices', () => {
  const geometry = createTileSlabGeometry()
  const position = geometry.getAttribute('position'), surface = geometry.getAttribute('slabSurface'), normal = geometry.getAttribute('normal')
  near(geometry.boundingBox.max.y, tiles.TILE_THICKNESS / 2)
  near(geometry.boundingBox.min.y, tiles.TILE_THICKNESS / 2 - TILE_SLAB_DEPTH)
  near(geometry.boundingBox.max.x, 0.5)
  let ivoryMax = 0, topMax = 0, recessFound = false
  for (let i = 0; i < position.count; i++) {
    const point = new Vector3().fromBufferAttribute(position, i)
    assert.ok(geometry.boundingSphere.containsPoint(point))
    assert.ok(point.length() <= TILE_SLAB_RADIUS + 1e-6)
    near(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)), 1)
    if (surface.getX(i) > 0) ivoryMax = Math.max(ivoryMax, Math.abs(point.x))
    if (surface.getX(i) === 2) { topMax = Math.max(topMax, Math.abs(point.x)); near(normal.getY(i), 1) }
    if (surface.getX(i) === 0 && normal.getY(i) > 0.99) {
      near(point.y, tiles.TILE_THICKNESS / 2 - 0.025)
      recessFound = true
    }
  }
  near(1 - ivoryMax * 2, 0.02)
  near(ivoryMax - topMax, 0.008)
  assert.ok(recessFound)
  assert.equal(position.count / 3, 36)
  geometry.dispose()
})

test('normal baker preserves flat surfaces and the PNG-to-UV slope orientation', () => {
  const flat = bakeNormalCell(Buffer.alloc(9, 128), 3, 0.01)
  assert.deepEqual([...flat.subarray(12, 15)], [128, 128, 255])
  const ramp = Buffer.from([0, 64, 128, 64, 128, 192, 128, 192, 255])
  const result = bakeNormalCell(ramp, 3, 0.01)
  assert.ok(result[12] < 128) // rising +U tilts toward -U
  assert.ok(result[13] > 128) // rising PNG row tilts toward +V
  assert.deepEqual(result, bakeNormalCell(ramp, 3, 0.01))
})
