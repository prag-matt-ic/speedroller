import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

// Evaluate the production TSL branch and count texture reads without a GPU.
const values = value => typeof value === 'number' ? [value] : value.values
const node = (...input) => {
  const components = input.flatMap(values)
  const combine = (other, operation) => node(...components.map((value, index) =>
    operation(value, values(other)[index % values(other).length])))
  return {
    values: components,
    get x() { return node(components[0]) },
    get y() { return node(components[1]) },
    get rgb() { return node(...components.slice(0, 3)) },
    get a() { return node(components[3]) },
    toConst() { return this },
    toFloat() { return this },
    toVar: () => node(...components),
    add: other => combine(other, (a, b) => a + b),
    sub: other => combine(other, (a, b) => a - b),
    mul: other => combine(other, (a, b) => a * b),
    div: other => combine(other, (a, b) => a / b),
    negate: () => node(...components.map(value => -value)),
    clamp: (min, max) => node(...components.map(value => Math.max(min, Math.min(max, value)))),
    greaterThan: other => node(Number(components[0] > values(other)[0])),
    greaterThanEqual: other => node(Number(components[0] >= values(other)[0])),
    and: other => node(Number(Boolean(components[0] && values(other)[0]))),
    select: (a, b) => components[0] ? a : b,
    addAssign(other) { components.forEach((value, index) => { components[index] = value + values(other)[index % values(other).length] }) },
    assign(other) { components.splice(0, components.length, ...values(other)) },
  }
}
const Fn = callback => Object.assign((...args) => callback(...args), { setLayout() { return this } })
const uv = node(0.8, 0.5)
const { radialBlurNode } = loadTypeScript('components/postProcessing/speedEffectsPost.ts', {
  'three/tsl': {
    Fn,
    If: (condition, callback) => { if (condition.values[0]) callback() },
    Loop: (count, callback) => { for (let i = 0; i < count; i++) callback({ i: node(i) }) },
    float: node, vec2: node,
    normalize: input => input.div(Math.hypot(...input.values)),
    mix: (a, b, amount) => a.add(b.sub(a).mul(amount)),
    screenUV: uv, screenCoordinate: { xy: uv }, time: 0,
    interleavedGradientNoise: () => node(0.5),
  },
})

test('clear pixels and idle speed skip all taps and preserve the base colour', () => {
  for (const [speed, edgeMask, intensity] of [[0, 1, 0], [1, 0, 0], [1, 0.04, 0.04], [0.01, 0.05, 0.0005]]) {
    const result = radialBlurNode({
      sceneColor: { sample: () => assert.fail('clear pixel must not sample blur taps') },
      base: node(0.2, 0.4, 0.6, 0.8), stepCount: 8,
      terms: { signedSpeed: node(speed), speed: node(speed), edgeMask: node(edgeMask), intensity: node(intensity) },
    })
    assert.deepEqual(result.values, [0.2, 0.4, 0.6])
  }
})

test('active blur samples in either direction and reaches 40% of the focus distance', () => {
  for (const direction of [-1, 1]) {
    const samples = []
    const result = radialBlurNode({
      sceneColor: { sample: sampleUv => { samples.push([...sampleUv.values]); return node(1, 1, 1, 0.8) } },
      base: node(1, 1, 1, 0.8), stepCount: 8,
      terms: { signedSpeed: node(direction), speed: node(1), edgeMask: node(1), intensity: node(1) },
    })
    assert.equal(samples.length, 8)
    for (let axis = 0; axis < 2; axis++) {
      const focus = [0.5, 0.45][axis]
      const expected = uv.values[axis] + (focus - uv.values[axis]) * direction * 0.4
      assert.ok(Math.abs(samples.at(-1)[axis] - expected) < 1e-12)
    }
    assert.ok(result.values.every(value => Math.abs(value - 1) < 1e-12), 'blur preserves a constant colour')
  }
})

test('bloom is composited before blur and its input texture is disposed on rebuild and unmount', () => {
  for (const blurSamples of [0, 8, 16]) {
    const pipeline = {}
    const textures = []
    const blooms = []
    const effects = []
    const cleanups = []
    let build
    const sceneColor = node(1, 2, 3, 0.8)
    const passes = { scenePass: { getTextureNode: () => sceneColor, setMRT() {} } }
    const { default: PostProcessing } = loadTypeScript('components/postProcessing/Effects.tsx', {
      react: {
        useRef: current => ({ current }), useState: () => [null, () => {}],
        useLayoutEffect: callback => callback(),
        useEffect: callback => { const cleanup = callback(); if (cleanup) cleanups.push(cleanup) },
      },
      '@react-three/fiber': { useFrame() {}, useThree: selector => selector({ renderer: {} }) },
      '@react-three/tsl': {
        useUniforms: () => ({ uSpeed: { value: 0 } }),
        useRenderPipeline: (main, setup) => {
          build = () => { setup({ passes }); main({ renderPipeline: pipeline, passes }) }
          build()
          return { renderPipeline: pipeline, rebuild: build }
        },
      },
      'three/addons/tsl/display/BloomNode.js': {
        bloom: () => {
          const bloom = { rgb: node(0.5, 0.5, 0.5), disposed: 0, dispose() { this.disposed++ } }
          blooms.push(bloom)
          return bloom
        },
      },
      'three/tsl': {
        emissive: node(1), output: sceneColor, mrt: input => input, vec4: node,
        convertToTexture: composite => {
          const texture = { composite, disposed: 0, dispose() { this.disposed++ } }
          textures.push(texture)
          return texture
        },
      },
      'three/webgpu': { NeutralToneMapping: 1, NoToneMapping: 0 },
      '@/components/PerformanceProvider': { usePerformanceStore: selector => selector({
        isNeutralToneMapping: true, sceneConfig: { postProcessing: { blurSamples } },
      }) },
      '@/components/SceneWarmup': () => null,
      '@/hooks/usePlayerSpeed': () => ({ speedUnits: { current: 0 } }),
      '@/components/postProcessing/speedEffectsPost': {
        speedEffectsNode: options => { effects.push(options); return { blurred: options.sceneColor } },
      },
    })
    PostProcessing()
    build()
    if (blurSamples > 0) {
      assert.equal(textures.length, 2)
      assert.deepEqual(textures[0].composite.values, [1.5, 2.5, 3.5, 0.8])
      assert.equal(effects[1].sceneColor, textures[1])
      assert.equal(effects[1].stepCount, blurSamples)
      assert.equal(pipeline.outputNode.blurred, textures[1])
      assert.equal(textures[0].disposed, 1)
    } else {
      assert.equal(textures.length, 0, 'disabled blur needs no intermediate texture')
      assert.equal(effects.length, 0)
      assert.deepEqual(pipeline.outputNode.values, [1.5, 2.5, 3.5, 0.8])
    }
    cleanups.forEach(cleanup => cleanup())
    assert.ok([...textures, ...blooms].every(resource => resource.disposed === 1))
  }
})
