import { createCoursePillars } from './utils/createCoursePillars'
/**
 * PLATFORM ROW DATA BUILDER
 *
 * Generates precomputed platform row data from bitmap layouts.
 * - Detects latest version folder in ./assets/platform/{semver}/
 * - Parses bitmaps for each game mode and writes resources/rowsData.ts
 * - Speeds up runtime by skipping client-side bitmap parsing
 *
 * HOW TO RUN:
 *   npm run build-platform
 *
 * OUTPUT:
 *   resources/rowsData.ts with PLATFORM_DATA containing rows + totalCounts per mode.
 *   public/maps/{version}/{mode}.svg mini map assets (one per GameMode).
 */
/* eslint-disable no-console */
import { architecturePreview } from './utils/architecturePreview'
import { parseArchitecture, validateArchitectureClearance } from './utils/parseArchitecture'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

import { type TotalCounts, createTotalCounts } from '../stores/totalCounts'
import { GameMode, Stage } from '../stores/types'
import { HEADING_Y } from '../utils/platform/floatingHeading'
import {
  COLUMNS,
  CONFETTI_ROW_DEPTH,
  type ConfettiPlacement,
  type IndexedPlacement,
  ON_TILE_Y,
  type RowData,
  TILE_SIZE,
  colToX,
  worldXToColumn,
} from '../utils/tiles'
import { MINI_MAP_CONSTANTS, writeMiniMapSVG } from './utils/generateMiniMap'

type BitmapPlacement = {
  columnIndex: number
  zOffset: number
}

type BitmapRow = {
  isRaised: (0 | 1)[]
  highlightColumns: number[]
  ringColumns: number[]
  infoZoneColumns: number[]
  collectibleColumns: number[]
  colourPickerColumns: number[]
  startLineColumns: number[]
  finishLineColumns: number[]
  floatingHeadingColumns: number[]
  confettiColumns: number[]
  decorationColumns: number[]
  infoZonePlacements?: BitmapPlacement[]
  collectiblePlacements?: BitmapPlacement[]
  colourPickerPlacements?: BitmapPlacement[]
  startLinePlacement?: BitmapPlacement | null
  finishLinePlacement?: BitmapPlacement | null
  floatingHeadingPlacement?: BitmapPlacement | null
  confettiPlacements?: BitmapPlacement[]
}

type ModeRows = {
  rows: RowData[]
  totalCounts: TotalCounts
}

type SectionSource = {
  file: string
  stage: Stage
  /** Optional aligned black/white mask for detached, non-collidable scenery. */
  decorationFile?: string
}

const PLATFORM_ROOT = path.join(process.cwd(), 'assets', 'platform')
const OUTPUT_PATH = path.join(process.cwd(), 'resources', 'rowsData.ts')
const MINIMAP_BASE_DIR = path.join(process.cwd(), 'public', 'maps')

// Approved Course draft C, in manifest order. Each chunk's scenery mask is parsed separately
// and never becomes collidable floor.
const RACE_SOURCES: SectionSource[] = [
  {
    file: 'race-lobby.png',
    stage: Stage.HOME,
    decorationFile: 'decoration/race-lobby.png',
  },
  {
    file: 'race-launch.png',
    stage: Stage.OBSTACLES,
    decorationFile: 'decoration/race-launch.png',
  },
  {
    file: 'race-sweeps.png',
    stage: Stage.OBSTACLES,
    decorationFile: 'decoration/race-sweeps.png',
  },
  {
    file: 'race-slalom.png',
    stage: Stage.OBSTACLES,
    decorationFile: 'decoration/race-slalom.png',
  },
  {
    file: 'race-recovery.png',
    stage: Stage.OBSTACLES,
    decorationFile: 'decoration/race-recovery.png',
  },
  {
    file: 'race-finale.png',
    stage: Stage.OBSTACLES,
    decorationFile: 'decoration/race-finale.png',
  },
  {
    file: 'race-sprint.png',
    stage: Stage.SPEED_RUN_FINISH,
    decorationFile: 'decoration/race-sprint.png',
  },
]

const MODE_SOURCES: Record<GameMode, SectionSource[]> = {
  [GameMode.SPEEDRUN]: RACE_SOURCES,
  [GameMode.DEV]: [
    { file: 'test.png', stage: Stage.HOME },
    { file: 'cta.png', stage: Stage.CTA },
  ],
}

const EXPECTED_RACE_COUNTS = {
  rows: 1247,
  rings: 60,
  startLines: 1,
  finishLines: 1,
  colourPickers: 1,
  infoZones: 0,
  collectibles: 0,
  headings: 0,
  confetti: 0,
  decorations: 682,
  floor: 17683,
  highlights: 2581,
} as const

const MAX_SIMULTANEOUS_PATHS = 3

const COLOUR_CODES = {
  VOID: [0, 0, 0] as const,
  RING: [255, 0, 0] as const,
  FLOATING_HEADING: [128, 128, 128] as const,
  INFO_ZONE: [0, 255, 0] as const,
  COLLECTIBLE: [0, 0, 255] as const,
  COLOUR_PICKER: [255, 128, 0] as const,
  HIGHLIGHT: [0, 255, 255] as const,
  START_LINE: [128, 0, 255] as const,
  FINISH_LINE: [255, 255, 0] as const,
  CONFETTI: [255, 0, 128] as const,
}

const NEIGHBOUR_OFFSETS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

const looksLikeVersion = (value: string) => /^\d+\.\d+\.\d+$/.test(value)

function isColour(r: number, g: number, b: number, [cr, cg, cb]: readonly number[]): boolean {
  return r === cr && g === cg && b === cb
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  const length = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < length; i++) {
    const aPart = partsA[i] ?? 0
    const bPart = partsB[i] ?? 0
    if (aPart !== bPart) return bPart - aPart
  }

  return 0
}

function findVersionDirectory(basePath: string): { version: string; directory: string } {
  const absoluteBase = path.resolve(basePath)
  if (!fs.existsSync(absoluteBase)) {
    throw new Error(`Platform root not found at ${absoluteBase}`)
  }
  const stat = fs.statSync(absoluteBase)
  if (!stat.isDirectory()) {
    throw new Error(`Platform root must be a directory: ${absoluteBase}`)
  }

  const baseName = path.basename(absoluteBase)
  if (looksLikeVersion(baseName)) {
    return { version: baseName, directory: absoluteBase }
  }

  const candidates = fs
    .readdirSync(absoluteBase, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  if (!candidates.length) {
    throw new Error(`No versioned platform folders found in ${absoluteBase}`)
  }

  const sorted = candidates.sort(compareVersions)
  const version = sorted[0]!
  return { version, directory: path.join(absoluteBase, version) }
}

function buildOutputFile({
  version,
  modes,
}: {
  version: string
  modes: Record<GameMode, ModeRows>
}): string {
  // Parse the generated rows from JSON rather than inlining a 1,200-row object literal.
  // TypeScript otherwise builds an unrepresentable union over every row literal, and the
  // generator's validation plus the runtime consumers already enforce the RowData shape.
  const speedRunRows = JSON.stringify(JSON.stringify(modes[GameMode.SPEEDRUN].rows))
  const speedRunCounts = JSON.stringify(modes[GameMode.SPEEDRUN].totalCounts)
  const devRows = JSON.stringify(JSON.stringify(modes[GameMode.DEV].rows))
  const devCounts = JSON.stringify(modes[GameMode.DEV].totalCounts)

  return `import { GameMode } from '@/stores/types'
import type { TotalCounts } from '@/stores/totalCounts'
import type { RowData } from '@/utils/tiles'
import { placeRowElementsOnTiles } from '@/utils/platform/placeRowElementsOnTiles'

export type PlatformModeData = {
  rows: RowData[]
  totalCounts: TotalCounts
}

export type PlatformRowsData = {
  version: string
  modes: Record<GameMode, PlatformModeData>
}

const SPEEDRUN_ROWS: RowData[] = JSON.parse(${speedRunRows})
const SPEEDRUN_COUNTS: TotalCounts = ${speedRunCounts}
const DEV_ROWS: RowData[] = JSON.parse(${devRows})
const DEV_COUNTS: TotalCounts = ${devCounts}

export const PLATFORM_DATA: PlatformRowsData = {
  version: '${version}',
  modes: {
    [GameMode.SPEEDRUN]: { rows: SPEEDRUN_ROWS.map(placeRowElementsOnTiles), totalCounts: SPEEDRUN_COUNTS },
    [GameMode.DEV]: { rows: DEV_ROWS.map(placeRowElementsOnTiles), totalCounts: DEV_COUNTS },
  },
}
export const PLATFORM_VERSION = PLATFORM_DATA.version
`
}

async function parseDecorationMaskFromFile(
  filePath: string,
  expectedHeight: number,
): Promise<number[][]> {
  const { data, info } = await sharp(filePath)
    .resize(COLUMNS, expectedHeight, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (info.width !== COLUMNS || info.height !== expectedHeight) {
    throw new Error(
      `Decoration mask ${filePath} is ${info.width}x${info.height}; expected ` +
        `${COLUMNS}x${expectedHeight}`,
    )
  }

  const decorationRows: number[][] = new Array(expectedHeight)

  for (let srcRow = 0; srcRow < expectedHeight; srcRow++) {
    const rowIndex = expectedHeight - 1 - srcRow
    const columns: number[] = []
    for (let column = 0; column < COLUMNS; column++) {
      const pixelIndex = (srcRow * COLUMNS + column) * 3
      const r = data[pixelIndex]
      const g = data[pixelIndex + 1]
      const b = data[pixelIndex + 2]
      if (!isColour(r, g, b, COLOUR_CODES.VOID)) columns.push(column)
    }
    decorationRows[rowIndex] = columns
  }

  return decorationRows
}

async function parseSectionBitmapFromFile(
  filePath: string,
  stage: Stage,
  totalCounts: TotalCounts,
  decorationFilePath?: string,
): Promise<RowData[]> {
  const image = sharp(filePath)
  const metadata = await image.metadata()
  const imageHeight = metadata.height
  const imageWidth = metadata.width

  if (!imageHeight || !imageWidth) {
    throw new Error(`Bitmap image missing dimensions: ${filePath}`)
  }

  const { data, info } = await image
    .resize(COLUMNS, imageHeight, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const width = info.width
  const height = info.height
  const channels = info.channels

  if (width !== COLUMNS) {
    throw new Error(`Expected resized width of ${COLUMNS}, got ${width} for ${filePath}`)
  }

  const decorationRows = decorationFilePath
    ? await parseDecorationMaskFromFile(decorationFilePath, height)
    : null

  const rows: BitmapRow[] = new Array(height)

  for (let srcRow = 0; srcRow < height; srcRow++) {
    const rowIndex = height - 1 - srcRow
    const raisedMask = new Array(width).fill(0) as (0 | 1)[]
    const ringColumns: number[] = []
    const infoZoneColumns: number[] = []
    const highlightColumns: number[] = []
    const collectibleColumns: number[] = []
    const colourPickerColumns: number[] = []
    const startLineColumns: number[] = []
    const finishLineColumns: number[] = []
    const floatingHeadingColumns: number[] = []
    const confettiColumns: number[] = []
    const decorationColumns = decorationRows?.[rowIndex] ?? []

    for (let column = 0; column < width; column++) {
      const pixelIndex = (srcRow * width + column) * channels
      const r = data[pixelIndex]
      const g = data[pixelIndex + 1]
      const b = data[pixelIndex + 2]

      const isRaised = !isColour(r, g, b, COLOUR_CODES.VOID)
      raisedMask[column] = isRaised ? 1 : 0

      if (isColour(r, g, b, COLOUR_CODES.RING)) ringColumns.push(column)
      if (isColour(r, g, b, COLOUR_CODES.INFO_ZONE)) infoZoneColumns.push(column)
      if (isColour(r, g, b, COLOUR_CODES.COLLECTIBLE)) collectibleColumns.push(column)
      if (isColour(r, g, b, COLOUR_CODES.COLOUR_PICKER)) colourPickerColumns.push(column)
      if (isColour(r, g, b, COLOUR_CODES.START_LINE)) startLineColumns.push(column)
      if (isColour(r, g, b, COLOUR_CODES.FINISH_LINE)) finishLineColumns.push(column)
      if (isColour(r, g, b, COLOUR_CODES.HIGHLIGHT)) highlightColumns.push(column)
      if (isColour(r, g, b, COLOUR_CODES.FLOATING_HEADING)) floatingHeadingColumns.push(column)
      if (isColour(r, g, b, COLOUR_CODES.CONFETTI)) confettiColumns.push(column)
    }

    rows[rowIndex] = {
      isRaised: raisedMask,
      ringColumns,
      infoZoneColumns,
      collectibleColumns,
      colourPickerColumns,
      startLineColumns,
      finishLineColumns,
      highlightColumns,
      floatingHeadingColumns,
      confettiColumns,
      decorationColumns,
    }
  }

  assignBitmapPlacements(
    rows,
    (row) => row.infoZoneColumns,
    (rowIndex, placements) => {
      if (!placements.length) return
      rows[rowIndex].infoZonePlacements = placements
    },
  )

  assignBitmapPlacements(
    rows,
    (row) => row.collectibleColumns,
    (rowIndex, placements) => {
      if (!placements.length) return
      rows[rowIndex].collectiblePlacements = placements
    },
  )

  assignBitmapPlacements(
    rows,
    (row) => row.colourPickerColumns,
    (rowIndex, placements) => {
      if (!placements.length) return
      rows[rowIndex].colourPickerPlacements = placements
    },
  )

  assignBitmapPlacements(
    rows,
    (row) => row.startLineColumns,
    (rowIndex, placements) => {
      rows[rowIndex].startLinePlacement = placements[0] ?? null
    },
  )

  assignBitmapPlacements(
    rows,
    (row) => row.finishLineColumns,
    (rowIndex, placements) => {
      rows[rowIndex].finishLinePlacement = placements[0] ?? null
    },
  )

  assignBitmapPlacements(
    rows,
    (row) => row.floatingHeadingColumns,
    (rowIndex, placements) => {
      rows[rowIndex].floatingHeadingPlacement = placements[0] ?? null
    },
  )

  assignBitmapPlacements(
    rows,
    (row) => row.confettiColumns,
    (rowIndex, placements) => {
      if (!placements.length) return
      rows[rowIndex].confettiPlacements = placements
    },
  )

  const totalRingsCount = rows.reduce((count, row) => count + row.ringColumns.length, 0)
  const totalStartLines = rows.filter((row) => row.startLinePlacement).length
  const totalFinishLines = rows.filter((row) => row.finishLinePlacement).length
  const totalDecorations = rows.reduce((count, row) => count + row.decorationColumns.length, 0)
  const rowData = buildRowDataFromBitmapRows({ rows, stage, globalIndexes: totalCounts })
  totalCounts.rings += totalRingsCount
  totalCounts.startLines += totalStartLines
  totalCounts.finishLines += totalFinishLines
  totalCounts.decorations += totalDecorations

  return rowData
}

type ColumnsAccessor = (row: BitmapRow) => number[]
type PlacementAssigner = (rowIndex: number, placements: BitmapPlacement[]) => void

function assignBitmapPlacements(
  rows: BitmapRow[],
  getColumns: ColumnsAccessor,
  assignPlacements: PlacementAssigner,
) {
  const rowCount = rows.length
  if (rowCount === 0) return

  const columnSets = rows.map((row) => new Set(getColumns(row)))
  const visited = new Set<string>()
  const placementsByRow = new Map<number, BitmapPlacement[]>()
  const keyFor = (row: number, column: number) => `${row}:${column}`

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const columns = columnSets[rowIndex]
    if (!columns.size) continue

    columns.forEach((column) => {
      const seedKey = keyFor(rowIndex, column)
      if (visited.has(seedKey)) return

      const stack: Array<{ row: number; column: number }> = [{ row: rowIndex, column }]
      const component: Array<{ row: number; column: number }> = []

      while (stack.length > 0) {
        const cell = stack.pop()!
        const cellKey = keyFor(cell.row, cell.column)
        if (visited.has(cellKey)) continue
        visited.add(cellKey)
        component.push(cell)

        for (const [dRow, dColumn] of NEIGHBOUR_OFFSETS) {
          const nextRow = cell.row + dRow
          if (nextRow < 0 || nextRow >= rowCount) continue
          const nextColumn = cell.column + dColumn
          if (!columnSets[nextRow].has(nextColumn)) continue
          stack.push({ row: nextRow, column: nextColumn })
        }
      }

      if (!component.length) return

      let minRow = Infinity
      let maxRow = -Infinity
      let minColumn = Infinity
      let maxColumn = -Infinity
      const rowsInComponent = new Set<number>()

      for (const { row, column: col } of component) {
        rowsInComponent.add(row)
        if (row < minRow) minRow = row
        if (row > maxRow) maxRow = row
        if (col < minColumn) minColumn = col
        if (col > maxColumn) maxColumn = col
      }

      const centerRow = (minRow + maxRow) * 0.5
      const centerColumn = Math.round((minColumn + maxColumn) / 2)

      rowsInComponent.forEach((row) => {
        const placements = placementsByRow.get(row) ?? []
        placements.push({
          columnIndex: centerColumn,
          zOffset: (row - centerRow) * TILE_SIZE,
        })
        placementsByRow.set(row, placements)
      })
    })
  }

  placementsByRow.forEach((placements, rowIndex) => {
    placements.sort((a, b) => a.columnIndex - b.columnIndex)
    assignPlacements(rowIndex, placements)
  })
}

function buildRowDataFromBitmapRows({
  rows,
  stage,
  globalIndexes,
}: {
  rows: BitmapRow[]
  stage: Stage
  globalIndexes: TotalCounts
}): RowData[] {
  const rowCount = rows.length
  if (rowCount <= 0) return []

  const rowData: RowData[] = new Array(rowCount)

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const layoutRow = rows[rowIndex]

    const baseRow: RowData = {
      isRaised: layoutRow.isRaised,
      stage,
      isSectionStart: rowIndex === 0,
      isSectionEnd: rowIndex === rowCount - 1,
      isHighlighted: new Array<number>(COLUMNS).fill(0),
      rowIndex: globalIndexes.rows,
    }

    globalIndexes.rows++

    applyRingColumns(baseRow, layoutRow.ringColumns)
    applyInfoColumns(baseRow, layoutRow, globalIndexes)
    applyCollectiblePlacements(baseRow, layoutRow, globalIndexes)
    applyColourPickerPlacement(baseRow, layoutRow, globalIndexes)
    applyStartLineColumn(baseRow, layoutRow)
    applyFinishLineColumn(baseRow, layoutRow)
    applyFloatingHeadingPlacement(baseRow, layoutRow, globalIndexes)
    applyHighlightColumns(baseRow, layoutRow.highlightColumns)
    applyDecorationColumns(baseRow, layoutRow.decorationColumns)
    applyConfettiPlacements(baseRow, layoutRow, globalIndexes)

    rowData[rowIndex] = baseRow
  }

  return rowData
}

function applyRingColumns(row: RowData, columns?: number[]) {
  if (!columns || columns.length === 0) return
  const rings = new Array<number>(COLUMNS).fill(0) as (0 | 1)[]
  columns.forEach((columnIndex) => {
    if (columnIndex < 0 || columnIndex >= COLUMNS) return
    rings[columnIndex] = 1
  })
  row.rings = rings
}

function applyInfoColumns(row: RowData, layoutRow: BitmapRow, globalIndexes: TotalCounts) {
  const placements =
    buildPlacementsFromBitmap(
      layoutRow.infoZonePlacements,
      ON_TILE_Y,
      'infoZones',
      globalIndexes,
    ) ??
    buildPlacementsFromColumns(layoutRow.infoZoneColumns, ON_TILE_Y, 'infoZones', globalIndexes)

  if (placements?.length) {
    row.infoZonePlacements = placements
  }
}

function applyCollectiblePlacements(
  row: RowData,
  layoutRow: BitmapRow,
  globalIndexes: TotalCounts,
) {
  const placements =
    buildPlacementsFromBitmap(
      layoutRow.collectiblePlacements,
      ON_TILE_Y,
      'collectibles',
      globalIndexes,
    ) ??
    buildPlacementsFromColumns(
      layoutRow.collectibleColumns,
      ON_TILE_Y,
      'collectibles',
      globalIndexes,
    )

  if (placements?.length) {
    row.collectiblePlacements = placements
  }
}

function applyColourPickerPlacement(
  row: RowData,
  layoutRow: BitmapRow,
  globalIndexes: TotalCounts,
) {
  const placements =
    buildPlacementsFromBitmap(
      layoutRow.colourPickerPlacements,
      ON_TILE_Y,
      'colourPickers',
      globalIndexes,
    ) ??
    buildPlacementsFromColumns(
      layoutRow.colourPickerColumns,
      ON_TILE_Y,
      'colourPickers',
      globalIndexes,
    )

  if (placements?.length) {
    row.colourPickerPlacement = placements[0]
  }
}

function applyStartLineColumn(row: RowData, layoutRow: BitmapRow) {
  const placement = layoutRow.startLinePlacement
  if (placement) {
    const { columnIndex, zOffset } = placement
    if (columnIndex < 0 || columnIndex >= COLUMNS) return
    row.startLinePosition = [colToX(columnIndex), ON_TILE_Y, zOffset]
    return
  }

  const fallbackColumn = layoutRow.startLineColumns[0] ?? null
  if (fallbackColumn == null || fallbackColumn < 0 || fallbackColumn >= COLUMNS) return
  row.startLinePosition = [colToX(fallbackColumn), ON_TILE_Y, 0]
}

function applyFinishLineColumn(row: RowData, layoutRow: BitmapRow) {
  const placement = layoutRow.finishLinePlacement
  if (placement) {
    const { columnIndex, zOffset } = placement
    if (columnIndex < 0 || columnIndex >= COLUMNS) return
    row.finishLinePosition = [colToX(columnIndex), ON_TILE_Y, zOffset]
    return
  }

  const fallbackColumn = layoutRow.finishLineColumns[0] ?? null
  if (fallbackColumn == null || fallbackColumn < 0 || fallbackColumn >= COLUMNS) return
  row.finishLinePosition = [colToX(fallbackColumn), ON_TILE_Y, 0]
}

function applyDecorationColumns(row: RowData, columns?: number[]) {
  if (!columns || columns.length === 0) return
  row.decorationColumns = columns.filter(
    (columnIndex) => columnIndex >= 0 && columnIndex < COLUMNS,
  )
}

function applyHighlightColumns(row: RowData, columns?: number[]) {
  if (!columns || columns.length === 0) return
  const highlights = row.isHighlighted ?? new Array<number>(COLUMNS).fill(0)
  columns.forEach((columnIndex) => {
    if (columnIndex < 0 || columnIndex >= COLUMNS) return
    highlights[columnIndex] = 1
  })
  row.isHighlighted = highlights
}

function applyFloatingHeadingPlacement(
  row: RowData,
  layoutRow: BitmapRow,
  globalIndexes: TotalCounts,
) {
  const placement = layoutRow.floatingHeadingPlacement
  if (!placement) return
  const { columnIndex, zOffset } = placement
  const indexedPlacement = createIndexedPlacement(
    columnIndex,
    zOffset,
    HEADING_Y,
    'headings',
    globalIndexes,
  )
  if (indexedPlacement) {
    row.floatingHeadingPlacements = [indexedPlacement]
  }
}

function applyConfettiPlacements(
  row: RowData,
  layoutRow: BitmapRow,
  globalIndexes: TotalCounts,
) {
  const placements =
    buildConfettiPlacementsFromBitmap(layoutRow, globalIndexes) ??
    buildConfettiPlacementsFromColumns(layoutRow, globalIndexes)

  if (placements?.length) {
    row.confettiPlacements = placements
  }
}

type PlacementCountKey =
  | 'headings'
  | 'infoZones'
  | 'collectibles'
  | 'confetti'
  | 'colourPickers'

function buildPlacementsFromBitmap(
  placements: BitmapPlacement[] | undefined,
  y: number,
  indexKey: PlacementCountKey,
  globalIndexes: TotalCounts,
): IndexedPlacement[] | undefined {
  if (!placements?.length) return undefined
  const indexedPlacements: IndexedPlacement[] = []
  placements.forEach(({ columnIndex, zOffset }) => {
    const placement = createIndexedPlacement(columnIndex, zOffset, y, indexKey, globalIndexes)
    if (placement) {
      indexedPlacements.push(placement)
    }
  })
  return indexedPlacements.length > 0 ? indexedPlacements : undefined
}

function buildConfettiPlacementsFromBitmap(
  layoutRow: BitmapRow,
  globalIndexes: TotalCounts,
): RowData['confettiPlacements'] | undefined {
  const placements = layoutRow.confettiPlacements
  if (!placements?.length) return undefined

  const raisedSpan = getRaisedSpanForRow(layoutRow.isRaised)
  if (!raisedSpan) return undefined

  const confettiPlacements: RowData['confettiPlacements'] = []
  placements.forEach(({ zOffset }) => {
    const placement = createConfettiPlacement({
      zOffset,
      raisedSpan,
      globalIndexes,
    })
    if (placement) {
      confettiPlacements.push(placement)
    }
  })
  return confettiPlacements.length > 0 ? confettiPlacements : undefined
}

function buildConfettiPlacementsFromColumns(
  layoutRow: BitmapRow,
  globalIndexes: TotalCounts,
): RowData['confettiPlacements'] | undefined {
  const { confettiColumns } = layoutRow
  if (!confettiColumns?.length) return undefined

  const raisedSpan = getRaisedSpanForRow(layoutRow.isRaised)
  if (!raisedSpan) return undefined

  const placement = createConfettiPlacement({
    zOffset: 0,
    raisedSpan,
    globalIndexes,
  })

  return placement ? [placement] : undefined
}

function createConfettiPlacement({
  zOffset,
  raisedSpan,
  globalIndexes,
}: {
  zOffset: number
  raisedSpan: { centerX: number; width: number; depth: number }
  globalIndexes: TotalCounts
}): ConfettiPlacement | null {
  const contentIndex = globalIndexes.confetti
  globalIndexes.confetti += 1

  return {
    position: [raisedSpan.centerX, ON_TILE_Y, zOffset],
    width: raisedSpan.width,
    depth: raisedSpan.depth,
    contentIndex,
  }
}

function getRaisedSpanForRow(
  raisedMask: (0 | 1)[],
): { centerX: number; width: number; depth: number } | null {
  let minColumn = Infinity
  let maxColumn = -Infinity

  raisedMask.forEach((value, columnIndex) => {
    if (value !== 1) return
    if (columnIndex < minColumn) minColumn = columnIndex
    if (columnIndex > maxColumn) maxColumn = columnIndex
  })

  if (!Number.isFinite(minColumn) || !Number.isFinite(maxColumn)) return null

  const centerColumn = (minColumn + maxColumn) * 0.5
  const width = (maxColumn - minColumn + 1) * TILE_SIZE

  return {
    centerX: colToX(centerColumn),
    width,
    depth: CONFETTI_ROW_DEPTH,
  }
}

function buildPlacementsFromColumns(
  columns: number[] | undefined,
  y: number,
  indexKey: PlacementCountKey,
  globalIndexes: TotalCounts,
): IndexedPlacement[] | undefined {
  if (!columns?.length) return undefined
  const indexedPlacements: IndexedPlacement[] = []
  columns.forEach((columnIndex) => {
    const placement = createIndexedPlacement(columnIndex, 0, y, indexKey, globalIndexes)
    if (placement) {
      indexedPlacements.push(placement)
    }
  })
  return indexedPlacements.length > 0 ? indexedPlacements : undefined
}

function createIndexedPlacement(
  columnIndex: number,
  zOffset: number,
  y: number,
  indexKey: PlacementCountKey,
  globalIndexes: TotalCounts,
): IndexedPlacement | null {
  if (columnIndex < 0 || columnIndex >= COLUMNS) return null
  const placementIndex = globalIndexes[indexKey] ?? 0
  globalIndexes[indexKey] = placementIndex + 1
  const placement: IndexedPlacement = [colToX(columnIndex), y, zOffset, placementIndex]
  return placement
}

async function buildModeData(
  versionDirectory: string,
  sources: SectionSource[],
): Promise<ModeRows> {
  const totalCounts = createTotalCounts()
  const rows: RowData[] = []

  for (const source of sources) {
    const filePath = path.join(versionDirectory, source.file)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing platform bitmap: ${filePath}`)
    }
    const decorationFilePath = source.decorationFile
      ? path.join(versionDirectory, source.decorationFile)
      : undefined
    if (decorationFilePath && !fs.existsSync(decorationFilePath)) {
      throw new Error(`Missing decoration mask: ${decorationFilePath}`)
    }
    const parsedRows = await parseSectionBitmapFromFile(
      filePath,
      source.stage,
      totalCounts,
      decorationFilePath,
    )
    rows.push(...parsedRows)
  }

  return { rows, totalCounts }
}

function countRaisedIntervals(isRaised: readonly number[]): number {
  let intervals = 0
  let wasRaised = false
  for (const cell of isRaised) {
    const isRaisedCell = cell === 1
    if (isRaisedCell && !wasRaised) intervals += 1
    wasRaised = isRaisedCell
  }
  return intervals
}

function collectFloorCells(rows: readonly RowData[]): Set<number> {
  const floorCells = new Set<number>()
  rows.forEach((row, rowIndex) => {
    row.isRaised.forEach((cell, columnIndex) => {
      if (cell === 1) floorCells.add(rowIndex * COLUMNS + columnIndex)
    })
  })
  return floorCells
}

function assertConnectedFloor(rows: readonly RowData[]) {
  const floorCells = collectFloorCells(rows)
  if (!floorCells.size) throw new Error('Race course has no playable floor')

  const startCell = 0 * COLUMNS + Math.floor(COLUMNS / 2)
  if (!floorCells.has(startCell)) {
    throw new Error('Lobby does not support the centre spawn column')
  }

  const visited = new Set<number>([startCell])
  const queue: number[] = [startCell]

  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index]
    const rowIndex = Math.floor(cell / COLUMNS)
    const columnIndex = cell % COLUMNS
    const neighbours: Array<[number, number]> = [
      [rowIndex - 1, columnIndex],
      [rowIndex + 1, columnIndex],
      [rowIndex, columnIndex - 1],
      [rowIndex, columnIndex + 1],
    ]
    for (const [nextRow, nextColumn] of neighbours) {
      if (nextRow < 0 || nextRow >= rows.length) continue
      if (nextColumn < 0 || nextColumn >= COLUMNS) continue
      const nextCell = nextRow * COLUMNS + nextColumn
      if (!floorCells.has(nextCell) || visited.has(nextCell)) continue
      visited.add(nextCell)
      queue.push(nextCell)
    }
  }

  if (visited.size !== floorCells.size) {
    throw new Error(
      `Race floor is disconnected: ${visited.size} of ${floorCells.size} cells reachable`,
    )
  }
}

function assertDecorationIsolation(rows: readonly RowData[]) {
  rows.forEach((row, rowIndex) => {
    ;(row.decorationColumns ?? []).forEach((columnIndex) => {
      if (row.isRaised[columnIndex] === 1) {
        throw new Error(`Decoration overlaps playable floor at row ${rowIndex}, column ${columnIndex}`)
      }
      if (row.rings?.[columnIndex] === 1) {
        throw new Error(`Decoration carries a ring at row ${rowIndex}, column ${columnIndex}`)
      }
      for (const direction of [-1, 1]) {
        for (const offset of [1, 2]) {
          const nearbyColumn = columnIndex + direction * offset
          if (nearbyColumn < 0 || nearbyColumn >= COLUMNS) continue
          if (row.isRaised[nearbyColumn] === 1) {
            throw new Error(
              `Decoration at row ${rowIndex}, column ${columnIndex} is not separated ` +
                `from playable floor by two empty columns`,
            )
          }
        }
      }
    })
  })
}

function assertLineFootprintSupport(
  rows: readonly RowData[],
  label: 'START' | 'FINISH',
  position: readonly [number, number, number],
  rowIndex: number,
) {
  const columnIndex = worldXToColumn(position[0])
  for (let rowOffset = -2; rowOffset <= 2; rowOffset++) {
    const footprintRow = rows[rowIndex + rowOffset]
    if (!footprintRow) {
      throw new Error(`${label} line extends past the course at row ${rowIndex + rowOffset}`)
    }
    for (let columnOffset = -4; columnOffset <= 4; columnOffset++) {
      const footprintColumn = columnIndex + columnOffset
      if (footprintColumn < 0 || footprintColumn >= COLUMNS) {
        throw new Error(`${label} line extends outside the bitmap columns`)
      }
      if (footprintRow.isRaised[footprintColumn] !== 1) {
        throw new Error(
          `${label} line lacks floor support at row ${rowIndex + rowOffset}, ` +
            `column ${footprintColumn}`,
        )
      }
    }
  }
}

function validateRaceMode({ rows, totalCounts }: ModeRows) {
  const expected = EXPECTED_RACE_COUNTS
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'floor' || key === 'highlights') continue
    const actual = totalCounts[key as keyof TotalCounts]
    if (actual !== value) {
      throw new Error(`Race course expected ${key}=${value}; generated ${actual}`)
    }
  }

  const floorCount = rows.reduce(
    (count, row) => count + row.isRaised.filter((cell) => cell === 1).length,
    0,
  )
  if (floorCount !== expected.floor) {
    throw new Error(`Race course expected floor=${expected.floor}; generated ${floorCount}`)
  }

  const highlightCount = rows.reduce(
    (count, row) => count + (row.isHighlighted?.filter((cell) => cell === 1).length ?? 0),
    0,
  )
  if (highlightCount !== expected.highlights) {
    throw new Error(
      `Race course expected highlights=${expected.highlights}; generated ${highlightCount}`,
    )
  }

  rows.forEach((row, rowIndex) => {
    const intervals = countRaisedIntervals(row.isRaised)
    if (intervals > MAX_SIMULTANEOUS_PATHS) {
      throw new Error(`Race course has ${intervals} simultaneous paths at row ${rowIndex}`)
    }
    ;(row.rings ?? []).forEach((hasRing, columnIndex) => {
      if (hasRing && row.isRaised[columnIndex] !== 1) {
        throw new Error(`Ring is unsupported at row ${rowIndex}, column ${columnIndex}`)
      }
    })
  })

  const startMarkers = rows.flatMap((row, rowIndex) =>
    row.startLinePosition ? [{ rowIndex, position: row.startLinePosition }] : [],
  )
  const finishMarkers = rows.flatMap((row, rowIndex) =>
    row.finishLinePosition ? [{ rowIndex, position: row.finishLinePosition }] : [],
  )

  if (startMarkers.length !== 1) {
    throw new Error(`Race course expected exactly one START marker; found ${startMarkers.length}`)
  }
  if (finishMarkers.length !== 1) {
    throw new Error(
      `Race course expected exactly one FINISH marker; found ${finishMarkers.length}`,
    )
  }

  const [startMarker] = startMarkers
  const [finishMarker] = finishMarkers
  if (startMarker.rowIndex >= finishMarker.rowIndex) {
    throw new Error(
      `START marker (row ${startMarker.rowIndex}) must come before FINISH marker ` +
        `(row ${finishMarker.rowIndex})`,
    )
  }

  const startColumn = worldXToColumn(startMarker.position[0])
  const finishColumn = worldXToColumn(finishMarker.position[0])
  if (rows[startMarker.rowIndex].isRaised[startColumn] !== 1) {
    throw new Error('START marker is not on playable floor')
  }
  if (rows[finishMarker.rowIndex].isRaised[finishColumn] !== 1) {
    throw new Error('FINISH marker is not on playable floor')
  }

  assertLineFootprintSupport(rows, 'START', startMarker.position, startMarker.rowIndex)
  assertLineFootprintSupport(rows, 'FINISH', finishMarker.position, finishMarker.rowIndex)
  assertDecorationIsolation(rows)
  assertConnectedFloor(rows)

  console.log(
    `🏁 Validated ${rows.length} rows, ${floorCount} floor cells, ` +
      `${totalCounts.rings} rings, ${totalCounts.decorations} scenery cells`,
  )
}

function writeMiniMapAssets(modes: Record<GameMode, ModeRows>, version: string) {
  const miniMapVersionDir = path.join(MINIMAP_BASE_DIR, version)
  fs.mkdirSync(miniMapVersionDir, { recursive: true })

  const modeEntries = Object.entries(modes) as Array<[GameMode, ModeRows]>
  modeEntries.forEach(([mode, modeRows]) => {
    const outputPath = path.join(miniMapVersionDir, `${mode}.svg`)
    const { width, height } = writeMiniMapSVG({
      rows: modeRows.rows,
      columns: COLUMNS,
      tileSize: MINI_MAP_CONSTANTS.TILE_SIZE_PX,
      outputPath,
    })
    console.log(`🗺️  Generated mini map for ${mode} (${width}x${height}) at ${outputPath}`)
  })
}

async function main() {
  const { version, directory } = findVersionDirectory(PLATFORM_ROOT)

  console.log(`🛠️  Generating platform rows for version ${version}`)

  const modes: Record<GameMode, ModeRows> = {
    [GameMode.SPEEDRUN]: await buildModeData(directory, MODE_SOURCES[GameMode.SPEEDRUN]),
    [GameMode.DEV]: await buildModeData(directory, MODE_SOURCES[GameMode.DEV]),
  }

  validateRaceMode(modes[GameMode.SPEEDRUN])
  const architecturePath = path.join(directory, 'architecture/recovery.png')
  const architectureImage = await sharp(architecturePath).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const pillars = parseArchitecture(architectureImage.data, architectureImage.info.width, architectureImage.info.height)
  validateArchitectureClearance(pillars, modes[GameMode.SPEEDRUN].rows)
  const preview = architecturePreview(pillars, modes[GameMode.SPEEDRUN].rows)
  fs.writeFileSync(path.join(process.cwd(), 'docs/race-course/recovery-pillars.svg'), preview)
  await sharp(Buffer.from(preview)).png().toFile(path.join(process.cwd(), 'docs/race-course/recovery-pillars.png'))
  fs.writeFileSync(path.join(process.cwd(), 'resources/recoveryPillars.json'), JSON.stringify(pillars, null, 2) + '\n')

  const coursePillars = createCoursePillars(pillars, modes[GameMode.SPEEDRUN].rows)
  validateArchitectureClearance(coursePillars, modes[GameMode.SPEEDRUN].rows)
  fs.writeFileSync(path.join(process.cwd(), 'resources/coursePillars.json'), JSON.stringify(coursePillars, null, 2) + '\n')

  writeMiniMapAssets(modes, version)

  const output = buildOutputFile({ version, modes })
  fs.writeFileSync(OUTPUT_PATH, output)

  console.log(`✅ Wrote platform rows to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error('❌ Failed to generate platform rows')
  console.error(error)
  process.exit(1)
})
