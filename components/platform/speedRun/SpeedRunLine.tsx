import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import {
  CuboidCollider,
  type IntersectionEnterHandler,
  type IntersectionExitHandler,
  RigidBody,
} from '@react-three/rapier'
import { type FC, useCallback, useEffect, useId, useMemo, useRef } from 'react'
import { float, floor, fract, mix, step, uv, vec2, vec3, vertexStage } from 'three/tsl'
import type { Vector3Tuple } from 'three'
import type { Node, UniformNode } from 'three/webgpu'

import { useGameStore } from '@/components/GameProvider'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import { PLAYER_RADIUS } from '@/components/player/PlayerHUD'
import type { RigidBodyUserData, SpeedRunLineUserData } from '@/model/schema'
import { fadeInOut } from '@/resources/tsl/fadeInOut'
import { GameMode, Overlay, SpeedRunStage } from '@/stores/types'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { TILE_SIZE } from '@/utils/tiles'

// Tuning constants carried over from finishLine.vert, finishLine.frag and startLine.frag.
const TILE_EPS = 1e-4
const CHECKER_PHASE_EDGE = 0.25
const FINISH_RED_LINE_RATIO = 0.05
const FINISH_RED_LINE_COLOR: [number, number, number] = [0.75, 0.0, 0.0]
const START_STRIPE_RATIO = 0.08
const START_CHECKER_DARK_COLOR: [number, number, number] = [0.05, 0.14, 0.18]
const START_CHECKER_LIGHT_COLOR: [number, number, number] = [0.09, 0.26, 0.32]
const START_STRIPE_COLOR: [number, number, number] = [0.18, 0.86, 0.62]

const SPEED_RUN_LINE_UNIFORM_SCOPE = 'speedRunLine'

type SpeedRunLineUniforms = {
  uTilesX: UniformNode<'float', number>
  uTilesY: UniformNode<'float', number>
  uDistanceFadeEnabled: UniformNode<'float', number>
}

// `uAspect` was declared in the GLSL but never read, and `uOpacity` was never set from JS so it
// stayed at its initial 1. Neither is ported.
const createSpeedRunLineUniforms =
  (width: number, height: number, distanceFadeEnabled: boolean) => () => ({
    uTilesX: width / TILE_SIZE,
    uTilesY: height / TILE_SIZE,
    uDistanceFadeEnabled: distanceFadeEnabled ? 1 : 0,
  })

// The values finishLine.vert handed to the fragment stage as varyings. Varyings do not exist in TSL,
// so both variants re-derive them from these nodes.
type LineSurfaceNodes = {
  lineUv: Node<'vec2'>
  checkerPhase: Node<'float'>
  distanceFade: Node<'float'>
}

type LineNodes = {
  colorNode: Node<'vec3'>
  opacityNode: Node<'float'>
}

// Port of finishLine.vert — the vertex stage both materials share.
const createLineSurfaceNodes = ({
  uTilesX,
  uTilesY,
  uDistanceFadeEnabled,
  uPlayerWorldPos,
}: SpeedRunLineUniforms & Pick<CoreUniforms, 'uPlayerWorldPos'>): LineSurfaceNodes => {
  const lineUv = uv()
  const tileCoord: Node<'vec2'> = lineUv.mul(vec2(uTilesX, uTilesY))
  // TILE_EPS keeps floor() clear of exact tile boundaries, as in the GLSL.
  const tileFloor: Node<'vec2'> = floor(tileCoord.add(TILE_EPS))
  const checkerPhase: Node<'float'> = fract(tileFloor.x.add(tileFloor.y).mul(0.5))

  // The GLSL handed the fade across as a varying; hoist it to the vertex stage so the fragment
  // stage reads the interpolated result instead of re-deriving it. It reads the line's own z, so
  // the whole line ramps as one. The fade toggle is a uniform, so the mix collapses to a constant
  // just like the fade it scales and belongs in the same stage.
  const distanceFade: Node<'float'> = vertexStage(
    mix(float(1), fadeInOut(uPlayerWorldPos.z), uDistanceFadeEnabled),
  )

  return { lineUv, checkerPhase, distanceFade }
}

// Port of finishLine.frag.
const createFinishLineNodes = ({
  lineUv,
  checkerPhase,
  distanceFade,
}: LineSurfaceNodes): LineNodes => {
  const blackMask: Node<'float'> = float(1).sub(step(CHECKER_PHASE_EDGE, checkerPhase))
  const redLineMask: Node<'float'> = float(1).sub(step(FINISH_RED_LINE_RATIO, lineUv.y))
  // uOpacity was always 1, so `uOpacity * blackMask` and `mix(alpha, uOpacity, redLineMask)`
  // collapse to these two masks.
  const opacityNode: Node<'float'> = mix(blackMask, float(1), redLineMask).mul(distanceFade)

  return {
    colorNode: mix(vec3(0), vec3(...FINISH_RED_LINE_COLOR), redLineMask),
    opacityNode,
  }
}

// Port of startLine.frag.
const createStartLineNodes = ({
  lineUv,
  checkerPhase,
  distanceFade,
}: LineSurfaceNodes): LineNodes => {
  const lightMask: Node<'float'> = step(CHECKER_PHASE_EDGE, checkerPhase)
  const stripeMask: Node<'float'> = float(1).sub(step(START_STRIPE_RATIO, lineUv.y))
  const baseColor: Node<'vec3'> = mix(
    vec3(...START_CHECKER_DARK_COLOR),
    vec3(...START_CHECKER_LIGHT_COLOR),
    lightMask,
  )

  return {
    colorNode: mix(baseColor, vec3(...START_STRIPE_COLOR), stripeMask),
    // uOpacity was always 1, so alpha here is the distance fade alone.
    opacityNode: distanceFade,
  }
}

// The two GLSL programs shared one vertex shader but differed in the fragment stage, so they stay
// two materials: the chosen component swaps the material instance, as the two extended shader
// materials did.
const FinishLineMaterial: FC<LineNodes> = ({ colorNode, opacityNode }) => (
  <meshBasicNodeMaterial colorNode={colorNode} opacityNode={opacityNode} transparent />
)

const StartLineMaterial: FC<LineNodes> = ({ colorNode, opacityNode }) => (
  <meshBasicNodeMaterial colorNode={colorNode} opacityNode={opacityNode} transparent />
)

type Props = {
  position: Vector3Tuple
  width: number
  height: number
}

const SpeedRunLine: FC<Props> = ({ position, width, height }) => {
  const mode = useGameStore((s) => s.mode)
  const speedRunStage = useGameStore((s) => s.speedRunStage)
  const finishSpeedRun = useGameStore((s) => s.finishSpeedRun)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)

  const userData: SpeedRunLineUserData = useMemo(
    () => ({
      type: 'speed-run-line',
    }),
    [],
  )

  const uniformScope = `${SPEED_RUN_LINE_UNIFORM_SCOPE}${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const { uTilesX, uTilesY, uDistanceFadeEnabled } = useUniforms(
    createSpeedRunLineUniforms(width, height, useDistanceFade),
    uniformScope,
  )

  // Port of finishLine.vert + finishLine.frag + startLine.frag. The two fragment variants are built
  // together off the one shared vertex stage, and the material picks the pair it needs.
  const createNodes = useCallback(
    ({ uniforms }: CreatorState) => {
      const { uPlayerWorldPos } = uniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)
      const surfaceNodes = createLineSurfaceNodes({
        uTilesX,
        uTilesY,
        uDistanceFadeEnabled,
        uPlayerWorldPos,
      })

      return {
        finishLineNodes: createFinishLineNodes(surfaceNodes),
        startLineNodes: createStartLineNodes(surfaceNodes),
      }
    },
    [uTilesX, uTilesY, uDistanceFadeEnabled],
  )

  const { finishLineNodes, startLineNodes } = useLocalNodes(createNodes)

  const hasTriggeredStart = useRef(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timeout.current) clearTimeout(timeout.current)
  }, [])
  const isSpeedRunMode = mode === GameMode.SPEEDRUN
  const isStartLine = !isSpeedRunMode

  const onIntersectionEnter: IntersectionEnterHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData || otherUserData.type !== 'player') return

    if (isSpeedRunMode) {
      if (speedRunStage !== SpeedRunStage.RUNNING) return
      finishSpeedRun()
    } else {
      if (timeout.current) clearTimeout(timeout.current)
      timeout.current = null
      if (hasTriggeredStart.current) return
      timeout.current = setTimeout(() => {
        timeout.current = null
        hasTriggeredStart.current = true
        setOverlay(Overlay.SPEEDRUN_START)
      }, 500)
    }
  }

  const onIntersectionExit: IntersectionExitHandler = (event) => {
    if (!isStartLine) return
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData || otherUserData.type !== 'player') return

    if (!!timeout.current) clearTimeout(timeout.current)

    timeout.current = setTimeout(() => {
      hasTriggeredStart.current = false
      timeout.current = null
    }, 1000)
  }

  const LineMaterial = useMemo(
    () => (isStartLine ? StartLineMaterial : FinishLineMaterial),
    [isStartLine],
  )
  const lineNodes = isStartLine ? startLineNodes : finishLineNodes

  return (
    <RigidBody
      type="fixed"
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      colliders={false}
      userData={userData}>
      <CuboidCollider
        args={[width / 2, height / 2, PLAYER_RADIUS * 2]}
        sensor={true}
        activeCollisionTypes={ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED}
        mass={0}
        friction={0}
        onIntersectionEnter={onIntersectionEnter}
        onIntersectionExit={onIntersectionExit}
        collisionGroups={COLLISION_GROUPS.finishLineSensor}
      />
      <mesh position={[0, 0, 0.01]} renderOrder={2}>
        <planeGeometry args={[width, height]} />
        <LineMaterial colorNode={lineNodes.colorNode} opacityNode={lineNodes.opacityNode} />
      </mesh>
    </RigidBody>
  )
}

export default SpeedRunLine
