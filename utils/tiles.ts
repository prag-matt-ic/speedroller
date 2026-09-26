import { Stage } from '@/stores/types'

// Tile dimensions
export const TILE_SIZE = 1.0
export const TILE_THICKNESS = 0.08
export const PLATFORM_BATCH_ROWS = 16
export const INITIAL_ROW_START_Z = 3.5 * TILE_SIZE

/** Row coordinates are permanent; forward travel decreases world Z. */
export const rowToWorldZ = (rowIndex: number): number =>
  INITIAL_ROW_START_Z - rowIndex * TILE_SIZE

/** Nearest course row, including when the player falls beyond either end. */
export const worldZToRowIndex = (worldZ: number, rowCount: number): number => {
  if (rowCount === 0) return -1
  return Math.max(0, Math.min(rowCount - 1, Math.round((INITIAL_ROW_START_Z - worldZ) / TILE_SIZE)))
}
export const TILE_PLAYER_HIGHLIGHT_ROW_COUNT = 4
export const TILE_PLAYER_FADE_FULL_ROWS = 8
export const TILE_PLAYER_FADE_MIN_ROWS = 18
export const TILE_PLAYER_FADE_MIN_ALPHA = 0
export const TILE_PLAYER_HIGHLIGHT_RADIUS = TILE_PLAYER_HIGHLIGHT_ROW_COUNT * TILE_SIZE
export const TILE_PLAYER_FADE_FULL_RADIUS = TILE_PLAYER_FADE_FULL_ROWS * TILE_SIZE
export const TILE_PLAYER_FADE_MIN_RADIUS = TILE_PLAYER_FADE_MIN_ROWS * TILE_SIZE

export const ELEMENT_FADE_DISTANCE = 23 * TILE_SIZE

export const EPSILON = {
  SMALL: 1e-6,
  TINY: 1e-4,
} as const

// Grid configuration
export const COLUMNS = 33 // odd number so that there is a center column

// Heights
export const RAISED_Y = -TILE_SIZE / 2

export const CONFETTI_ROW_DEPTH = TILE_SIZE

// Y value for elements placed directly on top of tiles
export const ON_TILE_Y = RAISED_Y + TILE_THICKNESS * 0.5 + 0.005

// Convert a grid column index (can be fractional for centers) to world X.
export const colToX = (col: number): number => (col - COLUMNS / 2 + 0.5) * TILE_SIZE

export function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Row index to columns with rings
export type RingLayout = Record<number, number[]>

export type IndexedPlacement = readonly [number, number, number, number]

export type ConfettiPlacement = {
  position: [number, number, number]
  width: number
  depth: number
  contentIndex: number
}

export type RowData = {
  isRaised: (0 | 1)[]
  stage: Stage
  isSectionStart: boolean
  isSectionEnd: boolean
  rowIndex?: number
  rings?: (0 | 1)[]
  isHighlighted?: number[] // 0 = not highlighted, 1 = highlighted
  infoZonePlacements?: IndexedPlacement[] // Info zones rendered on the platform
  collectiblePlacements?: IndexedPlacement[] // Collectibles rendered on the platform
  floatingHeadingPlacements?: IndexedPlacement[] // Floating heading above the platform but still aligned to the row
  finishLinePosition?: [number, number, number] // Finish line position
  confettiPlacements?: ConfettiPlacement[] // Confetti platforms rendered on the platform
  colourPickerPlacement?: IndexedPlacement // Colour picker placement (single instance)
}
