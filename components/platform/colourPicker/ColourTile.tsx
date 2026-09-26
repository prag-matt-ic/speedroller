'use client'
import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { type FC, useCallback, useId } from 'react'
import {
  clamp,
  float,
  fwidth,
  max,
  mix,
  mx_noise_float,
  smoothstep,
  time,
  uv,
  vec2,
  vec3,
  vertexStage,
} from 'three/tsl'
import { type Vector3Tuple } from 'three'
import type { UniformNode } from 'three/webgpu'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import { PLAYER_RADIUS } from '@/components/player/PlayerHUD'
import { type ColourTileUserData } from '@/model/schema'
import { fadeInOut } from '@/resources/tsl/fadeInOut'
import { getColourFromPalette } from '@/resources/tsl/playerPalette'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { COLOUR_TILE_SIZE } from '@/utils/platform/homeSection'

// Carried over from colourTile.frag.
const BORDER_THICKNESS = 0.04
const INNER_EDGE = 0.5 - BORDER_THICKNESS
const NOISE_SCALE = 0.6
const WARP_SCALE = 0.4
const WARP_INTENSITY = 0.4
const INACTIVE_SPEED = 0.1
const ACTIVE_SPEED = 0.4

// `useNoise` and `isDistanceFadeEnabled` never animate, so they are graph constants rather than
// uniforms. Animation time comes from TSL's built-in `time` node.
type ColourTileUniforms = {
  uPaletteIndex: UniformNode<'int', number>
  uIsActive: UniformNode<'float', number>
}

const createColourTileUniforms =
  (paletteIndex: number, isActive: boolean) => () => ({
    uPaletteIndex: paletteIndex,
    uIsActive: isActive ? 1 : 0,
  })

export type ColourTileOption = {
  index: number
  position: Vector3Tuple
  userData: ColourTileUserData
}

type ColourTileProps = {
  option: ColourTileOption
  isActive: boolean
}

const ColourTile: FC<ColourTileProps> = ({ option, isActive }) => {
  const useNoise = usePerformanceStore((s) => s.sceneConfig.colourTile.useNoise)
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)

  // Each tile in the picker row owns its own palette index and active state, so the uniforms are
  // scoped per tile rather than shared across the row.
  const colourTileUniformScope = `colourTile${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  useUniforms(createColourTileUniforms(option.index, isActive), colourTileUniformScope)

  // Port of colourTile.vert + colourTile.frag. vUv is recomputed in-graph from the plane's uv, so
  // no varying is needed for it.
  const createNodes = useCallback(
    ({ uniforms: scopedUniforms }: CreatorState) => {
      const scoped = scopedUniforms.scope<ColourTileUniforms>(colourTileUniformScope)
      const { uPlayerWorldPos } = scopedUniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)

      const tileUv = uv()
      const centredUv = tileUv.sub(0.5)
      const edge = max(centredUv.x.abs(), centredUv.y.abs())
      const aa = fwidth(edge)

      const activeMix = clamp(scoped.uIsActive, float(0), float(1))
      const paletteSeed = scoped.uPaletteIndex.toFloat().mul(4)

      // Domain-warped noise for the marble-like swirl. uUseNoise is a settings toggle, so
      // the branch is resolved while building the graph rather than with a select.
      const warpedTime = time.mul(mix(INACTIVE_SPEED, ACTIVE_SPEED, activeMix))
      const warpCoord = tileUv.mul(WARP_SCALE)
      const warpOffset = vec2(
        mx_noise_float(vec3(warpCoord, warpedTime)),
        mx_noise_float(vec3(warpCoord.add(paletteSeed), warpedTime)),
      )
        .mul(2)
        .sub(1)
        .mul(WARP_INTENSITY)
      const warpedUv = tileUv.add(warpOffset).mul(NOISE_SCALE)
      const noiseSample = mx_noise_float(vec3(warpedUv, warpedTime))
      const normalizedNoise = noiseSample.mul(0.5).add(0.5)

      // When the noise toggle is off the GLSL left normalizedNoise at its 0.5 default.
      const paletteT = useNoise ? clamp(normalizedNoise, float(0), float(1)) : float(0.5)
      const baseColour = getColourFromPalette(scoped.uPaletteIndex, paletteT)

      const borderMask = smoothstep(float(INNER_EDGE).sub(aa), float(INNER_EDGE).add(aa), edge)
      const borderColour = vec3(float(1).sub(activeMix))

      return {
        colorNode: mix(baseColour, borderColour, borderMask),
        // The tile's own z, so it ramps in as a whole. The fade toggle is a graph constant; hoist
        // the fade to the vertex stage when enabled.
        opacityNode: useDistanceFade ? vertexStage(fadeInOut(uPlayerWorldPos.z)) : float(1),
      }
    },
    [colourTileUniformScope, useDistanceFade, useNoise],
  )

  const { colorNode, opacityNode } = useLocalNodes(createNodes)

  return (
    <RigidBody
      type="fixed"
      position={option.position}
      rotation={[-Math.PI / 2, 0, 0]}
      colliders={false}
      userData={option.userData}>
      <CuboidCollider
        args={[COLOUR_TILE_SIZE / 2, COLOUR_TILE_SIZE / 2, PLAYER_RADIUS * 2]}
        sensor={true}
        activeCollisionTypes={ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED}
        collisionGroups={COLLISION_GROUPS.colourTileSensor}
      />
      <mesh renderOrder={1}>
        <planeGeometry args={[COLOUR_TILE_SIZE, COLOUR_TILE_SIZE]} />
        <meshBasicNodeMaterial
          colorNode={colorNode}
          opacityNode={opacityNode}
          transparent
          depthWrite={false}
        />
      </mesh>
    </RigidBody>
  )
}

export default ColourTile
