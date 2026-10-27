import assert from 'node:assert/strict'
import { test } from 'node:test'
import { float, vec3 } from 'three/tsl'
import { loadTypeScript } from './loadTypeScript.mjs'

const { createTileMaterial } = loadTypeScript('components/platform/tiles/tileMaterial.ts')
const nodes = {
  colorNode: vec3(0.1), opacityNode: float(1), positionNode: vec3(0),
  normalNode: vec3(0, 1, 0), emissiveNode: vec3(0.2),
}

test('shared Phong tiles preserve shading, motion, fade, normals and trail without an environment map', () => {
  const material = createTileMaterial(nodes)
  assert.equal(material.type, 'MeshPhongNodeMaterial')
  for (const [key, node] of Object.entries(nodes)) assert.equal(material[key], node)
  assert.equal(material.transparent, true)
  assert.equal(material.depthWrite, true)
  assert.equal(material.alphaTest, 0.001)
  assert.equal(material.shininess, 24)
  assert.equal(material.specular.getHexString(), '62584c')
  assert.equal(material.envMap, null)
  material.dispose()
})
