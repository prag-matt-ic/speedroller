import { Stage } from '@/stores/types'

// Tile dimensions
export const TILE_SIZE = 1.0
export const TILE_THICKNESS = 0.08
export const TILE_PLAYER_HIGHLIGHT_ROW_COUNT = 4
export const TILE_PLAYER_FADE_FULL_ROWS = 8
export const TILE_PLAYER_FADE_MIN_ROWS = 18
export const TILE_PLAYER_FADE_MIN_ALPHA = 0
export const TILE_PLAYER_HIGHLIGHT_RADIUS = TILE_PLAYER_HIGHLIGHT_ROW_COUNT * TILE_SIZE
export const TILE_PLAYER_FADE_FULL_RADIUS = TILE_PLAYER_FADE_FULL_ROWS * TILE_SIZE
export const TILE_PLAYER_FADE_MIN_RADIUS = TILE_PLAYER_FADE_MIN_ROWS * TILE_SIZE

// Rows live in a window around the player, and it is deliberately lopsided: it runs well past the
// tiles' fade radius ahead, and only as far behind as the camera can still see the track.
const ROW_VISIBILITY_BUFFER_ROWS = 6
const ROW_VISIBILITY_BUFFER_RADIUS = ROW_VISIBILITY_BUFFER_ROWS * TILE_SIZE

// Ahead: the tiles' visible run plus the buffer the fade-in needs. See `fadeInOut.ts`.
export const ROW_VISIBILITY_AHEAD_SPAN =
  TILE_PLAYER_FADE_MIN_RADIUS + ROW_VISIBILITY_BUFFER_RADIUS

// Behind: the camera trails the player by 8 and pulls back at most 5 with input, and it only sees
// the ground ~5 units in front of itself, so nothing past this is ever on screen. Rows further back
// would be behind the lens, costing tiles and per-frame moves for nothing.
export const ROW_VISIBILITY_BEHIND_SPAN = 16

// How far ahead/behind the player a row's elements are placed — the start of an element's life, and
// the fade window `fadeInOut.ts` fades in over. One tile inside each span, so a row is never placed
// exactly on the window edge it wraps at.
export const ELEMENT_PLACEMENT_AHEAD_SPAN = ROW_VISIBILITY_AHEAD_SPAN - TILE_SIZE
export const ELEMENT_PLACEMENT_BEHIND_SPAN = ROW_VISIBILITY_BEHIND_SPAN - TILE_SIZE

const EXIT_LOWER_DURATION_ROWS = 6
const PLATFORM_MAX_Z = TILE_SIZE * 8

export const ENTRY_END_Z = PLATFORM_MAX_Z - 16 * TILE_SIZE - EXIT_LOWER_DURATION_ROWS
export const EXIT_START_Z = PLATFORM_MAX_Z - EXIT_LOWER_DURATION_ROWS * TILE_SIZE

export const EPSILON = {
  SMALL: 1e-6,
  TINY: 1e-4,
} as const

// Grid configuration
export const COLUMNS = 33 // odd number so that there is a center column

// The pool is exactly the window above: rows wrap through it by ROWS_RENDERED, so anything else
// leaves gaps or overlap. Widening the visible track by N rows costs N pool rows here.
export const ROWS_RENDERED = ROW_VISIBILITY_AHEAD_SPAN + ROW_VISIBILITY_BEHIND_SPAN

// Heights
export const RAISED_Y = -TILE_SIZE / 2 // top of tile at y=0
export const UNRAISED_Y = -100 // sunken obstacles (out of sight)
export const raisedMaskToY = (value: 0 | 1): number => (value === 1 ? RAISED_Y : UNRAISED_Y)

const HIDE_POSITION_Y = -20 as const
const HIDE_POSITION_Z = 10 as const
export const HIDDEN_POSITION: [number, number, number] = [0, HIDE_POSITION_Y, HIDE_POSITION_Z]

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
