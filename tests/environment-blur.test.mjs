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
