import assert from 'node:assert/strict'
import { test } from 'node:test'
import { uniform } from 'three/tsl'
import { MathUtils } from 'three'
import { loadTypeScript } from './loadTypeScript.mjs'

const distances = loadTypeScript('utils/sceneDistances.ts')
const playerZ = uniform(0)
let scopeReads = 0
const { useRouteFadeIn } = loadTypeScript('hooks/useRouteFadeIn.ts', {
  '@react-three/tsl': { useLocalNodes: create => create({ uniforms: { scope: () => {
    scopeReads++
    return { uPlayerWorldPos: { z: playerZ } }
  } } }) },
  '@/components/coreUniforms': { CORE_UNIFORM_SCOPE: 'core' },
})

// Evaluate the actual scalar shader graph, including live uniform values.
function evaluate(node) {
  const graph = node.toJSON()
  const nodes = new Map([graph, ...(graph.nodes ?? [])].map(entry => [entry.uuid, entry]))
  const read = id => {
    const entry = nodes.get(id)
    if (typeof entry.value === 'number') return entry.value
    const inputs = entry.inputNodes
    const child = key => read(inputs[key])
    if (inputs.node) return child('node')
    if (entry.op === '-') return child('aNode') - child('bNode')
    if (entry.method === 'smoothstep') return MathUtils.smoothstep(child('cNode'), child('aNode'), child('bNode'))
    throw new Error(`Unexpected fade node: ${entry.type}`)
  }
  return read(graph.uuid)
}

test('route fade uses independent anchors, reverses, and stays opaque after passage', () => {
  const { CAMERA_FAR, TILE_PLAYER_FADE_FULL_RADIUS: full, TILE_PLAYER_FADE_MIN_RADIUS: hidden } = distances
  assert.ok(CAMERA_FAR > hidden && hidden > full && full > 0)
  const target = -200
  const fade = useRouteFadeIn(target)
  const other = useRouteFadeIn(uniform(target - hidden))
  assert.equal(fade.isVaryingNode, true)
  for (const [ahead, expected] of [[hidden + 10, 0], [hidden, 0], [(full + hidden) / 2, 0.5], [full, 1], [-10, 1], [(full + hidden) / 2, 0.5], [hidden, 0]]) {
    playerZ.value = target + ahead
    assert.equal(evaluate(fade), expected)
  }
  playerZ.value = target + full
  assert.equal(evaluate(fade), 1)
  assert.equal(evaluate(other), 0)
})

test('inspection fade bypass needs no game uniform registration', () => {
  const before = scopeReads
  assert.equal(evaluate(useRouteFadeIn(-600, false)), 1)
  assert.equal(scopeReads, before)
})
