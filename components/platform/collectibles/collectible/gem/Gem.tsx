'use client'

import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import { type FC, type RefObject, useCallback, useId, useMemo } from 'react'
import {
  attribute,
  clamp,
  float,
  fwidth,
  mix,
  normalView,
  positionGeometry,
  positionView,
  smoothstep,
  sin,
  time,
  vec3,
  vertexStage,
} from 'three/tsl'
import { Color, Float32BufferAttribute, OctahedronGeometry, type Vector3Tuple } from 'three'
import type { MeshBasicNodeMaterial, Node, UniformNode } from 'three/webgpu'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import { CollectibleID } from '@/model/schema'
import { GEMS_COLOURS_BY_ID } from '@/resources/colours'
import { fadeInOut } from '@/resources/tsl/fadeInOut'

import Particles from './particles/Particles'

const GEM_RADIUS = 1.25
const BASE_GEOMETRY = new OctahedronGeometry(GEM_RADIUS, 0)
const GEM_LINE_WIDTH = 4.0
const GEM_GLOW_STRENGTH = 4.0
const GEM_POSITION: Vector3Tuple = [0, 3, 0]
const DEFAULT_SURFACE_COLOR = new Color(GEMS_COLOURS_BY_ID[CollectibleID.AI_Prompts].colour)

// gemShell.frag's early `if (alpha <= 0.01) discard;`. A discard needs a statement stack, which a
// material graph built at React render time does not have, so the material's alpha test does it.
const ALPHA_TEST = 0.01

// TODO: replace with a simple octahedronGeometry
const GEM_SURFACE_GEOMETRY = (() => {
  const geometry = BASE_GEOMETRY.clone()
  const positionCount = geometry.attributes.position.count
  const barycentric = new Float32Array(positionCount * 3)

  for (let i = 0; i < positionCount; i += 3) {
    const start = i * 3
    barycentric[start + 0] = 1
    barycentric[start + 1] = 0
    barycentric[start + 2] = 0

    barycentric[start + 3] = 0
    barycentric[start + 4] = 1
    barycentric[start + 5] = 0

    barycentric[start + 6] = 0
    barycentric[start + 7] = 0
    barycentric[start + 8] = 1
  }

  geometry.setAttribute('aBarycentric', new Float32BufferAttribute(barycentric, 3))
  geometry.computeVertexNormals()

  return geometry
})()

const DEFAULT_LINE_COLOR = DEFAULT_SURFACE_COLOR.clone()
DEFAULT_LINE_COLOR.offsetHSL(0, 0, 0.2)

type GemConfig = (typeof GEMS_COLOURS_BY_ID)[CollectibleID]

const GEM_SHELL_UNIFORM_SCOPE = 'gemShell'

// The value Collectible.tsx drives on the shell is `uConfirmingProgress`, on collect. The pulse
// animation reads TSL's built-in `time` node, so it needs no uniform. Everything else is fixed per
// gem and captured when the graph is built.
export type GemShellUniforms = {
  uConfirmingProgress: UniformNode<'float', number>
}

type GemShellConfigUniforms = {
  uOpacity: UniformNode<'float', number>
}

const createGemShellUniforms = (opacity: number) => () => ({
  uConfirmingProgress: 0,
  uOpacity: opacity,
})

export type GemShellRef = MeshBasicNodeMaterial & GemShellUniforms

type GroupLikeProps = Record<string, unknown>

export type GemShellProps = GroupLikeProps & {
  isCollected: boolean
  tileWidth: number
  tileHeight: number
  shaderRef: RefObject<GemShellRef | null>
  id: CollectibleID
  isVisible: boolean
}

const Gem: FC<GemShellProps> = ({
  tileWidth,
  tileHeight,
  isCollected,
  shaderRef,
  id,
  isVisible,
  ...props
}) => {
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)
  const opacity = isCollected ? 0.4 : 0.2

  const colourConfig: GemConfig =
    GEMS_COLOURS_BY_ID[id] ?? GEMS_COLOURS_BY_ID[CollectibleID.AI_Prompts]
  const surfaceColor = useMemo(() => new Color(colourConfig.colour), [colourConfig])
  const lineColor = useMemo(() => {
    const colour = new Color(colourConfig.colour)
    colour.offsetHSL(0, 0, 0.2)
    return colour
  }, [colourConfig])


  // One shell per gem: a shared scope would make every gem pulse in lockstep.
  const gemShellScope = `${GEM_SHELL_UNIFORM_SCOPE}_${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  const uniforms = useUniforms(
    createGemShellUniforms(opacity),
    gemShellScope,
  )

  // Port of gemShell.vert + gemShell.frag. `aBarycentric` has no TSL equivalent, so it is read back
  // as a custom attribute. Normals and the view direction come from the view stage, and the local
  // position for the vertical reveal from the octahedron's own geometry.
  const createNodes = useCallback(
    ({ uniforms: scopedUniforms }: CreatorState) => {
      const scoped = scopedUniforms.scope<GemShellUniforms & GemShellConfigUniforms>(
        gemShellScope,
      )
      const { uPlayerWorldPos } = scopedUniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)

      const surfaceColorNode = vec3(surfaceColor.r, surfaceColor.g, surfaceColor.b)
      const lineColorNode = vec3(lineColor.r, lineColor.g, lineColor.b)
      const barycentric = attribute<'vec3'>('aBarycentric')

      const viewDirection = positionView.negate().normalize()
      const fresnel = float(1).sub(normalView.dot(viewDirection).max(0)).pow(2)
      const glowContribution = float(GEM_GLOW_STRENGTH).mul(fresnel)

      const clampedProgress = clamp(scoped.uConfirmingProgress, float(0), float(1))
      const pulse = float(0.5).add(sin(time.mul(4)).mul(0.5))
      const pulseMix = smoothstep(float(0.9), float(1), clampedProgress)
      const wireWidth = float(GEM_LINE_WIDTH).mul(
        mix(float(1), float(0.9).add(pulse.mul(0.3)), pulseMix),
      )

      // getWireFactor: barycentric edge falloff using screen-space derivatives.
      const edgeBlend = smoothstep(vec3(0), fwidth(barycentric).mul(wireWidth), barycentric)
      const wire = float(1).sub(edgeBlend.x.min(edgeBlend.y).min(edgeBlend.z))

      const lambert = normalView.y.max(0)
      const litSurface = surfaceColorNode.mul(float(0.6).add(lambert.mul(0.4)).add(glowContribution))

      const revealLimit = clampedProgress.mul(3.5).sub(1.75)
      const revealMask = float(1).sub(
        smoothstep(revealLimit, revealLimit.add(0.5), positionGeometry.y),
      )
      // Never fully disappear: keep a 25% floor.
      const revealFactor = mix(float(0.25), float(1), revealMask)
      const pulseScale = mix(float(1), float(0.92).add(pulse.mul(0.12)), pulseMix)

      const baseAlpha = clamp(
        scoped.uOpacity.add(wire.mul(0.4)).add(glowContribution.mul(0.3)),
        float(0),
        float(1),
      ).mul(revealFactor).mul(pulseScale)

      // The shell's own z — the anchor the particles ride on — so the gem and its burst ramp in
      // together.
      const alpha: Node<'float'> = useDistanceFade
        ? baseAlpha.mul(vertexStage(fadeInOut(uPlayerWorldPos.z)))
        : baseAlpha

      return {
        colorNode: mix(litSurface, lineColorNode, wire),
        opacityNode: alpha,
      }
    },
    [gemShellScope, lineColor, surfaceColor, useDistanceFade],
  )

  const { colorNode, opacityNode } = useLocalNodes(createNodes)


  // Collectible.tsx still writes `gemShaderRef.current.uConfirmingProgress` / `.uTime`, so hang the
  // uniform nodes off the material rather than change that contract.
  const attachUniforms = useCallback(
    (material: MeshBasicNodeMaterial | null) => {
      if (material) {
        Object.assign(material, {
          uConfirmingProgress: uniforms.uConfirmingProgress,
        })
      }
      shaderRef.current = material as GemShellRef | null
    },
    [shaderRef, uniforms.uConfirmingProgress],
  )

  return (
    <group
      {...props}
      renderOrder={2}
      position={[0, 0, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      visible={isVisible}>
      <Particles
        id={id}
        tileWidth={tileWidth}
        tileHeight={tileHeight}
        wasConfirmed={isCollected}
        isVisible={isVisible}
        position={[0, 0, 0]}
        gemPosition={GEM_POSITION}
        gemScale={GEM_RADIUS}
      />

      <mesh geometry={GEM_SURFACE_GEOMETRY} dispose={null} position={GEM_POSITION}>
        <meshBasicNodeMaterial
          ref={attachUniforms}
          colorNode={colorNode}
          opacityNode={opacityNode}
          transparent
          alphaTest={ALPHA_TEST}
          depthWrite={false}
          depthTest
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export default Gem
