import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadTypeScript } from './loadTypeScript.mjs'

const { DEFAULT_MAX_DPR, MAX_DPR, MIN_AUTO_DPR, resolveCanvasDpr, stepMaxDprDown } =
  loadTypeScript('utils/dpr.ts')

function withWindow(windowValue, run) {
  const hadWindow = Object.hasOwn(globalThis, 'window')
  const previousWindow = globalThis.window
  if (windowValue === undefined) delete globalThis.window
  else globalThis.window = windowValue
  try {
    run()
  } finally {
    if (hadWindow) globalThis.window = previousWindow
    else delete globalThis.window
  }
}

test('defaults to the 1.5x cap on a 3x display and never exceeds 2x', () => {
  withWindow({ devicePixelRatio: 3 }, () => {
    assert.equal(DEFAULT_MAX_DPR, 1.5)
    assert.equal(MAX_DPR, 2)
    assert.equal(resolveCanvasDpr(DEFAULT_MAX_DPR), 1.5)
    assert.equal(resolveCanvasDpr(MAX_DPR), 2)
    assert.equal(resolveCanvasDpr(4), 2)
  })
})

test('treats the cap as a ceiling rather than a forced ratio', () => {
  withWindow({ devicePixelRatio: 1 }, () => {
    assert.equal(resolveCanvasDpr(DEFAULT_MAX_DPR), 1)
    assert.equal(resolveCanvasDpr(MAX_DPR), 1)
  })

  withWindow({ devicePixelRatio: 1.25 }, () => {
    assert.equal(resolveCanvasDpr(MAX_DPR), 1.25)
  })
})

test('renders at 1x without a window', () => {
  withWindow(undefined, () => {
    assert.equal(resolveCanvasDpr(DEFAULT_MAX_DPR), 1)
  })
})

test('steps down to the 1x floor in half steps', () => {
  assert.equal(MIN_AUTO_DPR, 1)
  assert.equal(stepMaxDprDown(2), 1.5)
  assert.equal(stepMaxDprDown(1.5), 1)
  assert.equal(stepMaxDprDown(1), 1)
  assert.equal(stepMaxDprDown(0.75), 1)
})
