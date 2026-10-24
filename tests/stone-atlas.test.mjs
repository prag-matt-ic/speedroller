import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

// Asset contract: all nine cells must retain their duplicated gutters after encoding.
test('ivory atlas has nine distinct 512px cells with 16px edge padding', async () => {
  const { data, info } = await sharp('assets/textures/platform/ivory-stone-atlas.webp')
    .removeAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 1536)
  assert.equal(info.height, 1536)
  const pixel = (x, y) => {
    const offset = (y * info.width + x) * info.channels
    return data.subarray(offset, offset + info.channels)
  }
  const samples = new Set()
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const left = column * 512, top = row * 512
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      if (x >= 16 && x < 496 && y >= 16 && y < 496) continue
      assert.deepEqual(pixel(left + x, top + y), pixel(left + Math.max(16, Math.min(495, x)), top + Math.max(16, Math.min(495, y))))
    }
    samples.add(data.subarray(((top + 256) * info.width + left + 16) * info.channels, ((top + 256) * info.width + left + 496) * info.channels).toString('base64'))
  }
  assert.equal(samples.size, 9)
})
