import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Color, SRGBColorSpace, Vector3 } from 'three'
import { loadTypeScript } from './loadTypeScript.mjs'

const cache = new Map()
const palette = loadTypeScript('components/palette.ts', {}, cache)
const layout = loadTypeScript('utils/platform/homeSection.ts', {}, cache)
const { createCoursePlaneGeometry } = loadTypeScript('utils/platform/coursePlaneGeometry.ts')
const { createSurfaceColliders } = loadTypeScript('utils/platform/surfaceColliders.ts')
const { FLAT_SURFACE, CYLINDER_SURFACE, courseToWorld, worldToCourse } = loadTypeScript('utils/platform/courseSurface.ts')
const { TILE_JOINT_WIDTH, TILE_BEVEL_WIDTH, createTileSlabGeometry } = loadTypeScript('utils/platform/tileSlabGeometry.ts')
const { ON_TILE_Y, RAISED_Y, colToX } = loadTypeScript('utils/tiles.ts')
const { PLAYER_RADIUS } = loadTypeScript('utils/player.ts')
const { buildMiniMapSVG } = loadTypeScript('scripts/utils/generateMiniMap.ts')
const { updateColourTileContacts } = loadTypeScript('utils/platform/colourTileContacts.ts')
const editor = loadTypeScript('utils/editor/courseDocument.ts')
const close = (actual, expected, tolerance = 2e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)

// Evaluate the actual TSL sampling graph with scalar nodes; no renderer is required.
class Scalar {
  constructor(value) { this.value = value }
  add(other) { return new Scalar(this.value + Number(other)) }
  sub(other) { return new Scalar(this.value - Number(other)) }
  mul(other) { return new Scalar(this.value * Number(other)) }
  clamp(low, high) { return new Scalar(Math.max(low, Math.min(high, this.value))) }
  floor() { return new Scalar(Math.floor(this.value)) }
  min(other) { return new Scalar(Math.min(this.value, other)) }
  toFloat() { return this }
  toInt() { return new Scalar(Math.trunc(this.value)) }
  valueOf() { return this.value }
}
let uploadedStops
const gpu = loadTypeScript('resources/tsl/playerPalette.ts', {
  'three/tsl': {
    uniformArray: values => {
      uploadedStops = values.map(value => value.toArray())
      return { element: index => uploadedStops[Number(index)] }
    },
    mix: (start, end, amount) => start.map((value, channel) => value + (end[channel] - value) * Number(amount)),
  },
}, cache)

test('eight Figma bases are preserved at the midpoint, with generated HSL shadows and highlights', () => {
  const expected = ['#D6BB06', '#4BD606', '#0BCFAE', '#0B8ECF', '#1B44BF', '#9116E9', '#E212D5', '#DE171B']
  assert.deepEqual(palette.PLAYER_BASE_COLOURS, expected)
  assert.equal(palette.PALETTE_COUNT, 8)
  expected.forEach((hex, index) => {
    assert.equal(palette.getPaletteHex(index).toLowerCase(), hex.toLowerCase())
    const base = new Color(hex).getHSL({}, SRGBColorSpace)
    const [shadow, , highlight] = palette.PLAYER_PALETTE_STOPS[index].map(stop => new Color(...stop).getHSL({}, SRGBColorSpace))
    close(shadow.h, base.h); close(highlight.h, base.h)
    close(shadow.s, Math.min(1, base.s * 1.1)); close(shadow.l, base.l * 0.55)
    close(highlight.s, base.s * 0.75); close(highlight.l, base.l + (1 - base.l) * 0.35)
  })
})

test('CPU and shader use identical linear stops and sampling, including bounds', () => {
  assert.deepEqual(uploadedStops, palette.PLAYER_PALETTE_STOPS.flat())
  for (const index of [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const t of [-1, 0, 0.25, 0.5, 0.8, 1, 2]) {
      const cpu = palette.samplePaletteLinearColour(index, t)
      const shader = gpu.samplePlayerPalette(new Scalar(t), new Scalar(index))
      cpu.forEach((value, channel) => {
        assert.ok(value >= 0 && value <= 1)
        close(shader[channel], value)
      })
      const srgb = palette.samplePaletteColour(index, t)
      const decoded = new Color().setRGB(...srgb, SRGBColorSpace).toArray()
      decoded.forEach((value, channel) => close(value, cpu[channel]))
    }
  }
  assert.deepEqual(palette.samplePaletteColour(NaN, NaN), palette.samplePaletteColour(0, 0))
  assert.equal(palette.clampPaletteIndexSafe(Infinity), 0)
  assert.equal(palette.getPalettePreviewStops().length, 8)
})

test('player light matches the selected shader palette at the shared light sample', () => {
  const { getPlayerLightColour } = loadTypeScript('components/lighting/playerLight.ts', {}, cache)
  for (let index = 0; index < palette.PALETTE_COUNT; index++) {
    const light = getPlayerLightColour(index)
    const shader = gpu.samplePlayerPalette(new Scalar(gpu.PLAYER_LIGHT_PALETTE_T), new Scalar(index))
    light.forEach((channel, component) => close(channel, shader[component]))
  }
})

test('one-row layout and minimap agree on tile centres, including fractional legacy anchors', () => {
  assert.deepEqual(layout.COLOUR_PICKER_COLUMN_OFFSETS, [-4, -3, -2, -1, 0, 1, 2, 3])
  assert.equal(layout.COLOUR_TILE_SIZE, 1)
  for (const surface of [FLAT_SURFACE, CYLINDER_SURFACE]) {
    const centreColumn = Math.floor(surface.columns / 2)
    const x = colToX(centreColumn, surface.columns)
    for (const relativeZ of [0, 0.5, -0.5, 1]) {
      const rows = Array.from({ length: 5 }, () => ({ isRaised: Array(surface.columns).fill(1) }))
      rows[2].colourPickerPlacement = [x, ON_TILE_Y, relativeZ, 0]
      const { svg } = buildMiniMapSVG({ rows, columns: surface.columns, tileSize: 1 })
      const markers = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="#37D6C7"/g)]
      assert.equal(markers.length, 8)
      assert.deepEqual(markers.map(match => Number(match[1])), layout.COLOUR_PICKER_COLUMN_OFFSETS.map(offset => centreColumn + offset))
      assert.ok(markers.every(match => Number(match[2]) === 4 - layout.colourPickerRowIndex(2, relativeZ)))
    }
  }
})

test('single-quad swatches clear the stone top and one-cell sensors follow both surfaces', () => {
  const width = layout.COLOUR_TILE_SIZE - TILE_JOINT_WIDTH - 2 * TILE_BEVEL_WIDTH
  const slab = createTileSlabGeometry()
  for (const surface of [FLAT_SURFACE, CYLINDER_SURFACE]) {
    for (const x of [0.5, 3.5, 33.5, 65.5]) {
      const geometry = createCoursePlaneGeometry(width, width, x, ON_TILE_Y, surface, 1)
      const points = geometry.getAttribute('position')
      assert.equal(points.count, 4)
      const top = [0, 1, 2].map(index => {
        const vertex = new Vector3().fromBufferAttribute(slab.getAttribute('position'), index)
        return courseToWorld(x + vertex.x, RAISED_Y + vertex.y, vertex.z, surface, new Vector3())
      })
      const normal = new Vector3().subVectors(top[1], top[0]).cross(new Vector3().subVectors(top[2], top[0])).normalize()
      for (let index = 0; index < points.count; index++) {
        const vertex = new Vector3().fromBufferAttribute(points, index)
        assert.ok(vertex.sub(top[0]).dot(normal) > 0.004, 'swatch must stay above the stone top')
      }
      const sensor = createSurfaceColliders([[x, ON_TILE_Y, 0]], surface, 1, PLAYER_RADIUS * 4, 1)
      for (let index = 0; index < sensor.vertices.length; index += 3) {
        const course = worldToCourse(new Vector3(...sensor.vertices.slice(index, index + 3)), surface, new Vector3())
        close(Math.abs(course.x - x), 0.5, 1e-5)
        close(Math.abs(course.y - ON_TILE_Y), PLAYER_RADIUS * 2, 1e-5)
        close(Math.abs(course.z), 0.5)
      }
      geometry.dispose()
    }
  }
  slab.dispose()
})

test('editor requires exactly the new shop footprint, not the former extra row or columns', () => {
  const document = JSON.parse(readFileSync('assets/platform/1.4.0/race.course.json', 'utf8'))
  const rows = editor.courseRows(document)
  const row = rows.findIndex(row => row.objects.some(object => object.type === 'paintShop'))
  const column = rows[row].objects.find(object => object.type === 'paintShop').column
  const ghost = (r, c) => editor.paintCells(document, [{ row: r, column: c }], { layer: 'ghosts', erase: false, object: 'ring' })
  const shopIssues = doc => editor.validateCourse(doc).filter(issue => issue.message.includes('paintShop'))
  for (const offset of layout.COLOUR_PICKER_COLUMN_OFFSETS) assert.ok(shopIssues(ghost(row, column + offset)).length)
  for (const [r, c] of [[row, column - 5], [row, column + 4], [row + 1, column]]) assert.deepEqual(shopIssues(ghost(r, c)), [])
})

test('crossing adjacent sensors does not cancel the new option and reversing restores the overlapped option', () => {
  let contacts = updateColourTileContacts([], 1, true)
  const original = contacts
  contacts = updateColourTileContacts(contacts, 2, true)
  assert.deepEqual(original, [1])
  assert.equal(contacts.at(-1), 2)
  assert.deepEqual(updateColourTileContacts(contacts, 1, false), [2])
  assert.deepEqual(updateColourTileContacts(contacts, 2, false), [1])
  contacts = updateColourTileContacts(contacts, 1, false)
  contacts = updateColourTileContacts(contacts, 2, false)
  assert.deepEqual(contacts, [])
})
