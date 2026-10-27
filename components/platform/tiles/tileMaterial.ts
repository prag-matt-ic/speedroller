import { MeshPhongNodeMaterial, type Node } from 'three/webgpu'

export type TileNodes = {
  colorNode: Node<'vec3'>
  opacityNode: Node<'float'>
  positionNode: Node<'vec3'>
  emissiveNode: Node<'vec3'>
  normalNode: Node<'vec3'>
}

export const createTileMaterial = (nodes: TileNodes) => {
  const material = new MeshPhongNodeMaterial({ shininess: 24, specular: '#62584c' })
  Object.assign(material, nodes, { transparent: true, alphaTest: 0.001 })
  return material
}
