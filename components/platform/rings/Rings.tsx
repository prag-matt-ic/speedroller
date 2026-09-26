import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import { BallCollider, type IntersectionEnterHandler, RigidBody } from '@react-three/rapier'
import gsap from 'gsap'
import { type FC, useEffect, useRef } from 'react'
import type { Vector3Tuple } from 'three'

import { type RingIndex, useGameStore } from '@/components/GameProvider'
import { SoundFX, useSoundStore } from '@/components/SoundProvider'
import Ring, { type RingMaterial } from '@/components/platform/rings/ring/Ring'
import type { RigidBodyUserData, RingUserData } from '@/model/schema'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { getRingKey } from '@/utils/rings'
import { COLUMNS, ON_TILE_Y, type RowData, colToX, rowToWorldZ } from '@/utils/tiles'

const RING_MAJOR_RADIUS = 0.32
const RING_TUBE_RADIUS = 0.06
const RING_WORLD_Y = ON_TILE_Y + RING_MAJOR_RADIUS * 2
const TAU = Math.PI * 2

const hashRingIndex = (index: number): number => {
  const raw = Math.sin((index + 1) * 12.98) * 4375.54
  return raw - Math.floor(raw)
}

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

const Rings: FC<Props> = ({ rows, onReadyChange }) => {
  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return rows.flatMap((row, rowIndex) =>
    (row.rings ?? []).map((hasRing, columnIndex) => {
      if (!hasRing) return null
      const indexes: RingIndex = [row.rowIndex ?? rowIndex, columnIndex]
      return (
        <PlacedRing
          key={getRingKey(indexes[0], indexes[1])}
          indexes={indexes}
          position={[colToX(columnIndex), RING_WORLD_Y, rowToWorldZ(rowIndex)]}
        />
      )
    }),
  )
}

type PlacedRingProps = {
  indexes: RingIndex
  position: Vector3Tuple
}

const PlacedRing: FC<PlacedRingProps> = ({ indexes, position }) => {
  const ringKey = getRingKey(indexes[0], indexes[1])
  const isCollected = useGameStore((s) => Boolean(s.collectedRings[ringKey]))
  const onRingCollected = useGameStore((s) => s.onRingCollected)
  const playSoundFX = useSoundStore((s) => s.playSoundFX)
  const shaderRef = useRef<RingMaterial>(null)
  const exitTween = useRef<gsap.core.Tween | null>(null)
  const collecting = useRef(false)
  const seed = hashRingIndex(indexes[0] * COLUMNS + indexes[1])
  const userData: RingUserData = { type: 'ring', rowIndex: indexes[0], columnIndex: indexes[1] }

  useEffect(() => () => {
    exitTween.current?.kill()
  }, [])

  const onIntersectionEnter: IntersectionEnterHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData | undefined
    if (otherUserData?.type !== 'player' || isCollected || collecting.current) return
    const material = shaderRef.current
    if (!material) return
    collecting.current = true
    playSoundFX(SoundFX.RING_COLLECTED)
    exitTween.current = gsap.to(material.uExitProgress, {
      value: 1,
      duration: 0.4,
      ease: 'power1.out',
      onComplete: () => onRingCollected(indexes),
    })
  }

  return (
    <RigidBody
      type="fixed"
      position={position}
      userData={userData}
      colliders={false}>
      {!isCollected && <BallCollider
        args={[RING_MAJOR_RADIUS + RING_TUBE_RADIUS * 0.5]}
        sensor={true}
        activeCollisionTypes={ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED}
        onIntersectionEnter={onIntersectionEnter}
        collisionGroups={COLLISION_GROUPS.ringSensor}
      />}
      <Ring
        isVisible={!isCollected}
        shaderRef={shaderRef}
        uniformScope={`ring${indexes[0]}_${indexes[1]}`}
        rotationSpeed={0.6 + seed * 0.7}
        rotationPhase={seed * TAU}
        radius={RING_MAJOR_RADIUS}
        tubeRadius={RING_TUBE_RADIUS}
      />
    </RigidBody>
  )
}

export default Rings
