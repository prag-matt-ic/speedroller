import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

export const CELL = 512
export const PADDING = 16
export const INTERIOR = CELL - PADDING * 2
export const RELIEF_HEIGHT = 0.001
const TOP_WIDTH = 0.964
const root = new URL('../assets/textures/platform/', import.meta.url)

export function bakeNormalCell(height, size = INTERIOR, worldWidth = TOP_WIDTH) {
  const normals = Buffer.alloc(size * size * 3)
  const sample = (x, y) => height[Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))] / 255
  const step = worldWidth / (size - 1)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = -(sample(x + 1, y) - sample(x - 1, y)) * RELIEF_HEIGHT / (2 * step)
    // PNG rows increase downwards; texture V increases upwards.
    const ny = (sample(x, y + 1) - sample(x, y - 1)) * RELIEF_HEIGHT / (2 * step)
    const length = Math.hypot(nx, ny, 1)
    normals.set([nx, ny, 1].map(value => Math.round((value / length * 0.5 + 0.5) * 255)), (y * size + x) * 3)
  }
  return normals
}

export async function bakeStoneNormals() {
  const { data, info } = await sharp(fileURLToPath(new URL('source/ivory-stone-height-source.png', root)))
    .greyscale().raw().toBuffer({ resolveWithObject: true })
  const heightAtlas = [], normalAtlas = []
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const left = Math.round(column * info.width / 3), top = Math.round(row * info.height / 3)
    const width = Math.round((column + 1) * info.width / 3) - left
    const height = Math.round((row + 1) * info.height / 3) - top
    const interior = await sharp(data, { raw: info }).extract({ left, top, width, height })
      .resize(INTERIOR, INTERIOR).blur(0.6).raw().toBuffer()
    const padded = async (buffer, channels) => sharp(buffer, { raw: { width: INTERIOR, height: INTERIOR, channels } })
      .extend({ top: PADDING, bottom: PADDING, left: PADDING, right: PADDING, extendWith: 'copy' }).png().toBuffer()
    heightAtlas.push({ input: await padded(interior, 1), left: column * CELL, top: row * CELL })
    normalAtlas.push({ input: await padded(bakeNormalCell(interior), 3), left: column * CELL, top: row * CELL })
  }
  for (const [name, composite] of [['height', heightAtlas], ['normal', normalAtlas]]) {
    await sharp({ create: { width: CELL * 3, height: CELL * 3, channels: 3, background: '#808080' } })
      .composite(composite).removeAlpha().png().toFile(fileURLToPath(new URL(`ivory-stone-${name}.png`, root)))
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await bakeStoneNormals()
