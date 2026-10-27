import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadTypeScript } from './loadTypeScript.mjs'

const tiles = loadTypeScript('utils/tiles.ts')
const { findRaceLineBands } = loadTypeScript('utils/platform/raceLine.ts')
const { createTileBatches, packTileState } = loadTypeScript('utils/platform/terrainBatches.ts')
const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts')

const rows = PLATFORM_DATA.modes.speedrun.rows
const columns = rows[0].isRaised.length

const markerRow = (kind) =>
  rows.findIndex((row) => (kind === 'start' ? row.startLinePosition : row.finishLinePosition))

const floorColumns = (rowIndex) =>
  rows[rowIndex].isRaised.flatMap((isRaised, column) => (isRaised === 1 ? [column] : []))

const readTile = (batches, rowIndex, column) => {
  const batch = batches.find(
    ({ startRow }) => rowIndex >= startRow && rowIndex < startRow + tiles.PLATFORM_BATCH_ROWS,
  )
  assert.ok(batch, `no tile batch covers row ${rowIndex}`)
  const instance = batch.cellToInstance[(rowIndex - batch.startRow) * columns + column]
  assert.ok(instance >= 0, `no tile instance at ${rowIndex}:${column}`)
  return { paint: batch.raceLinePaint[instance], edge: batch.raceLineEdge[instance] }
}

test('each race line covers the three rows around its marker across the whole floor run', () => {
  const bands = findRaceLineBands(rows)
  assert.deepEqual(bands.map(({ kind }) => kind), ['start', 'finish'])

  for (const band of bands) {
    assert.equal(band.anchorRowIndex, markerRow(band.kind))
    assert.equal(band.lastRowIndex - band.firstRowIndex + 1, tiles.RACE_LINE_ROW_SPAN)

    const seen = new Set()
    for (let rowIndex = band.firstRowIndex; rowIndex <= band.lastRowIndex; rowIndex++) {
      const painted = band.cells
        .filter((cell) => cell.rowIndex === rowIndex)
        .map(({ column }) => column)
      assert.deepEqual(painted, floorColumns(rowIndex), `row ${rowIndex} paints the whole floor width`)
      assert.ok(painted.includes(band.anchorColumn), `row ${rowIndex} includes the marker column`)
      painted.forEach((column) => {
        const key = `${rowIndex}:${column}`
        assert.ok(!seen.has(key), `duplicate cell ${key}`)
        seen.add(key)
      })
    }
  }
})

test('painting checkers both parities on the finish and leaves the start alternate square bare', () => {
  const batches = createTileBatches(rows)
  for (const batch of batches) {
    assert.equal(batch.raceLinePaint.length, batch.positions.length)
    assert.equal(batch.raceLineEdge.length, batch.positions.length)
  }

  const bands = findRaceLineBands(rows)
  const mainColourParity = new Set()

  for (const band of bands) {
    const mainColour = band.kind === 'finish' ? 2 : 1
    const otherColour = band.kind === 'finish' ? 1 : 0
    for (const { rowIndex, column } of band.cells) {
      const { paint, edge } = readTile(batches, rowIndex, column)
      const isLeadingRow = band.kind === 'finish' && rowIndex === band.firstRowIndex
      assert.equal(edge, isLeadingRow ? 1 : 0, `edge at ${rowIndex}:${column}`)

      const isMainSquare = (rowIndex + column) % 2 === 0
      assert.equal(paint, isMainSquare ? mainColour : otherColour, `paint at ${rowIndex}:${column}`)
      if (isMainSquare) mainColourParity.add((rowIndex + column) % 2)
    }
  }

  assert.deepEqual([...mainColourParity], [0], 'both lines keep one course-wide parity')

  const outside = readTile(batches, bands[0].lastRowIndex + 2, bands[0].anchorColumn)
  assert.deepEqual(outside, { paint: 0, edge: 0 }, 'floor outside the band stays bare')
})

test('ghost scenery inside a band row is never painted', () => {
  const ghostColumn = 3
  const row = (overrides = {}) => ({
    isRaised: [1, 1, 1, 1, 1],
    stage: 1,
    isSectionStart: false,
    isSectionEnd: false,
    ...overrides,
  })
  const bandRows = [
    row(),
    row({
      startLinePosition: [0, tiles.ON_TILE_Y, 0],
      decorationColumns: [ghostColumn],
    }),
    row(),
  ]
  const [batch] = createTileBatches(bandRows, true)
  const ghostInstance = [...batch.ghosts].indexOf(1)
  const paintAt = (rowIndex, column) =>
    batch.raceLinePaint[batch.cellToInstance[rowIndex * bandRows[0].isRaised.length + column]]

  assert.ok(ghostInstance >= 0, 'the decoration renders as a ghost tile')
  assert.equal(batch.raceLinePaint[ghostInstance], 0, 'a ghost tile is scenery, not paint')
  assert.equal(paintAt(1, 1), 1, 'floor tiles in the band still paint')
})

test('packed tile state keeps the shader channel order under one vertex buffer', () => {
  const batches = createTileBatches(rows)
  const batch = batches.find(({ startRow }) => startRow === 32)
  assert.ok(batch, 'the start band has a batch')

  const state = packTileState(batch)
  assert.equal(state.length, batch.positions.length * 4, 'one vec4 per instance')

  const painted = batch.cellToInstance[66]
  const bare = batch.cellToInstance[65]
  assert.equal(state[painted * 4 + 2], 1, 'z paints the white start square')
  assert.equal(state[bare * 4 + 2], 0, 'z leaves the neighbouring square bare')
  assert.equal(state[painted * 4 + 3], 0, 'w only marks the finish edge')

  for (let index = 0; index < batch.positions.length; index++) {
    assert.equal(state[index * 4], batch.ghosts[index], 'x is the ghost flag')
    assert.equal(state[index * 4 + 1], batch.highlights[index], 'y is the highlight flag')
  }
})
