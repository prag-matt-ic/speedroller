import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PerspectiveCamera, Scene } from 'three/webgpu'

import { loadTypeScript } from './loadTypeScript.mjs'

const cache = new Map()
const lightNodes = loadTypeScript('components/lighting/lightNodes.ts', {}, cache)
const ringLights = loadTypeScript('components/lighting/ringLights.ts', {}, cache)
const { PLATFORM_DATA } = loadTypeScript('resources/rowsData.ts', {}, cache)
const { RING_WORLD_Y } = loadTypeScript('components/platform/rings/ringConfig.ts', {}, cache)
const { getPlayerLightColour } = loadTypeScript('components/lighting/playerLight.ts', {}, cache)
const { PALETTE_COUNT } = loadTypeScript('components/palette.ts', {}, cache)
const { courseToWorld } = loadTypeScript('utils/platform/courseSurface.ts', {}, cache)
const { getRingKey } = loadTypeScript('utils/rings.ts', {}, cache)
const { colToX, rowToWorldZ } = loadTypeScript('utils/tiles.ts', {}, cache)

const countRings = (rows) =>
  rows.reduce((count, row) => count + (row.rings ?? []).filter(Boolean).length, 0)

test('the light texture carries the player light and every authored ring slot', () => {
  const ringCounts = Object.values(PLATFORM_DATA.modes).map(({ rows, totalCounts }) => {
    assert.equal(countRings(rows), totalCounts.rings)
    return totalCounts.rings
  })

  // Both the light texture and the view-depth scratch are sized from this total, so a hand-written
  // capacity below the authored ring count would lose the tail of the pool.
  assert.equal(lightNodes.MAX_RING_LIGHTS, Math.max(...ringCounts))
  assert.equal(lightNodes.RING_POINT_LIGHTS.length, lightNodes.MAX_RING_LIGHTS)
  assert.equal(lightNodes.SCENE_POINT_LIGHT_COUNT, 1 + lightNodes.MAX_RING_LIGHTS)

  const { PLAYER_LIGHT_CONSTANTS, RING_LIGHT_CONSTANTS } = lightNodes
  assert.equal(lightNodes.PLAYER_POINT_LIGHT.castShadow, false)
  assert.equal(lightNodes.PLAYER_POINT_LIGHT.distance, PLAYER_LIGHT_CONSTANTS.distance)
  assert.equal(lightNodes.PLAYER_POINT_LIGHT.decay, PLAYER_LIGHT_CONSTANTS.decay)
  assert.equal(lightNodes.PLAYER_POINT_LIGHT.intensity, PLAYER_LIGHT_CONSTANTS.intensity)

  for (const light of lightNodes.RING_POINT_LIGHTS) {
    assert.equal(light.castShadow, false)
    assert.equal(light.intensity, 0)
    assert.equal(light.distance, RING_LIGHT_CONSTANTS.distance)
    assert.equal(light.decay, RING_LIGHT_CONSTANTS.decay)
    assert.equal(light.color.getHexString(), RING_LIGHT_CONSTANTS.color.getHexString())
  }
})

test('the clustered node separates scene fills from the point-light pool', () => {
  const pointLights = [
    lightNodes.PLAYER_POINT_LIGHT,
    ...lightNodes.RING_POINT_LIGHTS,
  ]
  const lighting = lightNodes.createSceneLighting()
  const node = lighting.createNode([
    lightNodes.TILE_AMBIENT_LIGHT,
    lightNodes.TILE_KEY_LIGHT,
    ...pointLights,
  ])

  assert.equal(node.maxLights, lightNodes.SCENE_POINT_LIGHT_COUNT)
  assert.equal(node.maxLightsPerCluster, lightNodes.SCENE_POINT_LIGHT_COUNT)
  assert.deepEqual(node.materialLights, [lightNodes.TILE_AMBIENT_LIGHT, lightNodes.TILE_KEY_LIGHT])
  assert.equal(node.clusteredLights.length, pointLights.length)
  pointLights.forEach((light, index) => assert.equal(node.clusteredLights[index], light))

  const otherScene = new Scene()
  assert.notEqual(lighting.getNode(new Scene()), node)
  assert.equal(lighting.getNode(otherScene), lighting.getNode(otherScene))

  // An unsized drawing buffer must still build a usable grid rather than a zero-length index buffer.
  node.setSize(0, 0)
  assert.ok(node._lightIndexes.value.array.length > 0)

  const scene = new Scene()
  scene.add(...pointLights)
  scene.updateMatrixWorld()
  node.setSize(64, 64)
  node.updateLightsTexture(new PerspectiveCamera())
  assert.equal(node._lightsCount.value, lightNodes.SCENE_POINT_LIGHT_COUNT)
  assert.ok(Number.isFinite(Number(node._lightsTexture.image.data[0])))
  scene.clear()
})

test('each ring light is co-located with the ring it belongs to', () => {
  for (const { rows, surface } of Object.values(PLATFORM_DATA.modes)) {
    const placements = ringLights.createRingLightPlacements(rows, surface)
    assert.equal(placements.length, countRings(rows))

    let placementIndex = 0
    rows.forEach((row, rowIndex) => {
      const ringingColumns = row.rings ?? []
      ringingColumns.forEach((hasRing, columnIndex) => {
        if (!hasRing) return

        const placement = placements[placementIndex]
        const expectedCourse = [
          colToX(columnIndex, row.isRaised.length),
          RING_WORLD_Y,
          rowToWorldZ(rowIndex),
        ]
        const expected = courseToWorld(
          expectedCourse[0],
          expectedCourse[1],
          expectedCourse[2],
          surface,
          { x: 0, y: 0, z: 0 },
        )
        const ringIndex = row.rowIndex ?? rowIndex

        assert.equal(placement.key, getRingKey(ringIndex, columnIndex))
        assert.deepEqual(placement.indexes, [ringIndex, columnIndex])
        // The mesh consumes course space and the scene-root light consumes world space; conflating
        // them would double-convert the mesh on the cylinder.
        assert.deepEqual(placement.coursePosition, expectedCourse)
        assert.deepEqual(placement.worldPosition, [expected.x, expected.y, expected.z])
        if (surface.topology === 'cylinder') {
          assert.notDeepEqual(placement.coursePosition, placement.worldPosition)
        }
        assert.equal(placement.light, lightNodes.RING_POINT_LIGHTS[placementIndex])
        placementIndex += 1
      })
    })

    ringLights.poseRingLights(placements)
    for (const { light, worldPosition } of placements) {
      if (!light) continue
      assert.deepEqual(light.position.toArray(), [...worldPosition])
    }

    ringLights.extinguishRingLights()
    for (const light of lightNodes.RING_POINT_LIGHTS) assert.equal(light.intensity, 0)
  }
})

test('a ring slot is lit only while its ring is collectable', () => {
  const light = lightNodes.RING_POINT_LIGHTS[0]
  const { RING_LIGHT_CONSTANTS } = lightNodes

  ringLights.setRingLightLit(light, true)
  assert.equal(light.intensity, RING_LIGHT_CONSTANTS.intensity)

  ringLights.setRingLightLit(light, false)
  assert.equal(light.intensity, 0)

  // A course that outgrows the pool still renders its ring; the missing slot is a no-op.
  assert.doesNotThrow(() => ringLights.setRingLightLit(null, true))
})

test('the player light colour is a usable linear colour for every palette', () => {
  for (let paletteIndex = 0; paletteIndex < PALETTE_COUNT; paletteIndex++) {
    const colour = getPlayerLightColour(paletteIndex)

    assert.equal(colour.length, 3)
    for (const channel of colour) {
      // A negative channel would subtract light from the tiles; the cosine palette undershoots.
      assert.ok(Number.isFinite(channel))
      assert.ok(channel >= 0 && channel <= 1)
    }
    assert.ok(colour[0] + colour[1] + colour[2] > 0.2, 'light must remain visible')
  }
})
