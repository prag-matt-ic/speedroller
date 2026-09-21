'use client'

import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { type FC, type RefObject, useId, useMemo, useRef } from 'react'
import { DataTexture, FloatType, Group, Mesh, RGBAFormat, Vector3 } from 'three'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import { clamp, float, mix, select, uv, vec2, vec3, vertexStage } from 'three/tsl'
import type { Node, UniformNode } from 'three/webgpu'

import { useGameStore } from '@/components/GameProvider'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import Gem, { type GemShellRef } from '@/components/platform/collectibles/collectible/gem/Gem'
import { PLAYER_RADIUS } from '@/components/player/PlayerHUD'
import { useConfirmationProgress } from '@/hooks/useConfirmationProgress'
import useGameFrame from '@/hooks/useGameFrame'
import { CollectibleID, type CollectibleUserData } from '@/model/schema'
import { fadeInOut } from '@/resources/tsl/fadeInOut'
import { paintCorners } from '@/resources/tsl/paintCorners'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { HIDDEN_POSITION, TILE_SIZE } from '@/utils/tiles'

// Corner bracket tuning, carried over from collectibleTile.frag.
const BORDER_THICKNESS_TILES = 0.25
const CORNER_LENGTH_TILES = 0.5
const CORNER_LENGTH_CONFIRM_TILES = 2.5

const COLLECTIBLE_TILE_UNIFORM_SCOPE = 'collectibleTile'

type CollectibleTileUniforms = {
  uConfirmingProgress: UniformNode<'float', number>
  uIsConfirming: UniformNode<'float', number>
  uWasConfirmed: UniformNode<'float', number>
  uAspect: UniformNode<'float', number>
  uTilesX: UniformNode<'float', number>
  uTilesY: UniformNode<'float', number>
}

// The progress uniforms are animated per frame and the tile metrics come from props, so every
// collectible registers its own scope: a shared scope would make all tiles animate together.
// `uTime` is gone because neither tile shader ever declared it (only the gem shell uses it).
const createCollectibleTileUniforms =
  (aspect: number, tilesX: number, tilesY: number) => () => ({
    uConfirmingProgress: 0,
    uIsConfirming: 0,
    uWasConfirmed: 0,
    uAspect: aspect,
    uTilesX: tilesX,
    uTilesY: tilesY,
  })

type Props = {
  ref: RefObject<RapierRigidBody | null>
  id: CollectibleID
  isVisible: boolean
  width: number
  height: number
}

export const Collectible: FC<Props> = ({ ref, width, height, id, isVisible }) => {
  const isCollected = useGameStore((s) => s.collectedCollectibles.includes(id))
  const isConfirming = useGameStore((s) => s.confirmingCollectible === id)
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)

  const gemShaderRef = useRef<GemShellRef>(null)
  const localProgress = useRef(0)
  const gemRotationGroupRef = useRef<Group>(null)
  const { confirmationProgress } = useConfirmationProgress()

  const tileAspect = width / height
  const tilesX = width / TILE_SIZE
  const tilesY = height / TILE_SIZE

  // React ids are not valid WGSL identifiers, so keep only the alphanumeric characters.
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const tileUniformScope = `${COLLECTIBLE_TILE_UNIFORM_SCOPE}_${instanceId}`

  const { uConfirmingProgress, uIsConfirming, uWasConfirmed } = useUniforms(
    createCollectibleTileUniforms(tileAspect, tilesX, tilesY),
    tileUniformScope,
  )

  // Port of collectibleTile.vert + collectibleTile.frag. The height-space UV and the distance
  // fade were varyings in the GLSL; here they are recomputed inside the fragment node graph.
  const { colorNode, opacityNode } = useLocalNodes(({ uniforms }: CreatorState) => {
    const scoped = uniforms.scope<CollectibleTileUniforms>(tileUniformScope)
    const { uPlayerWorldPos } = uniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)

    // vHeightSpacePosition: centred UV with the aspect ratio applied to x.
    const centeredUv = uv().sub(0.5)
    const heightSpacePosition: Node<'vec2'> = vec2(
      centeredUv.x.mul(scoped.uAspect),
      centeredUv.y,
    )

    const progress: Node<'float'> = clamp(scoped.uConfirmingProgress, float(0), float(1))
    const shouldBeExtended: Node<'bool'> = scoped.uIsConfirming
      .greaterThan(0.5)
      .or(scoped.uWasConfirmed.greaterThan(0.5))
    const targetCornerLength: Node<'float'> = select(
      shouldBeExtended,
      float(CORNER_LENGTH_CONFIRM_TILES),
      float(CORNER_LENGTH_TILES),
    )
    const animatedCornerLength: Node<'float'> = mix(
      float(CORNER_LENGTH_TILES),
      targetCornerLength,
      progress,
    )

    const bracketMask: Node<'float'> = paintCorners(
      heightSpacePosition,
      scoped.uAspect,
      vec2(scoped.uTilesX, scoped.uTilesY),
      float(BORDER_THICKNESS_TILES),
      animatedCornerLength,
    )

    // The tile's own z, so the brackets ramp in as a whole. Built as a JS branch so the fade is
    // omitted from the graph when the toggle is off.
    const mask: Node<'float'> = useDistanceFade
      ? bracketMask.mul(vertexStage(fadeInOut(uPlayerWorldPos.z)))
      : bracketMask

    return { colorNode: vec3(1), opacityNode: mask }
  })

  useGameFrame((state, delta) => {
    if (!isVisible) return
    const globalProgress = confirmationProgress.current

    if (isConfirming) {
      // If confirming, track the global progress upward
      localProgress.current = Math.max(localProgress.current, globalProgress)
    } else {
      // Not confirming: only allow progress to decrease, following global progress
      localProgress.current = Math.min(localProgress.current, globalProgress)
    }

    if (isCollected) {
      localProgress.current = 1.0
    }

    /* eslint-disable react-hooks/immutability */
    uConfirmingProgress.value = localProgress.current
    uIsConfirming.value = isConfirming ? 1 : 0
    uWasConfirmed.value = isCollected ? 1 : 0
    /* eslint-enable react-hooks/immutability */

    if (gemShaderRef.current) {
      gemShaderRef.current.uConfirmingProgress.value = isCollected ? 1.0 : localProgress.current
    }

    if (!gemRotationGroupRef?.current) return
    gemRotationGroupRef.current.rotation.y += delta * 0.4
  })

  const userData = useMemo<CollectibleUserData>(
    () => ({
      type: 'collectible',
      collectibleType: id,
    }),
    [id],
  )

  return (
    <RigidBody
      ref={ref}
      type="dynamic"
      gravityScale={0}
      friction={0}
      mass={0}
      position={HIDDEN_POSITION} // Overwritten dynamically in the parent
      rotation={[-Math.PI / 2, 0, 0]}
      colliders={false}
      userData={userData}>
      <CuboidCollider
        args={[width / 2, height / 2, PLAYER_RADIUS * 2]}
        sensor={true}
        mass={0}
        friction={0}
        collisionGroups={COLLISION_GROUPS.collectibleSensor}
      />

      {/* Tile mesh: shader renders corner brackets and confirmation progress bar */}
      <mesh position={[0, 0, 0.01]} renderOrder={2} visible={isVisible}>
        <planeGeometry args={[width, height]} />
        <meshBasicNodeMaterial
          colorNode={colorNode}
          opacityNode={opacityNode}
          transparent={true}
          depthTest={true}
          depthWrite={false}
        />
      </mesh>

      <Gem
        ref={gemRotationGroupRef}
        key={`gem-${id}`}
        shaderRef={gemShaderRef}
        isCollected={isCollected}
        tileWidth={width}
        tileHeight={height}
        id={id}
        isVisible={isVisible}
      />
    </RigidBody>
  )
}

export default Collectible

// ------------------
// DataTexture + position field generation (copied from previous FBO setup)
// ------------------

export const createDataTextureFromSeeds = (
  seeds: Float32Array,
  textureSize: number,
): DataTexture => {
  const expectedLength = textureSize * textureSize * 4
  const data = new Float32Array(expectedLength)
  for (let i = 0; i < textureSize * textureSize; i++) {
    data[i * 4] = seeds[i] !== undefined ? seeds[i] : 0
    data[i * 4 + 1] = 0
    data[i * 4 + 2] = 0
    data[i * 4 + 3] = 1
  }
  const dt = new DataTexture(data, textureSize, textureSize, RGBAFormat, FloatType)
  dt.needsUpdate = true
  return dt
}

export const createDataTextureFromPositions = (
  positions: Float32Array,
  textureSize: number,
): DataTexture => {
  const expectedLength = textureSize * textureSize * 4
  if (positions.length !== expectedLength) {
    const padded = new Float32Array(expectedLength)
    padded.set(positions)
    positions = padded
  }
  const dt = new DataTexture(positions, textureSize, textureSize, RGBAFormat, FloatType)
  dt.needsUpdate = true
  return dt
}

export const getMeshSurfacePositions = ({
  mesh,
  count,
  scale,
  offset,
  extrude,
}: {
  mesh: Mesh
  count: number
  scale?: number
  offset?: Vector3
  extrude?: number
}): Float32Array => {
  const positions = new Float32Array(count * 4)
  const sampler = new MeshSurfaceSampler(mesh).build()
  const pos = new Vector3()
  const normal = new Vector3()

  for (let i = 0; i < count; i++) {
    sampler.sample(pos, normal)
    if (!!extrude) pos.addScaledVector(normal, extrude)
    if (!!scale) pos.multiplyScalar(scale)
    if (!!offset) pos.add(offset)
    positions.set([pos.x, pos.y, pos.z, 1.0], i * 4)
  }

  return positions
}
