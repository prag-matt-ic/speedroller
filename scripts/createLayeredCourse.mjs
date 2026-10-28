// One-time import. Refuses to overwrite an authored course.
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
const source = path.resolve('assets/platform/1.3.0')
const destination = path.resolve('assets/platform/1.4.0')
const manifest = JSON.parse(await fs.readFile('docs/race-course/bitmaps/manifest.json', 'utf8'))
const approved = JSON.parse(await fs.readFile('docs/race-course/approved-layout.json', 'utf8'))
const document = { schemaVersion: 1, surface: { topology: 'cylinder', columns: 132 }, sections: [] }
const kinds = { '255,0,0': 'ring', '128,0,255': 'start', '255,255,0': 'finish', '255,128,0': 'paintShop' }
for (const [index, chunk] of manifest.chunks.entries()) {
  const { data, info } = await sharp(path.join(source, path.basename(chunk.file))).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const rows = []
  for (let rowIndex = 0; rowIndex < info.height; rowIndex++) {
    const row = { floor: [], ghosts: [], highlights: [], objects: [] }
    const globalRow = chunk.globalStart + rowIndex
    for (let column = 0; column < info.width; column++) {
      const offset = ((info.height - 1 - rowIndex) * info.width + column) * 3
      const colour = [...data.subarray(offset, offset + 3)].join(',')
      if (colour !== '0,0,0') row.floor.push(column)
      if (colour === '0,255,255') row.highlights.push(column)
      if (kinds[colour]) row.objects.push({ column, type: kinds[colour] })
    }
    const ghosts = new Set()
    if (globalRow >= manifest.startGlobalRow && globalRow < manifest.finishGlobalRow) {
      for (const column of row.floor) for (const direction of [-1, 1]) {
        const neighbour = (column + direction + 132) % 132
        if (!row.floor.includes(neighbour)) ghosts.add(neighbour)
      }
    }
    const progress = Math.max(0, Math.min(1, (globalRow - 36) / (1228 - 36)))
    const shift = 50 + Math.round(132 * progress * progress * (3 - 2 * progress))
    for (const hole of approved.holes) if (globalRow - 32 >= hole.start && globalRow - 32 <= hole.end) {
      for (let x = hole.left; x <= hole.right; x++) ghosts.add((x + 16 + shift) % 132)
    }
    row.ghosts = [...ghosts].sort((a, b) => a - b)
    rows.push(row)
  }
  document.sections.push({ id: path.basename(chunk.file, '.png'), stage: index === 0 ? 1 : index === 6 ? 5 : 3, rows })
}
await fs.mkdir(destination)
for (const file of ['course.json', 'test.png', 'cta.png']) await fs.copyFile(path.join(source, file), path.join(destination, file))
// One row per line keeps map edits reviewable without inflating the file.
await fs.writeFile(path.join(destination, 'race.course.json'), JSON.stringify(document, null, 2) + '\n')
