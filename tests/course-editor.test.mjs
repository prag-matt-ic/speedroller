import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const editor = loadTypeScript('utils/editor/courseDocument.ts')
const { createBitmapParser } = loadTypeScript('scripts/platformCompiler.ts')
const { createTileBatches } = loadTypeScript('utils/platform/terrainBatches.ts')
const { findSafeRespawnPosition } = loadTypeScript('utils/platform/playerRespawn.ts')
const { findSolidColumnArc } = loadTypeScript('utils/platform/courseSurface.ts')
const { colToX, ON_TILE_Y, rowToWorldZ, TILE_SIZE } = loadTypeScript('utils/tiles.ts')
const { placeRowElementsOnTiles } = loadTypeScript('utils/platform/placeRowElementsOnTiles.ts')
const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts')
const document = editor.courseDocumentSchema.parse(JSON.parse(readFileSync('assets/platform/1.4.0/race.course.json', 'utf8')))
const compiler = createBitmapParser(document.surface)
const paint = { layer: 'ghosts', erase: false, object: 'ring' }
const confettiPaint = { ...paint, layer: 'confetti' }
const confettiDocument = structuredClone(document)
for (const row of editor.courseRows(confettiDocument)) delete row.confetti

test('layered source round-trips and compiles to the current runtime with independent layers', () => {
  assert.deepEqual(editor.courseDocumentSchema.parse(JSON.parse(JSON.stringify(document))), document)
  assert.deepEqual(editor.validateCourse(document), [])
  const compiled = compiler.buildLayeredModeData(document)
  assert.deepEqual(compiled.rows.map(placeRowElementsOnTiles), PLATFORM_DATA.modes.speedrun.rows)
  assert.deepEqual(compiled.totalCounts, PLATFORM_DATA.modes.speedrun.totalCounts)
  assert.equal(compiled.rows.length, 1247)
  const sourceRows = editor.courseRows(document)
  sourceRows.forEach((source, index) => {
    const row = compiled.rows[index]
    assert.deepEqual(row.decorationColumns ?? [], source.ghosts)
    for (let column = 0; column < 132; column++) assert.equal(row.isRaised[column], Number(source.floor.includes(column) && !source.ghosts.includes(column)))
  })
})

test('ghost overlay removes collision and trail membership, and erasing restores floor artwork', () => {
  const original = editor.courseRows(document)[50]
  const column = original.floor[Math.floor(original.floor.length / 2)]
  const cell = { row: 50, column }
  const highlighted = editor.paintCells(document, [cell], { ...paint, layer: 'highlights' })
  const changed = editor.paintCells(highlighted, [cell], paint)
  assert.equal(editor.isSolid(editor.courseRows(changed)[50], column), false)
  assert.ok(editor.courseRows(changed)[50].floor.includes(column))
  assert.ok(editor.courseRows(changed)[50].highlights.includes(column))
  const rows = compiler.buildLayeredModeData(changed).rows
  const batch = createTileBatches(rows, true).find(batch => batch.startRow === 48)
  assert.equal(batch.cellToInstance[(50 - 48) * 132 + column], -1)
  assert.equal(batch.solidPositions.length, [...batch.ghosts].filter(value => value === 0).length)
  const x = column - 65.5
  assert.ok(!batch.solidPositions.some(position => position[0] === x && position[2] === -2))
  const safe = findSafeRespawnPosition(rows, x, rowToWorldZ(50), 4, undefined, document.surface)
  assert.ok(safe)
  const restored = editor.paintCells(changed, [cell], { ...paint, erase: true })
  assert.deepEqual(restored, highlighted)
})

test('solid column arcs wrap the seam and stay linear on flat surfaces', () => {
  assert.deepEqual(findSolidColumnArc([10, 11, 12], 132, 'cylinder'), { start: 10, width: 3 })
  assert.deepEqual(findSolidColumnArc([130, 131, 0, 1], 132, 'cylinder'), { start: 130, width: 4 })
  assert.deepEqual(findSolidColumnArc([2, 3], 33, 'flat'), { start: 2, width: 2 })
  assert.equal(findSolidColumnArc([], 132, 'cylinder'), null)
})

test('confetti marks a whole row once, compiles to one burst and erases cleanly', () => {
  const document = confettiDocument
  const rowIndex = 50
  const sourceRow = editor.courseRows(document)[rowIndex]
  const marked = editor.paintCells(document, [{ row: rowIndex, column: 66 }], confettiPaint)
  const markedRow = editor.courseRows(marked)[rowIndex]
  assert.deepEqual(markedRow.confetti, [66])
  assert.deepEqual(markedRow.floor, sourceRow.floor)
  assert.deepEqual(markedRow.highlights, sourceRow.highlights)
  assert.deepEqual(editor.paintCells(marked, [{ row: rowIndex, column: 67 }], confettiPaint), marked)

  const rows = editor.courseRows(marked)
  const solid = rows[rowIndex].floor.filter(column => !rows[rowIndex].ghosts.includes(column))
  const arc = findSolidColumnArc(solid, 132, 'cylinder')
  const compiled = compiler.buildLayeredModeData(marked)
  assert.deepEqual(compiled.rows[rowIndex].confettiPlacements, [{
    position: [colToX(arc.start + (arc.width - 1) / 2, 132), ON_TILE_Y, 0],
    width: arc.width * TILE_SIZE,
    depth: TILE_SIZE,
    contentIndex: 0,
  }])
  assert.equal(compiled.totalCounts.confetti, 1)

  const erased = editor.paintCells(marked, [{ row: rowIndex, column: 67 }], { ...confettiPaint, erase: true })
  assert.deepEqual(editor.courseRows(erased), editor.courseRows(document))
  assert.equal(compiler.buildLayeredModeData(erased).totalCounts.confetti, 0)

  const history = editor.editHistory({ past: [], present: document, future: [] }, marked)
  assert.equal(editor.undo(history).present, document)
  assert.equal(editor.redo(editor.undo(history)).present, marked)
})

test('seam rows keep their narrow burst and over-wide rows cannot take confetti', () => {
  const document = confettiDocument
  const seamRow = 599
  const seamMarked = editor.paintCells(document, [{ row: seamRow, column: 120 }], confettiPaint)
  const seamSource = editor.courseRows(seamMarked)[seamRow]
  assert.deepEqual(seamSource.confetti, [120])
  const solid = seamSource.floor.filter(column => !seamSource.ghosts.includes(column))
  assert.equal(Math.max(...solid) - Math.min(...solid) + 1, 132)
  assert.deepEqual(findSolidColumnArc(solid, 132, 'cylinder'), { start: 119, width: 16 })
  const compiled = compiler.buildLayeredModeData(seamMarked)
  assert.deepEqual(compiled.rows[seamRow].confettiPlacements, [{
    position: [colToX(126.5, 132), ON_TILE_Y, 0],
    width: 16 * TILE_SIZE,
    depth: TILE_SIZE,
    contentIndex: 0,
  }])

  const wideRow = 569
  const wide = editor.paintCells(document, [{ row: wideRow, column: 66 }], confettiPaint)
  assert.equal(editor.courseRows(wide)[wideRow].confetti, undefined)

  const forged = structuredClone(document)
  editor.courseRows(forged)[wideRow].confetti = [66]
  assert.ok(editor.validateCourse(forged).some(issue => issue.message.includes(`at most ${editor.MAX_CONFETTI_ROW_WIDTH}`)))
  assert.equal(compiler.buildLayeredModeData(forged).rows[wideRow].confettiPlacements, undefined)
})

test('brushes wrap the cylinder, preserve other layers and undo/redo one gesture', () => {
  const cells = editor.brushCells({ row: 50, column: 0 }, { row: 50, column: 0 }, 3)
  const changed = editor.paintCells(document, cells, paint)
  const row = editor.courseRows(changed)[50]
  for (const column of [131, 0, 1]) assert.ok(row.ghosts.includes(column))
  assert.deepEqual(row.floor, editor.courseRows(document)[50].floor)
  assert.deepEqual(editor.brushCells({ row: 1, column: 1 }, { row: 2, column: 2 }, 1, true), [{ row: 1, column: 1 }, { row: 1, column: 2 }, { row: 2, column: 1 }, { row: 2, column: 2 }])
  const initial = { past: [], present: document, future: [] }
  const history = editor.editHistory(initial, changed)
  assert.equal(editor.undo(history).present, document)
  assert.equal(editor.redo(editor.undo(history)).present, changed)
  assert.equal(editor.editHistory(initial, document), initial)
})

test('objects do not overwrite highlights and singleton placement moves the old marker', () => {
  const highlighted = editor.paintCells(document, [{ row: 32, column: 66 }], { ...paint, layer: 'highlights' })
  const moved = editor.paintCells(highlighted, [{ row: 40, column: 66 }], { layer: 'objects', object: 'start', erase: false })
  assert.equal(editor.courseRows(moved).flatMap(row => row.objects).filter(object => object.type === 'start').length, 1)
  assert.ok(editor.courseRows(moved)[32].highlights.includes(66))
  assert.ok(editor.courseRows(moved)[32].floor.includes(66))
  assert.ok(editor.courseRows(moved)[40].objects.some(object => object.type === 'start'))
})

test('validation rejects unsupported markers, disconnected floor and changed dimensions', () => {
  const ghostSpawn = editor.paintCells(document, [{ row: 0, column: 66 }], paint)
  assert.ok(editor.validateCourse(ghostSpawn).some(issue => issue.message.includes('spawn')))
  const ghostStart = editor.paintCells(document, [{ row: 32, column: 66 }], paint)
  assert.ok(editor.validateCourse(ghostStart).some(issue => issue.message.includes('start')))
  const island = editor.paintCells(document, [{ row: 0, column: 0 }], { ...paint, layer: 'floor' })
  assert.ok(editor.validateCourse(island).some(issue => issue.message.includes('connect')))
  assert.equal(editor.courseDocumentSchema.safeParse({ ...document, surface: { topology: 'cylinder', columns: 133 } }).success, false)
  assert.equal(editor.courseDocumentSchema.safeParse({ ...document, sections: document.sections.slice(1) }).success, false)
})

test('confetti needs solid floor, at most one marker and a row inside the width limit', () => {
  const rowIndex = 50
  const sourceRow = editor.courseRows(document)[rowIndex]
  const ghosted = editor.paintCells(document, sourceRow.floor.map(column => ({ row: rowIndex, column })), paint)
  const blocked = editor.paintCells(ghosted, [{ row: rowIndex, column: 66 }], confettiPaint)
  assert.equal(editor.courseRows(blocked)[rowIndex].confetti, undefined)

  const marked = editor.paintCells(document, [{ row: rowIndex, column: 66 }], confettiPaint)
  const markedGhosted = editor.paintCells(marked, sourceRow.floor.map(column => ({ row: rowIndex, column })), paint)
  assert.ok(editor.validateCourse(markedGhosted).some(issue => issue.message.includes('Confetti row needs solid floor')))

  const twoMarkers = structuredClone(document)
  editor.courseRows(twoMarkers)[rowIndex].confetti = [1, 2]
  assert.equal(editor.courseDocumentSchema.safeParse(twoMarkers).success, false)

  const outOfRange = structuredClone(document)
  editor.courseRows(outOfRange)[rowIndex].confetti = [132]
  assert.equal(editor.courseDocumentSchema.safeParse(outOfRange).success, false)
})

test('save rejects stale revisions and serializes concurrent updates without losing the winner', async () => {
  let source = JSON.stringify(document)
  let writes = 0
  const files = loadTypeScript('utils/editor/courseFiles.ts', {
    'node:fs/promises': { readFile: async () => source },
    '../../scripts/platformCompiler': { compilePlatform: async () => [] },
    './replaceFiles': { replaceFiles: async outputs => { writes++; source = outputs.at(-1).content } },
  })
  const loaded = await files.readCourse()
  const changed = editor.paintCells(document, [{ row: 50, column: 66 }], confettiPaint)
  const results = await Promise.allSettled([files.saveCourse(changed, loaded.revision), files.saveCourse(document, loaded.revision)])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.ok(results[1].reason instanceof files.StaleCourseError)
  assert.equal(writes, 1)
  assert.deepEqual((await files.readCourse()).document, changed)
})

test('file replacement stages outputs and restores earlier files after a failed rename', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'speedroller-editor-'))
  try {
    const first = path.join(directory, 'first'), second = path.join(directory, 'second')
    await fs.writeFile(first, 'before one'); await fs.writeFile(second, 'before two')
    let renames = 0
    const { replaceFiles } = loadTypeScript('utils/editor/replaceFiles.ts', {
      'node:fs/promises': { ...fs, rename: async (...args) => { if (++renames === 2) throw new Error('Injected failure'); return fs.rename(...args) } },
    })
    await assert.rejects(replaceFiles([{ path: first, content: 'after one' }, { path: second, content: 'after two' }]), /Injected failure/)
    assert.equal(await fs.readFile(first, 'utf8'), 'before one')
    assert.equal(await fs.readFile(second, 'utf8'), 'before two')
    assert.deepEqual((await fs.readdir(directory)).sort(), ['first', 'second'])
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})

test('file replacement retains the original recovery file when rollback rename fails', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'speedroller-editor-'))
  try {
    const first = path.join(directory, 'first'), second = path.join(directory, 'second')
    const recoveryPath = `${first}.recovery-test.tmp`
    await fs.writeFile(first, 'before one'); await fs.writeFile(second, 'before two')
    let renames = 0
    const { replaceFiles } = loadTypeScript('utils/editor/replaceFiles.ts', {
      'node:crypto': { randomUUID: () => 'recovery-test' },
      'node:fs/promises': { ...fs, rename: async (...args) => {
        if (++renames >= 2) throw new Error('Injected rename failure')
        return fs.rename(...args)
      } },
    })
    await assert.rejects(replaceFiles([{ path: first, content: 'after one' }, { path: second, content: 'after two' }]), error => {
      assert.match(error.message, /rollback was incomplete/)
      assert.ok(error.message.includes(recoveryPath))
      return true
    })
    assert.equal(await fs.readFile(first, 'utf8'), 'after one')
    assert.equal(await fs.readFile(second, 'utf8'), 'before two')
    assert.equal(await fs.readFile(recoveryPath, 'utf8'), 'before one')
    assert.deepEqual((await fs.readdir(directory)).sort(), ['first', 'first.recovery-test.tmp', 'second'])
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})

test('editor API rejects cross-origin writes and is absent in production', async () => {
  const original = process.env.NODE_ENV
  const { GET, POST } = loadTypeScript('app/api/dev/course-editor/route.ts', {
    '@/utils/editor/courseFiles': { readCourse: async () => ({ document }), saveCourse: async () => { throw new Error('Must not write') }, StaleCourseError: class extends Error {} },
  })
  try {
    process.env.NODE_ENV = 'development'
    const blocked = await POST(new Request('http://localhost:3000/api/dev/course-editor', { method: 'POST', headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: '{}' }))
    assert.equal(blocked.status, 403)
    process.env.NODE_ENV = 'production'
    assert.equal((await GET()).status, 404)
    assert.equal((await POST(new Request('http://localhost/api/dev/course-editor', { method: 'POST' }))).status, 404)
  } finally { if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original }
})
