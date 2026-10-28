'use client'

import { useFrame, useTexture } from '@react-three/fiber'
import { type FC, type RefObject, useCallback, useMemo, useRef } from 'react'
import {
  billboarding,
  color,
  mix,
  normalLocal,
  smoothstep,
  step,
  texture,
  uv,
  vertexStage,
} from 'three/tsl'
import type { Mesh, MeshLambertNodeMaterial, Node } from 'three/webgpu'

import place1 from '@/assets/podium/place-1.webp'
import place2 from '@/assets/podium/place-2.webp'
import place3 from '@/assets/podium/place-3.webp'
import { clampPaletteIndexSafe } from '@/components/palette'
import { GalaxyMarble } from '@/components/player/marble/GalaxyMarble'
import { GALAXY_DEFAULTS } from '@/components/player/marble/galaxySettings'
import type { PodiumPlace, PodiumWinner, PodiumWinners } from '@/components/podium/model'
import { useTextTexture } from '@/components/podium/useTextTexture'

const PILLAR_HEIGHT_DIFF = 0.75
const PILLAR_1_HEIGHT = 8
const PILLAR_2_HEIGHT = PILLAR_1_HEIGHT - PILLAR_HEIGHT_DIFF
const PILLAR_3_HEIGHT = PILLAR_1_HEIGHT - PILLAR_HEIGHT_DIFF * 2
const PILLAR_X_GAP = 0.5
const PILLAR_RADIUS = 1.2
const PILLAR_SPACING = PILLAR_RADIUS * 2 + PILLAR_X_GAP
const PILLAR_BASELINE_Y = PILLAR_HEIGHT_DIFF - PILLAR_1_HEIGHT
const PILLAR_TOP_HEIGHT = 0.12
const PILLAR_SEGMENTS = 64

const PODIUM_Y_OFFSET = -0.5

const MARBLE_RADIUS = 0.55
const MARBLE_SEGMENTS = 48
const MARBLE_SAMPLES = 6 as const
const MARBLE_STAR_COUNT = 24 as const
const MARBLE_HOVER_HEIGHT = 1.35
const MARBLE_HOVER_AMPLITUDE = 0.08
const MARBLE_HOVER_SPEED = 0.9
const MARBLE_SPIN_SPEED = 0.35
const MARBLE_PHASE_STEP = 1.7

const USERNAME_HEIGHT = 0.36
const USERNAME_Y = -0.65
const USERNAME_Z = PILLAR_RADIUS + 0.06
const USERNAME_COLOUR = '#f4ecff'

const MIDNIGHT_TOP = color('#2f244c') as unknown as Node<'vec3'>
const MIDNIGHT_BOTTOM = color('#201934') as unknown as Node<'vec3'>
const GOLD = color('#f1c73e') as unknown as Node<'vec3'>
const SILVER = color('#c4a7ff') as unknown as Node<'vec3'>
const BRONZE = color('#544018') as unknown as Node<'vec3'>
const BRONZE_EMISSIVE = color('#a87f2e') as unknown as Node<'vec3'>

const PLACE_TEXTURES: Record<PodiumPlace, string> = {
  1: place1.src,
  2: place2.src,
  3: place3.src,
}

const PILLAR_HEIGHTS: Record<PodiumPlace, number> = {
  1: PILLAR_1_HEIGHT,
  2: PILLAR_2_HEIGHT,
  3: PILLAR_3_HEIGHT,
}

const PILLAR_X: Record<PodiumPlace, number> = {
  1: 0,
  2: -PILLAR_SPACING,
  3: PILLAR_SPACING,
}

type PodiumPillarProps = {
  place: PodiumPlace
  ringColour: Node<'vec3'>
  ringEmissiveColour: Node<'vec3'>
  winner: PodiumWinner | null
  animationTime: RefObject<number>
}

const PodiumPillar: FC<PodiumPillarProps> = ({
  place,
  ringColour,
  ringEmissiveColour,
  winner,
  animationTime,
}) => {
  const height = PILLAR_HEIGHTS[place]
  const placeTexture = useTexture(PLACE_TEXTURES[place])

  const cylinderColourNode = useMemo(
    () => mix(MIDNIGHT_BOTTOM, MIDNIGHT_TOP, smoothstep(0.3, 1.0, uv().y)),
    [],
  )

  const { ringColourNode, ringEmissiveNode } = useMemo(() => {
    const isTopFace = vertexStage(step(0.6, normalLocal.y))
    const placeSample = texture(placeTexture).r

    return {
      ringColourNode: ringColour.mul(isTopFace.mul(0.5).add(0.2)).mul(placeSample),
      ringEmissiveNode: ringEmissiveColour.mul(isTopFace.mul(0.6).add(0.2)).mul(placeSample),
    }
  }, [placeTexture, ringColour, ringEmissiveColour])

  // `emissiveNode` is read by NodeMaterial at render time but is not declared on the Lambert
  // material's public type, so attach it the same way the gameplay marble publishes its glow.
  const attachRingMaterial = useCallback(
    (material: MeshLambertNodeMaterial | null) => {
      if (!material) return
      Object.assign(material, { emissiveNode: ringEmissiveNode })
      material.needsUpdate = true
    },
    [ringEmissiveNode],
  )

  return (
    <group position={[PILLAR_X[place], PILLAR_BASELINE_Y + height, 0]}>
      <mesh position={[0, -height / 2, 0]}>
        <cylinderGeometry args={[PILLAR_RADIUS, PILLAR_RADIUS, height, PILLAR_SEGMENTS]} />
        <meshBasicNodeMaterial
          key={cylinderColourNode.uuid}
          colorNode={cylinderColourNode}
          lights={false}
        />
      </mesh>

      <mesh position={[0, PILLAR_TOP_HEIGHT / 2, 0]}>
        <cylinderGeometry
          args={[PILLAR_RADIUS + 0.05, PILLAR_RADIUS, PILLAR_TOP_HEIGHT, PILLAR_SEGMENTS]}
        />
        <meshLambertNodeMaterial
          ref={attachRingMaterial}
          colorNode={ringColourNode}
          lights={false}
        />
      </mesh>

      {winner !== null && (
        <PodiumWinnerDisplay place={place} winner={winner} animationTime={animationTime} />
      )}
    </group>
  )
}

type PodiumWinnerDisplayProps = {
  place: PodiumPlace
  winner: PodiumWinner
  animationTime: RefObject<number>
}

const PodiumWinnerDisplay: FC<PodiumWinnerDisplayProps> = ({
  place,
  winner,
  animationTime,
}) => {
  const marble = useRef<Mesh>(null)
  const paletteIndex = clampPaletteIndexSafe(winner.paletteIndex)
  const settings = useMemo(() => ({ ...GALAXY_DEFAULTS, paletteIndex }), [paletteIndex])
  const textTexture = useTextTexture(winner.username, USERNAME_COLOUR)
  const textNode = useMemo(
    () => (textTexture ? texture(textTexture.texture) : null),
    [textTexture],
  )
  const billboardNode = useMemo(() => billboarding({ horizontal: true }), [])

  useFrame(() => {
    const marbleMesh = marble.current
    if (!marbleMesh) return

    const phaseTime = animationTime.current + place * MARBLE_PHASE_STEP
    marbleMesh.position.y =
      MARBLE_HOVER_HEIGHT + Math.sin(phaseTime * MARBLE_HOVER_SPEED) * MARBLE_HOVER_AMPLITUDE
    marbleMesh.rotation.y = phaseTime * MARBLE_SPIN_SPEED
  })

  return (
    <group>
      <GalaxyMarble
        ref={marble}
        animationTime={animationTime}
        radius={MARBLE_RADIUS}
        segments={MARBLE_SEGMENTS}
        settings={settings}
        samples={MARBLE_SAMPLES}
        starCount={MARBLE_STAR_COUNT}
      />

      {textTexture !== null && textNode !== null && (
        <mesh position={[0, USERNAME_Y, USERNAME_Z]} renderOrder={2} frustumCulled={false}>
          <planeGeometry args={[USERNAME_HEIGHT * textTexture.aspect, USERNAME_HEIGHT]} />
          <meshBasicNodeMaterial
            colorNode={textNode}
            vertexNode={billboardNode}
            transparent={true}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

type PodiumProps = {
  winners: PodiumWinners
}

/** The three stepped pillars, with each winner's marble colour and username above their place. */
export const Podium: FC<PodiumProps> = ({ winners }) => {
  const animationTime = useRef(0)
  useFrame((_, deltaSeconds) => {
    animationTime.current += deltaSeconds
  })

  return (
    <group position={[0, PODIUM_Y_OFFSET, 0]}>
      <PodiumPillar
        place={2}
        ringColour={SILVER}
        ringEmissiveColour={SILVER}
        winner={winners[1] ?? null}
        animationTime={animationTime}
      />
      <PodiumPillar
        place={1}
        ringColour={GOLD}
        ringEmissiveColour={GOLD}
        winner={winners[0] ?? null}
        animationTime={animationTime}
      />
      <PodiumPillar
        place={3}
        ringColour={BRONZE}
        ringEmissiveColour={BRONZE_EMISSIVE}
        winner={winners[2] ?? null}
        animationTime={animationTime}
      />
    </group>
  )
}
