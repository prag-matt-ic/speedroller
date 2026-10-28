import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const values = value => typeof value === 'number' ? [value] : value.values
const node = (...input) => {
  const components = input.flatMap(values)
  const combine = (other, operation) => node(...components.map((value, index) => operation(value, values(other)[index % values(other).length])))
  return {
    values: components,
    get x() { return node(components[0]) }, get y() { return node(components[1]) },
    get yx() { return node(components[1], components[0]) },
    add: other => combine(other, (a, b) => a + b),
    sub: other => combine(other, (a, b) => a - b),
    mul: other => combine(other, (a, b) => a * b),
    oneMinus: () => node(...components.map(value => 1 - value)),
  }
}
const { industrialPanelMasks } = loadTypeScript('components/platform/scenery/industrialSurface.ts', {
  'three/tsl': {
    float: node, vec2: node,
    abs: input => node(...values(input).map(Math.abs)),
    length: input => node(Math.hypot(...values(input))),
    fwidth: () => node(0.001),
    min: (a, b) => node(...values(a).map((value, i) => Math.min(value, values(b)[i]))),
    max: (a, b) => node(Math.max(values(a)[0], values(b)[0])),
    mix: (a, b, t) => a.add(b.sub(a).mul(t)),
    step: (edge, input) => node(Number(values(input)[0] >= values(edge)[0])),
    smoothstep: (low, high, input) => {
      const t = Math.max(0, Math.min(1, (values(input)[0] - values(low)[0]) / (values(high)[0] - values(low)[0])))
      return node(t * t * (3 - 2 * t))
    },
  },
})
const masks = (u, v, width = 4, height = 8) => Object.fromEntries(
  Object.entries(industrialPanelMasks(node(u, v), node(width, height))).map(([name, value]) => [name, value.values[0]]),
)

test('light strips follow the long face axis on pillars and bridge beams', () => {
  const pillar = masks(0.19, 0.5)
  assert.equal(pillar.strip, 1)
  assert.equal(pillar.housing, 1)
  assert.equal(masks(0.19, 0.5, 9, 6).strip, 1, 'wide column blocks keep vertical fittings')
  assert.deepEqual(masks(0.5, 0.19, 8, 4), pillar)
  assert.equal(masks(0.5, 0.5).strip, 0)
  assert.equal(masks(0.19, 0.05).strip, 0)
  assert.equal(masks(0.19, 0.95).strip, 0)
})

test('strip width stays in world units and fittings stay bounded on different block sizes', () => {
  for (const width of [2, 4, 8]) {
    assert.equal(masks(0.19 + 0.05 / width, 0.5, width, 10).strip, 1)
    assert.equal(masks(0.19 + 0.1 / width, 0.5, width, 10).strip, 0)
    assert.equal(masks(0, 0.5, width, 10).seam, 1)
    assert.equal(masks(0.22 / width, 0.22 / 10, width, 10).bolts, 1)
    for (const u of [0, 0.19, 0.5, 1]) for (const v of [0, 0.5, 1]) {
      assert.ok(Object.values(masks(u, v, width, 10)).every(value => value >= 0 && value <= 1))
    }
  }
})
