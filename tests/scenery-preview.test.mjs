import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Matrix4 } from 'three'
import { loadTypeScript } from './loadTypeScript.mjs'

const { createStoneBlockGeometry } = loadTypeScript('utils/platform/stoneBlockGeometry.ts')
const { createSceneryPreviewBlocks } = loadTypeScript('utils/platform/sceneryPreview.ts')
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6)

test('baked shading is bounded, distinguishes faces and survives instance transforms', () => {
  const geometry = createStoneBlockGeometry()
  const shades = geometry.getAttribute('stoneShade')
  const normals = geometry.getAttribute('normal')
  const faceShades = new Map()
  for (let index = 0; index < shades.count; index++) {
    const shade = shades.getX(index)
    assert.ok(shade >= 0.72 - 1e-6 && shade <= 1)
    for (const [face, value] of [['top', normals.getY(index)], ['bottom', -normals.getY(index)], ['left', -normals.getX(index)], ['right', normals.getX(index)]]) {
      if (value > 0.99999) faceShades.set(face, shade)
    }
  }
  assert.ok(faceShades.get('top') > faceShades.get('left'))
  assert.ok(faceShades.get('left') > faceShades.get('right'))
  assert.ok(faceShades.get('top') > faceShades.get('bottom'))
  const transformed = geometry.clone()
  transformed.applyMatrix4(new Matrix4().makeRotationZ(Math.PI))
  transformed.scale(4, 12, 6)
  transformed.translate(100, 20, -300)
  assert.deepEqual(transformed.getAttribute('stoneShade').array, shades.array)
  transformed.dispose()
  geometry.dispose()
})

test('preview arrangements are deterministic, supported and leave the gate open', () => {
  const blocks = createSceneryPreviewBlocks()
  assert.deepEqual(blocks, createSceneryPreviewBlocks())
  assert.equal(blocks.length, 31)
  assert.equal(new Set(blocks.map(block => block.id)).size, blocks.length)
  for (const block of blocks) {
    assert.ok(block.dimensions.every(value => Number.isFinite(value) && value > 0))
    assert.ok(block.position.every(Number.isFinite))
    // The lintel bridges the opening; its segment continuity is checked below.
    if (block.position[1] === 0 || block.id.startsWith('gate-lintel-')) continue
    assert.ok(blocks.some(support =>
      Math.abs(support.position[1] + support.dimensions[1] - block.position[1]) < 1e-6 &&
      Math.abs(support.position[0] - block.position[0]) < (support.dimensions[0] + block.dimensions[0]) / 2 &&
      Math.abs(support.position[2] - block.position[2]) < (support.dimensions[2] + block.dimensions[2]) / 2))
  }
  const left = blocks.find(block => block.id === 'gate-column--1-0')
  const right = blocks.find(block => block.id === 'gate-column-1-0')
  close(right.position[0] - right.dimensions[0] / 2 - (left.position[0] + left.dimensions[0] / 2), 12)
  const lintel = blocks.filter(block => block.id.startsWith('gate-lintel-'))
  lintel.forEach((block, index) => {
    close(block.position[1], 18)
    if (index) close(block.position[0] - lintel[index - 1].position[0], 4)
  })
  for (let column = 0; column < 4; column++) {
    assert.equal(blocks.filter(block => block.id.startsWith(`wall-${column}-`)).length, column + 1)
  }
})
