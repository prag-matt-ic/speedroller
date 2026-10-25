// One-time migration only. build-platform never calls this or repaints editable PNGs.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const source = path.resolve('assets/platform/1.2.0')
const destination = path.resolve('assets/platform/1.3.0')
const manifest = JSON.parse(await fs.readFile('docs/race-course/bitmaps/manifest.json', 'utf8'))
const columns = 132
const rotationStart = manifest.startGlobalRow + 4
const rotationEnd = manifest.finishGlobalRow - 4
const config = {
  speedrun: { topology: 'cylinder', columns },
  dev: { topology: 'flat', columns: 33 },
}

await fs.mkdir(destination) // Refuse to overwrite manually edited artwork.
await fs.mkdir(path.join(destination, 'decoration'))
for (const file of ['test.png', 'cta.png']) await fs.copyFile(path.join(source, file), path.join(destination, file))

for (const chunk of manifest.chunks) {
  for (const relative of [path.basename(chunk.file), `decoration/${path.basename(chunk.file)}`]) {
    const { data, info } = await sharp(path.join(source, relative)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.width, 33)
    assert.equal(info.channels, 3)
    const output = Buffer.alloc(columns * info.height * 3)
    for (let y = 0; y < info.height; y++) {
      const row = chunk.globalStart + info.height - 1 - y
      const progress = Math.max(0, Math.min(1, (row - rotationStart) / (rotationEnd - rotationStart)))
      const offset = 50 + Math.round(columns * progress * progress * (3 - 2 * progress))
      for (let x = 0; x < info.width; x++) {
        const from = (y * info.width + x) * 3
        const to = (y * columns + (x + offset) % columns) * 3
        data.copy(output, to, from, from + 3)
      }
    }
    await sharp(output, { raw: { width: columns, height: info.height, channels: 3 } }).png().toFile(path.join(destination, relative))
  }
}
await fs.writeFile(path.join(destination, 'course.json'), JSON.stringify(config, null, 2) + '\n')
