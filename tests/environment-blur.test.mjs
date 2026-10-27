import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module from 'node:module'
import { test } from 'node:test'
import * as tsl from 'three/tsl'
import * as three from 'three/webgpu'
import ts from 'typescript'

const filename = new URL('../components/backdrop/environmentBlur.ts', import.meta.url).pathname
const loaded = new Module(filename)
loaded.require = (name) => {
  if (name === 'three/tsl') return tsl
  if (name === 'three/webgpu') return three
  throw new Error(`Unexpected dependency: ${name}`)
}
loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename)
const { bakeEnvironmentMap } = loaded.exports

function createRenderer(failPass) {
  const state = {
    renderTarget: { name: 'original' }, activeCubeFace: 2, activeMipmapLevel: 1,
    renderObjectFunction: () => {}, pixelRatio: 2, mrt: {},
    clearColor: new three.Color('#123456'), clearAlpha: 0.4, scissorTest: true,
  }
  const renderer = {
    toneMapping: three.ACESFilmicToneMapping, toneMappingExposure: 0.7,
    outputColorSpace: three.SRGBColorSpace, autoClear: false,
  }
  for (const key of Object.keys(state)) {
    const suffix = key === 'mrt' ? 'MRT' : key[0].toUpperCase() + key.slice(1)
    renderer[`get${suffix}`] = () => state[key]
    renderer[`set${suffix}`] = (value) => { state[key] = value }
  }
  renderer.getClearColor = (target) => target.copy(state.clearColor)
  renderer.setClearColor = (color, alpha) => {
    state.clearColor = new three.Color(color)
    state.clearAlpha = alpha
  }
  renderer.setRenderTarget = (target, face = 0, level = 0) => {
    state.renderTarget = target
    state.activeCubeFace = face
    state.activeMipmapLevel = level
  }
  const passes = []
  renderer.render = (quad) => {
    const pass = { target: state.renderTarget, disposed: false, materialDisposed: false }
    pass.target.addEventListener('dispose', () => { pass.disposed = true })
    quad.material.addEventListener('dispose', () => { pass.materialDisposed = true })
    passes.push(pass)
    if (passes.length === failPass) throw new Error('GPU pass failed')
  }
  return { renderer, passes }
}

for (const failPass of [undefined, 1, 2]) {
  test(`blur restores renderer and releases owned resources (${failPass ? `failure in pass ${failPass}` : 'success'})`, () => {
    const { renderer, passes } = createRenderer(failPass)
    const previous = three.RendererUtils.saveRendererState(renderer)
    const source = new three.Texture({ width: 512, height: 256 })
    let sourceDisposed = false
    source.addEventListener('dispose', () => { sourceDisposed = true })
    if (failPass) {
      assert.throws(() => bakeEnvironmentMap(renderer, source), /GPU pass failed/)
      assert.ok(passes.every((pass) => pass.disposed && pass.materialDisposed))
    } else {
      const result = bakeEnvironmentMap(renderer, source)
      assert.equal(passes.length, 2)
      assert.equal(passes[0].disposed, true)
      assert.equal(passes[1].disposed, false)
      assert.ok(passes.every((pass) => pass.materialDisposed))
      assert.equal(result.texture.mapping, three.EquirectangularReflectionMapping)
      assert.equal(result.texture.colorSpace, three.LinearSRGBColorSpace)
      assert.equal(result.texture.type, three.HalfFloatType)
      assert.equal(result.texture.wrapS, three.RepeatWrapping)
      let textureDisposed = false
      result.texture.addEventListener('dispose', () => { textureDisposed = true })
      result.dispose()
      assert.equal(passes[1].disposed, true)
      assert.equal(textureDisposed, true)
    }
    assert.deepEqual(three.RendererUtils.saveRendererState(renderer), previous)
    assert.equal(sourceDisposed, false)
  })
}

test('blur rejects missing or empty image dimensions before rendering', () => {
  const { renderer, passes } = createRenderer()
  for (const image of [null, { width: 0, height: 256 }]) {
    assert.throws(() => bakeEnvironmentMap(renderer, new three.Texture(image)), /Environment source/)
  }
  assert.equal(passes.length, 0)
})

// Evaluate the sunset graph numerically, including its equirectangular seam and HDR sun.
test('sunset stays amber, keeps cloud contrast and wraps without a sky seam', async () => {
  const { loadTypeScript } = await import('./loadTypeScript.mjs')
  const values = value => typeof value === 'number' ? [value] : value.values
  const node = (...input) => {
    const components = input.flatMap(values)
    const combine = (other, operation) => node(...components.map((value, index) => operation(value, values(other)[index % values(other).length])))
    return {
      values: components,
      get x() { return node(components[0]) }, get y() { return node(components[1]) },
      add: other => combine(other, (a, b) => a + b),
      sub: other => combine(other, (a, b) => a - b),
      mul: other => combine(other, (a, b) => a * b),
      dot: other => node(components.reduce((sum, value, index) => sum + value * values(other)[index], 0)),
      abs: () => node(...components.map(Math.abs)),
      exp: () => node(...components.map(Math.exp)),
      oneMinus: () => node(...components.map(value => 1 - value)),
    }
  }
  const { sunsetEnvironment } = loadTypeScript('components/backdrop/environmentBlur.ts', {
    'three/tsl': {
      color: hex => node(...new three.Color(hex).toArray()), float: node, vec2: node, vec3: node,
      min: (a, b) => node(Math.min(values(a)[0], values(b)[0])),
      mix: (a, b, t) => a.add(b.sub(a).mul(t)),
      smoothstep: (low, high, input) => {
        const t = Math.max(0, Math.min(1, (values(input)[0] - low) / (high - low)))
        return node(t * t * (3 - 2 * t))
      },
    },
  })
  const cloud = node(0.4, 0.4, 0.4)
  const shade = (u, v, source = cloud) => sunsetEnvironment(source, node(u, v)).values
  assert.deepEqual(shade(0, 0.5), shade(1, 0.5))
  const dark = shade(0.75, 0.5, node(0.1, 0.1, 0.1))
  const bright = shade(0.75, 0.5, node(0.7, 0.7, 0.7))
  assert.ok(dark[0] > dark[1] && dark[1] > dark[2])
  assert.ok(bright.every((channel, index) => channel > dark[index]))
  assert.ok(shade(0.25, 0.49).every(channel => channel > 1), 'sun retains HDR energy')
  for (const u of [0, 0.25, 0.5, 0.75, 1]) for (const v of [0, 0.49, 1]) {
    assert.ok(shade(u, v).every(channel => Number.isFinite(channel) && channel >= 0 && channel < 5))
  }
})
