import { useCoursePlacement } from '@/hooks/useCoursePlacement'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import { BallCollider, type IntersectionEnterHandler, RigidBody } from '@react-three/rapier'
import gsap from 'gsap'
import { type FC, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointLight, Vector3Tuple } from 'three'

import { type RingIndex, useGameStore } from '@/components/GameProvider'
import { SoundFX, useSoundStore } from '@/components/SoundProvider'
import {
  createRingLightPlacements,
  extinguishRingLights,
  poseRingLights,
  setRingLightLit,
} from '@/components/lighting/ringLights'
import Ring, { type RingMaterial } from '@/components/platform/rings/ring/Ring'
import { RING_MAJOR_RADIUS, RING_TUBE_RADIUS } from '@/components/platform/rings/ringConfig'
import type { RigidBodyUserData, RingUserData } from '@/model/schema'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { getRingKey } from '@/utils/rings'
import { COLUMNS, type RowData } from '@/utils/tiles'

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
  const surface = useCourseSurface()
  // One placement per ring, in row/column order. It owns both the fixed world pose the ring mesh
  // uses and the shared light slot co-located with it.
  const ringPlacements = useMemo(
    () => createRingLightPlacements(rows, surface),
    [rows, surface],
  )

  useLayoutEffect(() => {
    poseRingLights(ringPlacements)
    return extinguishRingLights
  }, [ringPlacements])

  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  return ringPlacements.map(({ key, indexes, light, coursePosition }) => (
    <PlacedRing key={key} indexes={indexes} light={light} coursePosition={coursePosition} />
  ))
}

type PlacedRingProps = {
  indexes: RingIndex
  coursePosition: Vector3Tuple
  light: PointLight | null
}

const PlacedRing: FC<PlacedRingProps> = ({ indexes, coursePosition, light }) => {
  const placement = useCoursePlacement(coursePosition)
  const ringKey = getRingKey(indexes[0], indexes[1])
  const isCollected = useGameStore((s) => Boolean(s.collectedRings[ringKey]))
  const attemptId = useGameStore((s) => s.attemptId)
  const onRingCollected = useGameStore((s) => s.onRingCollected)
  const playSoundFX = useSoundStore((s) => s.playSoundFX)
  const shaderRef = useRef<RingMaterial>(null)
  const exitTween = useRef<gsap.core.Tween | null>(null)
  const collecting = useRef(false)
  const [exitAttemptId, setExitAttemptId] = useState<number | null>(null)
  // Derived rather than reset in an effect: a new attempt automatically ends the old exit state.
  const isExiting = exitAttemptId === attemptId
  const seed = hashRingIndex(indexes[0] * COLUMNS + indexes[1])
  const userData: RingUserData = { type: 'ring', rowIndex: indexes[0], columnIndex: indexes[1] }

  // The pool starts dark and `Rings` extinguishes it on unmount. Turning the light off only when
  // this ring is collected keeps a retry (which clears `isCollected`) on the same light.
  useLayoutEffect(() => {
    setRingLightLit(light, !isCollected)
    return () => {
      setRingLightLit(light, false)
    }
  }, [isCollected, light])

  useEffect(() => () => {
    exitTween.current?.kill()
  }, [])

  // A retry keeps the terrain and ring meshes mounted. Reset their local animation state so every
  // ring is visible and collectable again, and stale exit callbacks cannot credit another attempt.
  useLayoutEffect(() => {
    exitTween.current?.kill()
    exitTween.current = null
    collecting.current = false
    if (shaderRef.current) shaderRef.current.uExitProgress.value = 0
  }, [attemptId])

  const onIntersectionEnter: IntersectionEnterHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData | undefined
    if (otherUserData?.type !== 'player' || isCollected || collecting.current) return
    const material = shaderRef.current
    if (!material) return
    collecting.current = true
    playSoundFX(SoundFX.RING_COLLECTED)
    // Credit the attempt at contact. The exit animation is purely cosmetic and must not be able
    // to race with a finish or reset before the ring is counted.
    onRingCollected(indexes)
    setExitAttemptId(attemptId)
    exitTween.current = gsap.to(material.uExitProgress, {
      value: 1,
      duration: 0.4,
      ease: 'power1.out',
      onComplete: () => setExitAttemptId(null),
    })
  }

  return (
    <RigidBody
      type="fixed"
      {...placement}
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
        isVisible={!isCollected || isExiting}
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
