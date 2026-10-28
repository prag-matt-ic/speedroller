import { CSS_LEVEL4, css, oklch, srgb, rgb as toLinearRgb } from '@thi.ng/color'

const TAU = Math.PI * 2

function palette(t, a, b, c, d) {
  return [
    a[0] + b[0] * Math.cos(TAU * (c[0] * t + d[0])),
    a[1] + b[1] * Math.cos(TAU * (c[1] * t + d[1])),
    a[2] + b[2] * Math.cos(TAU * (c[2] * t + d[2])),
  ]
}

function clampUnit(v) {
  return Math.min(1, Math.max(0, v))
}

function toOklchCss(rgb) {
  const s = srgb(clampUnit(rgb[0]), clampUnit(rgb[1]), clampUnit(rgb[2]), 1)
  return css(oklch(toLinearRgb(s)), CSS_LEVEL4)
}

const a = [0.5, 0.5, 0.5]
const b = [0.5, 0.5, 0.5]
const c = [1.0, 1.0, 0.5]
const d = [0.8, 0.9, 0.3]

const ranges = [
  [0.0, 0.5],
  [0.25, 0.75],
  [0.5, 1.0],
]
const steps = 8

for (let ri = 0; ri < ranges.length; ri++) {
  const [start, end] = ranges[ri]
  const stops = []
  for (let i = 0; i < steps; i++) {
    const ratio = steps - 1 === 0 ? 0 : i / (steps - 1)
    const t = start + ratio * (end - start)
    const col = palette(t, a, b, c, d)
    const colorStr = toOklchCss(col)
    const pos = (ratio * 100).toFixed(2).replace(/\.00$/, '')
    stops.push(`${colorStr} ${pos}%`)
  }
  console.log(`--palette-range-${ri}-oklch: linear-gradient(90deg, ${stops.join(', ')});`)
}
