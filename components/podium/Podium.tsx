'use client'

import { useFrame, useTexture } from '@react-three/fiber'
import { type FC, type RefObject, useCallback, useMemo, useRef } from 'react'
import {
  billboarding,
  color,
  float,
  normalLocal,
  step,
  texture,
  uv,
  vec2,
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
import {
  STONE_SHININESS,
  STONE_SPECULAR,
  stoneAtlasUv,
  stoneSurface,
  useStoneTextures,
} from '@/components/platform/scenery/stoneSurface'

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

/** Stone panels around the shaft and stacked down it, sized in world units like the scenery. */
const PILLAR_PANELS_AROUND = 4
const PILLAR_PANEL_HEIGHT = 3
const PILLAR_PANEL_OFFSET = 0.5
const PILLAR_CIRCUMFERENCE = 2 * Math.PI * PILLAR_RADIUS
const PILLAR_STONE_FRAME = 4

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

const USERNAME_HEIGHT = 0.55
const USERNAME_Y = -0.72
const USERNAME_Z = PILLAR_RADIUS + 0.06
const USERNAME_COLOUR = '#f4ecff'
const TIME_COLOUR = '#34d399'
const TIME_HEIGHT = 0.42
const TIME_Y = USERNAME_Y - 0.62

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

/**
 * `emissiveNode` is read by NodeMaterial at render time but is not declared on the Lambert
 * material's public type, so attach it the same way the gameplay marble publishes its glow.
 */
const useEmissiveRingAttachment = (emissiveNode: Node<'vec3'>) =>
  useCallback(
    (material: MeshLambertNodeMaterial | null) => {
      if (!material) return
      Object.assign(material, { emissiveNode })
      material.needsUpdate = true
    },
    [emissiveNode],
  )

type PodiumLabelProps = {
  billboard: boolean
  colour: string
  height: number
  text: string
  y: number
}

/** One line of winner text, pinned to the pillar face unless billboarding is enabled. */
const PodiumLabel: FC<PodiumLabelProps> = ({ billboard, colour, height, text, y }) => {
  const textTexture = useTextTexture(text, colour)
  const textNode = useMemo(
    () => (textTexture ? texture(textTexture.texture) : null),
    [textTexture],
  )
  const vertexNode = useMemo(
    () => (billboard ? billboarding({ horizontal: true }) : null),
    [billboard],
  )

  if (textTexture === null || textNode === null) return null

  return (
    <mesh position={[0, y, USERNAME_Z]} renderOrder={2} frustumCulled={false}>
      <planeGeometry args={[height * textTexture.aspect, height]} />
      <meshBasicNodeMaterial
        colorNode={textNode}
        vertexNode={vertexNode}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

type PodiumPillarProps = {
  billboardLabels: boolean
  pillarExtension: number
  place: PodiumPlace
  ringColour: Node<'vec3'>
  ringEmissiveColour: Node<'vec3'>
  winner: PodiumWinner | null
  animationTime: RefObject<number>
}

const PodiumPillar: FC<PodiumPillarProps> = ({
  billboardLabels,
  pillarExtension,
  place,
  ringColour,
  ringEmissiveColour,
  winner,
  animationTime,
}) => {
  const height = PILLAR_HEIGHTS[place]
  const shaftHeight = height + pillarExtension
  const placeTexture = useTexture(PLACE_TEXTURES[place])
  const { atlas: stoneAtlas, normals: stoneNormals } = useStoneTextures()

  const shaftSurface = useMemo(() => {
    const panelsAround = uv().x.mul(PILLAR_PANELS_AROUND).add(PILLAR_PANEL_OFFSET).fract()
    const panelsDown = float(1)
      .sub(uv().y)
      .mul(shaftHeight)
      .div(PILLAR_PANEL_HEIGHT)
      .fract()

    return stoneSurface(
      { atlas: stoneAtlas, normals: stoneNormals },
      stoneAtlasUv(uv(), float(PILLAR_STONE_FRAME)),
      vec2(panelsAround, panelsDown),
      vec2(PILLAR_CIRCUMFERENCE / PILLAR_PANELS_AROUND, PILLAR_PANEL_HEIGHT),
    )
  }, [stoneAtlas, stoneNormals, shaftHeight])

  const { ringColourNode, ringEmissiveNode } = useMemo(() => {
    const isTopFace = vertexStage(step(0.6, normalLocal.y))
    const placeSample = texture(placeTexture).r

    return {
      ringColourNode: ringColour.mul(isTopFace.mul(0.5).add(0.2)).mul(placeSample),
      ringEmissiveNode: ringEmissiveColour.mul(isTopFace.mul(0.6).add(0.2)).mul(placeSample),
    }
  }, [placeTexture, ringColour, ringEmissiveColour])

  const attachRingMaterial = useEmissiveRingAttachment(ringEmissiveNode)

  return (
    <group position={[PILLAR_X[place], PILLAR_BASELINE_Y + height, 0]}>
      <mesh position={[0, -shaftHeight / 2, 0]}>
        <cylinderGeometry args={[PILLAR_RADIUS, PILLAR_RADIUS, shaftHeight, PILLAR_SEGMENTS]} />
        <meshPhongNodeMaterial
          colorNode={shaftSurface.colorNode}
          normalNode={shaftSurface.normalNode}
          shininess={STONE_SHININESS}
          specular={STONE_SPECULAR}
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
        <PodiumWinnerDisplay
          billboardLabels={billboardLabels}
          place={place}
          winner={winner}
          animationTime={animationTime}
        />
      )}
    </group>
  )
}

type PodiumWinnerDisplayProps = {
  billboardLabels: boolean
  place: PodiumPlace
  winner: PodiumWinner
  animationTime: RefObject<number>
}

const PodiumWinnerDisplay: FC<PodiumWinnerDisplayProps> = ({
  billboardLabels,
  place,
  winner,
  animationTime,
}) => {
  const marble = useRef<Mesh>(null)
  const paletteIndex = clampPaletteIndexSafe(winner.paletteIndex)
  const settings = useMemo(() => ({ ...GALAXY_DEFAULTS, paletteIndex }), [paletteIndex])

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

      <PodiumLabel
        billboard={billboardLabels}
        colour={USERNAME_COLOUR}
        height={USERNAME_HEIGHT}
        text={winner.username}
        y={USERNAME_Y}
      />
      <PodiumLabel
        billboard={billboardLabels}
        colour={TIME_COLOUR}
        height={TIME_HEIGHT}
        text={`${winner.timeSeconds.toFixed(2)}s`}
        y={TIME_Y}
      />
    </group>
  )
}

type PodiumProps = {
  /** Extend the shafts beneath the lobby fog without moving the tops or labels. */
  pillarExtension?: number
  /** Turn the labels to face the camera; leave off so they stay pinned to the podium front. */
  billboardLabels?: boolean
  winners: PodiumWinners
}

/** The three stepped pillars, with each winner's marble colour and username above their place. */
export const Podium: FC<PodiumProps> = ({ winners, pillarExtension = 0, billboardLabels = true }) => {
  const animationTime = useRef(0)
  useFrame((_, deltaSeconds) => {
    animationTime.current += deltaSeconds
  })

  return (
    <group position={[0, PODIUM_Y_OFFSET, 0]}>
      <PodiumPillar
        billboardLabels={billboardLabels}
        pillarExtension={pillarExtension}
        place={2}
        ringColour={SILVER}
        ringEmissiveColour={SILVER}
        winner={winners[1] ?? null}
        animationTime={animationTime}
      />
      <PodiumPillar
        billboardLabels={billboardLabels}
        pillarExtension={pillarExtension}
        place={1}
        ringColour={GOLD}
        ringEmissiveColour={GOLD}
        winner={winners[0] ?? null}
        animationTime={animationTime}
      />
      <PodiumPillar
        billboardLabels={billboardLabels}
        pillarExtension={pillarExtension}
        place={3}
        ringColour={BRONZE}
        ringEmissiveColour={BRONZE_EMISSIVE}
        winner={winners[2] ?? null}
        animationTime={animationTime}
      />
    </group>
  )
}
