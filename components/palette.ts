import { CSS_LEVEL4, css, oklch, srgb, rgb as toLinearRgb } from '@thi.ng/color'
import { Color, SRGBColorSpace, type Vector3Tuple } from 'three'

type PaletteGradientMode = 'rgb' | 'oklch'

type PaletteSampleOptions = {
  steps?: number
  mode?: PaletteGradientMode
  start?: number
  end?: number
}

export type PaletteGradientOptions = PaletteSampleOptions & {
  angle?: number
}

export const PLAYER_BASE_COLOURS = [
  '#D6BB06', '#4BD606', '#0BCFAE', '#0B8ECF',
  '#1B44BF', '#9116E9', '#E212D5', '#DE171B',
] as const

type PaletteStops = readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple]

export function createPaletteStops(baseColour: string): PaletteStops {
  const base = new Color(baseColour)
  const { h, s, l } = base.getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace)
  const shadow = new Color().setHSL(h, Math.min(1, s * 1.1), l * 0.55, SRGBColorSpace)
  const highlight = new Color().setHSL(h, s * 0.75, l + (1 - l) * 0.35, SRGBColorSpace)
  return [[shadow.r, shadow.g, shadow.b], [base.r, base.g, base.b], [highlight.r, highlight.g, highlight.b]]
}

// Linear RGB stops are shared by CPU sampling and GPU uniforms.
export const PLAYER_PALETTE_STOPS = PLAYER_BASE_COLOURS.map(createPaletteStops)
export const PALETTE_COUNT = PLAYER_BASE_COLOURS.length
export const GRADIENT_STEPS = 8

export const PLAYER_PALETTE_INDEX = 0

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value))

const clampPaletteIndex = (index: number): number => {
  if (!Number.isFinite(index)) return 0
  const rounded = Math.round(index)
  return Math.min(PALETTE_COUNT - 1, Math.max(0, rounded))
}
export const clampPaletteIndexSafe = clampPaletteIndex
const clampT = (t: number): number => clampUnit(Number.isFinite(t) ? t : 0)

export function samplePaletteLinearColour(paletteIndex: number, t: number): Vector3Tuple {
  const stops = PLAYER_PALETTE_STOPS[clampPaletteIndex(paletteIndex)]
  const position = clampT(t) * 2
  const segment = Math.min(1, Math.floor(position))
  const amount = position - segment
  const start = stops[segment]
  const end = stops[segment + 1]
  return [
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  ]
}

export function samplePaletteColour(paletteIndex: number, t: number): Vector3Tuple {
  const colour = new Color(...samplePaletteLinearColour(paletteIndex, t)).convertLinearToSRGB()
  return [colour.r, colour.g, colour.b]
}

const toSrgbColor = (rgb: Vector3Tuple) =>
  srgb(clampUnit(rgb[0]), clampUnit(rgb[1]), clampUnit(rgb[2]), 1)

const toSrgbCss = (rgb: Vector3Tuple): string => css(toSrgbColor(rgb))

const toOklchCss = (rgb: Vector3Tuple): string =>
  css(oklch(toLinearRgb(toSrgbColor(rgb))), CSS_LEVEL4)

const formatCssNumber = (value: number, fractionDigits = 4): string =>
  value.toFixed(fractionDigits).replace(/\.?0+$/, '')

export function rgbToHex(rgb: Vector3Tuple): string {
  return toSrgbCss(rgb)
}

export function rgbToCss(rgb: Vector3Tuple): string {
  return toSrgbCss(rgb)
}

export function getPaletteHex(paletteIndex: number, t = 0.5): string {
  return rgbToHex(samplePaletteColour(paletteIndex, t))
}

export function getPaletteCss(
  paletteIndex: number,
  t = 0.5,
  mode: PaletteGradientMode = 'rgb',
): string {
  return getSampleColour(paletteIndex, t, mode)
}

function getSampleColour(paletteIndex: number, t: number, mode: PaletteGradientMode): string {
  const colour = samplePaletteColour(paletteIndex, t)
  return mode === 'oklch' ? toOklchCss(colour) : toSrgbCss(colour)
}

const createStopStrings = (
  paletteIndex: number,
  { steps = GRADIENT_STEPS, mode = 'rgb', start = 0, end = 1 }: PaletteSampleOptions = {},
): string[] => {
  const safeSteps = Math.max(2, steps)
  const denominator = safeSteps - 1
  const range = clampT(end) - clampT(start)

  return Array.from({ length: safeSteps }, (_, index) => {
    const ratio = denominator === 0 ? 0 : index / denominator
    const t = clampT(start + ratio * range)
    const position = ratio * 100
    return `${getSampleColour(paletteIndex, t, mode)} ${formatCssNumber(position, 2)}%`
  })
}

export const createPaletteStopString = (
  paletteIndex: number,
  options?: PaletteSampleOptions,
): string => createStopStrings(paletteIndex, options).join(', ')

export const createPaletteGradient = (
  paletteIndex: number,
  { angle = 90, ...rest }: PaletteGradientOptions = {},
): string => `linear-gradient(${angle}deg, ${createPaletteStopString(paletteIndex, rest)})`

export const createPaletteCustomProperties = (
  prefix: string,
  paletteIndex: number,
  { steps = GRADIENT_STEPS, mode = 'rgb', start = 0, end = 1 }: PaletteSampleOptions = {},
): Record<string, string> => {
  const safeSteps = Math.max(2, steps)
  const denominator = safeSteps - 1
  const range = clampT(end) - clampT(start)

  return Array.from({ length: safeSteps }, (_, index) => {
    const ratio = denominator === 0 ? 0 : index / denominator
    const t = clampT(start + ratio * range)
    return [index, getSampleColour(paletteIndex, t, mode)] as const
  }).reduce<Record<string, string>>((acc, [index, color]) => {
    acc[`${prefix}-${index}`] = color
    return acc
  }, {})
}

export const getPalettePreviewStops = (): readonly string[] =>
  PLAYER_BASE_COLOURS.map((_, index) =>
    createPaletteStopString(index, {
      steps: GRADIENT_STEPS,
      mode: 'rgb',
    }),
  )
