import { z } from 'zod'
import { COLOUR_PICKER_COLUMN_OFFSETS } from '../platform/homeSection'
import {
  CYLINDER_SURFACE,
  findSolidColumnArc,
  type ColumnArc,
  type CourseSurface,
} from '../platform/courseSurface'

export const COURSE_SECTIONS = [
  ['race-lobby', 32, 1], ['race-launch', 180, 3], ['race-sweeps', 200, 3],
  ['race-slalom', 220, 3], ['race-recovery', 160, 3], ['race-finale', 260, 3],
  ['race-sprint', 195, 5],
] as const
export const COURSE_COLUMNS = 132
export const OBJECT_TYPES = ['ring', 'start', 'finish', 'paintShop'] as const
export const MAX_CONFETTI_ROW_WIDTH = 16
export type ObjectKind = typeof OBJECT_TYPES[number]
export type Layer = 'floor' | 'ghosts' | 'highlights' | 'objects' | 'confetti'
export type Cell = { row: number; column: number }
const column = z.number().int().min(0).max(COURSE_COLUMNS - 1)
const columns = z.array(column).max(COURSE_COLUMNS).refine(values => new Set(values).size === values.length, 'Duplicate columns')
export const courseDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  surface: z.object({ topology: z.literal('cylinder'), columns: z.literal(COURSE_COLUMNS) }).strict(),
  sections: z.array(z.object({
    id: z.string(), stage: z.number().int(),
    rows: z.array(z.object({
      floor: columns, ghosts: columns, highlights: columns,
      confetti: z.array(column).max(1, 'Only one confetti marker per row').optional(),
      objects: z.array(z.object({ column, type: z.enum(OBJECT_TYPES) }).strict()).max(COURSE_COLUMNS)
        .refine(values => new Set(values.map(value => value.column)).size === values.length, 'Only one object per cell'),
    }).strict()).max(260),
  }).strict()).length(COURSE_SECTIONS.length),
}).strict().superRefine((document, context) => {
  document.sections.forEach((section, index) => {
    const [id, length, stage] = COURSE_SECTIONS[index]
    if (section.id !== id || section.rows.length !== length || section.stage !== stage) {
      context.addIssue({ code: 'custom', path: ['sections', index], message: `Section must remain ${id}, ${length} rows, stage ${stage}` })
    }
  })
})
export type CourseDocument = z.infer<typeof courseDocumentSchema>
export type CourseRow = CourseDocument['sections'][number]['rows'][number]
export type CourseIssue = Cell & { message: string }
export const courseRows = (document: CourseDocument): CourseRow[] => document.sections.flatMap(section => section.rows)
export const wrapColumn = (column: number) => ((column % COURSE_COLUMNS) + COURSE_COLUMNS) % COURSE_COLUMNS
export const isSolid = (row: CourseRow | undefined, column: number): boolean => !!row && row.floor.includes(wrapColumn(column)) && !row.ghosts.includes(wrapColumn(column))

const solidColumns = (row: CourseRow): number[] =>
  row.floor.filter(column => !row.ghosts.includes(column))

/** The burst span the compiler will use for a confetti row. */
export const confettiRowArc = (
  row: CourseRow,
  surface: CourseSurface = CYLINDER_SURFACE,
): ColumnArc | null =>
  findSolidColumnArc(solidColumns(row), surface.columns, surface.topology)

export const canPlaceConfetti = (
  row: CourseRow,
  surface: CourseSurface = CYLINDER_SURFACE,
): boolean => {
  const arc = confettiRowArc(row, surface)
  return !!arc && arc.width <= MAX_CONFETTI_ROW_WIDTH
}

export function validateCourse(document: CourseDocument): CourseIssue[] {
  const rows = courseRows(document)
  const issues: CourseIssue[] = []
  const markers = new Map<ObjectKind, Cell[]>()
  const report = (row: number, column: number, message: string) => issues.push({ row, column: wrapColumn(column), message })
  rows.forEach((row, rowIndex) => {
    row.objects.forEach(object => {
      const cells = markers.get(object.type) ?? []
      cells.push({ row: rowIndex, column: object.column })
      markers.set(object.type, cells)
      if (!isSolid(row, object.column)) report(rowIndex, object.column, `${object.type} needs solid floor`)
      const firstColumn = object.type === 'paintShop' ? COLOUR_PICKER_COLUMN_OFFSETS[0] : -4
      const lastColumn = object.type === 'paintShop' ? COLOUR_PICKER_COLUMN_OFFSETS.at(-1)! : 4
      const firstRow = object.type === 'paintShop' ? 0 : -2
      const lastRow = object.type === 'paintShop' ? 0 : 2
      if (object.type === 'ring') return
      for (let offsetRow = firstRow; offsetRow <= lastRow; offsetRow++) {
        for (let offsetColumn = firstColumn; offsetColumn <= lastColumn; offsetColumn++) {
          if (!isSolid(rows[rowIndex + offsetRow], object.column + offsetColumn)) {
            report(rowIndex, object.column, `${object.type} footprint needs solid floor`)
            return
          }
        }
      }
    })
    if (row.confetti?.length) {
      const arc = confettiRowArc(row, document.surface)
      if (!arc) report(rowIndex, row.confetti[0], 'Confetti row needs solid floor')
      else if (arc.width > MAX_CONFETTI_ROW_WIDTH) {
        report(rowIndex, row.confetti[0], `Confetti rows must be at most ${MAX_CONFETTI_ROW_WIDTH} tiles wide`)
      }
    }
  })
  for (const kind of ['start', 'finish', 'paintShop'] as const) {
    if (markers.get(kind)?.length !== 1) report(0, 66, `Place exactly one ${kind}`)
  }
  const start = markers.get('start')?.[0]
  const finish = markers.get('finish')?.[0]
  const shop = markers.get('paintShop')?.[0]
  if (start && finish && start.row >= finish.row) report(start.row, start.column, 'Start must precede finish')
  if (start && start.row < 3) report(start.row, start.column, 'Start needs three lobby rows before it')
  if (start && shop && shop.row >= start.row - 2) report(shop.row, shop.column, 'Paint shop must be before the start footprint')
  // These are the existing initial and cancel-to-lobby spawn cells.
  for (const row of [0, 22]) if (!isSolid(rows[row], 66)) report(row, 66, 'Keep the lobby spawn supported')
  const floor = new Set<number>()
  rows.forEach((row, index) => row.floor.forEach(column => {
    if (!row.ghosts.includes(column)) floor.add(index * COURSE_COLUMNS + column)
  }))
  const visited = new Set<number>()
  const queue = floor.has(66) ? [66] : []
  if (queue.length) visited.add(66)
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index]
    const row = Math.floor(cell / COURSE_COLUMNS)
    const column = cell % COURSE_COLUMNS
    for (const [nextRow, nextColumn] of [[row - 1, column], [row + 1, column], [row, wrapColumn(column - 1)], [row, wrapColumn(column + 1)]]) {
      const next = nextRow * COURSE_COLUMNS + nextColumn
      if (nextRow < 0 || nextRow >= rows.length || visited.has(next) || !floor.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  if (visited.size !== floor.size) {
    const cell = [...floor].find(cell => !visited.has(cell)) ?? 66
    report(Math.floor(cell / COURSE_COLUMNS), cell % COURSE_COLUMNS, 'Solid floor must connect to the lobby')
  }
  return issues
}

export type Paint = { layer: Layer; erase: boolean; object: ObjectKind }

const withConfettiMarker = (row: CourseRow, column: number): CourseRow =>
  row.confetti?.length ? row : { ...row, confetti: [column] }

const withoutConfettiMarker = (row: CourseRow): CourseRow => {
  if (!row.confetti) return row
  const nextRow = { ...row }
  delete nextRow.confetti
  return nextRow
}

export function paintCells(document: CourseDocument, cells: readonly Cell[], paint: Paint): CourseDocument {
  const targets = new Map<number, Set<number>>()
  for (const cell of cells) {
    const columns = targets.get(cell.row) ?? new Set<number>()
    columns.add(wrapColumn(cell.column))
    targets.set(cell.row, columns)
  }
  // Confetti is a row-level burst, so only the marker's row matters; the last cell wins.
  const confettiMarkers = new Map<number, number>()
  if (paint.layer === 'confetti') {
    for (const cell of cells) confettiMarkers.set(cell.row, wrapColumn(cell.column))
  }
  const singleton = paint.layer === 'objects' && !paint.erase && paint.object !== 'ring'
  const last = cells.at(-1)
  let globalRow = 0
  return { ...document, sections: document.sections.map(section => ({ ...section, rows: section.rows.map(row => {
    const rowIndex = globalRow++
    if (paint.layer === 'confetti') {
      const markerColumn = confettiMarkers.get(rowIndex)
      if (markerColumn == null) return row
      if (paint.erase) return withoutConfettiMarker(row)
      if (!canPlaceConfetti(row, document.surface)) return row
      return withConfettiMarker(row, markerColumn)
    }
    const columns = targets.get(rowIndex)
    if (paint.layer === 'objects') {
      let objects = row.objects.filter(object => !(singleton && object.type === paint.object))
      const placements = singleton ? (last?.row === rowIndex ? [wrapColumn(last.column)] : []) : [...(columns ?? [])]
      if (placements.length) {
        objects = objects.filter(object => !placements.includes(object.column))
        if (!paint.erase) objects = [...objects, ...placements.map(column => ({ column, type: paint.object }))]
      }
      return objects.length === row.objects.length && objects.every((object, index) => object === row.objects[index]) ? row : { ...row, objects }
    }
    if (!columns) return row
    const values = new Set(row[paint.layer])
    for (const column of columns) { if (paint.erase) values.delete(column); else values.add(column) }
    return { ...row, [paint.layer]: [...values].sort((a, b) => a - b) }
  }) })) }
}

export function brushCells(from: Cell, to: Cell, size: number, rectangle = false): Cell[] {
  const cells: Cell[] = []
  if (rectangle) {
    for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row++) {
      for (let column = Math.min(from.column, to.column); column <= Math.max(from.column, to.column); column++) cells.push({ row, column })
    }
    return cells
  }
  const steps = Math.max(Math.abs(to.row - from.row), Math.abs(to.column - from.column), 1)
  const radius = Math.floor(size / 2)
  for (let step = 0; step <= steps; step++) {
    const row = Math.round(from.row + (to.row - from.row) * step / steps)
    const column = Math.round(from.column + (to.column - from.column) * step / steps)
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) cells.push({ row: row + y, column: column + x })
  }
  return cells
}

export type History = { past: CourseDocument[]; present: CourseDocument; future: CourseDocument[] }
export function editHistory(history: History, next: CourseDocument): History {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history
  return { past: [...history.past.slice(-49), history.present], present: next, future: [] }
}
export function undo(history: History): History {
  const previous = history.past.at(-1)
  return previous ? { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] } : history
}
export function redo(history: History): History {
  const next = history.future[0]
  return next ? { past: [...history.past, history.present], present: next, future: history.future.slice(1) } : history
}
