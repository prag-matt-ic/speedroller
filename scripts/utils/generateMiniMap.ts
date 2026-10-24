import fs from 'fs'
import path from 'path'

import { type IndexedPlacement, type RowData, TILE_SIZE, clamp } from '../../utils/tiles'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const MINI_MAP_TILE_SIZE_PX = 4
const POINT_OF_INTEREST_COLOUR = '#37D6C7'
const INFO_COLLECTIBLE_AREA_SIZE = { width: 5, height: 5 }
const START_LINE_AREA_SIZE = { width: 9, height: 5 }
const FINISH_LINE_AREA_SIZE = { width: 9, height: 5 }
const COLOUR_PICKER_AREA_SIZE = { width: 11, height: 2 }

type MiniMapPalette = {
  raised: string
  startLine: string
  finishLine: string
  pointOfInterest: string
  background?: string
}

type MiniMapConfig = {
  tileSize?: number
  palette?: Partial<MiniMapPalette>
}

type MiniMapDimensions = {
  width: number
  height: number
}

type GenerateMiniMapParams = MiniMapConfig & {
  rows: RowData[]
  columns: number
}

type WriteMiniMapParams = GenerateMiniMapParams & {
  outputPath: string
}

const DEFAULT_PALETTE: MiniMapPalette = {
  raised: '#53938C',
  startLine: '#5CE1E6',
  finishLine: '#FFDD3F',
  pointOfInterest: POINT_OF_INTEREST_COLOUR,
}

const getColumns = (columns: number, rows: RowData[]): number => {
  if (columns > 0) return columns
  const firstRowColumns = rows[0]?.isRaised.length ?? 0
  if (firstRowColumns <= 0) {
    throw new Error('Cannot determine column count for mini map generation')
  }
  return firstRowColumns
}

export const buildMiniMapSVG = ({
  rows,
  columns,
  tileSize = MINI_MAP_TILE_SIZE_PX,
  palette,
}: GenerateMiniMapParams): { svg: string } & MiniMapDimensions => {
  const columnCount = getColumns(columns, rows)
  const rowCount = rows.length
  if (rowCount === 0 || columnCount === 0) {
    return { svg: '', width: 0, height: 0 }
  }

  const { background, raised, startLine, finishLine, pointOfInterest } = {
    ...DEFAULT_PALETTE,
    ...palette,
  }
  const width = columnCount * tileSize
  const height = rowCount * tileSize
  const tiles: string[] = []
  const startLineTiles: string[] = []
  const finishLineTiles: string[] = []
  const infoZoneTiles: string[] = []
  const collectibleTiles: string[] = []
  const colourPickerTiles: string[] = []

  const infoZoneCells = collectIndicatorCells(
    rows,
    columnCount,
    (row) => row.infoZonePlacements,
    INFO_COLLECTIBLE_AREA_SIZE,
  )
  const collectibleCells = collectIndicatorCells(
    rows,
    columnCount,
    (row) => row.collectiblePlacements,
    INFO_COLLECTIBLE_AREA_SIZE,
  )
  const startLineCells = collectStartLineCells(rows, columnCount)
  const finishLineCells = collectFinishLineCells(rows, columnCount)
  const colourPickerCells = collectColourPickerCells(rows, columnCount)

  rows.forEach((row, rowIndex) => {
    const y = (rowCount - 1 - rowIndex) * tileSize // bottom-up orientation
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const isRaised = (row.isRaised[columnIndex] ?? 0) === 1
      if (!isRaised) continue
      const x = columnIndex * tileSize
      tiles.push(
        `<rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="${raised}" />`,
      )
    }
  })

  startLineCells.forEach(({ rowIndex, columnIndex }) => {
    const y = (rowCount - 1 - rowIndex) * tileSize
    const x = columnIndex * tileSize
    startLineTiles.push(
      `<rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="${startLine}" />`,
    )
  })

  finishLineCells.forEach(({ rowIndex, columnIndex }) => {
    const y = (rowCount - 1 - rowIndex) * tileSize
    const x = columnIndex * tileSize
    finishLineTiles.push(
      `<rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="${finishLine}" />`,
    )
  })

  infoZoneCells.forEach(({ rowIndex, columnIndex }) => {
    const y = (rowCount - 1 - rowIndex) * tileSize
    const x = columnIndex * tileSize
    infoZoneTiles.push(
      `<rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="${pointOfInterest}" />`,
    )
  })

  collectibleCells.forEach(({ rowIndex, columnIndex }) => {
    const y = (rowCount - 1 - rowIndex) * tileSize
    const x = columnIndex * tileSize
    collectibleTiles.push(
      `<rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="${pointOfInterest}" />`,
    )
  })

  colourPickerCells.forEach(({ rowIndex, columnIndex }) => {
    const y = (rowCount - 1 - rowIndex) * tileSize
    const x = columnIndex * tileSize
    colourPickerTiles.push(
      `<rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="${pointOfInterest}" />`,
    )
  })

  const svgParts = [
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
  ]

  if (!!background) {
    svgParts.push(`<rect width="${width}" height="${height}" fill="${background}" />`)
  }

  svgParts.push(
    ...tiles,
    ...startLineTiles,
    ...finishLineTiles,
    ...infoZoneTiles,
    ...collectibleTiles,
    ...colourPickerTiles,
    '</svg>',
  )

  const svg = svgParts.join('')

  return { svg, width, height }
}

export const writeMiniMapSVG = ({
  outputPath,
  ...params
}: WriteMiniMapParams): { outputPath: string } & MiniMapDimensions => {
  const { svg, width, height } = buildMiniMapSVG(params)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, svg, 'utf8')
  return { outputPath, width, height }
}

export const MINI_MAP_CONSTANTS = {
  TILE_SIZE_PX: MINI_MAP_TILE_SIZE_PX,
}

type IndicatorCell = {
  rowIndex: number
  columnIndex: number
  contentIndex?: number
}

type IndicatorAreaSize = {
  width: number
  height: number
}

const getColumnIndexFromX = (x: number, columnCount: number): number | null => {
  const rawColumn = x / TILE_SIZE + columnCount / 2 - 0.5
  if (!Number.isFinite(rawColumn)) return null
  return clamp(Math.round(rawColumn), 0, columnCount - 1)
}

const getRowIndexFromRelativeZ = (
  rowIndex: number,
  relativeZ: number,
  rowCount: number,
): number | null => {
  const rawRow = rowIndex - relativeZ / TILE_SIZE
  if (!Number.isFinite(rawRow)) return null
  return clamp(Math.round(rawRow), 0, rowCount - 1)
}

const collectIndicatorCells = (
  rows: RowData[],
  columnCount: number,
  getPlacements: (row: RowData) => IndexedPlacement[] | undefined,
  areaSize: IndicatorAreaSize,
): IndicatorCell[] => {
  const rowCount = rows.length
  const seen = new Set<string>()
  const cells: IndicatorCell[] = []

  rows.forEach((row, rowIndex) => {
    const placements = getPlacements(row)
    if (!placements?.length) return

    placements.forEach((placement) => {
      const [x, , relativeZ, contentIndex] = placement
      const targetRow = getRowIndexFromRelativeZ(rowIndex, relativeZ, rowCount)
      const columnIndex = getColumnIndexFromX(x, columnCount)

      if (targetRow == null || columnIndex == null) return

      pushIndicatorAreaCells({
        centerRow: targetRow,
        centerColumn: columnIndex,
        contentIndex,
        columnCount,
        rowCount,
        areaSize,
        seen,
        cells,
      })
    })
  })

  return cells
}

const collectStartLineCells = (rows: RowData[], columnCount: number): IndicatorCell[] => {
  const rowCount = rows.length
  const seen = new Set<string>()
  const cells: IndicatorCell[] = []

  rows.forEach((row, rowIndex) => {
    const position = row.startLinePosition
    if (!position) return
    const [x, , relativeZ] = position
    const targetRow = getRowIndexFromRelativeZ(rowIndex, relativeZ, rowCount)
    const columnIndex = getColumnIndexFromX(x, columnCount)
    if (targetRow == null || columnIndex == null) return

    pushIndicatorAreaCells({
      centerRow: targetRow,
      centerColumn: columnIndex,
      columnCount,
      rowCount,
      areaSize: START_LINE_AREA_SIZE,
      seen,
      cells,
    })
  })

  return cells
}

const collectFinishLineCells = (rows: RowData[], columnCount: number): IndicatorCell[] => {
  const rowCount = rows.length
  const seen = new Set<string>()
  const cells: IndicatorCell[] = []

  rows.forEach((row, rowIndex) => {
    const position = row.finishLinePosition
    if (!position) return
    const [x, , relativeZ] = position
    const targetRow = getRowIndexFromRelativeZ(rowIndex, relativeZ, rowCount)
    const columnIndex = getColumnIndexFromX(x, columnCount)
    if (targetRow == null || columnIndex == null) return

    pushIndicatorAreaCells({
      centerRow: targetRow,
      centerColumn: columnIndex,
      columnCount,
      rowCount,
      areaSize: FINISH_LINE_AREA_SIZE,
      seen,
      cells,
    })
  })

  return cells
}

const collectColourPickerCells = (rows: RowData[], columnCount: number): IndicatorCell[] => {
  const rowCount = rows.length
  const seen = new Set<string>()
  const cells: IndicatorCell[] = []

  rows.forEach((row, rowIndex) => {
    const placement = row.colourPickerPlacement
    if (!placement) return
    const [x, , relativeZ, contentIndex] = placement
    const targetRow = getRowIndexFromRelativeZ(rowIndex, relativeZ, rowCount)
    const columnIndex = getColumnIndexFromX(x, columnCount)

    if (targetRow == null || columnIndex == null) return

    pushIndicatorAreaCells({
      centerRow: targetRow,
      centerColumn: columnIndex,
      contentIndex,
      columnCount,
      rowCount,
      areaSize: COLOUR_PICKER_AREA_SIZE,
      seen,
      cells,
    })
  })

  return cells
}

const pushIndicatorAreaCells = ({
  centerRow,
  centerColumn,
  contentIndex,
  columnCount,
  rowCount,
  areaSize,
  seen,
  cells,
}: {
  centerRow: number
  centerColumn: number
  contentIndex?: number
  columnCount: number
  rowCount: number
  areaSize: IndicatorAreaSize
  seen: Set<string>
  cells: IndicatorCell[]
}) => {
  const { start: startRow, end: endRow } = getIndicatorBounds({
    center: centerRow,
    size: areaSize.height,
    limit: rowCount,
  })
  const { start: startColumn, end: endColumn } = getIndicatorBounds({
    center: centerColumn,
    size: areaSize.width,
    limit: columnCount,
  })

  for (let row = startRow; row <= endRow; row++) {
    for (let column = startColumn; column <= endColumn; column++) {
      const key = `${row}:${column}`
      if (seen.has(key)) continue
      seen.add(key)
      cells.push({ rowIndex: row, columnIndex: column, contentIndex })
    }
  }
}

const getIndicatorBounds = ({
  center,
  size,
  limit,
}: {
  center: number
  size: number
  limit: number
}): { start: number; end: number } => {
  const clampedSize = Math.max(1, size)
  const before = Math.floor((clampedSize - 1) / 2)
  const after = clampedSize - 1 - before

  let start = center - before
  let end = center + after

  if (start < 0) {
    end = Math.min(limit - 1, end + Math.abs(start))
    start = 0
  }

  if (end > limit - 1) {
    const overshoot = end - (limit - 1)
    start = Math.max(0, start - overshoot)
    end = limit - 1
  }

  return { start, end }
}
