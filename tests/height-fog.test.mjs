import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const { HEIGHT_FOG_DENSITY, HEIGHT_FOG_TOP_Y } = loadTypeScript('utils/sceneDistances.ts')

// Exercise the scene ownership and material-blending branches without a GPU.
test('height fog samples the supplied map, preserves alpha and restores only its own node', () => {
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
  assert.deepEqual(dependencies, [map])
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
