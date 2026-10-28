import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const loadConfig = require('next/dist/server/config').default
const { PHASE_PRODUCTION_BUILD } = require('next/constants')
const { unstable_getResponseFromNextConfig, getRedirectUrl } = require('next/experimental/testing/server')
const nextConfig = await loadConfig(PHASE_PRODUCTION_BUILD, process.cwd())

test('Speedroller redirect preserves paths and invite query parameters', async () => {
  const response = await unstable_getResponseFromNextConfig({
    url: 'https://speedroller.vercel.app/course/demo?room=example&watch=1',
    nextConfig,
  })
  assert.equal(response.status, 308)
  assert.equal(getRedirectUrl(response), 'https://speedroller.threenix.io/course/demo?room=example&watch=1')
})

test('other Quizroller hosts and local development do not redirect', async () => {
  for (const host of ['quizroller.vercel.app', 'quizroller-env-speedroller-pragmattic.vercel.app', 'localhost:3000']) {
    const response = await unstable_getResponseFromNextConfig({ url: `https://${host}/?room=example`, nextConfig })
    assert.equal(getRedirectUrl(response), null)
  }
})
