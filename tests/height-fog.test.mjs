import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const { HEIGHT_FOG_DENSITY, HEIGHT_FOG_TOP_Y } = loadTypeScript('utils/sceneDistances.ts')

// Exercise the scene ownership and material-blending branches without a GPU.
test('height fog samples the supplied map, preserves alpha and restores only its own node', () => {
  const surface = { topology: 'flat', columns: 33 }
  let install, shade, sampledMap, dependencies
  const transmission = { name: 'transmission' }
  const factor = { oneMinus: () => transmission }
  const direction = { xyz: 'direction' }
  const skyColor = { name: 'skyColor' }
  const sky = { context: () => ({ rgb: { mul: () => skyColor } }) }
  const previous = { name: 'previous fog' }
  const scene = { fogNode: previous }
  const rgb = { mul: value => ({ attenuated: value }) }
  const alpha = { name: 'original alpha' }
  const { default: HeightFog } = loadTypeScript('components/backdrop/HeightFog.tsx', {
    '@/hooks/useCourseSurface': { useCourseSurface: () => surface },
    '@react-three/tsl': { useLocalNodes: (create, deps) => { install = create({ scene }); dependencies = deps } },
    'three/tsl': {
      Fn: callback => () => { shade = callback; return { name: 'height fog' } },
      backgroundIntensity: 1,
      backgroundRotation: { mul: () => direction },
      cameraPosition: {},
      exponentialHeightFogFactor: (density, height) => {
        assert.equal(density, HEIGHT_FOG_DENSITY); assert.equal(height, HEIGHT_FOG_TOP_Y)
        return factor
      },
      float: value => value,
      mix: (surface, sky, amount) => ({ surface, sky, amount }),
      nodeObject: () => sky,
      output: { rgb, a: alpha },
      positionWorld: { sub: () => direction },
      texture: map => { sampledMap = map; return map },
      vec4: (rgb, a) => ({ rgb, a }),
      vertexStage: value => value,
    },
    'three/webgpu': { AdditiveBlending: 2, CubeMapNode: class {} },
  })
  const map = { name: 'same blurred background texture' }
  HeightFog({ map })
  assert.equal(sampledMap, map)
  assert.deepEqual(dependencies, [map, surface])
  const cleanup = install()
  assert.notEqual(scene.fogNode, previous)
  assert.deepEqual(shade({ material: { blending: 1 } }), { rgb: { surface: rgb, sky: skyColor, amount: factor }, a: alpha })
  assert.deepEqual(shade({ material: { blending: 2 } }), { rgb: { attenuated: transmission }, a: alpha })
  cleanup()
  assert.equal(scene.fogNode, previous)
  const cleanupAgain = install()
  const replacement = {}
  scene.fogNode = replacement
  cleanupAgain()
  assert.equal(scene.fogNode, replacement)
})

// Evaluate the real radial TSL expression numerically at matching depths around the cylinder.
test('cylinder height fog fades pillar bases equally on the floor, walls and ceiling', () => {
  const { CYLINDER_SURFACE: surface, courseToWorld } = loadTypeScript('utils/platform/courseSurface.ts')
  const value = node => typeof node === 'number' ? node : node.value
  const scalar = input => ({
    value: value(input),
    sub: other => scalar(value(input) - value(other)),
    mul: other => scalar(value(input) * value(other)),
    max: other => scalar(Math.max(value(input), value(other))),
    negate: () => scalar(-value(input)),
    exp: () => scalar(Math.exp(value(input))),
    oneMinus: () => scalar(1 - value(input)),
  })
  const vector = (...components) => ({ x: scalar(components[0]), y: scalar(components[1]), z: scalar(components[2] ?? 0) })
  const factors = []
  for (const height of [0, -16, -32]) {
    const atHeight = []
    for (const x of [0, 33, 66, 99]) {
      let shade
      const world = courseToWorld(x, height, -40, surface, { x: 0, y: 0, z: 0 })
      const position = { ...vector(world.x, world.y, world.z), sub: () => ({ xyz: {} }) }
      const tsl = {
        Fn: callback => () => { shade = callback; return {} },
        backgroundIntensity: 1, backgroundRotation: { mul: () => ({ xyz: {} }) },
        cameraPosition: {}, positionWorld: position, positionView: { z: scalar(-40) },
        float: scalar,
        atan: (a, b) => scalar(Math.atan2(value(a), value(b))),
        length: v => scalar(Math.hypot(value(v.x), value(v.y))),
        vec2: vector, vec3: vector,
        distance: () => scalar(40),
        smoothstep: () => scalar(0),
        mix: (_surface, _sky, amount) => value(amount),
        nodeObject: () => ({ context: () => ({ rgb: { mul: () => ({}) } }) }),
        output: { rgb: {}, a: 1 }, texture: map => map,
        vec4: (rgb, alpha) => ({ rgb, alpha }), vertexStage: node => node,
      }
      const { default: HeightFog } = loadTypeScript('components/backdrop/HeightFog.tsx', {
        '@/hooks/useCourseSurface': { useCourseSurface: () => surface },
        '@react-three/tsl': { useLocalNodes: create => create({ scene: {} }) },
        'three/tsl': tsl,
        'three/webgpu': { AdditiveBlending: 2, CubeMapNode: class {} },
      })
      HeightFog({ map: {} })
      atHeight.push(shade({ material: { blending: 1 } }).rgb)
    }
    for (const factor of atHeight) assert.ok(Math.abs(factor - atHeight[0]) < 1e-10)
    factors.push(atHeight[0])
  }
  assert.equal(factors[0], 0, 'road surface remains clear')
  assert.ok(factors[1] > 0.5 && factors[1] < 0.9, 'pillar middle fades gradually')
  assert.ok(factors[2] > 0.99, 'pillar base disappears into the sky')
})
