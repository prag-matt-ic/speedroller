import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const { createGalaxyStars } = loadTypeScript('components/player/marble/galaxySettings.ts')
test('galaxy stars are deterministic, seed-dependent, and contained inside the glass', () => {
  const stars = createGalaxyStars()
  assert.equal(stars.length, 24)
  assert.deepEqual(stars, createGalaxyStars())
  assert.notDeepEqual(stars, createGalaxyStars(130))
  for (const { x, y, z } of stars) {
    assert.ok(Number.isFinite(x + y + z))
    assert.ok(Math.hypot(x, y, z) <= 0.85)
  }
  assert.equal(new Set(stars.map(JSON.stringify)).size, stars.length)
})

test('marble lab is development-only', () => {
  const sentinel = new Error('not found')
  const { default: Page } = loadTypeScript('app/dev/marble/page.tsx', {
    'next/navigation': {
      notFound: () => {
        throw sentinel
      },
    },
    '@/components/debug/MarbleInspection': { default: () => null },
  })
  const previous = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    assert.throws(Page, (error) => error === sentinel)
    process.env.NODE_ENV = 'development'
    assert.ok(Page())
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
})
