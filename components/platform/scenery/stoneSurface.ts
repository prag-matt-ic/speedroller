'use client'

import { useTexture } from '@react-three/fiber/webgpu'
import { normalMap, spritesheetUV, texture, vec2 } from 'three/tsl'
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  SRGBColorSpace,
  type Node,
  type Texture,
} from 'three/webgpu'

import ivoryStoneAtlas from '@/assets/textures/platform/ivory-stone-atlas.webp'
import ivoryStoneNormals from '@/assets/textures/platform/ivory-stone-normal.png'

import { industrialSurface } from './industrialSurface'

/** Nine 512px stone cells, sampled past their duplicated-edge gutters. */
export const STONE_ATLAS_GRID = 3
const STONE_UV_INSET = 16.5 / 512

/** Shared Phong response, so every stone surface in the course catches the same highlight. */
export const STONE_SHININESS = 24
export const STONE_SPECULAR = '#62584c'

const STONE_NORMAL_STRENGTH = 0.35

export type StoneTextures = {
  atlas: Texture
  normals: Texture
}

const configureStoneAtlas = (map: Texture) => {
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = ClampToEdgeWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true
}

const configureStoneNormals = (map: Texture) => {
  configureStoneAtlas(map)
  map.colorSpace = NoColorSpace
}

export const useStoneTextures = (): StoneTextures => ({
  atlas: useTexture(ivoryStoneAtlas.src, configureStoneAtlas),
  normals: useTexture(ivoryStoneNormals.src, configureStoneNormals),
})

/** Maps a surface coordinate into one atlas cell, keeping neighbouring cells out of the sample. */
export const stoneAtlasUv = (coordinate: Node<'vec2'>, frame: Node<'float'>) =>
  spritesheetUV(
    vec2(STONE_ATLAS_GRID),
    coordinate.mul(1 - 2 * STONE_UV_INSET).add(STONE_UV_INSET),
    frame,
  ) as Node<'vec2'>

/**
 * The industrial stone panels that clad every pillar in the course.
 *
 * `textureUv` picks the stone sample, `panelCoordinate` is the surface's 0-1 face coordinate and
 * `panelSize` is that face's width and height in world units, which the seams, bolts and light
 * strips are measured in. Scenery blocks and the podium share this so both read as one material.
 */
export const stoneSurface = (
  { atlas, normals }: StoneTextures,
  textureUv: Node<'vec2'>,
  panelCoordinate: Node<'vec2'>,
  panelSize: Node<'vec2'>,
) => {
  const panel = industrialSurface(texture(atlas, textureUv).rgb, panelCoordinate, panelSize)

  return {
    colorNode: panel.colorNode,
    emissiveNode: panel.emissiveNode,
    normalNode: normalMap(texture(normals, textureUv).rgb, vec2(STONE_NORMAL_STRENGTH)),
  }
}
