import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadTypeScript } from './loadTypeScript.mjs'

const { createTileTextLayout } = loadTypeScript('utils/platform/tileText.ts')
const { CYLINDER_SURFACE, FLAT_SURFACE, worldToCourse } = loadTypeScript('utils/platform/courseSurface.ts')
const { colToX, ON_TILE_Y, rowToWorldZ, TILE_SIZE } = loadTypeScript('utils/tiles.ts')
const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts')
const { findRaceLineBands } = loadTypeScript('utils/platform/raceLine.ts')
const { createCoursePlaneGeometry } = loadTypeScript('utils/platform/coursePlaneGeometry.ts')

const react = { useMemo: calculate => calculate(), useEffect: () => {} }
const Text = () => null
const { TileText } = loadTypeScript('components/platform/TileText.tsx', {
  react,
  '@/hooks/useCourseSurface': { useCourseSurface: () => CYLINDER_SURFACE },
  './Text': { Text },
})
const { default: SpeedRunElements } = loadTypeScript('components/platform/speedRun/SpeedRunElements.tsx', {
  react,
  '@/components/platform/TileText': { TileText },
  './SpeedRunLine': { __esModule: true, default: () => null },
})

const renderRaceLines = rows => SpeedRunElements({ rows, onReadyChange: () => {} })

test('START occupies the middle five tiles, with one tile between character centres', () => {
  const layout = createTileTextLayout('START', 29, 66, 132)
  assert.deepEqual(layout.map(({ character }) => character), ['S', 'T', 'A', 'R', 'T'])
  assert.deepEqual(layout.map(({ column }) => column), [64, 65, 66, 67, 68])
  assert.equal(layout[2].position[0], colToX(66, 132))
  layout.forEach(({ position }, index) => {
    assert.equal(position[1], ON_TILE_Y + 0.02)
    assert.equal(position[2], rowToWorldZ(29))
    if (index > 0) assert.equal(position[0] - layout[index - 1].position[0], TILE_SIZE)
  })
})

test('FINISH uses six whole tiles and chooses the left placement when centring is impossible', () => {
  const layout = createTileTextLayout('FINISH', 1236, 66, 132)
  assert.deepEqual(layout.map(({ column }) => column), [63, 64, 65, 66, 67, 68])
  assert.equal((layout[0].column + layout[5].column) / 2, 65.5)
})

test('fractional floor centres align exactly when parity permits and otherwise bias left', () => {
  assert.deepEqual(createTileTextLayout('FINISH', 0, 66.5, 132).map(({ column }) => column), [64, 65, 66, 67, 68, 69])
  assert.deepEqual(createTileTextLayout('START', 0, 66.5, 132).map(({ column }) => column), [64, 65, 66, 67, 68])
})

test('spaces reserve tiles, empty text draws nothing, and characters are not split into UTF-16 halves', () => {
  assert.deepEqual(createTileTextLayout('A B', 0, 4).map(({ character, column }) => [character, column]), [['A', 3], [' ', 4], ['B', 5]])
  assert.deepEqual(createTileTextLayout('', 0, 4), [])
  assert.equal(createTileTextLayout('𐐀', 0, 4).length, 1)
})

test('TileText reuses Text with inset squares, the current surface, and configurable appearance', () => {
  const characters = TileText({ text: 'A B', rowIndex: 5, centerColumn: 66 })
  assert.equal(characters[1], null, 'a space has no mesh')
  for (const character of characters.filter(Boolean)) {
    assert.equal(character.type, Text)
    assert.equal(character.props.surface, CYLINDER_SURFACE)
    assert.equal(character.props.width, TILE_SIZE * 0.9)
    assert.equal(character.props.height, TILE_SIZE * 0.9)
    assert.equal(character.props.textCanvasOptions.color, '#ffffff')
    assert.match(character.props.textCanvasOptions.fontFamily, /Unbounded/)
  }
  const options = { color: '#123456', fontFamily: 'serif', fontWeight: 900 }
  const [custom] = TileText({ text: 'X', rowIndex: 1, centerColumn: 16, surface: FLAT_SURFACE, textCanvasOptions: options })
  assert.equal(custom.props.surface, FLAT_SURFACE)
  assert.deepEqual(custom.props.textCanvasOptions, options)
  assert.equal(custom.props.position[0], colToX(16))
  assert.deepEqual(TileText({ text: '', rowIndex: 1, centerColumn: 16 }), [])
})

test('character planes follow flat and cylindrical tile surfaces without crossing tile boundaries', () => {
  for (const surface of [FLAT_SURFACE, CYLINDER_SURFACE]) {
    for (const character of TileText({ text: 'START', rowIndex: 29, centerColumn: 16, surface })) {
      const { width, height, position: [x, y, z] } = character.props
      const geometry = createCoursePlaneGeometry(width, height, x, y, surface)
      const positions = geometry.getAttribute('position')
      for (let index = 0; index < positions.count; index++) {
        const point = { x: positions.getX(index), y: positions.getY(index), z: positions.getZ(index) + z }
        worldToCourse(point, surface, point)
        assert.ok(Math.abs(point.x - x) < TILE_SIZE / 2)
        assert.ok(Math.abs(point.z - z) < TILE_SIZE / 2)
        assert.ok(Math.abs(point.y - y) < 1e-5)
      }
      geometry.dispose()
    }
  }
})

test('both race labels use the original rows and colours and have solid floor across their full spans', () => {
  const { rows, surface } = PLATFORM_DATA.modes.speedrun
  const bands = findRaceLineBands(rows)
  const lines = renderRaceLines(rows)
  assert.equal(lines.length, 2)
  for (const [index, line] of lines.entries()) {
    const [sensor, label] = line.props.children
    const band = bands[index]
    assert.equal(sensor.props.kind, band.kind)
    assert.ok(sensor.props.cells.length > 0)
    assert.equal(label.type, TileText)
    assert.equal(label.props.text, band.kind.toUpperCase())
    assert.equal(label.props.rowIndex, band.anchorRowIndex - 3)
    assert.equal(label.props.centerColumn, band.centreColumn)
    assert.equal(label.props.textCanvasOptions.color, band.kind === 'start' ? '#ffffff' : '#eafffb')
    const layout = createTileTextLayout(label.props.text, label.props.rowIndex, label.props.centerColumn, surface.columns)
    assert.deepEqual(layout.map(({ column }) => column), band.kind === 'start' ? [64, 65, 66, 67, 68] : [63, 64, 65, 66, 67, 68])
    for (const { column } of layout) {
      assert.equal(rows[label.props.rowIndex].isRaised[column], 1)
      assert.ok(!rows[label.props.rowIndex].decorationColumns?.includes(column))
    }
  }
})

test('a missing floor tile or ghost suppresses the whole label while retaining its sensor', () => {
  const { rows } = PLATFORM_DATA.modes.speedrun
  for (const replacement of [
    { ...rows[29], isRaised: rows[29].isRaised.map((raised, column) => column === 64 ? 0 : raised) },
    { ...rows[29], decorationColumns: [64] },
  ]) {
    const changedRows = rows.map((row, index) => index === 29 ? replacement : row)
    const [start, finish] = renderRaceLines(changedRows)
    assert.equal(start.props.children[1], null)
    assert.equal(start.props.children[0].props.kind, 'start')
    assert.equal(finish.props.children[1].props.text, 'FINISH')
  }
  const [devFinish] = renderRaceLines(PLATFORM_DATA.modes.dev.rows)
  assert.equal(devFinish.props.children[1], null, 'the sparse dev row cannot support six letters')
  assert.deepEqual(renderRaceLines([]), [])
})
